from django.urls import path

from . import views

urlpatterns = [
    path('', views.landing, name='landing'),
    path('api/lead/', views.lead_create, name='lead_create'),
    path('api/order/', views.order_create, name='order_create'),
    path('api/promo/', views.promo_check, name='promo_check'),
]
