import asyncio
import os
import sys
import types
from io import BytesIO
from types import SimpleNamespace
from xml.etree import ElementTree as ET

import pytest


# ---------------------------------------------------------------------------
# Minimal stubs for optional dependencies so ``backend.server`` can be imported
# without installing the real FastAPI stack inside the execution environment.
# ---------------------------------------------------------------------------

os.environ.setdefault("MONGO_URL", "mongodb://localhost")
os.environ.setdefault("DB_NAME", "testdb")


class _HTTPException(Exception):
    def __init__(self, status_code: int, detail=None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class _Response:
    def __init__(self, content=b"", media_type: str | None = None, headers: dict | None = None):
        if isinstance(content, str):
            content = content.encode("utf-8")
        self.body = content
        self.media_type = media_type
        self.headers = headers or {}
        self.status_code = 200


class _APIRouter:
    def __init__(self, prefix: str = ""):
        self.prefix = prefix

    def _decorator(self, func):
        return func

    def get(self, *_, **__):
        return self._decorator

    def post(self, *_, **__):
        return self._decorator

    def delete(self, *_, **__):
        return self._decorator


class _FastAPI:
    def add_middleware(self, *_, **__):  # pragma: no cover - invoked during import
        return None

    def include_router(self, *_):  # pragma: no cover - invoked during import
        return None

    def on_event(self, *_args, **__):  # pragma: no cover - decorator shim
        def decorator(func):
            return func

        return decorator


fastapi_module = types.ModuleType("fastapi")
fastapi_module.FastAPI = _FastAPI
fastapi_module.APIRouter = _APIRouter
fastapi_module.HTTPException = _HTTPException

responses_module = types.ModuleType("fastapi.responses")
responses_module.Response = _Response

fastapi_module.responses = responses_module

sys.modules.setdefault("fastapi", fastapi_module)
sys.modules.setdefault("fastapi.responses", responses_module)


dotenv_module = types.ModuleType("dotenv")


def _load_dotenv(*_, **__):  # pragma: no cover - behaviour not exercised
    return None


dotenv_module.load_dotenv = _load_dotenv
sys.modules.setdefault("dotenv", dotenv_module)


cors_module = types.ModuleType("starlette.middleware.cors")


class _CORSMiddleware:  # pragma: no cover - used for dependency injection only
    def __init__(self, *_, **__):
        pass


cors_module.CORSMiddleware = _CORSMiddleware
sys.modules.setdefault("starlette.middleware.cors", cors_module)


motor_module = types.ModuleType("motor")
motor_asyncio_module = types.ModuleType("motor.motor_asyncio")


class _AsyncIOMotorClient:
    def __init__(self, *_, **__):
        self._databases: dict[str, SimpleNamespace] = {}

    def __getitem__(self, name: str) -> SimpleNamespace:
        return self._databases.setdefault(name, SimpleNamespace())


motor_asyncio_module.AsyncIOMotorClient = _AsyncIOMotorClient
motor_module.motor_asyncio = motor_asyncio_module
sys.modules.setdefault("motor", motor_module)
sys.modules.setdefault("motor.motor_asyncio", motor_asyncio_module)


pydantic_module = types.ModuleType("pydantic")


class _BaseModel:
    def __init__(self, **data):
        for key, value in data.items():
            setattr(self, key, value)

    def dict(self):  # pragma: no cover - helper for API code paths
        return dict(self.__dict__)


def _Field(default=None, default_factory=None, **_):
    if default_factory is not None:
        return default_factory()
    return default


pydantic_module.BaseModel = _BaseModel
pydantic_module.Field = _Field
sys.modules.setdefault("pydantic", pydantic_module)


from backend import server


class DummyCanvas:
    """Minimal canvas stub used by binder tests."""

    def __init__(self, buffer: BytesIO, pagesize):
        self.buffer = buffer
        self.pagesize = pagesize
        self.pages = 0

    def showPage(self) -> None:  # pragma: no cover - trivial
        self.pages += 1

    def save(self) -> None:  # pragma: no cover - trivial
        pass


class DummyCursor:
    def __init__(self, data):
        self._data = data

    async def to_list(self, _):
        return list(self._data)


class DummyCollection:
    def __init__(self, data):
        self._data = data

    def find(self, query):  # pragma: no cover - data is static
        return DummyCursor(self._data)


@pytest.fixture
def stub_pdf_resources(monkeypatch):
    resources = SimpleNamespace(
        canvas_factory=lambda buffer, pagesize: DummyCanvas(buffer, pagesize),
        page_size=(400.0, 300.0),
        svg_backend=server._SvgBackend("none", None, None, None, None),
    )
    monkeypatch.setattr(server, "_load_pdf_dependencies", lambda: resources)
    return resources


@pytest.fixture
def stub_db(monkeypatch):
    collection = DummyCollection([])
    monkeypatch.setattr(
        server,
        "db",
        SimpleNamespace(rhyme_selections=collection),
    )
    return collection


def test_binder_uses_external_svg(tmp_path, monkeypatch, stub_pdf_resources, stub_db):
    rhyme_code = "RX001"
    svg_content = "<svg>real</svg>"
    (tmp_path / f"{rhyme_code}.svg").write_text(svg_content, encoding="utf-8")

    stub_db._data = [
        {
            "page_index": 0,
            "rhyme_code": rhyme_code,
            "pages": 1.0,
            "position": "top",
        }
    ]

    monkeypatch.setattr(server, "RHYME_SVG_BASE_PATH", tmp_path)
    monkeypatch.setattr(
        server,
        "RHYMES_DATA",
        {rhyme_code: ("Test rhyme", 1.0, False)},
    )

    captured = {}

    def fake_render(pdf_canvas, backend, svg_document, width, height, *, x=0, y=0):
        captured["markup"] = svg_document.markup
        captured["source_path"] = svg_document.source_path
        captured["size"] = (width, height)
        captured["position"] = (x, y)
        return True

    draw_calls = []

    def fake_draw(pdf_canvas, entry, page_width, page_height, y_offset=0):
        draw_calls.append(entry)

    monkeypatch.setattr(server, "_render_svg_on_canvas", fake_render)
    monkeypatch.setattr(server, "_draw_text_only_rhyme", fake_draw)

    response = asyncio.run(server.download_rhyme_binder("school", "grade"))

    assert response.media_type == "application/pdf"
    assert captured["markup"] == svg_content
    assert captured["source_path"] == tmp_path / f"{rhyme_code}.svg"
    assert draw_calls == []


def test_binder_falls_back_to_generated_svg(tmp_path, monkeypatch, stub_pdf_resources, stub_db):
    rhyme_code = "RX002"
    sentinel_svg = "<svg>generated</svg>"

    stub_db._data = [
        {
            "page_index": 0,
            "rhyme_code": rhyme_code,
            "pages": 0.5,
            "position": "top",
        }
    ]

    monkeypatch.setattr(server, "RHYME_SVG_BASE_PATH", tmp_path)
    monkeypatch.setattr(
        server,
        "RHYMES_DATA",
        {rhyme_code: ("Test rhyme", 0.5, False)},
    )

    def fake_generate(code):
        if code != rhyme_code:
            raise KeyError(code)
        return sentinel_svg

    captured = {"markups": []}

    def fake_render(pdf_canvas, backend, svg_document, width, height, *, x=0, y=0):
        captured["markups"].append(svg_document.markup)
        return False

    draw_calls = []

    def fake_draw(pdf_canvas, entry, page_width, page_height, y_offset=0):
        draw_calls.append({"entry": entry, "y_offset": y_offset})

    monkeypatch.setattr(server, "generate_rhyme_svg", fake_generate)
    monkeypatch.setattr(server, "_render_svg_on_canvas", fake_render)
    monkeypatch.setattr(server, "_draw_text_only_rhyme", fake_draw)

    response = asyncio.run(server.download_rhyme_binder("school", "grade"))

    assert response.media_type == "application/pdf"
    assert captured["markups"] == [sentinel_svg]
    assert len(draw_calls) == 1
    assert draw_calls[0]["entry"]["rhyme_code"] == rhyme_code


def test_sanitize_svg_for_svglib_rewrites_gradient_fill():
    gradient_svg = """
    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
        <defs>
            <linearGradient id="grad1">
                <stop offset="0%" style="stop-color:#123456;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#abcdef;stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect id="rect" width="10" height="10" fill="url(#grad1)" />
        <circle id="circle" cx="5" cy="5" r="2" style="stroke:url(#grad1);fill:none" />
    </svg>
    """

    sanitized = server._sanitize_svg_for_svglib(gradient_svg)
    assert "url(#grad1)" not in sanitized

    root = ET.fromstring(sanitized)
    rect = root.find(".//{http://www.w3.org/2000/svg}rect")
    circle = root.find(".//{http://www.w3.org/2000/svg}circle")

    assert rect is not None and rect.attrib.get("fill") == "#123456"
    assert circle is not None
    assert "url(#grad1)" not in circle.attrib.get("style", "")
    assert "#123456" in circle.attrib.get("style", "")


def test_sanitize_svg_for_svglib_returns_original_on_parse_error():
    malformed_svg = "<svg><"
    assert server._sanitize_svg_for_svglib(malformed_svg) == malformed_svg
