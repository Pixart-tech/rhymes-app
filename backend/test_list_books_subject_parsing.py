import importlib
import sys
import types


def _import_list_books():
    dummy_firebase = types.SimpleNamespace(db=object())
    sys.modules.setdefault("app", types.ModuleType("app"))
    sys.modules["app.firebase_service"] = dummy_firebase
    return importlib.import_module("backend.list_books")


def test_extract_subject_and_flags_prewritten():
    lb = _import_list_books()
    assert lb._is_prewritten_subject("Maths Pre-written") is True
    assert lb._is_prewritten_subject("English Pre-written") is True
    assert lb._is_prewritten_subject("EVS Pre-written") is True
    assert lb._is_prewritten_subject("English Prewritten") is False


def test_extract_subject_and_flags_addon_in_subject():
    lb = _import_list_books()
    assert lb._is_prewritten_subject("Maths Add on") is False


def test_has_prewritten_subject_only_counts_english_maths_evs():
    lb = _import_list_books()
    assert (
        lb._has_prewritten_subject(
            [
                {"subject": "Science Prewritten"},
                {"subject": "Hindi Pre-written"},
            ]
        )
        is False
    )
    assert (
        lb._has_prewritten_subject(
            [
                {"subject": "English Pre-written"},
            ]
        )
        is True
    )


def test_has_maths_addon_accepts_component_or_subject():
    lb = _import_list_books()
    assert lb._has_maths_addon([{"subject": "Maths", "component": "addon"}], ignore_prewritten=True) is True
    assert lb._has_maths_addon([{"subject": "Maths", "component": "Add on"}], ignore_prewritten=True) is False
    assert lb._has_maths_addon([{"subject": "Maths Add-on", "component": ""}], ignore_prewritten=True) is False
    assert lb._has_maths_addon([{"subject": "Maths", "addOn": "100000409"}], ignore_prewritten=True) is False
