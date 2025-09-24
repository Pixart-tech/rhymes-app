from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError
import os
import logging
import json
from pathlib import Path
from io import BytesIO
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Optional, Any, Tuple
import uuid
import asyncio
from collections import defaultdict
from copy import deepcopy
from contextvars import ContextVar
from datetime import datetime

try:
    from bson import ObjectId
except ImportError:  # pragma: no cover - optional dependency resolution
    ObjectId = None

try:  # pragma: no cover - optional dependency resolution is environment-specific
    import cairosvg
except ImportError:  # pragma: no cover - handled gracefully at runtime
    cairosvg = None

try:  # pragma: no cover - optional dependency resolution is environment-specific
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
except ImportError:  # pragma: no cover - handled gracefully at runtime
    canvas = None
    A4 = None
    ImageReader = None

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


logger = logging.getLogger(__name__)

class SimpleResult:
    """Lightweight result object mimicking Motor outcomes for fallback operations."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class ResilientCursor:
    """Cursor wrapper that reuses collection logic for Mongo or in-memory data."""

    def __init__(self, collection: "ResilientCollection", query: Dict[str, Any]):
        self._collection = collection
        self._query = query or {}
        self._sort: Optional[Tuple[str, int]] = None

    def sort(self, field: str, direction: int) -> "ResilientCursor":
        self._sort = (field, direction)
        return self

    async def to_list(self, length: Optional[int]):
        return await self._collection._execute_find(self._query, self._sort, length)


class ResilientCollection:
    """Collection wrapper that falls back to in-memory storage when MongoDB is unavailable."""

    def __init__(self, motor_collection, memory_store: Dict[str, Dict[str, Any]], lock: asyncio.Lock, database: "ResilientDatabase"):
        self._collection = motor_collection
        self._memory = memory_store
        self._lock = lock
        self._database = database

    async def find_one(self, query: Dict[str, Any]):
        try:
            document = await self._collection.find_one(query)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            return await self._memory_find_one(query)
        else:
            self._database._set_online()
            return await self._store_document(document)

    async def insert_one(self, document: Dict[str, Any]):
        try:
            result = await self._collection.insert_one(document)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            return await self._memory_insert_one(document)
        else:
            self._database._set_online()
            stored_document = deepcopy(document)
            stored_document["_id"] = result.inserted_id
            await self._memory_insert_one(stored_document)
            return result

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]):
        try:
            result = await self._collection.update_one(query, update)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            modified = await self._memory_update_one(query, update)
            return SimpleResult(modified_count=modified)
        else:
            self._database._set_online()
            if result.modified_count:
                await self._memory_update_one(query, update)
            return result

    def find(self, query: Optional[Dict[str, Any]] = None) -> ResilientCursor:
        return ResilientCursor(self, query or {})

    async def delete_one(self, query: Dict[str, Any]):
        try:
            result = await self._collection.delete_one(query)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            deleted = await self._memory_delete(query, single=True)
            return SimpleResult(deleted_count=deleted)
        else:
            self._database._set_online()
            if result.deleted_count:
                await self._memory_delete(query, single=True)
            return result

    async def delete_many(self, query: Dict[str, Any]):
        try:
            result = await self._collection.delete_many(query)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            deleted = await self._memory_delete(query, single=False)
            return SimpleResult(deleted_count=deleted)
        else:
            self._database._set_online()
            if result.deleted_count:
                await self._memory_delete(query, single=False)
            return result

    async def _execute_find(self, query: Dict[str, Any], sort: Optional[Tuple[str, int]], length: Optional[int]):
        try:
            cursor = self._collection.find(query)
            if sort is not None:
                field, direction = sort
                cursor = cursor.sort(field, direction)
            documents = []
            limit = length if length and length > 0 else None
            async for document in cursor:
                documents.append(document)
                if limit is not None and len(documents) >= limit:
                    break
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            return await self._memory_find(query, sort, length)
        else:
            self._database._set_online()
            results = []
            for document in documents:
                stored = await self._store_document(document)
                if stored is not None:
                    results.append(stored)
            return results

    async def _store_document(self, document: Optional[Dict[str, Any]]):
        if not document:
            return None
        prepared = self._prepare_document(document)
        async with self._lock:
            self._memory[prepared["_id"]] = prepared
        return deepcopy(prepared)

    async def _memory_find_one(self, query: Dict[str, Any]):
        async with self._lock:
            for document in self._memory.values():
                if self._matches_filter(document, query):
                    return deepcopy(document)
        return None

    async def _memory_find(self, query: Dict[str, Any], sort: Optional[Tuple[str, int]], length: Optional[int]):
        async with self._lock:
            documents = [deepcopy(doc) for doc in self._memory.values() if self._matches_filter(doc, query)]
        documents = self._apply_sort(documents, sort)
        if length is not None and length > 0:
            documents = documents[:length]
        return documents

    async def _memory_insert_one(self, document: Dict[str, Any]):
        prepared = self._prepare_document(document)
        async with self._lock:
            self._memory[prepared["_id"]] = prepared
        return SimpleResult(inserted_id=prepared["_id"])

    async def _memory_update_one(self, query: Dict[str, Any], update: Dict[str, Any]):
        async with self._lock:
            for key, document in self._memory.items():
                if self._matches_filter(document, query):
                    updated = self._apply_update(document, update)
                    self._memory[key] = updated
                    return 1
        return 0

    async def _memory_delete(self, query: Dict[str, Any], single: bool):
        async with self._lock:
            keys_to_remove = []
            for key, document in self._memory.items():
                if self._matches_filter(document, query):
                    keys_to_remove.append(key)
                    if single:
                        break
            for key in keys_to_remove:
                self._memory.pop(key, None)
        return len(keys_to_remove)

    def _prepare_document(self, document: Dict[str, Any]):
        prepared = deepcopy(document)
        identifier = prepared.get("_id")
        if identifier is None:
            identifier = str(uuid.uuid4())
        identifier = self._stringify_identifier(identifier)
        prepared["_id"] = identifier
        return prepared

    def _stringify_identifier(self, value):
        if value is None:
            return str(uuid.uuid4())
        if ObjectId is not None and isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, uuid.UUID):
            return str(value)
        return value

    def _apply_update(self, document: Dict[str, Any], update: Dict[str, Any]):
        updated = deepcopy(document)
        for operator, fields in update.items():
            if operator == "$set":
                for field, value in fields.items():
                    updated[field] = value
        return updated

    def _matches_filter(self, document: Dict[str, Any], query: Dict[str, Any]):
        if not query:
            return True
        for field, expected in query.items():
            value = document.get(field)
            if isinstance(expected, dict):
                for operator, operand in expected.items():
                    if operator == "$in":
                        operand_values = [self._normalize_filter_value(field, item) for item in operand]
                        if self._normalize_filter_value(field, value) not in operand_values:
                            return False
                    elif operator == "$ne":
                        if self._normalize_filter_value(field, value) == self._normalize_filter_value(field, operand):
                            return False
                    else:
                        return False
            else:
                if self._normalize_filter_value(field, value) != self._normalize_filter_value(field, expected):
                    return False
        return True

    def _normalize_filter_value(self, field: str, value):
        if field == "_id":
            return self._stringify_identifier(value)
        return value

    def _apply_sort(self, documents: List[Dict[str, Any]], sort: Optional[Tuple[str, int]]):
        if not sort:
            return documents
        field, direction = sort
        reverse = direction < 0
        return sorted(documents, key=lambda item: item.get(field), reverse=reverse)


class ResilientDatabase:
    """Database wrapper that exposes collections with transparent fallbacks."""

    def __init__(self, motor_db):
        self._db = motor_db
        self._memory: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._online = True
        self._fallback_flag: ContextVar[bool] = ContextVar("resilient_db_fallback", default=False)

    def __getattr__(self, item: str) -> ResilientCollection:
        if item.startswith("_"):
            raise AttributeError(item)
        if item not in self._memory:
            self._memory[item] = {}
            self._locks[item] = asyncio.Lock()
        return ResilientCollection(self._db[item], self._memory[item], self._locks[item], self)

    def reset_operation_state(self):
        return self._fallback_flag.set(False)

    def was_fallback_used(self) -> bool:
        return self._fallback_flag.get()

    def restore_operation_state(self, token):
        self._fallback_flag.reset(token)

    def mark_fallback(self):
        self._fallback_flag.set(True)

    def _set_online(self):
        if not self._online:
            logger.info("MongoDB connection restored. Returning to primary storage.")
        self._online = True

    def _set_offline(self, exc: Exception):
        if self._online:
            logger.warning("MongoDB unavailable. Falling back to in-memory storage.", exc_info=exc)
        self._online = False
        self.mark_fallback()

# MongoDB connection
mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
mongo_options: Dict[str, Any] = {
    "serverSelectionTimeoutMS": int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "2000")),
}

client = AsyncIOMotorClient(mongo_url, **mongo_options)
db_name = os.getenv("DB_NAME", "rhymes")

mongo_db = client[db_name]
db = ResilientDatabase(mongo_db)

# Load rhymes data
with open(ROOT_DIR / 'rhymes.json', 'r') as f:
    RHYMES_DATA = json.load(f)

# Create the main app without a prefix
app = FastAPI()

# Track whether the request relied on in-memory fallback and expose it for clients.
@app.middleware("http")
async def apply_storage_mode_header(request: Request, call_next):
    token = db.reset_operation_state()
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        storage_mode = "memory" if db.was_fallback_used() else "mongo"
        db.restore_operation_state(token)
        if response is not None:
            response.headers["X-Storage-Mode"] = storage_mode

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Models
class School(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    school_id: str
    school_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    storage_mode: str = "mongo"

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


class PdfExportRequest(BaseModel):
    school_id: str
    grade: str
    svgs: List[str]

# Authentication endpoints
@api_router.post("/auth/login", response_model=School)
async def login_school(input: SchoolCreate):
    normalized_school_id = input.school_id.strip()
    normalized_school_name = input.school_name.strip()


    try:
        existing_school = await db.schools.find_one({"school_id": normalized_school_id})
    except PyMongoError as exc:  # pragma: no cover - depends on database availability
        logger.exception("Database error while retrieving school %s", normalized_school_id)
        raise HTTPException(
            status_code=503,
            detail="Authentication service is temporarily unavailable. Please try again shortly.",
        ) from exc


    if existing_school:
        school_model = School.model_validate(existing_school)
        school_model.storage_mode = "memory" if db.was_fallback_used() else "mongo"
        return school_model

    school_dict = {
        "school_id": normalized_school_id,
        "school_name": normalized_school_name,
    }
    school_obj = School(**school_dict)



    try:
        await db.schools.insert_one(school_obj.model_dump())
    except PyMongoError as exc:  # pragma: no cover - depends on database availability
        logger.exception("Database error while creating school %s", normalized_school_id)
        raise HTTPException(
            status_code=503,
            detail="Unable to save school information right now. Please try again shortly.",
        ) from exc


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
        
        rhymes_by_pages[page_key].append({
            "code": code,
            "name": name,
            "pages": pages,
            "personalized": personalized
        })
    
    return rhymes_by_pages

@api_router.get("/rhymes/available/{school_id}/{grade}")
async def get_available_rhymes(school_id: str, grade: str, include_selected: bool = False):
    """Get available rhymes for a specific grade"""
    if not include_selected:
        # Get already selected rhymes for ALL grades in this school
        selected_rhymes = await db.rhyme_selections.find({
            "school_id": school_id
        }).to_list(None)
        
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
            
            rhymes_by_pages[page_key].append({
                "code": code,
                "name": name,
                "pages": pages,
                "personalized": personalized
            })
    
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
        
        result[grade].append({
            "page_index": selection["page_index"],
            "code": selection["rhyme_code"],
            "name": selection["rhyme_name"],
            "pages": selection["pages"],
            "position": selection.get("position")
        })
    
    # Sort by page_index
    for grade in result:
        result[grade].sort(key=lambda x: x["page_index"])
    
    return result

@api_router.get("/rhymes/selected/other-grades/{school_id}/{grade}")
async def get_selected_rhymes_other_grades(school_id: str, grade: str):
    """Get rhymes selected in other grades that can be reused"""
    selections = await db.rhyme_selections.find({
        "school_id": school_id,
        "grade": {"$ne": grade}  # Exclude current grade
    }).to_list(None)
    
    # Get unique rhymes from other grades
    selected_rhymes = {}
    for selection in selections:
        code = selection["rhyme_code"]
        if code not in selected_rhymes:
            selected_rhymes[code] = {
                "code": code,
                "name": selection["rhyme_name"],
                "pages": selection["pages"],
                "used_in_grades": []
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
    normalized_position = "bottom" if pages == 0.5 and requested_position == "bottom" else "top"

    page_query = {
        "school_id": input.school_id,
        "grade": input.grade,
        "page_index": input.page_index
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
    selection_dict = input.model_dump()
    selection_dict.update({
        "rhyme_name": rhyme_data[0],
        "pages": pages,
        "position": normalized_position
    })
    
    selection_obj = RhymeSelection(**selection_dict)
    await db.rhyme_selections.insert_one(selection_obj.model_dump())
    
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
async def remove_specific_rhyme_selection(school_id: str, grade: str, page_index : int, position: str):
    """Remove a specific rhyme selection for a position (top/bottom)"""
    # Get all selections for this page
    selections = await db.rhyme_selections.find({
        "school_id": school_id,
        "grade": grade,
        "page_index": page_index,
        
    }).to_list(None)
    
    if not selections:
        # raise HTTPException(status_code=404, detail="No selections found for this page")
        return {"message":f"selection is removed"}
    
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
        raise HTTPException(status_code=404, detail="Selection not found for the specified position")

    # Remove the selection
    result = await db.rhyme_selections.delete_one({
        "_id": selection_to_remove["_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Selection not found")
    
    return {"message": f"{position.capitalize()} selection removed successfully"}

@api_router.get("/rhymes/status/{school_id}")
async def get_grade_status(school_id: str):
    """Get selection status for all grades"""
    grades = ["nursery", "lkg", "ukg", "playgroup"]
    status = []
    
    for grade in grades:
        selections = await db.rhyme_selections.find({
            "school_id": school_id,
            "grade": grade
        }).to_list(None)
        
        selected_count = len(selections)
        
        status.append({
            "grade": grade,
            "selected_count": selected_count,
            "total_available": 25  # Maximum 25 rhymes can be selected
        })
    
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
        selection_docs = await db.rhyme_selections.find({
            "school_id": {"$in": school_ids}
        }).to_list(None)

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


@api_router.post("/rhymes/export/pdf")
async def export_rhymes_pdf(payload: PdfExportRequest):
    """Generate a PDF containing the provided SVG content stacked as pages."""

    if cairosvg is None or canvas is None or ImageReader is None or A4 is None:
        logger.error("PDF generation attempted without required dependencies installed.")
        raise HTTPException(status_code=500, detail="PDF generation dependencies are not available on the server.")

    if not payload.svgs:
        raise HTTPException(status_code=400, detail="No SVG content provided.")

    pdf_buffer = BytesIO()
    pdf_canvas = canvas.Canvas(pdf_buffer, pagesize=A4)
    page_width, page_height = A4
    rendered_pages = 0

    for index, svg_content in enumerate(payload.svgs):
        if not svg_content or not svg_content.strip():
            continue

        try:
            png_bytes = cairosvg.svg2png(bytestring=svg_content.encode("utf-8"))
        except Exception as exc:  # pragma: no cover - conversion errors depend on SVG input
            logger.error("Failed to convert SVG at index %s: %s", index, exc)
            raise HTTPException(status_code=400, detail=f"Invalid SVG content at index {index}.") from exc

        image_stream = BytesIO(png_bytes)
        image_reader = ImageReader(image_stream)
        img_width, img_height = image_reader.getSize()

        if img_width <= 0 or img_height <= 0:
            continue

        scale = min(page_width / img_width, page_height / img_height)
        display_width = img_width * scale
        display_height = img_height * scale
        position_x = (page_width - display_width) / 2
        position_y = (page_height - display_height) / 2

        pdf_canvas.drawImage(
            image_reader,
            position_x,
            position_y,
            width=display_width,
            height=display_height,
            preserveAspectRatio=True,
            mask='auto',
        )
        pdf_canvas.showPage()
        rendered_pages += 1

    if rendered_pages == 0:
        raise HTTPException(status_code=400, detail="Unable to render any SVG content into PDF.")

    pdf_canvas.save()
    pdf_buffer.seek(0)

    sanitized_grade = payload.grade.replace(" ", "_")
    sanitized_school_id = payload.school_id.replace(" ", "_")
    filename = f"{sanitized_school_id}_{sanitized_grade}_rhymes.pdf"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"'
    }

    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)

@api_router.get("/rhymes/svg/{rhyme_code}")
async def get_rhyme_svg(rhyme_code: str):
    """Get SVG content for a rhyme (mock implementation)"""
    if rhyme_code not in RHYMES_DATA:
        raise HTTPException(status_code=404, detail="Rhyme not found")
    
    rhyme_name = RHYMES_DATA[rhyme_code][0]
    
    # Mock SVG content since we can't access the network path in development
    svg_content = f'''
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
    '''
    
    return Response(content=svg_content, media_type="image/svg+xml")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class SimpleResult:
    """Lightweight result object mimicking Motor outcomes for fallback operations."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class ResilientCursor:
    """Cursor wrapper that reuses collection logic for Mongo or in-memory data."""

    def __init__(self, collection: "ResilientCollection", query: Dict[str, Any]):
        self._collection = collection
        self._query = query or {}
        self._sort: Optional[Tuple[str, int]] = None

    def sort(self, field: str, direction: int) -> "ResilientCursor":
        self._sort = (field, direction)
        return self

    async def to_list(self, length: Optional[int]):
        return await self._collection._execute_find(self._query, self._sort, length)


class ResilientCollection:
    """Collection wrapper that falls back to in-memory storage when MongoDB is unavailable."""

    def __init__(self, motor_collection, memory_store: Dict[str, Dict[str, Any]], lock: asyncio.Lock, database: "ResilientDatabase"):
        self._collection = motor_collection
        self._memory = memory_store
        self._lock = lock
        self._database = database

    async def find_one(self, query: Dict[str, Any]):
        try:
            document = await self._collection.find_one(query)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            return await self._memory_find_one(query)
        else:
            self._database._set_online()
            return await self._store_document(document)

    async def insert_one(self, document: Dict[str, Any]):
        try:
            result = await self._collection.insert_one(document)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            return await self._memory_insert_one(document)
        else:
            self._database._set_online()
            stored_document = deepcopy(document)
            stored_document["_id"] = result.inserted_id
            await self._memory_insert_one(stored_document)
            return result

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]):
        try:
            result = await self._collection.update_one(query, update)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            modified = await self._memory_update_one(query, update)
            return SimpleResult(modified_count=modified)
        else:
            self._database._set_online()
            if result.modified_count:
                await self._memory_update_one(query, update)
            return result

    def find(self, query: Optional[Dict[str, Any]] = None) -> ResilientCursor:
        return ResilientCursor(self, query or {})

    async def delete_one(self, query: Dict[str, Any]):
        try:
            result = await self._collection.delete_one(query)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            deleted = await self._memory_delete(query, single=True)
            return SimpleResult(deleted_count=deleted)
        else:
            self._database._set_online()
            if result.deleted_count:
                await self._memory_delete(query, single=True)
            return result

    async def delete_many(self, query: Dict[str, Any]):
        try:
            result = await self._collection.delete_many(query)
        except PyMongoError as exc:  # pragma: no cover - depends on database availability
            self._database._set_offline(exc)
            deleted = await self._memory_delete(query, single=False)
            return SimpleResult(deleted_count=deleted)
        else:
            self._database._set_online()
            if result.deleted_count:
                await self._memory_delete(query, single=False)
            return result

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
