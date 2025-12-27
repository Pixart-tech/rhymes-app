import os
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
from typing import Dict, Optional

try:
    import requests
except ImportError:  # pragma: no cover - runtime guidance for missing dependency
    requests = None


class APIClient:
    """Minimal client for the cover upload endpoints exposed by backend/server.py."""

    def __init__(self, base_url: str, timeout: int = 15) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def list_themes(self) -> dict:
        return self._request("get", "/cover-assets/themes")

    def upload_thumbnail(self, theme_id: str, file_path: str, label: Optional[str]) -> dict:
        return self._post_file(f"/cover-assets/themes/{theme_id}/thumbnail", file_path, label)

    def delete_thumbnail(self, theme_id: str) -> dict:
        return self._request("delete", f"/cover-assets/themes/{theme_id}/thumbnail")

    def upload_colour(self, theme_id: str, colour_id: str, file_path: str, label: Optional[str]) -> dict:
        return self._post_file(
            f"/cover-assets/themes/{theme_id}/colours/{colour_id}",
            file_path,
            label,
        )

    def delete_colour(self, theme_id: str, colour_id: str) -> dict:
        return self._request("delete", f"/cover-assets/themes/{theme_id}/colours/{colour_id}")

    def _request(self, method: str, path: str, **kwargs) -> dict:
        if requests is None:
            raise RuntimeError("The 'requests' package is required. Install it with 'pip install requests'.")

        url = f"{self.base_url}{path}"
        response = requests.request(method, url, timeout=self.timeout, **kwargs)
        response.raise_for_status()
        if response.headers.get("content-type", "").startswith("application/json"):
            return response.json()
        return {}

    def _post_file(self, path: str, file_path: str, label: Optional[str]) -> dict:
        filename = os.path.basename(file_path)
        files = {"file": (filename, open(file_path, "rb"), "image/png")}
        data = {}
        if label:
            data["label"] = label
        try:
            return self._request("post", path, files=files, data=data)
        finally:
            files["file"][1].close()


class CoverUploaderApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Cover Theme Uploader")
        self.root.geometry("820x640")

        self.base_url_var = tk.StringVar(value="http://localhost:8000/api")
        self.theme_var = tk.StringVar()
        self.theme_label_var = tk.StringVar()
        self.theme_file_var = tk.StringVar()

        self.colour_var = tk.StringVar()
        self.colour_label_var = tk.StringVar()
        self.colour_file_var = tk.StringVar()

        self.themes_by_id: Dict[str, dict] = {}

        self._build_ui()
        self.refresh_themes()

    def _build_ui(self) -> None:
        main = ttk.Frame(self.root, padding=12)
        main.pack(fill=tk.BOTH, expand=True)

        # Server configuration
        server_frame = ttk.LabelFrame(main, text="Server", padding=10)
        server_frame.pack(fill=tk.X, expand=False, pady=(0, 10))

        ttk.Label(server_frame, text="API base URL").grid(row=0, column=0, sticky="w")
        ttk.Entry(server_frame, textvariable=self.base_url_var, width=60).grid(row=0, column=1, sticky="we", padx=6)
        ttk.Button(server_frame, text="Refresh themes", command=self.refresh_themes).grid(row=0, column=2, padx=4)
        server_frame.columnconfigure(1, weight=1)

        # Theme selection and thumbnail upload
        theme_frame = ttk.LabelFrame(main, text="Theme thumbnail", padding=10)
        theme_frame.pack(fill=tk.X, expand=False, pady=(0, 10))

        ttk.Label(theme_frame, text="Theme slot").grid(row=0, column=0, sticky="w")
        self.theme_combo = ttk.Combobox(theme_frame, textvariable=self.theme_var, state="readonly", width=30)
        self.theme_combo.grid(row=0, column=1, sticky="we", padx=6)
        self.theme_combo.bind("<<ComboboxSelected>>", self._on_theme_change)
        ttk.Label(theme_frame, text="Label (optional)").grid(row=0, column=2, sticky="e")
        ttk.Entry(theme_frame, textvariable=self.theme_label_var, width=22).grid(row=0, column=3, sticky="we", padx=6)

        ttk.Label(theme_frame, text="Thumbnail PNG").grid(row=1, column=0, sticky="w", pady=6)
        ttk.Entry(theme_frame, textvariable=self.theme_file_var, width=50).grid(row=1, column=1, columnspan=2, sticky="we", padx=6, pady=6)
        ttk.Button(theme_frame, text="Browse", command=lambda: self._browse_file(self.theme_file_var)).grid(row=1, column=3, sticky="e")
        ttk.Button(theme_frame, text="Delete thumbnail", command=self.delete_thumbnail).grid(row=2, column=2, sticky="e", pady=6, padx=(0, 6))
        ttk.Button(theme_frame, text="Upload theme thumbnail", command=self.upload_thumbnail).grid(row=2, column=3, sticky="e", pady=6)
        theme_frame.columnconfigure(1, weight=1)
        theme_frame.columnconfigure(2, weight=1)

        # Colour selection and upload
        colour_frame = ttk.LabelFrame(main, text="Colour swatch", padding=10)
        colour_frame.pack(fill=tk.X, expand=False, pady=(0, 10))

        ttk.Label(colour_frame, text="Colour slot").grid(row=0, column=0, sticky="w")
        self.colour_combo = ttk.Combobox(colour_frame, textvariable=self.colour_var, state="readonly", width=30)
        self.colour_combo.grid(row=0, column=1, sticky="we", padx=6)
        ttk.Label(colour_frame, text="Label (optional)").grid(row=0, column=2, sticky="e")
        ttk.Entry(colour_frame, textvariable=self.colour_label_var, width=22).grid(row=0, column=3, sticky="we", padx=6)

        ttk.Label(colour_frame, text="Colour PNG").grid(row=1, column=0, sticky="w", pady=6)
        ttk.Entry(colour_frame, textvariable=self.colour_file_var, width=50).grid(row=1, column=1, columnspan=2, sticky="we", padx=6, pady=6)
        ttk.Button(colour_frame, text="Browse", command=lambda: self._browse_file(self.colour_file_var)).grid(row=1, column=3, sticky="e")
        ttk.Button(colour_frame, text="Delete colour", command=self.delete_colour).grid(row=2, column=2, sticky="e", pady=6, padx=(0, 6))
        ttk.Button(colour_frame, text="Upload colour image", command=self.upload_colour).grid(row=2, column=3, sticky="e", pady=6)
        colour_frame.columnconfigure(1, weight=1)
        colour_frame.columnconfigure(2, weight=1)

        # Log output
        log_frame = ttk.LabelFrame(main, text="Activity", padding=10)
        log_frame.pack(fill=tk.BOTH, expand=True)
        self.log_widget = scrolledtext.ScrolledText(log_frame, height=14, state="disabled", wrap=tk.WORD)
        self.log_widget.pack(fill=tk.BOTH, expand=True)

    def _log(self, message: str) -> None:
        self.log_widget.configure(state="normal")
        self.log_widget.insert(tk.END, f"{message}\n")
        self.log_widget.see(tk.END)
        self.log_widget.configure(state="disabled")

    def _browse_file(self, target_var: tk.StringVar) -> None:
        file_path = filedialog.askopenfilename(
            title="Choose PNG file",
            filetypes=[("PNG images", "*.png"), ("All files", "*.*")],
        )
        if file_path:
            target_var.set(file_path)

    def _get_client(self) -> APIClient:
        base_url = self.base_url_var.get().strip()
        if not base_url:
            raise RuntimeError("Enter the server API base URL (for example http://localhost:8000/api).")
        return APIClient(base_url)

    def refresh_themes(self) -> None:
        try:
            client = self._get_client()
            payload = client.list_themes()
        except Exception as exc:
            messagebox.showerror("Unable to refresh themes", str(exc))
            self._log(f"Failed to fetch themes: {exc}")
            return

        themes = payload.get("themes") or []
        self.themes_by_id = {item.get("id"): item for item in themes if item.get("id")}
        values = []
        for theme_id, item in self.themes_by_id.items():
            label = item.get("label") or theme_id
            values.append(f"{theme_id} | {label}")

        self.theme_combo["values"] = values
        if values:
            self.theme_combo.current(0)
        self._on_theme_change()
        self._log(f"Loaded {len(values)} theme slots from server.")

    def _current_theme_id(self) -> Optional[str]:
        raw_value = self.theme_var.get()
        if not raw_value:
            return None
        return raw_value.split("|", 1)[0].strip()

    def _current_colour_id(self) -> Optional[str]:
        raw_value = self.colour_var.get()
        if not raw_value:
            return None
        return raw_value.split("|", 1)[0].strip()

    def _on_theme_change(self, *_args: object) -> None:
        theme_id = self._current_theme_id()
        theme = self.themes_by_id.get(theme_id) if theme_id else None
        if theme:
            self.theme_label_var.set(theme.get("label") or "")
            colours = theme.get("colours") or []
            colour_values = []
            for colour in colours:
                colour_id = colour.get("id")
                if colour_id:
                    colour_values.append(f"{colour_id} | {colour.get('label') or colour_id}")
            self.colour_combo["values"] = colour_values
            if colour_values:
                self.colour_combo.current(0)
            else:
                self.colour_var.set("")
        else:
            self.theme_label_var.set("")
            self.colour_combo["values"] = []
            self.colour_var.set("")

    def _merge_theme(self, theme: Optional[dict]) -> None:
        if not theme or not theme.get("id"):
            return
        self.themes_by_id[theme["id"]] = theme
        selection = f"{theme['id']} | {theme.get('label') or theme['id']}"
        values = [f"{tid} | {data.get('label') or tid}" for tid, data in self.themes_by_id.items()]
        self.theme_combo["values"] = values
        self.theme_var.set(selection)
        self._on_theme_change()

    def _validate_file(self, path: str, kind: str) -> bool:
        if not path:
            messagebox.showwarning("Missing file", f"Choose a PNG file for the {kind}.")
            return False
        if not os.path.isfile(path):
            messagebox.showwarning("File not found", f"The selected {kind} file does not exist.")
            return False
        return True

    def upload_thumbnail(self) -> None:
        theme_id = self._current_theme_id()
        if not theme_id:
            messagebox.showwarning("Select theme", "Choose a theme slot before uploading.")
            return

        file_path = self.theme_file_var.get().strip()
        if not self._validate_file(file_path, "theme thumbnail"):
            return

        label = self.theme_label_var.get().strip() or None
        try:
            client = self._get_client()
            response = client.upload_thumbnail(theme_id, file_path, label)
        except Exception as exc:
            messagebox.showerror("Upload failed", str(exc))
            self._log(f"Failed to upload thumbnail for {theme_id}: {exc}")
            return

        self._merge_theme(response.get("theme"))
        self._log(f"Uploaded thumbnail for {theme_id}.")

    def delete_thumbnail(self) -> None:
        theme_id = self._current_theme_id()
        if not theme_id:
            messagebox.showwarning("Select theme", "Choose a theme slot before deleting.")
            return

        try:
            client = self._get_client()
            response = client.delete_thumbnail(theme_id)
        except Exception as exc:
            messagebox.showerror("Delete failed", str(exc))
            self._log(f"Failed to delete thumbnail for {theme_id}: {exc}")
            return

        self._merge_theme(response.get("theme"))
        self.theme_file_var.set("")
        self._log(f"Deleted thumbnail for {theme_id}.")

    def upload_colour(self) -> None:
        theme_id = self._current_theme_id()
        if not theme_id:
            messagebox.showwarning("Select theme", "Choose a theme slot before uploading.")
            return

        colour_id = self._current_colour_id()
        if not colour_id:
            messagebox.showwarning("Select colour", "Choose a colour slot before uploading.")
            return

        file_path = self.colour_file_var.get().strip()
        if not self._validate_file(file_path, "colour image"):
            return

        label = self.colour_label_var.get().strip() or None
        try:
            client = self._get_client()
            response = client.upload_colour(theme_id, colour_id, file_path, label)
        except Exception as exc:
            messagebox.showerror("Upload failed", str(exc))
            self._log(f"Failed to upload colour {colour_id} for {theme_id}: {exc}")
            return

        self._merge_theme(response.get("theme"))
        self._log(f"Uploaded colour {colour_id} for {theme_id}.")

    def delete_colour(self) -> None:
        theme_id = self._current_theme_id()
        if not theme_id:
            messagebox.showwarning("Select theme", "Choose a theme slot before deleting.")
            return

        colour_id = self._current_colour_id()
        if not colour_id:
            messagebox.showwarning("Select colour", "Choose a colour slot before deleting.")
            return

        try:
            client = self._get_client()
            response = client.delete_colour(theme_id, colour_id)
        except Exception as exc:
            messagebox.showerror("Delete failed", str(exc))
            self._log(f"Failed to delete colour {colour_id} for {theme_id}: {exc}")
            return

        self._merge_theme(response.get("theme"))
        self.colour_file_var.set("")
        self._log(f"Deleted colour {colour_id} for {theme_id}.")


def main() -> None:
    root = tk.Tk()
    CoverUploaderApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
