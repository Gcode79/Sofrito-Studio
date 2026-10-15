"""
Sofrito Studio — Brand Kit: SVG -> PNG + ICO (favicon) converter.

Converts every SVG logo/icon in the Brand Kit to PNG (multiple sizes) and
ICO favicons, so the brand is available in all formats for any future
purpose (social avatars, favicon, print, etc.).

Keeps the original SVGs untouched.

Requires: svglib, reportlab, Pillow (system python has Pillow).
Run: python brand_kit_convert.py
"""

import os
from pathlib import Path

from PIL import Image
from resvg_py import svg_to_bytes

BRAND_KIT = Path(__file__).resolve().parent.parent / "brand-uploads" / "All-Product-Images" / "Sofrito-Studio-Brand-Kit"
LOGO_DIR = BRAND_KIT / "Logos"
ICON_DIR = BRAND_KIT / "Icons"

# Output sizes (px). 512/256/128/64/32 cover most uses.
PNG_SIZES = [512, 256, 128, 64, 32]
FAVICON_SIZES = [32, 16]  # ICO sizes


def svg_to_png(svg_path: Path, png_path: Path, size: int) -> bool:
    """Render an SVG to a PNG at a given pixel size using resvg (no native deps)."""
    try:
        svg_text = svg_path.read_text(encoding="utf-8")
        # Render at the requested size (resvg scales the SVG viewport to these dims)
        png_bytes = svg_to_bytes(svg_string=svg_text, width=size, height=size)
        img = Image.open(__import__("io").BytesIO(png_bytes)).convert("RGBA")
        img = img.resize((size, size), Image.LANCZOS)
        img.save(png_path, format="PNG")
        return True
    except Exception as e:
        print(f"    ERR {svg_path.name} @{size}: {str(e)[:80]}")
        return False


def png_to_ico(png_256: Path, ico_path: Path, sizes) -> bool:
    """Build an ICO from a 256px PNG."""
    try:
        img = Image.open(png_256).convert("RGBA")
        img.save(ico_path, format="ICO", sizes=[(s, s) for s in sizes])
        return True
    except Exception as e:
        print(f"    ERR ico {ico_path.name}: {str(e)[:80]}")
        return False


def main() -> None:
    print("Sofrito Studio — Brand Kit conversion (SVG -> PNG + ICO)")
    print("=" * 60)

    # Combine logos + icons (dedupe by name)
    svgs = {}
    for d in (LOGO_DIR, ICON_DIR):
        for f in d.glob("*.svg"):
            svgs.setdefault(f.name, f)

    for name, svg_path in svgs.items():
        stem = Path(name).stem
        out_dir = BRAND_KIT / "Converted" / stem
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n{name} ->")

        # PNG at multiple sizes
        png_256 = None
        for size in PNG_SIZES:
            png = out_dir / f"{stem}-{size}px.png"
            if svg_to_png(svg_path, png, size):
                if size == 256:
                    png_256 = png
                print(f"  {png.name}")

        # ICO favicon (needs a 256px PNG source)
        if png_256:
            ico = out_dir / f"{stem}-favicon.ico"
            if png_to_ico(png_256, ico, FAVICON_SIZES):
                print(f"  {ico.name}")

        # Copy the original SVG alongside for convenience
        # (originals are preserved in place; we just note the source)

    print("\n" + "=" * 60)
    print("Done. Originals preserved in Logos/ and Icons/.")
    print(f"Converted files saved under: {BRAND_KIT / 'Converted'}")


if __name__ == "__main__":
    main()
