from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class WasteReport(Base):
    __tablename__ = "waste_reports"

    id = Column(Integer, primary_key=True, index=True)

    citizen_name = Column(String(120), nullable=True)
    citizen_id = Column(String(120), nullable=True)
    

    title = Column(
        String(200),
        nullable=False,
        default="Waste reported",
    )
    description = Column(Text, nullable=True)
    location = Column(String(500), nullable=False)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    severity = Column(
        String(30),
        nullable=False,
        default="medium",
    )
    status = Column(
        String(40),
        nullable=False,
        default="Submitted",
        index=True,
    )

    image_url = Column(String(500), nullable=True)
    annotated_image_url = Column(String(500), nullable=True)

    waste_type = Column(String(120), nullable=True)
    ai_confidence = Column(Float, nullable=True)
    detection_count = Column(Integer, nullable=False, default=0)

    assigned_truck = Column(String(120), nullable=True)
    clean_points = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class Truck(Base):
    __tablename__ = "trucks"

    id = Column(Integer, primary_key=True, index=True)

    truck_id = Column(
        String(120),
        unique=True,
        nullable=False,
        index=True,
    )
    name = Column(String(120), nullable=True)
    driver_phone = Column(String(20), nullable=True)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    capacity = Column(Float, nullable=False)
    current_load = Column(Float, nullable=False, default=0)

    status = Column(
        String(40),
        nullable=False,
        default="available",
        index=True,
    )

    supported_waste_types = Column(
        Text,
        nullable=False,
        default="plastic,paper_cardboard,metal,glass,mixed",
    )

    delay_minutes = Column(Float, nullable=False, default=0)


class WasteCompletion(Base):
    """Stores proof of completed waste-cleaning jobs."""

    __tablename__ = "waste_completions"

    id = Column(Integer, primary_key=True, index=True)

    report_id = Column(
        Integer,
        ForeignKey("waste_reports.id"),
        nullable=False,
        index=True,
    )

    truck_id = Column(
        String(120),
        nullable=False,
        index=True,
    )

    after_image_url = Column(
        String(500),
        nullable=False,
    )

    completed_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )