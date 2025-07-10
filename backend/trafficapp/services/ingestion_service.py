import os
import cv2
import yaml
from datetime import datetime, timezone
from django.conf import settings
from trafficapp.models import Intersection, VehicleClass, VehicleCount, VideoSource
from pipeline.corePipeline import TrafficPipeline

# Constants for paths
BASE = settings.BASE_DIR
MODEL_PATH = os.path.join(BASE, "pipeline", "firsttry.pt")
DATA_YAML = os.path.join(BASE, "pipeline", "data.yaml")
SCENARIOS_YAML = os.path.join(BASE, "pipeline", "config", "scenarios.yaml")


def ingest_source(vs: VideoSource, intersection_name="MainStreet"):
    """
    Ingest one VideoSource (like the management command).
    Returns a status dict.
    """
    intersection, _ = Intersection.objects.get_or_create(name=intersection_name)

    with open(DATA_YAML) as f:
        vehicle_names = yaml.safe_load(f)["names"]
    for name in vehicle_names:
        VehicleClass.objects.get_or_create(name=name)

    pipeline = TrafficPipeline(
        model_path=MODEL_PATH,
        data_yaml=DATA_YAML,
        scenarios_yaml=SCENARIOS_YAML,
        mode=vs.scenario.name,
        min_conf=0.3,
        iou=0.2
    )

    folder = vs.path
    for fname in os.listdir(folder):
        if not fname.lower().endswith(".mp4"):
            continue
        full_path = os.path.join(folder, fname)
        cap = cv2.VideoCapture(full_path)
        if not cap.isOpened():
            continue

        current_minute = None

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            pipeline.process_frame(frame)

            # Use current UTC time instead of calculated timestamp to avoid 1970 errors
            ts = datetime.now(timezone.utc).replace(second=0, microsecond=0)

            if current_minute is None:
                current_minute = ts

            if ts != current_minute:
                snapshot = pipeline.reset_minute()
                _save_snapshot(snapshot, intersection, current_minute, vs.scenario.name)
                current_minute = ts

        # Final flush
        snapshot = pipeline.reset_minute()
        _save_snapshot(snapshot, intersection, current_minute, vs.scenario.name)
        cap.release()

    return {"video_source": vs.id, "status": "ingested"}


def ingest_all_sources(intersection_name="MainStreet"):
    """
    Ingest all VideoSources and write to VehicleCount.
    """
    return [ingest_source(vs, intersection_name) for vs in VideoSource.objects.all()]


def _save_snapshot(snapshot, intersection, minute_ts, scenario_name):
    """
    Save pipeline snapshot to VehicleCount DB rows.
    """
    for cls_nm, directions in snapshot.items():
        vehicle_class = VehicleClass.objects.get(name=cls_nm)
        for direction, count in directions.items():
            if count > 0:
                VehicleCount.objects.create(
                    intersection=intersection,
                    vehicle_class=vehicle_class,
                    direction=direction,
                    timestamp=minute_ts,
                    count=count,
                    scenario=scenario_name
                )
