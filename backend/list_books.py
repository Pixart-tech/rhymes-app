from datetime import datetime
import os
from typing import Any, Callable, Dict, Iterable, Iterator, List, Tuple

from app.firebase_service import db


PREWRITTEN_EXACT_SUBJECTS = {
    "Maths Pre-written",
    "English Pre-written",
    "EVS Pre-written",
}


def _coerce_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _normalize_subject(value: Any) -> str:
    raw = _coerce_str(value).casefold()
    if not raw:
        return ""
    # Only normalize common Maths variants; other subjects are matched by startswith().
    if raw in {"math", "maths", "mathematics"} or raw.startswith("math"):
        return "maths"
    return raw


def _is_prewritten_subject(value: Any) -> bool:
    return _coerce_str(value) in PREWRITTEN_EXACT_SUBJECTS


def _normalize_component(value: Any) -> str:
    raw = _coerce_str(value).casefold()
    if not raw:
        return ""
    compact = raw.replace("-", " ").replace("_", " ")
    compact = " ".join(compact.split())
    if compact in {"addon", "add on"}:
        return "addon"
    return raw


def _extract_school_row(doc: Dict[str, Any], doc_id: str) -> Tuple[str, str, str, str]:
    school_id = _coerce_str(doc.get("school_id") or doc.get("id") or doc_id)
    school_name = _coerce_str(doc.get("school_name"))
    email = _coerce_str(doc.get("email"))
    sales_rep = _coerce_str(doc.get("sales_representative"))
    return school_id, school_name, email, sales_rep


def _iter_school_items(school_ref: Any) -> Iterator[Dict[str, Any]]:
    try:
        grade_snaps = school_ref.collection("grades").get()
    except Exception:
        return

    for grade_snap in grade_snaps:
        doc = grade_snap.to_dict() or {}
        items = doc.get("items")
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    yield item


def _iter_book_selection_school_snapshots() -> Tuple[str, List[Any]]:
    """
    Fetch school snapshots from the expected collection.
    """
    try:
        snaps = list(db.collection("book_selections").get())
    except Exception:
        return "book_selections", []
    return "book_selections", snaps


def _has_maths_addon(items: Iterable[Dict[str, Any]], *, ignore_prewritten: bool) -> bool:
    for item in items:
        subject_raw = _coerce_str(item.get("subject"))
        if ignore_prewritten and _is_prewritten_subject(subject_raw):
            continue
        component_raw = _coerce_str(item.get("component"))
        # Exact match as requested.
        if subject_raw == "Maths" and component_raw == "addon":
            return True
    return False


def _has_prewritten_subject(items: Iterable[Dict[str, Any]]) -> bool:
    for item in items:
        if _is_prewritten_subject(item.get("subject")):
            return True
    return False


def _fetch_school_rows(school_ids: List[str]) -> List[Tuple[str, str, str, str]]:
    rows: List[Tuple[str, str, str, str]] = []
    for school_id in school_ids:
        snap = (
            db.collection("schools")
            .document(school_id)
            .get(field_paths=["school_id", "id", "school_name", "email", "sales_representative"])
        )
        if not snap.exists:
            rows.append((school_id, "", "", ""))
            continue
        doc = snap.to_dict() or {}
        rows.append(_extract_school_row(doc, school_id))

    rows.sort(key=lambda r: (r[1].casefold(), r[0]))
    return rows


def _find_school_ids_matching(predicate: Callable[[Iterator[Dict[str, Any]]], bool]) -> List[str]:
    matched: List[str] = []
    _collection_name, school_snaps = _iter_book_selection_school_snapshots()
    for school_snapshot in school_snaps:
        items = _iter_school_items(school_snapshot.reference)
        if predicate(items):
            matched.append(school_snapshot.id)
    return matched


def school_has_both_prewritten_and_maths_addon(school_id: str) -> bool:
    school_ref = db.collection("book_selections").document(school_id)
    items_list = list(_iter_school_items(school_ref))
    return _has_prewritten_subject(items_list) and _has_maths_addon(items_list, ignore_prewritten=False)


def fetch_schools_with_maths_addon(*, ignore_prewritten: bool = True) -> List[Tuple[str, str, str, str]]:
    """
    Scan `book_selections/<school_id>/grades/<grade_doc>` and include a school if any
    grade doc contains an item with:
      - subject == "Maths"
      - component == "addon"

    When ignore_prewritten is True, entries whose subject contains "pre-written"/"prewritten"
    are ignored (e.g. "Maths Pre-written").
    """
    matched_school_ids = _find_school_ids_matching(
        lambda items: _has_maths_addon(items, ignore_prewritten=ignore_prewritten)
    )
    return _fetch_school_rows(matched_school_ids)


def fetch_schools_with_prewritten_and_maths_addon() -> List[Tuple[str, str, str, str]]:
    """
    Single-pass helper that:
      1) scans `book_selections/<school_id>/grades/<grade_doc>` for each school, and
      2) keeps only schools that have BOTH:
         - any prewritten item (subject contains "pre-written"/"prewritten")
         - a Maths add-on item (subject normalizes to "maths", component == "addon")
      3) returns school rows from `schools/<school_id>` (id, name, email, sales rep)

    This is the "all-in-one" function: it finds matching schools and returns their details.
    """
    def _predicate(items: Iterator[Dict[str, Any]]) -> bool:
        items_list = list(items)
        return _has_prewritten_subject(items_list) and _has_maths_addon(items_list, ignore_prewritten=False)

    matched_school_ids = _find_school_ids_matching(_predicate)
    return _fetch_school_rows(matched_school_ids)


DEFAULT_OUT_PATH = "schools_maths_addon.txt"


def fetch_schools_with_maths_addon_and_prewritten_any_grade_doc() -> List[Tuple[str, str, str, str]]:
    """
    Match a school if, across ANY of its grade docs, it has BOTH:
      - at least one Maths add-on item with exact match:
          subject == "Maths" AND component == "addon"
      - at least one prewritten item with exact subject match:
          "Maths Pre-written" OR "English Pre-written" OR "EVS Pre-written"

    The two conditions may be satisfied in different grade docs for the same school.
    """

    matched_school_ids: List[str] = []
    collection_name, school_snaps = _iter_book_selection_school_snapshots()

    for school_snapshot in school_snaps:
        try:
            grade_snaps = school_snapshot.reference.collection("grades").get()
        except Exception:
            continue

        has_prewritten = False
        has_maths_addon = False
        for grade_snap in grade_snaps:
            doc = grade_snap.to_dict() or {}
            items = doc.get("items")
            if not isinstance(items, list):
                continue
            items = [v for v in items if isinstance(v, dict)]

            for item in items:

                subject_raw = _coerce_str(item.get("subject"))
                component_raw = _coerce_str(item.get("component"))

                if _is_prewritten_subject(subject_raw):
                    has_prewritten = True

                if subject_raw == "Maths" and component_raw == "addon":
                    has_maths_addon = True

                if has_prewritten and has_maths_addon:
                    break

            if has_prewritten and has_maths_addon:
                break

        if has_prewritten and has_maths_addon:
            matched_school_ids.append(school_snapshot.id)

    return _fetch_school_rows(matched_school_ids)


def write_schools_with_maths_addon_and_prewritten_report(
    *,
    out_path: str = DEFAULT_OUT_PATH,
) -> int:
    rows = fetch_schools_with_maths_addon_and_prewritten_any_grade_doc()

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    lines: List[str] = []
    lines.append("Schools with Maths add-on + Prewritten (any grade doc)")
    lines.append(f"Generated: {now}")
    lines.append(f"Count: {len(rows)}")
    lines.append("")
    lines.append("school_name")
    for _school_id, school_name, _email, _sales_rep in rows:
        if school_name:
            lines.append(school_name)
    lines.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Wrote {len(rows)} schools to {out_path}")
    return 0


def main() -> int:
    """
    This script is intended to run without any command-line arguments.

    You can optionally configure behavior via environment variables:
      - LIST_BOOKS_OUT: output file path (default: schools_maths_addon.txt)
    """
    out_path = os.getenv("LIST_BOOKS_OUT") or DEFAULT_OUT_PATH
    return write_schools_with_maths_addon_and_prewritten_report(out_path=out_path)


if __name__ == "__main__":
    raise SystemExit(main())
