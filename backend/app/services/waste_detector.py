from pathlib import Path
from functools import lru_cache
from collections import Counter

from ultralytics import YOLO


BASE_DIR = Path(__file__).resolve().parents[2]

FOUR_CLASS_MODEL = BASE_DIR / "runs" / "cleansweep_4class_v1" / "weights" / "best.pt"
BASELINE_MODEL = BASE_DIR / "models" / "cleansweep_waste_best.pt"


def select_model():
    if FOUR_CLASS_MODEL.is_file():
        return FOUR_CLASS_MODEL
    if BASELINE_MODEL.is_file():
        return BASELINE_MODEL
    raise FileNotFoundError(
        "No trained waste model found. Expected a model at "
        f"{FOUR_CLASS_MODEL} or {BASELINE_MODEL}"
    )


@lru_cache(maxsize=1)
def get_model(model_path: str):
    return YOLO(model_path)


def detect_waste(
    image_path: str,
    output_path: str,
    confidence: float = 0.25,
):
    model_path = select_model()
    model = get_model(str(model_path))

    results = model.predict(
        source=image_path,
        conf=confidence,
        verbose=False,
    )

    if not results:
        raise RuntimeError("The model did not return a prediction result.")

    result = results[0]
    names = model.names
    detections = []
    counts = Counter()

    if result.boxes is not None:
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            score = float(box.conf[0].item())
            coords = [round(float(v), 2) for v in box.xyxy[0].tolist()]
            class_name = str(names.get(class_id, class_id))

            detections.append({
                "class_id": class_id,
                "class_name": class_name,
                "confidence": round(score, 4),
                "bbox": {
                    "x1": coords[0],
                    "y1": coords[1],
                    "x2": coords[2],
                    "y2": coords[3],
                },
            })
            counts[class_name] += 1

    annotated = result.plot()
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    # Ultralytics returns an annotated OpenCV image in BGR format.
    import cv2

    if not cv2.imwrite(str(output), annotated):
        raise RuntimeError(f"Could not save annotated image to {output}")

    return {
        "status": "success",
        "model": model_path.name,
        "model_type": (
            "four_class" if model_path == FOUR_CLASS_MODEL else "baseline"
        ),
        "confidence_threshold": confidence,
        "total_detections": len(detections),
        "class_counts": dict(counts),
        "detections": detections,
    }
