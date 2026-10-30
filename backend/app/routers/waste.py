
from pathlib import Path
from uuid import uuid4
from io import BytesIO
from app.services.auto_dispatch import auto_assign_report
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from PIL import Image
from app.models import Truck
from app.services.notification_service import (
    create_assignment_whatsapp_link,
)

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

                # Preserve explicitly supplied GPS coordinates.
        # If they are missing, try to extract them from location.
        saved_location = location.strip()

        if latitude is None or longitude is None:
            try:
                parts = [part.strip() for part in saved_location.split(",")]

                if len(parts) == 2:
                    parsed_latitude = float(parts[0])
                    parsed_longitude = float(parts[1])

                    if (
                        -90 <= parsed_latitude <= 90
                        and -180 <= parsed_longitude <= 180
                    ):
                        if latitude is None:
                            latitude = parsed_latitude
                        if longitude is None:
                            longitude = parsed_longitude
            except (ValueError, TypeError):
                pass

        report = WasteReport(
            title=f"AI Waste Detection: {waste_type}",
            description=description or (
                f"AI detected {result['total_detections']} object(s)."
            ),
            location=saved_location,
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

                # Save the report first so a dispatch failure cannot lose it.
        db.add(report)
        db.commit()
        db.refresh(report)

        # Automatically assign a suitable truck using the existing engine.
        dispatch_result = {
            "assigned": False,
            "message": "Automatic dispatch has not completed.",
        }

        try:
            dispatch_result = auto_assign_report(db, report)

            if dispatch_result.get("assigned"):
                report.status = "Assigned"

            db.commit()
            db.refresh(report)

        except Exception as dispatch_error:
            # Preserve the already-saved report if dispatch fails.
            db.rollback()
            print(
                f"Automatic dispatch failed for report {report.id}: "
                f"{type(dispatch_error).__name__}: {dispatch_error}"
            )
            dispatch_result = {
                "assigned": False,
                "message": "Report saved, but automatic dispatch failed.",
            }
        # Generate a WhatsApp link for the assigned truck driver.
        notification_result = {
            "success": False,
            "message": "No truck was assigned.",
            "whatsapp_link": None,
        }

        if dispatch_result.get("assigned"):
            try:
                assigned_truck_id = (
                    dispatch_result.get("truck_id")
                    or report.assigned_truck
                )

                assigned_truck = (
                    db.query(Truck)
                    .filter(Truck.truck_id == assigned_truck_id)
                    .first()
                )

                if assigned_truck:
                    notification_result = (
                        create_assignment_whatsapp_link(
                            report,
                            assigned_truck,
                        )
                    )
                else:
                    notification_result["message"] = (
                        "The assigned truck could not be found."
                    )

            except Exception as notification_error:
                print(
                    f"WhatsApp link generation failed for report "
                    f"{report.id}: {notification_error}"
                )

                notification_result = {
                    "success": False,
                    "message": "Failed to generate WhatsApp link.",
                    "whatsapp_link": None,
                }
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
        result["dispatch"] = dispatch_result
        result["notification"] = notification_result
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
