from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field

from .firebase_service import DEFAULT_USER_ROLE
from .models import School


class BranchStatusUpdatePayload(BaseModel):
    status: Literal["active", "inactive"]


class WorkspaceUser(BaseModel):
    uid: str
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    role: Literal["super-admin", "user"] = DEFAULT_USER_ROLE
    school_ids: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserSessionResponse(BaseModel):
    user: WorkspaceUser
    schools: List[School] = Field(default_factory=list)


class WorkspaceUserUpdatePayload(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=2)
    email: Optional[EmailStr] = None


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
    grade_selections: Dict[str, List[RhymeSelectionDetail]] = Field(default_factory=dict)


class GradeStatus(BaseModel):
    grade: str
    selected_count: int
    total_available: int


class PaginatedSchoolResponse(BaseModel):
    schools: List[SchoolWithSelections]
    total_count: int
