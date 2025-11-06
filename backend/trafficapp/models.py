from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

# Create your models here.
class Scenario(models.Model):
    name = models.CharField(max_length=50,unique=True)
    
    def __str__(self):
        return self.name
    
class VideoSource(models.Model):
    name = models.CharField(max_length=100,unique=True)
    path = models.CharField(max_length=200,help_text="Local folder of MP4s or RTSP URL pointing to camera")
    scenario = models.ForeignKey(Scenario, on_delete=models.PROTECT)
    
    def __str__(self):
        return f"{self.name} ({self.scenario.name})"
    
class Intersection(models.Model):
    name = models.CharField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name
    
class VehicleClass(models.Model):
    name = models.CharField(max_length=50, unique=True)
    
    def __str__(self):
        return self.name    
    
class VehicleCount(models.Model):
    intersection = models.ForeignKey(Intersection, on_delete=models.CASCADE)
    vehicle_class = models.ForeignKey(VehicleClass, on_delete=models.CASCADE)
    direction = models.CharField(max_length=50, help_text="Direction of vehicle flow (e.g., North, South, East, West)")
    timestamp = models.DateTimeField()
    count = models.PositiveIntegerField()
    scenario = models.CharField(max_length=50, help_text = "Matches Scenario.name")
    
    class Meta:
        indexes = [
            models.Index(fields=["timestamp", "scenario", "intersection"]),
        ]
     
    def __str__(self):
        return f"{self.intersection.name} | {self.vehicle_class.name} | {self.direction} | {self.timestamp:%Y-%m-%d %H:%M}"
           
        
        
class AlertRule(models.Model):
    RULE_TYPE_CHOICES = [
        ("absolute", "Absolute Threshold"),
        ("percent_spike", "Percent Spike vs baseline"),
        ("sustained", "Sustained high count"),
    ]

    name = models.CharField(max_length=150)
    active = models.BooleanField(default=True)
    scenarios = models.JSONField(blank=True, default=list, help_text="List of scenario names (empty = all)")
    directions = models.JSONField(blank=True, default=list, help_text="List of directions (empty = all)")
    vehicle_classes = models.JSONField(blank=True, default=list, help_text="List of vehicle class names (empty = all)")
    rule_type = models.CharField(max_length=32, choices=RULE_TYPE_CHOICES)
    threshold = models.FloatField(default=10, help_text="Meaning depends on rule_type")
    sustained_minutes = models.IntegerField(default=0, help_text="For 'sustained' rule: minutes to satisfy")
    webhook_url = models.URLField(blank=True, null=True)
    emails = models.TextField(blank=True, help_text="Comma-separated emails")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    cooldown_seconds = models.IntegerField(default=300, help_text="Do not re-alert same rule within this many seconds")

    def __str__(self):
        return f"{self.name} ({self.rule_type})"


class AlertLog(models.Model):
    rule = models.ForeignKey(AlertRule, null=True, blank=True, on_delete=models.SET_NULL)
    scenario = models.CharField(max_length=150, blank=True, null=True)
    direction = models.CharField(max_length=64, blank=True, null=True)
    vehicle_class = models.CharField(max_length=128, blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict)
    sent_emails = models.TextField(blank=True)
    webhook_status = models.CharField(max_length=256, blank=True)

    def __str__(self):
        return f"AlertLog {self.id} rule={self.rule} at {self.timestamp}"