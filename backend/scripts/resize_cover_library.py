"""
Resize all cover library PNGs (themes and colours) to 1000x1000 while preserving aspect ratio.

Source folders:
- backend/public/cover-library/themes/**/cover.png
- backend/public/cover-library/colours/**/*\.png

Images are resized to fit within 1000x1000 and letterboxed on a white square canvas to avoid distortion.
Existing files are overwritten in place.
"""

from pathlib import Path
from PIL import Image

TARGET_SIZE = (1000, 1000)
BASE_DIR = Path(__file__).resolve().parent.parent / "public" / "cover-library"


def resize_and_pad(image_path: Path) -> None:
    with Image.open(image_path) as im:
        im = im.convert("RGBA")
        original_size = im.size

        # Preserve aspect ratio, fit within target
        im.thumbnail(TARGET_SIZE, Image.Resampling.LANCZOS)

        # Center on white square canvas
        background = Image.new("RGBA", TARGET_SIZE, (255, 255, 255, 255))
        offset = ((TARGET_SIZE[0] - im.width) // 2, (TARGET_SIZE[1] - im.height) // 2)
        background.paste(im, offset, im)

        # Save back as PNG (strip alpha if fully opaque)
        save_im = background.convert("RGB")
        save_im.save(image_path, format="PNG", optimize=True)

    print(f"Resized {image_path} from {original_size} to {TARGET_SIZE}")


def main() -> None:
    theme_paths = sorted((BASE_DIR / "themes").rglob("cover.png"))
    colour_paths = sorted((BASE_DIR / "colours").rglob("*.png"))
    all_paths = theme_paths + colour_paths

    if not all_paths:
        print("No PNG files found in cover library.")
        return

    for path in all_paths:
        resize_and_pad(path)


if __name__ == "__main__":
    main()
