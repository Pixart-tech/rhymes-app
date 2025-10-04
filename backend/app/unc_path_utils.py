"""Utilities for working with UNC paths for themed SVG assets."""
from __future__ import annotations

from pathlib import Path, PureWindowsPath
from typing import Iterable, List, Tuple


def parse_selection_key(selection_key: str) -> Tuple[int, int]:
    """Return the theme and colour numbers encoded in *selection_key*.

    The key is expected to contain two integers separated by a dot, e.g. ``"1.1"``.
    Whitespace is ignored so ``" 1 . 2 "`` is also valid.
    """

    cleaned_key = selection_key.replace(" ", "")
    try:
        theme_str, colour_str = cleaned_key.split(".", maxsplit=1)
    except ValueError as exc:  # pragma: no cover - defensive programming
        raise ValueError(
            "Selection key must contain a single dot separating theme and colour"
        ) from exc

    try:
        theme_number = int(theme_str)
        colour_number = int(colour_str)
    except ValueError as exc:  # pragma: no cover - defensive programming
        raise ValueError("Theme and colour numbers must be integers") from exc

    if theme_number < 1 or colour_number < 1:  # pragma: no cover - defensive programming
        raise ValueError("Theme and colour numbers must be positive")

    return theme_number, colour_number


def build_theme_folder_path(base_path: str, selection_key: str) -> PureWindowsPath:
    """Create a UNC path for the theme/colour folder represented by ``selection_key``.

    Parameters
    ----------
    base_path:
        UNC base path to the "Sample" folder. Double-backslashes are expected, but the
        function accepts standard strings as well.
    selection_key:
        A string in the format ``"<theme>.<colour>"``.
    """

    theme_number, colour_number = parse_selection_key(selection_key)

    root = PureWindowsPath(base_path)
    # Folder names include the leading and trailing parenthesis characters.
    theme_segment = f"({theme_number} Theme"
    colour_segment = f"Colour {colour_number})"

    return root / theme_segment / f"Theme {theme_number}" / "SVGs" / colour_segment


def inspect_theme_folder(base_path: str, selection_key: str) -> List[PureWindowsPath]:
    """Print debug information and optionally list SVG files for the selection.

    Returns a list of :class:`~pathlib.PureWindowsPath` objects representing ``.svg``
    files when the folder exists. Otherwise an empty list is returned.
    """

    unc_path = build_theme_folder_path(base_path, selection_key)
    path_for_io = Path(str(unc_path))

    print(f"Final UNC path: {unc_path}")
    print(f"Parent folder exists: {path_for_io.parent.exists()}")

    folder_exists = path_for_io.exists()
    print(f"Folder exists: {folder_exists}")

    if not folder_exists:
        return []

    svg_paths: Iterable[Path] = path_for_io.glob("*.svg")
    svg_files = [PureWindowsPath(str(svg_path)) for svg_path in svg_paths]

    if svg_files:
        print("SVG files found:")
        for svg_file in svg_files:
            print(f" - {svg_file}")
    else:
        print("No SVG files found in the folder.")

    return svg_files


__all__ = [
    "build_theme_folder_path",
    "inspect_theme_folder",
    "parse_selection_key",
]
