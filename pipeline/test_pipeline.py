import cv2
from pipeline.corePipeline import TrafficPipeline
from datetime import timedelta

def simulate_short_video():
    # Load a small test video or single frame
    cap = cv2.VideoCapture("pipeline/videos/intersection4/sample1.mp4")
    if not cap.isOpened():
        print("Cannot open sample video.")
        return

    pipeline = TrafficPipeline(
        model_path="pipeline/firsttry.pt",
        data_yaml="pipeline/data.yaml",
        scenarios_yaml="pipeline/config/scenarios.yaml",
        mode="intersection4",
        min_conf=0.3,
        iou=0.2
    )

    current_minute = None
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        pipeline.process_frame(frame)

        # Simulate timestamp by frame index
        frame_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
        minute_ts = (frame_idx // 30)  # assume 30 FPS, 1 minute = 1800 frames

        if current_minute is None:
            current_minute = minute_ts

        if minute_ts != current_minute:
            # minute changed
            snapshot = pipeline.reset_minute()
            print(f"Minute {current_minute}: {snapshot}")
            current_minute = minute_ts

    # Flush last minute
    snapshot = pipeline.reset_minute()
    print(f"Minute {current_minute}: {snapshot}")
    cap.release()

if __name__ == "__main__":
    simulate_short_video()
