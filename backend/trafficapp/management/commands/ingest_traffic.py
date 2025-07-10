import os
import cv2
import yaml
from datetime import datetime, timezone
from django.conf import settings
from django.core.management.base import BaseCommand
from trafficapp.models import Intersection, VehicleClass, VehicleCount, VideoSource
from pipeline.corePipeline import TrafficPipeline

class Command(BaseCommand):
    help = "Ingest all VideoSource folders using their assigned scenario"

    def handle(self, *args, **options):
        # 1) Ensure default Intersection exists
        intersection_obj, _ = Intersection.objects.get_or_create(name="MainStreet")

        # 2) Ensure VehicleClass entries exist
        data_yaml_path = os.path.join(settings.BASE_DIR, "pipeline", "data.yaml")
        with open(data_yaml_path, "r") as f:
            data_cfg = yaml.safe_load(f)
        for cls_nm in data_cfg["names"]:
            VehicleClass.objects.get_or_create(name=cls_nm)

        # 3) Fetch all VideoSource objects
        for vs in VideoSource.objects.all():
            scenario_name = vs.scenario.name
            video_folder = vs.path
            self.stdout.write(f"\n► Processing VideoSource '{vs.name}' ({scenario_name})")

            pipeline = TrafficPipeline(
                model_path=os.path.join(settings.BASE_DIR, "pipeline", "firsttry.pt"),
                data_yaml=os.path.join(settings.BASE_DIR, "pipeline", "data.yaml"),
                scenarios_yaml=os.path.join(settings.BASE_DIR, "pipeline", "config", "scenarios.yaml"),
                mode=scenario_name,
                min_conf=0.3,
                iou=0.2
            )

            for fname in os.listdir(video_folder):
                if not fname.lower().endswith(".mp4"):
                    continue
                cap = cv2.VideoCapture(os.path.join(video_folder, fname))
                if not cap.isOpened():
                    self.stdout.write(self.style.ERROR(f"Cannot open {fname}"))
                    continue

                # We'll bucket counts by the real, current UTC minute
                current_minute = None
                fps = cap.get(cv2.CAP_PROP_FPS) or 1.0

                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break

                    pipeline.process_frame(frame)

                    # *** Use “now” rather than elapsed-from-epoch ***
                    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)

                    if current_minute is None:
                        current_minute = now

                    if now != current_minute:
                        # flush last minute
                        snapshot = pipeline.reset_minute()
                        for cls_nm, dirs in snapshot.items():
                            vc_obj = VehicleClass.objects.get(name=cls_nm)
                            for dir_nm, cnt in dirs.items():
                                if cnt > 0:
                                    VehicleCount.objects.create(
                                        intersection=intersection_obj,
                                        vehicle_class=vc_obj,
                                        direction=dir_nm,
                                        timestamp=current_minute,
                                        count=cnt,
                                        scenario=scenario_name
                                    )
                        current_minute = now

                # final flush after file ends
                snapshot = pipeline.reset_minute()
                for cls_nm, dirs in snapshot.items():
                    vc_obj = VehicleClass.objects.get(name=cls_nm)
                    for dir_nm, cnt in dirs.items():
                        if cnt > 0:
                            VehicleCount.objects.create(
                                intersection=intersection_obj,
                                vehicle_class=vc_obj,
                                direction=dir_nm,
                                timestamp=current_minute,
                                count=cnt,
                                scenario=scenario_name
                            )
                cap.release()
                self.stdout.write(self.style.SUCCESS(f"Finished {fname}"))

            self.stdout.write(self.style.SUCCESS(f"Done with VideoSource '{vs.name}'"))
        self.stdout.write(self.style.SUCCESS("All VideoSources processed."))
