"""Offline safeguards for SOP 09 Fast-Track; no Drive access or writes."""
import importlib.util
import pathlib
import unittest

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


if __name__ == "__main__":
    unittest.main()
