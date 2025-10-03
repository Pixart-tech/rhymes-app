import ast
from pathlib import Path
from typing import Iterable, List, Optional, Set

import pytest

MODULE_PATHS = {
    "backend.s1": Path("backend/s1.py"),
    "backend.server": Path("backend/server.py"),
}


def _load_parse_csv(path: Path):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    segments = {}

    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in {
            "_normalize_cors_origin",
            "_parse_csv",
        }:
            segments[node.name] = ast.get_source_segment(source, node)

    namespace = {}
    globals_dict = {
        "__builtins__": __builtins__,
        "Optional": Optional,
        "List": List,
        "Iterable": Iterable,
        "Set": Set,
    }

    exec(segments["_normalize_cors_origin"], globals_dict, namespace)
    globals_dict = {**globals_dict, **namespace}
    exec(segments["_parse_csv"], globals_dict, namespace)

    return namespace["_parse_csv"]


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
