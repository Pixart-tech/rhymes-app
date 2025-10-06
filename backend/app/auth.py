"""Authentication models and router for the Rhymes application."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field


class School(BaseModel):
    """Representation of a school registered with the application."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    school_id: str
    school_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SchoolCreate(BaseModel):
    """Input model for registering a new school."""

    school_id: str
    school_name: str


def create_auth_router(db) -> APIRouter:
    """Create and return a router exposing authentication endpoints."""

    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/login", response_model=School)
    async def login_school(input: SchoolCreate):
        """Register a school if it does not exist and return its record."""

        existing_school = await db.schools.find_one({"school_id": input.school_id})

        if existing_school:
            return School(**existing_school)

        school_dict = input.dict()
        school_obj = School(**school_dict)
        await db.schools.insert_one(school_obj.dict())
        return school_obj

    return router
