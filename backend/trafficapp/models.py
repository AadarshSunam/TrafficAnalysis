from django.db import models

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
           
        
        
    