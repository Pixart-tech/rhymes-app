"""Authentication models and router for the Rhymes application."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from firebase_admin import auth as firebase_auth
from pydantic import BaseModel, Field

from .models import School




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
            return build_school_from_record(existing)

        school_obj = School(id=uid, school_id=uid, school_name=school_name)
        doc_ref.set(school_obj.dict())
        return school_obj

    return router
