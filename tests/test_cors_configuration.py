import ast
import json
import re
from pathlib import Path
from typing import Iterable, List, Optional, Set, Tuple

import pytest

MODULE_PATHS = {
    "backend.s1": Path("backend/s1.py"),
    "backend.server": Path("backend/server.py"),
}


def _load_functions(path: Path, names: Iterable[str]):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    segments = {}
    requested = list(names)

    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in requested:
            segments[node.name] = ast.get_source_segment(source, node)

    namespace = {}
    globals_dict = {
        "__builtins__": __builtins__,
        "Optional": Optional,
        "List": List,
        "Iterable": Iterable,
        "Set": Set,
        "Tuple": Tuple,
        "json": json,
        "re": re,
    }

    for name in requested:
        if name not in segments:
            raise KeyError(f"Function {name} not found in {path}")

        exec(segments[name], globals_dict, namespace)
        globals_dict = {**globals_dict, **namespace}

    return {name: namespace[name] for name in requested}


def _load_parse_csv(path: Path):
    return _load_functions(
        path, ["_normalize_cors_origin", "_parse_csv"]
    )["_parse_csv"]


@pytest.mark.parametrize("module_name", MODULE_PATHS.keys())
def test_parse_csv_strips_trailing_slash(module_name):
    parse_csv = _load_parse_csv(MODULE_PATHS[module_name])

    assert parse_csv(" http://localhost:3000/ ", default=None) == ["http://localhost:3000"]


@pytest.mark.parametrize("module_name", MODULE_PATHS.keys())
def test_parse_csv_deduplicates_and_trims(module_name):
    parse_csv = _load_parse_csv(MODULE_PATHS[module_name])

    result = parse_csv("http://api.test, http://api.test/ , https://app.test/", default=None)

    assert result == ["http://api.test", "https://app.test"]


@pytest.mark.parametrize("module_name", MODULE_PATHS.keys())
def test_parse_csv_falls_back_to_default_when_empty(module_name):
    parse_csv = _load_parse_csv(MODULE_PATHS[module_name])

    assert parse_csv(" ,  , ", default=["https://fallback.test/"]) == [
        "https://fallback.test"
    ]


@pytest.mark.parametrize("module_name", MODULE_PATHS.keys())
def test_parse_csv_preserves_wildcard_origin(module_name):
    parse_csv = _load_parse_csv(MODULE_PATHS[module_name])

    assert parse_csv(None, default=["*"]) == ["*"]
    assert parse_csv("*", default=None) == ["*"]


@pytest.mark.parametrize("module_name", MODULE_PATHS.keys())
def test_parse_csv_supports_json_and_newline_separated_values(module_name):
    parse_csv = _load_parse_csv(MODULE_PATHS[module_name])

    assert parse_csv("http://one.test\nhttps://two.test/", default=None) == [
        "http://one.test",
        "https://two.test",
    ]

    assert parse_csv('["https://json.test", "https://json.test/"]', default=None) == [
        "https://json.test"
    ]


def _load_prepare_cors_settings(path: Path):
    return _load_functions(path, ["_prepare_cors_settings"])["_prepare_cors_settings"]


def test_prepare_cors_settings_handles_wildcard_only():
    prepare = _load_prepare_cors_settings(MODULE_PATHS["backend.server"])

    origins, regex = prepare(["*"])

    assert origins == []
    assert regex == ".*"


def test_prepare_cors_settings_mixes_specific_and_wildcard():
    prepare = _load_prepare_cors_settings(MODULE_PATHS["backend.server"])

    origins, regex = prepare(["https://one.test", "*", "http://two.test"])

    assert origins == ["https://one.test", "http://two.test"]
    assert regex == ".*"


def test_prepare_cors_settings_without_wildcard():
    prepare = _load_prepare_cors_settings(MODULE_PATHS["backend.server"])

    origins, regex = prepare(["https://one.test"])

    assert origins == ["https://one.test"]
    assert regex is None
