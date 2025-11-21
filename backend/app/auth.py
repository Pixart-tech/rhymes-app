"""Authentication models and router for the Rhymes application."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel, Field


class School(BaseModel):
    """Representation of a school registered with the application."""

    id: str
    school_id: str
    school_name: str
    logo_blob_base64: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tagline: Optional[str] = None
    principal_name: Optional[str] = None
    principal_email: Optional[str] = None
    principal_phone: Optional[str] = None
    service_type: Optional[List[str]] = None
    created_by_user_id: Optional[str] = None
    created_by_email: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SchoolCreate(BaseModel):
    """Input model for registering a new school."""

    id_token: str


def create_auth_router(db) -> APIRouter:
    """Create and return a router exposing authentication endpoints."""

    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/login", response_model=School)
    def login_school(input: SchoolCreate):
        """Register or fetch a school based on the Firebase user token."""

        try:
            decoded_token = firebase_auth.verify_id_token(input.id_token)
        except Exception as exc:  # pragma: no cover - firebase library raises many subclasses
            raise HTTPException(status_code=401, detail="Invalid or expired Firebase token") from exc

        uid = decoded_token.get("uid")
        if not uid:
            raise HTTPException(status_code=400, detail="Firebase token is missing a user id")

        school_name = decoded_token.get("name") or decoded_token.get("email") or "School Admin"

        doc_ref = db.collection("schools").document(uid)
        doc_snapshot = doc_ref.get()

        if doc_snapshot.exists:
            existing = doc_snapshot.to_dict()
            return School(**existing)

        school_obj = School(id=uid, school_id=uid, school_name=school_name)
        doc_ref.set(school_obj.dict())
        return school_obj

    return router
