import os
import sys
import json
import cv2
import asyncio
import base64
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import threading
import time
from collections import deque

from django.conf import settings
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from pipeline.corePipeline import TrafficPipeline
from trafficapp.models import VideoSource, Intersection, VehicleClass, VehicleCount

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

BASE_DIR = settings.BASE_DIR
MODEL_PATH = os.path.join(BASE_DIR, "pipeline", "firsttry.pt")
DATA_YAML = os.path.join(BASE_DIR, "pipeline", "data.yaml")
SCENARIOS_YAML = os.path.join(BASE_DIR, "pipeline", "config", "scenarios.yaml")


class LiveStreamConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.capture = None
        self.pipeline = None
        self.executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="StreamProcessor")
        self.stream_task = None
        self.flush_task = None
        self.streaming = False
        self.vs = None

        # Enhanced frame management
        self._frame_queue = deque(maxlen=3)  # Only keep latest 3 frames
        self._processing_lock = asyncio.Lock()
        self._stop_event = asyncio.Event()
        self._client_addr = None
        self._last_send_time = 0
        self._send_interval = 1.0 / 15  # 15 FPS max for client
        self._frame_counter = 0
        self._skip_frames = 2  # Skip frames for smoother streaming

    async def connect(self):
        await self.accept()
        self._client_addr = self.scope.get("client")
        logger.info("WS: client connected %s", self._client_addr)

    async def disconnect(self, close_code):
        logger.info("WS: disconnected (%s)", close_code)
        self._stop_event.set()
        self.streaming = False

        # Cancel tasks gracefully
        if self.flush_task and not self.flush_task.done():
            self.flush_task.cancel()
            try:
                await asyncio.wait_for(self.flush_task, timeout=2.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass

        if self.stream_task and not self.stream_task.done():
            self.stream_task.cancel()
            try:
                await asyncio.wait_for(self.stream_task, timeout=2.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass

        # Release capture safely
        if self.capture:
            try:
                def safe_release():
                    try:
                        if self.capture and hasattr(self.capture, 'release'):
                            self.capture.release()
                    except:
                        pass
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, safe_release)
            except Exception:
                pass
            finally:
                self.capture = None

        self._stop_event = asyncio.Event()

    def _safe_release_capture(self):
        """Safely release capture in thread"""
        try:
            if self.capture and hasattr(self.capture, 'release'):
                self.capture.release()
        except Exception as e:
            logger.exception("Exception releasing capture: %s", e)

    async def receive(self, text_data=None, bytes_data=None):
        # accept JSON with { source_id } or heartbeat
        try:
            data = json.loads(text_data or "{}")
        except Exception:
            await self.send(json.dumps({"error": "invalid json"}))
            return

        if data.get("type") == "heartbeat":
            await self.send(json.dumps({"type": "heartbeat"}))
            return

        source_id = data.get("source_id")
        if not source_id:
            await self.send(json.dumps({"error": "Missing source_id"}))
            return

        # fetch VideoSource
        try:
            self.vs = await database_sync_to_async(
                lambda sid: VideoSource.objects.select_related("scenario").get(id=sid)
            )(source_id)
        except VideoSource.DoesNotExist:
            await self.send(json.dumps({"error": "VideoSource not found"}))
            return
        except Exception as e:
            logger.exception("DB error fetching VideoSource: %s", e)
            await self.send(json.dumps({"error": "Server error fetching source"}))
            return

        source_url = (self.vs.path or "").strip()
        scenario_mode = (self.vs.scenario.name if getattr(self.vs, "scenario", None) else "default")

        # Initialize pipeline only once
        if not self.pipeline:
            self.pipeline = TrafficPipeline(
                model_path=MODEL_PATH,
                data_yaml=DATA_YAML,
                scenarios_yaml=SCENARIOS_YAML,
                mode=scenario_mode,
                min_conf=0.25,
                iou=0.2,
                frame_skip=3,
                inference_width=320,
                tracker="bytetrack.yaml",
                debug=True,
            )

        # start streaming
        self._stop_event = asyncio.Event()
        self.streaming = True

        # open capture in executor (avoid blocking event loop)
        try:
            self.capture = await asyncio.get_running_loop().run_in_executor(
                self.executor, self._open_capture, source_url
            )
        except Exception as e:
            logger.exception("Exception while opening capture: %s", e)
            self.capture = None

        if not self.capture or not getattr(self.capture, "isOpened", lambda: False)():
            logger.warning("Failed to open capture for %s", source_url)
            await self.send(json.dumps({"error": "Failed to open video source"}))
            self.streaming = False
            return

        logger.info("Opened capture via cv2: %s", source_url)

        # Configure capture for optimal streaming
        try:
            await asyncio.get_running_loop().run_in_executor(
                self.executor, self._configure_capture
            )
        except Exception as e:
            logger.exception("Error configuring capture: %s", e)

        # start stream and periodic flush tasks
        self.stream_task = asyncio.create_task(self._stream_loop())
        self.flush_task = asyncio.create_task(self._periodic_minute_flush())
        await self.send(json.dumps({"status": "streaming_started"}))
        logger.info("WebSocket setup completed for source %s", source_id)

    def _configure_capture(self):
        """Configure capture for optimal real-time streaming"""
        try:
            self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            try:
                self.capture.set(cv2.CAP_PROP_FPS, 20)
            except:
                pass
            for _ in range(3):
                ret, _ = self.capture.read()
                if not ret:
                    break
        except Exception as e:
            logger.exception("Error configuring capture: %s", e)

    def _open_capture(self, url: str):
        logger.info("Trying cv2 candidate: %s", url)
        backends_to_try = []

        if sys.platform.startswith("win"):
            backends_to_try = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_FFMPEG, None]
        elif sys.platform.startswith("linux"):
            backends_to_try = [cv2.CAP_V4L2, cv2.CAP_FFMPEG, cv2.CAP_GSTREAMER, None]
        else:
            backends_to_try = [cv2.CAP_FFMPEG, None]

        for backend in backends_to_try:
            try:
                if backend is None:
                    cap = cv2.VideoCapture(url)
                else:
                    cap = cv2.VideoCapture(url, backend)
                time.sleep(0.3)
                if cap.isOpened():
                    ret, test_frame = cap.read()
                    if ret and test_frame is not None:
                        logger.info(f"Successfully opened with backend: {backend}")
                        return cap
                    else:
                        cap.release()
                else:
                    cap.release()
            except Exception as e:
                logger.exception("Open attempt failed with backend %r: %s", backend, e)
        logger.error("All capture backends failed for URL: %s", url)
        return None

    async def _stream_loop(self):
        logger.info("Starting optimized stream loop for source id=%s", getattr(self.vs, "id", None))
        loop = asyncio.get_running_loop()
        jpeg_quality = 75
        preview_w = 640
        try:
            frame_count = 0
            while self.streaming and not self._stop_event.is_set() and self.capture and self.capture.isOpened():
                current_time = time.time()
                latest_frame = None
                for _ in range(2):
                    try:
                        ret, frame = await loop.run_in_executor(
                            self.executor, self._safe_read_with_timeout
                        )
                        if ret and frame is not None:
                            latest_frame = frame
                        else:
                            break
                    except Exception as e:
                        logger.exception("Exception during frame read: %s", e)
                        break
                if latest_frame is None:
                    await asyncio.sleep(0.05)
                    continue

                frame_count += 1
                logger.debug("Processing frame %d", frame_count)

                # Send preview to client (rate limited)
                if current_time - self._last_send_time >= self._send_interval:
                    try:
                        h, w = latest_frame.shape[:2]
                        if w > preview_w:
                            preview_h = int(preview_w * h / w)
                            preview_frame = await loop.run_in_executor(
                                self.executor, cv2.resize, latest_frame, (preview_w, preview_h), cv2.INTER_LINEAR
                            )
                        else:
                            preview_frame = latest_frame

                        encode_params = [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
                        ok, buf = await loop.run_in_executor(
                            self.executor, cv2.imencode, ".jpg", preview_frame, encode_params
                        )
                        if ok and buf is not None and buf.size > 0:
                            b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
                            await self.send(json.dumps({"image": b64}))
                            self._last_send_time = current_time
                    except Exception as e:
                        logger.exception("Error encoding/sending preview: %s", e)

                # Process frames for detection/tracking/counting
                try:
                    if len(self._frame_queue) < self._frame_queue.maxlen:
                        self._frame_queue.append(latest_frame.copy())
                    if not self._processing_lock.locked():
                        asyncio.create_task(self._process_frame_bg())
                except Exception as e:
                    logger.exception("Error in frame processing setup: %s", e)

                await asyncio.sleep(0.02)
        except asyncio.CancelledError:
            logger.info("Stream loop cancelled")
        except Exception as e:
            logger.exception("Unexpected stream loop error: %s", e)
        finally:
            logger.info("Stream loop ended, processed %d frames", frame_count)
            self.streaming = False

    def _safe_read_with_timeout(self):
        try:
            if not self.capture or not self.capture.isOpened():
                return False, None
            return self.capture.read()
        except Exception as e:
            logger.exception("Exception in _safe_read_with_timeout: %s", e)
            return False, None

    async def _process_frame_bg(self):
        async with self._processing_lock:
            if not self._frame_queue:
                return
            frame = self._frame_queue.popleft()
            loop = asyncio.get_running_loop()
            try:
                processed = await loop.run_in_executor(self.executor, self.pipeline.process_frame, frame)
                if processed is not None and logger.isEnabledFor(logging.DEBUG):
                    if self.pipeline.current_counts:
                        logger.debug("Current counts: %s", dict(self.pipeline.current_counts))
            except Exception as e:
                logger.exception("Error during background frame processing: %s", e)

    async def _periodic_minute_flush(self):
        logger.info("Starting periodic minute flush task")
        try:
            while self.streaming and not self._stop_event.is_set():
                now = datetime.now(timezone.utc)
                secs = now.second + now.microsecond / 1_000_000
                wait = max(1.0, 60.0 - secs)
                await asyncio.sleep(wait)
                try:
                    if self.pipeline:
                        snapshot = self.pipeline.reset_minute()
                        ts = datetime.now(timezone.utc).replace(second=0, microsecond=0)
                        if snapshot:
                            logger.info("Saving snapshot to DB: %s", snapshot)
                            await self._save_snapshot_db(snapshot, ts)
                        else:
                            logger.debug("No data to save in this minute")
                except Exception as e:
                    logger.exception("Error during periodic snapshot: %s", e)
        except asyncio.CancelledError:
            logger.info("Minute flush cancelled")
        except Exception as e:
            logger.exception("Minute flush task crashed: %s", e)
        finally:
            logger.info("Periodic minute flush finished")

    @database_sync_to_async
    def _save_snapshot_db(self, snapshot, minute_ts):
        try:
            intersection, _ = Intersection.objects.get_or_create(
                name=(getattr(self.vs, "name", "MainStreet") or "MainStreet")
            )
            for cls_name, dirs in snapshot.items():
                vc, _ = VehicleClass.objects.get_or_create(name=cls_name)
                for direction, count in dirs.items():
                    if count > 0:
                        VehicleCount.objects.create(
                            intersection=intersection,
                            vehicle_class=vc,
                            direction=direction,
                            timestamp=minute_ts,
                            count=count,
                            scenario=(getattr(self.vs, "scenario").name if getattr(self.vs, "scenario", None) else ""),
                        )
        except Exception:
            logger.exception("Failed to save snapshot to DB")
