"""SVG asset handling helpers."""

from __future__ import annotations

import base64
import logging
import mimetypes
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from shutil import copy2
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote, unquote, urlparse
from xml.etree import ElementTree as ET

from PIL import Image

from . import config
from .rhymes import RHYMES_DATA, generate_rhyme_svg

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SvgDocument:
    """Container describing SVG markup and, optionally, its source path."""

    markup: str
    source_path: Optional[Path]


def resolve_rhyme_svg_path(base_path: Optional[Path], rhyme_code: str):
    """Return the network SVG path(s) for ``rhyme_code`` if they exist.

    If a directory named after ``rhyme_code`` contains multiple SVG files,
    all SVG paths within that directory are returned as a sorted list so the
    caller can render each page independently. If no match exists, ``None`` is
    returned.
    """

    if base_path is None:
        return None

    # prefer a file named {rhyme_code}.svg but also accept a directory named {rhyme_code}
    candidate = base_path / f"{rhyme_code}.svg"
    dir_candidate = base_path / f"{rhyme_code}"

   

    try:
        if candidate.is_file():
            return candidate

        if dir_candidate.is_dir():
            svg_files = [
                svg
                for svg in sorted(dir_candidate.iterdir())
                if svg.is_file() and svg.suffix.lower() == ".svg"
            ]
        if svg_files:
            return svg_files

        if (dir_candidate).exists():
            logger.warning(
                "Authored SVG for rhyme %s exists at %s but is not a file.",
                rhyme_code,
                candidate,
            )
        else:
            logger.warning(
                "SVG file not found for rhyme %s in %s (expected %s)",
                rhyme_code,
                base_path,
                candidate,
            )
    except OSError as exc:  # pragma: no cover - filesystem errors are unexpected
        logger.error(
            "Unable to access SVG for rhyme %s at %s: %s",
            rhyme_code,
            candidate,
            exc,
        )

    return None


def build_cover_asset_manifest(
    base_path: Path, *, include_markup: bool = False
) -> List[Dict[str, Any]]:
    """Build a manifest describing all SVG cover assets under ``base_path``."""

    assets: List[Dict[str, Any]] = []

    for svg_path in sorted(base_path.rglob("*.svg")):
        if not svg_path.is_file():
            continue

        try:
            relative_path = svg_path.relative_to(base_path)
        except ValueError:
            # Skip files that fall outside the configured base directory.
            continue

        relative_posix = relative_path.as_posix()
        manifest_entry: Dict[str, Any] = {
            "fileName": svg_path.name,
            "path": relative_posix,
            "url": f"/api/cover-assets/svg/{quote(relative_posix, safe='/')}",
        }

        if include_markup:
            try:
                svg_text = svg_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                svg_text = svg_path.read_bytes().decode("utf-8", errors="replace")
            except OSError as exc:  # pragma: no cover - filesystem errors are unexpected
                logger.error("Unable to read cover SVG '%s': %s", svg_path, exc)
                svg_text = ""

            manifest_entry["svg"] = svg_text

        assets.append(manifest_entry)

    return assets


def _parse_style_declarations(style: str) -> List[Tuple[str, str]]:
    """Return the CSS declarations contained in ``style`` preserving order."""

    declarations: List[Tuple[str, str]] = []
    for raw_entry in style.split(";"):
        if not raw_entry.strip():
            continue

        if ":" not in raw_entry:
            continue

        property_name, value = raw_entry.split(":", 1)
        declarations.append((property_name.strip(), value.strip()))

    return declarations


def _serialize_style_declarations(declarations: List[Tuple[str, str]]) -> str:
    """Serialize ``declarations`` back into an inline CSS string."""

    return ";".join(f"{name}:{value}" for name, value in declarations)


def _collect_gradient_fallback_colors(root: ET.Element) -> Dict[str, str]:
    """Return a mapping of gradient ids to representative stop colours."""

    gradient_colors: Dict[str, str] = {}
    stop_xpath = f".//{{{config.SVG_NS}}}stop"

    for gradient_tag in (
        f".//{{{config.SVG_NS}}}linearGradient",
        f".//{{{config.SVG_NS}}}radialGradient",
    ):
        for gradient in root.findall(gradient_tag):
            gradient_id = gradient.attrib.get("id")
            if not gradient_id or gradient_id in gradient_colors:
                continue

            representative_color: Optional[str] = None

            for stop in gradient.findall(stop_xpath):
                style = stop.attrib.get("style")
                color: Optional[str] = None

                if style:
                    for name, value in _parse_style_declarations(style):
                        if name == "stop-color" and value:
                            color = value
                            break

                if color is None:
                    color = stop.attrib.get("stop-color")

                if color:
                    representative_color = color
                    break

            if representative_color:
                gradient_colors[gradient_id] = representative_color

    return gradient_colors


def _replace_gradient_references(
    element: ET.Element, gradient_colors: Dict[str, str]
) -> bool:
    """Replace gradient ``url(#id)`` colour references on ``element`` when possible."""

    updated = False

    for attribute in ("fill", "stroke"):
        raw_value = element.attrib.get(attribute)
        if not raw_value:
            continue

        match = config.GRADIENT_URL_RE.match(raw_value.strip())
        if not match:
            continue

        gradient_id = match.group("id")
        fallback = gradient_colors.get(gradient_id)
        if not fallback:
            continue

        element.set(attribute, fallback)
        updated = True

    style_value = element.attrib.get("style")
    if style_value:
        declarations = _parse_style_declarations(style_value)
        new_declarations: List[Tuple[str, str]] = []
        style_updated = False

        for name, value in declarations:
            match = config.GRADIENT_URL_RE.match(value)
            if match and name in {"fill", "stroke"}:
                fallback = gradient_colors.get(match.group("id"))
                if fallback:
                    value = fallback
                    style_updated = True
            new_declarations.append((name, value))

        if style_updated:
            element.set("style", _serialize_style_declarations(new_declarations))
            updated = True

    return updated


def _replace_gradient_references_in_css(
    css_text: str, gradient_colors: Dict[str, str]
) -> Tuple[str, bool]:
    """Replace ``fill``/``stroke`` gradient references inside inline CSS blocks."""

    updated = False

    def _replace(match):
        gradient_id = match.group("id")
        fallback = gradient_colors.get(gradient_id)
        if not fallback:
            return match.group(0)

        nonlocal updated
        updated = True
        return f"{match.group('prop')}{fallback}"

    return config.CSS_GRADIENT_DECLARATION_RE.sub(_replace, css_text), updated


def sanitize_svg_for_svglib(svg_markup: str) -> str:
    """Replace unsupported gradient colour references with solid colours."""

    try:
        root = ET.fromstring(svg_markup)
    except ET.ParseError:
        return svg_markup

    gradient_colors = _collect_gradient_fallback_colors(root)
    if not gradient_colors:
        return svg_markup

    updated = False
    for element in root.iter():
        if _replace_gradient_references(element, gradient_colors):
            updated = True
            continue

        if element.tag == f"{{{config.SVG_NS}}}style" and element.text:
            replaced_text, css_updated = _replace_gradient_references_in_css(
                element.text, gradient_colors
            )
            if css_updated:
                element.text = replaced_text
                updated = True

    if not updated:
        return svg_markup

    return ET.tostring(root, encoding="unicode")


def svg_requires_raster_backend(svg_document: SvgDocument) -> bool:
    """Return ``True`` when the SVG should be rasterised for PDF output."""

    try:
        root = ET.fromstring(svg_document.markup)
    except ET.ParseError:
        return False

    image_xpath = f".//{{{config.SVG_NS}}}image"

    for image in root.findall(image_xpath):
        href_value = (
            image.get(f"{{{config.XLINK_NS}}}href")
            or image.get("href")
            or ""
        ).strip()
        if not href_value:
            continue

        href_lower = href_value.lower()
        if href_lower.startswith("data:"):
            continue

        parsed = urlparse(href_value)
        candidate = (parsed.path or href_value).lower()
        if candidate.endswith((".png", ".apng")):
            return True

        type_attr = (image.get("type") or "").lower()
        if type_attr in {"image/png", "image/apng"}:
            return True

    return False


def ensure_image_cache_dir(cache_dir: Path) -> Path:
    """Return the local image cache directory, creating it if needed."""

    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # pragma: no cover - filesystem permissions errors
        logger.error("Unable to create image cache directory %s: %s", cache_dir, exc)
        raise

    return cache_dir


def _prepare_inline_image_asset(
    asset_path: Path,
    rhyme_code: str,
    *,
    preprocess_for_pdf: bool = False,
) -> Optional[Tuple[bytes, str]]:
    """Return image bytes and mime type for embedding in SVG."""

    if preprocess_for_pdf:
        suffix = asset_path.suffix.lower()
        try:
            if suffix in {".png", ".apng"}:
                with Image.open(asset_path) as image:
                    prepared = image.convert("RGBA")
                    buffer = BytesIO()
                    prepared.save(buffer, format="PNG")
                    return buffer.getvalue(), "image/png"
            if suffix in {".jpg", ".jpeg"}:
                with Image.open(asset_path) as image:
                    rgba_image = image.convert("RGBA")
                    background = Image.new("RGBA", rgba_image.size, (255, 255, 255, 255))
                    background.alpha_composite(rgba_image)
                    buffer = BytesIO()
                    background.save(buffer, format="PNG")
                    return buffer.getvalue(), "image/png"
        except (OSError, ValueError) as exc:
            logger.warning(
                "Failed to preprocess bitmap asset '%s' for rhyme %s at %s: %s",
                asset_path.name,
                rhyme_code,
                asset_path,
                exc,
            )

    try:
        raw_bytes = asset_path.read_bytes()
    except OSError as exc:
        logger.warning(
            "Unable to read bitmap asset '%s' for rhyme %s at %s: %s",
            asset_path.name,
            rhyme_code,
            asset_path,
            exc,
        )
        return None

    mime_type, _ = mimetypes.guess_type(asset_path.name)
    if preprocess_for_pdf and mime_type is None:
        mime_type = "image/png"
    if not mime_type:
        mime_type = "application/octet-stream"

    return raw_bytes, mime_type


def localize_svg_image_assets(
    svg_text: str,
    source_path: Path,
    rhyme_code: str,
    *,
    inline_mode: bool = False,
    preprocess_for_pdf: bool = False,
    cache_dir: Optional[Path] = None,
) -> str:
    """Return ``svg_text`` with external image references localised."""

    if cache_dir is None:
        cache_dir = config.IMAGE_CACHE_DIR

    try:
        root = ET.fromstring(svg_text)
    except ET.ParseError:
        return svg_text

    modified = False
    image_xpath = f".//{{{config.SVG_NS}}}image"

    for image in root.findall(image_xpath):
        href_value = (
            image.get(f"{{{config.XLINK_NS}}}href")
            or image.get("href")
            or ""
        ).strip()
        if not href_value:
            continue

        parsed = urlparse(href_value)
        if parsed.scheme in {"http", "https", "data"}:
            continue

        asset_path = (source_path.parent / Path(unquote(parsed.path))).resolve()
        try:
            asset_path.relative_to(source_path.parent)
        except ValueError:
            continue

        prepared_asset: Optional[Tuple[bytes, str]]
        prepared_asset = _prepare_inline_image_asset(
            asset_path,
            rhyme_code,
            preprocess_for_pdf=preprocess_for_pdf,
        )

        if prepared_asset is None:
            continue

        asset_bytes, mime_type = prepared_asset

        if inline_mode:
            data_uri = base64.b64encode(asset_bytes).decode("ascii")
            image.set("href", f"data:{mime_type};base64,{data_uri}")
            image.set(f"{{{config.XLINK_NS}}}href", f"data:{mime_type};base64,{data_uri}")
            modified = True
            continue

        cache_directory = ensure_image_cache_dir(cache_dir)
        cache_file = cache_directory / asset_path.name
        try:
            copy2(asset_path, cache_file)
        except OSError as exc:
            logger.warning(
                "Unable to copy asset '%s' for rhyme %s to cache %s: %s",
                asset_path.name,
                rhyme_code,
                cache_file,
                exc,
            )
            continue

        new_href = cache_file.name
        image.set("href", new_href)
        image.set(f"{{{config.XLINK_NS}}}href", new_href)
        modified = True

    if not modified:
        return svg_text

    return ET.tostring(root, encoding="unicode")


def _read_packaged_rhyme(rhyme_code: str) -> Optional[SvgDocument]:
    packaged_path = config.PACKAGED_COVER_SVG_BASE_PATH / f"{rhyme_code}.svg"
    if not packaged_path.exists():
        return None

    try:
        return SvgDocument(packaged_path.read_text(encoding="utf-8"), packaged_path)
    except OSError as exc:  # pragma: no cover - filesystem errors are unexpected
        logger.error("Unable to read packaged SVG %s: %s", packaged_path, exc)
        return None


def load_rhyme_svg_markup(
    rhyme_code: str,
    base_path: Optional[Path],
    *,
    fallback_factory: Optional[Callable[[str], str]] = None,
) -> SvgDocument:
    """Return SVG markup and optional source path for ``rhyme_code``."""

    svg_path = resolve_rhyme_svg_path(base_path, rhyme_code)

    if svg_path is not None:
        try:
            svg_text = svg_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            logger.warning("SVG file not found for rhyme %s at %s", rhyme_code, svg_path)
        except OSError as exc:  # pragma: no cover - filesystem errors are unexpected
            logger.error(
                "Unable to read SVG for rhyme %s at %s: %s", rhyme_code, svg_path, exc
            )
        else:
            return SvgDocument(svg_text, svg_path)

    packaged = _read_packaged_rhyme(rhyme_code)
    if packaged is not None:
        return packaged

    generator = fallback_factory or generate_rhyme_svg
    return SvgDocument(generator(rhyme_code), None)


__all__ = [
    "RHYMES_DATA",
    "SvgDocument",
    "build_cover_asset_manifest",
    "ensure_image_cache_dir",
    "generate_rhyme_svg",
    "localize_svg_image_assets",
    "load_rhyme_svg_markup",
    "resolve_rhyme_svg_path",
    "sanitize_svg_for_svglib",
    "svg_requires_raster_backend",
]

