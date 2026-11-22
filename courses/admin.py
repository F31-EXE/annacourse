import csv

from django.contrib import admin, messages
from django.http import HttpResponse
from django.utils import timezone

from .models import Course, Lead, Module, Order, PromoCode, Tariff

admin.site.site_header = 'Анна Самарина · курсы'
admin.site.site_title = 'Админка курсов'
admin.site.index_title = 'Управление курсами и продажами'


def export_csv(filename, header, rows):
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response.write('﻿')  # BOM, чтобы Excel открыл кириллицу
    writer = csv.writer(response, delimiter=';')
    writer.writerow(header)
    writer.writerows(rows)
    return response


class ModuleInline(admin.StackedInline):
    model = Module
    extra = 0
    fields = ('order', 'title', 'tools', 'description', 'prompt')


class TariffInline(admin.TabularInline):
    model = Tariff
    extra = 0
    fields = ('order', 'name', 'price', 'old_price', 'is_active', 'is_featured')
    show_change_link = True


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('title', 'is_published', 'module_count', 'updated_at')
    list_filter = ('is_published',)
    prepopulated_fields = {'slug': ('title',)}
    inlines = [ModuleInline, TariffInline]

    @admin.display(description='Модулей')
    def module_count(self, obj):
        return obj.modules.count()


@admin.register(Tariff)
class TariffAdmin(admin.ModelAdmin):
    list_display = ('name', 'course', 'price', 'old_price', 'is_active', 'is_featured', 'order', 'paid_count')
    list_editable = ('price', 'is_active', 'is_featured', 'order')
    list_filter = ('course', 'is_active')

    @admin.display(description='Продано')
    def paid_count(self, obj):
        return obj.orders.filter(status=Order.Status.PAID).count()


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = ('code', 'discount_percent', 'is_active', 'valid_until', 'used_count', 'max_uses')
    list_editable = ('is_active',)
    readonly_fields = ('used_count',)
    search_fields = ('code',)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'created_at', 'name', 'email', 'phone', 'tariff', 'total', 'promo', 'status')
    list_display_links = ('id', 'name')
    list_filter = ('status', 'tariff', 'created_at')
    search_fields = ('name', 'email', 'phone')
    date_hierarchy = 'created_at'
    readonly_fields = ('price', 'discount', 'total', 'promo', 'created_at', 'paid_at')
    fieldsets = (
        ('Покупатель', {'fields': ('name', 'email', 'phone')}),
        ('Покупка', {'fields': ('tariff', 'promo', 'price', 'discount', 'total')}),
        ('Статус', {'fields': ('status', 'paid_at', 'comment', 'created_at')}),
    )
    actions = ('mark_paid', 'mark_cancelled', 'export_orders')

    @admin.action(description='Отметить как оплаченные')
    def mark_paid(self, request, queryset):
        for order in queryset:
            order.mark_paid()
        self.message_user(request, f'Оплачено: {queryset.count()}', messages.SUCCESS)

    @admin.action(description='Отменить')
    def mark_cancelled(self, request, queryset):
        n = queryset.update(status=Order.Status.CANCELLED)
        self.message_user(request, f'Отменено: {n}', messages.WARNING)

    @admin.action(description='Выгрузить в CSV (Excel)')
    def export_orders(self, request, queryset):
        rows = [(o.id, timezone.localtime(o.created_at).strftime('%d.%m.%Y %H:%M'), o.name, o.email, o.phone,
                 o.tariff.name, o.price, o.discount, o.total, o.promo.code if o.promo else '',
                 o.get_status_display()) for o in queryset.select_related('tariff', 'promo')]
        return export_csv('orders.csv',
                          ['№', 'Дата', 'Имя', 'Email', 'Телефон', 'Тариф', 'Цена', 'Скидка', 'Итого',
                           'Промокод', 'Статус'], rows)


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ('email', 'source', 'created_at')
    list_filter = ('source', 'created_at')
    search_fields = ('email',)
    actions = ('export_leads',)

    @admin.action(description='Выгрузить в CSV (Excel)')
    def export_leads(self, request, queryset):
        rows = [(lead.email, lead.source, timezone.localtime(lead.created_at).strftime('%d.%m.%Y %H:%M'))
                for lead in queryset]
        return export_csv('leads.csv', ['Email', 'Откуда', 'Дата'], rows)
