from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[3] / "models"

def get_detector_status():
    weights = list(MODEL_DIR.glob("*.pt")) if MODEL_DIR.exists() else []

    if weights:
        return {
            "status": "weights_found",
            "weights": [p.name for p in weights],
        }

    return {
        "status": "model_not_connected",
        "message": "No YOLO model weights (.pt) found.",
    }
