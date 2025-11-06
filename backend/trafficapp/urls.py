# trafficapp/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AlertRuleViewSet, AlertLogViewSet, aggregate_counts

router = DefaultRouter()
router.register("alertrules", AlertRuleViewSet, basename="alertrule")
router.register("alertlogs", AlertLogViewSet, basename="alertlog")

urlpatterns = [
    path("", include(router.urls)),
    path("aggregate_counts/", aggregate_counts, name="aggregate_counts"),
]
