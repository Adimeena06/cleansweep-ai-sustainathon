from pathlib import Path
from functools import lru_cache
from collections import Counter

from ultralytics import YOLO


# Backend directory
BASE_DIR = Path(__file__).resolve().parents[2]

# Trained model weights
FOUR_CLASS_MODEL = (
    BASE_DIR / "runs" / "cleansweep_4class_v1" / "weights" / "best.pt"
)

BASELINE_MODEL = (
    BASE_DIR / "runs" / "dumpsite_waste_v1-2" / "weights" / "best.pt"
)


def select_model() -> Path:
    """Select an available trained YOLO model."""

    if FOUR_CLASS_MODEL.is_file():
        return FOUR_CLASS_MODEL

    if BASELINE_MODEL.is_file():
        return BASELINE_MODEL

    raise FileNotFoundError(
        "No trained YOLO model found. Expected weights at "
        f"{FOUR_CLASS_MODEL} or {BASELINE_MODEL}"
    )


@lru_cache(maxsize=2)
def get_model(model_path: str):
    """Load and cache the YOLO model."""
    return YOLO(model_path)


def detect_waste(
    image_path: str,
    output_path: str,
    confidence: float = 0.25,
):
    """Detect waste, save an annotated image, and return detection results."""

    model_path = select_model()
    model = get_model(str(model_path))

    results = model.predict(
        source=image_path,
        conf=confidence,
        verbose=False,
    )

    if not results:
        raise RuntimeError("YOLO did not return any detection results.")

    result = results[0]
    detections = []
    counts = Counter()

    names = model.names

    if result.boxes is not None:
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            score = float(box.conf[0].item())

            coords = [
                round(float(value), 2)
                for value in box.xyxy[0].tolist()
            ]

            if isinstance(names, dict):
                class_name = str(names.get(class_id, class_id))
            else:
                class_name = str(names[class_id])

            detections.append(
                {
                    "class_id": class_id,
                    "class_name": class_name,
                    "confidence": round(score, 4),
                    "bbox": {
                        "x1": coords[0],
                        "y1": coords[1],
                        "x2": coords[2],
                        "y2": coords[3],
                    },
                }
            )

            counts[class_name] += 1

    # Save image with detection boxes
    annotated_image = result.plot()

    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    import cv2

    saved = cv2.imwrite(str(output_file), annotated_image)

    if not saved:
        raise RuntimeError(
            f"Could not save annotated image to {output_file}"
        )

    return {
        "status": "success",
        "model": model_path.name,
        "model_type": (
            "four_class"
            if model_path == FOUR_CLASS_MODEL
            else "baseline"
        ),
        "confidence_threshold": confidence,
        "total_detections": len(detections),
        "class_counts": dict(counts),
        "detections": detections,
    }