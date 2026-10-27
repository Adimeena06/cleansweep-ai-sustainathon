
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from json import loads
from fastapi import APIRouter, HTTPException

router = APIRouter()

# Greater Noida — change these coordinates for another city.
LATITUDE = 28.4744
LONGITUDE = 77.5040

WEATHER_URL = (
    "https://api.open-meteo.com/v1/forecast"
    f"?latitude={LATITUDE}&longitude={LONGITUDE}"
    "&current=temperature_2m,relative_humidity_2m,"
    "precipitation,rain,wind_speed_10m,weather_code"
    "&hourly=precipitation_probability"
    "&forecast_days=1&timezone=Asia%2FKolkata"
)


def classify_weather(current):
    rain = float(current.get("rain") or 0)
    wind = float(current.get("wind_speed_10m") or 0)
    temperature = float(current.get("temperature_2m") or 0)

    alerts = []

    if rain >= 15:
        alerts.append({
            "type": "heavy_rain",
            "severity": "high",
            "message": "Heavy rainfall threshold reached. Review drain blockage and flooding reports."
        })
    elif rain >= 7.5:
        alerts.append({
            "type": "rain",
            "severity": "moderate",
            "message": "Elevated rainfall. Monitor drainage and waste collection."
        })

    if wind >= 50:
        alerts.append({
            "type": "strong_wind",
            "severity": "high",
            "message": "Strong winds detected. Review exposed waste and collection safety."
        })

    if temperature >= 40:
        alerts.append({
            "type": "extreme_heat",
            "severity": "high",
            "message": "Extreme heat. Review worker safety and urgent waste accumulation."
        })

    return {
        "emergency": any(a["severity"] == "high" for a in alerts),
        "alerts": alerts
    }


@router.get("/")
def weather_status():
    """Fetch current weather and evaluate configurable emergency thresholds."""
    try:
        request = Request(
            WEATHER_URL,
            headers={"User-Agent": "CleanSweepAI/1.0"}
        )

        with urlopen(request, timeout=8) as response:
            data = loads(response.read().decode("utf-8"))

        current = data.get("current", {})
        result = classify_weather(current)

        return {
            "source": "Open-Meteo",
            "mode": "live",
            "location": "Greater Noida, Uttar Pradesh",
            "coordinates": {
                "latitude": LATITUDE,
                "longitude": LONGITUDE
            },
            "observed_at": current.get("time"),
            "temperature_c": current.get("temperature_2m"),
            "humidity_percent": current.get("relative_humidity_2m"),
            "rain_mm": current.get("rain"),
            "precipitation_mm": current.get("precipitation"),
            "wind_speed_kmh": current.get("wind_speed_10m"),
            "weather_code": current.get("weather_code"),
            **result
        }

    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Live weather is temporarily unavailable: {exc}"
        )


@router.post("/demo")
def simulate_weather_emergency():
    """Return a clearly labelled simulated emergency for demonstrations."""
    simulated_weather = {
        "temperature_2m": 22,
        "relative_humidity_2m": 95,
        "precipitation": 38,
        "rain": 38,
        "wind_speed_10m": 25,
        "weather_code": 65
    }

    result = classify_weather(simulated_weather)

    return {
        "source": "CleanSweep AI simulator",
        "mode": "demo",
        "simulated": True,
        "location": "Greater Noida, Uttar Pradesh",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "temperature_c": simulated_weather["temperature_2m"],
        "humidity_percent": simulated_weather["relative_humidity_2m"],
        "rain_mm": simulated_weather["rain"],
        "wind_speed_kmh": simulated_weather["wind_speed_10m"],
        "emergency": True,
        "alerts": [{
            "type": "simulated_heavy_rain",
            "severity": "high",
            "message": (
                "DEMO EMERGENCY: Simulated heavy rainfall. "
                "Prioritize drain-blockage and flooding reports "
                "for operator review."
            )
        }],
        "dispatch_action": "Recommend review only; no truck was dispatched."
    }

