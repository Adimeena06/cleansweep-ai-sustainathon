
def calculate_priority(report):
    severity_scores = {
        "low": 20,
        "medium": 45,
        "high": 75,
        "critical": 100,
    }

    severity = str(report.get("severity", "medium")).strip().lower()
    severity_score = severity_scores.get(severity, 45)

    health_risk = max(
        0, min(100, float(report.get("health_risk", 30)))
    )
    waiting_score = max(
        0, min(100, float(report.get("waiting_score", 0)))
    )
    cluster_score = max(
        0, min(100, float(report.get("cluster_score", 0)))
    )

    # Weather risk: 0 under normal conditions, up to 100 in emergencies.
    weather_risk = max(
        0, min(100, float(report.get("weather_risk", 0)))
    )

    calculated_score = (
        0.35 * severity_score
        + 0.25 * health_risk
        + 0.15 * waiting_score
        + 0.10 * cluster_score
        + 0.15 * weather_risk
    )

    # Preserve the existing minimum priority determined by severity.
    priority_score = max(severity_score, calculated_score)
    priority_score = min(100, priority_score)

    priority_level = (
        "Critical" if priority_score >= 85 else
        "High" if priority_score >= 65 else
        "Medium" if priority_score >= 40 else
        "Low"
    )

    return {
        "priority_score": round(priority_score, 2),
        "priority_level": priority_level,
        "weather_risk": round(weather_risk, 2),
    }
