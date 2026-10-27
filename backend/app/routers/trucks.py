
import math

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Truck

router = APIRouter()

ALLOWED_STATUSES = {
    "available",
    "busy",
    "maintenance",
    "offline",
}


class TruckCreate(BaseModel):
    truck_id: str = Field(min_length=1, max_length=120)
    name: str | None = Field(default=None, max_length=120)

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    capacity: float = Field(gt=0)
    current_load: float = Field(default=0, ge=0)

    status: str = "available"

    supported_waste_types: list[str] = Field(
        default_factory=lambda: [
            "plastic",
            "paper_cardboard",
            "metal",
            "glass",
            "mixed",
        ]
    )

    delay_minutes: float = Field(default=0, ge=0)


class TruckUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    capacity: float | None = Field(default=None, gt=0)
    current_load: float | None = Field(default=None, ge=0)
    status: str | None = None
    supported_waste_types: list[str] | None = None
    delay_minutes: float | None = Field(default=None, ge=0)


def truck_to_dict(truck):
    return {
        "id": truck.id,
        "truck_id": truck.truck_id,
        "name": truck.name,
        "latitude": truck.latitude,
        "longitude": truck.longitude,
        "capacity": truck.capacity,
        "current_load": truck.current_load,
        "remaining_capacity": round(
            truck.capacity - truck.current_load, 2
        ),
        "status": truck.status,
        "supported_waste_types": [
            value.strip()
            for value in truck.supported_waste_types.split(",")
            if value.strip()
        ],
        "delay_minutes": truck.delay_minutes,
    }


def validate_truck_values(
    capacity,
    current_load,
    status,
    supported_waste_types,
):
    if current_load > capacity:
        raise HTTPException(
            status_code=422,
            detail="Current load cannot exceed truck capacity.",
        )

    normalized_status = status.strip().lower()

    if normalized_status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Invalid truck status.",
                "allowed_statuses": sorted(ALLOWED_STATUSES),
            },
        )

    if not supported_waste_types:
        raise HTTPException(
            status_code=422,
            detail="At least one supported waste type is required.",
        )

    return normalized_status


@router.get("/")
def list_trucks(db: Session = Depends(get_db)):
    trucks = db.query(Truck).order_by(Truck.truck_id.asc()).all()
    return [truck_to_dict(truck) for truck in trucks]


@router.post("/", status_code=201)
def create_truck(
    payload: TruckCreate,
    db: Session = Depends(get_db),
):
    capacity = payload.capacity
    current_load = payload.current_load

    status = validate_truck_values(
        capacity,
        current_load,
        payload.status,
        payload.supported_waste_types,
    )

    waste_types = sorted({
        value.strip().lower()
        for value in payload.supported_waste_types
        if value.strip()
    })

    truck = Truck(
        truck_id=payload.truck_id.strip(),
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        capacity=capacity,
        current_load=current_load,
        status=status,
        supported_waste_types=",".join(waste_types),
        delay_minutes=payload.delay_minutes,
    )

    db.add(truck)

    try:
        db.commit()
        db.refresh(truck)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A truck with this truck_id already exists.",
        )

    return truck_to_dict(truck)


@router.patch("/{truck_id}")
def update_truck(
    truck_id: str,
    payload: TruckUpdate,
    db: Session = Depends(get_db),
):
    truck = db.query(Truck).filter(
        Truck.truck_id == truck_id
    ).first()

    if truck is None:
        raise HTTPException(status_code=404, detail="Truck not found.")

    changes = payload.model_dump(exclude_unset=True)

    for key in ("latitude", "longitude", "capacity",
                "current_load", "delay_minutes"):
        if key in changes and changes[key] is None:
            raise HTTPException(
                status_code=422,
                detail=f"{key} cannot be null.",
            )

    new_capacity = changes.get("capacity", truck.capacity)
    new_load = changes.get("current_load", truck.current_load)

    if new_load > new_capacity:
        raise HTTPException(
            status_code=422,
            detail="Current load cannot exceed truck capacity.",
        )

    new_status = changes.get("status", truck.status)

    new_waste_types = changes.get(
        "supported_waste_types",
        [
            value.strip()
            for value in truck.supported_waste_types.split(",")
            if value.strip()
        ],
    )

    normalized_status = validate_truck_values(
        new_capacity,
        new_load,
        new_status,
        new_waste_types,
    )

    for key, value in changes.items():
        if key == "supported_waste_types":
            value = ",".join(sorted({
                item.strip().lower()
                for item in value
                if item.strip()
            }))
        elif key == "status":
            value = normalized_status

        setattr(truck, key, value)

    db.commit()
    db.refresh(truck)

    return truck_to_dict(truck)

