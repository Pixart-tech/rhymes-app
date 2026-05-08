from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

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
    # total_selections: int = 0
    last_updated: Optional[datetime] = None
    grade_selections: Dict[str, List[RhymeSelectionDetail]] = Field(default_factory=dict)


class GradeStatus(BaseModel):
    grade: str
    selected_count: int
    total_available: int


class PaginatedSchoolResponse(BaseModel):
    schools: List[SchoolWithSelections]
    total_count: int


class AdminSchoolRow(BaseModel):
    school_id: str
    school_name: str
    logo_url: Optional[str] = None
    sales_representative: Optional[str] = None
    branch_parent_id: Optional[str] = None
    branch_ids: Optional[List[str]] = None
    grades: Optional[Dict[str, Dict[str, Any]]] = None
    service_status: Optional[Dict[str, str]] = None
    service_type: Optional[List[str]] = None
    id_card_fields: Optional[List[str]] = None
  
    selection_status: Optional[str] = None
    selections_approved: Optional[bool] = None
    timestamp: Optional[datetime] = None
    last_updated: Optional[datetime] = None


class PaginatedAdminSchoolResponse(BaseModel):
    schools: List[AdminSchoolRow]
   
