from django.contrib import admin
from .models import Scenario, VideoSource, Intersection, VehicleClass, VehicleCount

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
