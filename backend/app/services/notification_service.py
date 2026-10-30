
from urllib.parse import quote


def create_assignment_whatsapp_link(report, truck):
    """
    Generate a WhatsApp click-to-chat link for the assigned truck driver.
    No Twilio, API account, or paid messaging service is required.
    """

    phone = str(getattr(truck, "driver_phone", "") or "")
    phone = "".join(char for char in phone if char.isdigit())

    if not phone:
        return {
            "success": False,
            "message": "No phone number registered for this truck driver.",
            "whatsapp_link": None,
        }

    # Indian numbers are stored as 10 digits in the current truck data.
    if len(phone) == 10:
        phone = "91" + phone

    waste_type = getattr(report, "waste_type", "Unknown")
    severity = getattr(report, "severity", "Unknown")
    report_id = getattr(report, "id", "N/A")

    latitude = getattr(report, "latitude", None)
    longitude = getattr(report, "longitude", None)

    location = (
        f"https://www.google.com/maps?q={latitude},{longitude}"
        if latitude is not None and longitude is not None
        else "GPS location unavailable"
    )

    message = (
        "🚛 *CleanSweep AI — New Waste Collection Assignment*\n\n"
        f"Report ID: {report_id}\n"
        f"Truck: {getattr(truck, 'truck_id', 'N/A')}\n"
        f"Waste Type: {waste_type}\n"
        f"Severity: {severity}\n"
        f"Location: {location}\n\n"
        "Please review the location and proceed with collection."
    )

    link = f"https://wa.me/{phone}?text={quote(message)}"

    return {
        "success": True,
        "message": "WhatsApp link generated successfully.",
        "whatsapp_link": link,
        "phone": phone,
    }

