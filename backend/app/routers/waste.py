
from pathlib import Path
from uuid import uuid4
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from PIL import Image

from app.database import get_db
from app.models import WasteReport
from app.services.waste_detector import detect_waste

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024

SEVERITY_BY_WASTE = {
    "plastic": "high",
    "medical": "critical",
    "hazardous": "critical",
    "organic": "medium",
    "paper": "low",
    "cardboard": "low",
}


@router.get("/")
def waste_status():
    return {
        "status": "ok",
        "message": "Waste detection and reporting API ready",
    }


@router.post("/detect")
async def upload_and_detect_waste(
    file: UploadFile = File(...),
    location: str = Form(..., min_length=1, max_length=500),
    latitude: float | None = Form(default=None, ge=-90, le=90),
    longitude: float | None = Form(default=None, ge=-180, le=180),
    citizen_name: str | None = Form(default=None, max_length=120),
    description: str | None = Form(default=None),
    confidence: float = Query(default=0.25, ge=0.01, le=0.99),
    db: Session = Depends(get_db),
):
    extension = Path(file.filename or "").suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Upload a JPG, JPEG, PNG, or WEBP image.",
        )

    image_bytes = await file.read(MAX_FILE_SIZE + 1)

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image must be 10 MB or smaller.",
        )

    image_id = uuid4().hex
    image_path = UPLOAD_DIR / f"{image_id}{extension}"
    annotated_path = UPLOAD_DIR / f"{image_id}_annotated.jpg"

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.verify()

        image_path.write_bytes(image_bytes)

        result = detect_waste(
            image_path=str(image_path),
            output_path=str(annotated_path),
            confidence=confidence,
        )

        counts = result.get("class_counts", {})
        detections = result.get("detections", [])

        if counts:
            waste_type = max(counts, key=counts.get)
        else:
            waste_type = "Unclassified Waste"

        matching_severity = SEVERITY_BY_WASTE.get(
            waste_type.lower(), "medium"
        )

        confidence_values = [
            item["confidence"]
            for item in detections
            if "confidence" in item
        ]
        average_confidence = (
            sum(confidence_values) / len(confidence_values)
            if confidence_values
            else None
        )

        image_url = f"/uploads/{image_path.name}"
        annotated_image_url = f"/uploads/{annotated_path.name}"

        report = WasteReport(
            title=f"AI Waste Detection: {waste_type}",
            description=description or (
                f"AI detected {result['total_detections']} object(s)."
            ),
            location=location.strip(),
            latitude=latitude,
            longitude=longitude,
            severity=matching_severity,
            status="Submitted",
            image_url=image_url,
            annotated_image_url=annotated_image_url,
            waste_type=waste_type,
            ai_confidence=average_confidence,
            detection_count=result["total_detections"],
            clean_points=0,
        )

        db.add(report)
        db.commit()
        db.refresh(report)

        result["image_url"] = image_url
        result["annotated_image_url"] = annotated_image_url
        result["report"] = {
            "id": report.id,
            "title": report.title,
            "location": report.location,
            "severity": report.severity,
            "status": report.status,
            "waste_type": report.waste_type,
            "ai_confidence": report.ai_confidence,
            "detection_count": report.detection_count,
            "created_at": report.created_at.isoformat(),
        }

        return result

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        annotated_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail=f"Waste detection/report creation failed: "
                   f"{type(exc).__name__}: {exc}",
        ) from exc
    finally:
        await file.close()
