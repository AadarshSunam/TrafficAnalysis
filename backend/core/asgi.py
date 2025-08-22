# backend/core/asgi.py

import os
import sys

# ── 1) Make sure the project root (one level above core/) is on Python's path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# ── 2) Set Django settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# ── 3) Initialize Django
from django.core.asgi import get_asgi_application
django_asgi_app = get_asgi_application()

# ── 4) Import Channels stuff
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import trafficapp.routing

# ── 5) Build the ASGI application
application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(trafficapp.routing.websocket_urlpatterns)
    ),
})
