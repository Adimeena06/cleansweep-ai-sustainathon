from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.routers.weather import weather_status
from app.services.priority_engine import calculate_priority

from app.database import get_db
from app.models import WasteReport, Truck
from app.services.dispatch_engine import recommend_truck
from app.services.priority_engine import calculate_priority

router = APIRouter()


# -------------------- REQUEST SCHEMAS --------------------

class ComplaintInput(BaseModel):
    complaint_id: str
    severity: str = "medium"
    health_risk: float = Field(default=30, ge=0, le=100)
    waiting_score: float = Field(default=0, ge=0, le=100)
    cluster_score: float = Field(default=0, ge=0, le=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    required_capacity: float = Field(default=0, ge=0)
    waste_type: str | None = None


class TruckInput(BaseModel):
    truck_id: str
    status: str = "available"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    capacity: float = Field(gt=0)
    current_load: float = Field(default=0, ge=0)
    delay_minutes: float = Field(default=0, ge=0)


class DispatchRequest(BaseModel):
    complaint: ComplaintInput
    trucks: list[TruckInput]


class TruckListRequest(BaseModel):
    trucks: list[TruckInput]


class AssignTruckRequest(BaseModel):
    truck_id: str = Field(min_length=1, max_length=120)


# -------------------- HELPERS --------------------

def normalize_waste_type(value):
    if not value:
        return "mixed"

    value = str(value).strip().lower().replace(" ", "_")

    aliases = {
        "paper": "paper_cardboard",
        "cardboard": "paper_cardboard",
        "paper_and_cardboard": "paper_cardboard",
        "general": "mixed",
        "general_waste": "mixed",
        "organic": "mixed",
        "organic_waste": "mixed",
        "e_waste": "mixed",
        "electronic_waste": "mixed",
    }

    return aliases.get(value, value)


def get_supported_types(truck):
    raw_types = getattr(truck, "supported_waste_types", None)

    if not raw_types:
        return ["mixed"]

    # Support both database strings and Python lists.
    if isinstance(raw_types, str):
        raw_types = raw_types.split(",")

    return [
        normalize_waste_type(item)
        for item in raw_types
        if str(item).strip()
    ]


def truck_to_input(truck):
    return {
        "truck_id": truck.truck_id,
        "status": truck.status,
        "latitude": truck.latitude,
        "longitude": truck.longitude,
        "capacity": truck.capacity,
        "current_load": truck.current_load,
        "delay_minutes": truck.delay_minutes,
    }


def get_required_capacity(report):
    """
    The current WasteReport model has no quantity/volume field.
    Until one is added, use zero rather than inventing a waste quantity.
    """
    return 0.0


def get_database_truck_recommendation(report, db):
    complaint = {
        "complaint_id": str(report.id),
        "severity": report.severity or "medium",
        "health_risk": 30,
        "waiting_score": 0,
        "cluster_score": 0,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "required_capacity": get_required_capacity(report),
    }

    waste_type = normalize_waste_type(report.waste_type)

    all_trucks = db.query(Truck).all()

    # Only recommend trucks that are available and support this waste type.
    compatible_trucks = []

    for truck in all_trucks:
        if (truck.status or "").strip().lower() != "available":
            continue

        supported = get_supported_types(truck)

        if waste_type not in supported and "mixed" not in supported:
            continue

        compatible_trucks.append(truck)

        # Read current weather conditions.
    try:
        weather = weather_status()
        weather_emergency = weather.get("emergency", False)
        weather_mode = weather.get("mode", "unknown")

        # Only a confirmed high-severity weather alert raises this score.
        weather_risk = (
            100
            if weather_emergency
            else 0
        )

    except Exception:
        # Do not invent an emergency when weather data is unavailable.
        weather_emergency = False
        weather_mode = "unavailable"
        weather_risk = 0

    complaint["weather_risk"] = weather_risk
    priority = calculate_priority(complaint)

    if not compatible_trucks:
        return {
            "report_id": report.id,
            "waste_type": report.waste_type,
            "location": report.location,
            "report_status": report.status,
            **priority,
            "dispatch": {
                "assigned": False,
                "message": (
                    "No available truck supports this waste type. "
                    "Check the fleet status and supported waste types."
                ),
                "recommendation": None,
                "alternatives": [],
            },
        }

    truck_inputs = [truck_to_input(t) for t in compatible_trucks]

    dispatch_result = recommend_truck(complaint, truck_inputs)

    # Attach additional information from the persistent fleet records.
    candidate_ids = {
        item["truck_id"]
        for item in (
            ([dispatch_result["recommendation"]]
             if dispatch_result.get("recommendation") else [])
            + dispatch_result.get("alternatives", [])
        )
    }

    truck_lookup = {
        t.truck_id: t
        for t in compatible_trucks
    }

    for candidate_id in candidate_ids:
        candidate = next(
            (
                item for item in (
                    ([dispatch_result["recommendation"]]
                     if dispatch_result.get("recommendation") else [])
                    + dispatch_result.get("alternatives", [])
                )
                if item["truck_id"] == candidate_id
            ),
            None,
        )

        if candidate and candidate_id in truck_lookup:
            candidate["name"] = truck_lookup[candidate_id].name
            candidate["supported_waste_types"] = get_supported_types(
                truck_lookup[candidate_id]
            )

    return {
        "report_id": report.id,
        "waste_type": report.waste_type,
        "location": report.location,
        "report_status": report.status,
        **priority,
        "dispatch": dispatch_result,
                "weather_context": {
            "mode": weather_mode,
            "emergency": weather_emergency,
            "weather_risk": weather_risk,
        },
    }


# -------------------- DISPATCH STATUS --------------------

@router.get("/")
def dispatch_status():
    return {
        "status": "ok",
        "service": "CleanSweep AI Smart Dispatch Engine",
        "mode": "database_backed_recommendation",
    }


# -------------------- MANUAL DISPATCH RECOMMENDATION --------------------

@router.post("/recommend")
def dispatch_recommendation(payload: DispatchRequest):
    complaint = payload.complaint.model_dump()
    trucks = [truck.model_dump() for truck in payload.trucks]

    priority = calculate_priority(complaint)
    result = recommend_truck(complaint, trucks)

    return {
        "complaint_id": complaint["complaint_id"],
        **priority,
        "dispatch": result,
    }


# -------------------- RECOMMEND FROM SAVED FLEET --------------------

@router.post("/recommend/{report_id}")
def recommend_for_saved_report(
    report_id: int,
    db: Session = Depends(get_db),
):
    report = db.query(WasteReport).filter(
        WasteReport.id == report_id
    ).first()

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Waste report not found.",
        )

    if report.latitude is None or report.longitude is None:
        raise HTTPException(
            status_code=422,
            detail="This report has no coordinates for truck routing.",
        )

    return get_database_truck_recommendation(report, db)


# -------------------- ASSIGN TRUCK TO REPORT --------------------

@router.post("/assign/{report_id}")
def assign_truck_to_report(
    report_id: int,
    payload: AssignTruckRequest,
    db: Session = Depends(get_db),
):
    report = db.query(WasteReport).filter(
        WasteReport.id == report_id
    ).first()

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Waste report not found.",
        )

    if report.latitude is None or report.longitude is None:
        raise HTTPException(
            status_code=422,
            detail="This report has no coordinates for truck routing.",
        )

    if report.status in ("Resolved", "Rejected"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot assign a truck to a {report.status.lower()} report.",
        )

    if report.assigned_truck:
        raise HTTPException(
            status_code=409,
            detail=f"This report already has truck {report.assigned_truck} assigned.",
        )

    truck_id = payload.truck_id.strip()

    truck = db.query(Truck).filter(
        Truck.truck_id == truck_id
    ).with_for_update().first()

    if truck is None:
        raise HTTPException(
            status_code=404,
            detail="Truck not found.",
        )

    if (truck.status or "").strip().lower() != "available":
        raise HTTPException(
            status_code=409,
            detail="This truck is not available.",
        )

    waste_type = normalize_waste_type(report.waste_type)
    supported_types = get_supported_types(truck)

    if waste_type not in supported_types and "mixed" not in supported_types:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "This truck does not support the report's waste type.",
                "waste_type": waste_type,
                "supported_waste_types": supported_types,
            },
        )

    required_capacity = get_required_capacity(report)
    remaining_capacity = truck.capacity - truck.current_load

    if remaining_capacity < required_capacity:
        raise HTTPException(
            status_code=422,
            detail="The truck does not have enough remaining capacity.",
        )

    # Persist the assignment consistently.
    report.assigned_truck = truck.truck_id
    report.status = "Assigned"
    report.updated_at = datetime.now(timezone.utc)

    # Mark the truck busy.
    truck.status = "busy" 

    try:
        db.commit()
        db.refresh(report)
        db.refresh(truck)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Assignment failed. No changes were saved.",
        )

    return {
        "success": True,
        "message": "Truck assigned successfully.",
        "report_id": report.id,
        "report_status": report.status,
        "assigned_truck": truck.truck_id,
        "truck_status": truck.status,
    }

