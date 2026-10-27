from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ReportCreate(BaseModel):
    citizen_name: Optional[str] = None
    citizen_id: Optional[str] = None

    title: str = Field(default="Waste reported", max_length=200)
    description: Optional[str] = None

    location: str = Field(min_length=1, max_length=500)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    severity: str = "medium"

    image_url: Optional[str] = None
    annotated_image_url: Optional[str] = None

    waste_type: Optional[str] = None
    ai_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    detection_count: int = Field(default=0, ge=0)


class ReportStatusUpdate(BaseModel):
    status: str


class ReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    citizen_name: Optional[str] = None
    citizen_id: Optional[str] = None

    title: str
    description: Optional[str] = None
    location: str

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    severity: str
    status: str

    image_url: Optional[str] = None
    annotated_image_url: Optional[str] = None

    waste_type: Optional[str] = None
    ai_confidence: Optional[float] = None
    detection_count: int

    assigned_truck: Optional[str] = None
    clean_points: int

    created_at: datetime
    updated_at: datetime
