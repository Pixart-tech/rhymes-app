from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException

from .. import school_profiles
from ..firebase_service import (
    DEFAULT_USER_ROLE,
    db,
    ensure_user_document,
    verify_and_decode_token,
   
)
from ..schemas import (
    UserSessionResponse,
    WorkspaceUser,
    WorkspaceUserUpdatePayload,
)
from ..models import School


router = APIRouter()


def _lookup_zoho_customer_id(
    school_id: Optional[str], zoho_cache: Dict[str, Optional[str]]
) -> Optional[str]:
    if not school_id:
        return None
    if school_id in zoho_cache:
        return zoho_cache[school_id]
    customer_id = school_profiles.get_zoho_customer_id(db, school_id)
    zoho_cache[school_id] = customer_id
    return customer_id


def _build_workspace_user(record: Dict[str, Any]) -> WorkspaceUser:
    
    return WorkspaceUser(
        uid=record["uid"],
        email=record.get("email"),
        display_name=record.get("display_name"),
        role=record.get("role", DEFAULT_USER_ROLE),
        school_ids=list(record.get("school_ids", [])),
        created_at=record.get("created_at") or datetime.utcnow(),
        updated_at=record.get("updated_at") or datetime.utcnow(),
    )
import time

@router.get("/users/me", response_model=UserSessionResponse)
def get_current_workspace_user(authorization: Optional[str] = Header(None)):
    t0 = time.perf_counter()
    decoded_token = verify_and_decode_token(authorization)
    t1 = time.perf_counter()
    user_record = ensure_user_document(decoded_token)
    t2 = time.perf_counter()
    print("t2-t1",t2-t1,"t1-t0",t1-t0)
    user_email = user_record.get("email")
    existing_ids = user_record.get("school_ids") or []
    
    role=user_record.get("role")
    t_link0 = time.perf_counter()
    if role!="super-admin" :
       
        
            if user_email and not (existing_ids):
                school_ids_for_email = school_profiles.find_school_ids_by_email(db, user_email)
            
                if school_ids_for_email:
                    existing_ids_list = list(user_record.get("school_ids", []))
                    existing_ids_set = set(existing_ids_list)
                    new_ids = [
                        school_id
                        for school_id in sorted(school_ids_for_email)
                        if school_id not in existing_ids_set
                    ]
                    if new_ids:
                        updated_ids = existing_ids_list + new_ids
                        now = datetime.utcnow()
                        db.collection("users").document(user_record["uid"]).update(
                            {"school_ids": updated_ids, "updated_at": now}
                        )
                        user_record["school_ids"] = updated_ids
    t_link1 = time.perf_counter()
    workspace_user = _build_workspace_user(user_record)
    t3 = time.perf_counter()
    # print("timing ms:",
    #     "auth", (t1-t0)*1000,
    #     "ensure_user", (t2-t1)*1000,
    #     "link_ids", (t_link1-t_link0)*1000,
    #     "build_user", (t3-t_link1)*1000)
    
    if workspace_user.role == "super-admin":
       
        return UserSessionResponse(user=workspace_user, schools=[])
    zoho_cache: Dict[str, Optional[str]] = {}
    schools: List[School] = []
    seen_branch_ids = set()
    branch_parent_ids: List[str] = []
    t_school_total0 = time.perf_counter()
    
    school_fields = [
  "school_id","school_name","email","phone","address","city","state","pin","website",
  "facebook_link","instagram_link","tagline",
  "principal_name","principal_email","principal_phone",
  "sales_representative",
  "grades","branch_parent_id","branches",
  "status","selection_status",
  "grade_default_labels"
]
    
    for school_id in workspace_user.school_ids:
        if not school_id:
            continue
        
        doc_ref = db.collection("schools").document(school_id)
        t_get0 = time.perf_counter()
        snapshot = doc_ref.get(field_paths=school_fields)
        t_get1 = time.perf_counter()
        if not snapshot.exists:
            continue
        record = snapshot.to_dict() or {}
        record.setdefault("id", snapshot.id)
        record.setdefault("school_id", record.get("school_id") or snapshot.id)

        # zoho_school_id = record.get("branch_parent_id") or record.get("school_id")
        # t_zoho0 = time.perf_counter()
        # if zoho_school_id:
        #     record["zoho_customer_id"] = _lookup_zoho_customer_id(zoho_school_id, zoho_cache)
        # t_zoho1 = time.perf_counter()
        schools.append(school_profiles.build_school_from_record(record))
       
        branch_parent_id = record.get("school_id") or record.get("id")
        branch_parent_ids.append(branch_parent_id)
        seen_branch_ids.add(branch_parent_id)

        raw_branches = record.get("branches") or {}
        branch_entries = list(raw_branches.values()) if isinstance(raw_branches, dict) else list(raw_branches)
        t_br0 = time.perf_counter()
        for branch_entry in branch_entries:
            if not isinstance(branch_entry, dict):
                continue
            branch_record = dict(branch_entry)
            branch_record.setdefault("id", branch_record.get("school_id") or branch_record.get("id"))
            branch_record.setdefault("school_id", branch_record.get("school_id") or branch_record.get("id"))
            branch_record.setdefault("branch_parent_id", branch_parent_id)
            branch_record["zoho_customer_id"] = record.get("zoho_customer_id")
            seen_branch_ids.add(branch_record["school_id"])
            schools.append(school_profiles.build_school_from_record(branch_record))
        # t_br1 = time.perf_counter()
        # print("school", school_id, "ms:",
        #     "get", (t_get1-t_get0)*1000,
        #     # "zoho", (t_zoho1-t_zoho0)*1000,
        #     "branches", (t_br1-t_br0)*1000)
        # t_school_total1 = time.perf_counter()
        # print("TOTAL ms:",
        # "auth", (t1-t0)*1000,
        # "ensure_user", (t2-t1)*1000,
        # "link_ids", (t_link1-t_link0)*1000,
        # "build_user", (t3-t2)*1000,
        # "schools_total", (t_school_total1-t_school_total0)*1000,
        # "all", (t_school_total1-t0)*1000)
    # for parent_id in set(branch_parent_ids):
    #     branch_docs_query = (
    #         db.collection("schools").where("branch_parent_id", "==", parent_id).stream()
    #     )
    #     zoho_customer_id = _lookup_zoho_customer_id(parent_id, zoho_cache)
    #     for branch_doc in branch_docs_query:
    #         branch_data = branch_doc.to_dict() or {}
    #         branch_id = branch_data.get("school_id") or branch_doc.id
    #         if branch_id in seen_branch_ids:
    #             continue
    #         branch_data.setdefault("branch_parent_id", parent_id)
    #         branch_data["zoho_customer_id"] = zoho_customer_id
    #         branch = school_profiles.build_school_from_record(branch_data)
    #         schools.append(branch)
    #         seen_branch_ids.add(branch_id)
             

    return UserSessionResponse(user=workspace_user, schools=schools)


@router.patch("/users/me", response_model=WorkspaceUser)
def update_current_workspace_user(
    payload: WorkspaceUserUpdatePayload, authorization: Optional[str] = Header(None)
):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)

    updates: Dict[str, Any] = {}
    if payload.display_name is not None:
        display_name = payload.display_name.strip()
        if not display_name:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")
        updates["display_name"] = display_name

    if payload.email is not None:
        updates["email"] = str(payload.email)

    if not updates:
        return _build_workspace_user(user_record)

    updates["updated_at"] = datetime.utcnow()
    uid = user_record["uid"]
    db.collection("users").document(uid).update(updates)
    user_record.update(updates)
    
    return _build_workspace_user(user_record)
