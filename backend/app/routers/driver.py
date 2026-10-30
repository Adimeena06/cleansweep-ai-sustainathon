
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WasteCompletion, WasteReport, Truck

router = APIRouter(prefix="/api/driver", tags=["Driver Portal"])

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads" / "completion_proofs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024


def report_dict(report, completion=None):
    return {
        "id": report.id,
        "title": report.title,
        "description": report.description,
        "waste_type": report.waste_type,
        "severity": report.severity,
        "status": report.status,
        "location": report.location,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "image_url": report.image_url,
        "assigned_truck": report.assigned_truck,
        "completion": (
            {
                "id": completion.id,
                "truck_id": completion.truck_id,
                "after_image_url": completion.after_image_url,
                "notes": getattr(completion, "notes", None),
                "completed_at": completion.completed_at,
            }
            if completion
            else None
        ),
    }


@router.get("/jobs/{truck_id}")
def get_driver_jobs(
    truck_id: str,
    db: Session = Depends(get_db),
):
    truck = (
        db.query(Truck)
        .filter(Truck.truck_id == truck_id)
        .first()
    )

    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")

    reports = (
        db.query(WasteReport)
        .filter(WasteReport.assigned_truck == truck_id)
        .order_by(WasteReport.created_at.desc())
        .all()
    )

    completions = {
        item.report_id: item
        for item in (
            db.query(WasteCompletion)
            .filter(
                WasteCompletion.truck_id == truck_id,
                WasteCompletion.report_id.in_(
                    [r.id for r in reports] or [-1]
                ),
            )
            .all()
        )
    }

    return {
        "truck_id": truck_id,
        "jobs": [
            report_dict(report, completions.get(report.id))
            for report in reports
        ],
    }


@router.post("/jobs/{report_id}/start")
def start_driver_job(
    report_id: int,
    truck_id: str = Form(...),
    db: Session = Depends(get_db),
):
    report = (
        db.query(WasteReport)
        .filter(WasteReport.id == report_id)
        .first()
    )

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.assigned_truck != truck_id:
        raise HTTPException(
            status_code=403,
            detail="This job is not assigned to the selected truck",
        )

    if report.status in ("Resolved", "Rejected"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot start a job with status {report.status}",
        )

    report.status = "In Progress"

    try:
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not start the job",
        )

    return {"message": "Job started", "job": report_dict(report)}


@router.post("/jobs/{report_id}/complete")
async def complete_driver_job(
    report_id: int,
    truck_id: str = Form(...),
    notes: str = Form(""),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    report = (
        db.query(WasteReport)
        .filter(WasteReport.id == report_id)
        .first()
    )

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.assigned_truck != truck_id:
        raise HTTPException(
            status_code=403,
            detail="This job is not assigned to the selected truck",
        )

    if report.status not in ("Assigned", "In Progress"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot complete a job with status {report.status}",
        )

    existing = (
        db.query(WasteCompletion)
        .filter(WasteCompletion.report_id == report_id)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="A completion proof already exists for this report",
        )

    extension = Path(photo.filename or "").suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Upload a JPG, JPEG, PNG, or WebP image",
        )

    content_type = (photo.content_type or "").lower()

    if content_type not in {
        "image/jpeg",
        "image/png",
        "image/webp",
    }:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file must be an image",
        )

    content = await photo.read(MAX_IMAGE_SIZE + 1)

    if not content or len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="The proof photo must be between 1 byte and 10 MB",
        )

    # Verify image bytes rather than trusting only the filename.
    signatures = {
        ".jpg": content.startswith(b"\xff\xd8\xff"),
        ".jpeg": content.startswith(b"\xff\xd8\xff"),
        ".png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        ".webp": (
            len(content) >= 12
            and content[:4] == b"RIFF"
            and content[8:12] == b"WEBP"
        ),
    }

    if not signatures.get(extension, False):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file does not match its image format",
        )

    filename = f"report_{report_id}_{uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / filename
    relative_url = f"/uploads/completion_proofs/{filename}"

    try:
        file_path.write_bytes(content)

        completion = WasteCompletion(
            report_id=report_id,
            truck_id=truck_id,
            after_image_url=relative_url,
        )

        # Save proof and resolved status in the same DB transaction.
        db.add(completion)
        report.status = "Resolved"
        db.commit()
        db.refresh(completion)
        db.refresh(report)

        return {
            "message": "Job completed and proof saved",
            "job": report_dict(report, completion),
        }

    except Exception:
        db.rollback()

        if file_path.exists():
            file_path.unlink()

        raise HTTPException(
            status_code=500,
            detail="Could not save completion proof; the job was not resolved",
        )


@router.get("/jobs/{report_id}/completion")
def get_job_completion(
    report_id: int,
    db: Session = Depends(get_db),
):
    completion = (
        db.query(WasteCompletion)
        .filter(WasteCompletion.report_id == report_id)
        .order_by(WasteCompletion.completed_at.desc())
        .first()
    )

    if not completion:
        raise HTTPException(
            status_code=404,
            detail="No completion proof found for this report",
        )

    return {
        "report_id": completion.report_id,
        "truck_id": completion.truck_id,
        "after_image_url": completion.after_image_url,
        "notes": getattr(completion, "notes", None),
        "completed_at": completion.completed_at,
    }

