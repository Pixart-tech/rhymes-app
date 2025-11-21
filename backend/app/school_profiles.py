from __future__ import annotations

import base64
import binascii
import random
import string
from datetime import datetime
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

from fastapi import HTTPException
from firebase_admin import firestore
from pydantic import BaseModel, EmailStr, Field

from .auth import School

SchoolServiceType = Literal["id_cards", "report_cards", "certificates"]
SERVICE_TYPE_VALUES: Tuple[SchoolServiceType, ...] = (
    "id_cards",
    "report_cards",
    "certificates",
)
SCHOOL_ID_ALPHABET = string.ascii_uppercase + string.digits


class SchoolCreatePayload(BaseModel):
    school_name: str = Field(..., min_length=2)
    logo_blob_base64: Optional[str] = None
    email: EmailStr
    phone: str = Field(..., min_length=5)
    address: str = Field(..., min_length=5)
    tagline: Optional[str] = None
    principal_name: str = Field(..., min_length=2)
    principal_email: EmailStr
    principal_phone: str = Field(..., min_length=5)
    service_type: List[SchoolServiceType] = Field(default_factory=list)


class SchoolUpdatePayload(BaseModel):
    school_name: Optional[str] = Field(default=None, min_length=2)
    logo_blob_base64: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, min_length=5)
    address: Optional[str] = Field(default=None, min_length=5)
    tagline: Optional[str] = None
    principal_name: Optional[str] = Field(default=None, min_length=2)
    principal_email: Optional[EmailStr] = None
    principal_phone: Optional[str] = Field(default=None, min_length=5)
    service_type: Optional[List[SchoolServiceType]] = None


def _clean_optional_string(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def decode_logo_blob_base64(value: Optional[str]) -> Optional[bytes]:
    if not value:
        return None
    if isinstance(value, str) and value.startswith("data:"):
        value = value.split(",", 1)[-1]
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Logo image payload is invalid") from exc


def encode_logo_blob(blob: Optional[Any]) -> Optional[str]:
    if isinstance(blob, memoryview):
        blob = blob.tobytes()
    if isinstance(blob, bytearray):
        blob = bytes(blob)
    if not blob:
        return None
    if isinstance(blob, str):
        return blob
    if isinstance(blob, bytes):
        return base64.b64encode(blob).decode("ascii")
    return None


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


def build_school_from_record(record: Dict[str, Any]) -> School:
    now = datetime.utcnow()
    school_id = record.get("school_id") or record.get("id")
    if not school_id:
        raise HTTPException(status_code=500, detail="School record is missing an id")

    return School(
        id=record.get("id") or school_id,
        school_id=school_id,
        school_name=record.get("school_name") or "School",
        logo_blob_base64=encode_logo_blob(record.get("logo_blob")),
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
        "logo_blob": decode_logo_blob_base64(payload.logo_blob_base64),
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
    "decode_logo_blob_base64",
    "encode_logo_blob",
    "extract_service_type",
    "normalize_service_types",
]
