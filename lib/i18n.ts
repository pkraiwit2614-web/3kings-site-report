export type AppLanguage = 'th' | 'en' | 'ru'

export const LANGUAGE_STORAGE_KEY = '3kings:language'

export const APP_LANGUAGES: Array<{value:AppLanguage;label:string}> = [
  {value:'th',label:'ไทย'},
  {value:'en',label:'English'},
  {value:'ru',label:'Русский'},
]

type TranslationPair = { en:string; ru:string }

const EXACT: Record<string, TranslationPair> = {
  "Dashboard": {
    "en": "Dashboard",
    "ru": "Панель управления"
  },
  "Executive Presentation": {
    "en": "Executive Presentation",
    "ru": "Отчёт для руководства"
  },
  "แผนงานที่กำหนด": {
    "en": "Schedule / Plan",
    "ru": "План-график"
  },
  "Schedule / Plan vs Actual": {
    "en": "Schedule / Plan vs Actual",
    "ru": "План-график / План vs Факт"
  },
  "วัสดุ เครื่องมือและผู้รับเหมา": {
    "en": "Materials, Equipment & Contractors",
    "ru": "Материалы, оборудование и подрядчики"
  },
  "วัสดุ / เครื่องมือ / จัดซื้อจัดจ้าง": {
    "en": "Materials / Equipment / Procurement",
    "ru": "Материалы / оборудование / закупки"
  },
  "Defect Report": {
    "en": "Defect Report",
    "ru": "Отчёт по дефектам"
  },
  "Site Operations": {
    "en": "Site Operations",
    "ru": "Работы на объекте"
  },
  "Labour & Payroll": {
    "en": "Labour & Payroll",
    "ru": "Персонал и расчёт зарплаты"
  },
  "Labour": {
    "en": "Labour",
    "ru": "Персонал"
  },
  "Payroll Verification Record": {
    "en": "Payroll Verification Record",
    "ru": "Проверка расчёта зарплаты"
  },
  "รูปภาพหน้างาน": {
    "en": "Site Photos",
    "ru": "Фото объекта"
  },
  "การจัดซื้อ/จัดจ้าง": {
    "en": "Procurement / Subcontract",
    "ru": "Закупки / подряд"
  },
  "รายงานการทำงานประจำสัปดาห์": {
    "en": "Weekly Work Report",
    "ru": "Еженедельный отчёт"
  },
  "Work Calendar": {
    "en": "Work Calendar",
    "ru": "Календарь работ"
  },
  "Photo Mapping": {
    "en": "Photo Mapping",
    "ru": "Привязка фото"
  },
  "Data Health": {
    "en": "Data Health",
    "ru": "Состояние данных"
  },
  "User & Access": {
    "en": "User & Access",
    "ru": "Пользователи и доступ"
  },
  "Site Report V3.4": {
    "en": "Site Report V3.4",
    "ru": "Site Report V3.4"
  },
  "Site Supervisor": {
    "en": "Site Supervisor",
    "ru": "Руководитель участка"
  },
  "Admin": {
    "en": "Admin",
    "ru": "Администратор"
  },
  "Viewer · ดูข้อมูล": {
    "en": "Viewer · View data",
    "ru": "Viewer · Просмотр данных"
  },
  "Viewer": {
    "en": "Viewer",
    "ru": "Viewer"
  },
  "Defect Contributor": {
    "en": "Defect Contributor",
    "ru": "Исполнитель Defect"
  },
  "User": {
    "en": "User",
    "ru": "Пользователь"
  },
  "ออกจากระบบ": {
    "en": "Sign out",
    "ru": "Выйти"
  },
  "เพิ่มเติม": {
    "en": "More",
    "ru": "Ещё"
  },
  "เมนูเพิ่มเติม": {
    "en": "More menu",
    "ru": "Дополнительное меню"
  },
  "ปิด": {
    "en": "Close",
    "ru": "Закрыть"
  },
  "ปิดเมนูเพิ่มเติม": {
    "en": "Close more menu",
    "ru": "Закрыть дополнительное меню"
  },
  "เมนูหลักบนมือถือ": {
    "en": "Mobile main menu",
    "ru": "Основное мобильное меню"
  },
  "กำลังโหลดระบบ…": {
    "en": "Loading system…",
    "ru": "Загрузка системы…"
  },
  "ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่": {
    "en": "Unable to verify access. Check the connection and try again.",
    "ru": "Не удалось проверить доступ. Проверьте соединение и повторите попытку."
  },
  "ลองใหม่": {
    "en": "Try again",
    "ru": "Повторить"
  },
  "Preview as": {
    "en": "Preview as",
    "ru": "Просмотр как"
  },
  "Actual role": {
    "en": "Actual role",
    "ru": "Фактическая роль"
  },
  "Exit Preview": {
    "en": "Exit Preview",
    "ru": "Выйти из предпросмотра"
  },
  "UI preview only": {
    "en": "UI preview only",
    "ru": "Только предпросмотр интерфейса"
  },
  "Actual access remains": {
    "en": "Actual access remains",
    "ru": "Фактический доступ остаётся"
  },
  "Live Handover / Defect Flow": {
    "en": "Live Handover / Defect Flow",
    "ru": "Текущая приёмка / Defect Flow"
  },
  "Defect navigation": {
    "en": "Defect navigation",
    "ru": "Навигация по дефектам"
  },
  "Site Operations navigation": {
    "en": "Site Operations navigation",
    "ru": "Навигация по работам на объекте"
  },
  "ไทย": {
    "en": "ไทย",
    "ru": "ไทย"
  },
  "English": {
    "en": "English",
    "ru": "English"
  },
  "Русский": {
    "en": "Русский",
    "ru": "Русский"
  },
  "Language": {
    "en": "Language",
    "ru": "Язык"
  },
  "ค้นหา": {
    "en": "Search",
    "ru": "Поиск"
  },
  "ล้าง": {
    "en": "Clear",
    "ru": "Сбросить"
  },
  "ทั้งหมด": {
    "en": "All",
    "ru": "Все"
  },
  "ทุกสถานะ": {
    "en": "All statuses",
    "ru": "Все статусы"
  },
  "สถานะ": {
    "en": "Status",
    "ru": "Статус"
  },
  "โครงการ": {
    "en": "Project",
    "ru": "Проект"
  },
  "Plot": {
    "en": "Plot",
    "ru": "Plot"
  },
  "ผู้ขาย": {
    "en": "Vendor",
    "ru": "Поставщик"
  },
  "ผู้รับเหมา": {
    "en": "Contractor",
    "ru": "Подрядчик"
  },
  "วัสดุ": {
    "en": "Material",
    "ru": "Материал"
  },
  "เครื่องมือ": {
    "en": "Equipment",
    "ru": "Оборудование"
  },
  "งาน": {
    "en": "Work",
    "ru": "Работа"
  },
  "รายละเอียด": {
    "en": "Details",
    "ru": "Детали"
  },
  "หมายเหตุ": {
    "en": "Notes",
    "ru": "Примечание"
  },
  "วันที่": {
    "en": "Date",
    "ru": "Дата"
  },
  "จำนวน": {
    "en": "Quantity",
    "ru": "Количество"
  },
  "หน่วย": {
    "en": "Unit",
    "ru": "Ед."
  },
  "เป้าหมาย": {
    "en": "Target",
    "ru": "Цель"
  },
  "แผน": {
    "en": "Plan",
    "ru": "План"
  },
  "หน้างานจริง": {
    "en": "Actual site",
    "ru": "Факт на объекте"
  },
  "ข้อมูลล่าสุด": {
    "en": "Latest data",
    "ru": "Последние данные"
  },
  "ไม่มีข้อมูล": {
    "en": "No data",
    "ru": "Нет данных"
  },
  "ไม่พบข้อมูล": {
    "en": "No data found",
    "ru": "Данные не найдены"
  },
  "ยังไม่มีข้อมูล": {
    "en": "No data yet",
    "ru": "Данных пока нет"
  },
  "โหลดข้อมูลไม่สำเร็จ": {
    "en": "Failed to load data",
    "ru": "Не удалось загрузить данные"
  },
  "กำลังโหลด…": {
    "en": "Loading…",
    "ru": "Загрузка…"
  },
  "กำลังบันทึก…": {
    "en": "Saving…",
    "ru": "Сохранение…"
  },
  "บันทึก": {
    "en": "Save",
    "ru": "Сохранить"
  },
  "ยกเลิก": {
    "en": "Cancel",
    "ru": "Отмена"
  },
  "ยืนยัน": {
    "en": "Confirm",
    "ru": "Подтвердить"
  },
  "แก้ไข": {
    "en": "Edit",
    "ru": "Изменить"
  },
  "เพิ่ม": {
    "en": "Add",
    "ru": "Добавить"
  },
  "ลบ": {
    "en": "Delete",
    "ru": "Удалить"
  },
  "ย้อนกลับ": {
    "en": "Back",
    "ru": "Назад"
  },
  "ถัดไป": {
    "en": "Next",
    "ru": "Далее"
  },
  "ก่อนหน้า": {
    "en": "Previous",
    "ru": "Назад"
  },
  "เปิดรายละเอียด": {
    "en": "Open details",
    "ru": "Открыть детали"
  },
  "ดูรายละเอียด": {
    "en": "View details",
    "ru": "Подробнее"
  },
  "วันที่พิมพ์": {
    "en": "Printed on",
    "ru": "Дата печати"
  },
  "เงื่อนไขที่ใช้": {
    "en": "Applied filters",
    "ru": "Применённые фильтры"
  },
  "REPORT": {
    "en": "REPORT",
    "ru": "ОТЧЁТ"
  },
  "Print": {
    "en": "Print",
    "ru": "Печать"
  },
  "พิมพ์รายงาน": {
    "en": "Print report",
    "ru": "Печать отчёта"
  },
  "ค้นหาวัสดุ งาน PO ผู้ขาย ผู้รับเหมา รุ่น สถานะ หรือรายละเอียด": {
    "en": "Search material, work, PO, vendor, contractor, model, status or details",
    "ru": "Поиск материала, работ, PO, поставщика, подрядчика, модели, статуса или деталей"
  },
  "ค้นหาวัสดุ / งาน / PO / ผู้ขาย / ผู้รับเหมา / รุ่น / สถานะ / รายละเอียด": {
    "en": "Search material / work / PO / vendor / contractor / model / status / details",
    "ru": "Поиск материала / работ / PO / поставщика / подрядчика / модели / статуса / деталей"
  },
  "ทุกสถานะการสั่งซื้อ": {
    "en": "All order statuses",
    "ru": "Все статусы заказа"
  },
  "สั่งแล้ว": {
    "en": "Ordered",
    "ru": "Заказано"
  },
  "สั่งมาไม่พอ": {
    "en": "Ordered quantity insufficient",
    "ru": "Заказанного количества недостаточно"
  },
  "ยังไม่สั่ง": {
    "en": "Not ordered",
    "ru": "Не заказано"
  },
  "เจ้าของจัดหา": {
    "en": "Owner supplied",
    "ru": "Поставка владельцем"
  },
  "ไม่เกี่ยวข้อง": {
    "en": "Not applicable",
    "ru": "Не применимо"
  },
  "ยังไม่ระบุปริมาณ/หน่วย": {
    "en": "Quantity/unit not specified",
    "ru": "Количество/единица не указаны"
  },
  "ยังไม่ระบุ": {
    "en": "Not specified",
    "ru": "Не указано"
  },
  "ค้นหาเครื่องมือและเครื่องจักร": {
    "en": "Search tools and machinery",
    "ru": "Поиск инструмента и техники"
  },
  "ค้นหารหัส / เครื่องมือ / ยี่ห้อ / รุ่น / ผู้รับผิดชอบ": {
    "en": "Search code / equipment / brand / model / person responsible",
    "ru": "Поиск кода / оборудования / бренда / модели / ответственного"
  },
  "ค้นหาจัดซื้อจัดจ้าง": {
    "en": "Search procurement",
    "ru": "Поиск закупок"
  },
  "ค้นหา วัสดุ / งาน / PO / ผู้ขาย / ผู้รับเหมา / สถานะ": {
    "en": "Search material / work / PO / vendor / contractor / status",
    "ru": "Поиск материала / работ / PO / поставщика / подрядчика / статуса"
  },
  "ไม่ระบุ Plot": {
    "en": "Plot not specified",
    "ru": "Plot не указан"
  },
  "กำหนดส่ง-ของเข้าหน้างาน": {
    "en": "Material Delivery Schedule",
    "ru": "График поставки материалов"
  },
  "ปฏิทินงาน": {
    "en": "Work Schedule",
    "ru": "Календарь работ"
  },
  "รวมแผนงาน หน้างานจริง และกำหนดส่งของจาก Google Calendar": {
    "en": "Combined plan, actual site work and material deliveries from Google Calendar",
    "ru": "План, фактические работы и поставки материалов из Google Calendar"
  },
  "ตัวเลือกปฏิทินงาน": {
    "en": "Work calendar options",
    "ru": "Настройки календаря работ"
  },
  "รูปแบบการแสดงผล": {
    "en": "View",
    "ru": "Вид"
  },
  "เดือน": {
    "en": "Month",
    "ru": "Месяц"
  },
  "สัปดาห์": {
    "en": "Week",
    "ru": "Неделя"
  },
  "เลือกปฏิทิน": {
    "en": "Select calendars",
    "ru": "Выберите календари"
  },
  "ยังไม่ได้เลือกปฏิทิน": {
    "en": "No calendar selected",
    "ru": "Календарь не выбран"
  },
  "เลือกอย่างน้อย 1 รายการเพื่อแสดงตารางงาน": {
    "en": "Select at least one calendar to show the schedule",
    "ru": "Выберите минимум один календарь для отображения графика"
  },
  "พร้อมใช้": {
    "en": "Ready",
    "ru": "Готово"
  },
  "Sync ล่าสุดล้มเหลว": {
    "en": "Latest sync failed",
    "ru": "Последняя синхронизация завершилась ошибкой"
  },
  "ข้อมูลไม่ครบ": {
    "en": "Incomplete data",
    "ru": "Неполные данные"
  },
  "Source เก่า": {
    "en": "Stale source",
    "ru": "Устаревший источник"
  },
  "Sync เก่า": {
    "en": "Stale sync",
    "ru": "Устаревшая синхронизация"
  },
  "ยังไม่มี Auto Sync": {
    "en": "Auto Sync not available yet",
    "ru": "Auto Sync пока отсутствует"
  },
  "Auto Sync ทำงาน": {
    "en": "Auto Sync running",
    "ru": "Auto Sync работает"
  },
  "Sync ทำงาน": {
    "en": "Sync running",
    "ru": "Синхронизация выполняется"
  },
  "ไม่พบ Sync": {
    "en": "No sync found",
    "ru": "Синхронизация не найдена"
  },
  "ไม่ทราบสาเหตุ": {
    "en": "Unknown reason",
    "ru": "Причина неизвестна"
  },
  "ครบแล้ว": {
    "en": "Complete",
    "ru": "Завершено"
  },
  "ไม่ทราบอายุข้อมูล": {
    "en": "Data age unknown",
    "ru": "Возраст данных неизвестен"
  },
  "ตรวจความสดและความพร้อมของข้อมูลก่อนใช้ Dashboard / Executive Presentation": {
    "en": "Check data freshness and readiness before using Dashboard / Executive Presentation",
    "ru": "Проверка актуальности и готовности данных перед Dashboard / Executive Presentation"
  },
  "ยืนยันแล้ว": {
    "en": "Confirmed",
    "ru": "Подтверждено"
  },
  "Manual เดิม": {
    "en": "Previous manual mapping",
    "ru": "Предыдущая ручная привязка"
  },
  "ระบบจับคู่": {
    "en": "System matched",
    "ru": "Сопоставлено системой"
  },
  "ยังไม่จับคู่": {
    "en": "Not mapped",
    "ru": "Не сопоставлено"
  },
  "Before / ก่อนทำ": {
    "en": "Before",
    "ru": "До"
  },
  "During / ระหว่างทำ": {
    "en": "During",
    "ru": "В процессе"
  },
  "After / หลังทำ": {
    "en": "After",
    "ru": "После"
  },
  "Other / รูปประกอบ": {
    "en": "Other / Supporting photo",
    "ru": "Другое / Доп. фото"
  },
  "ยืนยัน Mapping": {
    "en": "Confirm Mapping",
    "ru": "Подтвердить привязку"
  },
  "ยังไม่เริ่ม": {
    "en": "Not started",
    "ru": "Не начато"
  },
  "กำลังดำเนินการ": {
    "en": "In progress",
    "ru": "В работе"
  },
  "รอตรวจ": {
    "en": "Awaiting inspection",
    "ru": "Ожидает проверки"
  },
  "ติดปัญหา/อุปสรรค": {
    "en": "Blocked",
    "ru": "Есть препятствие"
  },
  "ล่าช้า": {
    "en": "Delayed",
    "ru": "Задержка"
  },
  "เสร็จแล้ว": {
    "en": "Completed",
    "ru": "Завершено"
  },
  "ผ่าน/เสร็จ": {
    "en": "Completed",
    "ru": "Завершено"
  },
  "พักงาน": {
    "en": "On hold",
    "ru": "Приостановлено"
  },
  "ส่งรายงานแล้ว": {
    "en": "Submitted",
    "ru": "Отчёт отправлен"
  },
  "แบบร่าง": {
    "en": "Draft",
    "ru": "Черновик"
  },
  "อนุมัติแล้ว": {
    "en": "Approved",
    "ru": "Одобрено"
  },
  "รอดำเนินการ": {
    "en": "Pending",
    "ru": "Ожидает выполнения"
  },
  "รอแก้ไข": {
    "en": "Needs correction",
    "ru": "Требует исправления"
  },
  "ตามแผน": {
    "en": "On track",
    "ru": "По плану"
  },
  "เสี่ยงล่าช้า": {
    "en": "At risk",
    "ru": "Риск задержки"
  },
  "ใช้งานปกติ": {
    "en": "Operational",
    "ru": "Исправно"
  },
  "เสีย-ซ่อมไม่คุ้ม": {
    "en": "Out of service / uneconomical to repair",
    "ru": "Неисправно / ремонт нецелесообразен"
  },
  "รอของ": {
    "en": "Waiting for material",
    "ru": "Ожидается материал"
  },
  "ของเข้า": {
    "en": "Delivered",
    "ru": "Поставлено"
  },
  "รอส่ง": {
    "en": "Awaiting delivery",
    "ru": "Ожидает поставки"
  },
  "รออนุมัติ": {
    "en": "Awaiting approval",
    "ru": "Ожидает согласования"
  },
  "รอ PO": {
    "en": "Awaiting PO",
    "ru": "Ожидает PO"
  },
  "เปิด PO แล้ว": {
    "en": "PO issued",
    "ru": "PO выпущен"
  },
  "มีลูกค้า": {
    "en": "Has customer",
    "ru": "Есть клиент"
  },
  "ไม่มีลูกค้า": {
    "en": "No customer",
    "ru": "Нет клиента"
  },
  "ร่วมโรงแรม": {
    "en": "Hotel program",
    "ru": "Участвует в программе отеля"
  },
  "ไม่ร่วมโรงแรม": {
    "en": "Non-hotel program",
    "ru": "Не участвует в программе отеля"
  },
  "ตรวจแล้ว": {
    "en": "Inspected",
    "ru": "Проверено"
  },
  "ลูกค้าตรวจรับเรียบร้อยแล้ว": {
    "en": "Customer accepted",
    "ru": "Клиент принял"
  },
  "ยังไม่ตรวจห้อง": {
    "en": "Room not inspected",
    "ru": "Помещение не проверено"
  },
  "ยังไม่มี Defect": {
    "en": "No Defect",
    "ru": "Defect отсутствует"
  },
  "Defect เสร็จแล้ว": {
    "en": "Defect completed",
    "ru": "Defect устранён"
  },
  "รอลูกค้า / Hotel ตรวจรับ": {
    "en": "Awaiting customer / Hotel acceptance",
    "ru": "Ожидается приёмка клиентом / отелем"
  },
  "เพิ่งได้รับแจ้ง defect": {
    "en": "New Defect reported",
    "ru": "Получен новый Defect"
  },
  "เพิ่งได้รับแจ้ง Defect": {
    "en": "New Defect reported",
    "ru": "Получен новый Defect"
  },
  "และกำลังดำเนินการ": {
    "en": "and in progress",
    "ru": "и выполняется"
  },
  "ยังไม่มีลูกค้า": {
    "en": "No customer yet",
    "ru": "Клиента пока нет"
  },
  "ไม่มีห้องคงค้าง": {
    "en": "No rooms outstanding",
    "ru": "Нет незавершённых помещений"
  },
  "มีลูกค้า (ขายแล้ว)": {
    "en": "Has customer (sold)",
    "ru": "Есть клиент (продано)"
  },
  "ไม่มีลูกค้า (ยังไม่ขาย)": {
    "en": "No customer (unsold)",
    "ru": "Нет клиента (не продано)"
  },
  "Hotel Engineer ตรวจแล้ว": {
    "en": "Hotel Engineer inspected",
    "ru": "Проверено инженером отеля"
  },
  "Defect เสร็จแล้ว • รอตรวจรับ": {
    "en": "Defect completed • Awaiting acceptance",
    "ru": "Defect устранён • Ожидает приёмки"
  },
  "กลับไปที่ข้อมูล Defect ใน Dashboard": {
    "en": "Back to Defect data in Dashboard",
    "ru": "Вернуться к данным Defect на панели"
  },
  "1. สถานะลูกค้า": {
    "en": "1. Customer status",
    "ru": "1. Статус клиента"
  },
  "2. ร่วม / ไม่ร่วมโรงแรม": {
    "en": "2. Hotel program",
    "ru": "2. Участие в программе отеля"
  },
  "3. สถานะปัจจุบัน": {
    "en": "3. Current status",
    "ru": "3. Текущий статус"
  },
  "ครบ": {
    "en": "Complete",
    "ru": "Полный"
  },
  "ต้องตรวจสอบ": {
    "en": "Needs review",
    "ru": "Требует проверки"
  },
  "Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ": {
    "en": "Defect completed • Awaiting customer / Hotel acceptance",
    "ru": "Defect устранён • Ожидается приёмка клиентом / отелем"
  },
  "Awaiting Sale / ยังไม่มีลูกค้า": {
    "en": "Awaiting Sale / No customer yet",
    "ru": "Ожидает продажи / Клиента пока нет"
  },
  "ทุกประเภทลูกค้า": {
    "en": "All customer types",
    "ru": "Все типы клиентов"
  },
  "รายละเอียดย่อย Above Condo A, B": {
    "en": "Details for Above Condo A, B",
    "ru": "Детали Above Condo A, B"
  },
  "รายการที่เลือก": {
    "en": "Selected items",
    "ru": "Выбранные позиции"
  },
  "รายละเอียดทุกห้อง": {
    "en": "All room details",
    "ru": "Детали всех помещений"
  },
  "Above Condo — ทุกสถานะ": {
    "en": "Above Condo — All statuses",
    "ru": "Above Condo — Все статусы"
  },
  "ตึก A + B": {
    "en": "Building A + B",
    "ru": "Корпус A + B"
  },
  "กรองอาคาร": {
    "en": "Filter building",
    "ru": "Фильтр по корпусу"
  },
  "กรองสถานะ": {
    "en": "Filter status",
    "ru": "Фильтр по статусу"
  },
  "วันที่ตาม Hotel Defect Notice": {
    "en": "Date per Hotel Defect Notice",
    "ru": "Дата по Hotel Defect Notice"
  },
  "ไม่ระบุหมวด": {
    "en": "Category not specified",
    "ru": "Категория не указана"
  },
  "ทุก Site / Plot": {
    "en": "All Site / Plot",
    "ru": "Все Site / Plot"
  },
  "รายงานประจำวัน": {
    "en": "Daily Report",
    "ru": "Ежедневный отчёт"
  },
  "รอยืนยันทีม": {
    "en": "Awaiting team confirmation",
    "ru": "Ожидает подтверждения команды"
  },
  "ยืนยันทีมแล้ว": {
    "en": "Team confirmed",
    "ru": "Команда подтверждена"
  },
  "ต้องตรวจข้อมูล": {
    "en": "Data review required",
    "ru": "Требуется проверка данных"
  },
  "รอตรวจบัตรตอก": {
    "en": "Awaiting timecard check",
    "ru": "Ожидает проверки табеля"
  },
  "กำลังตรวจ": {
    "en": "Under review",
    "ru": "Проверяется"
  },
  "ตรวจบัตรตอกแล้ว": {
    "en": "Timecard checked",
    "ru": "Табель проверен"
  },
  "ต้องตรวจซ้ำ": {
    "en": "Needs recheck",
    "ru": "Требует повторной проверки"
  },
  "มาทำงาน": {
    "en": "Present",
    "ru": "Присутствует"
  },
  "ขาด": {
    "en": "Absent",
    "ru": "Отсутствует"
  },
  "ลา": {
    "en": "Leave",
    "ru": "Отпуск/отсутствие"
  },
  "ครึ่งวัน": {
    "en": "Half day",
    "ru": "Полдня"
  },
  "อื่น ๆ": {
    "en": "Other",
    "ru": "Другое"
  },
  "ทีมเดิม": {
    "en": "Home team",
    "ru": "Основная команда"
  },
  "ย้าย/ถูกยืมไปช่วยทีมอื่น": {
    "en": "Borrowed / working with another team",
    "ru": "Временно направлен в другую команду"
  },
  "กลับทีมเดิม": {
    "en": "Returned to home team",
    "ru": "Вернулся в основную команду"
  },
  "ผู้รับเหมาเท่านั้น": {
    "en": "Contractor only",
    "ru": "Только подрядчик"
  },
  "ตรวจไขว้ด้วยคน": {
    "en": "Manual cross-check",
    "ru": "Ручная перекрёстная проверка"
  },
  "ผู้ใช้งานและสิทธิ์": {
    "en": "Users & permissions",
    "ru": "Пользователи и права"
  },
  "Activity Log": {
    "en": "Activity Log",
    "ru": "Журнал действий"
  },
  "เพิ่มผู้ใช้งาน": {
    "en": "Add user",
    "ru": "Добавить пользователя"
  },
  "ชื่อแสดงผล": {
    "en": "Display name",
    "ru": "Отображаемое имя"
  },
  "สิทธิ์": {
    "en": "Role / Permission",
    "ru": "Роль / права"
  },
  "รหัสผ่าน": {
    "en": "Password",
    "ru": "Пароль"
  },
  "สุ่มใหม่": {
    "en": "Generate new",
    "ru": "Сгенерировать"
  },
  "สร้างบัญชี": {
    "en": "Create account",
    "ru": "Создать аккаунт"
  },
  "ข้อมูลสำหรับส่งให้ผู้ใช้งาน": {
    "en": "Credentials for user",
    "ru": "Данные доступа для пользователя"
  },
  "Copy ทั้งชุด": {
    "en": "Copy all",
    "ru": "Копировать всё"
  },
  "บัญชีภายใน": {
    "en": "Internal account",
    "ru": "Внутренняя учётная запись"
  },
  "อัปเดตไม่สำเร็จ": {
    "en": "Update failed",
    "ru": "Не удалось обновить"
  },
  "สร้างผู้ใช้งานไม่สำเร็จ": {
    "en": "Failed to create user",
    "ru": "Не удалось создать пользователя"
  },
  "Reset Password ไม่สำเร็จ": {
    "en": "Password reset failed",
    "ru": "Не удалось сбросить пароль"
  },
  "น.": {
    "en": "hrs",
    "ru": "ч."
  },
  "Management Dashboard": {"en":"Management Dashboard","ru":"Панель управления"},
  "Weekly Management Report": {"en":"Weekly Management Report","ru":"Еженедельный управленческий отчёт"},
  "Above Condo — Defect Report": {"en":"Above Condo — Defect Report","ru":"Above Condo — Отчёт по дефектам"},
  "Labour & Payroll Verification": {"en":"Labour & Payroll Verification","ru":"Проверка персонала и расчёта зарплаты"},
  "Construction supervision overview — เห็นความคืบหน้า ความเสี่ยง ทรัพยากร และรายการต้องติดตามจากหน้าเดียว": {"en":"Construction supervision overview — progress, risks, resources and follow-ups in one view","ru":"Обзор строительного надзора — прогресс, риски, ресурсы и контрольные вопросы на одном экране"},
  "ข้อมูลจาก Google Form / Daily Site Report แบบ Read-only • ใช้ข้อมูลที่หน้างานรายงานแล้วต่อยอดทันทีโดยไม่กรอกซ้ำ": {"en":"Read-only data from Google Form / Daily Site Report • Reuse site-reported data without duplicate entry","ru":"Данные Google Form / Daily Site Report только для чтения • Повторное использование данных объекта без двойного ввода"},
  "ดูรูปตัวอย่างล่าสุดของแต่ละ Site / Plot และเปิดโฟลเดอร์รูปใน Google Drive ได้โดยตรง": {"en":"View the latest photos for each Site / Plot and open the Google Drive photo folder directly","ru":"Просмотр последних фото по каждому Site / Plot и прямой переход в папку Google Drive"},
  "ค้นหาจากวัสดุ งาน ผู้ขาย ผู้รับเหมา เลข PO หรือสถานะ เพื่อดูว่าตอนนี้ติดอยู่ขั้นตอนไหนและต้องตามอะไรต่อ": {"en":"Search by material, work, vendor, contractor, PO or status to see the current procurement stage and required follow-up","ru":"Поиск по материалу, работам, поставщику, подрядчику, PO или статусу для контроля текущего этапа и дальнейших действий"},
  "ภาพรวม 7 วันล่าสุด • Plan vs Actual • งานล่าช้า • Blocker • กำลังคน • เลือกดูแยกแต่ละ Site / Plot ได้": {"en":"Last 7 days overview • Plan vs Actual • Delays • Blockers • Manpower • Filter by Site / Plot","ru":"Обзор за последние 7 дней • План vs Факт • Задержки • Blocker • Персонал • Фильтр по Site / Plot"},
  "หมวด": {"en":"Category","ru":"Категория"},
  "วัสดุ / งาน": {"en":"Material / Work","ru":"Материал / Работа"},
  "ยี่ห้อ / รุ่น / สเปก": {"en":"Brand / Model / Specification","ru":"Бренд / Модель / Спецификация"},
  "รายละเอียดล่าสุด": {"en":"Latest details","ru":"Последние данные"},
  "ผู้ติดต่อ": {"en":"Contact","ru":"Контакт"},
  "PO / PR": {"en":"PO / PR","ru":"PO / PR"},
  "สถานะ PO / ชำระ": {"en":"PO / Payment status","ru":"Статус PO / Оплата"},
  "ขั้นตอนปัจจุบัน": {"en":"Current stage","ru":"Текущий этап"},
  "กำหนดส่ง / เข้าหน้างาน": {"en":"Delivery / Site arrival","ru":"Поставка / Прибытие на объект"},
  "รายละเอียด / สิ่งที่ต้องตาม": {"en":"Details / Follow-up","ru":"Детали / Контроль"},
  "อัปเดต": {"en":"Updated","ru":"Обновлено"},
  "อัปเดตข้อมูล": {"en":"Data updated","ru":"Данные обновлены"},
  "รหัส": {"en":"Code","ru":"Код"},
  "เครื่องมือ / เครื่องจักร": {"en":"Equipment / Machinery","ru":"Оборудование / Техника"},
  "ยี่ห้อ / รุ่น": {"en":"Brand / Model","ru":"Бренд / Модель"},
  "สถานที่ล่าสุด": {"en":"Latest location","ru":"Последнее местоположение"},
  "วันที่อัปเดต": {"en":"Updated date","ru":"Дата обновления"},
  "ห้อง": {"en":"Room","ru":"Помещение"},
  "อาคาร": {"en":"Building","ru":"Корпус"},
  "วันที่ Hotel แจ้ง": {"en":"Hotel notice date","ru":"Дата уведомления отеля"},
  "ชื่อลูกค้า/เจ้าของ": {"en":"Customer / Owner name","ru":"Имя клиента / владельца"},
  "ลูกค้า": {"en":"Customer","ru":"Клиент"},
  "โรงแรม": {"en":"Hotel","ru":"Отель"},
  "รายละเอียดงาน": {"en":"Work details","ru":"Описание работ"},
  "ต้องทำต่อ": {"en":"Next action","ru":"Следующее действие"},
  "คนงาน": {"en":"Worker","ru":"Работник"},
  "เข้า": {"en":"Clock in","ru":"Приход"},
  "ออก": {"en":"Clock out","ru":"Уход"},
  "ข้ามวัน": {"en":"Overnight","ru":"Через полночь"},
  "วันทำงาน": {"en":"Work units","ru":"Рабочие дни"},
  "OT ชม.": {"en":"OT hours","ru":"Часы OT"},
  "ข้อยกเว้น": {"en":"Exception","ru":"Исключение"},
  "บัตรตอก": {"en":"Timecard","ru":"Табель"},
  "ค่าแรง": {"en":"Pay","ru":"Оплата"},
  "Plan": {"en":"Plan","ru":"План"},
  "Actual": {"en":"Actual","ru":"Факт"},
  "Blocker": {"en":"Blocker","ru":"Препятствие"},
  "Delayed": {"en":"Delayed","ru":"Задержка"},
  "Action": {"en":"Action","ru":"Действие"},
  "Status": {"en":"Status","ru":"Статус"},
  "Role": {"en":"Role","ru":"Роль"},
  "Save": {"en":"Save","ru":"Сохранить"},
  "Saving…": {"en":"Saving…","ru":"Сохранение…"},
  "Reset Password": {"en":"Reset Password","ru":"Сбросить пароль"},
  "Copy": {"en":"Copy","ru":"Копировать"},
  "Password": {"en":"Password","ru":"Пароль"},
  "Username": {"en":"Username","ru":"Имя пользователя"}
}

const PHRASES: Array<{source:string;en:string;ru:string}> = [
  {
    "source": "เปรียบเทียบหน้างานจริง",
    "en": "compared with actual site progress",
    "ru": "сравнение с фактом на объекте"
  },
  {
    "source": "เตรียมเทปรับระดับ",
    "en": "Prepare for levelling pour",
    "ru": "Подготовка к выравнивающей заливке"
  },
  {
    "source": "ของเข้าหน้างาน",
    "en": "Material delivered to site",
    "ru": "Материал доставлен на объект"
  },
  {
    "source": "แผนงานทั้งหมด",
    "en": "all scheduled work",
    "ru": "весь план работ"
  },
  {
    "source": "ทำโครงหลังคา",
    "en": "Install roof framing",
    "ru": "Монтаж каркаса кровли"
  },
  {
    "source": "น้ำไหลไม่แรง",
    "en": "low water pressure",
    "ru": "низкое давление воды"
  },
  {
    "source": "ผู้รับผิดชอบ",
    "en": "person responsible",
    "ru": "ответственный"
  },
  {
    "source": "ทำความสะอาด",
    "en": "Cleaning",
    "ru": "Уборка"
  },
  {
    "source": "เทปรับระดับ",
    "en": "Levelling pour",
    "ru": "Выравнивающая заливка"
  },
  {
    "source": "อ่างล้างจาน",
    "en": "kitchen sink",
    "ru": "кухонная мойка"
  },
  {
    "source": "ปูกระเบื้อง",
    "en": "tiling",
    "ru": "укладка плитки"
  },
  {
    "source": "ชาย + หญิง",
    "en": "male + female",
    "ru": "мужчины + женщины"
  },
  {
    "source": "ห้องคงค้าง",
    "en": "outstanding rooms",
    "ru": "незавершённые помещения"
  },
  {
    "source": "เก็บงานสี",
    "en": "Paint touch-up",
    "ru": "Подкраска / устранение замечаний по окраске"
  },
  {
    "source": "รอติดตั้ง",
    "en": "Awaiting installation",
    "ru": "Ожидает монтажа"
  },
  {
    "source": "รอตรวจรับ",
    "en": "Awaiting acceptance",
    "ru": "Ожидает приёмки"
  },
  {
    "source": "สะดืออ่าง",
    "en": "basin drain",
    "ru": "слив раковины"
  },
  {
    "source": "กระเบื้อง",
    "en": "tile",
    "ru": "плитка"
  },
  {
    "source": "ผู้ใช้งาน",
    "en": "user",
    "ru": "пользователь"
  },
  {
    "source": "ปรับพื้น",
    "en": "Floor levelling",
    "ru": "Выравнивание пола"
  },
  {
    "source": "สีภายนอก",
    "en": "exterior paint",
    "ru": "наружная окраска"
  },
  {
    "source": "ผนังโค้ง",
    "en": "curved wall",
    "ru": "криволинейная стена"
  },
  {
    "source": "บันไดสระ",
    "en": "pool steps",
    "ru": "ступени бассейна"
  },
  {
    "source": "กำหนดส่ง",
    "en": "Delivery schedule",
    "ru": "Срок поставки"
  },
  {
    "source": "ไฟไม่ติด",
    "en": "light not working",
    "ru": "свет не работает"
  },
  {
    "source": "ราวบันได",
    "en": "handrail",
    "ru": "перила"
  },
  {
    "source": "สีภายใน",
    "en": "interior paint",
    "ru": "внутренняя окраска"
  },
  {
    "source": "ระเบียง",
    "en": "balcony",
    "ru": "балкон"
  },
  {
    "source": "ห้องน้ำ",
    "en": "bathroom",
    "ru": "санузел"
  },
  {
    "source": "ติดตั้ง",
    "en": "Install",
    "ru": "Монтаж"
  },
  {
    "source": "น้ำรั่ว",
    "en": "water leak",
    "ru": "протечка воды"
  },
  {
    "source": "งานระบบ",
    "en": "MEP work",
    "ru": "инженерные системы"
  },
  {
    "source": "ภาพรวม",
    "en": "Overview",
    "ru": "Обзор"
  },
  {
    "source": "ขนทราย",
    "en": "Move sand",
    "ru": "Перемещение песка"
  },
  {
    "source": "หลังคา",
    "en": "roof",
    "ru": "кровля"
  },
  {
    "source": "ภายนอก",
    "en": "exterior",
    "ru": "снаружи"
  },
  {
    "source": "สระน้ำ",
    "en": "pool",
    "ru": "бассейн"
  },
  {
    "source": "รอตรวจ",
    "en": "Awaiting inspection",
    "ru": "Ожидает проверки"
  },
  {
    "source": "ฝักบัว",
    "en": "shower",
    "ru": "душ"
  },
  {
    "source": "งานฝ้า",
    "en": "ceiling work",
    "ru": "потолочные работы"
  },
  {
    "source": "งานปูน",
    "en": "masonry/plaster work",
    "ru": "штукатурные/кладочные работы"
  },
  {
    "source": "ชั้น 1",
    "en": "Floor 1",
    "ru": "Этаж 1"
  },
  {
    "source": "ชั้น 2",
    "en": "Floor 2",
    "ru": "Этаж 2"
  },
  {
    "source": "ลูกค้า",
    "en": "customer",
    "ru": "клиент"
  },
  {
    "source": "โรงแรม",
    "en": "Hotel",
    "ru": "отель"
  },
  {
    "source": "คน-วัน",
    "en": "person-days",
    "ru": "чел.-дни"
  },
  {
    "source": "ภายใน",
    "en": "interior",
    "ru": "внутри"
  },
  {
    "source": "บันได",
    "en": "stairs",
    "ru": "лестница"
  },
  {
    "source": "รอของ",
    "en": "Waiting for material",
    "ru": "Ожидается материал"
  },
  {
    "source": "กระจก",
    "en": "glass",
    "ru": "стекло"
  },
  {
    "source": "ชั้น1",
    "en": "Floor 1",
    "ru": "Этаж 1"
  },
  {
    "source": "ชั้น2",
    "en": "Floor 2",
    "ru": "Этаж 2"
  },
  {
    "source": "ห้อง",
    "en": "room",
    "ru": "помещение"
  },
  {
    "source": "ฝ้า",
    "en": "ceiling",
    "ru": "потолок"
  },
  {
    "source": "ฉาบ",
    "en": "plastering",
    "ru": "штукатурка"
  },
  {
    "source": "ขัด",
    "en": "Sand",
    "ru": "Шлифовка"
  },
  {
    "source": "ตึก",
    "en": "building",
    "ru": "корпус"
  }
]

const TECHNICAL_ONLY = /^(?:[A-Z]{1,8}(?:[-_/][A-Z0-9]+)*|(?:PO|PL|AB|FCU|VG|RSE|ID)[-_ ]?\d+[A-Z0-9-]*|[A-Z]\d{2,}|\d+(?:\.\d+)?%?)$/i

export function isAppLanguage(value:string|null|undefined): value is AppLanguage {
  return value === 'th' || value === 'en' || value === 'ru'
}

function preserveOuterWhitespace(original:string, translated:string){
  const lead=original.match(/^\s*/)?.[0]||''
  const tail=original.match(/\s*$/)?.[0]||''
  return lead+translated+tail
}

function translateCore(input:string, language:Exclude<AppLanguage,'th'>){
  if(!input || TECHNICAL_ONLY.test(input)) return input
  const exact=EXACT[input]
  if(exact) return exact[language]

  let output=input
  for(const item of PHRASES){
    if(output.includes(item.source)) output=output.split(item.source).join(item[language])
  }

  output=output
    .replace(/ชั้น\s*(\d+)/g, language==='en'?'Floor $1':'Этаж $1')
    .replace(/(\d+)\s*คน(?=\s|$|[•,])/g, language==='en'?'$1 people':'$1 чел.')
    .replace(/(\d+)\s*ห้อง(?=\s|$|[•,])/g, language==='en'?'$1 rooms':'$1 помещений')

  const monthMap=language==='en'
    ? [['ม.ค.','Jan'],['ก.พ.','Feb'],['มี.ค.','Mar'],['เม.ย.','Apr'],['พ.ค.','May'],['มิ.ย.','Jun'],['ก.ค.','Jul'],['ส.ค.','Aug'],['ก.ย.','Sep'],['ต.ค.','Oct'],['พ.ย.','Nov'],['ธ.ค.','Dec']]
    : [['ม.ค.','янв.'],['ก.พ.','фев.'],['มี.ค.','мар.'],['เม.ย.','апр.'],['พ.ค.','май'],['มิ.ย.','июн.'],['ก.ค.','июл.'],['ส.ค.','авг.'],['ก.ย.','сен.'],['ต.ค.','окт.'],['พ.ย.','ноя.'],['ธ.ค.','дек.']]
  for(const [th,target] of monthMap) output=output.split(th).join(target)

  return output
}

export function translateText(value:string, language:AppLanguage){
  if(language==='th' || !value) return value
  const trimmed=value.trim()
  if(!trimmed) return value
  return preserveOuterWhitespace(value,translateCore(trimmed,language))
}
