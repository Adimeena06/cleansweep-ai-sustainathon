from math import radians, sin, cos, sqrt, atan2

from app.models import Truck
from app.models import Truck
from app.services.notification_service import (
    create_assignment_whatsapp_link,
)


def calculate_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the distance between two GPS coordinates in kilometres.
    Uses the Haversine formula.
    """

    earth_radius_km = 6371.0

    lat1 = radians(float(lat1))
    lon1 = radians(float(lon1))
    lat2 = radians(float(lat2))
    lon2 = radians(float(lon2))

    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1

    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1)
        * cos(lat2)
        * sin(delta_lon / 2) ** 2
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return earth_radius_km * c


def normalize_waste_type(waste_type):
    """
    Convert waste labels into a consistent format
    for comparison with truck-supported waste types.
    """

    if not waste_type:
        return "mixed"

    waste_type = (
        str(waste_type)
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )

    aliases = {
        "paper": "paper_cardboard",
        "cardboard": "paper_cardboard",
        "paper_and_cardboard": "paper_cardboard",
        "organic": "mixed",
        "general": "mixed",
        "general_waste": "mixed",
        "e_waste": "mixed",
        "electronic_waste": "mixed",
    }

    return aliases.get(waste_type, waste_type)


def truck_supports_waste(truck, waste_type):
    """
    Check whether a truck supports the detected waste category.
    """

    supported_types = getattr(
        truck,
        "supported_waste_types",
        None,
    )

    if not supported_types:
        return False

    if isinstance(supported_types, str):
        supported_types = [
            item.strip().lower()
            for item in supported_types.split(",")
            if item.strip()
        ]

    supported_types = {
        normalize_waste_type(item)
        for item in supported_types
    }

    normalized_type = normalize_waste_type(waste_type)

    return (
        normalized_type in supported_types
        or "all" in supported_types
        or "mixed" in supported_types
    )


def get_remaining_capacity(truck):
    """
    Calculate how much capacity remains on a truck.
    """

    capacity = float(getattr(truck, "capacity", 0) or 0)
    current_load = float(getattr(truck, "current_load", 0) or 0)

    return max(0, capacity - current_load)


def auto_assign_report(db, report):
    """
    Automatically assign a suitable available truck to a waste report.

    Requirements:
    - Report must have real GPS coordinates.
    - Truck must be available.
    - Truck must have valid GPS coordinates.
    - Truck must support the detected waste category.
    - Truck must have remaining capacity.

    Returns a dictionary describing the assignment result.
    """

    # Do not assign reports without genuine GPS coordinates.
    if report.latitude is None or report.longitude is None:
        return {
            "assigned": False,
            "message": (
                "GPS coordinates are missing. "
                "The report requires a valid location."
            ),
            "truck_id": None,
        }

    try:
        report_lat = float(report.latitude)
        report_lon = float(report.longitude)

        if not (
            -90 <= report_lat <= 90
            and -180 <= report_lon <= 180
        ):
            raise ValueError("Invalid GPS coordinates")

    except (TypeError, ValueError):
        return {
            "assigned": False,
            "message": "The report contains invalid GPS coordinates.",
            "truck_id": None,
        }

    # Avoid assigning the same report twice.
    if getattr(report, "assigned_truck", None):
        return {
            "assigned": True,
            "message": "A truck is already assigned to this report.",
            "truck_id": report.assigned_truck,
        }

    waste_type = getattr(report, "waste_type", None)

    # Retrieve existing trucks without deleting or modifying any records.
    trucks = db.query(Truck).all()

    candidates = []

    for truck in trucks:
        truck_status = str(
            getattr(truck, "status", "")
        ).strip().lower()

        if truck_status != "available":
            continue

        # Ignore trucks without valid coordinates.
        if truck.latitude is None or truck.longitude is None:
            continue

        try:
            truck_lat = float(truck.latitude)
            truck_lon = float(truck.longitude)

            if not (
                -90 <= truck_lat <= 90
                and -180 <= truck_lon <= 180
            ):
                continue

        except (TypeError, ValueError):
            continue

        # Ensure the truck can carry the detected waste category.
        if not truck_supports_waste(truck, waste_type):
            continue

        # Ensure the truck has remaining capacity.
        remaining_capacity = get_remaining_capacity(truck)

        if remaining_capacity <= 0:
            continue

        distance_km = calculate_distance(
            report_lat,
            report_lon,
            truck_lat,
            truck_lon,
        )

        delay_minutes = float(
            getattr(truck, "delay_minutes", 0) or 0
        )

        # Lower score means a more suitable truck.
        score = (
            distance_km
            + (delay_minutes * 0.05)
            + (
                (float(truck.current_load or 0)
                 / max(float(truck.capacity or 1), 1))
                * 5
            )
        )

        candidates.append({
            "truck": truck,
            "distance_km": distance_km,
            "remaining_capacity": remaining_capacity,
            "score": score,
        })

    if not candidates:
        return {
            "assigned": False,
            "message": (
                "No suitable available truck was found. "
                "The report remains available for admin review."
            ),
            "truck_id": None,
        }

    # Choose the candidate with the lowest score.
    candidates.sort(key=lambda item: item["score"])

    selected = candidates[0]
    selected_truck = selected["truck"]

    # Update the existing report and truck records.
    report.assigned_truck = selected_truck.truck_id
    report.status = "Assigned"

    selected_truck.status = "busy"

    # Commit is intentionally left to the calling API endpoint.
    # This lets the report and assignment be saved together.

    return {
        "assigned": True,
        "message": "A suitable truck has been assigned automatically.",
        "truck_id": selected_truck.truck_id,
        "distance_km": round(selected["distance_km"], 2),
        "remaining_capacity": selected["remaining_capacity"],
    }