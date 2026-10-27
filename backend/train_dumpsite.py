from pathlib import Path
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent

model_path = ROOT / "yolo11n.pt"
data_path = ROOT / "data" / "waste_dumpsites_yolo" / "data.yaml"

if not model_path.exists():
    raise FileNotFoundError(f"Model weights not found: {model_path}")

if not data_path.exists():
    raise FileNotFoundError(f"Dataset config not found: {data_path}")

model = YOLO(str(model_path))

model.train(
    data=str(data_path),
    epochs=40,
    imgsz=640,
    batch=4,
    device="cpu",
    workers=0,
    project=str(ROOT / "runs"),
    name="dumpsite_waste_v1",
    exist_ok=False,
)