
from __future__ import annotations

import logging
import os
import sys
import tempfile
import uuid
from datetime import datetime
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path, PureWindowsPath
from typing import Any, Callable, Dict, Iterable, List, Literal, Optional, Set, Tuple

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware


if __package__ in {None, ""}:
    # Allow ``python backend/server.py`` to work by ensuring the project root is
    # on ``sys.path`` before importing the package modules.
    current_dir = Path(__file__).resolve().parent
    project_root = current_dir.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    from backend.app import config, rhymes, svg_processing  # type: ignore
    from backend.app.svg_processing import SvgDocument as _SvgDocument  # type: ignore
else:  # pragma: no cover - exercised only during normal package imports
    from .app import config, rhymes, svg_processing
    from .app.svg_processing import SvgDocument as _SvgDocument

logger = logging.getLogger(__name__)

ROOT_DIR = config.ROOT_DIR
RHYME_SVG_BASE_PATH = config.RHYME_SVG_BASE_PATH
COVER_SVG_BASE_PATH = config.resolve_cover_svg_base_path()

RHYMES_DATA = rhymes.RHYMES_DATA
generate_rhyme_svg = rhymes.generate_rhyme_svg

_sanitize_svg_for_svglib = svg_processing.sanitize_svg_for_svglib
_svg_requires_raster_backend = svg_processing.svg_requires_raster_backend
_build_cover_asset_manifest = svg_processing.build_cover_asset_manifest
_localize_svg_image_assets = svg_processing.localize_svg_image_assets


def _ensure_image_cache_dir() -> Path:
    return svg_processing.ensure_image_cache_dir(config.IMAGE_CACHE_DIR)


def _resolve_rhyme_svg_path(rhyme_code: str) -> Optional[Path]:
    return svg_processing.resolve_rhyme_svg_path(RHYME_SVG_BASE_PATH, rhyme_code)


def _ensure_cover_assets_base_path() -> Path:
    return config.ensure_cover_assets_base_path(COVER_SVG_BASE_PATH)


def _get_cover_assets_unc_base_path() -> PureWindowsPath:
    try:
        return config.get_cover_unc_base_path()
    except ValueError as exc:
        logger.error("COVER_SVG_BASE_PATH is not configured: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "COVER_SVG_BASE_PATH is not configured on the server. "
                "Please set it to the network directory containing the cover SVG files."
            ),
        ) from exc


def _load_rhyme_svg_markup(rhyme_code: str) -> _SvgDocument:
    return svg_processing.load_rhyme_svg_markup(
        rhyme_code, RHYME_SVG_BASE_PATH, fallback_factory=generate_rhyme_svg
    )


def _normalize_cors_origin(origin: str) -> Optional[str]:
    return config._normalize_cors_origin(origin)


def _parse_csv(value: Optional[str], *, default: Optional[List[str]] = None) -> List[str]:
    return config._parse_csv(value, default=default)

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_parse_csv(os.environ.get("CORS_ORIGINS"), default=["*"]),
    allow_methods=["*"],
    allow_headers=["*"],
)


class PDFDependencyUnavailableError(RuntimeError):
      """Raised when the core PDF toolchain cannot be imported at runtime."""
    



@dataclass(frozen=True)
class _SvgBackend:
    """Container describing how SVG assets should be rendered on the PDF canvas."""

    mode: Literal["cairosvg", "svglib", "hybrid", "none"]
    svg2png: Optional[Callable[..., Any]]
    image_reader: Optional[Any]
    svg2rlg: Optional[Callable[..., Any]]
    render_pdf: Optional[Any]


@dataclass(frozen=True)
class _PdfResources:
    """Return value for :func:`_load_pdf_dependencies`."""

    canvas_factory: Any
    page_size: Tuple[float, float]
    svg_backend: _SvgBackend


@lru_cache(maxsize=1)
def _load_pdf_dependencies() -> _PdfResources:

    """Dynamically import heavy PDF dependencies when needed.

    Importing CairoSVG/ReportLab at module import time can crash the entire
    application when optional system libraries (for example ``libcairo``) are
    missing. By delaying the import until the binder endpoint is actually
    requested we prevent authentication and other unrelated endpoints from
    failing with a 502 Bad Gateway.


    Returns a :class:`_PdfResources` instance describing the configured PDF
    canvas factory, page size and SVG rendering backend. When CairoSVG is not
    available the function now attempts to fall back to ``svglib`` before
    degrading to the text-only layout.
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

    svg_backend = _SvgBackend("none", None, None, None, None)

    svg2rlg: Optional[Callable[..., Any]] = None
    render_pdf: Optional[Any] = None

    try:
        from svglib.svglib import svg2rlg as _svg2rlg  # type: ignore
        from reportlab.graphics import renderPDF as _renderPDF
    except (ImportError, OSError) as svg_exc:
        logging.getLogger(__name__).warning(
            "svglib could not be imported. Binder PDFs will fall back to raster rendering when necessary. "
            "Error: %s",
            svg_exc,
        )
    else:
        svg2rlg = _svg2rlg
        render_pdf = _renderPDF
        svg_backend = _SvgBackend("svglib", None, None, svg2rlg, render_pdf)

    try:
        from cairosvg import svg2png as _svg2png  # type: ignore
        from reportlab.lib.utils import ImageReader as _ImageReader
    except (ImportError, OSError) as exc:
        if svg2rlg is None:
            logging.getLogger(__name__).warning(
                "CairoSVG is not available and svglib is missing. Binder PDFs will use the text-only layout. "
                "Error: %s",
                exc,
            )
    else:
        if svg2rlg and render_pdf:
            svg_backend = _SvgBackend("hybrid", _svg2png, _ImageReader, svg2rlg, render_pdf)
        else:
            svg_backend = _SvgBackend("cairosvg", _svg2png, _ImageReader, None, None)

    return _PdfResources(pdf_canvas.Canvas, letter, svg_backend)

   

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
    """Return SVG markup for the requested rhyme.

    When ``RHYME_SVG_BASE_PATH`` is configured the endpoint first attempts to
    resolve ``<rhyme_code>.svg`` within that directory so real artwork from a
    network share or mounted volume can be exercised. If the environment
    variable is unset or the file is missing, the lookup falls back to the
    repository ``images`` directory before ultimately generating the placeholder
    SVG so the frontend continues to work for missing assets.
    """

    svg_content: Optional[str] = None

    svg_path = _resolve_rhyme_svg_path(rhyme_code)

    if svg_path is not None:
        try:
            svg_content = svg_path.read_text(encoding="utf-8")
        except OSError as exc:
            logger.error(
                "Unable to read SVG for rhyme %s at %s: %s", rhyme_code, svg_path, exc
            )

    if svg_content is None:
        try:
            svg_content = generate_rhyme_svg(rhyme_code)
        except KeyError:
            raise HTTPException(status_code=404, detail="Rhyme not found")
    else:
        svg_content = _localize_svg_image_assets(
            svg_content, svg_path, rhyme_code, inline_mode=True
        )

    return Response(content=svg_content, media_type="image/svg+xml")


# @api_router.get("/cover-assets/manifest")
# async def get_cover_assets_manifest():
#     """Return a manifest describing all available cover SVG assets."""

#     base_path = _ensure_cover_assets_base_path()
#     assets = _build_cover_asset_manifest(base_path, include_markup=True)

#     return {"assets": assets}


@api_router.get("/cover-assets/network/{selection_key}")
async def get_cover_assets_network_paths(selection_key: str):
    """Return UNC paths for every SVG within the requested theme/colour folder."""

    base_path = _ensure_cover_assets_base_path()
    unc_base_path = _get_cover_assets_unc_base_path()
   

    try:
        theme_number, colour_number = config.parse_cover_selection_key(selection_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    selection_unc_path, selection_fs_path = config.build_cover_selection_paths(
        unc_base_path, base_path, theme_number, colour_number
    )
    

    try:
        exists = Path(selection_fs_path).exists()
        print(exists)
        is_directory = selection_fs_path.is_dir()
        print(is_directory)
    except OSError as exc:
        logger.error("Unable to access cover SVG directory %s: %s", selection_fs_path, exc)
        raise HTTPException(status_code=500, detail="Unable to access cover assets.") from exc

    if not exists or not is_directory:
        raise HTTPException(status_code=404, detail="Requested cover selection does not exist.")

    try:
        svg_files = [
            candidate
            for candidate in sorted(selection_fs_path.iterdir())
            if candidate.is_file() and candidate.suffix.lower() == ".svg"
        ]
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Requested cover selection does not exist.")
    except OSError as exc:
        logger.error("Unable to read cover SVG directory %s: %s", selection_fs_path, exc)
        raise HTTPException(status_code=500, detail="Unable to access cover assets.") from exc

    assets = [
        {
            "fileName": svg_file.name,
            "uncPath": str(selection_unc_path / svg_file.name),
        }
        for svg_file in svg_files
    ]

    return {"assets": assets}


@api_router.get("/cover-assets/svg/{relative_path:path}")
async def get_cover_asset(relative_path: str):
    """Return the raw SVG bytes for the cover asset ``relative_path``."""
    print("Iam running")
    base_path = _ensure_cover_assets_base_path()
   

    candidate_path = (base_path / Path(relative_path)).resolve()
    

    try:
        candidate_path.relative_to(base_path)
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cover asset path requested.")

    if not candidate_path.exists() or not candidate_path.is_file():
        raise HTTPException(status_code=404, detail="Cover asset not found.")

    try:
        svg_bytes = candidate_path.read_bytes()
    except OSError as exc:  # pragma: no cover - filesystem errors are unexpected
        logger.error("Unable to read cover SVG '%s': %s", candidate_path, exc)
        raise HTTPException(status_code=500, detail="Unable to read cover asset.") from exc

    return Response(content=svg_bytes, media_type="image/svg+xml")


def _draw_text_only_rhyme(
    pdf_canvas: Any,
    entry: Dict[str, Any],
    page_width: float,
    page_height: float,
    y_offset: float = 0,
) -> None:
    """Render a stylised fallback card when SVG backends are unavailable.

    The previous implementation printed a diagnostic message that bubbled up to
    the generated PDF. Users interpreted the message as an error even though
    the export succeeded. To provide a polished experience regardless of
    optional dependencies, the fallback now draws a colourful card directly
    with ReportLab primitives, closely matching the SVG-based design.
    """

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

    # Create a soft gradient background by painting a stack of translucent bars.
    gradient_steps = 24
    start_color = (1.0, 0.42, 0.42)
    end_color = (0.31, 0.8, 0.77)

    card_path = pdf_canvas.beginPath()
    card_path.roundRect(rect_x, rect_y, rect_width, rect_height, 12)

    pdf_canvas.saveState()
    pdf_canvas.clipPath(card_path, stroke=0, fill=0)

    for step in range(gradient_steps):
        blend = step / max(gradient_steps - 1, 1)
        red = start_color[0] + (end_color[0] - start_color[0]) * blend
        green = start_color[1] + (end_color[1] - start_color[1]) * blend
        blue = start_color[2] + (end_color[2] - start_color[2]) * blend
        band_height = rect_height / gradient_steps + 1  # overlap to avoid gaps
        pdf_canvas.setFillColorRGB(red, green, blue)
        pdf_canvas.rect(
            rect_x,
            rect_y + step * (rect_height / gradient_steps),
            rect_width,
            band_height,
            stroke=0,
            fill=1,
        )

    pdf_canvas.restoreState()

    # Add a translucent overlay so text remains legible on the gradient.
    pdf_canvas.saveState()
    pdf_canvas.setFillColorRGB(1, 1, 1)
    if hasattr(pdf_canvas, "setFillAlpha"):
        pdf_canvas.setFillAlpha(0.15)
    pdf_canvas.roundRect(rect_x, rect_y, rect_width, rect_height, 12, stroke=0, fill=1)
    pdf_canvas.restoreState()

    pdf_canvas.setFillColorRGB(1, 1, 1)
    pdf_canvas.setFont("Helvetica-Bold", 22)
    pdf_canvas.drawCentredString(page_width / 2, rect_y + rect_height - 48, rhyme_name)

    pdf_canvas.setFont("Helvetica", 13)
    pdf_canvas.drawCentredString(page_width / 2, rect_y + rect_height - 74, f"Code: {rhyme_code}")

    if pages_value is not None:
        pdf_canvas.drawCentredString(
            page_width / 2,
            rect_y + rect_height - 94,
            f"Pages: {pages_value}",
        )

    pdf_canvas.saveState()
    pdf_canvas.setStrokeColorRGB(1, 1, 1)
    pdf_canvas.setLineWidth(1.2)
    pdf_canvas.roundRect(rect_x, rect_y, rect_width, rect_height, 12, stroke=1, fill=0)
    pdf_canvas.restoreState()

    # Decorative musical note badge similar to the SVG layout.
    badge_radius = 32
    badge_center_x = page_width / 2
    badge_center_y = rect_y + rect_height / 2
    pdf_canvas.saveState()
    pdf_canvas.setFillColorRGB(1, 1, 1)
    if hasattr(pdf_canvas, "setFillAlpha"):
        pdf_canvas.setFillAlpha(0.25)
    pdf_canvas.circle(badge_center_x, badge_center_y, badge_radius, stroke=0, fill=1)
    pdf_canvas.restoreState()
    pdf_canvas.setFillColorRGB(1, 1, 1)
    pdf_canvas.setFont("Helvetica-Bold", 28)
    pdf_canvas.drawCentredString(badge_center_x, badge_center_y - 10, "♪")


def _render_svg_on_canvas(
    pdf_canvas: Any,
    backend: _SvgBackend,
    svg_document: _SvgDocument,
    width: float,
    height: float,
    *,
    x: float = 0,
    y: float = 0,
    rhyme_code: Optional[str] = None,
) -> bool:
    """Render ``svg_document`` onto ``pdf_canvas`` using the available backend."""

    logger = logging.getLogger(__name__)

    original_markup = svg_document.markup
    effective_markup = original_markup
    source_path = svg_document.source_path

    raster_only = _svg_requires_raster_backend(svg_document)

    if source_path is not None:
        localized_markup = _localize_svg_image_assets(
            effective_markup,
            source_path,
            rhyme_code or "unknown",
            inline_mode=True,
            preprocess_for_pdf=True,
        )
        if localized_markup != effective_markup:
            effective_markup = localized_markup

    sanitized_markup = _sanitize_svg_for_svglib(effective_markup)
    gradient_requires_raster = sanitized_markup != effective_markup
    if gradient_requires_raster:
        logger.debug(
            "Gradient sanitization required for %s; falling back to raster rendering",
            rhyme_code or "unknown",
        )

    vector_markup = sanitized_markup if not gradient_requires_raster else effective_markup

    needs_temp_file = source_path is not None and vector_markup != original_markup

    vector_backend_available = (
        backend.svg2rlg
        and backend.render_pdf
        and not raster_only
    )

    temp_svg_path: Optional[Path] = None

    if vector_backend_available and not gradient_requires_raster:
        try:
            svg_input: Any
            if source_path is not None:
                if needs_temp_file:
                    candidate_dirs: List[Path] = []
                    parent_dir = source_path.parent
                    if parent_dir.exists() and parent_dir.is_dir():
                        candidate_dirs.append(parent_dir)
                    try:
                        cache_dir = _ensure_image_cache_dir()
                    except OSError:
                        cache_dir = None
                    if cache_dir and cache_dir not in candidate_dirs:
                        candidate_dirs.append(cache_dir)

                    for directory in candidate_dirs:
                        try:
                            with tempfile.NamedTemporaryFile(
                                "w",
                                encoding="utf-8",
                                suffix=".svg",
                                prefix=f"{source_path.stem}_sanitized_",
                                dir=directory,
                                delete=False,
                            ) as temp_file:
                                temp_file.write(vector_markup)
                            temp_svg_path = Path(temp_file.name)
                            break
                        except OSError as exc:
                            logger.debug(
                                "Unable to create temporary sanitized SVG in %s: %s",
                                directory,
                                exc,
                            )

                    if temp_svg_path is None:
                        logger.warning(
                            "Falling back to in-memory sanitized SVG for %s", source_path
                        )
                        svg_input = BytesIO(vector_markup.encode("utf-8"))
                    else:
                        svg_input = str(temp_svg_path)
                else:
                    svg_input = str(source_path)
            else:
                svg_input = BytesIO(vector_markup.encode("utf-8"))

            drawing = backend.svg2rlg(svg_input)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("Failed to parse SVG using svglib: %s", exc)
            drawing = None
        finally:
            if temp_svg_path is not None:
                try:
                    temp_svg_path.unlink()
                except OSError as exc:
                    logger.debug(
                        "Unable to remove temporary sanitized SVG %s: %s", temp_svg_path, exc
                    )

        if drawing and getattr(drawing, "width", None) and getattr(drawing, "height", None):
            try:
                scale_x = width / float(drawing.width)
                scale_y = height / float(drawing.height)
                drawing.scale(scale_x, scale_y)
                min_x = getattr(drawing, "minX", 0) or 0
                min_y = getattr(drawing, "minY", 0) or 0
                drawing.translate(-min_x, -min_y)
                backend.render_pdf.draw(drawing, pdf_canvas, x, y)
                return True
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("Failed to render SVG using svglib: %s", exc)
        else:
            logger.debug(
                "svglib was unable to determine geometry for SVG; falling back to raster rendering"
            )

    if (
        backend.svg2png
        and backend.image_reader
    ):
        try:
            image_buffer = BytesIO()
            cairosvg_markup = effective_markup
            if svg_document.source_path is not None:
                cairosvg_markup = _localize_svg_image_assets(
                    cairosvg_markup,
                    svg_document.source_path,
                    rhyme_code or "unknown",
                    inline_mode=True,
                    preprocess_for_pdf=True,
                )
            backend.svg2png(
                bytestring=cairosvg_markup.encode("utf-8"),
                write_to=image_buffer,
                output_width=int(width),
                output_height=int(height),
                background_color="transparent",
            )
            image_buffer.seek(0)
            pdf_canvas.drawImage(
                backend.image_reader(image_buffer),
                x,
                y,
                width=width,
                height=height,
                mask="auto",
            )
            return True
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("Failed to render SVG using CairoSVG: %s", exc)

    return False


@api_router.get("/rhymes/binder/{school_id}/{grade}")
async def download_rhyme_binder(school_id: str, grade: str):
    """Generate a PDF binder containing all rhymes for the specified grade."""

    try:
        pdf_resources = _load_pdf_dependencies()
         
        
        
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
    pdf_canvas = pdf_resources.canvas_factory(buffer, pagesize=pdf_resources.page_size)
    page_width, page_height = pdf_resources.page_size
    svg_backend = pdf_resources.svg_backend

    svg_document_cache: Dict[str, Optional[_SvgDocument]] = {}

    def _get_svg_document(rhyme_code: str) -> Optional[_SvgDocument]:
        """Return cached SVG metadata for ``rhyme_code`` within this request."""

        if rhyme_code in svg_document_cache:
            return svg_document_cache[rhyme_code]

        try:
            document = _load_rhyme_svg_markup(rhyme_code)
        except KeyError:
            document = None

        svg_document_cache[rhyme_code] = document
        return document

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
            svg_document = _get_svg_document(full_page_entry["rhyme_code"])

            if svg_document and _render_svg_on_canvas(
                pdf_canvas,
                svg_backend,
                svg_document,
                page_width,
                page_height,
                rhyme_code=full_page_entry["rhyme_code"],
            ):
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

                y_position = page_height - slot_height if position == "top" else 0

                svg_rendered = False

                svg_document = _get_svg_document(entry["rhyme_code"])

                if svg_document:
                    svg_rendered = _render_svg_on_canvas(
                        pdf_canvas,
                        svg_backend,
                        svg_document,
                        page_width,
                        slot_height,
                        x=0,
                        y=y_position,
                        rhyme_code=entry["rhyme_code"],
                    )

                if not svg_rendered:
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

    svg_document_cache.clear()

    return Response(
        content=buffer.getvalue(), media_type="application/pdf", headers=headers
    )


# Include the router in the main app
app.include_router(api_router)



# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()