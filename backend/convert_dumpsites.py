from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "data" / "waste_dumpsites_drone"
DEST = ROOT / "data" / "waste_dumpsites_yolo"

SPLITS = {"train": "train", "valid": "val", "test": "test"}


def convert_split(source_split, output_split):
    annotation_file = SOURCE / source_split / "annotations_coco.json"

    with annotation_file.open("r", encoding="utf-8") as f:
        coco = json.load(f)

    image_source = SOURCE / source_split
    image_dest = DEST / "images" / output_split
    label_dest = DEST / "labels" / output_split
    image_dest.mkdir(parents=True, exist_ok=True)
    label_dest.mkdir(parents=True, exist_ok=True)

    annotations_by_image = {}
    for ann in coco.get("annotations", []):
        annotations_by_image.setdefault(ann["image_id"], []).append(ann)

    converted = 0
    missing = []
    invalid = 0

    for image in coco.get("images", []):
        filename = Path(image["file_name"]).name
        source_image = image_source / filename

        if not source_image.exists():
            matches = list(image_source.rglob(filename))
            if not matches:
                missing.append(filename)
                continue
            source_image = matches[0]

        width = float(image["width"])
        height = float(image["height"])
        if width <= 0 or height <= 0:
            invalid += 1
            continue

        lines = []

        for ann in annotations_by_image.get(image["id"], []):
            if ann.get("category_id") != 1:
                continue

            bbox = ann.get("bbox", [])
            if len(bbox) != 4:
                invalid += 1
                continue

            x, y, w, h = map(float, bbox)
            if w <= 0 or h <= 0:
                invalid += 1
                continue

            x1 = max(0.0, min(x, width))
            y1 = max(0.0, min(y, height))
            x2 = max(0.0, min(x + w, width))
            y2 = max(0.0, min(y + h, height))

            bw = x2 - x1
            bh = y2 - y1
            if bw <= 0 or bh <= 0:
                invalid += 1
                continue

            xc = (x1 + x2) / (2 * width)
            yc = (y1 + y2) / (2 * height)
            lines.append(
                f"0 {xc:.6f} {yc:.6f} {bw / width:.6f} {bh / height:.6f}"
            )

        shutil.copy2(source_image, image_dest / filename)
        (label_dest / (Path(filename).stem + ".txt")).write_text(
            "\n".join(lines), encoding="utf-8"
        )
        converted += 1

    print(f"\n{source_split.upper()} -> {output_split.upper()}")
    print(f"Images converted: {converted}")
    print(f"Missing images: {len(missing)}")
    print(f"Invalid boxes skipped: {invalid}")
    if missing:
        print("Examples of missing images:", missing[:5])

    return converted


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(f"Dataset not found: {SOURCE}")

    if DEST.exists():
        print(f"Output folder already exists: {DEST}")
        print("No files were overwritten. Rename or inspect this folder first.")
        return

    DEST.mkdir(parents=True)
    total = 0

    for source_split, output_split in SPLITS.items():
        total += convert_split(source_split, output_split)

    yaml = (
        "path: .\n"
        "train: images/train\n"
        "val: images/val\n"
        "test: images/test\n"
        "names:\n"
        "  0: waste\n"
    )
    (DEST / "data.yaml").write_text(yaml, encoding="utf-8")

    print(f"\nCONVERSION COMPLETE: {total} images")
    print(f"Dataset configuration: {DEST / 'data.yaml'}")


if __name__ == "__main__":
    main()
