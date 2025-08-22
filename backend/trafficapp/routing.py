# backend/trafficapp/routing.py

from django.urls import re_path
from .consumers import LiveStreamConsumer

websocket_urlpatterns = [
    re_path(r"ws/live/$", LiveStreamConsumer.as_asgi()),
]
