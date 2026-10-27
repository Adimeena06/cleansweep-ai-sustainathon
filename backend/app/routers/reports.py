
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WasteReport
from app.schemas.report import (
    ReportCreate,
    ReportResponse,
    ReportStatusUpdate,
)

router = APIRouter()

ALLOWED_SEVERITIES = {"low", "medium", "high", "critical"}

ALLOWED_STATUSES = {
    "Submitted",
    "Verified",
    "Assigned",
    "In Progress",
    "Resolved",
    "Rejected",
}


@router.get("/", response_model=list[ReportResponse])
def list_reports(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(WasteReport)

    if status:
        query = query.filter(WasteReport.status == status)

    return query.order_by(WasteReport.created_at.desc()).all()


@router.post("/", response_model=ReportResponse, status_code=201)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
):
    data = payload.model_dump()

    severity = data["severity"].lower()

    if severity not in ALLOWED_SEVERITIES:
        raise HTTPException(
            status_code=422,
            detail="Severity must be low, medium, high, or critical.",
        )

    data["severity"] = severity

    report = WasteReport(**data)

    try:
        db.add(report)
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not create the waste report.",
        )

    return report


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
):
    report = (
        db.query(WasteReport)
        .filter(WasteReport.id == report_id)
        .first()
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found.",
        )

    return report


@router.patch("/{report_id}/status", response_model=ReportResponse)
def update_report_status(
    report_id: int,
    payload: ReportStatusUpdate,
    db: Session = Depends(get_db),
):
    report = (
        db.query(WasteReport)
        .filter(WasteReport.id == report_id)
        .first()
    )

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Report not found.",
        )

    requested_status = payload.status.strip().lower()

    valid_statuses = {
        status.lower(): status
        for status in ALLOWED_STATUSES
    }

    if requested_status not in valid_statuses:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Invalid status.",
                "allowed_statuses": sorted(ALLOWED_STATUSES),
            },
        )

    new_status = valid_statuses[requested_status]

    # Do not mark a report Assigned without a recorded truck.
    if new_status == "Assigned" and not report.assigned_truck:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot mark this report as Assigned without a truck. "
                "Use POST /api/dispatch/assign/{report_id} first."
            ),
        )

    # Prevent resetting an assigned report while its truck remains recorded.
    if (
        report.assigned_truck
        and new_status in {"Submitted", "Verified"}
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "This report has a truck assigned. "
                "Handle the truck assignment before resetting its status."
            ),
        )

    report.status = new_status

    try:
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update report status.",
        )

    return report

