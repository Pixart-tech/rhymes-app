from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, Optional

import firebase_admin
from fastapi import HTTPException
from firebase_admin import auth as firebase_auth, credentials, firestore

DEFAULT_USER_ROLE = "user"


def _initialize_firestore_client() -> firestore.Client:
    """Initialize Firestore using env-based credentials."""

    # Prevent double initialization
    if firebase_admin._apps:
        return firestore.client()

    emulator_host = os.environ.get("FIRESTORE_EMULATOR_HOST")

    # ✅ SINGLE SOURCE OF TRUTH
    credentials_path = os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS",
        "D:\\rhymes app\\rhymes-app\\backend\\firebase_key.json"  # local fallback
    )

    if emulator_host:
        cred = credentials.AnonymousCredentials()
    else:
        if not os.path.exists(credentials_path):
            raise RuntimeError(
                f"Firebase credentials not found at {credentials_path}"
            )
        cred = credentials.Certificate(credentials_path)

    firebase_admin.initialize_app(cred)
    return firestore.client()


db = _initialize_firestore_client()



def verify_and_decode_token(authorization: Optional[str]) -> Dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Authorization header must be a Bearer token")

    try:
        return firebase_auth.verify_id_token(token)
    except Exception as exc:  # pragma: no cover - firebase library raises many subclasses
        raise HTTPException(status_code=401, detail="Invalid or expired Firebase token") from exc


def ensure_user_document(decoded_token: Dict[str, Any]) -> Dict[str, Any]:
    uid = decoded_token.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="Firebase token is missing a user id")

    doc_ref = db.collection("users").document(uid)
    snapshot = doc_ref.get()
    now = datetime.utcnow()
    email = decoded_token.get("email")
    display_name = decoded_token.get("name")

    if snapshot.exists:
        data = snapshot.to_dict() or {}
        updates: Dict[str, Any] = {}

        if email and not data.get("email"):
            updates["email"] = email
        if display_name and not data.get("display_name"):
            updates["display_name"] = display_name

        if updates:
            updates["updated_at"] = now
            doc_ref.update(updates)
            data.update(updates)

        data.setdefault("uid", uid)
        data.setdefault("school_ids", [])
        data.setdefault("role", data.get("role") or DEFAULT_USER_ROLE)
        data.setdefault("created_at", data.get("created_at") or now)
        data.setdefault("updated_at", data.get("updated_at") or now)
        return data

    default_payload = {
        "uid": uid,
        "email": email,
        "display_name": display_name,
        "role": DEFAULT_USER_ROLE,
        "school_ids": [],
        "created_at": now,
        "updated_at": now,
    }
    doc_ref.set(default_payload)
    return default_payload

