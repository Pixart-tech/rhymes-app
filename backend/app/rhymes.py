"""Rhymes catalogue utilities."""

from __future__ import annotations

import json
import logging
import re
import threading
from pathlib import Path
from typing import Any, Dict, Iterator, List, Mapping, Optional, Tuple, Union

from .config import ROOT_DIR

logger = logging.getLogger(__name__)


RhymeField = Union[str, float, int]

RHYME_CODE_PATTERN = re.compile(r"^RE\d{5,}$", re.IGNORECASE)
STORY_CODE_PATTERN=re.compile(r"^ST\d{5,}$",re.IGNORECASE)


def _load_rhymes(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:  # pragma: no cover - configuration error
        logger.error("Rhymes catalogue %s could not be found.", path)
        raise


def _split_catalogue(
    raw: Any,
) -> Tuple[Dict[str, List[RhymeField]], Dict[str, Any]]:
    """Split the raw JSON catalogue into rhymes data + optional settings."""

    if not isinstance(raw, dict):
        return {}, {}
    
    settings = raw.get("__settings__", {})
    settings_payload = settings if isinstance(settings, dict) else {}

    rhymes: Dict[str, List[RhymeField]] = {}
    for key, value in raw.items():
       
        if not isinstance(key, str) or not ((RHYME_CODE_PATTERN.match(key) or(STORY_CODE_PATTERN.match(key)))):
            continue
        if not isinstance(value, (list, tuple)):
            continue
        
        rhymes[key] = list(value)

    return rhymes, settings_payload


_RHYME_CATALOGUE_PATH = ROOT_DIR / "rhymes.json"
_CACHE_LOCK = threading.RLock()
_CACHE_MTIME_NS: Optional[int] = None
_CACHE_RHYMES_DATA: Dict[str, List[RhymeField]] = {}
_CACHE_RHYMES_SETTINGS: Dict[str, Any] = {}


def _refresh_cache(force: bool = False) -> None:
    global _CACHE_MTIME_NS, _CACHE_RHYMES_DATA, _CACHE_RHYMES_SETTINGS

    with _CACHE_LOCK:
        try:
            mtime_ns = _RHYME_CATALOGUE_PATH.stat().st_mtime_ns
        except FileNotFoundError:  # pragma: no cover - configuration error
            logger.error("Rhymes catalogue %s could not be found.", _RHYME_CATALOGUE_PATH)
            raise

        if not force and _CACHE_MTIME_NS is not None and mtime_ns == _CACHE_MTIME_NS:
            return

        raw = _load_rhymes(_RHYME_CATALOGUE_PATH)
        rhymes_data, settings = _split_catalogue(raw)
        _CACHE_RHYMES_DATA = rhymes_data
        _CACHE_RHYMES_SETTINGS = settings
        _CACHE_MTIME_NS = mtime_ns


def get_rhymes_data() -> Dict[str, List[RhymeField]]:
    _refresh_cache()
    return _CACHE_RHYMES_DATA


def get_rhymes_settings() -> Dict[str, Any]:
    _refresh_cache()
    return _CACHE_RHYMES_SETTINGS


class _MappingProxy(Mapping[str, Any]):
    def __init__(self, supplier):
        self._supplier = supplier

    def __getitem__(self, key: str) -> Any:
        return self._supplier()[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._supplier())

    def __len__(self) -> int:
        return len(self._supplier())

    def get(self, key: str, default: Any = None) -> Any:  # type: ignore[override]
        return self._supplier().get(key, default)

    def items(self):  # type: ignore[override]
        return self._supplier().items()

    def keys(self):  # type: ignore[override]
        return self._supplier().keys()

    def values(self):  # type: ignore[override]
        return self._supplier().values()


RHYMES_DATA: Mapping[str, List[RhymeField]] = _MappingProxy(get_rhymes_data)
RHYMES_SETTINGS: Mapping[str, Any] = _MappingProxy(get_rhymes_settings)


def generate_rhyme_svg(
    rhyme_code: str,
    rhymes_data: Optional[Dict[str, List[RhymeField]]] = None,
) -> str:
    """Create SVG markup for a rhyme card."""

    catalogue = rhymes_data or get_rhymes_data()
  
    if rhyme_code not in catalogue:
        raise KeyError("Rhyme not found")

    record = catalogue[rhyme_code]
    rhyme_name = record[0] if len(record) > 0 else rhyme_code
    pages = record[1] if len(record) > 1 else 1

    return f"""
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#grad1)" rx="15"/>
        <text x="200" y="100" font-family="Arial, sans-serif" font-size="16" font-weight="bold"
              text-anchor="middle" fill="white">{rhyme_name}</text>
        <text x="200" y="130" font-family="Arial, sans-serif" font-size="12"
              text-anchor="middle" fill="white">Code: {rhyme_code}</text>
        <text x="200" y="160" font-family="Arial, sans-serif" font-size="12"
              text-anchor="middle" fill="white">Pages: {pages}</text>
        <circle cx="200" cy="220" r="30" fill="rgba(255,255,255,0.3)" stroke="white" stroke-width="2"/>
        <text x="200" y="225" font-family="Arial, sans-serif" font-size="20"
              text-anchor="middle" fill="white">♪</text>
    </svg>
    """


__all__ = ["RHYMES_DATA", "RHYMES_SETTINGS", "generate_rhyme_svg"]
