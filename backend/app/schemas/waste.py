from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def waste_status():
    return {"message": "Waste detection API ready"}