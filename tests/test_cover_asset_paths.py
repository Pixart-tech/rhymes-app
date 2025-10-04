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

    fastapi_stub.HTTPException = HTTPException
    sys.modules["fastapi"] = fastapi_stub

if "PIL" not in sys.modules:
    pil_stub = types.ModuleType("PIL")
    Image = type("Image", (), {"open": staticmethod(lambda *args, **kwargs: None)})
    pil_stub.Image = Image
    sys.modules["PIL"] = pil_stub

from backend.app import config


def test_build_cover_selection_paths_matches_packaged_structure():
    parent_unc = PureWindowsPath(r"\\pixartnas\\home\\Project ABC")
    parent_fs = config.PACKAGED_COVER_SVG_BASE_PATH

    unc_path, fs_path = config.build_cover_selection_paths(parent_unc, parent_fs, 1, 1)

    expected_unc = parent_unc / "(1 Theme" / "Theme 1" / "SVGs" / "Colour 1)"
    expected_fs = parent_fs / "(1 Theme" / "Theme 1" / "SVGs" / "Colour 1)"

    assert unc_path == expected_unc
    assert fs_path == expected_fs


