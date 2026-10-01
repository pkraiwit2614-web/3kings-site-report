'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import AppShell from '@/components/AppShell'

type EvidenceSlide = {
  kind: 'pdf'
  building: 'A' | 'B'
  room: string
  date: string
  fileId: string
  itemCount: number
  summary: string[]
}

const AFTER_EVIDENCE = [
  {
    room: 'A516',
    date: '15/09/2026',
    fileId: '1jOIrGrJtC3oBmbH45a3e3Hhy8evlKN6o',
    title: 'พื้นห้องน้ำ',
    note: 'ภาพในชุดรายงานแก้ Defect แล้ว',
  },
  {
    room: 'A518',
    date: '15/09/2026',
    fileId: '1YN4QeP8rn7G5cBKzrDlfuPgEuqrPVO3H',
    title: 'ขอบประตู',
    note: 'ภาพติดตามงานเก็บรายละเอียด',
  },
  {
    room: 'A520',
    date: '15/09/2026',
    fileId: '1FKZ5HbfLxoXeIfb_LKWM2EWziSrtBg75',
    title: 'ช่องเปิดฝ้า',
    note: 'ภาพงานแก้ไขส่งเข้าชุด Done',
  },
] as const

const DEFECT_EVIDENCE: EvidenceSlide[] = [
  {
    kind: 'pdf',
    building: 'A',
    room: 'A326',
    date: '26/09/2026',
    fileId: '1kkPuFpfS7P87l0NZvIwr_So1a7zXLyl4',
    itemCount: 4,
    summary: [
      'Hotel defect record — 4 รายการ',
      'พบประเด็นขอบหน้ากากติดสี และจุดที่ต้อง Verify จากภาพ',
      'มี Done folder วันที่ 26/09 แต่สถานะ Master ยังต้องยืนยันผลตรวจรับ',
    ],
  },
  {
    kind: 'pdf',
    building: 'B',
    room: 'B214',
    date: '30/09/2026',
    fileId: '1bOVGs2xm2sZgamFsmsHymF7D-FkCM1CG',
    itemCount: 9,
    summary: [
      'Hotel defect record — 9 รายการ',
      'ตัวอย่าง: RCU Frozen, ประตูปรับไม่เรียบร้อย, เต้ารับไม่ตรง',
      'ห้องน้ำมีรายการ Stopper / รั่ว / ฝ้าเสียหาย และงานเก็บ Balcony / Bedroom',
    ],
  },
  {
    kind: 'pdf',
    building: 'B',
    room: 'B314',
    date: '30/09/2026',
    fileId: '1vLtp0m7pU6sQ-CJVpiiPRFGeusPH7zRf',
    itemCount: 16,
    summary: [
      'Hotel defect record — 16 รายการ',
      'ตัวอย่าง: รอยร้าว, งานเฟอร์นิเจอร์, สี/คราบ, งานฉาบ และยาแนว',
      'มีรายการห้องน้ำและระเบียง รวมถึง Shower drain ชำรุด',
    ],
  },
]

const TOTAL_SLIDES = 6

function driveView(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`
}

function drivePreview(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/preview`
}

function driveImage(fileId: string) {
  return `/api/drive-photo?fileId=${encodeURIComponent(fileId)}&size=1400`
}

function BuildingTag({ building }: { building: 'A' | 'B' }) {
  return <span className={`cd-building ${building === 'A' ? 'a' : 'b'}`}>CONDO {building}</span>
}

function CoverSlide() {
  return (
    <section className="cd-slide cd-cover-slide">
      <div className="cd-kicker">3 KINGS CONSTRUCTION · PHOTO EVIDENCE</div>
      <h1>Above Condo<br />Defect Showcase</h1>
      <p className="cd-cover-sub">ตัวอย่างการเก็บ Defect และหลักฐานงานแก้ไข · อาคาร A + B</p>
      <div className="cd-cover-period">SEPTEMBER 2026 · กันยายน 2569</div>
      <div className="cd-cover-cards">
        <div><b>CONDO A</b><span>ตัวอย่างภาพงานแก้ Defect + Hotel defect record</span></div>
        <div><b>CONDO B</b><span>ตัวอย่าง Hotel defect record รายห้องพร้อมภาพ</span></div>
        <div><b>หลักการนำเสนอ</b><span>เน้นภาพ · ห้อง · วันที่ · แหล่งหลักฐาน</span></div>
      </div>
      <small>ชุดนี้เป็นหลักฐานประกอบการนำเสนอ ไม่ใช้แทนสถานะปิดงาน/ตรวจรับล่าสุดใน Defect Flow</small>
    </section>
  )
}

function AfterGallerySlide() {
  return (
    <section className="cd-slide">
      <header className="cd-slide-head">
        <div><BuildingTag building="A" /><span className="cd-date">15/09/2026</span></div>
        <div>
          <h2>ตัวอย่างภาพงานแก้ Defect ที่ส่งเข้าชุด Done</h2>
          <p>A516 · A518 · A520 — ภาพจากชุดรายงานกลางเดือนกันยายน</p>
        </div>
      </header>
      <div className="cd-gallery-three">
        {AFTER_EVIDENCE.map(item => (
          <a className="cd-photo-card" href={driveView(item.fileId)} target="_blank" rel="noreferrer" key={item.room}>
            <div className="cd-photo-wrap">
              <img src={driveImage(item.fileId)} alt={`Defect evidence ${item.room}`} />
              <span className="cd-room-badge">{item.room}</span>
            </div>
            <div className="cd-photo-caption">
              <b>{item.title}</b>
              <span>{item.note}</span>
              <small>{item.date}</small>
            </div>
          </a>
        ))}
      </div>
      <div className="cd-note">คำว่า “Done” ในชื่อชุดรูป = หลักฐานว่ามีการรายงานงานแก้ไขแล้ว ไม่ถือเป็นการยืนยันว่า Hotel ตรวจรับปิดห้องเรียบร้อยโดยอัตโนมัติ</div>
    </section>
  )
}

function PdfSlide({ evidence }: { evidence: EvidenceSlide }) {
  return (
    <section className="cd-slide">
      <header className="cd-slide-head">
        <div><BuildingTag building={evidence.building} /><span className="cd-date">{evidence.date}</span></div>
        <div>
          <h2>{evidence.room} · Hotel Defect Collection</h2>
          <p>ตัวอย่างการตรวจและบันทึก Defect รายห้อง · {evidence.itemCount} รายการ</p>
        </div>
      </header>
      <div className="cd-evidence-layout">
        <div className="cd-pdf-frame">
          <iframe src={drivePreview(evidence.fileId)} title={`Defect ${evidence.room}`} allow="autoplay" />
        </div>
        <aside className="cd-side-panel">
          <div className="cd-big-room">{evidence.room}</div>
          <div className="cd-big-count"><b>{evidence.itemCount}</b><span>DEFECT ITEMS</span></div>
          <div className="cd-summary-list">
            {evidence.summary.map((item, idx) => <p key={idx}>{item}</p>)}
          </div>
          <a className="cd-source-link" href={driveView(evidence.fileId)} target="_blank" rel="noreferrer">เปิดเอกสารต้นฉบับ ↗</a>
          <small>เลื่อนดูทุกหน้าได้ในกรอบเอกสาร</small>
        </aside>
      </div>
    </section>
  )
}

function ClosingSlide() {
  return (
    <section className="cd-slide cd-close-slide">
      <div className="cd-kicker">DEFECT EVIDENCE · SEPTEMBER 2026</div>
      <h2>รูปแบบหลักฐานที่ใช้ต่อเนื่อง</h2>
      <div className="cd-process">
        <div><b>01</b><span>พบ Defect</span><small>ระบุห้อง / จุด / วันที่</small></div>
        <div><b>02</b><span>เข้าแก้ไข</span><small>ผู้รับผิดชอบ + หลักฐานระหว่างงาน</small></div>
        <div><b>03</b><span>After Photo</span><small>ภาพหลังแก้ตรงจุดเดิม</small></div>
        <div><b>04</b><span>ตรวจรับ</span><small>Hotel / ลูกค้า / Master Status</small></div>
      </div>
      <div className="cd-close-actions">
        <Link href="/defect-flow">เปิด Defect Flow</Link>
        <Link href="/presentation">กลับ Executive Presentation</Link>
      </div>
      <p>การนำเสนอชุดนี้แยกจาก Above Villa โดยตั้งใจ เพื่อไม่แก้ logic / layout / photo guard ของ Executive Presentation เดิม</p>
    </section>
  )
}

export default function CondoDefectPresentationSep2026() {
  const [slideIndex, setSlideIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)

  const go = (next: number) => setSlideIndex(Math.max(0, Math.min(TOTAL_SLIDES - 1, next)))

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') go(slideIndex + 1)
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(slideIndex - 1)
      if (event.key === 'Home') go(0)
      if (event.key === 'End') go(TOTAL_SLIDES - 1)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [slideIndex])

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await stageRef.current?.requestFullscreen()
    } catch {
      // Browser may block fullscreen; presentation remains usable in normal view.
    }
  }

  const renderSlide = () => {
    if (slideIndex === 0) return <CoverSlide />
    if (slideIndex === 1) return <AfterGallerySlide />
    if (slideIndex >= 2 && slideIndex <= 4) return <PdfSlide evidence={DEFECT_EVIDENCE[slideIndex - 2]} />
    return <ClosingSlide />
  }

  return (
    <AppShell>
      <main className="cd-page">
        <div className="cd-toolbar">
          <div>
            <Link href="/presentation" className="cd-back">← Executive Presentation</Link>
            <h1>Condo Defect · Photo Showcase</h1>
            <span>September 2026 · อาคาร A + B</span>
          </div>
          <div className="cd-toolbar-actions">
            <button type="button" onClick={() => window.print()}>Print / PDF</button>
            <button type="button" onClick={toggleFullscreen}>{isFullscreen ? 'ออกเต็มจอ' : 'เต็มจอ'}</button>
          </div>
        </div>

        <div className="cd-stage" ref={stageRef}>
          {renderSlide()}
          <div className="cd-stage-controls">
            <button type="button" onClick={() => go(slideIndex - 1)} disabled={slideIndex === 0}>← ก่อนหน้า</button>
            <div className="cd-dots" aria-label="Slide navigation">
              {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
                <button key={i} type="button" className={i === slideIndex ? 'active' : ''} onClick={() => go(i)} aria-label={`Slide ${i + 1}`} />
              ))}
            </div>
            <span className="cd-counter">{String(slideIndex + 1).padStart(2, '0')} / {String(TOTAL_SLIDES).padStart(2, '0')}</span>
            <button type="button" onClick={() => go(slideIndex + 1)} disabled={slideIndex === TOTAL_SLIDES - 1}>ถัดไป →</button>
          </div>
        </div>

        <div className="cd-footnote">
          แหล่งภาพ: Defect Done / Hotel defect records เดือน ก.ย. 2569 · สถานะปัจจุบันให้ยึด Defect Flow / Master Status
        </div>
      </main>

      <style jsx>{`
        .cd-page{padding:22px 24px 36px;max-width:1500px;margin:0 auto;color:#132c4c}
        .cd-toolbar{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:14px}
        .cd-toolbar h1{font-size:24px;line-height:1.1;margin:6px 0 3px;color:#173b64}.cd-toolbar span{font-size:12px;color:#69798a;font-weight:700}
        .cd-back{font-size:11px;font-weight:800;color:#486982;text-decoration:none}
        .cd-toolbar-actions{display:flex;gap:8px}.cd-toolbar-actions button,.cd-stage-controls button{border:1px solid #cbd6df;background:#fff;color:#23425f;border-radius:10px;padding:9px 13px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.cd-toolbar-actions button:hover,.cd-stage-controls button:hover:not(:disabled){background:#edf4f8}.cd-stage-controls button:disabled{opacity:.4;cursor:not-allowed}
        .cd-stage{position:relative;width:100%;aspect-ratio:16/9;min-height:620px;background:#f7f4ec;border:1px solid #d7d9d6;border-radius:18px;overflow:hidden;box-shadow:0 16px 45px rgba(18,47,76,.12)}
        .cd-slide{position:absolute;inset:0;padding:42px 48px 74px;background:linear-gradient(145deg,#fbfaf6 0%,#f3f0e8 100%);display:flex;flex-direction:column;overflow:hidden}
        .cd-slide-head{display:grid;grid-template-columns:180px 1fr;gap:18px;align-items:start;margin-bottom:22px}.cd-slide-head>div:first-child{display:flex;flex-direction:column;gap:8px;align-items:flex-start}.cd-slide-head h2{font-size:27px;line-height:1.15;margin:0 0 6px;color:#183b62}.cd-slide-head p{margin:0;color:#687786;font-size:12px;font-weight:650}
        .cd-building{display:inline-flex;padding:7px 10px;border-radius:8px;font-size:11px;font-weight:950;letter-spacing:1px}.cd-building.a{background:#e7f1f8;color:#1e5d86}.cd-building.b{background:#efe9f6;color:#65467f}.cd-date{font-size:10px;font-weight:800;color:#82909c}
        .cd-kicker{font-size:11px;font-weight:950;letter-spacing:2px;color:#bc8c35}
        .cd-cover-slide{padding:70px 72px 84px;background:radial-gradient(circle at 80% 20%,rgba(210,180,117,.22),transparent 32%),linear-gradient(135deg,#102e50 0%,#173e68 55%,#1b4b77 100%);color:#fff}.cd-cover-slide h1{font-size:58px;line-height:.98;margin:22px 0 14px;letter-spacing:-1px}.cd-cover-sub{font-size:19px;line-height:1.5;margin:0;color:#dfeaf3;max-width:760px}.cd-cover-period{margin-top:28px;display:inline-flex;align-self:flex-start;padding:9px 12px;border:1px solid rgba(255,255,255,.28);border-radius:8px;font-size:11px;font-weight:900;letter-spacing:1.4px}.cd-cover-cards{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.cd-cover-cards>div{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:5px}.cd-cover-cards b{font-size:11px;letter-spacing:1px}.cd-cover-cards span{font-size:10px;line-height:1.45;color:#dce7f0}.cd-cover-slide>small{margin-top:12px;color:#b9c9d6;font-size:9px}
        .cd-gallery-three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;min-height:0;flex:1}.cd-photo-card{display:flex;flex-direction:column;text-decoration:none;color:inherit;background:#fff;border:1px solid #dedbd3;border-radius:14px;overflow:hidden;min-width:0;box-shadow:0 8px 18px rgba(24,48,72,.06)}.cd-photo-wrap{position:relative;flex:1;min-height:0;background:#e9e7e1;overflow:hidden}.cd-photo-wrap img{width:100%;height:100%;object-fit:cover;display:block}.cd-room-badge{position:absolute;top:10px;left:10px;background:rgba(17,46,78,.9);color:white;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:950}.cd-photo-caption{padding:11px 13px 12px;display:grid;grid-template-columns:1fr auto;gap:3px 8px}.cd-photo-caption b{font-size:13px}.cd-photo-caption span{font-size:9px;color:#657382;grid-column:1/-1}.cd-photo-caption small{font-size:9px;color:#8b969f}.cd-note{margin-top:12px;padding:9px 12px;border-radius:9px;background:#fff7e8;border:1px solid #ead8ac;color:#77561a;font-size:9px;font-weight:700}
        .cd-evidence-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;min-height:0;flex:1}.cd-pdf-frame{min-height:0;border:1px solid #d7d4cc;border-radius:14px;overflow:hidden;background:white;box-shadow:0 8px 20px rgba(24,48,72,.07)}.cd-pdf-frame iframe{border:0;width:100%;height:100%;display:block}.cd-side-panel{border:1px solid #ddd8cd;background:rgba(255,255,255,.85);border-radius:14px;padding:19px;display:flex;flex-direction:column;min-height:0}.cd-big-room{font-size:34px;font-weight:950;color:#163b64;letter-spacing:-1px}.cd-big-count{display:flex;align-items:flex-end;gap:9px;border-bottom:1px solid #ddd8ce;padding:6px 0 14px;margin-bottom:12px}.cd-big-count b{font-size:35px;line-height:1;color:#b48531}.cd-big-count span{font-size:9px;font-weight:950;letter-spacing:1.1px;color:#758390;padding-bottom:3px}.cd-summary-list{display:flex;flex-direction:column;gap:8px}.cd-summary-list p{margin:0;font-size:10px;line-height:1.45;color:#455b70;padding-left:12px;position:relative}.cd-summary-list p:before{content:'•';position:absolute;left:0;color:#b88731}.cd-source-link{margin-top:auto;display:flex;justify-content:center;text-decoration:none;padding:10px 12px;border-radius:9px;background:#173f68;color:#fff;font-size:10px;font-weight:900}.cd-side-panel small{display:block;text-align:center;margin-top:7px;font-size:8px;color:#89939a}
        .cd-close-slide{justify-content:center}.cd-close-slide h2{font-size:38px;margin:12px 0 30px;color:#173b63}.cd-process{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.cd-process>div{background:#fff;border:1px solid #dedbd4;border-radius:14px;padding:18px;min-height:130px;display:flex;flex-direction:column;gap:8px}.cd-process b{font-size:27px;color:#b88934}.cd-process span{font-size:14px;font-weight:950;color:#173c64}.cd-process small{font-size:10px;line-height:1.45;color:#667686}.cd-close-actions{display:flex;gap:10px;margin-top:26px}.cd-close-actions a{text-decoration:none;padding:11px 15px;border-radius:10px;background:#173f68;color:#fff;font-size:11px;font-weight:900}.cd-close-actions a:last-child{background:#fff;color:#173f68;border:1px solid #cbd6df}.cd-close-slide>p{margin:18px 0 0;font-size:10px;color:#78848e}
        .cd-stage-controls{position:absolute;left:22px;right:22px;bottom:16px;display:flex;align-items:center;gap:10px;z-index:10}.cd-stage-controls>button:last-child{margin-left:auto}.cd-counter{font-size:10px;font-weight:900;color:#6d7b88;min-width:42px;text-align:center}.cd-dots{display:flex;gap:5px}.cd-dots button{width:7px!important;height:7px!important;border:0!important;border-radius:999px!important;padding:0!important;background:#bfc8cf!important}.cd-dots button.active{width:20px!important;background:#244e73!important}
        .cd-footnote{text-align:right;margin-top:8px;font-size:9px;color:#8a959e}
        .cd-stage:fullscreen{width:100vw;height:100vh;aspect-ratio:auto;min-height:0;border:0;border-radius:0;background:#f3f0e8}.cd-stage:fullscreen .cd-slide{padding:4.6vh 4.5vw 9vh}.cd-stage:fullscreen .cd-slide-head{margin-bottom:2vh}.cd-stage:fullscreen .cd-slide-head h2{font-size:3.1vh}.cd-stage:fullscreen .cd-cover-slide h1{font-size:7.2vh}.cd-stage:fullscreen .cd-gallery-three{gap:1.1vw}.cd-stage:fullscreen .cd-photo-caption b{font-size:1.5vh}.cd-stage:fullscreen .cd-photo-caption span{font-size:1.05vh}.cd-stage:fullscreen .cd-pdf-frame iframe{height:100%}
        @media(max-width:1000px){.cd-stage{min-height:560px}.cd-slide{padding:30px 28px 68px}.cd-evidence-layout{grid-template-columns:minmax(0,1fr) 260px}.cd-slide-head{grid-template-columns:150px 1fr}.cd-slide-head h2{font-size:23px}.cd-cover-slide{padding:52px 42px 76px}.cd-cover-slide h1{font-size:46px}}
        @media(max-width:760px){.cd-page{padding:14px 10px 28px}.cd-toolbar{align-items:flex-start;flex-direction:column}.cd-stage{aspect-ratio:auto;height:720px;min-height:720px}.cd-slide{padding:24px 18px 66px}.cd-slide-head{grid-template-columns:1fr;gap:9px;margin-bottom:13px}.cd-gallery-three{grid-template-columns:1fr;overflow:auto}.cd-photo-card{min-height:360px}.cd-evidence-layout{grid-template-columns:1fr;overflow:auto}.cd-pdf-frame{min-height:470px}.cd-side-panel{min-height:260px}.cd-cover-slide{padding:38px 24px 70px}.cd-cover-slide h1{font-size:42px}.cd-cover-cards{grid-template-columns:1fr;overflow:auto}.cd-process{grid-template-columns:1fr 1fr;overflow:auto}.cd-stage-controls{left:10px;right:10px;bottom:10px}.cd-stage-controls>button{padding:8px 9px}.cd-dots{display:none}}
        @media print{.cd-toolbar,.cd-stage-controls,.cd-footnote{display:none!important}.cd-page{padding:0;max-width:none}.cd-stage{border:0;box-shadow:none;border-radius:0;aspect-ratio:16/9;min-height:0}.cd-slide{position:relative;min-height:100vh}.cd-pdf-frame iframe{min-height:72vh}}
      `}</style>
    </AppShell>
  )
}
