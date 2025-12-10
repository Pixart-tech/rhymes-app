from __future__ import annotations

from datetime import datetime
import mimetypes
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response

from .. import school_profiles
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
    RhymeSelectionDetail,
    SchoolWithSelections,
)


router = APIRouter()


def _clean(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


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
    return contents, upload_file.content_type or "application/octet-stream"


@router.post("/schools", response_model=school_profiles.School)
async def create_school_profile(
    payload: school_profiles.SchoolCreatePayload = Depends(school_profiles.SchoolCreatePayload.as_form),
    logo_file: Optional[UploadFile] = File(None),
    school_image_1: Optional[UploadFile] = File(None),
    school_image_2: Optional[UploadFile] = File(None),
    school_image_3: Optional[UploadFile] = File(None),
    school_image_4: Optional[UploadFile] = File(None),
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    logo_blob, logo_mime_type = await _read_upload_file(logo_file)
    school_image_blobs = []
    total_image_bytes = 0
    for upload in (school_image_1, school_image_2, school_image_3, school_image_4):
        blob, mime = await _read_upload_file(upload)
        if blob:
            total_image_bytes += len(blob)
        school_image_blobs.append((blob, mime))
    if total_image_bytes > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Total school images must be 2MB or less")
    return school_profiles.create_school_profile(db, payload, user_record, logo_blob, logo_mime_type, school_image_blobs)


@router.post("/branches", response_model=school_profiles.School)
def create_branch_profile(
    payload: school_profiles.BranchCreatePayload,
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    return school_profiles.create_branch_profile(db, payload, user_record)


@router.put("/schools/{school_id}", response_model=school_profiles.School)
async def update_school_profile(
    school_id: str,
    payload: school_profiles.SchoolUpdatePayload = Depends(school_profiles.SchoolUpdatePayload.as_form),
    logo_file: Optional[UploadFile] = File(None),
    school_image_1: Optional[UploadFile] = File(None),
    school_image_2: Optional[UploadFile] = File(None),
    school_image_3: Optional[UploadFile] = File(None),
    school_image_4: Optional[UploadFile] = File(None),
    authorization: Optional[str] = Header(None),
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    uid = user_record["uid"]
    role = user_record.get("role", DEFAULT_USER_ROLE)

    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    existing = snapshot.to_dict() or {}
    if existing.get("created_by_user_id") != uid and role != "super-admin":
        raise HTTPException(status_code=403, detail="You do not have permission to edit this school")

    raw_updates = payload.dict(exclude_unset=True)
    email_provided = "email" in raw_updates
    principal_email_provided = "principal_email" in raw_updates
    raw_email_value = raw_updates.pop("email", None) if email_provided else None
    raw_principal_value = raw_updates.pop("principal_email", None) if principal_email_provided else None
    normalized_email = None
    normalized_principal_email = None
    if email_provided:
        normalized_email = school_profiles._ensure_unique_email(
            db, raw_email_value, "school email", exclude_school_id=school_id
        )
    if principal_email_provided:
        normalized_principal_email = school_profiles._ensure_unique_email(
            db, raw_principal_value, "principal email", exclude_school_id=school_id
        )
    logo_blob, logo_mime_type = await _read_upload_file(logo_file)
    school_image_blobs = []
    total_image_bytes = 0
    for upload in (school_image_1, school_image_2, school_image_3, school_image_4):
        blob, mime = await _read_upload_file(upload)
        if blob:
            total_image_bytes += len(blob)
        school_image_blobs.append((blob, mime))
    if total_image_bytes > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Total school images must be 2MB or less")

    service_status_raw = raw_updates.pop("service_status", None)
    grades_raw = raw_updates.pop("grades", None)
    address_fields = ("address_line1", "city", "state", "pin")
    address_overrides: Dict[str, Any] = {field: raw_updates.pop(field) for field in address_fields if field in raw_updates}

    updates: Dict[str, Any] = {}
    for key, value in raw_updates.items():
        if key == "service_type":
            updates[key] = school_profiles.normalize_service_types(value)
        else:
            updates[key] = _clean(value)

    if address_overrides:
        cleaned_address = {field: _clean(address_overrides[field]) for field in address_overrides}
        updates.update(cleaned_address)
        merged_address = {
            field: cleaned_address[field] if field in cleaned_address else existing.get(field)
            for field in address_fields
        }

    if service_status_raw is not None:
        normalized_status = school_profiles.normalize_service_status(service_status_raw)
        updates["service_status"] = normalized_status
        updates["service_type"] = school_profiles.services_from_status(normalized_status)
    elif "service_type" in updates:
        updates["service_status"] = {
            service: ("yes" if service in updates["service_type"] else "no")
            for service in school_profiles.SERVICE_TYPE_VALUES
        }

    if grades_raw is not None:
        updates["grades"] = school_profiles.normalize_grades(grades_raw)

    if logo_blob is not None:
        updates["logo_blob"] = logo_blob
        updates["logo_mime_type"] = logo_mime_type
    if school_image_blobs:
        for idx, (blob, mime) in enumerate(school_image_blobs, start=1):
            if blob:
                updates[f"school_image_{idx}"] = blob
                updates[f"school_image_{idx}_mime"] = mime

    if email_provided:
        updates["email"] = normalized_email
    if principal_email_provided:
        updates["principal_email"] = normalized_principal_email

    if not updates:
        existing.setdefault("id", snapshot.id)
        existing.setdefault("school_id", snapshot.id)
        return school_profiles.build_school_from_record(existing)

    now = datetime.utcnow()
    updates["updated_at"] = now
    updates["timestamp"] = now
    doc_ref.update(updates)
    existing.update(updates)
    existing.setdefault("id", snapshot.id)
    existing.setdefault("school_id", snapshot.id)

    return school_profiles.build_school_from_record(existing)


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

    doc_ref = db.collection("schools").document(school_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="School not found")

    record = snapshot.to_dict() or {}
    parent_id = record.get("branch_parent_id")
    if not parent_id:
        raise HTTPException(status_code=400, detail="Only branch profiles can have their status updated")

    role = user_record.get("role", DEFAULT_USER_ROLE)
    if role != "super-admin" and record.get("created_by_user_id") != uid:
        raise HTTPException(status_code=403, detail="You do not have permission to update this branch")

    branch_status: school_profiles.BranchStatus = payload.status
    if branch_status not in (school_profiles.BRANCH_STATUS_ACTIVE, school_profiles.BRANCH_STATUS_INACTIVE):
        raise HTTPException(status_code=400, detail="Invalid branch status")

    now = datetime.utcnow()
    updates = {
        "status": branch_status,
        "updated_at": now,
        "timestamp": now,
    }
    doc_ref.update(updates)
    record.update(updates)

    return school_profiles.build_school_from_record(record)


@router.patch("/admin/schools/{school_id}/approve-selections", response_model=school_profiles.School)
def approve_school_selections(
    school_id: str,
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
    updates = {
        "selection_status": "approved",
        "selections_approved": True,
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

    return school_profiles.build_school_from_record(record)


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

    media_type = record.get("logo_mime_type") or "image/jpeg"
    headers = {"Cache-Control": "no-store"}
    return Response(content=bytes(logo_blob), media_type=media_type, headers=headers)


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


@router.get("/admin/schools", response_model=PaginatedSchoolResponse)
def get_all_schools_with_selections(
    page: int = 1, limit: int = 10, authorization: Optional[str] = Header(None)
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    if user_record.get("role") != "super-admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    total_schools_query = db.collection("schools")
    total_count = len(list(total_schools_query.stream()))

    offset = (page - 1) * limit
    school_docs_query = (
        db.collection("schools")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
    )
    all_school_docs = [doc.to_dict() for doc in school_docs_query.stream()]
    school_docs = all_school_docs[offset : offset + limit]

    if not school_docs:
        return PaginatedSchoolResponse(schools=[], total_count=total_count)

    school_ids = [doc.get("school_id") for doc in school_docs if doc.get("school_id")]

    selection_docs = []
    if school_ids:
        selection_docs_query = db.collection("rhyme_selections").where("school_id", "in", school_ids)
        selection_docs = [doc.to_dict() for doc in selection_docs_query.stream()]

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
        if not school_id:
            continue

        if not doc.get("id"):
            doc["id"] = school_id

        base_school = school_profiles.build_school_from_record(doc)

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
                **base_school.dict(),
                total_selections=total_selections,
                last_updated=last_updated,
                grade_selections=grade_map,
            )
        )

    return PaginatedSchoolResponse(schools=schools_with_details, total_count=total_count)


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
