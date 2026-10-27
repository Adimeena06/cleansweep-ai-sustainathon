from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WasteReport
from app.services.priority_engine import calculate_priority

router = APIRouter()


def calculate_waiting_score(created_at):
    if created_at is None:
        return 0

    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    age_hours = max(
        0,
        (datetime.now(timezone.utc) - created_at).total_seconds() / 3600,
    )

    return min(100, round(age_hours / 48 * 100, 2))


def report_to_dict(report, health_risk, cluster_score):
    waiting_score = calculate_waiting_score(report.created_at)

    priority = calculate_priority({
        "severity": report.severity,
        "health_risk": health_risk,
        "waiting_score": waiting_score,
        "cluster_score": cluster_score,
    })

    return {
        "report_id": report.id,
        "title": report.title,
        "waste_type": report.waste_type,
        "severity": report.severity,
        "status": report.status,
        "location": report.location,
        "coordinates": {
            "latitude": report.latitude,
            "longitude": report.longitude,
        },
        "priority_inputs": {
            "health_risk": health_risk,
            "waiting_score": waiting_score,
            "cluster_score": cluster_score,
        },
        **priority,
    }


@router.get("/")
def list_report_priorities(
    health_risk: float = Query(default=30, ge=0, le=100),
    cluster_score: float = Query(default=0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    reports = db.query(WasteReport).order_by(
        WasteReport.created_at.asc()
    ).all()

    results = [
        report_to_dict(report, health_risk, cluster_score)
        for report in reports
    ]

    return sorted(
        results,
        key=lambda item: item["priority_score"],
        reverse=True,
    )


@router.get("/{report_id}")
def get_report_priority(
    report_id: int,
    health_risk: float = Query(default=30, ge=0, le=100),
    cluster_score: float = Query(default=0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    report = db.query(WasteReport).filter(
        WasteReport.id == report_id
    ).first()

    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")

    return report_to_dict(report, health_risk, cluster_score)
