from __future__ import annotations

import base64
import logging
from datetime import datetime
from io import BytesIO

import mimetypes
from pathlib import Path
import struct
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple
import math
from tempfile import NamedTemporaryFile
from fastapi import APIRouter, Body, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response

import pymupdf as fitz
from PIL import Image, UnidentifiedImageError, PngImagePlugin

PngImagePlugin.MAX_TEXT_CHUNK = None

from .. import school_profiles
from pydantic import BaseModel, field_validator


import numpy as np
import cv2


def open_image_safely(contents: bytes) -> Image.Image:
    # 1) Try PIL first (your logic)
    try:
        with Image.open(BytesIO(bytes(contents))) as image_ctx:
            image_ctx.load()
            return image_ctx.copy()

    except ValueError as exc:
        message = str(exc).lower()
        # If metadata is too large, fail fast (don’t try cv2)
        if "max_text_chunk" in message:
            raise HTTPException(
                status_code=400,
                detail="Image metadata is too large to process safely. Please re-export the image without ICC profile/metadata and try again.",
            )

        # 2) For other ValueErrors, try OpenCV decode -> convert to PIL
        try:
            arr = np.frombuffer(contents, dtype=np.uint8)
            cv_img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if cv_img is None:
                raise ValueError("cv2.imdecode returned None")

            rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
            return Image.fromarray(rgb)

        except Exception:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")

    except UnidentifiedImageError:
        # 2) If PIL can't identify, try OpenCV decode -> convert to PIL
        try:
            arr = np.frombuffer(contents, dtype=np.uint8)
            cv_img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if cv_img is None:
                raise ValueError("cv2.imdecode returned None")

            rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
            return Image.fromarray(rgb)

        except Exception:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")


SchoolServiceType = school_profiles.SchoolServiceType
ServiceStatus = school_profiles.ServiceStatus

logger = logging.getLogger(__name__)
from ..firebase_service import (
    DEFAULT_USER_ROLE,
    db,
    ensure_user_document,
    firestore,
    verify_and_decode_token,
)
from ..schemas import (
    BranchStatusUpdatePayload,
    PaginatedSchoolResponse,
    SchoolWithSelections,
)

PUBLIC_DIR = (Path(__file__).resolve().parents[2] / "public").resolve()
SCHOOL_ASSETS_DIR = PUBLIC_DIR / "schools"
MAX_LOGO_PIXELS = 1_000_000
LOGO_MAX_DIMENSION = 1000
TARGET_LOGO_BYTES_ON_FIRESTORE_ERROR = 600 * 1024



def _encode_png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


 # safe-ish cap
import hashlib

def _shrink_png_bytes_until_under(contents: bytes, *, max_bytes: int) -> bytes:
    
    # if contents.startswith("_PNG_SIGNATURE"):
    #     contents_to_decode=_strip_png_metadata_chunks(contents)
    
    """
    try:
         with Image.open(BytesIO(bytes(contents)) )as image_ctx:      
            image_ctx.load()
    except ValueError as exc:
        message = str(exc).lower()
        if "max_text_chunk" in message:
            raise HTTPException(
                status_code=400,
                detail="Image metadata is too large to process safely. Please re-export the image without ICC profile/metadata and try again.",
            )
        raise
    except UnidentifiedImageError as e:
       raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")
    
    """
    image_ctx = open_image_safely(contents)
    with image_ctx as image:
        image = image.convert("RGBA")
        png_bytes = _encode_png_bytes(image)
        if len(png_bytes) <= max_bytes:
            return png_bytes

        # Shrink progressively (preserve aspect ratio) until we fit the byte budget.
        for max_dim in (900, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100):
            resized = image.copy()
            resized.thumbnail((max_dim, max_dim), resample=Image.Resampling.LANCZOS)
            png_bytes = _encode_png_bytes(resized)
            if len(png_bytes) <= max_bytes:
                return png_bytes

    raise HTTPException(
        status_code=400,
        detail="Logo image is too large to store. Please upload a smaller logo.",
    )


class SchoolAddonsPayload(BaseModel):
    service_status: Optional[Dict[SchoolServiceType, ServiceStatus]] = None
    service_type: Optional[List[SchoolServiceType]] = None
    grade_default_labels: Optional[Dict[str, str]] = None
    grade_unique_values: Optional[Dict[str, str]] = None
    zoho_customer_id: Optional[str] = None
    update_zoho_details: Optional[bool] = None
    id_card_fields: Optional[List[str]] = None

    @field_validator("service_status", mode="before")
    @classmethod
    def _coerce_service_status(cls, value: Any) -> Optional[Dict[SchoolServiceType, ServiceStatus]]:
        if value is None or value == "":
            return None
        parsed = school_profiles._parse_json_field(value)
        if not isinstance(parsed, dict):
            raise ValueError("Invalid service status payload")
        normalized: Dict[SchoolServiceType, ServiceStatus] = {}
        for key, entry in parsed.items():
            if key in school_profiles.SERVICE_TYPE_VALUES and isinstance(entry, str):
                status = entry.lower()
                if status in school_profiles.SERVICE_STATUS_VALUES:
                    normalized[key] = status  # type: ignore[assignment]
        return normalized or None

    @field_validator("service_type", mode="before")
    @classmethod
    def _coerce_service_type(cls, value: Any) -> Optional[List[SchoolServiceType]]:
        if value is None or value == "":
            return None 
        return school_profiles.normalize_service_types(value if isinstance(value, list) else [value])  # type: ignore[arg-type]

    @field_validator("grade_default_labels", mode="before")
    @classmethod
    def _coerce_grade_default_labels(cls, value: Any) -> Optional[Dict[str, str]]:
        parsed = school_profiles._parse_json_field(value) if isinstance(value, str) else value
        if parsed is None:
            return None
        if isinstance(parsed, dict):
            normalized: Dict[str, str] = {}
            for key, entry in parsed.items():
                if isinstance(entry, str):
                    trimmed = entry.strip()
                    if trimmed:
                        normalized[key] = trimmed
            return normalized or None
        return None

    @field_validator("grade_unique_values", mode="before")
    @classmethod
    def _coerce_grade_unique_values(cls, value: Any) -> Optional[Dict[str, str]]:
        parsed = school_profiles._parse_json_field(value) if isinstance(value, str) else value
        if parsed is None:
            return None
        if isinstance(parsed, dict):
            normalized: Dict[str, str] = {}
            for key, entry in parsed.items():
                if isinstance(entry, str):
                    trimmed = entry.strip()
                    if trimmed:
                        normalized[key] = trimmed
            return normalized or None
        return None

    @field_validator("zoho_customer_id", mode="before")
    @classmethod
    def _normalize_zoho_customer_id(cls, value: Any) -> Optional[str]:
        extracted = school_profiles._extract_string_value(
            value,
            ("zoho_customer_id", "customer_id", "id", "value"),
        )
        if extracted:
            return extracted
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return None

    @field_validator("id_card_fields", mode="before")
    @classmethod
    def _coerce_id_card_fields(cls, value: Any) -> Optional[List[str]]:
        if value is None or value == "":
            return None
        return school_profiles._normalize_id_card_fields(value)

    @classmethod
    async def as_form(
        cls,
        request: Request,
        service_status: Optional[Any] = Form(default=school_profiles.FORM_UNSET),
        service_type: Optional[Any] = Form(default=school_profiles.FORM_UNSET),
        grade_default_labels: Optional[Any] = Form(default=school_profiles.FORM_UNSET),
        grade_unique_values: Optional[Any] = Form(default=school_profiles.FORM_UNSET),
        zoho_customer_id: Optional[str] = Form(default=school_profiles.FORM_UNSET),
        id_card_fields: Optional[Any] = Form(default=school_profiles.FORM_UNSET),
        update_zoho_details: Optional[str] = Form(default=school_profiles.FORM_UNSET),
    ) -> "SchoolAddonsPayload":
        if school_profiles._is_json_content_type(request):
            return cls(**(await school_profiles._json_payload(request)))
        field_values: Dict[str, Any] = {
            "service_status": service_status,
            "service_type": service_type,
            "grade_default_labels": grade_default_labels,
            "grade_unique_values": grade_unique_values,
            "zoho_customer_id": zoho_customer_id,
            "update_zoho_details": update_zoho_details,
            "id_card_fields": id_card_fields,
        }
        provided = {key: value for key, value in field_values.items() if value is not school_profiles.FORM_UNSET}
        
        if "update_zoho_details" in provided:
            provided["update_zoho_details"] = _parse_boolean_flag(str(provided["update_zoho_details"]))
        return cls(**provided)


class LogoPreviewResponse(BaseModel):
    preview: str


router = APIRouter()


def _clean(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def _parse_boolean_flag(value: Optional[str]) -> bool:
    if value is None:
        return False
    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _sync_zoho_metadata(
    db_client: firestore.Client,
    school_id: str,
    should_update: bool,
    grade_labels: Optional[Dict[str, str]],
    grade_unique_values: Optional[Dict[str, str]],
    service_type: Optional[List[str]],
    customer_id: Optional[str],
) -> None:
    if should_update and grade_labels:
        school_profiles.set_zoho_grade_mapping(
            db_client,
            school_id,
            grade_labels,
            grade_unique_values,
        )
        if service_type:
            school_profiles.set_zoho_service_type(db_client, school_id, service_type)
    if customer_id:
        school_profiles.set_zoho_customer_id(db_client, school_id, customer_id)
        logger.info("Updated Zoho customer id for %s -> %s", school_id, customer_id)


def _guess_image_extension(mime_type: Optional[str]) -> str:
    """Return a friendly image extension with a default .jpg fallback."""
    if not mime_type:
        return ".jpg"
    if mime_type.lower() == "image/jpeg":
        return ".jpg"
    guessed = None
    try:
        guessed = mimetypes.guess_extension(mime_type.split(";")[0].strip())
    except Exception:
        guessed = None
    return guessed or ".jpg"


async def _read_upload_file(upload_file: Optional[UploadFile]) -> Tuple[Optional[bytes], Optional[str]]:
    if not upload_file:
        return None, None
    contents = await upload_file.read()
    if not contents:
        return None, None
    try:
        converted = _convert_upload_bytes_to_png(
            contents,
            filename=upload_file.filename,
            content_type=upload_file.content_type,
            remove_background=False,
        )
    except HTTPException:
        raise
    return converted, "image/png"


async def _read_upload_file_preserve_original(
    upload_file: Optional[UploadFile],
) -> Tuple[Optional[bytes], Optional[str], Optional[bytes], Optional[str], Optional[str]]:
    
    if not upload_file:
        return None, None, None, None, None
    contents = await upload_file.read()
    print(len(contents))
    if not contents:
        return None, None, None, None, None
    try:
        converted = _convert_upload_bytes_to_png(
            contents,
            filename=upload_file.filename,
            content_type=upload_file.content_type,
            remove_background=False,
        )
    except HTTPException as e:
        print(e)
        raise
    return converted, "image/png", contents, upload_file.filename, upload_file.content_type


def _save_school_original_asset(
    *,
    school_id: str,
    contents: bytes,
    filename: Optional[str],
    content_type: Optional[str],
    asset_type: str,
) -> str:
    ext = (Path(filename).suffix.lower() if filename else "") or ""
    if not ext and content_type:
        try:
            guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
        except Exception:
            guessed = None
        ext = (guessed or "").lower()
    if not ext or not ext.startswith("."):
        ext = ".bin"

    target_dir = SCHOOL_ASSETS_DIR / school_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target_name = f"{uuid.uuid4().hex}{ext}"
    target_path = target_dir / target_name
    target_path.write_bytes(contents)

    relative_path = target_path.relative_to(PUBLIC_DIR).as_posix()
    return f"/public/{relative_path}"

def _is_pdf_file(content_type: Optional[str], filename: Optional[str]) -> bool:
    if content_type:
        if "pdf" in content_type.lower():
            return True
    if filename:
        if filename.lower().endswith(".pdf"):
            return True
    return False


_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# Chunks that commonly carry large metadata and can trigger Pillow's safety limits
# (e.g. "max_text_chunk") when opening PNGs.
_PNG_METADATA_CHUNKS = [b'tEXt', b'zTXt', b'iTXt'] 


def _strip_png_metadata_chunks(contents: bytes) -> bytes:
    """Remove PNG metadata chunks without decoding image pixels."""
    if not contents.startswith(_PNG_SIGNATURE):
        return contents

    offset = len(_PNG_SIGNATURE)
    output = bytearray(_PNG_SIGNATURE)
    changed = False

    while offset + 8 <= len(contents):
        length = struct.unpack(">I", contents[offset : offset + 4])[0]
        chunk_type = contents[offset + 4 : offset + 8]
        
        chunk_start = offset
        chunk_end = offset + 12 + length  # len(4) + type(4) + data + crc(4)
        if chunk_end > len(contents):
            break
       

        if chunk_type in _PNG_METADATA_CHUNKS:
            changed = True
        else:
            output.extend(contents[chunk_start:chunk_end])

        offset = chunk_end
        if chunk_type == b"IEND":
            break
    
    return bytes(output) if changed else contents




def _downsize_image_if_needed(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width <= 0 or height <= 0:
        raise HTTPException(status_code=400, detail="Unable to process image dimensions.")
    if (width * height) <= MAX_LOGO_PIXELS:
        
        return image
    resized = image.copy()
    aspect_ratio=width/height 
    target_size=MAX_LOGO_PIXELS
    
    new_height=float(math.sqrt(target_size/aspect_ratio))
    new_width=aspect_ratio*new_height
    
    
    resized.thumbnail((new_width, new_height), resample=Image.Resampling.LANCZOS)
    return resized


def _convert_pdf_bytes_to_png(contents: bytes) -> bytes:
   
    try:
        document = fitz.open(stream=contents, filetype="pdf")
    except Exception:
        raise HTTPException(status_code=400, detail="Uploaded PDF is not valid.")

    try:
        if document.page_count == 0:
            raise HTTPException(status_code=400, detail="Uploaded PDF has no pages.")
        page = document.load_page(0)
        matrix = fitz.Matrix(2, 2)
        pixmap = page.get_pixmap(matrix=matrix, alpha=True)
        png_bytes = pixmap.tobytes("png")
    finally:
        document.close()

    try:
        with Image.open(BytesIO(png_bytes)) as image:
            image = image.convert("RGBA")
            image = _downsize_image_if_needed(image)
            output = BytesIO()
            image.save(output, format="PNG")
            return output.getvalue()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Unable to render PDF preview.")

def _convert_raster_bytes_to_png(contents: bytes, remove_background: bool) -> bytes:
    try:
        if contents.startswith(_PNG_SIGNATURE):
            contents = _strip_png_metadata_chunks(contents)
        with Image.open(BytesIO(contents)) as image:
            
            image = image.convert("RGBA")
            image = _downsize_image_if_needed(image)
            if remove_background:
                image = _remove_white_background(image)
            output = BytesIO()
            image.save(output, format="PNG")
            return output.getvalue()
    except UnidentifiedImageError as e:
        
        print(e)
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")


def _convert_upload_bytes_to_png(   
    contents: bytes,
    *,
    filename: Optional[str],
    content_type: Optional[str],
    remove_background: bool,
) -> bytes:
    if _is_pdf_file(content_type, filename):
        return _convert_pdf_bytes_to_png(contents)
    return _convert_raster_bytes_to_png(contents, remove_background=remove_background)


@router.post("/schools/logo-preview", response_model=LogoPreviewResponse)
async def preview_school_logo(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    ensure_user_document(decoded_token)

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        preview_bytes = _convert_upload_bytes_to_png(
            contents,
            filename=file.filename,
            content_type=file.content_type,
            remove_background=False,
        )
    except HTTPException:
        raise HTTPException(status_code=400, detail="Unable to process the uploaded file")

    encoded = base64.b64encode(preview_bytes).decode("ascii")
    return LogoPreviewResponse(preview=encoded)


@router.options("/schools/logo-preview")
def preview_school_logo_options():
    return Response(status_code=200)


def _remove_white_background(image: Image.Image) -> Image.Image:
    pixels = image.getdata()
    cleaned_pixels = []
    for r, g, b, a in pixels:
        if a == 0:
            cleaned_pixels.append((r, g, b, a))
            continue
        if r >= 240 and g >= 240 and b >= 240:
            cleaned_pixels.append((r, g, b, 0))
        else:
            cleaned_pixels.append((r, g, b, a))
    image.putdata(cleaned_pixels)
    return image


@router.post("/schools", response_model=school_profiles.School)
async def create_school_profile(
    payload: school_profiles.SchoolCreatePayload = Depends(school_profiles.SchoolCreatePayload.as_form),
    logo_file: Optional[UploadFile] = File(None),
    school_image_1: Optional[UploadFile] = File(None),
    school_image_2: Optional[UploadFile] = File(None),
    school_image_3: Optional[UploadFile] = File(None),
    school_image_4: Optional[UploadFile] = File(None),
    facebook_image: Optional[UploadFile] = File(None),
    instagram_image: Optional[UploadFile] = File(None),
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    logo_blob, _, logo_original, logo_original_name, logo_original_type = await _read_upload_file_preserve_original(
        logo_file
    )
    
    
    school_image_blobs = []
    total_image_bytes = 0
    for upload in (school_image_1, school_image_2, school_image_3, school_image_4):
        blob, mime = await _read_upload_file(upload)
        if blob:
            total_image_bytes += len(blob)
        school_image_blobs.append((blob, mime))
    if total_image_bytes > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Total school images must be 2MB or less")
    facebook_blob, facebook_mime = await _read_upload_file(facebook_image)
    instagram_blob, instagram_mime = await _read_upload_file(instagram_image)
    if len(logo_blob)>1048576:
        
        smaller_logo_blob = _shrink_png_bytes_until_under(
                    logo_blob , max_bytes=TARGET_LOGO_BYTES_ON_FIRESTORE_ERROR
                )
        created = school_profiles.create_school_profile(
            db,
            payload,
            user_record,
            smaller_logo_blob,
            school_image_blobs,
            facebook_image_blob=facebook_blob,
            facebook_image_mime=facebook_mime,
            instagram_image_blob=instagram_blob,
            instagram_image_mime=instagram_mime,
        )
    else:
        try:
            created = school_profiles.create_school_profile(
                db,
                payload,
                user_record,
                logo_blob,
                school_image_blobs,
                facebook_image_blob=facebook_blob,
                facebook_image_mime=facebook_mime,
                instagram_image_blob=instagram_blob,
                instagram_image_mime=instagram_mime,
            )
        except Exception as exc:
            print(exc)
            raise
           
    
    if logo_original is not None:
        try:
            original_path = _save_school_original_asset(
                school_id=created.school_id,
                contents=logo_original,
                filename=logo_original_name,
                content_type=logo_original_type,
                asset_type="logo",
            )
            db.collection("schools").document(created.school_id).update({"logo_original_path": original_path})
        except Exception:
            logger.exception("Failed to save original school logo to public directory")
    cover_doc=db.collection("cover_selections").document(created.school_id)
    now=datetime.utcnow()
    default_cover_status="1"
    status_payload: Dict[str, Any] = {
        "status": default_cover_status,
        "status_updated_at": now,
    }
    if decoded_token:
        status_payload["status_updated_by"] = decoded_token.get("uid") or decoded_token.get("user_id")
        if decoded_token.get("email"):
            status_payload["status_updated_by_email"] = decoded_token.get("email")
    cover_doc.set(status_payload,merge=True)
    return created 

@router.get("/schools/email-availability")
async def check_school_email_availability(
    email: str,
    authorization: Optional[str] = Header(None),
):
    verify_and_decode_token(authorization)
    normalized_email = school_profiles._normalize_email(email)
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Please provide a valid email address.")
    school_profiles._ensure_unique_email(db, normalized_email, "school email")
    return {"available": True}

@router.post("/branches", response_model=school_profiles.School)
def create_branch_profile(
    payload: school_profiles.BranchCreatePayload,
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    return school_profiles.create_branch_profile(db, payload, user_record)

@router.get("/schools/{school_id}")

async def get_school_profile(
    school_id: str,
    authorization: Optional[str] = Header(None)
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    if not user_record:
        raise HTTPException(status_code=404,detail="user doesnt exist ")
    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")
    existing=snapshot.to_dict() 
    existing.setdefault("id", snapshot.id)
    existing.setdefault("school_id", snapshot.id)
    return  school_profiles.build_school_from_record(existing)
    
    
    
@router.put("/schools/{school_id}", response_model=school_profiles.School)
async def update_school_profile(
    school_id: str,
    payload: school_profiles.SchoolUpdatePayload = Depends(school_profiles.SchoolUpdatePayload.as_form),
    logo_file: Optional[UploadFile] = File(None),
    school_image_1: Optional[UploadFile] = File(None),
    school_image_2: Optional[UploadFile] = File(None),
    school_image_3: Optional[UploadFile] = File(None),
    school_image_4: Optional[UploadFile] = File(None),
    facebook_image: Optional[UploadFile] = File(None),
    instagram_image: Optional[UploadFile] = File(None),
    authorization: Optional[str] = Header(None),
    update_zoho_details: Optional[str] = Form(default=None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    uid = user_record["uid"]
    role = user_record.get("role", DEFAULT_USER_ROLE)
    allow_service_updates = role == "super-admin"
    should_update_zoho_details = _parse_boolean_flag(update_zoho_details)

    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    existing = snapshot.to_dict() or {}
    user_school_ids = set(user_record.get("school_ids", []))
    if role != "super-admin" and school_id not in user_school_ids:
        raise HTTPException(status_code=403, detail="You do not have permission to edit this school")
    main_school_id = existing.get("branch_parent_id") or existing.get("school_id") or school_id

    raw_updates = payload.dict(exclude_unset=True)
    email_provided = "email" in raw_updates
    principal_email_provided = "principal_email" in raw_updates
    raw_email_value = raw_updates.pop("email", None) if email_provided else None
    raw_principal_value = raw_updates.pop("principal_email", None) if principal_email_provided else None
    raw_zoho_customer_id = raw_updates.pop("zoho_customer_id", None)
    grade_default_labels_raw = raw_updates.pop("grade_default_labels", None)
    grade_unique_values_raw = raw_updates.pop("grade_unique_values", None)
    cleaned_zoho_customer_id = _clean(raw_zoho_customer_id)
    normalized_email = None
    normalized_principal_email = None
    sales_representative_provided = "sales_representative" in raw_updates
    sales_representative = raw_updates.pop("sales_representative", None)
    
    if email_provided:
        if role=="super-admin":
            normalized_email=school_profiles._normalize_email(raw_email_value)
        else:
            normalized_email = school_profiles._ensure_unique_email(
                db, raw_email_value, "school email", exclude_school_id=school_id
            )
    if principal_email_provided:
        if role=="super-admin":
            normalized_principal_email=school_profiles._normalize_email(raw_principal_value)
        else:
            normalized_principal_email = school_profiles._ensure_unique_email(
                db, raw_principal_value, "principal email", exclude_school_id=school_id
            )
            
    logo_blob, _, logo_original, logo_original_name, logo_original_type = await _read_upload_file_preserve_original(
        logo_file
    )
     
    school_image_blobs = []
    total_image_bytes = 0
    for upload in (school_image_1, school_image_2, school_image_3, school_image_4):
        blob, mime = await _read_upload_file(upload)
        if blob:
            total_image_bytes += len(blob)
        school_image_blobs.append((blob, mime))
    if total_image_bytes > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Total school images must be 2MB or less")
    facebook_blob, facebook_mime = await _read_upload_file(facebook_image)
    instagram_blob, instagram_mime = await _read_upload_file(instagram_image)

    raw_service_status = raw_updates.pop("service_status", None)
    raw_service_type = raw_updates.pop("service_type", None)
    grades_raw = raw_updates.pop("grades", None)
    if not allow_service_updates:
        raw_service_status = None
        raw_service_type = None
    address_fields = ("address")
    address_overrides: Dict[str, Any] = {field: raw_updates.pop(field) for field in address_fields if field in raw_updates}

    updates: Dict[str, Any] = {}
    clearable_fields = {"tagline"}
    for key, value in raw_updates.items():
        cleaned_value = _clean(value)
        if cleaned_value is None:
            if key in clearable_fields:
                updates[key] = None
            continue
        updates[key] = cleaned_value

    if sales_representative_provided:
        updates["sales_representative"] = _clean(sales_representative)
    

    if address_overrides:
        cleaned_address = {}
        for field, field_value in address_overrides.items():
            cleaned_field = _clean(field_value)
            if cleaned_field is None:
                continue
            cleaned_address[field] = cleaned_field
        updates.update(cleaned_address)

    if raw_zoho_customer_id is not None and cleaned_zoho_customer_id:
        school_profiles.set_zoho_customer_id(db, main_school_id, cleaned_zoho_customer_id)

    if allow_service_updates:
        if raw_service_status is not None:
            normalized_status = school_profiles.normalize_service_status(raw_service_status)
            updates["service_status"] = normalized_status
            updates["service_type"] = school_profiles.services_from_status(normalized_status)
        elif raw_service_type is not None:
            normalized_type = school_profiles.normalize_service_types(raw_service_type)
            status_map = {
                service: ("yes" if service in normalized_type else "no")
                for service in school_profiles.SERVICE_TYPE_VALUES
            }
            updates["service_type"] = normalized_type
            updates["service_status"] = status_map

    if grades_raw is not None:
        updates["grades"] = school_profiles.normalize_grades(grades_raw)

    grade_default_labels = school_profiles._parse_json_field(grade_default_labels_raw)
    grade_unique_values = school_profiles._parse_json_field(grade_unique_values_raw)

    if logo_blob is not None:
        updates["logo_blob"] = logo_blob

        
        if logo_original is not None:
            try:
                updates["logo_original_path"] = _save_school_original_asset(
                    school_id=school_id,
                    contents=logo_original,
                    filename=logo_original_name,
                    content_type=logo_original_type,
                    asset_type="logo",
                )
            except Exception:
                logger.exception("Failed to save original school logo to public directory")
    if school_image_blobs:
        for idx, (blob, mime) in enumerate(school_image_blobs, start=1):
            if blob:
                updates[f"school_image_{idx}"] = blob
                updates[f"school_image_{idx}_mime"] = mime
    if facebook_blob is not None:
        updates["facebook_image_blob"] = facebook_blob
        updates["facebook_image_mime"] = facebook_mime
    if instagram_blob is not None:
        updates["instagram_image_blob"] = instagram_blob
        updates["instagram_image_mime"] = instagram_mime

    if email_provided:
        updates["email"] = normalized_email
    if principal_email_provided:
        updates["principal_email"] = normalized_principal_email
    
    if not updates:
        existing.setdefault("id", snapshot.id)
        existing.setdefault("school_id", snapshot.id)
        _sync_zoho_metadata(
            db,
            main_school_id,
            should_update_zoho_details,
            grade_default_labels if isinstance(grade_default_labels, dict) else None,
            grade_unique_values if isinstance(grade_unique_values, dict) else None,
            existing.get("service_type"),
            cleaned_zoho_customer_id,
        )
        zoho_doc = school_profiles._zoho_details_doc_ref(db, main_school_id).get()
        zoho_details = zoho_doc.to_dict() if zoho_doc.exists else {}
        existing["zoho_customer_id"] = zoho_details.get("customer_id")
        existing["grade_default_labels"] = zoho_details.get("grade_labels")
        existing["grade_unique_values"] = zoho_details.get("grade_unique_values")
        return school_profiles.build_school_from_record(existing)

    now = datetime.utcnow()
    updates["updated_at"] = now
    updates["timestamp"] = now

    if logo_blob:
        if len(logo_blob)>1048576:
                smaller_logo_blob = _shrink_png_bytes_until_under(
                bytes(updates["logo_blob"]), max_bytes=TARGET_LOGO_BYTES_ON_FIRESTORE_ERROR
            )
                updates['logo_blob']=smaller_logo_blob
    try:
      
            
        doc_ref.update(updates)
    except Exception as exc:
        print(exc)
        raise
    existing.update(updates)
    if role == "super-admin" and email_provided and normalized_email:
        school_profiles.grant_school_access_to_user_by_email(db, normalized_email, school_id)
    existing.setdefault("id", snapshot.id)
    existing.setdefault("school_id", snapshot.id)
    _sync_zoho_metadata(
        db,
        main_school_id,
        should_update_zoho_details,
        grade_default_labels if isinstance(grade_default_labels, dict) else None,
        grade_unique_values if isinstance(grade_unique_values, dict) else None,
        existing.get("service_type"),
        cleaned_zoho_customer_id,
    )
    zoho_doc = school_profiles._zoho_details_doc_ref(db, main_school_id).get()
    zoho_details = zoho_doc.to_dict() if zoho_doc.exists else {}
    existing["zoho_customer_id"] = zoho_details.get("customer_id")
    existing["grade_default_labels"] = zoho_details.get("grade_labels")
    existing["grade_unique_values"] = zoho_details.get("grade_unique_values")

    return school_profiles.build_school_from_record(existing)


@router.patch("/schools/{school_id}/addons", response_model=school_profiles.School)
async def update_school_addons(
    school_id: str,
    payload: SchoolAddonsPayload = Depends(SchoolAddonsPayload.as_form),
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    role = user_record.get("role", DEFAULT_USER_ROLE)
    uid = user_record.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="User record is missing a user id")

    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    existing = snapshot.to_dict() or {}
    user_school_ids = set(user_record.get("school_ids", []))
    if role != "super-admin" and school_id not in user_school_ids:
        raise HTTPException(status_code=403, detail="You do not have permission to edit this school")
    main_school_id = existing.get("branch_parent_id") or existing.get("school_id") or school_id

    updates: Dict[str, Any] = {}
    service_type_value: Optional[List[str]] = existing.get("service_type")

    if payload.service_status is not None:
        updates["service_status"] = payload.service_status
        normalized_type = school_profiles.services_from_status(payload.service_status)
        updates["service_type"] = normalized_type
        service_type_value = normalized_type
    elif payload.service_type is not None:
        normalized_type = school_profiles.normalize_service_types(payload.service_type)
        updates["service_type"] = normalized_type
        status_map = {
            service: ("yes" if service in normalized_type else "no")
            for service in school_profiles.SERVICE_TYPE_VALUES
        }
        updates["service_status"] = status_map
        service_type_value = normalized_type

    if payload.id_card_fields is not None:
        updates["id_card_fields"] = payload.id_card_fields

    now = datetime.utcnow()
    if updates:
        updates["updated_at"] = now
        updates["timestamp"] = now
        doc_ref.update(updates)
        existing.update(updates)

    should_update_zoho = bool(payload.update_zoho_details) or bool(payload.zoho_customer_id) or bool(
        payload.grade_default_labels
    ) or bool(payload.grade_unique_values)
    _sync_zoho_metadata(
        db,
        main_school_id,
        should_update_zoho,
        payload.grade_default_labels,
        payload.grade_unique_values,
        service_type_value,
        payload.zoho_customer_id,
    )

    existing.setdefault("id", snapshot.id)
    existing.setdefault("school_id", snapshot.id)
    zoho_doc = school_profiles._zoho_details_doc_ref(db, main_school_id).get()
    zoho_details = zoho_doc.to_dict() if zoho_doc.exists else {}
    existing["zoho_customer_id"] = zoho_details.get("customer_id")
    existing["grade_default_labels"] = zoho_details.get("grade_labels")
    existing["grade_unique_values"] = zoho_details.get("grade_unique_values")
    return school_profiles.build_school_from_record(existing)


@router.get("/schools/{school_id}/zoho-details")
def get_school_zoho_details(
    school_id: str,
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    role = user_record.get("role", DEFAULT_USER_ROLE)

    doc_ref, record, _ = school_profiles.locate_school_record(db, school_id)
    user_school_ids = set(user_record.get("school_ids", []))
    if role != "super-admin" and school_id not in user_school_ids:
        raise HTTPException(status_code=403, detail="You do not have permission to view this school's addons")

    main_school_id = record.get("branch_parent_id") or record.get("school_id") or school_id
    zoho_doc = school_profiles._zoho_details_doc_ref(db, main_school_id).get()
    details = zoho_doc.to_dict() if zoho_doc.exists else {}

    return {
        "grade_labels": details.get("grade_labels") or {},
        "grade_unique_values": details.get("grade_unique_values") or {},
        "service_type": details.get("service_type") or [],
        "customer_id": details.get("customer_id"),
    }

@router.patch("/schools/{school_id}",response_model=school_profiles.School)
def update_branch_profile(
    school_id: str,
    payload: school_profiles.BranchUpdatePayload,
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    uid = user_record.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="User record is missing a user id")
    parent_ref, record, is_branch = school_profiles.locate_school_record(db, school_id)
    if not is_branch:
        raise HTTPException(status_code=400, detail="Only branch profiles can be updated")

    parent_id = record.get("branch_parent_id")
    if not parent_id:
        raise HTTPException(status_code=400, detail="Only branch profiles can be updated")

    role = user_record.get("role", DEFAULT_USER_ROLE)
    if role != "super-admin":
        raise HTTPException(status_code=403, detail="You do not have permission to update this branch")
    
    requested_parent_id = (payload.parent_school_id or "").strip()
    if requested_parent_id != parent_id:
        raise HTTPException(status_code=400, detail="Branch parent school mismatch")

    now = datetime.utcnow()

    school_name = payload.branch_name.strip()
    principal_name = payload.coordinator_name.strip()
    principal_email = str(payload.coordinator_email).strip()
    principal_phone = payload.coordinator_phone.strip()

    branch_entry = dict(record)
    branch_entry.setdefault("id", school_id)
    branch_entry.setdefault("school_id", school_id)
    branch_entry["branch_parent_id"] = parent_id
    branch_entry.update(
        {
            "school_name": school_name,
            "branch_name": school_name,  # backwards-compatible alias
            "principal_name": principal_name,
            "principal_email": principal_email,
            "principal_phone": principal_phone,
            "coordinator_name": principal_name,
            "coordinator_email": principal_email,
            "coordinator_phone": principal_phone,
            "address": _clean(payload.address),
            "city": _clean(payload.city),
            "state": _clean(payload.state),
            "pin": _clean(payload.pin),
            "updated_at": now,
            "timestamp": now,
        }
    )

    parent_ref.update(
        {
            f"branches.{school_id}": branch_entry,
            "updated_at": now,
            "timestamp": now,
        }
    )

    return school_profiles.build_school_from_record(branch_entry)
@router.patch("/schools/{school_id}/status", response_model=school_profiles.School)
def update_branch_status(
    school_id: str,
    payload: BranchStatusUpdatePayload,
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    uid = user_record.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="User record is missing a user id")

    parent_ref, record, is_branch = school_profiles.locate_school_record(db, school_id)
    if not is_branch:
        raise HTTPException(status_code=400, detail="Only branch profiles can have their status updated")

    parent_id = record.get("branch_parent_id")
    if not parent_id:
        raise HTTPException(status_code=400, detail="Only branch profiles can have their status updated")

    role = user_record.get("role", DEFAULT_USER_ROLE)
    if role != "super-admin":
        raise HTTPException(status_code=403, detail="You do not have permission to update this branch")

    branch_status: school_profiles.BranchStatus = payload.status
    if branch_status not in (school_profiles.BRANCH_STATUS_ACTIVE, school_profiles.BRANCH_STATUS_INACTIVE):
        raise HTTPException(status_code=400, detail="Invalid branch status")

    now = datetime.utcnow()
    record["status"] = branch_status
    record["updated_at"] = now
    record["timestamp"] = now

    branch_school_name = record.get("school_name") or record.get("branch_name")
    if branch_school_name:
        record["school_name"] = branch_school_name

    branch_principal_name = record.get("principal_name") or record.get("coordinator_name")
    if branch_principal_name:
        record["principal_name"] = branch_principal_name

    branch_principal_email = record.get("principal_email") or record.get("coordinator_email")
    if branch_principal_email:
        record["principal_email"] = branch_principal_email

    branch_principal_phone = record.get("principal_phone") or record.get("coordinator_phone")
    if branch_principal_phone:
        record["principal_phone"] = branch_principal_phone

    parent_doc_ref = parent_ref
    parent_doc_ref.update(
        {
            f"branches.{school_id}.status": branch_status,
            f"branches.{school_id}.updated_at": now,
            f"branches.{school_id}.timestamp": now,
            "updated_at": now,
            "timestamp": now,
        }
    )

    return school_profiles.build_school_from_record(record)



@router.patch("/admin/schools/{school_id}/approve-selections", response_model=school_profiles.School)
def approve_school_selections(
    school_id: str,
    approval: bool = Body(... ,embed=True),
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    role = user_record.get("role", DEFAULT_USER_ROLE)
    if role != "super-admin":
        raise HTTPException(status_code=403, detail="Only super admins can approve selections")

    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    now = datetime.utcnow()
    approver = user_record.get("email") or user_record.get("uid") or "super-admin"
    selection_status="approved" if approval else "unapproved"
    updates = {
        "selection_status": selection_status,
        "selections_approved": approval,
        "selection_locked_at": now,
        "selection_locked_by": approver,
        "updated_at": now,
        "timestamp": now,
    }
    
    doc_ref.update(updates)
    record = snapshot.to_dict() or {}
    record.update(updates)
    record.setdefault("id", snapshot.id)
    record.setdefault("school_id", snapshot.id)

    updated_data=school_profiles.build_school_from_record(record)
    return updated_data


@router.get("/schools/{school_id}/logo")
def get_school_logo(school_id: str):
    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    record = snapshot.to_dict() or {}
    logo_blob = record.get("logo_blob")
    if logo_blob is None:
        raise HTTPException(status_code=404, detail="Logo not found")

    if isinstance(logo_blob, memoryview):
        logo_blob = logo_blob.tobytes()
    elif isinstance(logo_blob, bytearray):
        logo_blob = bytes(logo_blob)

    if not isinstance(logo_blob, (bytes, bytearray)):
        raise HTTPException(status_code=404, detail="Logo not found")

    headers = {
        "Cache-Control": "no-store",
        "Content-Disposition": f'inline; filename="{school_id}.png"',
    }
    return Response(content=logo_blob, media_type="image/png", headers=headers)


@router.get("/schools/{school_id}/images/{image_index}")
def get_school_image(school_id: str, image_index: int):
    if image_index < 1 or image_index > 4:
        raise HTTPException(status_code=400, detail="Image index must be between 1 and 4")

    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    record = snapshot.to_dict() or {}
    key = f"school_image_{image_index}"
    blob_value = record.get(key)
    if blob_value is None:
        raise HTTPException(status_code=404, detail="School image not found")

    if isinstance(blob_value, memoryview):
        blob_value = blob_value.tobytes()
    elif isinstance(blob_value, bytearray):
        blob_value = bytes(blob_value)

    if not isinstance(blob_value, (bytes, bytearray)):
        raise HTTPException(status_code=404, detail="School image not found")

    media_type = record.get(f"{key}_mime") or "image/jpeg"
    extension = _guess_image_extension(media_type)
    filename = f"{school_id}_{image_index}{extension}"
    headers = {
        "Cache-Control": "no-store",
        "Content-Disposition": f'inline; filename="{filename}"',
    }
    return Response(content=bytes(blob_value), media_type=media_type, headers=headers)


@router.get("/schools/{school_id}/social/facebook")
def get_school_facebook_image(school_id: str):
    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    record = snapshot.to_dict() or {}
    blob_value = record.get("facebook_image_blob")
    if blob_value is None:
        raise HTTPException(status_code=404, detail="Facebook image not found")

    if isinstance(blob_value, memoryview):
        blob_value = blob_value.tobytes()
    elif isinstance(blob_value, bytearray):
        blob_value = bytes(blob_value)

    if not isinstance(blob_value, (bytes, bytearray)):
        raise HTTPException(status_code=404, detail="Facebook image not found")

    media_type = record.get("facebook_image_mime") or "image/png"
    extension = _guess_image_extension(media_type)
    filename = f"{school_id}_facebook{extension}"
    headers = {
        "Cache-Control": "no-store",
        "Content-Disposition": f'inline; filename="{filename}"',
    }
    return Response(content=bytes(blob_value), media_type=media_type, headers=headers)


@router.get("/schools/{school_id}/social/instagram")
def get_school_instagram_image(school_id: str):
    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    record = snapshot.to_dict() or {}
    blob_value = record.get("instagram_image_blob")
    if blob_value is None:
        raise HTTPException(status_code=404, detail="Instagram image not found")

    if isinstance(blob_value, memoryview):
        blob_value = blob_value.tobytes()
    elif isinstance(blob_value, bytearray):
        blob_value = bytes(blob_value)

    if not isinstance(blob_value, (bytes, bytearray)):
        raise HTTPException(status_code=404, detail="Instagram image not found")
    
    media_type = record.get("instagram_image_mime") or "image/png"
    extension = _guess_image_extension(media_type)
    filename = f"{school_id}_instagram{extension}"
    headers = {
        "Cache-Control": "no-store",
        "Content-Disposition": f'inline; filename="{filename}"',
    }
    return Response(content=bytes(blob_value), media_type=media_type, headers=headers)


@router.get("/admin/school/{query}", response_model=PaginatedSchoolResponse)
def get_school(
    query: str,
    page: int = 1,
    limit: int = 10,
    authorization: Optional[str] = Header(None),
):  
    """Search schools by school_name (case-insensitive substring match).

    Note: Firestore doesn't support arbitrary case-insensitive "contains" queries on strings,
    so we fetch and filter in memory.
    """
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    if user_record.get("role") != "super-admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    cleaned_query = (query or "").strip()
    if not cleaned_query:
        return PaginatedSchoolResponse(schools=[], total_count=0)

    normalized_query = cleaned_query.casefold()
    school_docs_query = db.collection("schools").order_by("timestamp", direction=firestore.Query.DESCENDING)
    all_school_docs = [doc.to_dict() for doc in school_docs_query.stream()]

    matching_docs: List[Dict[str, Any]] = []
    for doc in all_school_docs:
        school_name = (doc.get("school_name") or "").strip()
        school_id = (doc.get("school_id") or doc.get("id") or "").strip()
        school_email = (doc.get("email") or "").strip()
        sales_representative=(doc.get("sales_representative") or "").strip()
        
        if (
            normalized_query in school_name.casefold() or normalized_query.upper() in school_name.casefold()
            or normalized_query in school_id.casefold()
            or normalized_query in school_email.casefold()
            or normalized_query in sales_representative.casefold()
        ):
            if not doc.get("id") and doc.get("school_id"):
                doc["id"] = doc["school_id"]
            matching_docs.append(doc)

    total_count = len(matching_docs)
    if total_count == 0:
        return PaginatedSchoolResponse(schools=[], total_count=0)

    offset = max((page - 1) * limit, 0)
    page_docs = matching_docs[offset : offset + limit]
    if not page_docs:
        return PaginatedSchoolResponse(schools=[], total_count=total_count)

    expanded_docs: List[Dict[str, Any]] = []
    for doc in page_docs:
        if not doc.get("id") and doc.get("school_id"):
            doc["id"] = doc["school_id"]
        expanded_docs.append(doc)

        branches = doc.get("branches") or {}
        parent_id = doc.get("school_id") or doc.get("id")
        for branch_id, branch_entry in branches.items():
            if not isinstance(branch_entry, dict):
                continue
            branch_record = dict(branch_entry)
            branch_record.setdefault("id", branch_id)
            branch_record.setdefault("school_id", branch_id)
            branch_record.setdefault("branch_parent_id", parent_id)
            expanded_docs.append(branch_record)

    # school_ids = [doc.get("school_id") for doc in expanded_docs if doc.get("school_id")]
    # selections_count: Dict[str, int] = {}
    latest_selection_timestamp: Dict[str, datetime] = {}

    # if school_ids:
    #     chunk_size = 30
    #     for i in range(0, len(school_ids), chunk_size):
    #         chunk = school_ids[i : i + chunk_size]
    #         selection_docs_query = (
    #             db.collection("rhyme_selections")
    #             .where("school_id", "in", chunk)
    #             .select(["school_id", "timestamp"])
    #         )
    #         for selection_doc in selection_docs_query.stream():
    #             selection = selection_doc.to_dict() or {}
    #             school_id = selection.get("school_id")
    #             if not school_id:
    #                 continue
    #             selections_count[school_id] = selections_count.get(school_id, 0) + 1
    #             timestamp = selection.get("timestamp")
    #             if timestamp:
    #                 existing_ts = latest_selection_timestamp.get(school_id)
    #                 if not existing_ts or timestamp > existing_ts:
    #                     latest_selection_timestamp[school_id] = timestamp

    zoho_ids: Set[str] = set()
    for doc in expanded_docs:
        zoho_id = doc.get("branch_parent_id") or doc.get("school_id")
        if zoho_id:
            zoho_ids.add(zoho_id)
    zoho_refs = [school_profiles._zoho_details_doc_ref(db, zoho_id) for zoho_id in zoho_ids]
    zoho_snapshot_map: Dict[str, Dict[str, Any]] = {}
    if zoho_refs:
        for snapshot in db.get_all(zoho_refs):
            zoho_snapshot_map[snapshot.id] = snapshot.to_dict() or {}

    schools_with_details: List[SchoolWithSelections] = []

    for doc in expanded_docs:
        school_id = doc.get("school_id")
        if not school_id:
            continue
        zoho_main_id = doc.get("branch_parent_id") or school_id
        zoho_details = zoho_snapshot_map.get(zoho_main_id) or {}
        doc["zoho_customer_id"] = zoho_details.get("customer_id")
        doc["grade_default_labels"] = zoho_details.get("grade_labels")
        doc["grade_unique_values"] = zoho_details.get("grade_unique_values")

        base_school = school_profiles.build_school_from_record(doc)
        # total_selections = selections_count.get(school_id, 0)
        last_updated = latest_selection_timestamp.get(school_id) or doc.get("timestamp")

        schools_with_details.append(
            SchoolWithSelections(
                **base_school.dict(),
                
                last_updated=last_updated,
            )
        )

    return PaginatedSchoolResponse(schools=schools_with_details, total_count=total_count)



import time
@router.get("/admin/schools", response_model=PaginatedSchoolResponse)
def get_all_schools_with_selections(
    page: int = 1, limit: int = 10, authorization: Optional[str] = Header(None)
):
   
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    if user_record.get("role") != "super-admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    count_snapshot = (db.collection("schools").count()).get()
   
    if not count_snapshot:
        count_value = 0
    else:
        count_value = int(count_snapshot[0][0].value)
    offset = max((page - 1) * limit, 0)

    school_docs_query = (
        db.collection("schools")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .offset(offset)
        .limit(limit)
    )
#     school_docs_query = (
#     db.collection("schools")
#     .order_by("timestamp", direction=firestore.Query.DESCENDING)
#     .select([
#         "school_id",
#         "school_name",
#         "sales_representative",
#         "branches"
#         "branch_ids",  
#         "service_status",
#         "service_type",
#         "website",
#         "tagline",
#         "grades",
#         "grade_selections"
#         "selection_status",
#         "selections_approved",
#         "selection_locked_at",
#         "timestamp",
#         "updated_at",
#         "status",
#     ])
#     .offset(offset)
#     .limit(limit)
# )

    
    
    
    school_docs = [doc.to_dict() for doc in school_docs_query.stream()]
   
    
    if not school_docs:
        return PaginatedSchoolResponse(schools=[], total_count=count_value)
    
    expanded_docs: List[Dict[str, Any]] = []
  
    for doc in school_docs:
        if not doc.get("id") and doc.get("school_id"):
            doc["id"] = doc["school_id"]
        expanded_docs.append(doc)

        branches = doc.get("branches") or {}
        parent_id = doc.get("school_id") or doc.get("id")
        for branch_id, branch_entry in branches.items():
            if not isinstance(branch_entry, dict):
                continue
            branch_record = dict(branch_entry)
            branch_record.setdefault("id", branch_id)
            branch_record.setdefault("school_id", branch_id)
            branch_record.setdefault("branch_parent_id", parent_id)
            expanded_docs.append(branch_record)
    
    # school_ids = [doc.get("school_id") for doc in expanded_docs if doc.get("school_id")]
    # selections_count: Dict[str, int] = {}
    latest_selection_timestamp: Dict[str, datetime] = {}

    # if school_ids:
    #     selection_docs_query = (
    #         db.collection("rhyme_selections")
    #         .where("school_id", "in", school_ids)
    #         .select(["school_id", "timestamp"])
    #     )
    #     for selection_doc in selection_docs_query.stream():
    #         selection = selection_doc.to_dict() or {}
    #         school_id = selection.get("school_id")
    #         if not school_id:
    #             continue
    #         selections_count[school_id] = selections_count.get(school_id, 0) + 1
    #         timestamp = selection.get("timestamp")
    #         if timestamp:
    #             existing_ts = latest_selection_timestamp.get(school_id)
    #             if not existing_ts or timestamp > existing_ts:
    #                 latest_selection_timestamp[school_id] = timestamp

    zoho_ids: Set[str] = set()
    
    for doc in expanded_docs:
        zoho_id = doc.get("branch_parent_id") or doc.get("school_id")
        if zoho_id:
            zoho_ids.add(zoho_id)
    zoho_refs = [school_profiles._zoho_details_doc_ref(db, zoho_id) for zoho_id in zoho_ids]
    zoho_snapshot_map: Dict[str, Dict[str, Any]] = {}
    if zoho_refs:
        for snapshot in db.get_all(zoho_refs):
            zoho_snapshot_map[snapshot.id] = snapshot.to_dict() or {}

    schools_with_details: List[SchoolWithSelections] = []

    for doc in expanded_docs:
        school_id = doc.get("school_id")
        if not school_id:
            continue
        zoho_main_id = doc.get("branch_parent_id") or school_id
        zoho_details = zoho_snapshot_map.get(zoho_main_id) or {}
        doc["zoho_customer_id"] = zoho_details.get("customer_id")
        doc["grade_default_labels"] = zoho_details.get("grade_labels")
        doc["grade_unique_values"] = zoho_details.get("grade_unique_values")

        base_school = school_profiles.build_school_from_record(doc)
        # total_selections = selections_count.get(school_id, 0)
        last_updated = latest_selection_timestamp.get(school_id) or doc.get("timestamp")

        schools_with_details.append(
            SchoolWithSelections(
                **base_school.dict(),
                # total_selections=total_selections,
                last_updated=last_updated,
            )
        )
    
    
    return PaginatedSchoolResponse(schools=schools_with_details, total_count=
                                   
                                count_value)


@router.delete("/admin/schools/{school_id}")
def delete_school(school_id: str, authorization: Optional[str] = Header(None)):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    if user_record.get("role") != "super-admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    school_query = db.collection("schools").where("school_id", "==", school_id)
    school_docs = [doc for doc in school_query.stream()]
    for doc in school_docs:
        doc.reference.delete()
    school_result_deleted_count = len(school_docs)

    selection_query = db.collection("rhyme_selections").where("school_id", "==", school_id)
    selection_docs = [doc for doc in selection_query.stream()]
    for doc in selection_docs:
        doc.reference.delete()
    selection_result_deleted_count = len(selection_docs)

    if school_result_deleted_count == 0 and selection_result_deleted_count == 0:
        raise HTTPException(status_code=404, detail="School not found")

    return {
        "message": "School and associated rhymes removed successfully",
        "removed_school": school_result_deleted_count,
        "removed_selections": selection_result_deleted_count,
    }
