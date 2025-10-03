"""Configuration helpers shared across the Rhymes backend modules."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Iterable, List, Optional, Set
from xml.etree import ElementTree as ET

from dotenv import load_dotenv
from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parent.parent


# Ensure environment variables defined in ``backend/.env`` are available before
# importing submodules that rely on them.
load_dotenv(ROOT_DIR / ".env")


logger = logging.getLogger(__name__)

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"

GRADIENT_URL_RE = re.compile(r"^url\(#(?P<id>[^)]+)\)$")
CSS_GRADIENT_DECLARATION_RE = re.compile(
    r"(?P<prop>\b(?:fill|stroke)\s*:\s*)url\(#(?P<id>[^)]+)\)", re.IGNORECASE
)


ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)


IMAGE_CACHE_DIR = ROOT_DIR / "images"

# Default asset directories used when no explicit environment overrides are
# supplied.  The network locations are preserved so deployments that have the
# directories mounted continue to function without additional configuration.
RHYME_SVG_BASE_PATH = Path(r"\\pixartnas\home\RHYMES & STORIES\NEW\Rhymes\SVGs")
DEFAULT_COVER_SVG_BASE_PATH = Path(
    r"\\pixartnas\home\Project ABC\Project ABC Cover\background\Sample"
)
NETWORK_COVER_SVG_BASE_PATH = Path(
    r"pixartnas\home\Project ABC\Project ABC Cover\background\Sample\1 Theme\Theme 1 Test\SVGs"
)
PACKAGED_COVER_SVG_BASE_PATH = ROOT_DIR / "sample_cover_assets"


def resolve_cover_svg_base_path(explicit_path: Optional[str] = None) -> Optional[Path]:
    """Return the directory that stores cover SVG assets, if available."""

    candidate_paths: List[Optional[Path]] = []

    base_path = explicit_path or os.environ.get("COVER_SVG_BASE_PATH")
    if base_path:
        try:
            candidate_paths.append(Path(base_path).expanduser())
        except (OSError, RuntimeError) as exc:
            logger.warning("Invalid COVER_SVG_BASE_PATH '%s': %s", base_path, exc)

    candidate_paths.extend(
        [
            NETWORK_COVER_SVG_BASE_PATH,
            DEFAULT_COVER_SVG_BASE_PATH,
            PACKAGED_COVER_SVG_BASE_PATH,
        ]
    )

    for candidate in candidate_paths:
        if not candidate:
            continue

        try:
            if candidate.exists() and candidate.is_dir():
                return candidate
        except OSError as exc:
            logger.warning("Unable to access cover SVG directory %s: %s", candidate, exc)

    return None


def ensure_cover_assets_base_path(base_path: Optional[Path]) -> Path:
    """Return ``base_path`` or raise an HTTP error when it is unusable."""

    if base_path is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "COVER_SVG_BASE_PATH is not configured on the server. "
                "Please set it to the directory containing the cover SVG files."
            ),
        )

    if not base_path.exists() or not base_path.is_dir():
        raise HTTPException(
            status_code=503,
            detail=(
                "The configured COVER_SVG_BASE_PATH does not exist or is not a directory."
            ),
        )

    return base_path


def _normalize_cors_origin(origin: str) -> Optional[str]:
    """Return a sanitized representation of a configured CORS origin."""

    trimmed = origin.strip()
    if not trimmed:
        return None

    if trimmed == "*":
        return trimmed

    return trimmed.rstrip("/")


def _collect_csv_entries(entries: Iterable[str]) -> List[str]:
    normalized: List[str] = []
    seen: Set[str] = set()

    for raw_entry in entries:
        normalized_entry = _normalize_cors_origin(raw_entry)
        if not normalized_entry or normalized_entry in seen:
            continue

        normalized.append(normalized_entry)
        seen.add(normalized_entry)

    return normalized


def _parse_csv(value: Optional[str], *, default: Optional[List[str]] = None) -> List[str]:
    """Return a normalized list from a comma separated string."""

    if value is not None:
        parsed = _collect_csv_entries(value.split(","))
        if parsed:
            return parsed

    return _collect_csv_entries(default or [])


__all__ = [
    "CSS_GRADIENT_DECLARATION_RE",
    "GRADIENT_URL_RE",
    "IMAGE_CACHE_DIR",
    "NETWORK_COVER_SVG_BASE_PATH",
    "PACKAGED_COVER_SVG_BASE_PATH",
    "RHYME_SVG_BASE_PATH",
    "SVG_NS",
    "XLINK_NS",
    "ensure_cover_assets_base_path",
    "resolve_cover_svg_base_path",
    "_normalize_cors_origin",
    "_parse_csv",
]

