# pipeline/corePipeline.py
import yaml
import logging
from ultralytics import YOLO
from collections import defaultdict
import numpy as np
import cv2
from typing import Optional, Dict, Any
import threading
import time

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class TrafficPipeline:
    def __init__(
        self,
        model_path: str,
        data_yaml: str,
        scenarios_yaml: str,
        mode: str,
        min_conf: float = 0.25,
        iou: float = 0.2,
        frame_skip: int = 3,
        inference_width: Optional[int] = 320,
        tracker: str = "bytetrack.yaml",
        debug: bool = False,
    ):
        self.min_conf = min_conf
        self.iou = iou
        self.frame_skip = max(1, int(frame_skip))
        self.inference_width = inference_width or 320
        self.tracker = tracker
        self.debug = debug

        with open(data_yaml, "r") as f:
            cfg = yaml.safe_load(f)
        # cfg["names"] is usually a list. We'll accept list or dict.
        self.class_names = cfg.get("names", {})
        # If class_names is a list, we'll index; if dict, use .get

        with open(scenarios_yaml, "r") as f:
            self.scenarios = yaml.safe_load(f)
        if mode not in self.scenarios:
            raise ValueError(f"Scenario '{mode}' not found in {scenarios_yaml}")
        self.mode = mode

        # Load model
        self.model = YOLO(model_path)

        # tracking / counting state
        self.prev_centroid = {}
        self.curr_centroid = {}
        self.counted_zones = defaultdict(set)
        self.current_counts = defaultdict(lambda: defaultdict(int))

        self._frame_counter = 0
        self._last_annotated_frame = None
        self._processing_lock = threading.Lock()
        self._last_process_time = 0
        self.MIN_PROCESS_INTERVAL = 0.1  # Minimum 100ms between processing

        logger.info("TrafficPipeline initialized: mode=%s frame_skip=%d inference_width=%s",
                    self.mode, self.frame_skip, self.inference_width)

    def process_frame(self, frame: np.ndarray) -> Optional[np.ndarray]:
        """
        Process frame and return annotated frame (numpy array) OR None on fatal error.
        This is called inside a background executor thread.
        """
        if frame is None:
            logger.warning("process_frame called with frame=None")
            return None

        self._frame_counter += 1
        current_time = time.time()
        
        # Throttle processing to avoid overwhelming the system
        if current_time - self._last_process_time < self.MIN_PROCESS_INTERVAL:
            if self._last_annotated_frame is not None:
                return self._last_annotated_frame.copy()
            return frame.copy()

        # Only allow one processing operation at a time
        if not self._processing_lock.acquire(blocking=False):
            if self._last_annotated_frame is not None:
                return self._last_annotated_frame.copy()
            return frame.copy()

        try:
            self._last_process_time = current_time
            out_frame = frame.copy()
            inference_frame, scale = self._prepare_inference_frame(frame)
            sx, sy = scale
            run_detection = (self._frame_counter % self.frame_skip) == 0

            results = None
            if run_detection:
                try:
                    results_list = self.model.track(
                        inference_frame,
                        tracker=self.tracker,
                        persist=True,
                        conf=self.min_conf,
                        iou=self.iou,
                        verbose=False,  # Reduce logging noise
                    )
                    results = results_list[0] if results_list else None
                except Exception as e:
                    logger.exception("Model.track() failed: %s", e)
                    results = None

            if results is not None:
                try:
                    self._handle_results(results, out_frame, (sx, sy))
                    self._last_annotated_frame = out_frame
                    return out_frame
                except Exception as e:
                    logger.exception("Error handling results: %s", e)

            # fallback to last annotated frame so UI won't go blank
            if self._last_annotated_frame is not None:
                return self._last_annotated_frame.copy()
            return out_frame
            
        finally:
            self._processing_lock.release()

    def reset_minute(self) -> Dict[str, Dict[str, int]]:
        snapshot = {cls: dict(dirs) for cls, dirs in self.current_counts.items()}
        self.current_counts = defaultdict(lambda: defaultdict(int))
        self.counted_zones.clear()
        logger.debug("reset_minute snapshot: %s", snapshot)
        return snapshot

    def _prepare_inference_frame(self, frame: np.ndarray):
        H, W = frame.shape[:2]
        if self.inference_width and W and W > self.inference_width:
            target_w = int(self.inference_width)
            target_h = int((target_w / W) * H)
            # Use faster interpolation for real-time processing
            inf = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_NEAREST)
            sx = target_w / float(W)
            sy = target_h / float(H)
            return inf, (sx, sy)
        return frame, (1.0, 1.0)

    def _handle_results(self, results: Any, out_frame: np.ndarray, scale: tuple):
        sx, sy = scale
        boxes = getattr(results, "boxes", None)
        if not boxes:
            if self.debug:
                logger.debug("No boxes in results")
            return

        seen_tids = set()
        for i, box in enumerate(boxes):
            try:
                # robust extraction for id, cls, xyxy
                box_id = getattr(box, "id", None)
                cls_attr = getattr(box, "cls", None)
                xyxy_attr = getattr(box, "xyxy", None)

                if box_id is None or cls_attr is None or xyxy_attr is None:
                    if self.debug:
                        logger.debug("Skipping box #%d due missing fields id=%r cls=%r xyxy=%r", i, box_id, cls_attr, xyxy_attr)
                    continue

                # parse tid
                if hasattr(box_id, "__getitem__"):
                    tid = int(box_id[0])
                else:
                    tid = int(box_id)

                # parse class index
                if hasattr(cls_attr, "__getitem__"):
                    cls_idx = int(cls_attr[0])
                else:
                    cls_idx = int(cls_attr)

                # resolve class name from either list or dict
                if isinstance(self.class_names, dict):
                    cls_name = self.class_names.get(cls_idx, str(cls_idx))
                elif isinstance(self.class_names, (list, tuple)):
                    cls_name = self.class_names[cls_idx] if 0 <= cls_idx < len(self.class_names) else str(cls_idx)
                else:
                    cls_name = str(cls_idx)

                xy = xyxy_attr[0] if hasattr(xyxy_attr, "__getitem__") else xyxy_attr
                x1, y1, x2, y2 = map(float, xy[:4])
                if sx != 1.0 or sy != 1.0:
                    x1 /= sx; x2 /= sx; y1 /= sy; y2 /= sy
                x1_i, y1_i, x2_i, y2_i = int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))

                cx = int((x1_i + x2_i) / 2)
                cy = int((y1_i + y2_i) / 2)

                if tid in self.curr_centroid:
                    self.prev_centroid[tid] = self.curr_centroid[tid]
                self.curr_centroid[tid] = (cx, cy, cls_name)
                seen_tids.add(tid)

                self._annotate_box(out_frame, x1_i, y1_i, x2_i, y2_i, tid, cls_name)

            except Exception as e:
                logger.exception("Exception handling box #%d: %s", i, e)

        stale = set(self.curr_centroid.keys()) - seen_tids
        for tid in stale:
            self.curr_centroid.pop(tid, None)

        try:
            self._count_zones(out_frame.shape[:2])
        except Exception as e:
            logger.exception("Zone counting error: %s", e)

    def _annotate_box(self, frame: np.ndarray, x1: int, y1: int, x2: int, y2: int, tid: int, cls_name: str):
        color = (0, 200, 255)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label = f"{cls_name} id={tid}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame, (x1, max(y1 - th - 6, 0)), (x1 + tw + 6, y1), color, -1)
        cv2.putText(frame, label, (x1 + 3, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
        cx = int((x1 + x2) / 2)
        cy = int((y1 + y2) / 2)
        cv2.circle(frame, (cx, cy), 3, (0, 255, 0), -1)

    def _count_zones(self, frame_size):
        H, W = frame_size
        zones = self.scenarios.get(self.mode, {})
        for tid, centroid in list(self.curr_centroid.items()):
            try:
                cx, cy, cls_name = centroid
                prev = self.prev_centroid.get(tid)
                for direction, bounds in zones.items():
                    if direction in self.counted_zones[tid]:
                        continue
                    ymin, ymax, xmin, xmax = bounds
                    y0, y1 = int(ymin * H), int(ymax * H)
                    x0, x1 = int(xmin * W), int(xmax * W)
                    now_inside = (x0 <= cx <= x1) and (y0 <= cy <= y1)
                    was_outside = True
                    if prev:
                        px, py, _ = prev
                        was_outside = not (x0 <= px <= x1 and y0 <= py <= y1)
                    if was_outside and now_inside:
                        self.current_counts[cls_name][direction] += 1
                        self.counted_zones[tid].add(direction)
                        if self.debug:
                            logger.debug("Counted tid=%s class=%s dir=%s -> %s", tid, cls_name, direction, self.current_counts[cls_name][direction])
                        break
            except Exception as e:
                logger.exception("Error counting zones for tid=%r: %s", tid, e)