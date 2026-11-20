#!/usr/bin/env python3
"""Read-only, fail-closed QA for 3 Kings Daily Site Report PDF/PNG publication.

Usage:
  python scripts/daily-site-publish-qa.py --pdf report.pdf --png villa.png condo.png mirage.png hennessy.png
  python scripts/daily-site-publish-qa.py --pdf extra.pdf --png extra.png --extra-sabaidee

Run on the *final files fetched from Drive*, not on a preview. This tool never
edits the PDF, PNG, Google Sheet, Supabase database, or LINE/Worker settings.
Validation is a prerequisite to (not proof of) Gateway READY or LINE delivery.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Sequence

import fitz
from PIL import Image, ImageChops

SITES = ("Above Villa", "Above Condo", "Mirage", "Hennessy")
LABELS = ("Page_01_Above_Villa", "Page_02_Above_Condo", "Page_03_Mirage", "Page_04_Henessy")
WIDTH = 2947
MAX_BYTES = 1048576

class QaHold(ValueError):
    """A mandatory gate is not satisfied. Never stage/finalize LINE after this."""

def require(ok: bool, code: str) -> None:
    if not ok:
        raise QaHold(code)

def spans(page):
    for block in page.get_text("rawdict")["blocks"]:
        if block["type"] == 0:
            for line in block["lines"]:
                for span in line["spans"]:
                    yield span

def read_crop(page):
    """Detect real vector header and the last notes frame, not a fixed pixel height."""
    drawings = page.get_drawings()
    headers = [d["rect"] for d in drawings if d["type"] == "f" and d["fill"]
               and d["fill"][0] < .15 and d["fill"][1] < .3
               and d["fill"][2] < .4 and d["rect"].width > 500]
    require(len(headers) == 1, "HOLD_PDF_DARK_HEADER_GEOMETRY")
    notes = [d["rect"] for d in drawings if d["type"] == "f" and d["fill"]
             and d["fill"][0] > .94 and d["fill"][1] > .95
             and d["rect"].width > 500 and d["rect"].y0 > 150]
    require(len(notes) >= 2, "HOLD_PDF_REMARKS_FRAME_GEOMETRY")
    hdr, note = headers[0], notes[-1]
    require(note.y1 > hdr.y1 + 100, "HOLD_PDF_REMARKS_FRAME_GEOMETRY")
    return fitz.Rect(hdr.x0 - 1.5, hdr.y0 - 1.5, hdr.x1 + 1.5, note.y1 + 1.6), note

def check_pdf(doc: fitz.Document, extra: bool, date: str | None):
    require(len(doc) == (1 if extra else 4), "HOLD_PDF_PAGE_COUNT")
    crops = []
    for i, page in enumerate(doc):
        require(abs(page.rect.width - 841.89) <= 2 and
                abs(page.rect.height - 595.28) <= 2, f"HOLD_PDF_A4_LANDSCAPE_PAGE_{i+1}")
        text = page.get_text().replace("ทํา", "ทำ").replace("วันทีѷ", "วันที่")
        for field in ("ผู้จัดทำ", "ผู้ตรวจสอบ", "วันที่ตรวจ", "หมายเหตุ", "รวม"):
            require(field in text, f"HOLD_PDF_MISSING_{field}_PAGE_{i+1}")
        if date:
            require(date in text, f"HOLD_PDF_DATE_PAGE_{i+1}")
        require(("สบายดีวิลเลจ" in text) if extra else (SITES[i] in text),
                f"HOLD_PDF_SITE_PAGE_{i+1}")
        crop, note = read_crop(page)
        signatures = [s["bbox"][1] for s in spans(page) if
                      "ผู้ตรวจสอบ" in "".join(x["c"] for x in s["chars"])]
        require(signatures and crop.y1 < min(signatures),
                f"HOLD_SIGNATURE_INSIDE_PNG_CROP_PAGE_{i+1}")
        crops.append((crop, note))
    return crops

def image_matches_vector(page, clip, png: Path, note):
    require(png.exists(), f"HOLD_PNG_MISSING_{png.name}")
    require(0 < png.stat().st_size <= MAX_BYTES, f"HOLD_PNG_INVALID_SIZE_{png.name}")
    with Image.open(png) as stream:
        require(stream.format == "PNG", f"HOLD_PNG_FORMAT_{png.name}")
        actual = stream.convert("RGB")
    scale = WIDTH / clip.width
    require(actual.width == WIDTH, f"HOLD_PNG_WIDTH_{png.name}")
    require(abs(actual.height - WIDTH * clip.height / clip.width) <= 2,
            f"HOLD_PNG_CROP_GEOMETRY_{png.name}")
    note_bottom = (note.y1 - clip.y0) * scale
    require(actual.height - note_bottom >= 4,
            f"HOLD_PNG_REMARKS_BORDER_CROPPED_{png.name}")
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip,
                          alpha=False, colorspace=fitz.csRGB)
    expected = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    if WIDTH < expected.width <= WIDTH + 3:
        expected = expected.crop((0, 0, WIDTH, expected.height))
    require(expected.size == actual.size, f"HOLD_PNG_VECTOR_DIMENSION_MISMATCH_{png.name}")
    require(ImageChops.difference(actual, expected).getbbox() is None,
            f"HOLD_PNG_NOT_IDENTICAL_TO_FINAL_PDF_{png.name}")
    return {"file": png.name, "sha256": hashlib.sha256(png.read_bytes()).hexdigest(),
            "bytes": png.stat().st_size, "width": actual.width,
            "height": actual.height, "note_bottom_margin_px": round(actual.height - note_bottom, 2)}

def check(pdf: Path, pngs: Sequence[Path], extra: bool, date: str | None):
    require(pdf.exists(), "HOLD_PDF_MISSING")
    with fitz.open(pdf) as doc:
        require(len(pngs) == (1 if extra else 4), "HOLD_PNG_COUNT")
        crops = check_pdf(doc, extra, date)
        if not extra:
            for name, label in zip(pngs, LABELS):
                require(label in name.name, f"HOLD_PNG_WRONG_SITE_ORDER_{name.name}")
        images = [image_matches_vector(page, clip, png, note)
                  for page, (clip, note), png in zip(doc, crops, pngs)]
        return {"status": "PASS", "pdf": pdf.name,
                "pdf_pages": len(doc), "pdf_sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
                "pngs": images, "scope": "DOCUMENT_CONTENT_AND_VECTOR_VISUAL_ONLY",
                "upstream_data_and_gateway_line": "NOT_VERIFIED_BY_THIS_TOOL"}

def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--pdf", type=Path, required=True)
    p.add_argument("--png", type=Path, nargs="+", required=True)
    p.add_argument("--extra-sabaidee", action="store_true")
    p.add_argument("--date", help="Report date DD/MM/YYYY, if specified")
    args = p.parse_args(argv)
    try:
        print(json.dumps(check(args.pdf, args.png, args.extra_sabaidee, args.date), ensure_ascii=False))
    except (QaHold, ValueError, OSError, fitz.FileDataError) as err:
        print(json.dumps({"status": "HOLD", "reason": str(err)}, ensure_ascii=False))
        return 2
    return 0

if __name__ == "__main__":
    sys.exit(main())
