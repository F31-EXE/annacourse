from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import Course, Lead, Order, PromoCode, Tariff, apply_discount


class SeedTests(TestCase):
    def test_course_and_modules_seeded_from_presentation(self):
        course = Course.objects.get(slug='neural-networks-for-interior-designers')
        titles = list(course.modules.values_list('title', flat=True))
        self.assertEqual(len(titles), 6)
        self.assertEqual(titles[0], 'Генерация интерьерных концепций')
        self.assertEqual(titles[-1], 'Видео и рум-туры')


class LandingTests(TestCase):
    def setUp(self):
        self.course = Course.objects.get()

    def test_renders_modules_without_tariffs(self):
        res = self.client.get(reverse('landing'))
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, 'Бетонная коробка')
        self.assertNotContains(res, 'id="pricing"')
        self.assertContains(res, 'Написать Анне в Telegram')

    def test_shows_only_active_tariffs(self):
        Tariff.objects.create(course=self.course, name='Самостоятельный', price=Decimal('15000'))
        Tariff.objects.create(course=self.course, name='Скрытый', price=Decimal('1'), is_active=False)
        res = self.client.get(reverse('landing'))
        self.assertContains(res, 'id="pricing"')
        self.assertContains(res, 'Самостоятельный')
        self.assertNotContains(res, 'Скрытый')


class LeadTests(TestCase):
    def test_creates_lead_once(self):
        for _ in range(2):
            res = self.client.post(reverse('lead_create'), {'email': 'Test@Example.com', 'source': 'free-lesson'})
            self.assertEqual(res.json(), {'ok': True})
        self.assertEqual(Lead.objects.count(), 1)
        self.assertEqual(Lead.objects.get().email, 'test@example.com')

    def test_rejects_bad_email(self):
        res = self.client.post(reverse('lead_create'), {'email': 'nope'})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Lead.objects.exists())

    def test_requires_csrf(self):
        client = self.client_class(enforce_csrf_checks=True)
        res = client.post(reverse('lead_create'), {'email': 'a@b.ru'})
        self.assertEqual(res.status_code, 403)


class OrderTests(TestCase):
    def setUp(self):
        self.tariff = Tariff.objects.create(course=Course.objects.get(), name='С обратной связью',
                                            price=Decimal('24990'))

    def post(self, **extra):
        data = {'tariff': self.tariff.pk, 'name': 'Мария', 'email': 'maria@example.com', 'phone': '+7 900'}
        data.update(extra)
        return self.client.post(reverse('order_create'), data)

    def test_creates_order_with_price_snapshot(self):
        res = self.post()
        self.assertEqual(res.status_code, 200)
        order = Order.objects.get()
        self.assertEqual(order.total, Decimal('24990'))
        self.assertEqual(order.status, Order.Status.AWAITING)
        # цена тарифа меняется — заказ остаётся с прежней
        self.tariff.price = Decimal('30000')
        self.tariff.save()
        order.refresh_from_db()
        self.assertEqual(order.price, Decimal('24990'))

    def test_applies_promo_case_insensitive_and_counts_use(self):
        promo = PromoCode.objects.create(code='moloko_10', discount_percent=10)
        res = self.post(promo='Moloko_10')
        self.assertEqual(res.json()['total'], '22491.00')
        order = Order.objects.get()
        self.assertEqual(order.discount, Decimal('2499.00'))
        promo.refresh_from_db()
        self.assertEqual(promo.used_count, 1)

    def test_rejects_expired_or_exhausted_promo(self):
        PromoCode.objects.create(code='OLD', discount_percent=20, valid_until=timezone.now() - timedelta(days=1))
        PromoCode.objects.create(code='ONCE', discount_percent=20, max_uses=0)
        for code in ('OLD', 'ONCE', 'MISSING'):
            self.assertEqual(self.post(promo=code).status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_inactive_tariff_cannot_be_bought(self):
        self.tariff.is_active = False
        self.tariff.save()
        self.assertEqual(self.post().status_code, 404)

    def test_promo_check_endpoint(self):
        PromoCode.objects.create(code='HALF', discount_percent=50)
        res = self.client.get(reverse('promo_check'), {'tariff': self.tariff.pk, 'code': 'half'})
        self.assertEqual(res.json(), {'ok': True, 'percent': 50, 'discount': '12495.00', 'total': '12495.00'})

    def test_mark_paid_sets_time(self):
        self.post()
        order = Order.objects.get()
        order.mark_paid()
        self.assertEqual(order.status, Order.Status.PAID)
        self.assertIsNotNone(order.paid_at)


class DiscountTests(TestCase):
    def test_rounds_to_kopecks(self):
        self.assertEqual(apply_discount(Decimal('999.99'), 15), (Decimal('150.00'), Decimal('849.99')))


class AdminTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser('admin', 'admin@example.com', 'pass')
        self.client.force_login(self.admin)
        tariff = Tariff.objects.create(course=Course.objects.get(), name='Базовый', price=Decimal('100'))
        Order.create_for(tariff, 'Иван', 'ivan@example.com')
        Lead.objects.create(email='lead@example.com')

    def test_changelists_open(self):
        for model in ('course', 'tariff', 'promocode', 'order', 'lead'):
            res = self.client.get(reverse(f'admin:courses_{model}_changelist'))
            self.assertEqual(res.status_code, 200, model)

    def test_export_orders_csv(self):
        order = Order.objects.get()
        res = self.client.post(reverse('admin:courses_order_changelist'),
                               {'action': 'export_orders', '_selected_action': [order.pk]})
        self.assertEqual(res['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('ivan@example.com', res.content.decode('utf-8-sig'))

    def test_mark_paid_action(self):
        order = Order.objects.get()
        self.client.post(reverse('admin:courses_order_changelist'),
                         {'action': 'mark_paid', '_selected_action': [order.pk]})
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PAID)
