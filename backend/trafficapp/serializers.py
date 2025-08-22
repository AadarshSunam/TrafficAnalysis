from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Scenario, VideoSource, VehicleCount

class ScenarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Scenario
        fields = ["id","name"]
        
class VideoSourceSerializer(serializers.ModelSerializer):
    scenario = ScenarioSerializer(read_only=True)
    scenario_id = serializers.PrimaryKeyRelatedField(
        source='scenario', queryset=Scenario.objects.all(), write_only=True
    )
    
    class Meta:
        model = VideoSource
        fields = ["id", "name", "path", "scenario", "scenario_id"]
        
class VehicleCountSerializer(serializers.ModelSerializer):
     intersection = serializers.CharField(source="intersection.name", read_only=True)
     vehicle_class = serializers.CharField(source="vehicle_class.name", read_only=True)
     
     class Meta:
         model = VehicleCount
         fields = [
             "id",
            "intersection",
            "vehicle_class",
            "direction",
            "timestamp",
            "count",
            "scenario"
         ]
         
class UserRegistrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
        extra_kwargs = {
            'password': {'write_only': True}
        }
    
    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
    