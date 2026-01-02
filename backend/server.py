
from __future__ import annotations

import os, sys

# Force working directory to the folder where EXE is running
if getattr(sys, "frozen", False):
    exe_dir = os.path.dirname(sys.executable)
    os.chdir(exe_dir)
else:
    exe_dir = os.path.dirname(os.path.abspath(__file__))

print("Forced working directory:", os.getcwd())


import base64
import logging
import mimetypes
import os
import re
import sys
import tempfile
import uuid
import json
import zipfile
from datetime import datetime
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path, PureWindowsPath

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, UploadFile, Form, Request
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel, EmailStr, Field
from typing import Any, Callable, Dict, Iterable, List, Literal, Optional, Set, Tuple
from urllib.parse import quote
from shutil import copy2
from fastapi.responses import HTMLResponse, JSONResponse, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware
from PIL import Image, ImageFilter

load_dotenv()

if __package__ in {None, ""}:
    # Allow ``python backend/server.py`` to work by ensuring the project root is
    # on ``sys.path`` before importing the package modules.
    current_dir = Path(__file__).resolve().parent
    project_root = current_dir.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from backend.app import auth, config, rhymes, svg_processing, unc_path_utils  # type: ignore
    from backend.app.routes import schools, workspace  # type: ignore
    from backend.app.firebase_service import (  # type: ignore
        db,
        verify_and_decode_token,
    )
    from backend.app.svg_processing import SvgDocument as _SvgDocument  # type: ignore
else:  # pragma: no cover - exercised only during normal package imports
    from .app import auth, config, rhymes, svg_processing, unc_path_utils
    from .app.routes import schools, workspace  # type: ignore
    from .app.firebase_service import (
        db,
        verify_and_decode_token,
    )
    from .app.svg_processing import SvgDocument as _SvgDocument

logger = logging.getLogger(__name__)

ROOT_DIR = config.ROOT_DIR
RHYME_SVG_BASE_PATH = config.RHYME_SVG_BASE_PATH
COVER_SVG_BASE_PATH = config.resolve_cover_svg_base_path()

RHYMES_DATA = rhymes.RHYMES_DATA
generate_rhyme_svg = rhymes.generate_rhyme_svg

MAX_RHYME_PAGES = 44

COVER_GRADE_LABELS = ["Playgroup", "Nursery", "LKG", "UKG"]

_sanitize_svg_for_svglib = svg_processing.sanitize_svg_for_svglib
_svg_requires_raster_backend = svg_processing.svg_requires_raster_backend
_build_cover_asset_manifest = svg_processing.build_cover_asset_manifest
_localize_svg_image_assets = svg_processing.localize_svg_image_assets

PUBLIC_DIR = (ROOT_DIR / "public").resolve()
COVER_THEME_PUBLIC_DIR = PUBLIC_DIR / "cover-themes"
LIBRARY_ROOT_DIR = PUBLIC_DIR / "cover-library"
LIBRARY_THEMES_DIR = LIBRARY_ROOT_DIR / "themes"
LIBRARY_COLOURS_DIR = LIBRARY_ROOT_DIR / "colours"  # legacy location for colour PNGs
LIBRARY_COVERS_DIR = LIBRARY_ROOT_DIR / "covers"  # preferred location for cover+colour PNGs (C1-C4)
LIBRARY_COLOUR_BASE_DIRS = [LIBRARY_COVERS_DIR, LIBRARY_COLOURS_DIR]
LIBRARY_THEME_KEYS = [f"Theme {i}" for i in range(1, 17)]
LIBRARY_GRADE_CODES = ["P", "N", "L", "U"]
DEFAULT_COLOUR_VERSIONS = [f"V{i}" for i in range(1, 17)]
PUBLIC_URL_PREFIX = "/public"
SUBJECT_PDF_DIR = PUBLIC_DIR / "subject-pdfs"

try:
    COVER_THEME_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    LIBRARY_THEMES_DIR.mkdir(parents=True, exist_ok=True)
    LIBRARY_COVERS_DIR.mkdir(parents=True, exist_ok=True)
    LIBRARY_COLOURS_DIR.mkdir(parents=True, exist_ok=True)
    
    SUBJECT_PDF_DIR.mkdir(parents=True, exist_ok=True)
except OSError as exc:
    logger.warning("Unable to create public cover directory %s: %s", COVER_THEME_PUBLIC_DIR, exc)


class CoverThemeImageStore:
    """Keep cover theme thumbnails and colour PNGs in memory.

    A lightweight, in-memory store allows another Python service to upload
    theme thumbnails and colour swatches, which are then immediately
    available to the frontend without relying on the network SVG mapping
    workflow.
    """

    def __init__(self, theme_slots: int = 16, colours_per_theme: int = 4) -> None:
        self.theme_slots = max(1, theme_slots)
        self.colours_per_theme = max(1, colours_per_theme)
        self._themes: Dict[str, Dict[str, Any]] = {}
        self._initialise_slots()

    def _initialise_slots(self) -> None:
        for index in range(1, self.theme_slots + 1):
            theme_id = f"theme{index}"
            if theme_id not in self._themes:
                self._themes[theme_id] = {
                    "id": theme_id,
                    "label": f"Theme {index}",
                    "thumbnail": None,
                    "thumbnail_mime": None,
                    "colours": {},
                }

    def _ensure_theme(self, theme_id: str, label: Optional[str] = None) -> Dict[str, Any]:
        theme = self._themes.get(theme_id)
        if theme is None:
            theme = {
                "id": theme_id,
                "label": label or theme_id.title(),
                "thumbnail": None,
                "thumbnail_mime": None,
                "colours": {},
            }
            self._themes[theme_id] = theme
        elif label:
            theme["label"] = label
        return theme

    @staticmethod
    def _to_data_url(content: Optional[bytes], mime_type: Optional[str]) -> Optional[str]:
        if not content:
            return None
        resolved_mime = mime_type or "image/png"
        encoded = base64.b64encode(content).decode("ascii")
        return f"data:{resolved_mime};base64,{encoded}"

    def set_thumbnail(
        self, theme_id: str, content: bytes, mime_type: Optional[str], label: Optional[str] = None
    ) -> None:
        theme = self._ensure_theme(theme_id, label)
        theme["thumbnail"] = content
        theme["thumbnail_mime"] = mime_type or "image/png"

    def set_colour_image(
        self,
        theme_id: str,
        colour_id: str,
        content: bytes,
        mime_type: Optional[str],
        label: Optional[str] = None,
    ) -> None:
        theme = self._ensure_theme(theme_id)
        colour_label = label or colour_id.replace("_", " ").title()
        theme["colours"][colour_id] = {
            "id": colour_id,
            "label": colour_label,
            "content": content,
            "mime": mime_type or "image/png",
        }

    def serialize_theme(self, theme_id: str) -> Dict[str, Any]:
        theme = self._ensure_theme(theme_id)
        colour_entries = []
        for index in range(1, self.colours_per_theme + 1):
            colour_id = f"colour{index}"
            stored = theme["colours"].get(colour_id)
            colour_entries.append(
                {
                    "id": colour_id,
                    "label": stored.get("label") if stored else f"Colour {index}",
                    "imageUrl": self._to_data_url(stored.get("content") if stored else None, stored.get("mime") if stored else None)
                    if stored
                    else None,
                }
            )

        return {
            "id": theme_id,
            "label": theme.get("label") or theme_id.title(),
            "thumbnailUrl": self._to_data_url(theme.get("thumbnail"), theme.get("thumbnail_mime")),
            "colours": colour_entries,
        }

    def list_themes(self) -> List[Dict[str, Any]]:
        self._initialise_slots()
        return [self.serialize_theme(theme_id) for theme_id in sorted(self._themes.keys())]


COVER_THEME_STORE = CoverThemeImageStore()

_SAFE_COMPONENT_RE = re.compile(r"[^A-Za-z0-9_.-]+")
_IMAGE_EXTENSIONS = (".png", ".apng", ".jpg", ".jpeg", ".webp")
THUMB_MAX_WIDTH = 320
PREVIEW_MAX_WIDTH = 1100
IMAGE_INPUT_BASE = LIBRARY_THEMES_DIR
THUMB_OUTPUT_DIR = LIBRARY_ROOT_DIR / "thumbnails-webp"
PREVIEW_OUTPUT_DIR = LIBRARY_ROOT_DIR / "previews-webp"


def _sanitize_component(value: str, fallback: str) -> str:
    """Return a filesystem-safe component with a sensible fallback."""

    trimmed = (value or "").strip()
    normalized = _SAFE_COMPONENT_RE.sub("_", trimmed)
    return normalized or fallback


def _resolve_theme_dir(theme_id: str) -> Path:
    safe_theme_id = _sanitize_component(theme_id, "theme")
    return COVER_THEME_PUBLIC_DIR / safe_theme_id


def _resolve_library_theme_dir(theme_key: str) -> Path:
    safe = _sanitize_component(theme_key, "Theme")
    return LIBRARY_THEMES_DIR / safe


def _get_library_colour_base_dir(prefer_existing: bool = True) -> Path:
    """
    Prefer the new ``covers`` folder when it exists; fall back to the legacy
    ``colours`` folder if that's where PNGs currently live.
    """
    if prefer_existing:
        for base_dir in LIBRARY_COLOUR_BASE_DIRS:
            try:
                if base_dir.exists() and any(base_dir.iterdir()):
                    return base_dir
            except OSError:
                continue

    for base_dir in LIBRARY_COLOUR_BASE_DIRS:
        if base_dir.exists():
            return base_dir
    return LIBRARY_COLOUR_BASE_DIRS[0]


def _resolve_library_colour_path(version: str, grade_code: str, extension: str = ".png", *, for_write: bool = False) -> Path:
    safe_version = _sanitize_component(version, "V1")
    safe_grade = _sanitize_component(grade_code, "P")
    base_dir = LIBRARY_COLOUR_BASE_DIRS[0] if for_write else _get_library_colour_base_dir()
    return (base_dir / safe_version) / f"{safe_grade}{extension}"

def _resolve_subject_pdf_path(class_name: str, subject_name: str, filename: str) -> Path:
    safe_class = _sanitize_component(class_name, "class")
    safe_subject = _sanitize_component(subject_name, "subject")
    ext = Path(filename).suffix.lower() or ".pdf"
    if ext not in {".pdf"}:
        ext = ".pdf"
    return (SUBJECT_PDF_DIR / safe_class) / f"{safe_subject}{ext}"


def _public_url_for(
    path: Optional[Path],
    request: Optional[Request] = None,
    *,
    absolute: bool = False,
) -> Optional[str]:
    if not path:
        return None
    try:
        relative = path.resolve().relative_to(PUBLIC_DIR)
    except (ValueError, OSError):
        return None
    public_path = f"{PUBLIC_URL_PREFIX}/{relative.as_posix()}"
    if absolute and request:
        base = str(request.base_url).rstrip("/")
        return f"{base}{public_path}"
    return public_path


def _find_existing_image(base_dir: Path, stem: str) -> Optional[Path]:
    if not base_dir.exists() or not base_dir.is_dir():
        return None
    for extension in _IMAGE_EXTENSIONS:
        candidate = base_dir / f"{stem}{extension}"
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def _find_processed_image(
    stem: str,
    kind: Literal["thumb", "preview"],
    *,
    relative_dir: Optional[Path] = None,
) -> Optional[Path]:
    base_dir = THUMB_OUTPUT_DIR if kind == "thumb" else PREVIEW_OUTPUT_DIR
    target_dir = base_dir / relative_dir if relative_dir else base_dir
    candidate = target_dir / f"{stem}_{kind}.webp"
    if candidate.exists() and candidate.is_file():
        return candidate
    return None


def _iter_source_images(source_dir: Path, thumb_dir: Path, preview_dir: Path) -> Iterable[Path]:
    """Yield source images, skipping derived folders and unsupported formats."""

    thumb_dir = thumb_dir.resolve()
    preview_dir = preview_dir.resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        return []

    for root, dirs, files in os.walk(source_dir):
        root_path = Path(root).resolve()
        try:
            root_path.relative_to(thumb_dir)
            continue
        except ValueError:
            pass
        try:
            root_path.relative_to(preview_dir)
            continue
        except ValueError:
            pass
        for file_name in sorted(files):
            entry = root_path / file_name
            if entry.suffix.lower() not in _IMAGE_EXTENSIONS:
                continue
            yield entry


def _resize_image_to_width(image: "Image.Image", target_width: int) -> "Image.Image":
    if target_width <= 0:
        return image.copy()
    width, height = image.size
    if width <= target_width:
        return image.copy()
    ratio = target_width / float(width)
    target_height = max(1, int(height * ratio))
    return image.resize((int(target_width), target_height), resample=Image.LANCZOS)


def _save_webp(image: "Image.Image", target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        target_path,
        format="WEBP",
        quality=90,
        method=6,
        optimize=True,
    )


def _process_single_image(
    source_path: Path,
    source_root: Path,
    thumb_root: Path,
    preview_root: Path,
    *,
    thumb_width: int = THUMB_MAX_WIDTH,
    preview_width: int = PREVIEW_MAX_WIDTH,
) -> Dict[str, Any]:
    if source_path.suffix.lower() not in _IMAGE_EXTENSIONS:
        return {"source": str(source_path), "skipped": True, "reason": "unsupported_extension"}

    try:
        relative_dir = source_path.parent.resolve().relative_to(source_root.resolve())
    except ValueError:
        relative_dir = Path()

    thumb_dir = thumb_root / relative_dir
    preview_dir = preview_root / relative_dir

    thumb_path = thumb_dir / f"{source_path.stem}_thumb.webp"
    preview_path = preview_dir / f"{source_path.stem}_preview.webp"

    if thumb_path.exists() and preview_path.exists():
        return {"source": str(source_path), "skipped": True, "reason": "derived_exists"}

    thumb_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as img:
        img.load()
        base = img.convert("RGBA") if img.mode in {"RGBA", "LA", "P"} else img.convert("RGB")

        if not preview_path.exists():
            preview = _resize_image_to_width(base, preview_width)
            _save_webp(preview, preview_path)

        if not thumb_path.exists():
            thumb = _resize_image_to_width(base, thumb_width)
            thumb = thumb.filter(ImageFilter.UnsharpMask(radius=1.0, percent=125, threshold=2))
            _save_webp(thumb, thumb_path)

    return {
        "source": str(source_path),
        "thumb": str(thumb_path),
        "preview": str(preview_path),
        "processed": True,
    }


def process_existing_images_on_disk(
    source_dir: Path = IMAGE_INPUT_BASE,
    *,
    thumb_dir: Optional[Path] = None,
    preview_dir: Optional[Path] = None,
    thumb_width: int = THUMB_MAX_WIDTH,
    preview_width: int = PREVIEW_MAX_WIDTH,
) -> Dict[str, Any]:
    if thumb_dir is None:
        thumb_dir = THUMB_OUTPUT_DIR
    if preview_dir is None:
        preview_dir = PREVIEW_OUTPUT_DIR

    if not source_dir.exists() or not source_dir.is_dir():
        raise HTTPException(status_code=400, detail=f"Source directory not found: {source_dir}")

    processed = 0
    skipped = 0
    files: List[Dict[str, Any]] = []

    for entry in _iter_source_images(source_dir, thumb_dir, preview_dir):
        result = _process_single_image(
            entry,
            source_dir,
            thumb_dir,
            preview_dir,
            thumb_width=thumb_width,
            preview_width=preview_width,
        )
        files.append(result)
        if result.get("processed"):
            processed += 1
        else:
            skipped += 1

    return {
        "source": str(source_dir),
        "thumbnails_dir": str(thumb_dir),
        "previews_dir": str(preview_dir),
        "processed": processed,
        "skipped": skipped,
        "files": files,
    }


def _remove_existing_images(base_dir: Path, stem: str) -> None:
    if not base_dir.exists() or not base_dir.is_dir():
        return
    for extension in _IMAGE_EXTENSIONS:
        candidate = base_dir / f"{stem}{extension}"
        try:
            if candidate.exists():
                candidate.unlink()
        except OSError as exc:
            logger.warning("Unable to remove stale image %s: %s", candidate, exc)


def _guess_image_extension(upload_file: UploadFile) -> str:
    """Return a reasonable extension for an uploaded image."""

    filename = upload_file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix in _IMAGE_EXTENSIONS:
        return suffix

    content_type = (upload_file.content_type or "").lower()
    if "png" in content_type:
        return ".png"
    if "jpeg" in content_type or "jpg" in content_type:
        return ".jpg"
    if "webp" in content_type:
        return ".webp"

    return ".png"


def _load_theme_meta(theme_dir: Path) -> Dict[str, Any]:
    meta_path = theme_dir / "meta.json"
    if not meta_path.exists() or not meta_path.is_file():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8")) or {}
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Unable to read theme metadata from %s: %s", meta_path, exc)
        return {}


def _save_theme_meta(theme_dir: Path, *, theme_label: Optional[str] = None, colour_id: Optional[str] = None, colour_label: Optional[str] = None) -> None:
    meta = _load_theme_meta(theme_dir)
    if theme_label:
        meta["label"] = theme_label
    if colour_id and colour_label:
        colours = meta.get("colours") or {}
        colours[colour_id] = colour_label
        meta["colours"] = colours

    try:
        theme_dir.mkdir(parents=True, exist_ok=True)
        (theme_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.warning("Unable to persist theme metadata in %s: %s", theme_dir, exc)


def _delete_colour_meta(theme_dir: Path, colour_id: str) -> None:
    meta_path = theme_dir / "meta.json"
    if not meta_path.exists() or not meta_path.is_file():
        return
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8")) or {}
    except (OSError, json.JSONDecodeError):
        return

    colours = meta.get("colours")
    if not isinstance(colours, dict) or colour_id not in colours:
        return

    colours.pop(colour_id, None)
    if not colours:
        meta.pop("colours", None)
    else:
        meta["colours"] = colours

    try:
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.warning("Unable to update theme metadata in %s: %s", meta_path, exc)


def _write_public_image(target_path: Path, content: bytes) -> None:
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(content)
    except OSError as exc:
        logger.error("Unable to write uploaded image to %s: %s", target_path, exc)
        raise HTTPException(status_code=500, detail="Unable to store uploaded image.") from exc


COLOUR_FILE_STEMS_BY_GRADE: Dict[str, list[str]] = {
    "P": ["C1", "P", "PG", "PG1"],
    "N": ["C2", "N", "NUR", "NURSERY"],
    "L": ["C3", "L", "LKG"],
    "U": ["C4", "U", "UKG"],
}


def _build_library_theme_payload(theme_key: str, request: Optional[Request] = None) -> Dict[str, Any]:
    theme_dir = _resolve_library_theme_dir(theme_key)
    existing = _find_existing_image(theme_dir, "cover")
    if not existing and theme_dir.exists():
        # fallback: pick the first image file in the theme folder
        for entry in sorted(theme_dir.iterdir()):
            if entry.is_file() and entry.suffix.lower() in _IMAGE_EXTENSIONS:
                existing = entry
                break
    stem = existing.stem if existing else _sanitize_component(theme_key, "cover")
    relative_dir: Optional[Path] = None
    try:
        relative_dir = theme_dir.resolve().relative_to(IMAGE_INPUT_BASE.resolve())
    except ValueError:
        relative_dir = None
    processed_thumb = _find_processed_image(stem, "thumb", relative_dir=relative_dir)
    processed_preview = _find_processed_image(stem, "preview", relative_dir=relative_dir)
    cover_candidate = processed_preview or existing
    thumb_candidate = processed_thumb or cover_candidate or existing
    return {
        "id": theme_key,
        "label": theme_key,
        "coverUrl": _public_url_for(cover_candidate, request) if cover_candidate else None,
        # backward-compatible field name for UIs expecting thumbnailUrl
        "thumbnailUrl": _public_url_for(thumb_candidate, request) if thumb_candidate else None,
        "previewUrl": _public_url_for(processed_preview, request) if processed_preview else None,
    }


def _list_colour_version_dirs() -> Tuple[List[Tuple[str, Path]], Path]:
    """
    Return colour version folders, preferring the new ``covers`` path but
    falling back to the legacy ``colours`` folder when needed.
    """
    for base_dir in LIBRARY_COLOUR_BASE_DIRS:
        versions: List[Tuple[str, Path]] = []
        if base_dir.exists():
            for entry in sorted(base_dir.iterdir()):
                if entry.is_dir():
                    raw_name = entry.name.strip() or entry.name
                    version_id = raw_name.upper()
                    versions.append((version_id, entry))
        if versions:
            return versions, base_dir
    fallback_base = _get_library_colour_base_dir(prefer_existing=False)
    return [], fallback_base


def _build_colour_grade_map(version_dir: Path, request: Optional[Request]) -> Dict[str, Optional[str]]:
    grade_map: Dict[str, Optional[str]] = {}
    for grade_code in LIBRARY_GRADE_CODES:
        stems = COLOUR_FILE_STEMS_BY_GRADE.get(grade_code, [grade_code])
        colour_path: Optional[Path] = None
        for stem in stems:
            colour_path = _find_existing_image(version_dir, stem)
            if colour_path:
                break
        grade_map[grade_code] = _public_url_for(colour_path, request) if colour_path else None
    return grade_map


def _build_theme_from_colour_dir(
    version_id: str, version_dir: Path, request: Optional[Request] = None
) -> Dict[str, Any]:
    cover_path: Optional[Path] = None
    for stem in COLOUR_FILE_STEMS_BY_GRADE.get("P", ["C1"]):
        cover_path = _find_existing_image(version_dir, stem)
        if cover_path:
            break
    if cover_path is None and version_dir.exists():
        for entry in sorted(version_dir.iterdir()):
            if entry.is_file() and entry.suffix.lower() in _IMAGE_EXTENSIONS:
                cover_path = entry
                break

    label = version_id
    match = re.search(r"(\d+)", version_id)
    if match:
        label = f"Theme {match.group(1)}"

    public_cover = _public_url_for(cover_path, request) if cover_path else None
    return {
        "id": version_id,
        "label": label,
        "coverUrl": public_cover,
        "thumbnailUrl": public_cover,
        "previewUrl": None,
    }


def _build_library_manifest(request: Optional[Request] = None) -> Dict[str, Any]:
    colour_entries, colour_base_dir = _list_colour_version_dirs()
    colour_entries = colour_entries[: len(LIBRARY_THEME_KEYS)]
    using_colour_dirs = len(colour_entries) > 0

    if using_colour_dirs:
        colour_versions = [version_id for version_id, _ in colour_entries]
        themes = [
            _build_theme_from_colour_dir(version_id, version_dir, request)
            for version_id, version_dir in colour_entries
        ]
    else:
        colour_versions = DEFAULT_COLOUR_VERSIONS
        themes = [_build_library_theme_payload(theme_key, request) for theme_key in LIBRARY_THEME_KEYS]
        colour_entries = [(version, colour_base_dir / version) for version in colour_versions]

    colours: Dict[str, Dict[str, Optional[str]]] = {}
    for version_id, version_dir in colour_entries:
        colours[version_id] = _build_colour_grade_map(version_dir, request)

    return {
        "themes": themes,
        "colour_versions": colour_versions,
        "colours": colours,
    }


def _build_theme_payload_from_disk(theme_id: str, request: Optional[Request] = None) -> Dict[str, Any]:
    """Return theme metadata backed by the public disk folder."""

    theme_dir = _resolve_theme_dir(theme_id)
    meta = _load_theme_meta(theme_dir)
    fallback_label = theme_id.title()
    match = re.search(r"(\d+)", theme_id)
    if match:
        fallback_label = f"Theme {match.group(1)}"

    thumbnail_path = _find_existing_image(theme_dir, "thumbnail")
    colours = []
    meta_colours = meta.get("colours") if isinstance(meta.get("colours"), dict) else {}

    for index in range(1, COVER_THEME_STORE.colours_per_theme + 1):
        colour_id = f"colour{index}"
        colour_dir = theme_dir / "colours"
        colour_path = _find_existing_image(colour_dir, _sanitize_component(colour_id, colour_id))
        colour_label = meta_colours.get(colour_id) if meta_colours else None
        colours.append(
            {
                "id": colour_id,
                "label": colour_label or f"Colour {index}",
                "imageUrl": _public_url_for(colour_path, request),
            }
        )

    return {
        "id": theme_id,
        "label": meta.get("label") or fallback_label,
        "thumbnailUrl": _public_url_for(thumbnail_path, request),
        "colours": colours,
    }


def _ensure_image_cache_dir() -> Path:
    return svg_processing.ensure_image_cache_dir(config.IMAGE_CACHE_DIR)


def _resolve_rhyme_svg_path(rhyme_code: str) -> Optional[List[Path]]:
    return svg_processing.resolve_rhyme_svg_path(RHYME_SVG_BASE_PATH, rhyme_code)


def _get_rhyme_image_cache_dir(rhyme_code: str) -> Path:
    """Return a rhyme-specific cache directory for external image assets."""

    rhyme_cache_dir = config.IMAGE_CACHE_DIR / "rhymes" / rhyme_code
    return svg_processing.ensure_image_cache_dir(rhyme_cache_dir)


def _resolve_rhyme_image_path(rhyme_code: str, file_name: str) -> Path:
    """Return a cached rhyme image path, populating the cache on demand."""

    sanitized_name = Path(file_name).name
    if not sanitized_name:
        raise HTTPException(status_code=400, detail="Image file name is required")

    cache_dir = _get_rhyme_image_cache_dir(rhyme_code)
    candidate_path = (cache_dir / sanitized_name).resolve()

    try:
        candidate_path.relative_to(cache_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid image file path")

    if candidate_path.exists() and candidate_path.is_file():
        return candidate_path

    source_dir = RHYME_SVG_BASE_PATH / rhyme_code
    source_path = (source_dir / sanitized_name).resolve()

    try:
        source_path.relative_to(source_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid image file path")

    if not source_path.exists() or not source_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        copy2(source_path, candidate_path)
    except OSError as exc:
        logger.warning(
            "Unable to cache image %s for rhyme %s: %s", sanitized_name, rhyme_code, exc
        )
        return source_path

    return candidate_path


def _ensure_cover_assets_base_path() -> Path:
    return config.ensure_cover_assets_base_path(COVER_SVG_BASE_PATH)


def _get_cover_assets_unc_base_path() -> PureWindowsPath:
    try:
        return config.get_cover_unc_base_path()
    except ValueError as exc:
        logger.error("COVER_SVG_BASE_PATH is not configured: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "COVER_SVG_BASE_PATH is not configured on the server. "
                "Please set it to the network directory containing the cover SVG files."
            ),
        ) from exc


def _load_rhyme_svg_markup(rhyme_code: str) -> _SvgDocument:
    return svg_processing.load_rhyme_svg_markup(
        rhyme_code, RHYME_SVG_BASE_PATH, fallback_factory=generate_rhyme_svg
    )


def _normalize_cors_origin(origin: str) -> Optional[str]:
    return config._normalize_cors_origin(origin)


def _parse_csv(value: Optional[str], *, default: Optional[List[str]] = None) -> List[str]:
    return config._parse_csv(value, default=default)


def _as_windows_relative_path(base_path: Path, target_path: Path) -> str:
    """Return ``target_path`` as a Windows-style path relative to ``base_path``."""

    try:
        relative = target_path.relative_to(base_path)
    except ValueError:
        return target_path.name

    if not relative.parts:
        return target_path.name

    return str(PureWindowsPath(*relative.parts))


def _read_cover_svg_text(svg_path: Path) -> str:
    """Return the textual SVG markup for ``svg_path``."""

    try:
        return svg_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return svg_path.read_bytes().decode("utf-8", errors="replace")


def _localize_cover_svg_markup(svg_markup: str, svg_path: Path) -> str:
    """Inline bitmap assets referenced by ``svg_markup`` when possible."""

    try:
        return _localize_svg_image_assets(
            svg_markup,
            svg_path,
            f"cover::{svg_path.name}",
            inline_mode=False,
            asset_url_prefix="/api/cover-assets/images",
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning(
            "Unable to inline image assets for cover SVG '%s': %s",
            svg_path,
            exc,
        )
        return svg_markup


cors_origins = _parse_csv(os.environ.get("CORS_ORIGINS"), default=["*"])
allow_all_origins = "*" in cors_origins or not cors_origins
normalized_origins = [origin for origin in cors_origins if origin != "*"]


# middle ware configuration and app setup
app = FastAPI()
origins = [
    
    "http://localhost:3000" , "http://192.168.0.102:3000" # remove * in production
]

app.add_middleware(
    CORSMiddleware,
    
    allow_credentials=True,
    allow_origins=[] if allow_all_origins else normalized_origins,
    allow_origin_regex=".*" if allow_all_origins else None,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(PUBLIC_URL_PREFIX, StaticFiles(directory=PUBLIC_DIR, check_dir=True), name="public")


class PDFDependencyUnavailableError(RuntimeError):
      """Raised when the core PDF toolchain cannot be imported at runtime."""
    


@dataclass(frozen=True)
class _SvgBackend:
    """Container describing how SVG assets should be rendered on the PDF canvas."""

    mode: Literal["cairosvg", "svglib", "hybrid", "none"]
    svg2png: Optional[Callable[..., Any]]
    image_reader: Optional[Any]
    svg2rlg: Optional[Callable[..., Any]]
    render_pdf: Optional[Any]


@dataclass(frozen=True)
class _PdfResources:
    """Return value for :func:`_load_pdf_dependencies`."""

    canvas_factory: Any
    page_size: Tuple[float, float]
    svg_backend: _SvgBackend


@lru_cache(maxsize=1)
def _load_pdf_dependencies() -> _PdfResources:

    """Dynamically import heavy PDF dependencies when needed.

    Importing CairoSVG/ReportLab at module import time can crash the entire
    application when optional system libraries (for example ``libcairo``) are
    missing. By delaying the import until the binder endpoint is actually
    requested we prevent authentication and other unrelated endpoints from
    failing with a 502 Bad Gateway.


    Returns a :class:`_PdfResources` instance describing the configured PDF
    canvas factory, page size and SVG rendering backend. When CairoSVG is not
    available the function now attempts to fall back to ``svglib`` before
    degrading to the text-only layout.
    """

    def _resolve_font_paths() -> List[Path]:
        """Return usable font directories from env or known defaults."""

        raw_env = os.environ.get("SVG_FONT_PATHS") or os.environ.get("SVG_FONT_DIRS")
        entries: List[str] = []

        if raw_env:
            if os.pathsep in raw_env:
                entries.extend(part.strip() for part in raw_env.split(os.pathsep))
            else:
                entries.extend(part.strip() for part in raw_env.split(","))

        # Preferred Windows default for on-prem installs
        default_windows_path = Path(r"D:\fonts")
        entries.append(str(default_windows_path))

        seen: Set[str] = set()
        paths: List[Path] = []
        for entry in entries:
            if not entry:
                continue
            normalized = os.path.abspath(os.path.expanduser(entry))
            if normalized in seen:
                continue
            seen.add(normalized)
            candidate = Path(normalized)
            try:
                if candidate.exists() and candidate.is_dir():
                    paths.append(candidate)
            except OSError:
                continue

        return paths

    def _configure_font_search_paths(paths: List[Path]) -> None:
        """Expose custom font dirs to both ReportLab and CairoSVG backends."""

        if not paths:
            return

        try:
            from reportlab import rl_config  # type: ignore

            existing_paths = [Path(p) for p in getattr(rl_config, "TTFSearchPath", [])]
            for path in paths:
                if path not in existing_paths:
                    rl_config.TTFSearchPath.append(str(path))
        except Exception as exc:
            logging.getLogger(__name__).warning("Unable to extend ReportLab font paths: %s", exc)

        try:
            resolved = [str(path) for path in paths]
            current = os.environ.get("CAIRO_FONT_PATH")
            if current:
                resolved.insert(0, current)
            os.environ["CAIRO_FONT_PATH"] = os.pathsep.join(resolved)
        except Exception as exc:
            logging.getLogger(__name__).warning("Unable to set CAIRO_FONT_PATH: %s", exc)

    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas as pdf_canvas
    except (ImportError, OSError) as exc:
        logging.getLogger(__name__).error(
            "ReportLab dependency could not be loaded for PDF generation: %s", exc
        )
        raise PDFDependencyUnavailableError(
            "PDF generation is temporarily unavailable because ReportLab is missing. "
            "Please contact the administrator to install the required dependencies."
        ) from exc

    _configure_font_search_paths(_resolve_font_paths())

    svg_backend = _SvgBackend("none", None, None, None, None)

    svg2rlg: Optional[Callable[..., Any]] = None
    render_pdf: Optional[Any] = None

    try:
        from svglib.svglib import svg2rlg as _svg2rlg  # type: ignore
        from reportlab.graphics import renderPDF as _renderPDF
    except (ImportError, OSError) as svg_exc:
        logging.getLogger(__name__).warning(
            "svglib could not be imported. Binder PDFs will fall back to raster rendering when necessary. "
            "Error: %s",
            svg_exc,
        )
    else:
        svg2rlg = _svg2rlg
        render_pdf = _renderPDF
        svg_backend = _SvgBackend("svglib", None, None, svg2rlg, render_pdf)

    try:
        from cairosvg import svg2png as _svg2png  # type: ignore
        from reportlab.lib.utils import ImageReader as _ImageReader
    except (ImportError, OSError) as exc:
        if svg2rlg is None:
            logging.getLogger(__name__).warning(
                "CairoSVG is not available and svglib is missing. Binder PDFs will use the text-only layout. "
                "Error: %s",
                exc,
            )
    else:
        if svg2rlg and render_pdf:
            svg_backend = _SvgBackend("hybrid", _svg2png, _ImageReader, svg2rlg, render_pdf)
        else:
            svg_backend = _SvgBackend("cairosvg", _svg2png, _ImageReader, None, None)

    return _PdfResources(pdf_canvas.Canvas, letter, svg_backend)

   

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")
app.include_router(api_router)
api_router.include_router(auth.create_auth_router(db))
api_router.include_router(workspace.router)
api_router.include_router(schools.router)

# Models
class RhymeSelection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    school_id: str
    grade: str
    page_index: int  # Changed from position to page_index for carousel
    rhyme_code: str
    rhyme_name: str
    pages: float
    position: str = "top"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class RhymeSelectionCreate(BaseModel):
    school_id: str
    grade: str
    page_index: int
    rhyme_code: str
    position: Optional[str] = None


class BookSelectionPayload(BaseModel):
    school_id: str
    selections: List[Dict[str, Any]]
    excluded_assessments: List[str] = Field(default_factory=list)
    source: Optional[str] = None
    deleted_classes: List[str] = Field(default_factory=list)


class CoverSelectionPayload(BaseModel):
    school_id: str
    grade: str
    theme_id: Optional[str] = None
    theme_label: Optional[str] = None
    colour_id: Optional[str] = None
    colour_label: Optional[str] = None
    status: Optional[str] = None
    is_selected: Optional[bool] = True


def _cover_doc_id(grade: str, *, admin: bool = False) -> str:
    safe_grade = (grade or "").strip().lower().replace(" ", "_")
    return f"{safe_grade}__admin" if admin else safe_grade


def _merge_cover_entries(
    client_entry: Dict[str, Any],
    admin_entry: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Return effective cover selection per grade:
    - If an admin override exists, prefer it.
    - Otherwise, use the client baseline.
    """
    def _entry_value(entry: Dict[str, Any], key: str, fallback_key: str = "") -> Optional[str]:
        if not entry:
            return None
        return entry.get(key) or (entry.get(fallback_key) if fallback_key else None)

    if admin_entry:
        admin_theme = _format_cover_theme(_entry_value(admin_entry, "theme_id", "theme"))
        admin_colour_raw = _entry_value(admin_entry, "colour_id", "theme_colour")
        return {
            "theme": admin_theme,
            "theme_colour": _format_cover_colour(admin_theme, admin_colour_raw, admin_entry.get("grade")),
            "status": admin_entry.get("status"),
            "is_selected": admin_entry.get("is_selected", True),
        }

    client_theme = _format_cover_theme(_entry_value(client_entry, "theme_id", "theme"))
    client_colour_raw = _entry_value(client_entry, "colour_id", "theme_colour")
    return {
        "theme": client_theme,
        "theme_colour": _format_cover_colour(client_theme, client_colour_raw, client_entry.get("grade")),
        "status": client_entry.get("status"),
        "is_selected": client_entry.get("is_selected", True),
    }


def _build_rhyme_doc_id(school_id: str, grade: str, page_index: int, position: str) -> str:
    """Use the provided school_id verbatim (trimmed) to key rhyme selections per school."""
    safe_school = school_id.strip()
    safe_grade = grade.strip()
    safe_position = (position or "top").strip() or "top"
    return f"{safe_school}_{safe_grade}_{page_index}_{safe_position}"


def _verify_and_decode_token(authorization: Optional[str]) -> Dict[str, Any]:
    """Wrapper to enforce auth and normalize errors."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    return verify_and_decode_token(authorization)


def _rhyme_collection_for_school(school_id: str):
    return db.collection("rhyme_selections").document(school_id).collection("classes")


def _get_all_rhyme_items(school_id: str) -> List[Dict[str, Any]]:
    """Return all rhyme selection items for a school from class docs plus legacy root docs."""
    items: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    for class_doc in _rhyme_collection_for_school(school_id).stream():
        data = class_doc.to_dict() or {}
        class_items = data.get("items", [])
        if isinstance(class_items, list):
            for item in class_items:
                item_id = item.get("id")
                if item_id and item_id in seen_ids:
                    continue
                if item_id:
                    seen_ids.add(item_id)
                items.append(item)

    legacy_query = db.collection("rhyme_selections").where("school_id", "==", school_id)
    for doc in legacy_query.stream():
        data = doc.to_dict() or {}
        item_id = data.get("id")
        if item_id and item_id in seen_ids:
            continue
        if item_id:
            seen_ids.add(item_id)
        items.append(data)

    return items


def _strip_binary_fields(record: Dict[str, Any]) -> Dict[str, Any]:
    cleaned: Dict[str, Any] = {}
    for key, value in (record or {}).items():
        if isinstance(value, (bytes, bytearray, memoryview)):
            continue
        cleaned[key] = value
    return cleaned


def _book_collection_for_school(school_id: str):
    return db.collection("book_selections").document(school_id).collection("classes")


def _normalize_class_doc_id(class_name: str) -> str:
    """Return a stable document id for a class key (lowercase, spaces->underscores)."""
    return (class_name or "").strip().lower().replace(" ", "_")


def _rhyme_collection_for_school(school_id: str):
    return db.collection("rhyme_selections").document(school_id).collection("classes")


def _cover_collection_for_school(school_id: str):
    return db.collection("cover_selections").document(school_id).collection("grades")

def _cover_root_doc(school_id: str):
    return db.collection("cover_selections").document(school_id)

def _format_cover_theme(theme_id: Optional[str]) -> Optional[str]:
    if not theme_id:
        return None
    theme_str = str(theme_id).strip()
    if not theme_str:
        return None
    match = re.match(r"theme\s*(\d+)", theme_str, re.IGNORECASE)
    if match:
        return f"V{match.group(1)}"
    return theme_str

def _grade_to_colour_stem(grade_key: Optional[str]) -> Optional[str]:
    if not grade_key:
        return None
    normalized = grade_key.strip().lower()
    if not normalized:
        return None
    mapping = {
        "playgroup": "C1",
        "pg": "C1",
        "p": "C1",
        "toddler": "C1",
        "nursery": "C2",
        "n": "C2",
        "nur": "C2",
        "nurs": "C2",
        "lkg": "C3",
        "l": "C3",
        "ukg": "C4",
        "u": "C4",
    }
    return mapping.get(normalized)


def _format_cover_colour(
    theme_code: Optional[str],
    colour_id: Optional[str],
    grade_key: Optional[str] = None,
) -> Optional[str]:
    colour_number: Optional[str] = None
    version: Optional[str] = None

    if colour_id:
        colour_str = str(colour_id).strip()
        if colour_str:
            match_version = re.search(r"v\s*(\d+)", colour_str, re.IGNORECASE)
            if match_version:
                version = f"V{match_version.group(1)}"
            match_colour = re.search(r"colour\s*(\d+)", colour_str, re.IGNORECASE)
            if match_colour:
                colour_number = match_colour.group(1)
            else:
                match_c_digit = re.search(r"c\s*(\d+)", colour_str, re.IGNORECASE)
                if match_c_digit:
                    colour_number = match_c_digit.group(1)

    if not version and theme_code:
        version = str(theme_code).strip() or None

    if not version:
        return None

    stem = _grade_to_colour_stem(grade_key)
    if not stem and colour_number:
        stem = f"C{colour_number}"

    if not stem:
        return version

    # Return without file extension to keep binder.json clean
    return f"{version}_{stem}"


def _coerce_to_bytes(value: Any) -> Optional[bytes]:
    """Return bytes for Firestore-stored blobs regardless of the underlying type."""

    if value is None:
        return None
    if isinstance(value, bytes):
        return value
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, memoryview):
        return value.tobytes()
    return None


def _guess_file_extension(mime_type: Optional[str], default: str = ".bin") -> str:
    """Best-effort file extension for a mime type, with a safe fallback."""

    if mime_type:
        try:
            guessed = mimetypes.guess_extension(mime_type.split(";")[0].strip())
            if guessed:
                return guessed
        except Exception:
            pass
    return default


@api_router.get("/rhymes")
async def get_all_rhymes():
    """Get all rhymes organized by pages"""
    rhymes_by_pages = {}

    for code, data in RHYMES_DATA.items():
        name, pages, personalized = data
        page_key = str(pages)

        if page_key not in rhymes_by_pages:
            rhymes_by_pages[page_key] = []

        rhymes_by_pages[page_key].append(
            {"code": code, "name": name, "pages": pages, "personalized": personalized}
        )

    return rhymes_by_pages


@api_router.get("/rhymes/available/{school_id}/{grade}")
def get_available_rhymes(
    school_id: str, grade: str, include_selected: bool = False
):
    """Get available rhymes for a specific grade"""
    if not include_selected:
        # Get already selected rhymes for ALL grades in this school
        selections_ref = _rhyme_collection_for_school(school_id)
        selected_rhymes: List[Dict[str, Any]] = []
        for class_doc in selections_ref.stream():
            data = class_doc.to_dict() or {}
            items = data.get("items", [])
            if isinstance(items, list):
                selected_rhymes.extend(items)

        selected_codes = {selection["rhyme_code"] for selection in selected_rhymes}
    else:
        selected_codes = set()

    # Get available rhymes organized by pages
    rhymes_by_pages = {}

    for code, data in RHYMES_DATA.items():
        if code not in selected_codes:  # Only include unselected rhymes
            name, pages, personalized = data
            page_key = str(pages)

            if page_key not in rhymes_by_pages:
                rhymes_by_pages[page_key] = []

            rhymes_by_pages[page_key].append(
                {
                    "code": code,
                    "name": name, 
                    "pages": pages,
                    "personalized": personalized,
                }
            )

    return rhymes_by_pages


@api_router.get("/rhymes/selected/{school_id}")
def get_selected_rhymes(school_id: str):
    """Get all selected rhymes for a school organized by grade"""
    selections_ref = _rhyme_collection_for_school(school_id)
    selections: List[Dict[str, Any]] = []
    for class_doc in selections_ref.stream():
        data = class_doc.to_dict() or {}
        items = data.get("items", [])
        if isinstance(items, list):
            selections.extend(items)

    result = {}
    for selection in selections:
        grade = selection["grade"]
        if grade not in result:
            result[grade] = []

        result[grade].append(
            {
                "page_index": selection["page_index"],
                "code": selection["rhyme_code"],
                "name": selection["rhyme_name"],
                "pages": selection["pages"],
                "position": selection.get("position"),
            }
        )

    # Sort by page_index
    for grade in result:
        result[grade].sort(key=lambda x: x["page_index"])

    return result


@api_router.get("/admin/binder-json/{school_id}")
async def get_binder_json(school_id: str, authorization: Optional[str] = Header(None)):
    """Return a combined JSON payload with school profile, book selections, and rhyme selections."""
    zip_response = False
    if authorization is None:
        zip_response = False
    try:
        _verify_and_decode_token(authorization)
    except HTTPException:
        pass

    school_query = db.collection("schools").where("school_id", "==", school_id)
    school_docs = list(school_query.stream())
    if not school_docs:
        raise HTTPException(status_code=404, detail="School not found")

    raw_school_record = school_docs[0].to_dict() or {}
    school_record = _strip_binary_fields(raw_school_record)

    # Aggregate book selections from class documents
    class_docs = list(_book_collection_for_school(school_id).stream())
    book_selections: List[Dict[str, Any]] = []
    latest_book_update: Optional[Any] = None
    for doc in class_docs:
        data = doc.to_dict() or {}
        items = data.get("items", [])
        if isinstance(items, list):
            book_selections.extend(items)
        updated_at = data.get("updated_at")
        if updated_at and (latest_book_update is None or updated_at > latest_book_update):
            latest_book_update = updated_at

    rhyme_selections = get_selected_rhymes(school_id)

    cover_docs = list(
        _cover_collection_for_school(school_id)
        .select(["grade", "theme_id", "theme_label", "colour_id", "colour_label", "status", "is_selected", "updated_at"])
        .stream()
    )
    cover_client_grades: Dict[str, Any] = {}
    cover_admin_grades: Dict[str, Any] = {}
    latest_cover_update: Optional[Any] = None
    for doc in cover_docs:
        data = doc.to_dict() or {}
        doc_id = doc.id or ""
        is_admin_doc = doc_id.endswith("__admin")
        grade_key = (data.get("grade") or (doc_id[:-8] if is_admin_doc else doc_id) or "").strip()
        if not grade_key:
            continue
        if is_admin_doc:
            cover_admin_grades[grade_key] = data
        else:
            cover_client_grades[grade_key] = data
        updated_at = data.get("updated_at")
        if updated_at and (latest_cover_update is None or updated_at > latest_cover_update):
            latest_cover_update = updated_at

    cover_grades: Dict[str, Any] = {}
    for grade_key in set([*cover_client_grades.keys(), *cover_admin_grades.keys()]):
        cover_grades[grade_key] = _merge_cover_entries(
            cover_client_grades.get(grade_key, {}),
            cover_admin_grades.get(grade_key, {}),
        )

    def _format_timestamp(value: Any) -> Optional[str]:
        if isinstance(value, datetime):
            return value.isoformat()
        return value

    payload = {
        "school": school_record,
        "Coverpage": {
            "grades": cover_grades,
            "updated_at": _format_timestamp(latest_cover_update),
        },
        "books": {
            "selections": book_selections,
            "excluded_assessments": [],
            "source": "wizard",
            "updated_at": _format_timestamp(latest_book_update),
        },
        "rhymes": rhyme_selections,
        "generated_at": datetime.utcnow().isoformat(),
    }

    # Optionally return as ZIP with binder.json and kid images if present
    zip_param = None
    try:
        from fastapi import Request  # type: ignore
    except Exception:
        Request = None  # pragma: no cover
    # FastAPI injects query params via dependency; here we inspect manually
    # Use a simple header flag to avoid adding an extra dependency
    zip_param = None

    # Build zip if requested via query ?zip=1
    # Parse from authorization header? not ideal; we rely on query via Starlette Request in dependency usually.
    # As a simple approach, check an env flag; otherwise return JSON.

    zip_flag = False
    # If running under FastAPI, inspect the current request from context
    try:
        from starlette.requests import Request  # type: ignore
        import contextvars

        request_var = contextvars.ContextVar("request")
    except Exception:
        Request = None  # pragma: no cover

    # Try to detect query param from the global scope if available
    try:
        from fastapi import Request as FastRequest  # type: ignore
    except Exception:
        FastRequest = None

    if FastRequest:
        try:
            import inspect
            frame = inspect.currentframe()
            while frame:
                locals_req = frame.f_locals.get("request")
                if isinstance(locals_req, FastRequest):
                    zip_flag = locals_req.query_params.get("zip") in ("1", "true", "yes")
                    break
                frame = frame.f_back
        except Exception:
            zip_flag = False

    if not zip_flag:
        return payload

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("binder.json", json.dumps(payload, default=str, indent=2))

        logo_blob = _coerce_to_bytes(raw_school_record.get("logo_blob"))
        if logo_blob:
            logo_ext = _guess_file_extension(raw_school_record.get("logo_mime_type"), ".bin")
            zf.writestr(f"{school_id}_logo{logo_ext}", logo_blob)

        for idx in range(1, 5):
            key = f"school_image_{idx}"
            blob_value = _coerce_to_bytes(raw_school_record.get(key))
            if blob_value:
                mime_type = raw_school_record.get(f"{key}_mime")
                extension = _guess_file_extension(mime_type, ".jpg")
                filename = f"{school_id}_{idx}{extension}"
                zf.writestr(filename, blob_value)
                continue

            text_value = raw_school_record.get(key)
            if isinstance(text_value, str):
                zf.writestr(f"{school_id}_{idx}.txt", text_value)

    buffer.seek(0)
    headers = {"Content-Disposition": f"attachment; filename={school_id}_binder.zip"}
    return Response(content=buffer.getvalue(), media_type="application/zip", headers=headers)


@api_router.post("/book-selections")
async def save_book_selections(
    payload: BookSelectionPayload, authorization: Optional[str] = Header(None)
):
    """Persist book selections grouped per class under the school_id (book_selections/{school_id}/classes/{class})."""
    decoded_token = _verify_and_decode_token(authorization)

    now = datetime.utcnow()
    class_groups: Dict[str, List[Dict[str, Any]]] = {}
    for item in payload.selections:
        class_name = (item.get("class") or "").strip()
        if not class_name:
            continue
        key = class_name.lower()
        class_groups.setdefault(key, []).append(item)

    for class_key, items in class_groups.items():
        doc_id = _normalize_class_doc_id(class_key)
        doc_ref = _book_collection_for_school(payload.school_id).document(doc_id)
        existing_doc = doc_ref.get()
        existing_data: Dict[str, Any] = existing_doc.to_dict() if existing_doc.exists else {}

        merged_items = items
        merged_excluded = list(
            {
                *existing_data.get("excluded_assessments", []),
                *payload.excluded_assessments,
            }
        )

        class_record: Dict[str, Any] = {
            "class": class_key,
            "items": merged_items,
            "excluded_assessments": merged_excluded,
            "updated_at": now,
            "source": payload.source or "wizard",
        }

        if decoded_token:
            class_record["updated_by"] = decoded_token.get("uid")
            if decoded_token.get("email"):
                class_record["updated_by_email"] = decoded_token.get("email")

        doc_ref.set(class_record)

    # Handle explicit deletions
    for class_name in payload.deleted_classes:
        if not class_name:
            continue
        doc_id = _normalize_class_doc_id(class_name)
        if not doc_id:
            continue
        _book_collection_for_school(payload.school_id).document(doc_id).delete()

    return {"ok": True, "updated_at": now.isoformat()}


@api_router.get("/book-selections/{school_id}/classes/{class_name}")
def get_book_selection_for_class(
    school_id: str, class_name: str, authorization: Optional[str] = Header(None)
):
    """Return saved book selection for a single class without streaming the entire collection."""
    _verify_and_decode_token(authorization)
    doc_id = _normalize_class_doc_id(class_name)
    if not doc_id:
        raise HTTPException(status_code=400, detail="class_name is required")
    doc_ref = _book_collection_for_school(school_id).document(doc_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Class selection not found")

    data = snapshot.to_dict() or {}
    data.setdefault("class", data.get("class") or snapshot.id)
    return data


@api_router.get("/book-selections/{school_id}")
def get_book_selections(school_id: str, authorization: Optional[str] = Header(None)):
    """Return saved book selections grouped per class for a school."""
    _verify_and_decode_token(authorization)

    # Fetch only the fields we need to avoid transferring large documents and
    # speed up the initial response for clients.
    class_docs = list(
        _book_collection_for_school(school_id)
        .select(
            [
                "class",
                "items",
                "excluded_assessments",
                "updated_at",
                "source",
                "updated_by",
                "updated_by_email",
            ]
        )
        .stream()
    )
    classes: List[Dict[str, Any]] = []
    for doc in class_docs:
        data = doc.to_dict() or {}
        data.setdefault("class", data.get("class") or doc.id)
        classes.append(data)

    return {"classes": classes}


@api_router.post("/cover-selections")
async def save_cover_selection(
    payload: CoverSelectionPayload, authorization: Optional[str] = Header(None)
):
    """Persist cover theme/colour selection per grade for a school."""
    decoded_token = _verify_and_decode_token(authorization)

    school_id = payload.school_id.strip()
    grade = payload.grade.strip().lower()
    if not school_id or not grade:
        raise HTTPException(status_code=400, detail="school_id and grade are required")

    now = datetime.utcnow()
    record: Dict[str, Any] = {
        "school_id": school_id,
        "grade": grade,
        "theme_id": (payload.theme_id or "").strip() or None,
        "theme_label": (payload.theme_label or "").strip() or None,
        "colour_id": (payload.colour_id or "").strip() or None,
        "colour_label": (payload.colour_label or "").strip() or None,
        "status": (payload.status or "").strip() or None,
        "is_selected": True if payload.is_selected is None else bool(payload.is_selected),
        "updated_at": now,
    }

    if decoded_token:
        record["updated_by"] = decoded_token.get("uid")
        if decoded_token.get("email"):
            record["updated_by_email"] = decoded_token.get("email")

    doc_ref = _cover_collection_for_school(school_id).document(_cover_doc_id(grade, admin=False))
    doc_ref.set(record)

    # Anchor client theme at the root doc for the school (immutable once set)
    if record.get("theme_id"):
        root_ref = _cover_root_doc(school_id)
        root_snapshot = root_ref.get()
        root_data = root_snapshot.to_dict() or {}
        if not root_data.get("client_theme_id"):
            root_ref.set(
                {
                    "client_theme_id": record.get("theme_id"),
                    "client_theme_label": record.get("theme_label"),
                    "updated_at": now,
                },
                merge=True,
            )

    return {"ok": True, "updated_at": now.isoformat()}


@api_router.patch("/cover-selections/{school_id}/{grade}")
async def patch_cover_selection(
    school_id: str, grade: str, payload: CoverSelectionPayload, authorization: Optional[str] = Header(None)
):
    """Update an existing cover selection without creating a new record."""
    decoded_token = _verify_and_decode_token(authorization)
    safe_school = (school_id or "").strip()
    safe_grade = (grade or "").strip().lower()
    if not safe_school or not safe_grade:
        raise HTTPException(status_code=400, detail="school_id and grade are required")

    now = datetime.utcnow()
    record: Dict[str, Any] = {"updated_at": now}

    if payload.theme_id is not None:
        record["theme_id"] = (payload.theme_id or "").strip() or None
    if payload.theme_label is not None:
        record["theme_label"] = (payload.theme_label or "").strip() or None
    if payload.colour_id is not None:
        record["colour_id"] = (payload.colour_id or "").strip() or None
    if payload.colour_label is not None:
        record["colour_label"] = (payload.colour_label or "").strip() or None
    if payload.status is not None:
        record["status"] = (payload.status or "").strip() or None
    if payload.is_selected is not None:
        record["is_selected"] = bool(payload.is_selected)

    if decoded_token:
        record["updated_by"] = decoded_token.get("uid") or decoded_token.get("user_id")
        if decoded_token.get("email"):
            record["updated_by_email"] = decoded_token.get("email")

    doc_ref = _cover_collection_for_school(safe_school).document(_cover_doc_id(safe_grade, admin=True))
    doc_ref.set(record, merge=True)

    return {"ok": True, "updated_at": now.isoformat()}


@api_router.delete("/cover-selections/{school_id}/{grade}")
async def delete_cover_override(
    school_id: str, grade: str, authorization: Optional[str] = Header(None)
):
    """Remove admin override and delete the client grade document."""
    _verify_and_decode_token(authorization)
    safe_school = (school_id or "").strip()
    safe_grade = (grade or "").strip().lower()
    if not safe_school or not safe_grade:
        raise HTTPException(status_code=400, detail="school_id and grade are required")

    admin_ref = _cover_collection_for_school(safe_school).document(_cover_doc_id(safe_grade, admin=True))
    client_ref = _cover_collection_for_school(safe_school).document(_cover_doc_id(safe_grade, admin=False))

    # Delete admin override if present
    admin_ref.delete()

    # Delete client selection document entirely
    client_ref.delete()

    return {"ok": True}


@api_router.get("/cover-selections/{school_id}")
def get_cover_selections(school_id: str, authorization: Optional[str] = Header(None), request: Request = None):
    """Return saved cover selections for all grades of a school."""
    _verify_and_decode_token(authorization)

    root_snapshot = _cover_root_doc(school_id).get()
    root_data = root_snapshot.to_dict() or {}

    docs = list(
        _cover_collection_for_school(school_id)
        .select(["grade", "theme_id", "theme_label", "colour_id", "colour_label", "status", "is_selected", "updated_at"])
        .stream()
    )

    grades: Dict[str, Any] = {}
    admin_grades: Dict[str, Any] = {}
    for doc in docs:
        data = doc.to_dict() or {}
        doc_id = doc.id or ""
        is_admin_doc = doc_id.endswith("__admin")
        grade_key = (data.get("grade") or (doc_id[:-8] if is_admin_doc else doc_id) or "").strip()
        if not grade_key:
            continue
        target = admin_grades if is_admin_doc else grades
        target[grade_key] = {
            "theme": data.get("theme_id"),
            "theme_label": data.get("theme_label"),
            "theme_colour": data.get("colour_id"),
            "theme_colour_label": data.get("colour_label"),
            "status": data.get("status"),
            "is_selected": data.get("is_selected", True),
            "updated_at": data.get("updated_at"),
        }

    return {
        "grades": grades,
        "client_grades": grades,
        "admin_grades": admin_grades,
        "client_theme_id": root_data.get("client_theme_id"),
        "client_theme_label": root_data.get("client_theme_label"),
        "library": _build_library_manifest(request),
    }


@api_router.get("/rhymes/selected/other-grades/{school_id}/{grade}")
def get_selected_rhymes_other_grades(school_id: str, grade: str):
    """Get rhymes selected in other grades that can be reused"""
    all_items = _get_all_rhyme_items(school_id)
    selections = [
        item for item in all_items if item and item.get("grade") and item.get("grade") != grade
    ]

    # Get unique rhymes from other gra  des
    selected_rhymes = {}
    for selection in selections:
        code = selection["rhyme_code"]
        if code not in selected_rhymes:
            selected_rhymes[code] = {
                "code": code,
                "name": selection["rhyme_name"],
                "pages": selection["pages"],
                "used_in_grades": [],
            }
        selected_rhymes[code]["used_in_grades"].append(selection["grade"])

    # Organize by pages
    rhymes_by_pages = {}
    for rhyme in selected_rhymes.values():
        page_key = str(rhyme["pages"])
        if page_key not in rhymes_by_pages:
            rhymes_by_pages[page_key] = []
        rhymes_by_pages[page_key].append(rhyme)
        

    return rhymes_by_pages


@api_router.post("/rhymes/select", response_model=RhymeSelection)
async def select_rhyme(input: RhymeSelectionCreate):
    """Select a rhyme for a specific grade and page index"""
    # Check if rhyme exists
    if input.rhyme_code not in RHYMES_DATA:
        raise HTTPException(status_code=404, detail="Rhyme not found")

    rhyme_data = RHYMES_DATA[input.rhyme_code]

    pages = float(rhyme_data[1])

    # Normalize position (half-page rhymes can occupy top or bottom)
    requested_position = (input.position or "").strip().lower()
    normalized_position = (
        "bottom" if pages == 0.5 and requested_position == "bottom" else "top"
    )

    page_query = {
        "school_id": input.school_id,
        "grade": input.grade,
        "page_index": input.page_index,
    }

    existing_selections = [
        doc.to_dict()
        for doc in _rhyme_collection_for_school(input.school_id)
        .where("grade", "==", input.grade)
        .where("page_index", "==", input.page_index)
        .stream()
    ]

    for existing in existing_selections:
        existing_pages = float(existing.get("pages", 1))
        existing_position = (existing.get("position") or "top").lower()

        should_remove = False

        if pages > 0.5:
            # Full-page rhyme replaces everything on the page
            should_remove = True
        else:
            # Half-page rhymes should only replace conflicting entries
            if existing_pages > 0.5:
                should_remove = True
            elif existing_position == normalized_position:
                should_remove = True
            elif existing.get("position") is None and normalized_position == "top":
                # Legacy records without a stored position occupy the top slot
                should_remove = True

        if should_remove:
            _rhyme_collection_for_school(input.school_id).document(existing["id"]).delete()

    # Create new selection
    selection_dict = input.dict()
    selection_id = _build_rhyme_doc_id(
        input.school_id, input.grade, input.page_index, normalized_position
    )

    selection_dict.update(
        {
            "id": selection_id,
            "rhyme_name": rhyme_data[0],
            "pages": pages,
            "position": normalized_position,
        }
    )

    class_key = input.grade.strip().lower().replace(" ", "_")
    class_doc = _rhyme_collection_for_school(input.school_id).document(class_key)
    existing = class_doc.get().to_dict() or {}
    items: List[Dict[str, Any]] = existing.get("items", [])

    # Do not replace existing entries; append if this id is new
    if not any(item.get("id") == selection_id for item in items):
        items.append(selection_dict)

    class_doc.set(
        {
            "grade": input.grade,
            "items": items,
            "updated_at": datetime.utcnow(),
        }
    )

    return RhymeSelection(**selection_dict)


# @api_router.delete("/rhymes/remove/{school_id}/{grade}/{page_index}")
# async def remove_rhyme_selection(school_id: str, grade: str, page_index: int):
#     """Remove a rhyme selection for a specific page index"""
#     result = await db.rhyme_selections.delete_many({
#         "school_id": school_id,
#         "grade": grade,
#         "page_index": page_index
#     })

#     if result.deleted_count == 0:
#         raise HTTPException(status_code=404, detail="Selection not found")

#     return {"message": "Selection removed successfully"}


# @api_router.delete("/rhymes/remove/{school_id}/{grade}/{page_index}/{position}")
# async def remove_specific_rhyme_selection(
#     school_id: str, grade: str, page_index: int, position: str
# ):
#     """Remove a specific rhyme selection for a position (top/bottom)"""
#     class_key = grade.strip().lower().replace(" ", "_")
#     class_doc_ref = _rhyme_collection_for_school(school_id).document(class_key)
#     class_doc = class_doc_ref.get()
#     data = class_doc.to_dict() or {}
#     selections = data.get("items", [])

#     if not selections:
#         # raise HTTPException(status_code=404, detail="No selections found for this page")
#         return {"message": f"selection is removed"}

#     # Find and remove the specific position rhyme
#     target_position = position.lower()
#     selection_to_remove = None

#     for selection in selections:
#         pages = float(selection.get("pages", 0))
#         stored_position = (selection.get("position") or "top").lower()

#         if pages > 0.5:
#             if target_position == "top":
#                 selection_to_remove = selection
#                 break
#         elif pages == 0.5:
#             if stored_position == target_position:
#                 selection_to_remove = selection
#                 break
#             if selection.get("position") is None and target_position == "top":
#                 selection_to_remove = selection
#                 break

#     if not selection_to_remove:
#         for selection in selections:
#             if target_position == "top" and selection.get("pages") != 0.5:
#                 selection_to_remove = selection
#                 break
#             if target_position == "bottom" and selection.get("pages") == 0.5:
#                 selection_to_remove = selection
#                 break

#     if not selection_to_remove:
#         raise HTTPException(
#             status_code=404, detail="Selection not found for the specified position"
#         )

#     # Remove the selection by rewriting class items
#     remaining = [item for item in selections if item.get("id") != selection_to_remove["id"]]
#     class_doc_ref.set(
#         {
#             "grade": grade,
#             "items": remaining,
#             "updated_at": datetime.utcnow(),
#         }
#     )

#     return {"message": f"{position.capitalize()} selection removed successfully"}


@api_router.get("/rhymes/status/{school_id}")
async def get_grade_status(school_id: str):
    """Get selection status for all grades"""
    grades = ["nursery", "lkg", "ukg", "playgroup"]
    status = []

    for grade in grades:
        class_key = grade.strip().lower().replace(" ", "_")
        class_doc = _rhyme_collection_for_school(school_id).document(class_key).get()
        class_data = class_doc.to_dict() or {}
        selections = class_data.get("items", [])

        selected_count = len(selections)
        selected_pages = 0.0

        for selection in selections:
            pages_value = selection.get("pages", 0)
            try:
                normalized_pages = float(pages_value)
            except (TypeError, ValueError):
                normalized_pages = 0.0

            if normalized_pages <= 0:
                normalized_pages = 1.0

            selected_pages += normalized_pages

        status.append(
            {
                "grade": grade,
                "selected_count": selected_count,
                "total_available": 25,  # Maximum 25 rhymes can be selected
                "selected_pages": selected_pages,
                "max_pages": MAX_RHYME_PAGES,
            }
        )

    return status


async def get_all_schools_with_selections(
    page: int = 1, limit: int = 10, authorization: Optional[str] = Header(None)
):
    """Return all schools with their rhyme selections grouped by grade, with pagination."""
    decoded_token = _verify_and_decode_token(authorization)
    user_record = _ensure_user_document(decoded_token)
    if user_record.get("role") != "super-admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    # Fetch total count first
    total_schools_query = db.collection("schools")
    total_count = len(list(total_schools_query.stream()))

    # Apply pagination to the main query
    offset = (page - 1) * limit
    school_docs_query = (
        db.collection("schools")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
    )
    # Get all docs first then apply skip and limit
    all_school_docs = [doc.to_dict() for doc in school_docs_query.stream()]
    school_docs = all_school_docs[offset : offset + limit]

    if not school_docs:
        return PaginatedSchoolResponse(schools=[], total_count=total_count)

    school_ids = [doc.get("school_id") for doc in school_docs if doc.get("school_id")]

    selection_docs: List[Dict[str, Any]] = []
    for school_id in school_ids:
        for class_doc in _rhyme_collection_for_school(school_id).stream():
            data = class_doc.to_dict() or {}
            items = data.get("items", [])
            if isinstance(items, list):
                selection_docs.extend(items)

    selections_by_school: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    latest_selection_timestamp: Dict[str, datetime] = {}

    for selection in selection_docs:
        school_id = selection.get("school_id")
        grade = selection.get("grade")

        if not school_id or not grade:
            continue

        school_bucket = selections_by_school.setdefault(school_id, {})
        grade_bucket = school_bucket.setdefault(grade, [])
        grade_bucket.append(selection)

        timestamp = selection.get("timestamp")
        if timestamp:
            existing = latest_selection_timestamp.get(school_id)
            if not existing or timestamp > existing:
                latest_selection_timestamp[school_id] = timestamp

    def sort_key(selection: Dict[str, Any]):
        page_index = selection.get("page_index")
        try:
            normalized_page = int(page_index)
        except (TypeError, ValueError):
            normalized_page = 0

        position = (selection.get("position") or "top").strip().lower()
        position_weight = 1 if position == "bottom" else 0

        return (normalized_page, position_weight)

    schools_with_details: List[SchoolWithSelections] = []

    for doc in school_docs:
        school_id = doc.get("school_id")
        if not school_id:
            continue

        if not doc.get("id"):
            doc["id"] = school_id

        base_school = school_profiles.build_school_from_record(doc)

        grade_map: Dict[str, List[RhymeSelectionDetail]] = {}

        for grade, selections in selections_by_school.get(school_id, {}).items():
            sorted_selections = sorted(selections, key=sort_key)
            detailed_selections: List[RhymeSelectionDetail] = []

            for selection in sorted_selections:
                page_index_raw = selection.get("page_index", 0)
                try:
                    page_index = int(page_index_raw)
                except (TypeError, ValueError):
                    page_index = 0

                pages_raw = selection.get("pages", 0)
                try:
                    pages_value = float(pages_raw)
                except (TypeError, ValueError):
                    pages_value = 0.0

                detailed_selections.append(
                    RhymeSelectionDetail(
                        id=selection.get("id"),
                        page_index=page_index,
                        rhyme_code=selection.get("rhyme_code"),
                        rhyme_name=selection.get("rhyme_name"),
                        pages=pages_value,
                        position=selection.get("position"),
                        timestamp=selection.get("timestamp"),
                    )
                )

            grade_map[grade] = detailed_selections

        total_selections = sum(len(items) for items in grade_map.values())
        last_updated = latest_selection_timestamp.get(school_id) or doc.get("timestamp")

        schools_with_details.append(
            SchoolWithSelections(
                **base_school.dict(),
                total_selections=total_selections,
                last_updated=last_updated,
                grade_selections=grade_map,
            )
        )

    return PaginatedSchoolResponse(schools=schools_with_details, total_count=total_count)


@api_router.delete("/admin/schools/{school_id}")
async def delete_school(school_id: str, authorization: Optional[str] = Header(None)):
    """Delete a school and all of its rhyme selections."""
    decoded_token = _verify_and_decode_token(authorization)
    user_record = _ensure_user_document(decoded_token)
    if user_record.get("role") != "super-admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    school_query = db.collection("schools").where("school_id", "==", school_id)
    school_docs = [doc for doc in school_query.stream()]
    for doc in school_docs:
        doc.reference.delete()
    school_result_deleted_count = len(school_docs)

    selection_query = db.collection("rhyme_selections").where("school_id", "==", school_id)
    selection_docs = [doc for doc in selection_query.stream()]
    for doc in selection_docs:
        doc.reference.delete()
    selection_result_deleted_count = len(selection_docs)

    if school_result_deleted_count == 0 and selection_result_deleted_count == 0:
        raise HTTPException(status_code=404, detail="School not found")

    return {
        "message": "School and associated rhymes removed successfully",
        "removed_school": school_result_deleted_count,
        "removed_selections": selection_result_deleted_count,
    }


def _localize_rhyme_svg_markup(svg_markup: str, source_path: Optional[Path], rhyme_code: str) -> str:
    """Rewrite external image references without inlining bitmap data."""

    try:
        return _localize_svg_image_assets(
            svg_markup,
            source_path or Path("."),
            rhyme_code,
            inline_mode=False,
            cache_dir=_get_rhyme_image_cache_dir(rhyme_code),
            asset_url_prefix=f"/api/rhymes/images/{quote(rhyme_code, safe='')}",
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning(
            "Unable to rewrite image assets for rhyme %s from %s: %s",
            rhyme_code,
            source_path,
            exc,
        )
        return svg_markup


@lru_cache(maxsize=256)
def _get_cached_rhyme_pages(rhyme_code: str) -> Dict[str, List[str]]:
    """Return a cached list of localised SVG pages for ``rhyme_code``."""

    svg_path = _resolve_rhyme_svg_path(rhyme_code)

    svg_pages: List[str] = []
    source_paths: List[str] = []

    if svg_path is not None:
        candidates: List[Path] = list(svg_path)

        for candidate in candidates:
            try:
                svg_content = candidate.read_text(encoding="utf-8")
            except OSError as exc:
                logger.error(
                    "Unable to read SVG for rhyme %s at %s: %s", rhyme_code, candidate, exc
                )
                continue

            localized_markup = _localize_rhyme_svg_markup(svg_content, candidate, rhyme_code)
            svg_pages.append(localized_markup)
            source_paths.append(str(candidate))

    if svg_pages:
        return {"pages": svg_pages, "sources": source_paths}

    try:
        document = _load_rhyme_svg_markup(rhyme_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Rhyme not found") from exc

    localized_markup = _localize_rhyme_svg_markup(
        document.markup, document.source_path, rhyme_code
    )

    return {"pages": [localized_markup], "sources": [str(document.source_path or "auto-generated")]} 


@api_router.get("/rhymes/svg/{rhyme_code}")
async def get_rhyme_svg(rhyme_code: str):
    """Return all SVG pages for the requested rhyme as a JSON list.

    The results are cached to avoid repeated filesystem reads and asset
    localisation work, ensuring multi-page rhymes can be stepped through on the
    frontend without repeatedly hitting the backend.
    """

    svg_payload = _get_cached_rhyme_pages(rhyme_code)

    if not svg_payload.get("pages"):
        raise HTTPException(status_code=404, detail="Rhyme not found")

    return JSONResponse(svg_payload)


@api_router.get("/rhymes/svg-image/{rhyme_code}")
async def get_rhyme_svg_image(rhyme_code: str, file: str):
    """Return a bitmap asset referenced by a rhyme SVG (legacy query API)."""

    image_path = _resolve_rhyme_image_path(rhyme_code, file)
    mime_type, _ = mimetypes.guess_type(image_path.name)
    if not mime_type:
        mime_type = "application/octet-stream"

    try:
        content = image_path.read_bytes()
    except OSError as exc:
        logger.error("Unable to read image %s for rhyme %s: %s", image_path, rhyme_code, exc)
        raise HTTPException(status_code=500, detail="Unable to read image file") from exc

    return Response(content=content, media_type=mime_type)


@api_router.get("/rhymes/images/{rhyme_code}/{file_name}")
async def get_rhyme_image(rhyme_code: str, file_name: str):
    """Serve cached rhyme image assets as regular files for browser consumption."""

    image_path = _resolve_rhyme_image_path(rhyme_code, file_name)
    mime_type, _ = mimetypes.guess_type(image_path.name)
    if not mime_type:
        mime_type = "application/octet-stream"

    try:
        content = image_path.read_bytes()
    except OSError as exc:
        logger.error("Unable to read image %s for rhyme %s: %s", image_path, rhyme_code, exc)
        raise HTTPException(status_code=500, detail="Unable to read image file") from exc

    return Response(content=content, media_type=mime_type)


@api_router.get("/cover-assets/themes")
async def list_cover_theme_images(request: Request):
    """Return all theme thumbnails and colour PNGs stored on disk."""

    themes = [
        _build_theme_payload_from_disk(f"theme{index}", request) for index in range(1, COVER_THEME_STORE.theme_slots + 1)
    ]
    return {"themes": themes, "gradeLabels": COVER_GRADE_LABELS}


@api_router.get("/cover-assets/themes/{theme_id}")
async def get_cover_theme_images(theme_id: str, request: Request):
    """Return a single theme and its colours."""

    return {"theme": _build_theme_payload_from_disk(theme_id, request)}


# ---------------------------------------------------------------------------
# Shared cover library (disk-backed PNGs for all schools)
# ---------------------------------------------------------------------------


@api_router.get("/cover-library")
async def list_cover_library(request: Request):
    """Return available theme covers and colour PNGs stored under public/cover-library."""

    return {"library": _build_library_manifest(request)}


@api_router.post("/cover-library/themes/{theme_key}/cover")
async def upload_library_theme_cover(theme_key: str, file: UploadFile = File(...), request: Request = None):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Cover image is empty.")
    extension = _guess_image_extension(file)
    theme_dir = _resolve_library_theme_dir(theme_key)
    _remove_existing_images(theme_dir, "cover")
    target_path = theme_dir / f"cover{extension}"
    _write_public_image(target_path, content)
    return {"status": "ok", "theme": _build_library_theme_payload(theme_key, request), "library": _build_library_manifest(request)}


@api_router.delete("/cover-library/themes/{theme_key}/cover")
async def delete_library_theme_cover(theme_key: str, request: Request):
    theme_dir = _resolve_library_theme_dir(theme_key)
    _remove_existing_images(theme_dir, "cover")
    return {"status": "ok", "theme": _build_library_theme_payload(theme_key, request), "library": _build_library_manifest(request)}


@api_router.post("/cover-library/colours/{version}/{grade_code}")
async def upload_library_colour(version: str, grade_code: str, file: UploadFile = File(...), request: Request = None):
    if grade_code.upper() not in LIBRARY_GRADE_CODES:
        raise HTTPException(status_code=400, detail="Grade code must be one of P,N,L,U.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Colour image is empty.")
    extension = _guess_image_extension(file)
    safe_version = _sanitize_component(version, "V1")
    safe_grade = _sanitize_component(grade_code, "P")
    for base_dir in LIBRARY_COLOUR_BASE_DIRS:
        _remove_existing_images(base_dir / safe_version, safe_grade)
    target_path = _resolve_library_colour_path(version, grade_code.upper(), extension, for_write=True)
    _write_public_image(target_path, content)
    return {"status": "ok", "library": _build_library_manifest(request)}


@api_router.delete("/cover-library/colours/{version}/{grade_code}")
async def delete_library_colour(version: str, grade_code: str, request: Request):
    if grade_code.upper() not in LIBRARY_GRADE_CODES:
        raise HTTPException(status_code=400, detail="Grade code must be one of P,N,L,U.")
    # remove any extension variant
    safe_grade = _sanitize_component(grade_code, "P")
    safe_version = _sanitize_component(version, "V1")
    for base_dir in LIBRARY_COLOUR_BASE_DIRS:
        version_dir = base_dir / safe_version
        _remove_existing_images(version_dir, safe_grade)
    return {"status": "ok", "library": _build_library_manifest(request)}


# ---------------------------------------------------------------------------
# Subject PDF uploads (static)
# ---------------------------------------------------------------------------


@api_router.post("/subject-pdfs/{class_name}/{subject_name}")
async def upload_subject_pdf(class_name: str, subject_name: str, file: UploadFile = File(...)):
    """Upload a subject PDF to the static public folder."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="PDF is empty.")
    target_path = _resolve_subject_pdf_path(class_name, subject_name, file.filename or "subject.pdf")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        target_path.write_bytes(content)
    except OSError as exc:
        logger.error("Unable to store subject PDF at %s: %s", target_path, exc)
        raise HTTPException(status_code=500, detail="Unable to store PDF.") from exc
    public_url = _public_url_for(target_path, None)
    return {"status": "ok", "url": public_url}



@api_router.post("/cover-assets/rebuild-images")
async def rebuild_cover_images(source_dir: Optional[str] = None):
    """
    Generate WebP thumbnails and previews for existing cover images on disk.

    Defaults to the cover themes directory; optional ``source_dir`` can override.
    """

    base_dir = Path(source_dir).resolve() if source_dir else IMAGE_INPUT_BASE
    thumb_dir = THUMB_OUTPUT_DIR if not source_dir else (base_dir / "thumbnails-webp")
    preview_dir = PREVIEW_OUTPUT_DIR if not source_dir else (base_dir / "previews-webp")

    summary = process_existing_images_on_disk(
        base_dir,
        thumb_dir=thumb_dir,
        preview_dir=preview_dir,
        thumb_width=THUMB_MAX_WIDTH,
        preview_width=PREVIEW_MAX_WIDTH,
    )

    return summary


# Temporary helper UI to trigger the rebuild endpoint from a browser.
@app.get("/admin/rebuild-images", response_class=HTMLResponse)
async def rebuild_images_page():
    html = """
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Rebuild WebP Images</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; max-width: 720px; margin: auto; }
        label { display: block; margin-bottom: 8px; font-weight: 600; }
        input { width: 100%; padding: 8px; margin-bottom: 12px; }
        button { padding: 10px 16px; font-size: 15px; cursor: pointer; }
        #log { margin-top: 16px; font-family: monospace; white-space: pre-wrap; border: 1px solid #ddd; padding: 12px; border-radius: 6px; background: #f9fafb; }
      </style>
    </head>
    <body>
      <h2>Rebuild WebP Images</h2>
      <p>Click to POST <code>/api/cover-assets/rebuild-images</code>. Leave the path blank to use defaults.</p>
      <label for="dir">Source directory (optional)</label>
      <input id="dir" type="text" placeholder="e.g. C:/path/to/covers or /public/cover-library/themes" />
      <button id="run">Run rebuild</button>
      <div id="log">Idle</div>
      <script>
        const btn = document.getElementById('run');
        const log = document.getElementById('log');
        btn.onclick = async () => {
          btn.disabled = true;
          log.textContent = 'Running...';
          try {
            const dir = document.getElementById('dir').value.trim();
            const body = dir ? { source_dir: dir } : {};
            const res = await fetch('/api/cover-assets/rebuild-images', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const data = await res.json();
            log.textContent = JSON.stringify(data, null, 2);
          } catch (err) {
            log.textContent = 'Error: ' + err;
          } finally {
            btn.disabled = false;
          }
        };
      </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

# @api_router.post("/cover-assets/themes/{theme_id}/thumbnail")
# async def upload_cover_theme_thumbnail(
#     theme_id: str,
#     request: Request,
#     file: UploadFile = File(...),
#     label: Optional[str] = Form(None),
# ):
#     """Upload a PNG thumbnail for a theme and store it in the public directory."""

#     content = await file.read()
#     if not content:
#         raise HTTPException(status_code=400, detail="Thumbnail image is empty.")

#     theme_dir = _resolve_theme_dir(theme_id)
#     extension = _guess_image_extension(file)
#     _remove_existing_images(theme_dir, "thumbnail")
#     target_path = theme_dir / f"thumbnail{extension}"
#     _write_public_image(target_path, content)
#     if label:
#         _save_theme_meta(theme_dir, theme_label=label)

#     return {"status": "ok", "theme": _build_theme_payload_from_disk(theme_id, request)}


@api_router.delete("/cover-assets/themes/{theme_id}/thumbnail")
async def delete_cover_theme_thumbnail(theme_id: str, request: Request):
    """Delete a theme thumbnail from the public directory."""

    theme_dir = _resolve_theme_dir(theme_id)
    _remove_existing_images(theme_dir, "thumbnail")
    return {"status": "ok", "theme": _build_theme_payload_from_disk(theme_id, request)}


@api_router.post("/cover-assets/themes/{theme_id}/colours/{colour_id}")
async def upload_cover_theme_colour(
    theme_id: str,
    colour_id: str,
    request: Request,
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
):
    """Upload a PNG for a specific colour slot within a theme."""

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Colour image is empty.")

    theme_dir = _resolve_theme_dir(theme_id)
    colour_dir = theme_dir / "colours"
    safe_colour_id = _sanitize_component(colour_id, "colour")
    extension = _guess_image_extension(file)
    _remove_existing_images(colour_dir, safe_colour_id)
    target_path = colour_dir / f"{safe_colour_id}{extension}"
    _write_public_image(target_path, content)
    if label:
        _save_theme_meta(theme_dir, colour_id=colour_id, colour_label=label)

    return {"status": "ok", "theme": _build_theme_payload_from_disk(theme_id, request)}


@api_router.delete("/cover-assets/themes/{theme_id}/colours/{colour_id}")
async def delete_cover_theme_colour(theme_id: str, colour_id: str, request: Request):
    """Delete a colour PNG for a theme from the public directory."""

    theme_dir = _resolve_theme_dir(theme_id)
    colour_dir = theme_dir / "colours"
    safe_colour_id = _sanitize_component(colour_id, "colour")
    _remove_existing_images(colour_dir, safe_colour_id)
    _delete_colour_meta(theme_dir, colour_id)

    return {"status": "ok", "theme": _build_theme_payload_from_disk(theme_id, request)}


@api_router.get("/cover-assets/network/{selection_key}")
async def get_cover_assets_network_paths(selection_key: str):
    """Return raw SVG markup for every file within the requested theme/colour folder."""

    base_path = _ensure_cover_assets_base_path()
    unc_base_path = _get_cover_assets_unc_base_path()
   

    try:
        theme_number, colour_number = config.parse_cover_selection_key(selection_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    selection_unc_path, selection_fs_path = unc_path_utils.build_cover_selection_paths(
        unc_base_path, base_path, theme_number, colour_number
    )
    

    try:
        print(selection_fs_path)
        exists = Path(selection_fs_path).exists()
       
        is_directory = selection_fs_path.is_dir()
        
    except OSError as exc:
        logger.error("Unable to access cover SVG directory %s: %s", selection_fs_path, exc)
        raise HTTPException(status_code=500, detail="Unable to access cover assets.") from exc

    if not exists or not is_directory:
        raise HTTPException(status_code=404, detail="Requested cover selection does not exist.")

    try:
        svg_files = [
            candidate
            for candidate in sorted(selection_fs_path.iterdir())
            if candidate.is_file() and candidate.suffix.lower() == ".svg"
        ]
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Requested cover selection does not exist.")
    except OSError as exc:
        logger.error("Unable to read cover SVG directory %s: %s", selection_fs_path, exc)
        raise HTTPException(status_code=500, detail="Unable to access cover assets.") from exc

    assets = []

    for svg_file in svg_files:
        # Build a raw UNC string (for example r"\\pixartnas\share\folder") so the
        # network lookup uses the exact Windows path supplied by administrators.
        network_file = unc_path_utils.format_unc_path(selection_unc_path / svg_file.name)
        print(network_file)
        svg_markup: Optional[str] = None

        svg_source_path: Optional[Path] = None

        try:
            with open(network_file, "r", encoding="utf-8") as handle:
                svg_markup = handle.read()
            svg_source_path = Path(network_file)
        except OSError as exc:
            logger.warning(
                "Unable to read cover SVG '%s' via network path %s: %s. Falling back to local mirror.",
                svg_file.name,
                network_file,
                exc,
            )

        if svg_markup is None:
            try:
                svg_markup = _read_cover_svg_text(svg_file)
            except OSError as exc:
                logger.error(
                    "Unable to read cover SVG '%s' from local path %s: %s",
                    svg_file.name,
                    svg_file,
                    exc,
                )
                raise HTTPException(status_code=500, detail="Unable to load cover SVG files.") from exc
            else:
                svg_source_path = svg_file

        if svg_source_path is None:
            svg_source_path = svg_file

        svg_markup = _localize_cover_svg_markup(svg_markup, svg_source_path)

        assets.append(
            {
                "fileName": svg_file.name,
                "relativePath": _as_windows_relative_path(base_path, svg_file),
                "svgMarkup": svg_markup,
                "personalisedMarkup": "",
            }
        )

    return {"assets": assets}


@api_router.get("/cover-assets/images/{file_name}")
async def get_cover_asset_image(file_name: str):
    """Serve cached cover asset images as standard files instead of base64 data URIs."""

    cache_dir = _ensure_image_cache_dir()
    candidate_path = (cache_dir / file_name).resolve()

    try:
        candidate_path.relative_to(cache_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid image requested.")

    if not candidate_path.exists() or not candidate_path.is_file():
        raise HTTPException(status_code=404, detail="Cover asset image not found.")

    media_type, _ = mimetypes.guess_type(candidate_path.name)
    content = candidate_path.read_bytes()
    return Response(content=content, media_type=media_type or "application/octet-stream")


@api_router.get("/cover-assets/svg/{relative_path:path}")
async def get_cover_asset(relative_path: str):
    """Return the raw SVG bytes for the cover asset ``relative_path``."""
    print("Iam running")
    base_path = _ensure_cover_assets_base_path()
   

    candidate_path = (base_path / Path(relative_path)).resolve()
    

    try:
        candidate_path.relative_to(base_path)
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cover asset path requested.")

    if not candidate_path.exists() or not candidate_path.is_file():
        raise HTTPException(status_code=404, detail="Cover asset not found.")

    try:
        svg_text = _read_cover_svg_text(candidate_path)
    except OSError as exc:  # pragma: no cover - filesystem errors are unexpected
        logger.error("Unable to read cover SVG '%s': %s", candidate_path, exc)
        raise HTTPException(status_code=500, detail="Unable to read cover asset.") from exc

    localized_svg = _localize_cover_svg_markup(svg_text, candidate_path)

    return Response(content=localized_svg.encode("utf-8"), media_type="image/svg+xml")


def _draw_text_only_rhyme(
    pdf_canvas: Any,
    entry: Dict[str, Any],
    page_width: float,
    page_height: float,
    y_offset: float = 0,
) -> None:
    """Render a stylised fallback card when SVG backends are unavailable.

    The previous implementation printed a diagnostic message that bubbled up to
    the generated PDF. Users interpreted the message as an error even though
    the export succeeded. To provide a polished experience regardless of
    optional dependencies, the fallback now draws a colourful card directly
    with ReportLab primitives, closely matching the SVG-based design.
    """

    rhyme_code = entry.get("rhyme_code", "")
    rhyme_info = RHYMES_DATA.get(rhyme_code)

    rhyme_name = entry.get("rhyme_name") or (rhyme_info[0] if rhyme_info else rhyme_code)
    pages_value = entry.get("pages")
    if pages_value is None and rhyme_info:
        pages_value = rhyme_info[1]

    padding = 36
    rect_x = padding
    rect_y = y_offset + padding
    rect_width = page_width - padding * 2
    rect_height = page_height - padding * 2

    # Create a soft gradient background by painting a stack of translucent bars.
    gradient_steps = 24
    start_color = (1.0, 0.42, 0.42)
    end_color = (0.31, 0.8, 0.77)

    card_path = pdf_canvas.beginPath()
    card_path.roundRect(rect_x, rect_y, rect_width, rect_height, 12)

    pdf_canvas.saveState()
    pdf_canvas.clipPath(card_path, stroke=0, fill=0)

    for step in range(gradient_steps):
        blend = step / max(gradient_steps - 1, 1)
        red = start_color[0] + (end_color[0] - start_color[0]) * blend
        green = start_color[1] + (end_color[1] - start_color[1]) * blend
        blue = start_color[2] + (end_color[2] - start_color[2]) * blend
        band_height = rect_height / gradient_steps + 1  # overlap to avoid gaps
        pdf_canvas.setFillColorRGB(red, green, blue)
        pdf_canvas.rect(
            rect_x,
            rect_y + step * (rect_height / gradient_steps),
            rect_width,
            band_height,
            stroke=0,
            fill=1,
        )

    pdf_canvas.restoreState()

    # Add a translucent overlay so text remains legible on the gradient.
    pdf_canvas.saveState()
    pdf_canvas.setFillColorRGB(1, 1, 1)
    if hasattr(pdf_canvas, "setFillAlpha"):
        pdf_canvas.setFillAlpha(0.15)
    pdf_canvas.roundRect(rect_x, rect_y, rect_width, rect_height, 12, stroke=0, fill=1)
    pdf_canvas.restoreState()

    pdf_canvas.setFillColorRGB(1, 1, 1)
    pdf_canvas.setFont("Helvetica-Bold", 22)
    pdf_canvas.drawCentredString(page_width / 2, rect_y + rect_height - 48, rhyme_name)

    pdf_canvas.setFont("Helvetica", 13)
    pdf_canvas.drawCentredString(page_width / 2, rect_y + rect_height - 74, f"Code: {rhyme_code}")

    if pages_value is not None:
        pdf_canvas.drawCentredString(
            page_width / 2,
            rect_y + rect_height - 94,
            f"Pages: {pages_value}",
        )

    pdf_canvas.saveState()
    pdf_canvas.setStrokeColorRGB(1, 1, 1)
    pdf_canvas.setLineWidth(1.2)
    pdf_canvas.roundRect(rect_x, rect_y, rect_width, rect_height, 12, stroke=1, fill=0)
    pdf_canvas.restoreState()

    # Decorative musical note badge similar to the SVG layout.
    badge_radius = 32
    badge_center_x = page_width / 2
    badge_center_y = rect_y + rect_height / 2
    pdf_canvas.saveState()
    pdf_canvas.setFillColorRGB(1, 1, 1)
    if hasattr(pdf_canvas, "setFillAlpha"):
        pdf_canvas.setFillAlpha(0.25)
    pdf_canvas.circle(badge_center_x, badge_center_y, badge_radius, stroke=0, fill=1)
    pdf_canvas.restoreState()
    pdf_canvas.setFillColorRGB(1, 1, 1)
    pdf_canvas.setFont("Helvetica-Bold", 28)
    pdf_canvas.drawCentredString(badge_center_x, badge_center_y - 10, "♪")


def _render_svg_on_canvas(
    pdf_canvas: Any,
    backend: _SvgBackend,
    svg_document: _SvgDocument,
    width: float,
    height: float,
    *,
    x: float = 0,
    y: float = 0,
    rhyme_code: Optional[str] = None,
) -> bool:
    """Render ``svg_document`` onto ``pdf_canvas`` using the available backend."""

    logger = logging.getLogger(__name__)

    original_markup = svg_document.markup
    effective_markup = original_markup
    source_path = svg_document.source_path

    raster_only = _svg_requires_raster_backend(svg_document)

    if source_path is not None:
        localized_markup = _localize_svg_image_assets(
            effective_markup,
            source_path,
            rhyme_code or "unknown",
            inline_mode=True,
            preprocess_for_pdf=True,
        )
        if localized_markup != effective_markup:
            effective_markup = localized_markup

    sanitized_markup = _sanitize_svg_for_svglib(effective_markup)
    gradient_requires_raster = sanitized_markup != effective_markup
    if gradient_requires_raster:
        logger.debug(
            "Gradient sanitization required for %s; falling back to raster rendering",
            rhyme_code or "unknown",
        )

    vector_markup = sanitized_markup if not gradient_requires_raster else effective_markup

    needs_temp_file = source_path is not None and vector_markup != original_markup

    vector_backend_available = (
        backend.svg2rlg
        and backend.render_pdf
        and not raster_only
    )

    temp_svg_path: Optional[Path] = None

    if vector_backend_available and not gradient_requires_raster:
        try:
            svg_input: Any
            if source_path is not None:
                if needs_temp_file:
                    candidate_dirs: List[Path] = []
                    parent_dir = source_path.parent
                    if parent_dir.exists() and parent_dir.is_dir():
                        candidate_dirs.append(parent_dir)
                    try:
                        cache_dir = _ensure_image_cache_dir()
                    except OSError:
                        cache_dir = None
                    if cache_dir and cache_dir not in candidate_dirs:
                        candidate_dirs.append(cache_dir)

                    for directory in candidate_dirs:
                        try:
                            with tempfile.NamedTemporaryFile(
                                "w",
                                encoding="utf-8",
                                suffix=".svg",
                                prefix=f"{source_path.stem}_sanitized_",
                                dir=directory,
                                delete=False,
                            ) as temp_file:
                                temp_file.write(vector_markup)
                            temp_svg_path = Path(temp_file.name)
                            break
                        except OSError as exc:
                            logger.debug(
                                "Unable to create temporary sanitized SVG in %s: %s",
                                directory,
                                exc,
                            )

                    if temp_svg_path is None:
                        logger.warning(
                            "Falling back to in-memory sanitized SVG for %s", source_path
                        )
                        svg_input = BytesIO(vector_markup.encode("utf-8"))
                    else:
                        svg_input = str(temp_svg_path)
                else:
                    svg_input = str(source_path)
            else:
                svg_input = BytesIO(vector_markup.encode("utf-8"))

            drawing = backend.svg2rlg(svg_input)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("Failed to parse SVG using svglib: %s", exc)
            drawing = None
        finally:
            if temp_svg_path is not None:
                try:
                    temp_svg_path.unlink()
                except OSError as exc:
                    logger.debug(
                        "Unable to remove temporary sanitized SVG %s: %s", temp_svg_path, exc
                    )

        if drawing and getattr(drawing, "width", None) and getattr(drawing, "height", None):
            try:
                scale_x = width / float(drawing.width)
                scale_y = height / float(drawing.height)
                drawing.scale(scale_x, scale_y)
                min_x = getattr(drawing, "minX", 0) or 0
                min_y = getattr(drawing, "minY", 0) or 0
                drawing.translate(-min_x, -min_y)
                backend.render_pdf.draw(drawing, pdf_canvas, x, y)
                return True
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("Failed to render SVG using svglib: %s", exc)
        else:
            logger.debug(
                "svglib was unable to determine geometry for SVG; falling back to raster rendering"
            )

    if (
        backend.svg2png
        and backend.image_reader
    ):
        try:
            image_buffer = BytesIO()
            cairosvg_markup = effective_markup
            if svg_document.source_path is not None:
                cairosvg_markup = _localize_svg_image_assets(
                    cairosvg_markup,
                    svg_document.source_path,
                    rhyme_code or "unknown",
                    inline_mode=True,
                    preprocess_for_pdf=True,
                )
            backend.svg2png(
                bytestring=cairosvg_markup.encode("utf-8"),
                write_to=image_buffer,
                output_width=int(width),
                output_height=int(height),
                background_color="transparent",
            )
            image_buffer.seek(0)
            pdf_canvas.drawImage(
                backend.image_reader(image_buffer),
                x,
                y,
                width=width,
                height=height,
                mask="auto",
            )
            return True
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning("Failed to render SVG using CairoSVG: %s", exc)

    return False


@api_router.get("/rhymes/binder/{school_id}/{grade}")
async def download_rhyme_binder(school_id: str, grade: str):
    """Generate a PDF binder containing all rhymes for the specified grade."""


    try:
        pdf_resources = _load_pdf_dependencies()
         
        
        
    except PDFDependencyUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    all_rhyme_items = _get_all_rhyme_items(school_id)
    selections = [
        item for item in all_rhyme_items if item and item.get("grade") == grade and item.get("rhyme_code")
    ]

    if not selections:
        return Response(
            content="Please select at least one rhyme page before downloading the binder.",
            status_code=400,
            media_type="text/plain",
        )

    total_pages = 0.0
    for selection in selections:
        try:
            total_pages += float(selection.get("pages", 0))
        except (TypeError, ValueError):
            continue

    if total_pages <= 0:
        return Response(
            content="Please select at least one rhyme page before downloading the binder.",
            status_code=400,
            media_type="text/plain",
        )

    pages_map: Dict[int, List[Dict[str, Any]]] = {}

    for selection in selections:
        try:
            page_index = int(selection.get("page_index", 0))
        except (TypeError, ValueError):
            page_index = 0
        pages_map.setdefault(page_index, []).append(selection)

    buffer = BytesIO()
    pdf_canvas = pdf_resources.canvas_factory(buffer, pagesize=pdf_resources.page_size)
    page_width, page_height = pdf_resources.page_size
    svg_backend = pdf_resources.svg_backend

    svg_document_cache: Dict[str, List[_SvgDocument]] = {}

    def _get_svg_documents(rhyme_code: str) -> List[_SvgDocument]:
        """Return cached SVG pages for ``rhyme_code`` within this request."""

        if rhyme_code in svg_document_cache:
            return svg_document_cache[rhyme_code]

        documents: List[_SvgDocument] = []
        try:
            svg_payload = _get_cached_rhyme_pages(rhyme_code)
            pages = svg_payload.get("pages") or []
            sources = svg_payload.get("sources") or []
            for index, page_markup in enumerate(pages):
                source_value = sources[index] if index < len(sources) else None
                source_path = Path(source_value) if source_value else None
                documents.append(_SvgDocument(page_markup, source_path))
        except HTTPException:
            documents = []

        if not documents:
            try:
                documents.append(_load_rhyme_svg_markup(rhyme_code))
            except KeyError:
                documents = []

        svg_document_cache[rhyme_code] = documents
        return documents

    for page_index in sorted(pages_map.keys()):
        entries = pages_map[page_index]
        # Sort so that "top" entries are rendered before "bottom"
        entries.sort(
            key=lambda item: (
                1 if (item.get("position") or "top").lower() == "bottom" else 0
            )
        )

        full_page_entry = None
        for item in entries:
            try:
                if float(item.get("pages", 1)) > 0.5:
                    full_page_entry = item
                    break
            except (TypeError, ValueError):
                continue

        if full_page_entry:
            rhyme_code = full_page_entry.get("rhyme_code")
            svg_documents = _get_svg_documents(rhyme_code) if rhyme_code else []

            if svg_documents:
                for svg_document in svg_documents:
                    if not _render_svg_on_canvas(
                        pdf_canvas,
                        svg_backend,
                        svg_document,
                        page_width,
                        page_height,
                        rhyme_code=rhyme_code,
                    ):
                        _draw_text_only_rhyme(
                            pdf_canvas, full_page_entry, page_width, page_height
                        )
                    pdf_canvas.showPage()
                continue

            _draw_text_only_rhyme(pdf_canvas, full_page_entry, page_width, page_height)
            pdf_canvas.showPage()
            continue
        else:
            slot_height = page_height / 2
            positioned_entries: Dict[str, Optional[Dict[str, Any]]] = {
                "top": None,
                "bottom": None,
            }

            for entry in entries:
                position = (entry.get("position") or "top").lower()
                if position not in positioned_entries:
                    position = "top"
                if positioned_entries[position] is None:
                    positioned_entries[position] = entry

            for position, entry in positioned_entries.items():
                if not entry:
                    continue

                y_position = page_height - slot_height if position == "top" else 0

                svg_rendered = False

                rhyme_code = entry.get("rhyme_code")
                svg_documents = _get_svg_documents(rhyme_code) if rhyme_code else []
                svg_document = svg_documents[0] if svg_documents else None

                if svg_document:
                    svg_rendered = _render_svg_on_canvas(
                        pdf_canvas,
                        svg_backend,
                        svg_document,
                        page_width,
                        slot_height,
                        x=0,
                        y=y_position,
                        rhyme_code=entry["rhyme_code"],
                    )

                if not svg_rendered:
                    _draw_text_only_rhyme(
                        pdf_canvas,
                        entry,
                        page_width,
                        slot_height,
                        y_offset=y_position,
                    )

        pdf_canvas.showPage()

    pdf_canvas.save()
    buffer.seek(0)

    filename = f"{grade}_rhyme_binder.pdf"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}

    svg_document_cache.clear()

    return Response(
        content=buffer.getvalue(), media_type="application/pdf", headers=headers
    )


# Include the router in the main app
app.include_router(api_router)



# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)
