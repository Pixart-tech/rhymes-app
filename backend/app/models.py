from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class School(BaseModel):
    """Representation of a school registered with the application."""

    id: str
    school_id: str
    school_name: str
    logo_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin: Optional[str] = None
    website: Optional[str] = None
    tagline: Optional[str] = None
    principal_name: Optional[str] = None
    principal_email: Optional[str] = None
    principal_phone: Optional[str] = None
    service_type: Optional[List[str]] = None
    service_status: Optional[Dict[str, str]] = None
    grades: Optional[Dict[str, Dict[str, Any]]] = None
    branch_parent_id: Optional[str] = None
    created_by_user_id: Optional[str] = None
    created_by_email: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
