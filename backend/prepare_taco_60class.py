import json
import random
import shutil
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent
SOURCE = BASE / "data" / "taco" / "source" / "data"
ANNOTATIONS = SOURCE / "annotations.json"
OUTPUT = BASE / "data" / "taco_60class"

random.seed(42)

data = json.loads(ANNOTATIONS.read_text(encoding="utf-8"))
categories = sorted(data["categories"], key=lambda c: c["id"])
category_ids = {c["id"]: i for i, c in enumerate(categories)}
names = [c["name"] for c in categories]

images = {im["id"]: im for im in data["images"]}
annotations_by_image = {}
for ann in data["annotations"]:
    annotations_by_image.setdefault(ann["image_id"], []).append(ann)

# Keep only images that actually exist and have usable annotations.
records = []
missing = 0
for image_id, anns in annotations_by_image.items():
    im = images.get(image_id)
    if not im:
        continue
    image_path = SOURCE / im["file_name"]
    if not image_path.exists():
        missing += 1
        continue

    valid = []
    width, height = im["width"], im["height"]
    if width <= 0 or height <= 0:
        continue

    for ann in anns:
        bbox = ann.get("bbox", [])
        if len(bbox) != 4:
            continue
        x, y, w, h = map(float, bbox)
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(width, x + w), min(height, y + h)
        if x2 <= x1 or y2 <= y1:
            continue
        if ann["category_id"] not in category_ids:
            continue
        valid.append((category_ids[ann["category_id"]],
                      (x1 + x2) / 2 / width,
                      (y1 + y2) / 2 / height,
                      (x2 - x1) / width,
                      (y2 - y1) / height))
    if valid:
        records.append((image_path, valid))

random.shuffle(records)
split = max(1, int(len(records) * 0.8))
splits = {"train": records[:split], "val": records[split:]}

if not splits["val"]:
    raise RuntimeError("Not enough images for a train/validation split.")

# Build in a fresh folder so reruns don't leave stale images.
if OUTPUT.exists():
    shutil.rmtree(OUTPUT)

counts = {"train": Counter(), "val": Counter()}
for part, items in splits.items():
    img_dir = OUTPUT / "images" / part
    label_dir = OUTPUT / "labels" / part
    img_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)

    for idx, (src, boxes) in enumerate(items):
        dst_name = f"{idx:06d}_{src.name}"
        shutil.copy2(src, img_dir / dst_name)
        label_path = label_dir / f"{Path(dst_name).stem}.txt"
        with label_path.open("w", encoding="utf-8") as f:
            for cls, cx, cy, w, h in boxes:
                f.write(f"{cls} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")
                counts[part][cls] += 1

yaml = OUTPUT / "data.yaml"
yaml.write_text(
    "path: " + str(OUTPUT).replace("\\", "/") + "\n"
    + "train: images/train\n"
    + "val: images/val\n"
    + "names:\n"
    + "".join(f"  {i}: {json.dumps(name, ensure_ascii=False)}\n"
              for i, name in enumerate(names)),
    encoding="utf-8"
)

print("60-class dataset created.")
print("Categories:", len(names))
print("Images available:", len(records))
print("Missing image records:", missing)
print("Training images:", len(splits["train"]))
print("Validation images:", len(splits["val"]))
print("Training boxes:", sum(counts["train"].values()))
print("Validation boxes:", sum(counts["val"].values()))
print("\nPer-class annotation totals:")
for i, name in enumerate(names):
    total = counts["train"][i] + counts["val"][i]
    print(f"{i:2}: {total:4} | {name}")
print("\nDataset YAML:", yaml)
