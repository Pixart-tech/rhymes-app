from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException

from .. import school_profiles
from ..firebase_service import (
    DEFAULT_USER_ROLE,
    db,
    ensure_user_document,
    firestore,
    verify_and_decode_token,
)
from ..schemas import (
    UserSessionResponse,
    WorkspaceUser,
    WorkspaceUserUpdatePayload,
)
from ..models import School


router = APIRouter()


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


@router.get("/users/me", response_model=UserSessionResponse)
def get_current_workspace_user(authorization: Optional[str] = Header(None)):
    decoded_token = verify_and_decode_token(authorization)
    user_record = ensure_user_document(decoded_token)
    workspace_user = _build_workspace_user(user_record)
    if workspace_user.role != "super-admin" and workspace_user.email:
        normalized_email = workspace_user.email.strip().lower()
        if normalized_email:
            school_snapshots = (
                db.collection("schools").where("created_by_email", "==", normalized_email).get()
            )
            new_school_ids: List[str] = []
            sync_timestamp = datetime.utcnow()

            for snapshot in school_snapshots:
                school_id = snapshot.id
                if school_id in workspace_user.school_ids:
                    continue

                school_data = snapshot.to_dict() or {}
                school_updates: Dict[str, Any] = {}
                if school_data.get("created_by_user_id") != workspace_user.uid:
                    school_updates["created_by_user_id"] = workspace_user.uid
                if school_updates:
                    school_updates["updated_at"] = sync_timestamp
                    db.collection("schools").document(school_id).update(school_updates)

                new_school_ids.append(school_id)

            if new_school_ids:
                db.collection("users").document(workspace_user.uid).update(
                    {"school_ids": firestore.ArrayUnion(new_school_ids), "updated_at": sync_timestamp}
                )
                workspace_user.school_ids.extend(new_school_ids)

    schools: List[School] = []
    seen_branch_ids = set()
    branch_parent_ids: List[str] = []
    for school_id in workspace_user.school_ids:
        if not school_id:
            continue
        doc_ref = db.collection("schools").document(school_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            continue
        record = snapshot.to_dict() or {}
        record.setdefault("id", snapshot.id)
        record.setdefault("school_id", record.get("school_id") or snapshot.id)
        zoho_school_id = record.get("branch_parent_id") or record.get("school_id")
        if zoho_school_id:
            record["zoho_customer_id"] = school_profiles.get_zoho_customer_id(db, zoho_school_id)
        schools.append(school_profiles.build_school_from_record(record))
        branch_parent_id = record.get("school_id") or record.get("id")
        branch_parent_ids.append(branch_parent_id)
        seen_branch_ids.add(branch_parent_id)
        raw_branches = record.get("branches") or {}
        branch_entries = list(raw_branches.values()) if isinstance(raw_branches, dict) else list(raw_branches)
        for branch_entry in branch_entries:
            if not isinstance(branch_entry, dict):
                continue
            branch_record = dict(branch_entry)
            branch_record.setdefault("id", branch_record.get("school_id") or branch_record.get("id"))
            branch_record.setdefault("school_id", branch_record.get("school_id") or branch_record.get("id"))
            branch_parent_id = record.get("school_id") or record.get("id")
            branch_record.setdefault("branch_parent_id", branch_parent_id)
            branch_record["zoho_customer_id"] = record.get("zoho_customer_id")
            seen_branch_ids.add(branch_record["school_id"])
            schools.append(school_profiles.build_school_from_record(branch_record))
    for parent_id in set(branch_parent_ids):
        branch_docs_query = (
            db.collection("schools").where("branch_parent_id", "==", parent_id).stream()
        )
        for branch_doc in branch_docs_query:
            branch_data = branch_doc.to_dict() or {}
            branch_id = branch_data.get("school_id") or branch_doc.id
            if branch_id in seen_branch_ids:
                continue
            branch_parent_id = parent_id
            branch_data.setdefault("branch_parent_id", branch_parent_id)
            branch_data["zoho_customer_id"] = school_profiles.get_zoho_customer_id(db, branch_parent_id)
            branch = school_profiles.build_school_from_record(branch_data)
            schools.append(branch)
            seen_branch_ids.add(branch_id)

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
