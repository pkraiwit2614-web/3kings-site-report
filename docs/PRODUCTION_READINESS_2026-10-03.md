# ตรวจความพร้อมใช้งานจริง — 3 ตุลาคม 2026 รอบเพิ่มเติม

สถานะ: แก้ข้อบกพร่องที่ยืนยันได้แล้ว แต่ยังไม่รับรองความพร้อมทุกเส้นทาง 100% เพราะ browser ทดสอบไม่มี session ผู้ใช้จริง (เปิด production แล้วถูกส่งไป /login) การทดสอบฐานข้อมูลด้านล่างเป็นการใช้ role authenticated ภายใน transaction และ rollback ไม่ใช่การล็อกอินผ่านหน้าเว็บ

## ปัญหาและแพตช์เฉพาะจุด

| จุด | หลักฐาน / ปัญหา | การแก้และการจำกัดผลกระทบ |
|---|---|---|
| `components/AppShell.tsx` | เดิมไม่ตรวจ error ของ profiles จึงตีความ DB ล่มเป็นบัญชี inactive และ sign out; ไม่มี timeout/cancellation | แยกข้อผิดพลาดออกจากการปิดบัญชี, timeout 15 วินาที, ปุ่มลองใหม่, ยกเลิกผลหลัง unmount; ยังปิดกั้น children จนผ่านการตรวจสิทธิ์ และคงเมนู/role mapping เดิม |
| `app/page.tsx` | คำตอบ snapshot ของวันเก่าอาจทับวันใหม่; error ถูกแสดงเป็นข้อมูลว่าง | ยกเลิก request เก่า, ตรวจ error, retry เฉพาะ snapshot; ไม่เปลี่ยนสูตร KPI หรือ query live dashboard |
| `components/SitePhotosGallery.tsx` | 180 รูปล่าสุดรวมทุกโครงการไม่รวม Condo A (มี 7 รูป) และ Mirage (มี 5 รูป) | อ่าน view รูปล่าสุดต่อโครงการใน batch เดียว; ข้อมูลจริงคืน 6 โครงการ; คง URL โฟลเดอร์และการ์ดเดิม, แจ้ง error พร้อม retry แทนการอ้างว่าไม่มีรูป |
| RLS 5 ตาราง | role authenticated ที่ไม่มี active profile อ่าน photo index 2,023 แถวและ snapshots 3,614 แถวได้ | ใช้ `(SELECT private.is_active_user())` กับ SELECT policy เท่านั้น; ไม่แก้ write policy, business rows, signature/key ของ sync RPC |
| `app/api/drive-photo/route.ts` | 3 upstream × timeout 9 วินาที เกิน maxDuration 15 วินาทีได้ก่อนถึง fallback | deadline รวม 11 วินาทีและแต่ละแหล่ง 3.5 วินาที; คงลำดับแหล่งภาพ, response, cache และ placeholder เดิม |
| archive callback / retry | JSON `null` ทำให้เข้าถึง property แล้ว throw; network rejection ไม่มี controlled response | reject null/array ด้วย 400; catch exception เป็น JSON 503; คงเงื่อนไขตรวจ key, ownership และ success payload เดิม |

Migration: `supabase/migrations/20261003151558_readiness_active_access_gallery.sql` ใช้ version ตรงกับฐานข้อมูลจริง

ตัวอย่าง query ใหม่:

```sql
CREATE VIEW public.v_latest_site_photos WITH (security_invoker = true) AS
SELECT DISTINCT ON (project_id)
  project_id, drive_file_id, drive_folder_id, drive_folder_name, photo_date, file_name
FROM public.drive_photo_index
WHERE is_active = true
ORDER BY project_id, photo_date DESC, indexed_at DESC, id DESC;
```

ป้องกันผลกระทบ: เพิ่ม view สำหรับแกลเลอรีโดยเฉพาะ ไม่แทนที่ตารางหรือเปลี่ยน photo mapping; `security_invoker` ใช้ RLS ของผู้เรียก และ grant เฉพาะ SELECT ให้ authenticated ไม่เปิดข้อมูลแก่ anon

ตัวอย่าง guard การอ่านสิทธิ์:

```ts
if (profileError) throw profileError
if (!profile?.active) {
  await supabase.auth.signOut()
  // Redirect only while this effect remains active.
  return
}
```

ป้องกันผลกระทบ: แยกเครือข่ายล้มเหลวจากการถูกปิดบัญชีจริง ไม่ปล่อยให้ผู้ใช้ผ่านเมื่อยังยืนยันสิทธิ์ไม่ได้ และไม่ลบ session ที่ยังใช้งานได้เพราะ DB ล่มชั่วคราว โค้ดเต็มรวม redirect/cancellation อยู่ใน AppShell

## ผลตรวจและทดสอบ

- `node tests/stability.test.cjs`: 20/20 ผ่าน รวม 11 กรณีเดิมและ 9 กรณีเพิ่มเติม
- TypeScript: `npx tsc --noEmit` ผ่าน
- Production build: ผ่าน 30 static pages ก่อนการเพิ่ม null/catch guards; CI ต้องยืนยัน build ของ commit สุดท้ายอีกครั้ง
- ทดสอบฐานข้อมูลจริงภายใน transaction แล้ว rollback:
  - ส่งรายงานด้วย submission key เดิมสองครั้งได้ report id เดิมและ item เดียว
  - แก้รายงานด้วย UUID ผิดรูปแบบถูกปฏิเสธ; report/items/revision เดิมยังคงครบ
  - แก้รายงานสำเร็จเพิ่ม revision เป็น 2 และมี historical snapshot 1 รายการ
  - viewer ส่งรายงานถูกปฏิเสธด้วย `report_write_forbidden` แต่ยังอ่านแกลเลอรีได้ 6 โครงการ
  - หลัง RLS patch, authenticated ที่ไม่มี active profile อ่าน 5 ตารางและ view ใหม่ได้ 0 แถว
  - active manager ยังอ่านได้: photos 2,023, snapshots 3,614, sync runs 1,718, AI scores 830, feedback 31; gallery 6
- Query plan ของ latest-per-project ใช้ `drive_photo_index_project_date_idx` ที่มีอยู่แล้ว; ตัวอย่างหนึ่งครั้ง execution ~9.9 ms, ไม่มี temp spill จึงไม่เพิ่ม index ซ้ำ ตัวเลขนี้ไม่ใช่ benchmark ภายใต้โหลดพร้อมกัน
- ตรวจ trigger profiles แล้วพบ `private.enforce_profile_privilege_changes` ป้องกันการเปลี่ยน role/active โดยผู้ไม่มีสิทธิ์และป้องกันแก้สิทธิ์ตัวเอง
- RPC submit/revision ใช้ static SQL, ตรวจ auth/active/write role/ownership, มี transaction semantics และ idempotency ตามผลทดสอบ
- ตรวจจุด innerHTML ที่ค้นพบ: template ที่อ่านเป็นค่าคงที่; ไม่พบหลักฐานว่าต้องเพิ่ม HTML sanitizer ทั้งแอป ไม่ถือเป็นการรับรอง XSS ทุกเส้นทาง
- ไม่แก้ Google Drive workbook หรือ business records และไม่สร้างบัญชีทดสอบถาวร

## ส่วนที่ยังต้องยืนยันก่อนรับรองเปิดใช้งานเต็มรูปแบบ

1. Browser หลังล็อกอินจริง: navigation ทุกเมนู, mobile, กรอก/แก้รายงาน, download/print/presentation และ role-specific controls ต้องทำใน session ที่เจ้าของอนุญาตผ่านช่องทาง sign-in ปลอดภัย ไม่ส่งรหัสผ่านในแชต
2. Upload รูปจริงครบเส้นทาง staging → n8n → Drive → callback → cleanup ยังไม่ได้ทดสอบ end-to-end รอบนี้ ไม่มีหลักฐานให้รับรองว่าผ่านทั้งหมด
3. การกู้คืนจาก backup/PITR และ load test ผู้ใช้พร้อมกันยังไม่ผ่านการซ้อม ไม่ควรอ้างว่าทน outage หรือปริมาณงานได้ทุกระดับ
4. Supabase leaked-password protection และคำเตือน advisor ที่เหลือจากรอบก่อนยังไม่ได้ปิดทั้งหมด; ไม่เปลี่ยนแพ็กเกจหรือ auth settings โดยเดาสถานะ
5. API อื่นและ legacy UI บางส่วนยังมี error handling ไม่สม่ำเสมอ; รอบนี้แก้เฉพาะจุดที่มีหลักฐานและทดสอบ ไม่ใช่การเขียนระบบใหม่ทั้งหมด

## การย้อนกลับ

- โค้ด: revert commit รอบนี้แล้วให้ Vercel deploy ตามปกติ
- view ใหม่ปล่อยไว้ได้ขณะ rollback frontend เพราะไม่มี consumer เก่าพึ่งพา; อย่าลบก่อน frontend เปลี่ยนกลับ
- RLS tightening ควรคงไว้ หากมี worker ล้มเหลวให้ตรวจ identity/role ของ worker ก่อน ไม่ควรเปิดสิทธิ์อ่านแก่บัญชี inactive เพื่อแก้อาการ
- ไม่มี data migration ที่ลบหรือเปลี่ยน business rows
