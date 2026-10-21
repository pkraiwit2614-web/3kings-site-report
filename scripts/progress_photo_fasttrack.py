#!/usr/bin/env python3
"""SOP 09 v2.0 Fast-Track, isolated Drive-only prototype. Dry-run by default."""
import argparse
import datetime as dt
import io
import json
import os
import re
from collections import Counter

CAMERA = re.compile(r"^(?:IMG|DSC|PXL|DCIM|DSCF|IMAGE|PHOTO)[_-]?\d+", re.I)
DAY = re.compile(r"^\d{8}$")
IMAGE = {"image/jpeg", "image/png"}
SOP_TITLE = "SOP_09_Progress_Photo_Mapping_v2.0_Consolidated_2026-10-20"


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
            # Some real iPhone/JPEG files expose TIFF DateTime (306), not DateTimeOriginal.
            # A conflicting usable EXIF day must be REVIEW, never silently accepted.
            if not value:
                value = exif.get(306)
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


def proposed_label_matches_date(name, target_day):
    """Never copy a reference label that embeds an older capture date."""
    explicit = re.findall(r"(?<!\d)20\d{6}(?!\d)", name)
    return not explicit or all(x == target_day.strftime("%Y%m%d") for x in explicit)


def verified_write_label(row, attestations):
    """Write labels come from reviewed current-image semantics, never stale reference filenames."""
    if not isinstance(attestations, list):
        return None
    keys = ("file_id", "old", "reference_id", "plot", "day")
    for item in attestations:
        if not isinstance(item, dict) or any(item.get(k) != row.get(k) for k in keys):
            continue
        landmarks = item.get("landmarks")
        if not (isinstance(landmarks, list) and
                len({v.strip() for v in landmarks if isinstance(v, str) and len(v.strip()) >= 8}) >= 2 and
                item.get("verified_source") in ("independent_visual_check", "supervised_visual_check")):
            continue
        label = item.get("new")
        evidence = item.get("label_evidence")
        extension = os.path.splitext(row["old"])[1]
        if (item.get("label_verified") is not True or
                not isinstance(evidence, str) or len(evidence.strip()) < 12 or
                not isinstance(label, str) or not safe_name(label, extension) or
                label.casefold() == row["old"].casefold() or
                not proposed_label_matches_date(label, dt.date.fromisoformat(row["day"]))):
            continue
        return label
    return None


def independent_match_verified(row, attestations):
    """Compatibility wrapper, but the output label must be independently verified too."""
    label = verified_write_label(row, attestations)
    return label is not None and label == row.get("new")


def verified_fallback_reference(src, plot, day, references, attestations):
    """Allow a separately attested same-Plot viewpoint when ORB is a false negative."""
    for ref_day, ref in references:
        if ref["id"] == src["id"] or candidate(ref["name"]):
            continue
        row = {"file_id": src["id"], "old": src["name"], "plot": plot,
               "day": day.isoformat(), "reference_id": ref["id"]}
        if verified_write_label(row, attestations):
            return {"id": ref["id"], "name": ref["name"], "score": 0.0}
    return None


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


def summarize_inventory(inventory):
    """Aggregate metadata-only counts; no IDs, filenames, or private photos in CI logs."""
    return {
        "days": len(inventory),
        "images": sum(len(photos) for day, folder, photos, candidates in inventory),
        "candidates": sum(len(candidates) for day, folder, photos, candidates in inventory),
        "named": sum(len(photos) - len(candidates) for day, folder, photos, candidates in inventory),
    }


def get_bytes(drive, item_id):
    return drive.files().get_media(fileId=item_id, supportsAllDrives=True).execute()


def verify_live_sop(sheets, docs, index_id, sop_id):
    """Read the ACTIVE live SOP row and complete linked document; reject stale revisions."""
    rows = sheets.spreadsheets().values().get(
        spreadsheetId=index_id, range="'SOP_INDEX'!A1:J1000").execute().get("values", [])
    matches = [r for r in rows if len(r) > 7 and str(r[0]).zfill(2) == "09"
               and r[1] == "จัดรูป Progress"]
    if len(matches) != 1:
        raise RuntimeError("SOP 09 ACTIVE INDEX row unavailable or ambiguous")
    row = matches[0]
    if (f"/d/{sop_id}/" not in row[6] or
            "APPROVED / ACTIVE" not in row[7] or "v2.0" not in row[7]):
        raise RuntimeError("SOP 09 ACTIVE revision or link mismatch")
    doc = docs.documents().get(documentId=sop_id, includeTabsContent=True).execute()
    if SOP_TITLE != doc.get("title"):
        raise RuntimeError("SOP 09 document title mismatch")
    body = json.dumps(doc, ensure_ascii=False)
    if not all(x in body for x in ("SOP 09", "CONSOLIDATED v2.0", "20/10/2026", "Fast-Track")):
        raise RuntimeError("SOP 09 complete ACTIVE document not verified")
    return True


def create_audit(drive, folder, data):
    from googleapiclient.http import MediaIoBaseUpload
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode()
    media = MediaIoBaseUpload(io.BytesIO(payload), mimetype="application/json", resumable=False)
    created = drive.files().create(
        body={"name": "photo-rename-audit-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json",
              "parents": [folder]}, media_body=media, fields="id", supportsAllDrives=True).execute()
    return created["id"]


def persist_audit(drive, audit_id, data):
    """Checkpoint every processed file; fail closed if private audit cannot be saved."""
    from googleapiclient.http import MediaIoBaseUpload
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode()
    drive.files().update(fileId=audit_id, media_body=MediaIoBaseUpload(
        io.BytesIO(payload), mimetype="application/json", resumable=False),
        supportsAllDrives=True).execute()


def verify_drive_scope(drive, root_id, folders, audit_folder=None):
    """Fail closed if an environment variable points at the wrong Drive tree."""
    fields = "id,name,mimeType,parents,capabilities(canAddChildren)"
    root = drive.files().get(fileId=root_id, fields=fields, supportsAllDrives=True).execute()
    if root.get("name") != "Picture Progress" or root.get("mimeType") != "application/vnd.google-apps.folder":
        raise RuntimeError("Wrong Picture Progress root")
    for plot, folder_id in folders.items():
        folder = drive.files().get(fileId=folder_id, fields=fields, supportsAllDrives=True).execute()
        if folder.get("name") != "Plot " + plot or folder.get("mimeType") != "application/vnd.google-apps.folder":
            # Print only the scoped plot number: never expose raw Drive IDs or private file names in CI.
            raise RuntimeError("Plot " + plot + " folder identity mismatch (name/type)")
        if root_id not in folder.get("parents", []):
            if not folder.get("parents"):
                raise RuntimeError("Plot " + plot + " parent metadata missing or not visible to Service Account")
            raise RuntimeError("Plot " + plot + " parent ID mismatch")
    if audit_folder:
        target = drive.files().get(fileId=audit_folder, fields=fields, supportsAllDrives=True).execute()
        if target.get("mimeType") != "application/vnd.google-apps.folder" or not target.get("capabilities", {}).get("canAddChildren"):
            raise RuntimeError("Private audit folder is not writable")
        perms = drive.permissions().list(fileId=audit_folder,
            fields="permissions(type,role)", supportsAllDrives=True).execute().get("permissions", [])
        if not perms or any(p.get("type") in ("anyone", "domain") for p in perms):
            raise RuntimeError("Private audit folder permissions unverified")


def keyless_adc_credentials(apply=False):
    """Use only action-generated external_account ADC; reject stored SA private keys."""
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not path:
        raise SystemExit("Keyless WIF credentials unavailable: GOOGLE_APPLICATION_CREDENTIALS not set")
    try:
        with open(path, encoding="utf-8") as source:
            config = json.load(source)
    except (OSError, ValueError) as err:
        raise SystemExit("Keyless WIF credentials file unavailable or invalid") from err
    url = config.get("service_account_impersonation_url")
    if (config.get("type") != "external_account" or
            not isinstance(url, str) or "/serviceAccounts/" not in url or
            not url.endswith(":generateAccessToken")):
        raise SystemExit("Expected external_account WIF credentials with service account impersonation; private keys prohibited")
    import google.auth
    scopes = [
        "https://www.googleapis.com/auth/drive" if apply
        else "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/documents.readonly",
    ]
    credentials, _ = google.auth.default(scopes=scopes)
    return credentials


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Requires additional verified production gates")
    ap.add_argument("--inventory-only", action="store_true", help="Read SOP and all Plot/day Drive metadata without media downloads or writes")
    ap.add_argument("--max-days", type=int, default=4, help="Days with camera-name candidates per plot; 0 = all")
    ap.add_argument("--max-renames", type=int, default=1, help="Hard cap on reviewed file writes; 1 is the safe acceptance default")
    args = ap.parse_args()
    if args.max_days < 0:
        ap.error("max-days must be >= 0")
    if args.inventory_only and args.apply:
        ap.error("--inventory-only and --apply are mutually exclusive")
    if args.max_renames < 1:
        ap.error("max-renames must be >= 1")
    required = ["PHOTO_PLOT_FOLDERS_JSON", "PHOTO_ROOT_FOLDER_ID", "PHOTO_SOP_INDEX_ID", "PHOTO_SOP_DOC_ID"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        raise SystemExit("Missing configuration: " + ", ".join(missing))
    if args.apply:
        for k in ["PHOTO_ENABLE_WRITE", "PHOTO_WEB_PARSER_VERIFIED", "PHOTO_AUDIT_FOLDER_ID", "PHOTO_VERIFIED_MATCHES_JSON"]:
            if not os.getenv(k) or (k in ("PHOTO_ENABLE_WRITE", "PHOTO_WEB_PARSER_VERIFIED") and os.getenv(k) != "YES"):
                raise SystemExit("Write gate missing: " + k)
    from googleapiclient.discovery import build
    cred = keyless_adc_credentials(apply=args.apply)
    drive = build("drive", "v3", credentials=cred, cache_discovery=False)
    sheets = build("sheets", "v4", credentials=cred, cache_discovery=False)
    docs = build("docs", "v1", credentials=cred, cache_discovery=False)
    verify_live_sop(sheets, docs, os.environ["PHOTO_SOP_INDEX_ID"], os.environ["PHOTO_SOP_DOC_ID"])
    folders = json.loads(os.environ["PHOTO_PLOT_FOLDERS_JSON"])
    if set(folders) != {"6", "7", "8", "9"}:
        raise SystemExit("Expected exactly Plot 6,7,8,9")
    verify_drive_scope(drive, os.environ["PHOTO_ROOT_FOLDER_ID"], folders,
                       os.environ.get("PHOTO_AUDIT_FOLDER_ID") if args.apply else None)
    attested_matches = json.loads(os.environ["PHOTO_VERIFIED_MATCHES_JSON"]) if args.apply else []
    if not isinstance(attested_matches, list):
        raise SystemExit("Verified matches must be a JSON list")
    audit = []
    tally = Counter()
    inventory_reports = {}
    for plot, root in folders.items():
        days = [(source_day(f["name"]), f) for f in list_children(drive, root)
                if f["mimeType"] == "application/vnd.google-apps.folder" and source_day(f["name"])]
        days.sort(key=lambda p: p[0], reverse=True)
        inventory = []
        for day, folder in days:
            photos = [f for f in list_children(drive, folder["id"]) if f["mimeType"] in IMAGE]
            candidates = [p for p in photos if candidate(p["name"])]
            inventory.append((day, folder, photos, candidates))
        if args.inventory_only:
            inventory_reports[plot] = summarize_inventory(inventory)
            continue
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
                if not best and args.apply:
                    best = verified_fallback_reference(src, plot, day, reference, attested_matches)
                if not best:
                    tally["REVIEW"] += 1
                    continue
                record = {"plot": plot, "day": day.isoformat(), "file_id": src["id"],
                          "folder_id": folder["id"], "old": src["name"],
                          "new": None, "reference_name": best["name"], "reference_id": best["id"],
                          "score": best["score"], "status": "PROPOSED_REQUIRES_VERIFICATION"}
                audit.append(record)
                tally["proposed"] += 1
    if args.inventory_only:
        print(json.dumps({"mode": "INVENTORY_READ_ONLY", "plots": inventory_reports,
                          "drive_media_downloads": 0, "renames": 0},
                         ensure_ascii=False))
        return
    if args.apply:
        # A high CV score alone is never authorization to rename.
        manifest = attested_matches
        eligible = []
        reserved = {}
        for item in audit:
            verified_label = verified_write_label(item, manifest)
            if not verified_label:
                tally["REVIEW"] += 1
                continue
            folder_key = item["folder_id"]
            if verified_label.casefold() in reserved.setdefault(folder_key, set()):
                tally["REVIEW"] += 1
                continue
            item["new"] = verified_label
            reserved[folder_key].add(verified_label.casefold())
            eligible.append(item)
        if len(eligible) > args.max_renames:
            raise SystemExit("Write cap exceeded: independently verify a smaller acceptance batch")
        audit = eligible
    if args.apply and audit:
        audit_id = create_audit(drive, os.environ["PHOTO_AUDIT_FOLDER_ID"], audit)
        for row in audit:
            try:
                before = drive.files().get(fileId=row["file_id"], fields="id,name,parents,mimeType,size,md5Checksum", supportsAllDrives=True).execute()
                if before["name"] != row["old"] or row["folder_id"] not in before.get("parents", []):
                    row["status"] = "REVIEW_CHANGED"
                    tally["REVIEW"] += 1
                    continue
                # Repeat collision check at time of write, not just at proposal time.
                sibling_names = [f["name"].casefold() for f in list_children(drive, row["folder_id"])
                                 if f["id"] != row["file_id"]]
                if row["new"].casefold() in sibling_names:
                    row["status"] = "REVIEW_COLLISION"
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
            finally:
                # Durable per-file outcome, including REVIEW; resume never trusts a partial batch.
                persist_audit(drive, audit_id, audit)
    print(json.dumps({"mode": "APPLY" if args.apply else "DRY_RUN",
                      "counts": dict(tally), "web_qa": "UNTESTED",
                      "audit": "PRIVATE_DRIVE" if args.apply and audit else "NOT_PERSISTED"},
                     ensure_ascii=False))
    if tally["FAIL"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
