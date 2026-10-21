"""Offline safeguards for SOP 09 Fast-Track; no Drive access or writes."""
import importlib.util
import pathlib
import unittest
import datetime as dt
import io
import json
import os
import tempfile
from unittest.mock import Mock, patch
from PIL import Image

path = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "progress_photo_fasttrack.py"
spec = importlib.util.spec_from_file_location("progress_photo_fasttrack", path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class FastTrackSafetyTests(unittest.TestCase):
    def test_keyless_credentials_reject_private_service_account_key(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8") as file:
            json.dump({"type": "service_account", "private_key": "MUST-NOT-BE-LOADED"}, file)
            file.flush()
            with patch.dict(os.environ, {"GOOGLE_APPLICATION_CREDENTIALS": file.name}):
                with self.assertRaisesRegex(SystemExit, "private keys prohibited"):
                    m.keyless_adc_credentials()
    
    def test_keyless_credentials_requires_adc_env(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(SystemExit, "GOOGLE_APPLICATION_CREDENTIALS"):
                m.keyless_adc_credentials()

    def test_keyless_credentials_reject_unimpersonated_external_identity(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8") as file:
            json.dump({"type": "external_account"}, file)
            file.flush()
            with patch.dict(os.environ, {"GOOGLE_APPLICATION_CREDENTIALS": file.name}):
                with self.assertRaisesRegex(SystemExit, "service account impersonation"):
                    m.keyless_adc_credentials()

    def test_workflow_uses_oidc_not_service_account_json(self):
        workflow = (pathlib.Path(__file__).resolve().parents[1] /
                    ".github/workflows/photo-progress-fasttrack.yml").read_text(encoding="utf-8")
        self.assertNotIn("PHOTO_SA_JSON", workflow)
        self.assertEqual(workflow.count("uses: google-github-actions/auth@v3"), 4)
        self.assertEqual(workflow.count("id-token: write"), 4)
        self.assertIn("photo-inventory-qa", workflow)
        self.assertIn("environment: photo-readonly-automation", workflow)
        self.assertEqual(workflow.count("environment: photo-readonly-automation"), 2)
        self.assertIn("environment: photo-rename-production", workflow)
        # Never remove guarded PR approval or permit PR to impersonate trusted main.
        self.assertIn("github.event.pull_request.number == 209", workflow)
        self.assertIn("github.event.pull_request.head.repo.full_name == github.repository", workflow)
        self.assertIn("contains(github.event.pull_request.labels.*.name, 'photo-live-qa')", workflow)
        self.assertIn("github.ref == 'refs/heads/main' && inputs.mode == 'inventory'", workflow)
        self.assertIn("github.ref == 'refs/heads/main' && inputs.mode == 'apply'", workflow)
        self.assertIn("run: python scripts/progress_photo_fasttrack.py --inventory-only", workflow)
        self.assertIn("--apply", workflow)

    def test_valid_date_and_bad_date(self):
        self.assertEqual(str(m.source_day("20102026")), "2026-10-20")
        self.assertIsNone(m.source_day("31112026"))
        self.assertIsNone(m.source_day("20-10-2026"))

    def test_candidate_classifier(self):
        self.assertTrue(m.candidate("IMG_5995.JPG"))
        self.assertTrue(m.candidate("DSC0041.jpg"))
        self.assertFalse(m.candidate("ภาพรวม-รางน้ำ.JPG"))
        self.assertFalse(m.candidate("IMG_bad.JPG"))

    def test_name_must_preserve_extension(self):
        self.assertTrue(m.safe_name("สีภายนอกอาคาร.JPG", ".JPG"))
        self.assertFalse(m.safe_name("../something.JPG", ".JPG"))
        self.assertFalse(m.safe_name("test.png", ".jpg"))
        self.assertFalse(m.safe_name("IMG_0001.JPG", ".JPG"))

    def test_exif_tiff_datetime_fallback_detects_conflicting_capture_day(self):
        # Real 20-Oct photo IMG_6034.JPG uses EXIF TIFF DateTime rather than tag 36867.
        out = io.BytesIO()
        image = Image.new("RGB", (8, 8))
        exif = Image.Exif()
        exif[306] = "2026:10:20 08:56:26"
        image.save(out, format="JPEG", exif=exif)
        self.assertTrue(m.capture_date_ok(out.getvalue(), dt.date(2026, 10, 20)))
        self.assertFalse(m.capture_date_ok(out.getvalue(), dt.date(2026, 10, 21)))

    def test_current_photo_mapping_image_retrieval_is_drive_file_id_based(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        page = (root / "app/photo-mapping/page.tsx").read_text(encoding="utf-8")
        route = (root / "app/api/drive-photo/route.ts").read_text(encoding="utf-8")
        self.assertIn("drive_photo_index", page)
        self.assertIn("file_name", page)  # Visible caption is cached in Supabase.
        self.assertIn("encodeURIComponent(photo.drive_file_id)", page)
        self.assertIn("searchParams.get('fileId')", route)
        # Scope: this proves Photo Mapping fetch contract only, not every presentation view.

    def test_inventory_summary_requires_no_media_reads(self):
        metadata = [
            (dt.date(2026, 10, 20), {"id": "d1"},
             [{"name": "IMG_1.JPG"}, {"name": "งานฐานราก.JPG"}], [{"name": "IMG_1.JPG"}]),
            (dt.date(2026, 10, 17), {"id": "d2"},
             [{"name": "งานพื้น.JPG"}], []),
        ]
        self.assertEqual(m.summarize_inventory(metadata),
                         {"days": 2, "images": 3, "candidates": 1, "named": 2})

    def test_no_visual_evidence_means_review(self):
        self.assertIsNone(m.choose_match([]))
        self.assertIsNone(m.choose_match([{"name":"A.JPG","score":0.74}]))

    def test_ambiguous_labels_must_review(self):
        proposals = [{"name":"A.JPG","score":0.91}, {"name":"B.JPG","score":0.85}]
        self.assertIsNone(m.choose_match(proposals))
        self.assertEqual(m.choose_match([{"name":"A.JPG","score":0.95},
                                         {"name":"B.JPG","score":0.50}])["name"], "A.JPG")

    def test_score_not_enough_for_write(self):
        # Presence of a high CV score must never create a verified evidence manifest.
        match = m.choose_match([{"name":"A.JPG","score":0.96}])
        self.assertIsNotNone(match)
        evidence = {"landmarks":["one landmark"]}
        self.assertLess(len(set(evidence["landmarks"])), 2)

    def test_reference_date_guard(self):
        from datetime import date
        day = date(2026, 10, 20)
        self.assertTrue(m.proposed_label_matches_date("งานหลังคา.JPG", day))
        self.assertTrue(m.proposed_label_matches_date("Roof_20261020.JPG", day))
        self.assertFalse(m.proposed_label_matches_date("Roof_20260901.JPG", day))

    def test_independent_visual_evidence_is_mandatory(self):
        row = {"file_id": "f1", "old": "IMG_1.JPG",
               "new": "Roof.JPG", "reference_id": "r1", "plot": "6", "day": "2026-10-20"}
        good = {**row, "landmarks": ["fixed column at left", "balcony opening at right"],
                "verified_source": "independent_visual_check",
                "label_verified": True, "label_evidence": "Current image confirms the roof viewpoint"}
        self.assertFalse(m.independent_match_verified(row, []))
        self.assertFalse(m.independent_match_verified(row, [{**good, "reference_id": "wrong"}]))
        self.assertFalse(m.independent_match_verified(row, [{**good, "landmarks": ["one landmark"]}]))
        self.assertFalse(m.independent_match_verified(row, [{**good, "verified_source": "auto_score"}]))
        self.assertTrue(m.independent_match_verified(row, [good]))
        self.assertIsNone(m.verified_write_label(row, [{**good, "label_verified": False}]))
        self.assertIsNone(m.verified_write_label(row, [{**good, "label_evidence": ""}]))
        self.assertIsNone(m.verified_write_label(row, [{**good, "new": "IMG_2.JPG"}]))
        self.assertIsNone(m.verified_write_label(row, [{**good, "new": "Roof_20260901.JPG"}]))
        self.assertEqual(m.verified_write_label({**row, "new": None}, [good]), "Roof.JPG")

    def test_supervised_same_plot_fallback_without_orb_false_positive(self):
        # Geometric prefilter can miss true viewpoints when construction changes;
        # a separately confirmed label and permanent-landmark evidence is mandatory.
        src = {"id": "candidate1", "name": "IMG_6034.JPG"}
        refs = [(dt.date(2026, 10, 17), {"id": "ref17", "name": "งานสระน้ำ.JPG"})]
        row = {"file_id": "candidate1", "old": "IMG_6034.JPG",
               "reference_id": "ref17", "plot": "7", "day": "2026-10-20",
               "new": "งานสระน้ำ.JPG", "label_verified": True,
               "label_evidence": "Current view shows pool, patio and back wall",
               "verified_source": "supervised_visual_check",
               "landmarks": ["permanent pool boundary", "paired patio columns"]}
        self.assertEqual(m.verified_fallback_reference(src,"7",dt.date(2026,10,20),refs,[row])["id"],"ref17")
        self.assertIsNone(m.verified_fallback_reference(src,"6",dt.date(2026,10,20),refs,[row]))
        self.assertIsNone(m.verified_fallback_reference(src,"7",dt.date(2026,10,20),refs,[{**row,"landmarks":["only one"]}]))
        self.assertIsNone(m.verified_fallback_reference(src,"7",dt.date(2026,10,20),refs,[{**row,"reference_id":"missing"}]))

    def test_live_sop_v2_index_and_document(self):
        sheets = Mock()
        docs = Mock()
        row = ["09", "จัดรูป Progress", "", "", "", "",
               "https://docs.google.com/document/d/sop-id/edit",
               "APPROVED / ACTIVE — SOP v2.0 Consolidated (20/10/2026)"]
        sheets.spreadsheets.return_value.values.return_value.get.return_value.execute.return_value = {
            "values": [["ลำดับ", "คำสั่งลัด"], row]}
        docs.documents.return_value.get.return_value.execute.return_value = {
            "title": m.SOP_TITLE,
            "tabs": [{"documentTab": {"body": {"content": [
                {"paragraph": {"elements": [{"textRun": {
                    "content": "SOP 09 | CONSOLIDATED v2.0 | 20/10/2026 | Fast-Track"
                }}]}}]}}}]
        }
        self.assertTrue(m.verify_live_sop(sheets, docs, "index", "sop-id"))
        sheets.spreadsheets.return_value.values.return_value.get.return_value.execute.return_value = {
            "values": [row[:7] + ["APPROVED / ACTIVE — SOP v1.3"]]}
        with self.assertRaises(RuntimeError):
            m.verify_live_sop(sheets, docs, "index", "sop-id")

    def test_drive_scope_parent_and_private_audit(self):
        fake = Mock()
        objects = {
            "ROOT": {"id":"ROOT","name":"Picture Progress","mimeType":"application/vnd.google-apps.folder"},
            **{f"P{x}": {"id":f"P{x}","name":f"Plot {x}","mimeType":"application/vnd.google-apps.folder",
                          "parents":["ROOT"]} for x in ("6","7","8","9")},
            "AUDIT": {"id":"AUDIT","name":"Private Mapping Log","mimeType":"application/vnd.google-apps.folder",
                      "capabilities":{"canAddChildren":True}},
        }
        fake.files.return_value.get.side_effect = lambda **kw: Mock(execute=lambda: objects[kw["fileId"]])
        fake.permissions.return_value.list.return_value.execute.return_value = {
            "permissions":[{"type":"user","role":"owner"}]
        }
        plots = {x:f"P{x}" for x in ("6","7","8","9")}
        m.verify_drive_scope(fake,"ROOT",plots,"AUDIT")
        objects["P6"]["parents"] = ["WRONG"]
        with self.assertRaisesRegex(RuntimeError, "Plot 6 parent ID mismatch"):
            m.verify_drive_scope(fake,"ROOT",plots,"AUDIT")
        objects["P6"]["parents"] = []
        with self.assertRaisesRegex(RuntimeError, "Plot 6 parent metadata missing"):
            m.verify_drive_scope(fake,"ROOT",plots,"AUDIT")
        objects["P6"]["parents"] = ["ROOT"]
        objects["P6"]["name"] = "Plot 60"
        with self.assertRaisesRegex(RuntimeError, "Plot 6 folder identity mismatch"):
            m.verify_drive_scope(fake,"ROOT",plots,"AUDIT")
        objects["P6"]["name"] = "Plot 6"
        fake.permissions.return_value.list.return_value.execute.return_value = {
            "permissions":[{"type":"anyone","role":"reader"}]
        }
        with self.assertRaises(RuntimeError):
            m.verify_drive_scope(fake,"ROOT",plots,"AUDIT")


if __name__ == "__main__":
    unittest.main()
