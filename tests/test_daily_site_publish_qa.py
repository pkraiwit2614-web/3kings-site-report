"""Isolated publisher document-gate regressions; no Google/LINE credentials needed."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

import fitz
from PIL import Image, ImageChops

MOD=Path(__file__).resolve().parent.parent/'scripts'/'daily-site-publish-qa.py'
spec=importlib.util.spec_from_file_location('daily_site_publish_qa',MOD)
qa=importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

class DailySitePublishQaTests(unittest.TestCase):
    def test_missing_signature_holds_before_any_delivery(self):
        doc=fitz.open();doc.new_page(width=841.89,height=595.28)
        with self.assertRaisesRegex(qa.QaHold,'HOLD_PDF_PAGE_COUNT'):
            qa.check_pdf(doc,False,'19/11/2026')
        with self.assertRaisesRegex(qa.QaHold,'HOLD_PDF_MISSING_ผู้จัดทำ'):
            qa.check_pdf(doc,True,None)
        doc.close()

    def test_exact_pdf_pixel_match_and_modified_png_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            pdf=fitz.open();p=pdf.new_page(width=841.89,height=595.28)
            clip=fitz.Rect(70,70,770,320)
            notes=fitz.Rect(70,290,770,316)
            p.draw_rect(notes,color=(.8,.8,.8),fill=(.96,.98,.98))
            scale=qa.WIDTH/clip.width
            pix=p.get_pixmap(matrix=fitz.Matrix(scale,scale),clip=clip,alpha=False)
            img=Image.frombytes('RGB',(pix.width,pix.height),pix.samples).crop((0,0,qa.WIDTH,pix.height))
            png=Path(d)/'sample.png';img.save(png)
            self.assertEqual(qa.image_matches_vector(p,clip,png,notes)['width'],qa.WIDTH)
            img.putpixel((110,110),(0,0,0));img.save(png)
            with self.assertRaisesRegex(qa.QaHold,'HOLD_PNG_NOT_IDENTICAL_TO_FINAL_PDF'):
                qa.image_matches_vector(p,clip,png,notes)
            pdf.close()

    def test_border_crop_cut_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            doc=fitz.open();page=doc.new_page(width=841.89,height=595.28)
            clip=fitz.Rect(70,70,770,320)
            bad_notes=fitz.Rect(70,290,770,319.8)
            scale=qa.WIDTH/clip.width
            pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),clip=clip,alpha=False)
            png=Path(d)/'sample.png';Image.frombytes('RGB',(pix.width,pix.height),pix.samples).crop((0,0,qa.WIDTH,pix.height)).save(png)
            with self.assertRaisesRegex(qa.QaHold,'HOLD_PNG_REMARKS_BORDER_CROPPED'):
                qa.image_matches_vector(page,clip,png,bad_notes)
            doc.close()

if __name__=='__main__': unittest.main()
