#!/usr/bin/env python3
"""SOP 09 v1.3 Fast-Track, isolated Drive-only prototype. Dry-run by default."""
import argparse
import datetime as dt
import io
import json
import os
import re
from collections import Counter

CAMERA = re.compile(r"^(?:IMG|DSC|PXL|DCIM|DSCF|IMAGE|PHOTO)[_-]?\\d+", re.I)
DAY = re.compile(r"^\\d{8}$")
IMAGE = {"image/jpeg", "image/png"}
SOP_TITLE = "SOP_09_Progress_Photo_Mapping_v1.3_FastTrack_2026-10-20"


def source_day(name):
    if not DAY.fullmatch(name):
        return None
    try:
        return dt.datetime.strptime(name, "%d%m%Y").date()
    except ValueError:
        return None


def candidate(name):
    return bool(CAMERA.match(name)) and name.lower().endswith((".jpg", ".jpeg", ".png"))


def safe_name(name, extension):
    if not name or len(name) > 180 or any(x in name for x in ("/", "\\", "\n", "\r")):
        return False
    return name.lower().endswith(extension.lower()) and not candidate(name)


def capture_date_ok(data, folder_date):
    """The dated folder is primary; reject contradicted EXIF capture day."""
    from PIL import Image
    try:
        with Image.open(io.BytesIO(data)) as im:
            exif = im.getexif()
            value = exif.get(36867)
            if not value and hasattr(exif, "get_ifd"):
                value = exif.get_ifd(34665).get(36867)
            if not value:
                return True
            actual = dt.datetime.strptime(str(value)[:10], "%Y:%m:%d").date()
            return actual == folder_date
    except (OSError, ValueError, TypeError):
        return False


def image_features(data):
    import cv2
    import numpy as np
    a = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if a is None:
        return None
    h, w = a.shape
    a = cv2.resize(a, (int(w * min(1, 1200 / max(w, h))), int(h * min(1, 1200 / max(w, h)))))
    detector = cv2.ORB_create(nfeatures=1300, fastThreshold=12)
    kp, desc = detector.detectAndCompute(a, None)
    return (kp, desc, a.shape) if desc is not None and len(kp) >= 50 else None


def match_score(src, ref):
    """Conservative geometric prefilter; NOT a substitute for semantic viewpoint QA."""
    import cv2
    import numpy as np
    if src is None or ref is None:
        return 0.0
    k1, d1, sh1 = src
    k2, d2, sh2 = ref
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(d1, d2, k=2)
    good = [p for p in pairs if len(p) == 2 for a, b in [p] if a.distance < 0.68 * b.distance]
    if len(good) < 45:
        return 0.0
    pts1 = np.float32([k1[m.queryIdx].pt for m in good])
    pts2 = np.float32([k2[m.trainIdx].pt for m in good])
    mat, mask = cv2.findHomography(pts1, pts2, cv2.RANSAC, 3.5)
    if mat is None or mask is None:
        return 0.0
    support = mask.ravel().astype(bool)
    inliers = int(support.sum())
    ratio = inliers / len(good)
    if inliers < 42 or ratio < 0.72:
        return 0.0
    stable = pts2[support]
    width = (float(stable[:, 0].max() - stable[:, 0].min()) / sh2[1])
    height = (float(stable[:, 1].max() - stable[:, 1].min()) / sh2[0])
    if width < .38 or height < .38:
        return 0.0
    return round(.5 * ratio + .5 * min(inliers / 100, 1), 4)


def choose_match(candidates, minimum=.83, margin=.16):
    """A unique unambiguous label is required; close competing labels mean REVIEW."""
    ranked = sorted(candidates, key=lambda p: p["score"], reverse=True)
    if not ranked or ranked[0]["score"] < minimum:
        return None
    winner = ranked[0]
    rival = next((x for x in ranked[1:] if x["name"] != winner["name"]), None)
    if rival and winner["score"] - rival["score"] < margin:
        return None
    return winner


def list_children(drive, parent):
    token = None
    while True:
        args = dict(q=f"'{parent}' in parents and trashed=false",
                    fields="nextPageToken,files(id,name,mimeType,parents,size,md5Checksum,webViewLink)",
                    pageSize=1000, supportsAllDrives=True, includeItemsFromAllDrives=True)
        if token:
            args["pageToken"] = token
        response = drive.files().list(**args).execute()
        yield from response.get("files", [])
        token = response.get("nextPageToken")
        if not token:
            break


def get_bytes(drive, item_id):
    return drive.files().get_media(fileId=item_id, supportsAllDrives=True).execute()


def verify_live_sop(sheets, docs, index_id, sop_id):
    rows = sheets.spreadsheets().values().get(
        spreadsheetId=index_id, range="'SOP_INDEX'!B10:H10").execute().get("values", [])
    if len(rows) != 1 or len(rows[0]) < 7:
        raise RuntimeError("SOP INDEX row unavailable")
    r = rows[0]
    if r[0] != "จัดรูป Progress" or sop_id not in r[5] or "v1.3" not in r[6]:
        raise RuntimeError("SOP 09 INDEX is not v1.3")
    doc = docs.documents().get(documentId=sop_id, includeTabsContent=True).execute()
    if SOP_TITLE != doc.get("title"):
        raise RuntimeError("SOP document title mismatch")
    body = json.dumps(doc, ensure_ascii=False)
    if "Fast-Track" not in body or "20/10/2026" not in body:
        raise RuntimeError("SOP 09 full document not verified")
    return True


def create_audit(drive, folder, data):
    from googleapiclient.http import MediaIoBaseUpload
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode()
    media = MediaIoBaseUpload(io.BytesIO(payload), mimetype="application/json", resumable=False)
    created = drive.files().create(
        body={"name": "photo-rename-audit-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json",
              "parents": [folder]}, media_body=media, fields="id", supportsAllDrives=True).execute()
    return created["id"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Requires additional verified production gates")
    ap.add_argument("--max-days", type=int, default=4, help="Days with camera-name candidates per plot; 0 = all")
    args = ap.parse_args()
    if args.max_days < 0:
        ap.error("max-days must be >= 0")
    required = ["PHOTO_SA_JSON", "PHOTO_PLOT_FOLDERS_JSON", "PHOTO_SOP_INDEX_ID", "PHOTO_SOP_DOC_ID"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        raise SystemExit("Missing configuration: " + ", ".join(missing))
    if args.apply:
        for k in ["PHOTO_ENABLE_WRITE", "PHOTO_WEB_PARSER_VERIFIED", "PHOTO_AUDIT_FOLDER_ID"]:
            if not os.getenv(k) or (k != "PHOTO_AUDIT_FOLDER_ID" and os.getenv(k) != "YES"):
                raise SystemExit("Write gate missing: " + k)
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    cred = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["PHOTO_SA_JSON"]),
        scopes=["https://www.googleapis.com/auth/drive",
                "https://www.googleapis.com/auth/spreadsheets.readonly",
                "https://www.googleapis.com/auth/documents.readonly"])
    drive = build("drive", "v3", credentials=cred, cache_discovery=False)
    sheets = build("sheets", "v4", credentials=cred, cache_discovery=False)
    docs = build("docs", "v1", credentials=cred, cache_discovery=False)
    verify_live_sop(sheets, docs, os.environ["PHOTO_SOP_INDEX_ID"], os.environ["PHOTO_SOP_DOC_ID"])
    folders = json.loads(os.environ["PHOTO_PLOT_FOLDERS_JSON"])
    if set(folders) != {"6", "7", "8", "9"}:
        raise SystemExit("Expected exactly Plot 6,7,8,9")
    audit = []
    tally = Counter()
    for plot, root in folders.items():
        days = [(source_day(f["name"]), f) for f in list_children(drive, root)
                if f["mimeType"] == "application/vnd.google-apps.folder" and source_day(f["name"])]
        days.sort(key=lambda p: p[0], reverse=True)
        inventory = []
        for day, folder in days:
            photos = [f for f in list_children(drive, folder["id"]) if f["mimeType"] in IMAGE]
            candidates = [p for p in photos if candidate(p["name"])]
            inventory.append((day, folder, photos, candidates))
        targets = [p for p in inventory if p[3]][:args.max_days or None]
        reference = [(day, p) for day, folder, photos, cs in inventory for p in photos
                     if not candidate(p["name"]) and safe_name(p["name"], os.path.splitext(p["name"])[1])]
        cache = {}
        def feat(file_id):
            if file_id not in cache:
                cache[file_id] = image_features(get_bytes(drive, file_id))
            return cache[file_id]
        for day, folder, photos, pending in targets:
            names = {p["name"].casefold() for p in photos}
            for src in pending:
                tally["candidate"] += 1
                proposed = []
                raw = get_bytes(drive, src["id"])
                if not capture_date_ok(raw, day):
                    tally["REVIEW"] += 1
                    continue
                src_feat = image_features(raw)
                for ref_date, ref in sorted(reference, key=lambda x: abs((day-x[0]).days))[:65]:
                    if os.path.splitext(ref["name"])[1].lower() != os.path.splitext(src["name"])[1].lower():
                        continue
                    score = match_score(src_feat, feat(ref["id"]))
                    if score:
                        proposed.append({"id": ref["id"], "name": ref["name"], "score": score})
                best = choose_match(proposed)
                if not best or best["name"].casefold() in names:
                    tally["REVIEW"] += 1
                    continue
                record = {"plot": plot, "day": day.isoformat(), "file_id": src["id"],
                          "folder_id": folder["id"], "old": src["name"],
                          "new": best["name"], "reference_id": best["id"],
                          "score": best["score"], "status": "DRY_RUN"}
                audit.append(record)
                names.add(best["name"].casefold())
                tally["proposed"] += 1
    if args.apply and audit:
        audit_id = create_audit(drive, os.environ["PHOTO_AUDIT_FOLDER_ID"], audit)
        for row in audit:
            try:
                before = drive.files().get(fileId=row["file_id"], fields="id,name,parents,mimeType,size,md5Checksum", supportsAllDrives=True).execute()
                if before["name"] != row["old"] or row["folder_id"] not in before.get("parents", []):
                    row["status"] = "REVIEW_CHANGED"
                    tally["REVIEW"] += 1
                    continue
                drive.files().update(fileId=row["file_id"], body={"name": row["new"]},
                    fields="id,name", supportsAllDrives=True).execute()
                after = drive.files().get(fileId=row["file_id"], fields="id,name,parents,mimeType,size,md5Checksum", supportsAllDrives=True).execute()
                if any(after.get(k) != before.get(k) for k in ("id", "parents", "mimeType", "size", "md5Checksum")) or after["name"] != row["new"]:
                    row["status"] = "FAIL_READBACK"
                    tally["FAIL"] += 1
                else:
                    row["status"] = "PASS"
                    tally["PASS"] += 1
            except Exception:
                row["status"] = "FAIL_API"
                tally["FAIL"] += 1
        from googleapiclient.http import MediaIoBaseUpload
        payload = json.dumps(audit, ensure_ascii=False, indent=2).encode()
        drive.files().update(fileId=audit_id, media_body=MediaIoBaseUpload(io.BytesIO(payload),
            mimetype="application/json"), supportsAllDrives=True).execute()
    print(json.dumps({"mode": "APPLY" if args.apply else "DRY_RUN",
                      "counts": dict(tally), "web_qa": "UNTESTED",
                      "audit": "PRIVATE_DRIVE" if args.apply and audit else "NOT_PERSISTED"},
                     ensure_ascii=False))
    if tally["FAIL"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
