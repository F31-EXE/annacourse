from django import forms
from django.db import IntegrityError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_GET, require_POST

from .models import Course, Lead, Order, PromoCode, Tariff, apply_discount


def landing(request):
    course = Course.objects.filter(is_published=True).prefetch_related('modules').first()
    tariffs = course.tariffs.filter(is_active=True) if course else Tariff.objects.none()
    return render(request, 'landing/index.html', {
        'course': course,
        'modules': course.modules.all() if course else [],
        'tariffs': tariffs,
    })


class LeadForm(forms.Form):
    email = forms.EmailField()
    source = forms.CharField(max_length=60, required=False)


class OrderForm(forms.Form):
    tariff = forms.IntegerField()
    name = forms.CharField(max_length=120)
    email = forms.EmailField()
    phone = forms.CharField(max_length=40, required=False)
    promo = forms.CharField(max_length=40, required=False)


def _errors(form):
    return JsonResponse({'ok': False, 'errors': form.errors.get_json_data()}, status=400)


@require_POST
def lead_create(request):
    form = LeadForm(request.POST)
    if not form.is_valid():
        return _errors(form)
    email = form.cleaned_data['email'].lower()
    try:
        Lead.objects.get_or_create(email=email, defaults={'source': form.cleaned_data['source'] or 'site'})
    except IntegrityError:
        pass  # параллельная повторная отправка — заявка уже есть
    return JsonResponse({'ok': True})


@require_POST
def order_create(request):
    form = OrderForm(request.POST)
    if not form.is_valid():
        return _errors(form)
    data = form.cleaned_data
    tariff = get_object_or_404(Tariff, pk=data['tariff'], is_active=True, course__is_published=True)
    promo = None
    if data['promo']:
        promo = PromoCode.find_valid(data['promo'])
        if not promo:
            return JsonResponse({'ok': False, 'errors': {'promo': [{'message': 'Промокод не найден или истёк'}]}},
                                status=400)
    order = Order.create_for(tariff, data['name'], data['email'].lower(), data['phone'], promo)
    return JsonResponse({'ok': True, 'order': order.pk, 'total': str(order.total)})


@require_GET
def promo_check(request):
    tariff = get_object_or_404(Tariff, pk=request.GET.get('tariff') or 0, is_active=True)
    promo = PromoCode.find_valid(request.GET.get('code'))
    if not promo:
        return JsonResponse({'ok': False, 'total': str(tariff.price)})
    discount, total = apply_discount(tariff.price, promo.discount_percent)
    return JsonResponse({'ok': True, 'percent': promo.discount_percent, 'discount': str(discount),
                         'total': str(total)})
