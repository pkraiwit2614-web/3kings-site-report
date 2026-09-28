alter table public.condo_room_status
  add column if not exists defect_detail text;

comment on column public.condo_room_status.defect_detail is
  'Current defect/work detail shown in the Above Condo defect report.';

update public.condo_room_status as c
set defect_detail = v.defect_detail
from (values
  ('A417','ไม่มีตัวรองด้านในฝาปิด/ข้อต่อใต้เคาน์เตอร์อ่าง'),
  ('B102','งานเปลี่ยนอุปกรณ์อ่างล้างหน้า (จาก LINE)'),
  ('A716','ไม่มีโต๊ะวางโทรศัพท์'),
  ('B614','ผู้รับเหมาเข้าเก็บงาน B614-B615'),
  ('B615','ผู้รับเหมาเข้าเก็บงาน B614-B615'),
  ('A501','ไฟสถานะเปิด/ปิดประตูแตก'),
  ('A202','สวิตช์/หน้ากากลอก + จุดกั้นกระจก/ผนัง'),
  ('A624','แอร์ขึ้น Code F3'),
  ('B212','หลาย Trade: รอยแตก, Master Switch, ฝาปิด, สีระเบียง, ประตู, ฝ้า, Cleaning ฯลฯ'),
  ('B214','หลาย Trade: Cleaning/สี, ประตู, ฝ้าคราบน้ำ, รอยน้ำรั่ว, Silicone, RCU ฯลฯ'),
  ('A211','หลาย Trade: AC, Electrical, Finishing, Service opening, ตาแมว, Drain cover ฯลฯ'),
  ('A626','น้ำหยดใต้อ่างล้างหน้า ห้องน้ำแขก'),
  ('A313','น้ำหยดใต้อ่างล้างหน้า'),
  ('A314','ปิดช่อง Service + น้ำหยดใต้อ่างล้างหน้า'),
  ('A326','ขอบหน้ากากติดสี 2 จุด + อีก 1 จุดต้อง Verify จากภาพ'),
  ('A410','ยาแนว / กระเบื้องแตก / ไม่มีลิ้นกันกลิ่น 2 จุด'),
  ('A412','ไม่มีลิ้นกันกลิ่น + เอาถุงครอบออก'),
  ('A616','ไม่มีลิ้นกันกลิ่น + Cleaning + เก็บสี + เอาถุงครอบออก'),
  ('A212','ยังไม่ทราบรายการค้าง')
) as v(room_no, defect_detail)
where c.room_no = v.room_no;
