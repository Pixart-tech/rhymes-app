#!/usr/bin/env python3
"""GUI tool to validate and upload cover PNGs described in a binder JSON file."""

import json
import threading
from pathlib import Path
from typing import List, Optional, Tuple
from tkinter import (
    Tk,
    StringVar,
    DoubleVar,
    filedialog,
    messagebox,
)
from tkinter import ttk
from tkinter.scrolledtext import ScrolledText

import requests

class CoverUploaderApp:
    def __init__(self, root: Tk) -> None:
        self.root = root
        self.root.title("Cover Page Uploader")

        self.folder_var = StringVar()
        self.upload_url_var = StringVar(value="https://example.com/api/upload")
        self.finalize_url_var = StringVar(value="https://example.com/api/mark-complete")
        self.status_var = StringVar(value="Idle")
        self.progress_var = DoubleVar(value=0.0)
        self.progress_count_var = StringVar(value="0 / 0")
        self.is_running = False

        self._build_layout()

    def _build_layout(self) -> None:
        padding = {"padx": 8, "pady": 6}

        folder_label = ttk.Label(self.root, text="Folder with JSON and png/")
        folder_label.grid(row=0, column=0, sticky="w", **padding)

        folder_entry = ttk.Entry(self.root, textvariable=self.folder_var, width=60)
        folder_entry.grid(row=0, column=1, sticky="we", **padding)

        self.root.grid_columnconfigure(1, weight=1)

        self.folder_btn = ttk.Button(self.root, text="Browse", command=self.choose_folder)
        self.folder_btn.grid(row=0, column=2, sticky="e", **padding)

        upload_label = ttk.Label(self.root, text="Upload API URL")
        upload_label.grid(row=1, column=0, sticky="w", **padding)

        upload_entry = ttk.Entry(self.root, textvariable=self.upload_url_var, width=60)
        upload_entry.grid(row=1, column=1, columnspan=2, sticky="we", **padding)

        finalize_label = ttk.Label(self.root, text="Finalize API URL")
        finalize_label.grid(row=2, column=0, sticky="w", **padding)

        finalize_entry = ttk.Entry(self.root, textvariable=self.finalize_url_var, width=60)
        finalize_entry.grid(row=2, column=1, columnspan=2, sticky="we", **padding)

        self.upload_btn = ttk.Button(self.root, text="Validate and Upload", command=self.start_upload)
        self.upload_btn.grid(row=3, column=0, columnspan=3, sticky="we", **padding)

        progress_frame = ttk.Frame(self.root)
        progress_frame.grid(row=4, column=0, columnspan=3, sticky="we", **padding)
        self.progress_bar = ttk.Progressbar(
            progress_frame, maximum=100.0, variable=self.progress_var, mode="determinate"
        )
        self.progress_bar.pack(fill="x")

        status_frame = ttk.Frame(self.root)
        status_frame.grid(row=5, column=0, columnspan=3, sticky="we", **padding)
        status_label = ttk.Label(status_frame, textvariable=self.status_var)
        status_label.pack(side="left")
        progress_count_label = ttk.Label(status_frame, textvariable=self.progress_count_var)
        progress_count_label.pack(side="right")

        log_label = ttk.Label(self.root, text="Status log")
        log_label.grid(row=6, column=0, sticky="w", **padding)
        self.log_text = ScrolledText(self.root, height=16, state="disabled")
        self.log_text.grid(row=7, column=0, columnspan=3, sticky="nsew", padx=8, pady=(0, 8))
        self.root.grid_rowconfigure(7, weight=1)

    def choose_folder(self) -> None:
        folder = filedialog.askdirectory(title="Select folder containing binder JSON and png/")
        if folder:
            self.folder_var.set(folder)

    def start_upload(self) -> None:
        if self.is_running:
            return
        self.is_running = True
        self._set_controls_enabled(False)
        self._log("Starting validation...")
        thread = threading.Thread(target=self._process_upload, daemon=True)
        thread.start()

    def _process_upload(self) -> None:
        try:
            folder = Path(self.folder_var.get()).expanduser()
            upload_url = self.upload_url_var.get().strip()
            finalize_url = self.finalize_url_var.get().strip()

            if not folder.is_dir():
                raise FileNotFoundError(f"Folder not found: {folder}")
            png_dir = folder / "png"
            if not png_dir.is_dir():
                raise FileNotFoundError(f"'png' subfolder not found in {folder}")

            json_path = self._find_json(folder)
            self._log(f"Using JSON file: {json_path}")
            data = json.loads(json_path.read_text(encoding="utf-8"))

            school = data.get("school") or {}
            school_id = str(school.get("school_id") or "").strip()
            if not school_id:
                raise ValueError("school_id missing in JSON.")

            selections = (data.get("books") or {}).get("selections") or []
            if not selections:
                raise ValueError("No book selections found in JSON.")

            cover_ids = self._collect_cover_ids(selections)
            if not cover_ids:
                raise ValueError("No cover IDs found in selections.")

            ready_files, missing_files = self._build_file_checklist(school_id, cover_ids, png_dir)
            if missing_files:
                missing_lines = "\n".join(str(p) for p in missing_files)
                raise FileNotFoundError(f"Missing PNG files:\n{missing_lines}")

            total = len(ready_files)
            self._log(f"Found {total} cover files to upload.")
            self._update_progress(0, total, status="Uploading...")

            session = requests.Session()
            for index, (cover_id, file_path) in enumerate(ready_files, start=1):
                try:
                    with file_path.open("rb") as handle:
                        response = session.post(
                            upload_url,
                            data={"school_id": school_id, "cover_id": cover_id},
                            files={"file": (file_path.name, handle, "image/png")},
                            timeout=60,
                        )
                    response.raise_for_status()
                    self._log(f"Uploaded {file_path.name} (cover {cover_id}) - status {response.status_code}")
                except Exception as exc:
                    raise RuntimeError(f"Upload failed for {file_path.name}: {exc}") from exc

                self._update_progress(index, total, status=f"Uploaded {index}/{total}")

            try:
                finalize_response = session.get(finalize_url, params={"school_id": school_id}, timeout=30)
                finalize_response.raise_for_status()
                self._log(
                    f"Finalize call succeeded (status {finalize_response.status_code}): "
                    f"{finalize_response.text[:200]}"
                )
            except Exception as exc:
                raise RuntimeError(f"Finalize GET failed: {exc}") from exc

            self._update_progress(total, total, status="All uploads completed.")
            self._notify("Success", "All cover pages uploaded and finalized.")
        except Exception as exc:  # broad catch to surface errors in UI
            self._log(f"ERROR: {exc}")
            self._update_status(f"Error: {exc}")
            self._notify("Upload failed", str(exc), kind="error")
        finally:
            self.root.after(0, lambda: self._set_controls_enabled(True))
            self.is_running = False

    def _find_json(self, folder: Path) -> Path:
        json_files = sorted(folder.glob("*.json"))
        if not json_files:
            raise FileNotFoundError(f"No JSON file found in {folder}")
        if len(json_files) > 1:
            self._log(f"Multiple JSON files found, using {json_files[0].name}")
        return json_files[0]

    def _collect_cover_ids(self, selections) -> List[str]:
        cover_ids: List[str] = []
        for item in selections:
            for key in ("core_cover", "work_cover", "addon_cover"):
                value = item.get(key)
                if not value:
                    continue
                cover_id = str(value).strip()
                if cover_id and cover_id not in cover_ids:
                    cover_ids.append(cover_id)
        return cover_ids

    def _build_file_checklist(
        self, school_id: str, cover_ids: List[str], png_dir: Path
    ) -> Tuple[List[Tuple[str, Path]], List[Path]]:
        ready: List[Tuple[str, Path]] = []
        missing: List[Path] = []
        for cover_id in cover_ids:
            filename = f"{school_id}{cover_id}.png"
            path = png_dir / filename
            if path.is_file():
                ready.append((cover_id, path))
            else:
                missing.append(path)
        return ready, missing

    def _log(self, message: str) -> None:
        def append() -> None:
            self.log_text.configure(state="normal")
            self.log_text.insert("end", message + "\n")
            self.log_text.see("end")
            self.log_text.configure(state="disabled")

        self.root.after(0, append)

    def _update_status(self, message: str) -> None:
        self.root.after(0, lambda: self.status_var.set(message))

    def _update_progress(self, current: int, total: int, status: Optional[str] = None) -> None:
        percent = 0.0 if total == 0 else (current / total) * 100.0
        self.root.after(
            0,
            lambda: self._apply_progress(percent, current, total, status),
        )

    def _apply_progress(self, percent: float, current: int, total: int, status: Optional[str]) -> None:
        self.progress_var.set(percent)
        self.progress_count_var.set(f"{current} / {total}")
        if status:
            self.status_var.set(status)

    def _notify(self, title: str, message: str, *, kind: str = "info") -> None:
        def show() -> None:
            if kind == "error":
                messagebox.showerror(title, message)
            else:
                messagebox.showinfo(title, message)

        self.root.after(0, show)

    def _set_controls_enabled(self, enabled: bool) -> None:
        state = "normal" if enabled else "disabled"
        self.upload_btn.config(state=state)
        self.folder_btn.config(state=state)


def main() -> None:
    root = Tk()
    root.geometry("760x520")
    app = CoverUploaderApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
