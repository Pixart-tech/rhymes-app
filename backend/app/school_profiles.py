from __future__ import annotations

import random
import string
from datetime import datetime
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

from fastapi import Form, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel, EmailStr, Field, field_validator

from .auth import School

SchoolServiceType = Literal["id_cards", "report_cards", "certificates"]
SERVICE_TYPE_VALUES: Tuple[SchoolServiceType, ...] = (
    "id_cards",
    "report_cards",
    "certificates",
)
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


class SchoolCreatePayload(BaseModel):
    school_name: str = Field(..., min_length=2)
    email: EmailStr
    phone: str = Field(..., min_length=5)
    address: str = Field(..., min_length=5)
    tagline: Optional[str] = None
    principal_name: str = Field(..., min_length=2)
    principal_email: EmailStr
    principal_phone: str = Field(..., min_length=5)
    service_type: List[SchoolServiceType] = Field(default_factory=list)

    @field_validator("service_type", mode="before")
    @classmethod
    def _coerce_service_type(cls, value: Any) -> List[SchoolServiceType]:
        if value is None or value == "":
            return []
        return extract_service_type(value)

    @classmethod
    def as_form(
        cls,
        school_name: str = Form(...),
        email: EmailStr = Form(...),
        phone: str = Form(...),
        address: str = Form(...),
        tagline: Optional[str] = Form(default=None),
        principal_name: str = Form(...),
        principal_email: EmailStr = Form(...),
        principal_phone: str = Form(...),
        service_type: Optional[Any] = Form(default=None),
    ) -> "SchoolCreatePayload":
        return cls(
            school_name=school_name,
            email=email,
            phone=phone,
            address=address,
            tagline=tagline,
            principal_name=principal_name,
            principal_email=principal_email,
            principal_phone=principal_phone,
            service_type=service_type,
        )


class SchoolUpdatePayload(BaseModel):
    school_name: Optional[str] = Field(default=None, min_length=2)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, min_length=5)
    address: Optional[str] = Field(default=None, min_length=5)
    tagline: Optional[str] = None
    principal_name: Optional[str] = Field(default=None, min_length=2)
    principal_email: Optional[EmailStr] = None
    principal_phone: Optional[str] = Field(default=None, min_length=5)
    service_type: Optional[List[SchoolServiceType]] = None

    @field_validator("service_type", mode="before")
    @classmethod
    def _coerce_service_type(cls, value: Any) -> Optional[List[SchoolServiceType]]:
        if value is None or value == "":
            return None
        return extract_service_type(value)

    @classmethod
    def as_form(
        cls,
        school_name: Optional[str] = Form(default=None),
        email: Optional[EmailStr] = Form(default=None),
        phone: Optional[str] = Form(default=None),
        address: Optional[str] = Form(default=None),
        tagline: Optional[str] = Form(default=None),
        principal_name: Optional[str] = Form(default=None),
        principal_email: Optional[EmailStr] = Form(default=None),
        principal_phone: Optional[str] = Form(default=None),
        service_type: Optional[Any] = Form(default=None),
    ) -> "SchoolUpdatePayload":
        return cls(
            school_name=school_name,
            email=email,
            phone=phone,
            address=address,
            tagline=tagline,
            principal_name=principal_name,
            principal_email=principal_email,
            principal_phone=principal_phone,
            service_type=service_type,
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

    return School(
        id=record.get("id") or school_id,
        school_id=school_id,
        school_name=record.get("school_name") or "School",
        logo_url=logo_url,
        email=record.get("email"),
        phone=record.get("phone"),
        address=record.get("address"),
        tagline=record.get("tagline"),
        principal_name=record.get("principal_name"),
        principal_email=record.get("principal_email"),
        principal_phone=record.get("principal_phone"),
        service_type=extract_service_type(record.get("service_type")),
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

    school_payload = {
        "id": school_id,
        "school_id": school_id,
        "school_name": payload.school_name.strip(),
        "logo_blob": logo_blob,
        "logo_mime_type": logo_mime_type,
        "email": _clean_optional_string(str(payload.email) if payload.email else None),
        "phone": _clean_optional_string(payload.phone),
        "address": _clean_optional_string(payload.address),
        "tagline": _clean_optional_string(payload.tagline),
        "principal_name": _clean_optional_string(payload.principal_name),
        "principal_email": _clean_optional_string(str(payload.principal_email) if payload.principal_email else None),
        "principal_phone": _clean_optional_string(payload.principal_phone),
        "service_type": normalize_service_types(payload.service_type),
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
]
