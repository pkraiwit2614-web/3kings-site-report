'use client'

export default function PrintButton(){
  return <button type="button" className="button defect-print-button" onClick={()=>window.print()} aria-label="พิมพ์รายงาน Defect">🖨️ Print</button>
}
