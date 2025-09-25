from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import Response

from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Tuple
from io import BytesIO
from functools import lru_cache

import uuid
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Load rhymes data
with open(ROOT_DIR / "rhymes.json", "r") as f:
    RHYMES_DATA = json.load(f)


def generate_rhyme_svg(rhyme_code: str) -> str:
    """Create SVG markup for a rhyme card.

    This helper centralizes the SVG generation so that both the API endpoint
    returning individual SVGs and the binder export can share the same layout.
    """

    if rhyme_code not in RHYMES_DATA:
        raise KeyError("Rhyme not found")

    rhyme_name = RHYMES_DATA[rhyme_code][0]

    return f"""
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#grad1)" rx="15"/>
        <text x="200" y="100" font-family="Arial, sans-serif" font-size="16" font-weight="bold"
              text-anchor="middle" fill="white">{rhyme_name}</text>
        <text x="200" y="130" font-family="Arial, sans-serif" font-size="12"
              text-anchor="middle" fill="white">Code: {rhyme_code}</text>
        <text x="200" y="160" font-family="Arial, sans-serif" font-size="12"
              text-anchor="middle" fill="white">Pages: {RHYMES_DATA[rhyme_code][1]}</text>
        <circle cx="200" cy="220" r="30" fill="rgba(255,255,255,0.3)" stroke="white" stroke-width="2"/>
        <text x="200" y="225" font-family="Arial, sans-serif" font-size="20"
              text-anchor="middle" fill="white">♪</text>
    </svg>
    """


app = FastAPI()


class PDFDependencyUnavailableError(RuntimeError):
      """Raised when the core PDF toolchain cannot be imported at runtime."""
    


@lru_cache(maxsize=1)
def _load_pdf_dependencies() -> Tuple[Any, Any, Tuple[float, float], Any]:

    """Dynamically import heavy PDF dependencies when needed.

    Importing CairoSVG/ReportLab at module import time can crash the entire
    application when optional system libraries (for example ``libcairo``) are
    missing. By delaying the import until the binder endpoint is actually
    requested we prevent authentication and other unrelated endpoints from
    failing with a 502 Bad Gateway.


    Returns a tuple containing the ``svg2png`` callable (``None`` when CairoSVG
    is unavailable), the ReportLab ``Canvas`` class, the default ``letter`` page
    size and the ``ImageReader`` helper (also ``None`` without CairoSVG).
    """

    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas as pdf_canvas
    except (ImportError, OSError) as exc:
        logging.getLogger(__name__).error(
            "ReportLab dependency could not be loaded for PDF generation: %s", exc
        )
        raise PDFDependencyUnavailableError(
            "PDF generation is temporarily unavailable because ReportLab is missing. "
            "Please contact the administrator to install the required dependencies."
        ) from exc

    svg2png = None
    image_reader: Optional[Any] = None

    try:
        from cairosvg import svg2png as _svg2png  # type: ignore
        from reportlab.lib.utils import ImageReader as _ImageReader
    except (ImportError, OSError) as exc:
        logging.getLogger(__name__).warning(
            "CairoSVG is not available. Falling back to a simplified text-only "
            "PDF layout. Error: %s",
            exc,
        )
    else:
        svg2png = _svg2png
        image_reader = _ImageReader

    return svg2png, pdf_canvas.Canvas, letter, image_reader

   

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Models
class School(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    school_id: str
    school_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SchoolCreate(BaseModel):
    school_id: str
    school_name: str


class RhymeSelection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    school_id: str
    grade: str
    page_index: int  # Changed from position to page_index for carousel
    rhyme_code: str
    rhyme_name: str
    pages: float
    position: str = "top"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class RhymeSelectionCreate(BaseModel):
    school_id: str
    grade: str
    page_index: int
    rhyme_code: str
    position: Optional[str] = None


class GradeStatus(BaseModel):
    grade: str
    selected_count: int
    total_available: int


class RhymeSelectionDetail(BaseModel):
    id: Optional[str] = None
    page_index: int
    rhyme_code: str
    rhyme_name: str
    pages: float
    position: Optional[str] = None
    timestamp: Optional[datetime] = None


class SchoolWithSelections(School):
    total_selections: int = 0
    last_updated: Optional[datetime] = None
    grades: Dict[str, List[RhymeSelectionDetail]] = Field(default_factory=dict)


# Authentication endpoints
@api_router.post("/auth/login", response_model=School)
async def login_school(input: SchoolCreate):
    # Check if school already exists
    existing_school = await db.schools.find_one({"school_id": input.school_id})

    if existing_school:
        return School(**existing_school)

    # Create new school entry
    school_dict = input.dict()
    school_obj = School(**school_dict)
    await db.schools.insert_one(school_obj.dict())
    return school_obj


# Rhymes data endpoints
@api_router.get("/rhymes")
async def get_all_rhymes():
    """Get all rhymes organized by pages"""
    rhymes_by_pages = {}

    for code, data in RHYMES_DATA.items():
        name, pages, personalized = data
        page_key = str(pages)

        if page_key not in rhymes_by_pages:
            rhymes_by_pages[page_key] = []

        rhymes_by_pages[page_key].append(
            {"code": code, "name": name, "pages": pages, "personalized": personalized}
        )

    return rhymes_by_pages


@api_router.get("/rhymes/available/{school_id}/{grade}")
async def get_available_rhymes(
    school_id: str, grade: str, include_selected: bool = False
):
    """Get available rhymes for a specific grade"""
    if not include_selected:
        # Get already selected rhymes for ALL grades in this school
        selected_rhymes = await db.rhyme_selections.find(
            {"school_id": school_id}
        ).to_list(None)

        selected_codes = {selection["rhyme_code"] for selection in selected_rhymes}
    else:
        selected_codes = set()

    # Get available rhymes organized by pages
    rhymes_by_pages = {}

    for code, data in RHYMES_DATA.items():
        if code not in selected_codes:  # Only include unselected rhymes
            name, pages, personalized = data
            page_key = str(pages)

            if page_key not in rhymes_by_pages:
                rhymes_by_pages[page_key] = []

            rhymes_by_pages[page_key].append(
                {
                    "code": code,
                    "name": name,
                    "pages": pages,
                    "personalized": personalized,
                }
            )

    return rhymes_by_pages


@api_router.get("/rhymes/selected/{school_id}")
async def get_selected_rhymes(school_id: str):
    """Get all selected rhymes for a school organized by grade"""
    selections = await db.rhyme_selections.find({"school_id": school_id}).to_list(None)

    result = {}
    for selection in selections:
        grade = selection["grade"]
        if grade not in result:
            result[grade] = []

        result[grade].append(
            {
                "page_index": selection["page_index"],
                "code": selection["rhyme_code"],
                "name": selection["rhyme_name"],
                "pages": selection["pages"],
                "position": selection.get("position"),
            }
        )

    # Sort by page_index
    for grade in result:
        result[grade].sort(key=lambda x: x["page_index"])

    return result


@api_router.get("/rhymes/selected/other-grades/{school_id}/{grade}")
async def get_selected_rhymes_other_grades(school_id: str, grade: str):
    """Get rhymes selected in other grades that can be reused"""
    selections = await db.rhyme_selections.find(
        {"school_id": school_id, "grade": {"$ne": grade}}  # Exclude current grade
    ).to_list(None)

    # Get unique rhymes from other grades
    selected_rhymes = {}
    for selection in selections:
        code = selection["rhyme_code"]
        if code not in selected_rhymes:
            selected_rhymes[code] = {
                "code": code,
                "name": selection["rhyme_name"],
                "pages": selection["pages"],
                "used_in_grades": [],
            }
        selected_rhymes[code]["used_in_grades"].append(selection["grade"])

    # Organize by pages
    rhymes_by_pages = {}
    for rhyme in selected_rhymes.values():
        page_key = str(rhyme["pages"])
        if page_key not in rhymes_by_pages:
            rhymes_by_pages[page_key] = []
        rhymes_by_pages[page_key].append(rhyme)

    return rhymes_by_pages


@api_router.post("/rhymes/select", response_model=RhymeSelection)
async def select_rhyme(input: RhymeSelectionCreate):
    """Select a rhyme for a specific grade and page index"""
    # Check if rhyme exists
    if input.rhyme_code not in RHYMES_DATA:
        raise HTTPException(status_code=404, detail="Rhyme not found")

    rhyme_data = RHYMES_DATA[input.rhyme_code]

    pages = float(rhyme_data[1])

    # Normalize position (half-page rhymes can occupy top or bottom)
    requested_position = (input.position or "").strip().lower()
    normalized_position = (
        "bottom" if pages == 0.5 and requested_position == "bottom" else "top"
    )

    page_query = {
        "school_id": input.school_id,
        "grade": input.grade,
        "page_index": input.page_index,
    }

    existing_selections = await db.rhyme_selections.find(page_query).to_list(None)

    for existing in existing_selections:
        existing_pages = float(existing.get("pages", 1))
        existing_position = (existing.get("position") or "top").lower()

        should_remove = False

        if pages > 0.5:
            # Full-page rhyme replaces everything on the page
            should_remove = True
        else:
            # Half-page rhymes should only replace conflicting entries
            if existing_pages > 0.5:
                should_remove = True
            elif existing_position == normalized_position:
                should_remove = True
            elif existing.get("position") is None and normalized_position == "top":
                # Legacy records without a stored position occupy the top slot
                should_remove = True

        if should_remove:
            await db.rhyme_selections.delete_one({"_id": existing["_id"]})

    # Create new selection
    selection_dict = input.dict()
    selection_dict.update(
        {"rhyme_name": rhyme_data[0], "pages": pages, "position": normalized_position}
    )

    selection_obj = RhymeSelection(**selection_dict)
    await db.rhyme_selections.insert_one(selection_obj.dict())

    return selection_obj


# @api_router.delete("/rhymes/remove/{school_id}/{grade}/{page_index}")
# async def remove_rhyme_selection(school_id: str, grade: str, page_index: int):
#     """Remove a rhyme selection for a specific page index"""
#     result = await db.rhyme_selections.delete_many({
#         "school_id": school_id,
#         "grade": grade,
#         "page_index": page_index
#     })

#     if result.deleted_count == 0:
#         raise HTTPException(status_code=404, detail="Selection not found")

#     return {"message": "Selection removed successfully"}


@api_router.delete("/rhymes/remove/{school_id}/{grade}/{page_index}/{position}")
async def remove_specific_rhyme_selection(
    school_id: str, grade: str, page_index: int, position: str
):
    """Remove a specific rhyme selection for a position (top/bottom)"""
    # Get all selections for this page
    selections = await db.rhyme_selections.find(
        {
            "school_id": school_id,
            "grade": grade,
            "page_index": page_index,
        }
    ).to_list(None)

    if not selections:
        # raise HTTPException(status_code=404, detail="No selections found for this page")
        return {"message": f"selection is removed"}

    # Find and remove the specific position rhyme
    target_position = position.lower()
    selection_to_remove = None

    for selection in selections:
        pages = float(selection.get("pages", 0))
        stored_position = (selection.get("position") or "top").lower()

        if pages > 0.5:
            if target_position == "top":
                selection_to_remove = selection
                break
        elif pages == 0.5:
            if stored_position == target_position:
                selection_to_remove = selection
                break
            if selection.get("position") is None and target_position == "top":
                selection_to_remove = selection
                break

    if not selection_to_remove:
        for selection in selections:
            if target_position == "top" and selection.get("pages") != 0.5:
                selection_to_remove = selection
                break
            if target_position == "bottom" and selection.get("pages") == 0.5:
                selection_to_remove = selection
                break

    if not selection_to_remove:
        raise HTTPException(
            status_code=404, detail="Selection not found for the specified position"
        )

    # Remove the selection
    result = await db.rhyme_selections.delete_one({"_id": selection_to_remove["_id"]})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Selection not found")

    return {"message": f"{position.capitalize()} selection removed successfully"}


@api_router.get("/rhymes/status/{school_id}")
async def get_grade_status(school_id: str):
    """Get selection status for all grades"""
    grades = ["nursery", "lkg", "ukg", "playgroup"]
    status = []

    for grade in grades:
        selections = await db.rhyme_selections.find(
            {"school_id": school_id, "grade": grade}
        ).to_list(None)

        selected_count = len(selections)

        status.append(
            {
                "grade": grade,
                "selected_count": selected_count,
                "total_available": 25,  # Maximum 25 rhymes can be selected
            }
        )

    return status


@api_router.get("/admin/schools", response_model=List[SchoolWithSelections])
async def get_all_schools_with_selections():
    """Return all schools with their rhyme selections grouped by grade."""
    school_docs = await db.schools.find().sort("timestamp", -1).to_list(None)

    if not school_docs:
        return []

    school_ids = [doc.get("school_id") for doc in school_docs if doc.get("school_id")]

    selection_docs = []
    if school_ids:
        selection_docs = await db.rhyme_selections.find(
            {"school_id": {"$in": school_ids}}
        ).to_list(None)

    selections_by_school: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    latest_selection_timestamp: Dict[str, datetime] = {}

    for selection in selection_docs:
        school_id = selection.get("school_id")
        grade = selection.get("grade")

        if not school_id or not grade:
            continue

        school_bucket = selections_by_school.setdefault(school_id, {})
        grade_bucket = school_bucket.setdefault(grade, [])
        grade_bucket.append(selection)

        timestamp = selection.get("timestamp")
        if timestamp:
            existing = latest_selection_timestamp.get(school_id)
            if not existing or timestamp > existing:
                latest_selection_timestamp[school_id] = timestamp

    def sort_key(selection: Dict[str, Any]):
        page_index = selection.get("page_index")
        try:
            normalized_page = int(page_index)
        except (TypeError, ValueError):
            normalized_page = 0

        position = (selection.get("position") or "top").strip().lower()
        position_weight = 1 if position == "bottom" else 0

        return (normalized_page, position_weight)

    schools_with_details: List[SchoolWithSelections] = []

    for doc in school_docs:
        school_id = doc.get("school_id")
        base_payload = {
            "id": doc.get("id"),
            "school_id": school_id,
            "school_name": doc.get("school_name"),
            "timestamp": doc.get("timestamp"),
        }

        grade_map: Dict[str, List[RhymeSelectionDetail]] = {}

        for grade, selections in selections_by_school.get(school_id, {}).items():
            sorted_selections = sorted(selections, key=sort_key)
            detailed_selections: List[RhymeSelectionDetail] = []

            for selection in sorted_selections:
                page_index_raw = selection.get("page_index", 0)
                try:
                    page_index = int(page_index_raw)
                except (TypeError, ValueError):
                    page_index = 0

                pages_raw = selection.get("pages", 0)
                try:
                    pages_value = float(pages_raw)
                except (TypeError, ValueError):
                    pages_value = 0.0

                detailed_selections.append(
                    RhymeSelectionDetail(
                        id=selection.get("id"),
                        page_index=page_index,
                        rhyme_code=selection.get("rhyme_code"),
                        rhyme_name=selection.get("rhyme_name"),
                        pages=pages_value,
                        position=selection.get("position"),
                        timestamp=selection.get("timestamp"),
                    )
                )

            grade_map[grade] = detailed_selections

        total_selections = sum(len(items) for items in grade_map.values())
        last_updated = latest_selection_timestamp.get(school_id) or doc.get("timestamp")

        schools_with_details.append(
            SchoolWithSelections(
                **base_payload,
                total_selections=total_selections,
                last_updated=last_updated,
                grades=grade_map,
            )
        )

    return schools_with_details


@api_router.delete("/admin/schools/{school_id}")
async def delete_school(school_id: str):
    """Delete a school and all of its rhyme selections."""
    school_result = await db.schools.delete_one({"school_id": school_id})
    selection_result = await db.rhyme_selections.delete_many({"school_id": school_id})

    if school_result.deleted_count == 0 and selection_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="School not found")

    return {
        "message": "School and associated rhymes removed successfully",
        "removed_school": school_result.deleted_count,
        "removed_selections": selection_result.deleted_count,
    }


@api_router.get("/rhymes/svg/{rhyme_code}")
async def get_rhyme_svg(rhyme_code: str):
    """Get SVG content for a rhyme (mock implementation)"""
    try:
        svg_content = generate_rhyme_svg(rhyme_code)
    except KeyError:
        raise HTTPException(status_code=404, detail="Rhyme not found")

    return Response(content=svg_content, media_type="image/svg+xml")


def _draw_text_only_rhyme(
    pdf_canvas: Any,
    entry: Dict[str, Any],
    page_width: float,
    page_height: float,
    y_offset: float = 0,
) -> None:
    """Render a simple fallback card when CairoSVG is unavailable."""

    rhyme_code = entry.get("rhyme_code", "")
    rhyme_info = RHYMES_DATA.get(rhyme_code)

    rhyme_name = entry.get("rhyme_name") or (rhyme_info[0] if rhyme_info else rhyme_code)
    pages_value = entry.get("pages")
    if pages_value is None and rhyme_info:
        pages_value = rhyme_info[1]

    padding = 36
    rect_x = padding
    rect_y = y_offset + padding
    rect_width = page_width - padding * 2
    rect_height = page_height - padding * 2

    pdf_canvas.setFillColorRGB(0.9, 0.9, 0.92)
    pdf_canvas.roundRect(rect_x, rect_y, rect_width, rect_height, 12, stroke=0, fill=1)

    pdf_canvas.setFillColorRGB(0.2, 0.2, 0.25)
    pdf_canvas.setFont("Helvetica-Bold", 18)
    pdf_canvas.drawCentredString(
        page_width / 2,
        rect_y + rect_height - 36,
        rhyme_name,
    )

    pdf_canvas.setFont("Helvetica", 12)
    pdf_canvas.drawCentredString(
        page_width / 2,
        rect_y + rect_height - 60,
        f"Code: {rhyme_code}",
    )

    if pages_value is not None:
        pdf_canvas.drawCentredString(
            page_width / 2,
            rect_y + rect_height - 80,
            f"Pages: {pages_value}",
        )

    pdf_canvas.setFont("Helvetica-Oblique", 10)
    pdf_canvas.setFillColorRGB(0.35, 0.35, 0.4)
    pdf_canvas.drawCentredString(
        page_width / 2,
        rect_y + 20,
        "Rendered without SVG assets. Install CairoSVG for enhanced visuals.",
    )


@api_router.get("/rhymes/binder/{school_id}/{grade}")
async def download_rhyme_binder(school_id: str, grade: str):
    """Generate a PDF binder containing all rhymes for the specified grade."""

    try:
        svg2png, Canvas, letter, ImageReader = _load_pdf_dependencies()
    except PDFDependencyUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    selections = await db.rhyme_selections.find(
        {
            "school_id": school_id,
            "grade": grade,
        }
    ).to_list(None)

    if not selections:
        raise HTTPException(status_code=404, detail="No rhymes selected for this grade")

    pages_map: Dict[int, List[Dict[str, Any]]] = {}

    for selection in selections:
        page_index = int(selection.get("page_index", 0))
        pages_map.setdefault(page_index, []).append(selection)

    buffer = BytesIO()
    pdf_canvas = Canvas(buffer, pagesize=letter)
    page_width, page_height = letter

    for page_index in sorted(pages_map.keys()):
        entries = pages_map[page_index]
        # Sort so that "top" entries are rendered before "bottom"
        entries.sort(
            key=lambda item: (
                1 if (item.get("position") or "top").lower() == "bottom" else 0
            )
        )

        full_page_entry = next(
            (item for item in entries if float(item.get("pages", 1)) > 0.5), None
        )

        if full_page_entry:
            if svg2png and ImageReader:
                try:
                    svg_markup = generate_rhyme_svg(full_page_entry["rhyme_code"])
                except KeyError:
                    pass
                else:
                    image_buffer = BytesIO()
                    svg2png(
                        bytestring=svg_markup.encode("utf-8"),
                        write_to=image_buffer,
                        output_width=int(page_width),
                        output_height=int(page_height),
                    )
                    image_buffer.seek(0)
                    pdf_canvas.drawImage(
                        ImageReader(image_buffer),
                        0,
                        0,
                        width=page_width,
                        height=page_height,
                    )
                    pdf_canvas.showPage()
                    continue

            _draw_text_only_rhyme(pdf_canvas, full_page_entry, page_width, page_height)
        else:
            slot_height = page_height / 2
            positioned_entries: Dict[str, Optional[Dict[str, Any]]] = {
                "top": None,
                "bottom": None,
            }

            for entry in entries:
                position = (entry.get("position") or "top").lower()
                if position not in positioned_entries:
                    position = "top"
                if positioned_entries[position] is None:
                    positioned_entries[position] = entry

            for position, entry in positioned_entries.items():
                if not entry:
                    continue

                if svg2png and ImageReader:
                    try:
                        svg_markup = generate_rhyme_svg(entry["rhyme_code"])
                    except KeyError:
                        continue

                    image_buffer = BytesIO()
                    svg2png(
                        bytestring=svg_markup.encode("utf-8"),
                        write_to=image_buffer,
                        output_width=int(page_width),
                        output_height=int(slot_height),
                    )
                    image_buffer.seek(0)

                    y_position = page_height - slot_height if position == "top" else 0
                    pdf_canvas.drawImage(
                        ImageReader(image_buffer),
                        0,
                        y_position,
                        width=page_width,
                        height=slot_height,
                    )
                else:
                    y_position = page_height - slot_height if position == "top" else 0
                    _draw_text_only_rhyme(
                        pdf_canvas,
                        entry,
                        page_width,
                        slot_height,
                        y_offset=y_position,
                    )

        pdf_canvas.showPage()

    pdf_canvas.save()
    buffer.seek(0)

    filename = f"{grade}_rhyme_binder.pdf"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}

    return Response(
        content=buffer.getvalue(), media_type="application/pdf", headers=headers
    )


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
