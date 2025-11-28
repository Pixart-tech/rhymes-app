from __future__ import annotations

import logging
import random
import string
from datetime import datetime
import json
from typing import Any, Dict, Iterable, List, Literal, Optional, Set, Tuple

from fastapi import Form, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel, EmailStr, Field, field_validator

from .models import School

SchoolServiceType = Literal["id_cards", "report_cards", "certificates"]
SERVICE_TYPE_VALUES: Tuple[SchoolServiceType, ...] = (
    "id_cards",
    "report_cards",
    "certificates",
)
SERVICE_STATUS_VALUES = ("yes", "no")
ServiceStatus = Literal["yes", "no"]
ServiceStatusMap = Dict[SchoolServiceType, ServiceStatus]
GradeKey = Literal["toddler", "playgroup", "nursery", "lkg", "ukg"]
GRADE_KEYS: Tuple[GradeKey, ...] = ("toddler", "playgroup", "nursery", "lkg", "ukg")

SCHOOL_ID_ALPHABET = string.ascii_uppercase + string.digits

BranchStatus = Literal["active", "inactive"]
BRANCH_STATUS_ACTIVE: BranchStatus = "active"
BRANCH_STATUS_INACTIVE: BranchStatus = "inactive"


def normalize_service_types(values: Optional[Iterable[SchoolServiceType]]) -> List[SchoolServiceType]:
    normalized: List[SchoolServiceType] = []
    if not values:
        return normalized
    for value in values:
        if value in SERVICE_TYPE_VALUES and value not in normalized:
            normalized.append(value)
    return normalized


def extract_service_type(value: Any) -> List[SchoolServiceType]:
    if isinstance(value, list):
        return normalize_service_types(value)
    if isinstance(value, dict):
        extracted: List[SchoolServiceType] = []
        for key, checked in value.items():
            if isinstance(key, str) and bool(checked) and key in SERVICE_TYPE_VALUES:
                extracted.append(key)  # type: ignore[arg-type]
        return normalize_service_types(extracted)
    if isinstance(value, str):
        return normalize_service_types([value]) if value in SERVICE_TYPE_VALUES else []
    return []


def _parse_json_field(value: Any) -> Optional[Any]:
    if value is None or value == "":
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return None


def _normalize_id_card_fields(value: Optional[Any]) -> Optional[List[str]]:
    if value is None or value == "":
        return None

    parsed: Any = value
    if isinstance(value, str):
        parsed = _parse_json_field(value)

    if parsed is None:
        return None

    normalized: List[str] = []
    seen: Set[str] = set()

    if isinstance(parsed, list):
        for entry in parsed:
            if not isinstance(entry, str):
                continue
            trimmed = entry.strip()
            if not trimmed or trimmed in seen:
                continue
            seen.add(trimmed)
            normalized.append(trimmed)
        return normalized

    return None


def normalize_service_status(value: Optional[Any]) -> ServiceStatusMap:
    base: ServiceStatusMap = {service: "no" for service in SERVICE_TYPE_VALUES}
    parsed = _parse_json_field(value)
    if isinstance(parsed, dict):
        for key, raw_status in parsed.items():
            if key in SERVICE_TYPE_VALUES and isinstance(raw_status, str):
                status = raw_status.lower()
                if status in SERVICE_STATUS_VALUES:
                    base[key] = status  # type: ignore[assignment]
    return base


def services_from_status(status_map: ServiceStatusMap) -> List[SchoolServiceType]:
    return [service for service, status in status_map.items() if status == "yes"]


def normalize_grades(value: Optional[Any]) -> Dict[GradeKey, Dict[str, Any]]:
    normalized: Dict[GradeKey, Dict[str, Any]] = {
        key: {"enabled": False, "label": ""} for key in GRADE_KEYS
    }
    parsed = _parse_json_field(value)
    if isinstance(parsed, dict):
        for key in GRADE_KEYS:
            entry = parsed.get(key)
            if isinstance(entry, dict):
                enabled = bool(entry.get("enabled"))
                label_raw = entry.get("label")
                label = label_raw.strip() if isinstance(label_raw, str) else ""
                normalized[key] = {"enabled": enabled, "label": label}
    return normalized


def compose_address(
    line1: Optional[str],
    city: Optional[str],
    state: Optional[str],
    pin: Optional[str],
) -> str:
    segments: List[str] = []
    if line1:
        segments.append(line1.strip())
    if city:
        segments.append(city.strip())
    if state or pin:
        state_segment = state.strip() if state else ""
        pin_segment = pin.strip() if pin else ""
        if state_segment and pin_segment:
            segments.append(f"{state_segment} - {pin_segment}")
        elif state_segment:
            segments.append(state_segment)
        elif pin_segment:
            segments.append(pin_segment)
    return ", ".join(segment for segment in segments if segment)


class SchoolCreatePayload(BaseModel):
    school_name: str = Field(..., min_length=2)
    email: EmailStr
    phone: str = Field(..., min_length=5)

    tagline: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin: Optional[str] = None
    website: Optional[str] = None
    principal_name: str = Field(..., min_length=2)
    principal_email: EmailStr
    principal_phone: str = Field(..., min_length=5)
    service_type: List[SchoolServiceType] = Field(default_factory=list)
    service_status: Optional[Dict[SchoolServiceType, ServiceStatus]] = None
    grades: Optional[Dict[GradeKey, Dict[str, Any]]] = None
    id_card_fields: Optional[List[str]] = None

    @field_validator("service_type", mode="before")
    @classmethod
    def _coerce_service_type(cls, value: Any) -> List[SchoolServiceType]:
        if value is None or value == "":
            return []
        return extract_service_type(value)

    @field_validator("service_status", mode="before")
    @classmethod
    def _coerce_service_status(cls, value: Any) -> Optional[Dict[SchoolServiceType, ServiceStatus]]:
        if value is None or value == "":
            return None
        parsed = _parse_json_field(value)
        if not isinstance(parsed, dict):
            raise ValueError("Invalid service status payload")
        normalized: Dict[SchoolServiceType, ServiceStatus] = {}
        for key, entry in parsed.items():
            if key in SERVICE_TYPE_VALUES and isinstance(entry, str):
                status = entry.lower()
                if status in SERVICE_STATUS_VALUES:
                    normalized[key] = status  # type: ignore[assignment]
        return normalized or None

    @field_validator("grades", mode="before")
    @classmethod
    def _coerce_grades(cls, value: Any) -> Optional[Dict[GradeKey, Dict[str, Any]]]:
        if value is None or value == "":
            return None
        parsed = _parse_json_field(value)
        if not isinstance(parsed, dict):
            raise ValueError("Invalid grades payload")
        normalized: Dict[GradeKey, Dict[str, Any]] = {}
        for key in GRADE_KEYS:
            entry = parsed.get(key)
            if isinstance(entry, dict):
                enabled = bool(entry.get("enabled"))
                label_raw = entry.get("label")
                normalized[key] = {
                    "enabled": enabled,
                    "label": label_raw.strip() if isinstance(label_raw, str) else ""
                }
        return normalized or None

    @field_validator("id_card_fields", mode="before")
    @classmethod
    def _coerce_id_card_fields(cls, value: Any) -> Optional[List[str]]:
        return _normalize_id_card_fields(value)

    @classmethod
    def as_form(
        cls,
        school_name: str = Form(...),
        email: EmailStr = Form(...),
        phone: str = Form(...),
        tagline: Optional[str] = Form(default=None),
        address_line1: Optional[str] = Form(default=None),
        city: Optional[str] = Form(default=None),
        state: Optional[str] = Form(default=None),
        pin: Optional[str] = Form(default=None),
        website: Optional[str] = Form(default=None),
        principal_name: str = Form(...),
        principal_email: EmailStr = Form(...),
        principal_phone: str = Form(...),
        service_type: Optional[Any] = Form(default=None),
        service_status: Optional[Any] = Form(default=None),
        grades: Optional[Any] = Form(default=None),
        id_card_fields: Optional[Any] = Form(default=None),
    ) -> "SchoolCreatePayload":
        return cls(
            school_name=school_name,
            email=email,
            phone=phone,
            tagline=tagline,
            address_line1=address_line1,
            city=city,
            state=state,
            pin=pin,
            website=website,
            principal_name=principal_name,
            principal_email=principal_email,
            principal_phone=principal_phone,
            service_type=service_type,
            service_status=service_status,
            grades=grades,
            id_card_fields=id_card_fields,
        )


class BranchCreatePayload(BaseModel):
    parent_school_id: str = Field(..., min_length=1)
    branch_name: str = Field(..., min_length=2)
    coordinator_name: str = Field(..., min_length=2)
    coordinator_email: EmailStr
    coordinator_phone: str = Field(..., min_length=5)

    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin: Optional[str] = None


class SchoolUpdatePayload(BaseModel):
    school_name: Optional[str] = Field(default=None, min_length=2)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, min_length=5)

    tagline: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin: Optional[str] = None
    website: Optional[str] = None
    principal_name: Optional[str] = Field(default=None, min_length=2)
    principal_email: Optional[EmailStr] = None
    principal_phone: Optional[str] = Field(default=None, min_length=5)
    service_type: Optional[List[SchoolServiceType]] = None
    service_status: Optional[Dict[SchoolServiceType, ServiceStatus]] = None
    grades: Optional[Dict[GradeKey, Dict[str, Any]]] = None
    id_card_fields: Optional[List[str]] = None

    @field_validator("service_type", mode="before")
    @classmethod
    def _coerce_service_type(cls, value: Any) -> Optional[List[SchoolServiceType]]:
        if value is None or value == "":
            return None
        return extract_service_type(value)

    @field_validator("service_status", mode="before")
    @classmethod
    def _coerce_service_status(cls, value: Any) -> Optional[Dict[SchoolServiceType, ServiceStatus]]:
        if value is None or value == "":
            return None
        parsed = _parse_json_field(value)
        if not isinstance(parsed, dict):
            raise ValueError("Invalid service status payload")
        normalized: Dict[SchoolServiceType, ServiceStatus] = {}
        for key, entry in parsed.items():
            if key in SERVICE_TYPE_VALUES and isinstance(entry, str):
                status = entry.lower()
                if status in SERVICE_STATUS_VALUES:
                    normalized[key] = status  # type: ignore[assignment]
        return normalized or None

    @field_validator("grades", mode="before")
    @classmethod
    def _coerce_grades(cls, value: Any) -> Optional[Dict[GradeKey, Dict[str, Any]]]:
        if value is None or value == "":
            return None
        parsed = _parse_json_field(value)
        if not isinstance(parsed, dict):
            raise ValueError("Invalid grades payload")
        normalized: Dict[GradeKey, Dict[str, Any]] = {}
        for key in GRADE_KEYS:
            entry = parsed.get(key)
            if isinstance(entry, dict):
                enabled = bool(entry.get("enabled"))
                label_raw = entry.get("label")
                normalized[key] = {
                    "enabled": enabled,
                    "label": label_raw.strip() if isinstance(label_raw, str) else ""
                }
        return normalized or None

    @field_validator("id_card_fields", mode="before")
    @classmethod
    def _coerce_id_card_fields(cls, value: Any) -> Optional[List[str]]:
        if value is None or value == "":
            return None
        return _normalize_id_card_fields(value)

    @classmethod
    def as_form(
        cls,
        school_name: Optional[str] = Form(default=None),
        email: Optional[EmailStr] = Form(default=None),
        phone: Optional[str] = Form(default=None),
        address: Optional[str] = Form(default=None),
        tagline: Optional[str] = Form(default=None),
        address_line1: Optional[str] = Form(default=None),
        city: Optional[str] = Form(default=None),
        state: Optional[str] = Form(default=None),
        pin: Optional[str] = Form(default=None),
        website: Optional[str] = Form(default=None),
        principal_name: Optional[str] = Form(default=None),
        principal_email: Optional[EmailStr] = Form(default=None),
        principal_phone: Optional[str] = Form(default=None),
        service_type: Optional[Any] = Form(default=None),
        service_status: Optional[Any] = Form(default=None),
        grades: Optional[Any] = Form(default=None),
        id_card_fields: Optional[Any] = Form(default=None),
    ) -> "SchoolUpdatePayload":
        return cls(
            school_name=school_name,
            email=email,
            phone=phone,
            address=address,
            tagline=tagline,
            address_line1=address_line1,
            city=city,
            state=state,
            pin=pin,
            website=website,
            principal_name=principal_name,
            principal_email=principal_email,
            principal_phone=principal_phone,
            service_type=service_type,
            service_status=service_status,
            grades=grades,
            id_card_fields=id_card_fields,
        )


def _clean_optional_string(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def _find_user_by_email(
    db_client: firestore.Client, email: Optional[str]
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    if not email:
        return None, None

    normalized = email.strip()
    if not normalized:
        return None, None

    candidates = []
    normalized_lower = normalized.lower()
    if normalized_lower:
        candidates.append(normalized_lower)
    if normalized_lower != normalized:
        candidates.append(normalized)

    seen: Set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        snapshots = (
            db_client.collection("users").where("email", "==", candidate).limit(1).get()
        )
        if snapshots:
            document = snapshots[0]
            return document.id, document.to_dict() or {}

    return None, None


def build_school_from_record(record: Dict[str, Any]) -> School:
    now = datetime.utcnow()
    school_id = record.get("school_id") or record.get("id")
    if not school_id:
        raise HTTPException(status_code=500, detail="School record is missing an id")
    logo_url: Optional[str] = None
    if record.get("logo_blob"):
        logo_url = f"/api/schools/{school_id}/logo"

    grades_from_record = record.get("grades")
    logging.debug(f"build_school_from_record: grades from record type: {type(grades_from_record)}, value: {grades_from_record}")

    return School(
        id=record.get("id") or school_id,
        school_id=school_id,
        school_name=record.get("school_name") or "School",
        logo_url=logo_url,
        email=record.get("email"),
        phone=record.get("phone"),
        address=record.get("address"),
        address_line1=record.get("address_line1"),
        city=record.get("city"),
        state=record.get("state"),
        pin=record.get("pin"),
        tagline=record.get("tagline"),
        website=record.get("website"),
        principal_name=record.get("principal_name"),
        principal_email=record.get("principal_email"),
        principal_phone=record.get("principal_phone"),
        service_type=extract_service_type(record.get("service_type")),
        service_status=normalize_service_status(record.get("service_status")),
        grades=normalize_grades(grades_from_record),
        branch_parent_id=record.get("branch_parent_id"),
        status=record.get("status") or BRANCH_STATUS_ACTIVE,
        created_by_user_id=record.get("created_by_user_id"),
        created_by_email=record.get("created_by_email"),
        id_card_fields=record.get("id_card_fields"),
        created_at=record.get("created_at") or record.get("timestamp") or now,
        updated_at=record.get("updated_at") or record.get("timestamp") or now,
        timestamp=record.get("timestamp") or record.get("updated_at") or now,
    )


def generate_school_id(db: firestore.Client, length: int = 5, attempts: int = 32) -> str:
    for _ in range(attempts):
        candidate = "".join(random.choices(SCHOOL_ID_ALPHABET, k=length))
        doc_ref = db.collection("schools").document(candidate)
        if not doc_ref.get().exists:
            return candidate
    raise HTTPException(status_code=500, detail="Unable to allocate a new school id")


def create_school_profile(
    db: firestore.Client,
    payload: SchoolCreatePayload,
    user_record: Dict[str, Any],
    logo_blob: Optional[bytes] = None,
    logo_mime_type: Optional[str] = None,
) -> School:
    user_id = user_record.get("uid")
    if not user_id:
        raise HTTPException(status_code=400, detail="User record is missing a user id")

    email_query = (
        db.collection("schools").where("email", "==", str(payload.email)).limit(1).get()
    )
    phone_query = (
        db.collection("schools").where("phone", "==", payload.phone).limit(1).get()
    )

    errors = []
    if email_query:
        errors.append("email")
    if phone_query:
        errors.append("phone number")

    if errors:
        error_parts = " and ".join(errors)
        raise HTTPException(
            status_code=409,
            detail=f"A school with this {error_parts} already exists. Please use a different {error_parts}.",
        )

    school_id = generate_school_id(db)
    now = datetime.utcnow()

    owner_email_input = _clean_optional_string(str(payload.email) if payload.email else None)
    owner_email_value = owner_email_input.lower() if owner_email_input else None
    is_creator_super_admin = user_record.get("role") == "super-admin"
    assignee_id: Optional[str] = user_id
    assignee_record: Optional[Dict[str, Any]] = user_record

    if is_creator_super_admin:
        assignee_id, assignee_record = _find_user_by_email(db, owner_email_input)

    address_line1 = _clean_optional_string(payload.address_line1)
    city = _clean_optional_string(payload.city)
    state = _clean_optional_string(payload.state)
    pin = _clean_optional_string(payload.pin)
    service_status_map = normalize_service_status(payload.service_status)
    grade_map = normalize_grades(payload.grades)

    school_payload = {
        "id": school_id,
        "school_id": school_id,
        "school_name": payload.school_name.strip(),
        "logo_blob": logo_blob,
        "logo_mime_type": logo_mime_type,
        "email": _clean_optional_string(str(payload.email) if payload.email else None),
        "phone": _clean_optional_string(payload.phone),
        "address": compose_address(address_line1, city, state, pin),
        "address_line1": address_line1,
        "city": city,
        "state": state,
        "pin": pin,
        "tagline": _clean_optional_string(payload.tagline),
        "website": _clean_optional_string(payload.website),
        "principal_name": _clean_optional_string(payload.principal_name),
        "principal_email": _clean_optional_string(str(payload.principal_email) if payload.principal_email else None),
        "principal_phone": _clean_optional_string(payload.principal_phone),
        "service_type": services_from_status(service_status_map),
        "service_status": service_status_map,
        "grades": grade_map,
        "id_card_fields": payload.id_card_fields if payload.id_card_fields is not None else [],
        "created_by_user_id": assignee_id,
        "created_by_email": owner_email_value or user_record.get("email"),
        "created_at": now,
        "updated_at": now,
        "timestamp": now,
    }

    db.collection("schools").document(school_id).set(school_payload)
    if assignee_id:
        db.collection("users").document(assignee_id).update(
            {"school_ids": firestore.ArrayUnion([school_id]), "updated_at": now}
        )
        if assignee_record is not None:
            existing_ids = set(assignee_record.get("school_ids", []))
            existing_ids.add(school_id)
            assignee_record["school_ids"] = list(existing_ids)

    return build_school_from_record(school_payload)


def create_branch_profile(
    db: firestore.Client,
    payload: BranchCreatePayload,
    user_record: Dict[str, Any],
) -> School:
    user_id = user_record.get("uid")
    if not user_id:
        raise HTTPException(status_code=400, detail="User record is missing a user id")

    parent_school_id = (payload.parent_school_id or "").strip()
    if not parent_school_id:
        raise HTTPException(status_code=400, detail="Parent school id is required")

    parent_snapshot = db.collection("schools").document(parent_school_id).get()
    if not parent_snapshot.exists:
        raise HTTPException(status_code=404, detail="Parent school not found")

    parent_record = parent_snapshot.to_dict() or {}
    if parent_record.get("branch_parent_id"):
        raise HTTPException(status_code=400, detail="Cannot add a branch to another branch")

    role = user_record.get("role")
    if role != "super-admin" and parent_school_id not in user_record.get("school_ids", []):
        raise HTTPException(status_code=403, detail="You do not have permission to add a branch to this school")

    branch_id = generate_school_id(db)
    now = datetime.utcnow()

    address_line1 = _clean_optional_string(payload.address_line1)
    city = _clean_optional_string(payload.city)
    state = _clean_optional_string(payload.state)
    pin = _clean_optional_string(payload.pin)

    parent_school_name = _clean_optional_string(parent_record.get("school_name"))
    branch_display_name = (
        f"{parent_school_name} - {payload.branch_name.strip()}"
        if parent_school_name
        else payload.branch_name.strip()
    )
    branch_service_status = normalize_service_status(parent_record.get("service_status"))
    branch_service_type = services_from_status(branch_service_status)
    branch_grades = normalize_grades(parent_record.get("grades"))
    branch_tagline = _clean_optional_string(parent_record.get("tagline"))
    branch_website = _clean_optional_string(parent_record.get("website"))
    parent_logo_blob = parent_record.get("logo_blob")
    parent_logo_mime_type = parent_record.get("logo_mime_type")
    coordinator_email = _clean_optional_string(str(payload.coordinator_email))
    coordinator_phone = _clean_optional_string(payload.coordinator_phone)

    branch_payload = {
        "id": branch_id,
        "school_id": branch_id,
        "school_name": branch_display_name,
        "address": compose_address(address_line1, city, state, pin),
        "address_line1": address_line1,
        "city": city,
        "state": state,
        "pin": pin,
        "email": coordinator_email,
        "phone": coordinator_phone,
        "tagline": branch_tagline,
        "website": branch_website,
        "principal_name": _clean_optional_string(payload.coordinator_name),
        "principal_email": coordinator_email,
        "principal_phone": coordinator_phone,
        "service_type": branch_service_type,
        "service_status": branch_service_status,
        "grades": branch_grades,
        "logo_blob": parent_logo_blob,
        "logo_mime_type": parent_logo_mime_type,
        "status": BRANCH_STATUS_ACTIVE,
        "branch_parent_id": parent_school_id,
        "created_by_user_id": user_id,
        "created_by_email": user_record.get("email"),
        "created_at": now,
        "updated_at": now,
        "timestamp": now,
    }

    db.collection("schools").document(branch_id).set(branch_payload)
    db.collection("users").document(user_id).update(
        {"school_ids": firestore.ArrayUnion([branch_id]), "updated_at": now}
    )

    existing_ids = set(user_record.get("school_ids", []))
    existing_ids.add(branch_id)
    user_record["school_ids"] = list(existing_ids)

    return build_school_from_record(branch_payload)


__all__ = [
    "SchoolServiceType",
    "SERVICE_TYPE_VALUES",
    "SchoolCreatePayload",
    "BranchCreatePayload",
    "SchoolUpdatePayload",
    "build_school_from_record",
    "create_school_profile",
    "create_branch_profile",
    "extract_service_type",
    "normalize_service_types",
    "normalize_service_status",
    "services_from_status",
    "normalize_grades",
    "compose_address",
    "BranchStatus",
    "BRANCH_STATUS_ACTIVE",
    "BRANCH_STATUS_INACTIVE",
]
