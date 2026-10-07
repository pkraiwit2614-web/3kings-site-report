'use client'

import { useEffect } from 'react'
import { useI18n } from '@/components/I18nProvider'
import type { AppLanguage } from '@/lib/i18n'

function cleanDefaultLabel(text:string){
  return text
    .replace(/^ทุก\s*/,'')
    .replace(/^ทั้งหมด\s*/,'')
    .replace(/^เลือก\s*/,'')
    .replace(/^กรอง\s*/,'')
    .trim()
}

function collectPrintFilters(){
  const parts:string[]=[]
  const controls=Array.from(document.querySelectorAll('.main input:not([type="hidden"]), .main select'))

  controls.forEach(control=>{
    if(control instanceof HTMLInputElement){
      const value=control.value.trim()
      if(!value)return
      const label=(control.getAttribute('aria-label')||control.placeholder||'ค้นหา').trim()
      parts.push(`${label}: ${value}`)
      return
    }

    if(control instanceof HTMLSelectElement){
      const value=control.value.trim()
      if(!value||value==='ALL'||value==='all')return
      const selected=control.options[control.selectedIndex]?.text?.trim()||value
      const aria=control.getAttribute('aria-label')?.trim()||''
      const first=control.options[0]?.text?.trim()||''
      const label=cleanDefaultLabel(aria||first)
      parts.push(label?`${label}: ${selected}`:selected)
    }
  })

  const defectScope=document.querySelector('#room-list .selected-copy p')?.textContent?.trim()
  if(defectScope)parts.unshift(`ขอบเขต: ${defectScope}`)

  return Array.from(new Set(parts))
}

function printLocale(language:AppLanguage){
  if(language==='en')return 'en-GB'
  if(language==='ru')return 'ru-RU'
  return 'th-TH'
}

function preparePrint(reportTitle:string,language:AppLanguage){
  document.body.classList.add('report-print-mode')
  document.body.setAttribute('data-print-report',reportTitle)

  const now=new Intl.DateTimeFormat(printLocale(language),{
    timeZone:'Asia/Bangkok',
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date())+(language==='th'?' น.':'')

  const generated=document.querySelector('.report-print-generated-at')
  if(generated)generated.textContent=now

  const filters=collectPrintFilters()
  const summary=document.querySelector('.report-print-filter-summary')
  if(summary)summary.textContent=filters.length?filters.join(' • '):'ทั้งหมด'
}

export default function PrintButton({reportTitle}:{reportTitle:string}){
  const {language}=useI18n()
  useEffect(()=>{
    const before=()=>preparePrint(reportTitle,language)
    const after=()=>{
      document.body.classList.remove('report-print-mode')
      document.body.removeAttribute('data-print-report')
    }
    window.addEventListener('beforeprint',before)
    window.addEventListener('afterprint',after)
    return()=>{
      window.removeEventListener('beforeprint',before)
      window.removeEventListener('afterprint',after)
    }
  },[language,reportTitle])

  const print=()=>{
    preparePrint(reportTitle,language)
    window.requestAnimationFrame(()=>window.print())
  }

  return <button type="button" className="button report-print-button" onClick={print} aria-label={`พิมพ์รายงาน ${reportTitle}`}>🖨️ Print</button>
}
