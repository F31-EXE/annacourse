from decimal import ROUND_HALF_UP, Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Course(models.Model):
    title = models.CharField('Название', max_length=200)
    slug = models.SlugField('Адрес (slug)', unique=True)
    subtitle = models.CharField('Подзаголовок', max_length=300, blank=True)
    description = models.TextField('Описание', blank=True)
    is_published = models.BooleanField('Опубликован', default=True)
    created_at = models.DateTimeField('Создан', auto_now_add=True)
    updated_at = models.DateTimeField('Изменён', auto_now=True)

    class Meta:
        verbose_name = 'Курс'
        verbose_name_plural = 'Курсы'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class Module(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='modules', verbose_name='Курс')
    order = models.PositiveSmallIntegerField('Порядок', default=0)
    title = models.CharField('Тема', max_length=200)
    tools = models.CharField('Нейросети', max_length=200, blank=True,
                             help_text='Через « · », например: Nano Banana · Midjourney')
    description = models.TextField('Описание', blank=True)
    prompt = models.TextField('Пример промпта', blank=True)

    class Meta:
        verbose_name = 'Модуль'
        verbose_name_plural = 'Модули'
        ordering = ['course', 'order', 'id']

    def __str__(self):
        return f'{self.order:02d}. {self.title}'


class Tariff(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='tariffs', verbose_name='Курс')
    name = models.CharField('Название', max_length=100)
    price = models.DecimalField('Цена, ₽', max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    old_price = models.DecimalField('Старая цена, ₽', max_digits=10, decimal_places=2, null=True, blank=True,
                                    help_text='Показывается зачёркнутой. Необязательно.')
    features = models.TextField('Что входит', blank=True, help_text='Каждый пункт с новой строки')
    is_active = models.BooleanField('В продаже', default=True)
    is_featured = models.BooleanField('Выделить на сайте', default=False,
                                      help_text='У выделенного тарифа залитая кнопка')
    order = models.PositiveSmallIntegerField('Порядок', default=0)

    class Meta:
        verbose_name = 'Тариф'
        verbose_name_plural = 'Тарифы'
        ordering = ['course', 'order', 'price']

    def __str__(self):
        return f'{self.course} — {self.name}'

    @property
    def feature_list(self):
        return [line.strip() for line in self.features.splitlines() if line.strip()]


class PromoCode(models.Model):
    code = models.CharField('Код', max_length=40, unique=True, help_text='Регистр не важен')
    discount_percent = models.PositiveSmallIntegerField(
        'Скидка, %', validators=[MinValueValidator(1), MaxValueValidator(100)])
    is_active = models.BooleanField('Активен', default=True)
    valid_until = models.DateTimeField('Действует до', null=True, blank=True)
    max_uses = models.PositiveIntegerField('Лимит использований', null=True, blank=True,
                                           help_text='Пусто — без ограничений')
    used_count = models.PositiveIntegerField('Использован, раз', default=0, editable=False)

    class Meta:
        verbose_name = 'Промокод'
        verbose_name_plural = 'Промокоды'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} (−{self.discount_percent}%)'

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def is_valid(self):
        if not self.is_active:
            return False
        if self.valid_until and self.valid_until < timezone.now():
            return False
        if self.max_uses is not None and self.used_count >= self.max_uses:
            return False
        return True

    @classmethod
    def find_valid(cls, code):
        code = (code or '').strip().upper()
        if not code:
            return None
        promo = cls.objects.filter(code=code).first()
        return promo if promo and promo.is_valid() else None


def apply_discount(price, percent):
    """Возвращает (скидка, итог), округлено до копеек."""
    discount = (Decimal(price) * Decimal(percent) / Decimal(100)).quantize(Decimal('0.01'), ROUND_HALF_UP)
    return discount, Decimal(price) - discount


class Order(models.Model):
    class Status(models.TextChoices):
        NEW = 'new', 'Новый'
        AWAITING = 'awaiting', 'Ожидает оплаты'
        PAID = 'paid', 'Оплачен'
        CANCELLED = 'cancelled', 'Отменён'
        REFUNDED = 'refunded', 'Возврат'

    tariff = models.ForeignKey(Tariff, on_delete=models.PROTECT, related_name='orders', verbose_name='Тариф')
    name = models.CharField('Имя', max_length=120)
    email = models.EmailField('Email')
    phone = models.CharField('Телефон', max_length=40, blank=True)
    promo = models.ForeignKey(PromoCode, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='orders', verbose_name='Промокод')
    price = models.DecimalField('Цена тарифа, ₽', max_digits=10, decimal_places=2)
    discount = models.DecimalField('Скидка, ₽', max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField('К оплате, ₽', max_digits=10, decimal_places=2)
    status = models.CharField('Статус', max_length=12, choices=Status.choices, default=Status.AWAITING)
    comment = models.TextField('Комментарий менеджера', blank=True)
    created_at = models.DateTimeField('Создан', auto_now_add=True)
    paid_at = models.DateTimeField('Оплачен', null=True, blank=True)

    class Meta:
        verbose_name = 'Заказ'
        verbose_name_plural = 'Заказы'
        ordering = ['-created_at']

    def __str__(self):
        return f'Заказ №{self.pk} — {self.name}'

    @classmethod
    def create_for(cls, tariff, name, email, phone='', promo=None):
        """Создаёт заказ, фиксируя цену и скидку на момент покупки."""
        discount, total = apply_discount(tariff.price, promo.discount_percent) if promo else (Decimal('0'), tariff.price)
        order = cls.objects.create(tariff=tariff, name=name, email=email, phone=phone, promo=promo,
                                   price=tariff.price, discount=discount, total=total)
        if promo:
            PromoCode.objects.filter(pk=promo.pk).update(used_count=models.F('used_count') + 1)
        return order

    def mark_paid(self):
        self.status = self.Status.PAID
        self.paid_at = self.paid_at or timezone.now()
        self.save(update_fields=['status', 'paid_at'])


class Lead(models.Model):
    email = models.EmailField('Email', unique=True)
    source = models.CharField('Откуда', max_length=60, blank=True, help_text='Например: free-lesson')
    created_at = models.DateTimeField('Оставлен', auto_now_add=True)

    class Meta:
        verbose_name = 'Заявка на бесплатный урок'
        verbose_name_plural = 'Заявки на бесплатный урок'
        ordering = ['-created_at']

    def __str__(self):
        return self.email
