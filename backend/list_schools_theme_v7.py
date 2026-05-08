import argparse
import argparse
from datetime import datetime
from typing import Any, Dict, List, Tuple

from app.firebase_service import db


def _coerce_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _extract_school_row(doc: Dict[str, Any], doc_id: str) -> Tuple[str, str, str, str]:
    school_id = _coerce_str(doc.get("school_id") or doc.get("id") or doc_id)
    school_name = _coerce_str(doc.get("school_name"))
    email = _coerce_str(doc.get("email"))
    sales_rep = _coerce_str(doc.get("sales_representative"))
    return school_id, school_name, email, sales_rep


def fetch_schools_with_cover_theme(theme_id: str) -> List[Tuple[str, str, str, str]]:
    print(theme_id)
    """
    Scan `cover_selections/<school_id>/grades/<grade_doc>` and include a school if any
    grade doc has `theme_id == theme_id`.

    Output rows are (school_id, school_name, email, sales_representative). School details
    are fetched from `schools/<school_id>` for matched schools only.
    """
    target = _coerce_str(theme_id)
    target_key = target.casefold()
    matched_school_ids: List[str] = []

    debug_samples: List[str] = []
    scanned_schools = 0
    scanned_grade_docs = 0
    grade_docs_with_theme = 0

    for school_cover_snapshot in db.collection("cover_selections").get():
        scanned_schools += 1
        school_id = school_cover_snapshot.id
        try:
            grade_snaps = school_cover_snapshot.reference.collection("grades").get()
        except Exception:
            grade_snaps = []

        matched = False
        for grade_snap in grade_snaps:
            scanned_grade_docs += 1
            doc = grade_snap.to_dict() or {}
            raw_theme = _coerce_str(doc.get("theme_id") or doc.get("themeId") or doc.get("theme"))
            if raw_theme:
                grade_docs_with_theme += 1
                if len(debug_samples) < 25:
                    debug_samples.append(f"{school_id}/grades/{grade_snap.id} theme_id={raw_theme!r}")
            if raw_theme and raw_theme.casefold() == target_key:
                matched = True
                break

        if matched:
            matched_school_ids.append(school_id)

    rows: List[Tuple[str, str, str, str]] = []
    for school_id in matched_school_ids:
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

    # Attach lightweight diagnostics for callers that want it.
    setattr(fetch_schools_with_cover_theme, "_debug", {
        "scanned_schools": scanned_schools,
        "scanned_grade_docs": scanned_grade_docs,
        "grade_docs_with_theme": grade_docs_with_theme,
        "samples": debug_samples,
    })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(
        description="List schools whose `theme_id` equals the provided value (default: V7)."
    )
    parser.add_argument("--theme", default="v7", help="Theme id to filter on (default: V7).")
    parser.add_argument(
        "--out",
        default="schools_theme_v7.txt",
        help="Output text file path (default: schools_theme_v7.txt).",
    )
    parser.add_argument("--debug", action="store_true", help="Print diagnostics to stdout.")
    args = parser.parse_args()

    theme = _coerce_str(args.theme) or "V1"
    print(theme)
    rows = fetch_schools_with_cover_theme(theme)
    if args.debug:
        print(f"theme filter: {theme!r}")
        dbg = getattr(fetch_schools_with_cover_theme, "_debug", None)
        if isinstance(dbg, dict):
            print(
                "cover_selections scanned: "
                f"{dbg.get('scanned_schools')} schools, "
                f"{dbg.get('scanned_grade_docs')} grade docs, "
                f"{dbg.get('grade_docs_with_theme')} with theme_id"
            )
            samples = dbg.get("samples")
            if isinstance(samples, list) and samples:
                print("sample theme_id values:")
                for line in samples:
                    print("  " + str(line))

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    lines: List[str] = []
    lines.append(f"Schools with theme_id={theme!r}")
    lines.append(f"Generated: {now}")
    lines.append(f"Count: {len(rows)}")
    lines.append("")
    lines.append("school_id\tschool_name\temail\tsales_representative")
    for school_id, school_name, email, sales_rep in rows:
        lines.append(f"{school_id}\t{school_name}\t{email}\t{sales_rep}")
    lines.append("")

    out_path = args.out
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Wrote {len(rows)} schools to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
