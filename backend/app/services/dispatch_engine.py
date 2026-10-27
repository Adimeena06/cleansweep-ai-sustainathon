from math import radians, sin, cos, asin, sqrt


def distance_km(lat1, lon1, lat2, lon2):
    """Calculate approximate straight-line distance using the Haversine formula."""
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    value = (
        sin(dlat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    )

    return 6371 * 2 * asin(sqrt(max(0, min(1, value))))


def recommend_truck(complaint, trucks):
    """
    Recommend an available truck using distance, current load and delay.
    Coordinates and capacity values must be supplied by the caller.
    """

    required_capacity = float(complaint.get("required_capacity", 0))
    candidates = []

    for truck in trucks:
        if str(truck.get("status", "")).lower() != "available":
            continue

        try:
            truck_lat = float(truck["latitude"])
            truck_lon = float(truck["longitude"])
            complaint_lat = float(complaint["latitude"])
            complaint_lon = float(complaint["longitude"])

            capacity = float(truck["capacity"])
            current_load = float(truck.get("current_load", 0))
            delay = max(0, float(truck.get("delay_minutes", 0)))
        except (KeyError, TypeError, ValueError):
            continue

        if capacity <= 0 or current_load < 0 or current_load > capacity:
            continue

        remaining_capacity = capacity - current_load

        if remaining_capacity < required_capacity:
            continue

        distance = distance_km(
            truck_lat, truck_lon, complaint_lat, complaint_lon
        )

        distance_score = min(100, distance / 20 * 100)
        load_score = current_load / capacity * 100
        delay_score = min(100, delay / 60 * 100)

        assignment_score = (
            0.60 * distance_score
            + 0.25 * load_score
            + 0.15 * delay_score
        )

        candidates.append({
            "truck_id": truck["truck_id"],
            "distance_km": round(distance, 2),
            "remaining_capacity": round(remaining_capacity, 2),
            "assignment_score": round(assignment_score, 2),
        })

    candidates.sort(key=lambda item: item["assignment_score"])

    if not candidates:
        return {
            "assigned": False,
            "message": "No suitable available truck found.",
            "recommendation": None,
            "alternatives": [],
        }

    return {
        "assigned": False,
        "message": "Truck recommendation generated. Admin approval required.",
        "recommendation": candidates[0],
        "alternatives": candidates[1:],
    }
