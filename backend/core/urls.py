from django.contrib import admin
from django.urls import path, include
from django.views.generic.base import RedirectView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from trafficapp.views import (
    RegisterView,
    ScenarioViewSet,
    VideoSourceViewSet,
    VehicleCountViewSet,
    ingest_all,
    ingest_one,
    stream_source,
)

router = DefaultRouter()
router.register(r"scenarios", ScenarioViewSet, basename="scenario")
router.register(r"videosources", VideoSourceViewSet, basename="videosource")
router.register(r"vehiclecounts", VehicleCountViewSet, basename="vehiclecount")

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),

    # Redirect root → /api/
    path("", RedirectView.as_view(url="/api/", permanent=False)),

    # Public endpoints
    path("api/register/", RegisterView.as_view(), name="register"),
    path("api/token/",   TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # DRF router endpoints
    path("api/", include(router.urls)),

    # Ingest endpoints
    path("api/ingest/",        ingest_all, name="ingest_all"),
    path("api/ingest/<int:pk>/", ingest_one, name="ingest_one"),

    # Streaming endpoint
    path("api/stream/<int:pk>/", stream_source, name="stream_source"),
]
