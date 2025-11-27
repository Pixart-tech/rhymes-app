from __future__ import annotations

import logging
import string
from datetime import datetime
import json
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

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
        )


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
        )


def _clean_optional_string(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


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
        created_by_user_id=record.get("created_by_user_id"),
        created_by_email=record.get("created_by_email"),
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

    school_id = generate_school_id(db)
    now = datetime.utcnow()

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
        "address": _clean_optional_string(payload.address),
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
        "created_by_user_id": user_id,
        "created_by_email": user_record.get("email"),
        "created_at": now,
        "updated_at": now,
        "timestamp": now,
    }

    db.collection("schools").document(school_id).set(school_payload)
    db.collection("users").document(user_id).update(
        {"school_ids": firestore.ArrayUnion([school_id]), "updated_at": now}
    )

    existing_ids = set(user_record.get("school_ids", []))
    existing_ids.add(school_id)
    user_record["school_ids"] = list(existing_ids)

    return build_school_from_record(school_payload)


__all__ = [
    "SchoolServiceType",
    "SERVICE_TYPE_VALUES",
    "SchoolCreatePayload",
    "SchoolUpdatePayload",
    "build_school_from_record",
    "create_school_profile",
    "extract_service_type",
    "normalize_service_types",
    "normalize_service_status",
    "services_from_status",
    "normalize_grades",
    "compose_address",
]
