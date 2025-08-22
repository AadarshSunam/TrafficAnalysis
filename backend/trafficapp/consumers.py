import os, json, cv2, asyncio, base64, logging
from concurrent.futures import ThreadPoolExecutor
from django.conf import settings
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from trafficapp.models import VideoSource
from pipeline.corePipeline import TrafficPipeline

logger = logging.getLogger(__name__)

BASE       = settings.BASE_DIR
MODEL_PATH = os.path.join(BASE, "pipeline/firsttry.pt")
DATA_YAML  = os.path.join(BASE, "pipeline/data.yaml")
SCEN_YAML  = os.path.join(BASE, "pipeline/config/scenarios.yaml")

class LiveStreamConsumer(AsyncWebsocketConsumer):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.capture   = None
        self.streaming = False
        self.pipeline  = None
        self.executor  = ThreadPoolExecutor(max_workers=1)
        self.task      = None

    async def connect(self):
        await self.accept()
        logger.info("WS: client connected")

    async def disconnect(self, code):
        logger.info(f"WS: disconnected ({code})")
        self.streaming = False
        if self.capture and self.capture.isOpened():
            self.capture.release()
        if self.task:
            self.task.cancel()

    async def receive(self, text_data):
        data = json.loads(text_data)
        src_id = data.get("source_id")
        if not src_id:
            return await self.send(json.dumps({"error": "no source_id"}))

        # fetch the RTSP path
        try:
            vs = await database_sync_to_async(
                VideoSource.objects.select_related("scenario").get
            )(id=src_id)
        except VideoSource.DoesNotExist:
            return await self.send(json.dumps({"error": "source not found"}))

        # one-time pipeline init
        if not self.pipeline:
            self.pipeline = TrafficPipeline(
                model_path=MODEL_PATH,
                data_yaml=DATA_YAML,
                scenarios_yaml=SCEN_YAML,
                mode=vs.scenario.name,
                min_conf=0.3,
                iou=0.2,
            )

        # open RTSP
        path = vs.path.strip()
        self.capture = cv2.VideoCapture(path)
        if not self.capture.isOpened():
            return await self.send(json.dumps({"error": "cannot open stream"}))

        self.streaming = True
        if self.task:
            self.task.cancel()
        self.task = asyncio.create_task(self.stream_frames())

    async def stream_frames(self):
        loop = asyncio.get_running_loop()
        while self.streaming and self.capture.isOpened():
            # read
            ret, frame = await loop.run_in_executor(self.executor, self.capture.read)
            if not ret or frame is None:
                await asyncio.sleep(0.1)
                continue

            # process
            processed = await loop.run_in_executor(self.executor, self.pipeline.process_frame, frame)

            # encode & send
            ok, buf = cv2.imencode(".jpg", processed)
            if ok:
                img64 = base64.b64encode(buf).decode("utf-8")
                await self.send(json.dumps({"image": img64}))

            # ~20 fps
            await asyncio.sleep(0.05)

        # cleanup
        if self.capture and self.capture.isOpened():
            self.capture.release()
        self.streaming = False
