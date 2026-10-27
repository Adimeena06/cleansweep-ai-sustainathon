import json
import random
import shutil
from pathlib import Path
from collections import Counter

BASE = Path(__file__).resolve().parent
SOURCE = BASE / "data" / "taco" / "source" / "data"
ANNOTATIONS = SOURCE / "annotations.json"
OUTPUT = BASE / "data" / "individual_waste"

CLASS_NAMES = ["plastic", "paper_cardboard", "metal", "glass"]
random.seed(42)


def map_category(name):
    n = name.strip().lower()

    if any(x in n for x in [
        "glass bottle", "broken glass", "glass cup", "glass jar"
    ]):
        return 3

    if any(x in n for x in [
        "paper", "carton", "cardboard", "pizza box",
        "egg carton", "toilet tube", "tissue"
    ]):
        return 1

    if any(x in n for x in [
        "aluminium foil", "metal bottle cap", "food can",
        "drink can", "metal lid", "scrap metal", "pop tab",
        "aerosol"
    ]):
        return 2

    if any(x in n for x in [
        "plastic bottle", "plastic bottle cap", "plastic cup",
        "plastic lid", "plastic film", "plastic wrapper",
        "plastic bag", "plastic container", "plastic straw",
        "plastic utensils", "plastic gloves", "plastic glooves",
        "plastic", "polypropylene bag", "six pack rings",
        "garbage bag", "crisp packet", "spread tub", "tupperware",
        "foam cup", "foam food container", "styrofoam",
        "squeezable tube"
    ]):
        return 0

    return None


def main():
    if not ANNOTATIONS.exists():
        raise FileNotFoundError(f"Annotations not found: {ANNOTATIONS}")

    data = json.loads(ANNOTATIONS.read_text(encoding="utf-8"))
    category_map = {
        c["id"]: mapped
        for c in data["categories"]
        if (mapped := map_category(c["name"])) is not None
    }

    images = {im["id"]: im for im in data["images"]}
    anns = {image_id: [] for image_id in images}

    for ann in data["annotations"]:
        image_id = ann.get("image_id")
        category_id = ann.get("category_id")
        if image_id not in images or category_id not in category_map:
            continue

        bbox = ann.get("bbox")
        if bbox and len(bbox) == 4:
            anns[image_id].append((category_map[category_id], bbox))

    usable = []
    missing = 0

    for image_id, im in images.items():
        if not (SOURCE / im["file_name"]).exists():
            missing += 1
            continue
        if anns[image_id] and im.get("width") and im.get("height"):
            usable.append((image_id, im, anns[image_id]))

    random.shuffle(usable)
    cut = int(len(usable) * 0.8)
    splits = {"train": usable[:cut], "val": usable[cut:]}

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)

    counts = Counter()
    class_counts = Counter()

    for split, entries in splits.items():
        image_dir = OUTPUT / "images" / split
        label_dir = OUTPUT / "labels" / split
        image_dir.mkdir(parents=True, exist_ok=True)
        label_dir.mkdir(parents=True, exist_ok=True)

        for image_id, im, boxes in entries:
            width, height = im["width"], im["height"]
            src = SOURCE / im["file_name"]
            filename = f"{image_id}_{Path(im['file_name']).name}"
            shutil.copy2(src, image_dir / filename)

            lines = []
            for class_id, bbox in boxes:
                x, y, w, h = map(float, bbox)
                if w <= 0 or h <= 0:
                    continue

                x1 = max(0.0, min(float(width), x))
                y1 = max(0.0, min(float(height), y))
                x2 = max(0.0, min(float(width), x + w))
                y2 = max(0.0, min(float(height), y + h))
                bw, bh = x2 - x1, y2 - y1
                if bw <= 0 or bh <= 0:
                    continue

                xc, yc = (x1 + x2) / (2 * width), (y1 + y2) / (2 * height)
                lines.append(
                    f"{class_id} {xc:.6f} {yc:.6f} "
                    f"{bw / width:.6f} {bh / height:.6f}"
                )
                counts[split] += 1
                class_counts[CLASS_NAMES[class_id]] += 1

            (label_dir / f"{Path(filename).stem}.txt").write_text(
                "\n".join(lines), encoding="utf-8"
            )

    yaml = (
        f"path: {OUTPUT.as_posix()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "names:\n"
        + "".join(f"  {i}: {name}\n" for i, name in enumerate(CLASS_NAMES))
    )
    (OUTPUT / "data.yaml").write_text(yaml, encoding="utf-8")

    print("\nDataset preparation complete")
    print("Source images:", len(images))
    print("Missing images:", missing)
    print("Usable images:", len(usable))
    print("Training images:", len(splits["train"]))
    print("Validation images:", len(splits["val"]))
    print("Training boxes:", counts["train"])
    print("Validation boxes:", counts["val"])
    print("Class box counts:", dict(class_counts))
    print("Dataset YAML:", OUTPUT / "data.yaml")
    print("Review category mapping and labels before training.")


if __name__ == "__main__":
    main()
