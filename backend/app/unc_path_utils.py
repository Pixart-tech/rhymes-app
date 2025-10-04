"""Utilities for working with UNC network paths.

This module contains a small, focused helper that demonstrates how to build
UNC paths safely and how to debug situations where `Path.exists()` returns
``False`` unexpectedly on network shares.

The code purposefully favours explicit string handling and emits verbose
diagnostics so that issues with permissions, connectivity, or path casing can
be identified quickly.
"""

from __future__ import annotations

import os
from pathlib import Path, PureWindowsPath
from typing import Iterable, Tuple


def build_cover_selection_paths(
    unc_base_path: str,
    base_path: str,
    theme_number: int,
    colour_number: int,
) -> Tuple[Path, Path]:
    """Return the UNC path and filesystem path for the requested selection.

    Parameters
    ----------
    unc_base_path:
        The root of the selection folder on the network share. The string
        should use doubled backslashes or a raw string literal, for example::

            r"\\\pixartnas\home\Project ABC"

    base_path:
        The local filesystem root that mirrors the UNC share (if applicable).

    theme_number / colour_number:
        The numeric identifiers used to construct the folder name segments.

    Returns
    -------
    tuple(Path, Path)
        ``(selection_unc_path, selection_fs_path)``
    """

    # Guard against accidental interpretation of escape sequences by always
    # working with ``PureWindowsPath`` for UNC handling and feeding only
    # strings to ``Path``.
    unc_root = PureWindowsPath(unc_base_path)
    theme_component = f"Theme {theme_number:02d}"
    colour_component = f"Colour {colour_number:02d}"

    selection_unc_path = Path(str(unc_root.joinpath(theme_component, colour_component)))
    selection_fs_path = Path(base_path).joinpath(theme_component, colour_component)

    return selection_unc_path, selection_fs_path


def debug_path(path: Path) -> None:
    """Print diagnostics for the provided path.

    The output makes it easier to understand why a network folder check might
    fail: it shows the raw string, confirms parent folder availability, and
    compares ``Path.exists`` with ``os.path.exists``.
    """

    raw_path = str(path)
    print("--- Path debug information ---")
    print(f"Path string: {raw_path}")
    print(f"Repr string: {raw_path!r}")

    parent = path.parent
    print(f"Parent: {parent}")
    print(f"Parent exists: {parent.exists()}")

    pathlib_exists = path.exists()
    os_exists = os.path.exists(raw_path)
    print(f"Path.exists(): {pathlib_exists}")
    print(f"os.path.exists(): {os_exists}")

    if pathlib_exists:
        try:
            list_directory(path)
        except OSError as exc:  # pragma: no cover - diagnostic output only
            print(f"Error listing directory contents: {exc}")


def list_directory(path: Path, suffixes: Iterable[str] | None = None) -> None:
    """List the files inside ``path`` filtering by the given suffixes."""

    suffixes = {s.lower() for s in suffixes} if suffixes else None

    print(f"Contents of {path}:")
    for entry in sorted(path.iterdir()):
        if entry.is_file():
            if suffixes and entry.suffix.lower() not in suffixes:
                continue
            print(f"  FILE  {entry.name}")
        elif entry.is_dir():
            print(f"  DIR   {entry.name}")


def check_selection_folder(
    unc_base_path: str,
    base_path: str,
    theme_number: int,
    colour_number: int,
) -> Tuple[bool, bool]:
    """High level helper that prints diagnostics and returns existence flags."""

    selection_unc_path, selection_fs_path = build_cover_selection_paths(
        unc_base_path, base_path, theme_number, colour_number
    )

    print("\nUNC selection path:")
    debug_path(selection_unc_path)

    print("\nLocal mirror path:")
    debug_path(selection_fs_path)

    return selection_unc_path.exists(), selection_fs_path.exists()


if __name__ == "__main__":  # pragma: no cover - module demonstration
    SAMPLE_UNC_BASE = r"\\pixartnas\home\Project ABC\Project ABC Cover\background\Sample"
    SAMPLE_LOCAL_BASE = r"C:\\Project ABC\\Project ABC Cover\\background\\Sample"

    unc_exists, local_exists = check_selection_folder(
        SAMPLE_UNC_BASE,
        SAMPLE_LOCAL_BASE,
        theme_number=1,
        colour_number=1,
    )

    if unc_exists:
        selection_unc_path, _ = build_cover_selection_paths(
            SAMPLE_UNC_BASE, SAMPLE_LOCAL_BASE, 1, 1
        )
        list_directory(selection_unc_path, suffixes={".svg"})

