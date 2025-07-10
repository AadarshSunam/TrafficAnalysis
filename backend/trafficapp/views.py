import cv2
from django.http import StreamingHttpResponse, Http404
from django.views.decorators import gzip
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import viewsets, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Scenario, VideoSource, VehicleCount
from .serializers import (
    ScenarioSerializer,
    VideoSourceSerializer,
    VehicleCountSerializer,
    UserRegistrationSerializer,
)
from .services.ingestion_service import ingest_all_sources, ingest_source


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({"detail": "Registration successful"}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ScenarioViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Scenario.objects.all()
    serializer_class = ScenarioSerializer
    permission_classes = [IsAuthenticated]


class VideoSourceViewSet(viewsets.ModelViewSet):
    queryset = VideoSource.objects.all()
    serializer_class = VideoSourceSerializer
    permission_classes = [IsAuthenticated]


class VehicleCountViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = VehicleCount.objects.all().order_by("-timestamp")
    serializer_class = VehicleCountSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = {
        "scenario": ["exact"],
        "intersection__name": ["exact"],
        "vehicle_class__name": ["exact"],
        "direction": ["exact"],
        "timestamp": ["gte", "lte"],
    }
    ordering_fields = ["timestamp", "count"]
    ordering = ["-timestamp"]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ingest_all(request):
    """
    POST /api/ingest/ — Ingest all sources and persist counts
    """
    results = ingest_all_sources()
    return Response({"results": results})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ingest_one(request, pk):
    """
    POST /api/ingest/{pk}/ — Ingest a specific video source and persist counts
    """
    try:
        vs = VideoSource.objects.get(pk=pk)
    except VideoSource.DoesNotExist:
        raise Http404("VideoSource not found")

    result = ingest_source(vs)
    return Response(result)


def frame_generator(path):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise IOError(f"Cannot open video path: {path}")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        _, jpg = cv2.imencode(".jpg", frame)
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg.tobytes() + b"\r\n"
    cap.release()


@gzip.gzip_page
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stream_source(request, pk):
    """
    GET /api/stream/{pk}/ — Live MJPEG stream from source
    """
    try:
        vs = VideoSource.objects.get(pk=pk)
    except VideoSource.DoesNotExist:
        raise Http404("VideoSource not found")

    response = StreamingHttpResponse(
        frame_generator(vs.path),
        content_type="multipart/x-mixed-replace; boundary=frame"
    )
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response
