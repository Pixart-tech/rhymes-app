"""Rhymes catalogue utilities."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Union

from .config import ROOT_DIR

logger = logging.getLogger(__name__)


RhymeField = Union[str, float, int]


def _load_rhymes(path: Path) -> Dict[str, List[RhymeField]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:  # pragma: no cover - configuration error
        logger.error("Rhymes catalogue %s could not be found.", path)
        raise


RHYMES_DATA: Dict[str, List[RhymeField]] = _load_rhymes(ROOT_DIR / "rhymes.json")


def generate_rhyme_svg(
    rhyme_code: str,
    rhymes_data: Optional[Dict[str, List[RhymeField]]] = None,
) -> str:
    """Create SVG markup for a rhyme card."""

    catalogue = rhymes_data or RHYMES_DATA
  
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


__all__ = ["RHYMES_DATA", "generate_rhyme_svg"]
