import sys
import types
from pathlib import PureWindowsPath

if "dotenv" not in sys.modules:
    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = lambda *args, **kwargs: None
    sys.modules["dotenv"] = dotenv_stub

if "fastapi" not in sys.modules:
    fastapi_stub = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code: int, detail):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class APIRouter:
        def __init__(self, *args, **kwargs):
            self.routes = []

        def post(self, *args, **kwargs):
            def decorator(func):
                return func

            return decorator

    fastapi_stub.HTTPException = HTTPException
    fastapi_stub.APIRouter = APIRouter
    sys.modules["fastapi"] = fastapi_stub

if "PIL" not in sys.modules:
    pil_stub = types.ModuleType("PIL")
    Image = type("Image", (), {"open": staticmethod(lambda *args, **kwargs: None)})
    pil_stub.Image = Image
    sys.modules["PIL"] = pil_stub

if "pydantic" not in sys.modules:
    pydantic_stub = types.ModuleType("pydantic")

    class BaseModel:
        def __init__(self, **data):
            for key, value in data.items():
                setattr(self, key, value)

        def dict(self):  # pragma: no cover - helper for compatibility
            return self.__dict__.copy()

    def Field(*, default=None, default_factory=None, **kwargs):
        if default_factory is not None:
            return default_factory()
        return default

    pydantic_stub.BaseModel = BaseModel
    pydantic_stub.Field = Field
    sys.modules["pydantic"] = pydantic_stub

from backend.app import config


def test_build_cover_selection_paths_matches_packaged_structure():
    parent_unc = PureWindowsPath(r"\\pixartnas\\home\\Project ABC")
    parent_fs = config.PACKAGED_COVER_SVG_BASE_PATH

    unc_path, fs_path = config.build_cover_selection_paths(parent_unc, parent_fs, 1, 1)

    expected_unc = parent_unc / "1 Theme" / "Theme 1" / "Colour1"
    expected_fs = parent_fs / "1 Theme" / "Theme 1" / "Colour1"

    assert unc_path == expected_unc
    assert fs_path == expected_fs


