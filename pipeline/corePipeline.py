import yaml
from ultralytics import YOLO
from collections import defaultdict

class TrafficPipeline:
    """
    YOLOv8 + ByteTrack traffic counting pipeline with per-zone crossing detection.

    - Reads 'data.yaml' to get class names.
    - Reads 'scenarios.yaml' for zone definitions.
    - Loads YOLOv8 model for detection + ByteTrack for tracking.
    - Counts each vehicle once per zone (on crossing into that zone) per minute.
    """

    def __init__(self, model_path, data_yaml, scenarios_yaml, mode,
                 min_conf=0.3, iou=0.2):
        # 1) Load class names
        cfg = yaml.safe_load(open(data_yaml, "r"))
        self.class_names = cfg["names"]

        # 2) Load scenarios
        self.scenarios = yaml.safe_load(open(scenarios_yaml, "r"))
        if mode not in self.scenarios:
            raise ValueError(f"Scenario '{mode}' not found in {scenarios_yaml}")
        self.mode = mode

        # 3) Instantiate YOLOv8 model
        self.model = YOLO(model_path)
        self.min_conf = min_conf
        self.iou = iou

        # 4) Tracking state
        self.prev_centroid = {}            # tid -> (cx, cy, cls_name)
        self.curr_centroid = {}            # tid -> (cx, cy, cls_name)
        self.counted_zones = defaultdict(set)
        # counted_zones[tid] = set of zone names already counted this minute

        # 5) Per-minute aggregator
        self.current_counts = defaultdict(lambda: defaultdict(int))
        # Format: { class_name: { direction: count } }

    def process_frame(self, frame):
        # A) Detect & track
        results = self.model.track(
            frame,
            tracker="bytetrack.yaml",
            persist=True,
            conf=self.min_conf,
            iou=self.iou
        )[0]

        # B) Update centroid history
        for box in results.boxes:
            tid = int(box.id[0])
            cls_idx = int(box.cls[0])
            cls_name = self.class_names[cls_idx]
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

            # Shift current -> previous, then set new current
            if tid in self.curr_centroid:
                self.prev_centroid[tid] = self.curr_centroid[tid]
            self.curr_centroid[tid] = (cx, cy, cls_name)

        # C) Crossing-into-zone detection
        zones = self.scenarios[self.mode]
        H, W = frame.shape[:2]

        for tid, (cx, cy, cls_name) in list(self.curr_centroid.items()):
            prev = self.prev_centroid.get(tid)

            for direction, (ymin, ymax, xmin, xmax) in zones.items():
                # Skip if already counted this zone
                if direction in self.counted_zones[tid]:
                    continue

                # Convert fractional to pixel bounds
                y0, y1 = int(ymin * H), int(ymax * H)
                x0, x1 = int(xmin * W), int(xmax * W)

                now_inside = (x0 <= cx <= x1) and (y0 <= cy <= y1)
                was_outside = True
                if prev:
                    px, py, _ = prev
                    was_outside = not (x0 <= px <= x1 and y0 <= py <= y1)

                # Count only on crossing from outside -> inside
                if was_outside and now_inside:
                    self.current_counts[cls_name][direction] += 1
                    self.counted_zones[tid].add(direction)
                    break

    def reset_minute(self):
        """
        Called at each minute boundary: return the aggregated counts,
        then reset internal counters and per-zone markers.
        Returns: { class_name: { direction: count } }
        """
        snapshot = {cls: dict(dirs) for cls, dirs in self.current_counts.items()}
        # Reset for next minute
        self.current_counts = defaultdict(lambda: defaultdict(int))
        self.counted_zones.clear()
        return snapshot
