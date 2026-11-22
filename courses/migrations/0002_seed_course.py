"""Курс и модули из презентации «Нейросети для дизайнеров интерьера». Тарифы не создаются:
цены задаются в админке."""
from django.db import migrations

COURSE = {
    'slug': 'neural-networks-for-interior-designers',
    'title': 'Нейросети для дизайнеров интерьера',
    'subtitle': 'Nano Banana Pro, Midjourney, ChatGPT, Flux, Krea, Veo 3.1 и другие помощники',
    'description': 'Авторский курс Анны Самариной — дизайнера интерьера, руководителя студии «Молоко интерьер».',
}

MODULES = [
    ('Генерация интерьерных концепций', 'Krea · Nano Banana · Flux · Midjourney',
     'Пишем промпт по формуле из шести шагов и сравниваем, как одну идею видят разные нейросети.',
     'тип помещения · любимый дизайнер или архитектор · что мы видим в помещении · материал пола · материал стен · оттенки'),
    ('Работа с коллажами', 'Nano Banana · ChatGPT',
     'Превращаем коллаж из реальных предметов в фотореалистичную визуализацию.',
     'сделай интерьерную визуализацию, вдохновлённую этим коллажем, + коротко опишите, что именно нужно'),
    ('Скетчи и болванки', 'Nano Banana',
     'Из скетча или белой 3D-болванки — в реалистичный рендер с материалами и светом.',
     'сделай реалистичную визуализацию из этого скетча, + описание по формуле промпта'),
    ('Замена предмета или материала', 'Nano Banana',
     'Меняем мебель, ковёр или отделку — с референсом в 1–2 ракурсах или без. Добавляем человека в интерьер.',
     'замени один предмет или материал на другой'),
    ('Бетонная коробка', 'Nano Banana',
     'Показываем клиенту комнату после ремонта ещё до начала работ — с сохранением пропорций, окон и дверей.',
     'покажи эту комнату после ремонта, гостиная, сохрани пропорции помещения и расположение окна и двери, стиль ваби-саби'),
    ('Видео и рум-туры', 'Veo 3.1',
     'Оживляем визуализацию: рум-тур и презентация интерьера с ведущей прямо в кадре.',
     'сделай презентацию интерьера, рум-тур, девушка в джинсах презентует интерьерный дизайн на русском языке, '
     'говорит «короткий текст»; в конце садится на диван'),
]


def seed(apps, schema_editor):
    Course = apps.get_model('courses', 'Course')
    Module = apps.get_model('courses', 'Module')
    course, created = Course.objects.get_or_create(slug=COURSE['slug'], defaults=COURSE)
    if created:
        for i, (title, tools, description, prompt) in enumerate(MODULES, start=1):
            Module.objects.create(course=course, order=i, title=title, tools=tools,
                                  description=description, prompt=prompt)


def unseed(apps, schema_editor):
    apps.get_model('courses', 'Course').objects.filter(slug=COURSE['slug']).delete()


class Migration(migrations.Migration):
    dependencies = [('courses', '0001_initial')]
    operations = [migrations.RunPython(seed, unseed)]
