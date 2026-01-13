from __future__ import annotations

import json
import re
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
PUBLIC_DIR = (BACKEND_DIR / "public").resolve()
SUBJECT_PDF_DIR = PUBLIC_DIR / "subject-pdfs"
EXCEL_PATH = ROOT_DIR / "BOOK CODES 2025-26.xlsx"

SAFE_COMPONENT_RE = re.compile(r"[^A-Za-z0-9_.-]+")

# Fallback subjects if the Excel file or pandas is unavailable.
FALLBACK_SUBJECT_ROWS: List[dict] = [
    {"class": "PG", "subject": "English", "type": None},
    {"class": "PG", "subject": "Maths", "type": None},
    {"class": "PG", "subject": "EVS", "type": None},
    {"class": "PG", "subject": "Rhymes and stories", "type": None},
    {"class": "PG", "subject": "Art & craft", "type": None},
    {"class": "PG", "subject": "Pattern", "type": None},
    {"class": "Nursery", "subject": "English", "type": None},
    {"class": "Nursery", "subject": "Maths", "type": None},
    {"class": "Nursery", "subject": "EVS", "type": None},
    {"class": "Nursery", "subject": "Rhymes & stories", "type": None},
    {"class": "Nursery", "subject": "Art & craft", "type": None},
    {"class": "LKG", "subject": "English", "type": None},
    {"class": "LKG", "subject": "Maths", "type": None},
    {"class": "LKG", "subject": "EVS", "type": None},
    {"class": "LKG", "subject": "Art & craft", "type": None},
    {"class": "LKG", "subject": "Rhymes & stories", "type": None},
    {"class": "LKG", "subject": "Languages", "type": "Language"},
    {"class": "UKG", "subject": "English", "type": None},
    {"class": "UKG", "subject": "Maths", "type": None},
    {"class": "UKG", "subject": "EVS", "type": None},
    {"class": "UKG", "subject": "Rhymes & stories", "type": None},
    {"class": "UKG", "subject": "Art & craft", "type": None},
    {"class": "UKG", "subject": "Languages", "type": "Language"},
]


def _sanitize(value: str, fallback: str) -> str:
    cleaned = SAFE_COMPONENT_RE.sub("_", (value or "").strip())
    return cleaned or fallback


def _load_subject_rows(path: Path) -> Tuple[List[dict], Optional[str]]:
    """
    Try to read subjects from the Excel file.
    Expected columns (case-insensitive): class/grade and subject.
    """
    try:
        import pandas as pd
    except ImportError:
        return (
            FALLBACK_SUBJECT_ROWS,
            "pandas is not installed. Using fallback subjects; install requirements for Excel-driven list.",
        )

    if not path.exists():
        return (
            FALLBACK_SUBJECT_ROWS,
            f"Excel file not found at {path}. Using fallback subjects.",
        )

    try:
        df = pd.read_excel(path)
    except Exception as exc:  # pragma: no cover - defensive
        return FALLBACK_SUBJECT_ROWS, f"Unable to read Excel file: {exc}"

    columns = [str(col) for col in df.columns]

    def find_col(keyword: str) -> Optional[str]:
        for col in columns:
            if keyword.lower() in col.lower():
                return col
        return None

    class_col = find_col("class") or find_col("grade")
    subject_col = find_col("subject")
    type_col = find_col("type")

    if not class_col or not subject_col:
        return (
            FALLBACK_SUBJECT_ROWS,
            f"Missing class/subject columns in Excel. Found columns: {columns}. Using fallback subjects.",
        )

    rows: List[dict] = []
    for _, row in df.iterrows():
        class_name = row.get(class_col)
        subject_name = row.get(subject_col)
        if pd.isna(class_name) or pd.isna(subject_name):
            continue
        type_name = None
        if type_col and not pd.isna(row.get(type_col)):
            type_name = str(row.get(type_col)).strip()
        rows.append(
            {
                "class": str(class_name).strip(),
                "subject": str(subject_name).strip(),
                "type": type_name,
            }
        )

    return rows or FALLBACK_SUBJECT_ROWS, None


SUBJECT_PDF_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
SUBJECT_ROWS, LOAD_ERROR = _load_subject_rows(EXCEL_PATH)

app = FastAPI(title="Subject PDF Upload UI")
app.mount("/public", StaticFiles(directory=PUBLIC_DIR), name="public")


@app.get("/", response_class=HTMLResponse)
async def index():
    subjects_json = json.dumps(SUBJECT_ROWS)
    load_error = LOAD_ERROR or ""
    excel_note = (
        f"Loaded subjects from {EXCEL_PATH}"
        if not load_error
        else f"Unable to load subjects from {EXCEL_PATH}: {load_error}"
    )
    html = f"""
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Subject PDF Upload</title>
      <style>
        :root {{
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #0f172a;
          background: #f8fafc;
        }}
        body {{
          margin: 0;
          padding: 24px;
        }}
        .card {{
          max-width: 720px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }}
        h1 {{
          margin: 0 0 12px;
          font-size: 22px;
        }}
        .note {{
          font-size: 13px;
          color: #475569;
          margin-bottom: 16px;
        }}
        label {{
          display: block;
          font-weight: 600;
          margin-bottom: 6px;
          font-size: 13px;
        }}
        select, input[type="text"], input[type="file"] {{
          width: 100%;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          font-size: 14px;
          box-sizing: border-box;
        }}
        .row {{
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }}
        button {{
          background: #0f172a;
          color: #fff;
          border: none;
          padding: 12px 16px;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
        }}
        button:disabled {{
          opacity: 0.5;
          cursor: not-allowed;
        }}
        .status {{
          margin-top: 12px;
          padding: 10px;
          border-radius: 8px;
          font-size: 14px;
          display: none;
        }}
        .status.ok {{
          background: #ecfdf3;
          color: #166534;
          border: 1px solid #bbf7d0;
        }}
        .status.err {{
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecdd3;
        }}
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Upload Subject PDFs</h1>
        <div class="note">{excel_note}</div>
        <form id="uploadForm">
          <div class="row">
            <div>
              <label for="classInput">Class / Grade</label>
              <input list="classOptions" id="classInput" name="class_name" placeholder="e.g. Nursery" required />
              <datalist id="classOptions"></datalist>
            </div>
            <div>
              <label for="subjectInput">Subject</label>
              <input list="subjectOptions" id="subjectInput" name="subject_name" placeholder="e.g. English" required />
              <datalist id="subjectOptions"></datalist>
            </div>
            <div>
              <label for="typeInput">Type (optional)</label>
              <input list="typeOptions" id="typeInput" name="type_name" placeholder="e.g. Language / Core / Workbook" />
              <datalist id="typeOptions"></datalist>
            </div>
          </div>
          <div class="row">
            <div>
              <label for="fileInput">PDF File</label>
              <input type="file" id="fileInput" name="file" accept="application/pdf" required />
            </div>
          </div>
          <button type="submit" id="submitBtn">Upload</button>
        </form>
        <div class="status" id="status"></div>
      </div>
      <script>
        const rows = {subjects_json};
        const classes = Array.from(new Set(rows.map(r => r.class))).sort((a,b)=>a.localeCompare(b));
        const subjectsByClass = {{}};
        const typesByClassSubject = {{}};
        rows.forEach(r => {{
          const key = r.class;
          if (!subjectsByClass[key]) subjectsByClass[key] = new Set();
          subjectsByClass[key].add(r.subject);
          const typeKey = `${{r.class}}||${{r.subject}}`;
          if (!typesByClassSubject[typeKey]) typesByClassSubject[typeKey] = new Set();
          if (r.type) {{
            typesByClassSubject[typeKey].add(r.type);
          }}
        }});
        const classOptions = document.getElementById('classOptions');
        classes.forEach(c => {{
          const opt = document.createElement('option');
          opt.value = c;
          classOptions.appendChild(opt);
        }});
        const subjectOptions = document.getElementById('subjectOptions');
        const typeOptions = document.getElementById('typeOptions');
        function populateSubjects(className) {{
          subjectOptions.innerHTML = '';
          const set = subjectsByClass[className] || new Set(rows.map(r => r.subject));
          Array.from(set).sort((a,b)=>a.localeCompare(b)).forEach(sub => {{
            const opt = document.createElement('option');
            opt.value = sub;
            subjectOptions.appendChild(opt);
          }});
          const firstSubject = subjectOptions.options[0]?.value || '';
          populateTypes(className, firstSubject);
        }}
        function populateTypes(className, subjectName) {{
          typeOptions.innerHTML = '';
          const typeKey = `${{className}}||${{subjectName}}`;
          const set = typesByClassSubject[typeKey] || new Set();
          Array.from(set).sort((a,b)=>a.localeCompare(b)).forEach(t => {{
            const opt = document.createElement('option');
            opt.value = t;
            typeOptions.appendChild(opt);
          }});
        }}
        document.getElementById('classInput').addEventListener('change', (e) => {{
          populateSubjects(e.target.value);
        }});
        document.getElementById('subjectInput').addEventListener('change', (e) => {{
          const cls = document.getElementById('classInput').value;
          populateTypes(cls, e.target.value);
        }});
        populateSubjects(classes[0] || '');

        const form = document.getElementById('uploadForm');
        const statusEl = document.getElementById('status');
        const submitBtn = document.getElementById('submitBtn');

        form.addEventListener('submit', async (e) => {{
          e.preventDefault();
          statusEl.style.display = 'none';
          submitBtn.disabled = true;
          const formData = new FormData(form);
          try {{
            const res = await fetch('/upload', {{ method: 'POST', body: formData }});
            const data = await res.json();
            if (!res.ok || data.status !== 'ok') throw new Error(data.detail || 'Upload failed');
            statusEl.textContent = 'Uploaded! Public URL: ' + data.url;
            statusEl.className = 'status ok';
            statusEl.style.display = 'block';
            form.reset();
          }} catch (err) {{
            statusEl.textContent = err;
            statusEl.className = 'status err';
            statusEl.style.display = 'block';
          }} finally {{
            submitBtn.disabled = false;
          }}
        }});
      </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html)


@app.get("/subjects")
async def subjects():
    return {"subjects": SUBJECT_ROWS, "error": LOAD_ERROR, "excel_path": str(EXCEL_PATH)}


@app.post("/upload")
async def upload_pdf(
    class_name: str = Form(...),
    subject_name: str = Form(...),
    type_name: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing PDF file.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="PDF is empty.")

    safe_class = _sanitize(class_name, "class")
    safe_subject = _sanitize(subject_name, "subject")
    safe_type = _sanitize(type_name, "type") if type_name else None

    target_dir = SUBJECT_PDF_DIR / safe_class
    if safe_type:
        target_dir = target_dir / safe_type
    target_dir.mkdir(parents=True, exist_ok=True)
    file_stem = f"{safe_subject}{'_' + safe_type if safe_type else ''}"
    target_path = target_dir / f"{file_stem}.pdf"
    try:
        target_path.write_bytes(data)
    except OSError as exc:  # pragma: no cover - filesystem error
        raise HTTPException(status_code=500, detail=f"Unable to store PDF: {exc}") from exc

    parts = ["", "public", "subject-pdfs", safe_class]
    if safe_type:
        parts.append(safe_type)
    parts.append(f"{file_stem}.pdf")
    public_url = "/".join(parts)
    return {"status": "ok", "url": public_url}


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("subject_pdf_uploader:app", host="0.0.0.0", port=9000, reload=True)
