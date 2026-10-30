from app.routers import priority

import os
from app.routers import driver
from pathlib import Path
from app.database import Base, engine
from app import models
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import waste, reports, dispatch, weather, trucks

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="CleanSweep AI API",
    description="AI-Powered Smart Waste Management and Dispatch Engine",
    version="1.0.0",
)
Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads",
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "CleanSweep AI Backend",
    }


app.include_router(waste.router, prefix="/api/waste", tags=["Waste Detection"])
app.include_router(reports.router, prefix="/api/reports", tags=["Waste Reports"])
app.include_router(dispatch.router, prefix="/api/dispatch", tags=["Truck Dispatch"])
app.include_router(weather.router, prefix="/api/weather", tags=["Weather"])
app.include_router(
    trucks.router,
    prefix="/api/trucks",
    tags=["Truck Fleet"],
)

app.include_router(priority.router, prefix="/api/priority", tags=["Smart Priority"])
app.include_router(driver.router)

