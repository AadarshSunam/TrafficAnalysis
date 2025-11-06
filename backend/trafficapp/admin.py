from django.contrib import admin
from .models import Scenario, VideoSource, Intersection, VehicleClass, VehicleCount, AlertRule, AlertLog

@admin.register(Scenario)
class ScenarioAdmin(admin.ModelAdmin):
    list_display = ("name",)

@admin.register(VideoSource)
class VideoSourceAdmin(admin.ModelAdmin):
    list_display = ("name", "path", "scenario")

@admin.register(Intersection)
class IntersectionAdmin(admin.ModelAdmin):
    list_display = ("name",)

@admin.register(VehicleClass)
class VehicleClassAdmin(admin.ModelAdmin):
    list_display = ("name",)

@admin.register(VehicleCount)
class VehicleCountAdmin(admin.ModelAdmin):
    list_display = ("intersection", "vehicle_class", "direction", "timestamp", "count", "scenario")
    list_filter = ("scenario", "intersection", "vehicle_class", "direction")
    ordering = ("-timestamp",)

@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "rule_type", "threshold", "active", "created_at", "created_by")
    list_filter = ("active", "rule_type", "created_by")
    readonly_fields = ("created_at",)
    search_fields = ("name",)

@admin.register(AlertLog)
class AlertLogAdmin(admin.ModelAdmin):
    list_display = ("rule", "scenario", "direction", "vehicle_class", "timestamp")
    list_filter = ("scenario", "direction", "vehicle_class")
    readonly_fields = ("timestamp",)
    ordering = ("-timestamp",)