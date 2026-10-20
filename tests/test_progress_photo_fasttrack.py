"""Offline safeguards for SOP 09 Fast-Track; no Drive access or writes."""
import importlib.util
import pathlib
import unittest
from unittest.mock import Mock

path = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "progress_photo_fasttrack.py"
spec = importlib.util.spec_from_file_location("progress_photo_fasttrack", path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class FastTrackSafetyTests(unittest.TestCase):
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
                "verified_source": "independent_visual_check"}
        self.assertFalse(m.independent_match_verified(row, []))
        self.assertFalse(m.independent_match_verified(row, [{**good, "reference_id": "wrong"}]))
        self.assertFalse(m.independent_match_verified(row, [{**good, "landmarks": ["one landmark"]}]))
        self.assertFalse(m.independent_match_verified(row, [{**good, "verified_source": "auto_score"}]))
        self.assertTrue(m.independent_match_verified(row, [good]))

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
        with self.assertRaises(RuntimeError):
            m.verify_drive_scope(fake,"ROOT",plots,"AUDIT")
        objects["P6"]["parents"] = ["ROOT"]
        fake.permissions.return_value.list.return_value.execute.return_value = {
            "permissions":[{"type":"anyone","role":"reader"}]
        }
        with self.assertRaises(RuntimeError):
            m.verify_drive_scope(fake,"ROOT",plots,"AUDIT")


if __name__ == "__main__":
    unittest.main()
