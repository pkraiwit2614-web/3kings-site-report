'use client'

import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react'
import {APP_LANGUAGES,isAppLanguage,LANGUAGE_STORAGE_KEY,translateText,type AppLanguage} from '@/lib/i18n'
import {getSupabase} from '@/lib/supabase'

type I18nContextValue={
  language:AppLanguage
  setLanguage:(language:AppLanguage)=>void
  t:(value:string)=>string
}

const I18nContext=createContext<I18nContextValue>({
  language:'th',
  setLanguage:()=>{},
  t:(value)=>value,
})

const textOriginal=new WeakMap<Text,string>()
const textLastApplied=new WeakMap<Text,string>()
const attrState=new WeakMap<Element,Map<string,{original:string;lastApplied:string}>>()
const TRANSLATABLE_ATTRS=['placeholder','title','aria-label','aria-placeholder'] as const
const TEXT_SKIP_SELECTOR='script,style,noscript,textarea,code,pre,[data-i18n-skip]'
const ATTR_SKIP_SELECTOR='script,style,noscript,code,pre,[data-i18n-skip]'
const THAI_RE=/[\u0E00-\u0E7F]/
const UNTRANSLATED_THAI_RE=/(^|[\\s—,:;(\\[\\/])ช่าง|งาน|ติดตั้ง|รอ|เสร็จ|ทำ|เหลือ|เข้า|ส่ง|สั่ง|ตรวจ|แก้|วัสดุ|ของ|ระบบ|กระเบื้อง|สี|ห้อง|อาคาร|บันได|สระ|ประตู|ผนัง|พื้น|ฝ้า|น้ำ|ไฟ|ผู้รับเหมา|กำหนด|ติดตาม|จัดซื้อ|จัดจ้าง|ส่งมอบ|ปิด|เปิด|ขน|เตรียม|เท|ปรับ|เก็บ|ล้าง|ซ่อม|รื้อ|เจาะ|เดินท่อ|ทดสอบ|ทำความสะอาด|ยังไม่|เรียบร้อย|รอของ|นัด|ทั้งหมด|ล่าสุด|วันนี้|เมื่อวาน|พรุ่งนี้|รายการ|รายละเอียด|หมายเหตุ|สถานะ|ผู้รับผิดชอบ|ค้นหา|เลือก|เพิ่ม|ลบ|บันทึก|ยืนยัน|ยกเลิก|ลองใหม่|กำลังโหลด|ไม่สำเร็จ|ไม่มี|ค้าง|จำนวน|วันที่|เวลา|หน้างาน|ความคืบหน้า|เป้าหมาย|แผนงาน|แรงงาน|ค่าแรง|จัดส่ง|รับของ|ตรวจรับ|อนุมัติ|ประมาณ|คาดว่า|แล้วเสร็จ|เริ่ม|สิ้นสุด)/
const PROTECTED_NAME_HINT_RE=/(บริษัท|หจก\\.?|จำกัด|การช่าง|ก่อสร้าง|คอนสตรัคชั่น|construction|co\\.?\\s*ltd|supplier|vendor)/i
const CACHE_VERSION='v3-complete-language'
const MAX_CACHE_ENTRIES=320
const MAX_CACHE_CHARS=360000
const dynamicCache=new Map<string,string>()
let enqueueDynamicTranslation:(source:string)=>void=()=>{}

function cacheKey(language:AppLanguage,source:string){
  return `${language}:${source.normalize('NFC').trim()}`
}

function preserveOuterWhitespace(original:string,translated:string){
  const lead=original.match(/^\s*/)?.[0]||''
  const tail=original.match(/\s*$/)?.[0]||''
  return lead+translated+tail
}

function containsUntranslatedThai(value:string){
  return THAI_RE.test(value)&&UNTRANSLATED_THAI_RE.test(value)
}

function isLikelyProtectedName(value:string){
  return PROTECTED_NAME_HINT_RE.test(value)&&!/(ติดตั้ง|รอ|เสร็จ|ทำ|เหลือ|ส่ง|สั่ง|ตรวจ|แก้|ระบบ|กำหนด|ติดตาม|จัดซื้อ|จัดจ้าง|ส่งมอบ|ขน|เตรียม|เท|ปรับ|เก็บ|ล้าง|ซ่อม|รื้อ|เจาะ|ทดสอบ|ทำความสะอาด|ยังไม่|ค้าง)/.test(value)
}

function shouldAcceptDynamicTranslation(source:string,translated:string){
  const sourceTrim=source.trim()
  const translatedTrim=translated.trim()
  if(!translatedTrim)return false
  if(!THAI_RE.test(sourceTrim))return true
  if(translatedTrim===sourceTrim){
    if(isLikelyProtectedName(sourceTrim))return true
    return !containsUntranslatedThai(sourceTrim)
  }
  return !containsUntranslatedThai(translatedTrim)
}

function translateForRender(value:string,language:AppLanguage){
  const staticTranslation=translateText(value,language)
  if(language==='th'||!THAI_RE.test(staticTranslation))return staticTranslation
  const source=value.trim()
  if(!source)return value
  const cached=dynamicCache.get(cacheKey(language,source))
  if(cached)return preserveOuterWhitespace(value,cached)
  enqueueDynamicTranslation(source)
  return staticTranslation
}

function shouldSkipText(element:Element|null){
  return Boolean(element?.closest(TEXT_SKIP_SELECTOR))
}

function shouldSkipAttribute(element:Element|null){
  return Boolean(element?.closest(ATTR_SKIP_SELECTOR))
}

function applyText(node:Text,language:AppLanguage){
  const parent=node.parentElement
  if(!parent||shouldSkipText(parent))return
  const current=node.data
  let original=textOriginal.get(node)
  const last=textLastApplied.get(node)
  if(original===undefined){
    original=current
    textOriginal.set(node,current)
  }else if(last!==undefined&&current!==last){
    original=current
    textOriginal.set(node,current)
  }
  const next=translateForRender(original,language)
  if(current!==next)node.data=next
  textLastApplied.set(node,next)
}

function applyAttribute(element:Element,name:string,language:AppLanguage){
  if(shouldSkipAttribute(element))return
  const current=element.getAttribute(name)
  if(current===null)return
  let state=attrState.get(element)
  if(!state){state=new Map();attrState.set(element,state)}
  let item=state.get(name)
  if(!item){
    item={original:current,lastApplied:current}
    state.set(name,item)
  }else if(current!==item.lastApplied){
    item.original=current
  }
  const next=translateForRender(item.original,language)
  if(current!==next)element.setAttribute(name,next)
  item.lastApplied=next
}

function applyElement(element:Element,language:AppLanguage){
  if(shouldSkipAttribute(element))return
  for(const name of TRANSLATABLE_ATTRS)applyAttribute(element,name,language)
}

function applySubtree(root:Node,language:AppLanguage){
  if(root.nodeType===Node.TEXT_NODE){
    applyText(root as Text,language)
    return
  }
  if(!(root instanceof Element)&&root!==document.body)return
  if(root instanceof Element&&shouldSkipAttribute(root))return

  if(root instanceof Element)applyElement(root,language)
  if(root instanceof Element&&shouldSkipText(root))return
  const scope=root instanceof Element?root:document.body
  const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT)
  let node=walker.nextNode()
  while(node){applyText(node as Text,language);node=walker.nextNode()}
  scope.querySelectorAll('*').forEach(element=>applyElement(element,language))
}

function loadCache(language:AppLanguage){
  if(language==='th')return
  try{
    const raw=window.sessionStorage.getItem(`3kings:i18n-cache:${CACHE_VERSION}:${language}`)
    if(!raw)return
    const rows=JSON.parse(raw)
    if(!Array.isArray(rows))return
    for(const row of rows){
      if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||typeof row[1]!=='string')continue
      if(shouldAcceptDynamicTranslation(row[0],row[1]))dynamicCache.set(cacheKey(language,row[0]),row[1])
    }
  }catch{}
}

function saveCache(language:AppLanguage){
  if(language==='th')return
  try{
    const prefix=`${language}:`
    const rows:Array<[string,string]>=[]
    let chars=0
    for(const [key,value] of Array.from(dynamicCache.entries()).reverse()){
      if(!key.startsWith(prefix))continue
      const source=key.slice(prefix.length)
      const nextChars=source.length+value.length
      if(rows.length>=MAX_CACHE_ENTRIES||chars+nextChars>MAX_CACHE_CHARS)break
      rows.push([source,value])
      chars+=nextChars
    }
    rows.reverse()
    window.sessionStorage.setItem(`3kings:i18n-cache:${CACHE_VERSION}:${language}`,JSON.stringify(rows))
  }catch{}
}

export default function I18nProvider({children}:{children:ReactNode}){
  const [language,setLanguageState]=useState<AppLanguage>('th')

  useEffect(()=>{
    const stored=window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if(isAppLanguage(stored))setLanguageState(stored)
  },[])

  const setLanguage=useCallback((next:AppLanguage)=>{
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY,next)
    setLanguageState(next)
  },[])

  useEffect(()=>{
    let cancelled=false
    let timer:number|null=null
    let flushing=false
    const pending=new Set<string>()
    const failedUntil=new Map<string,number>()

    loadCache(language)

    const scheduleFlush=()=>{
      if(cancelled||language==='th'||flushing||timer!==null||!pending.size)return
      timer=window.setTimeout(()=>{
        timer=null
        void flush()
      },90)
    }

    const enqueue=(source:string)=>{
      if(cancelled||language==='th'||!source||!THAI_RE.test(source))return
      if(source.length>5000)return
      if(dynamicCache.has(cacheKey(language,source)))return
      if((failedUntil.get(source)||0)>Date.now())return
      pending.add(source)
      scheduleFlush()
    }

    const flush=async()=>{
      if(cancelled||language==='th'||flushing||!pending.size)return
      flushing=true
      const batch:string[]=[]
      let totalChars=0
      for(const source of pending){
        if(batch.length>=30)break
        if(batch.length&&totalChars+source.length>14000)break
        pending.delete(source)
        batch.push(source)
        totalChars+=source.length
      }

      try{
        const {data}=await getSupabase().auth.getSession()
        const token=data.session?.access_token
        if(!token){
          batch.forEach(source=>failedUntil.set(source,Date.now()+10_000))
          return
        }

        const response=await fetch('/api/i18n/translate',{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            Authorization:`Bearer ${token}`,
          },
          body:JSON.stringify({language,texts:batch}),
          cache:'no-store',
        })
        if(!response.ok)throw new Error(`TRANSLATE_${response.status}`)
        const payload=await response.json()
        const translations=payload?.translations
        if(!Array.isArray(translations)||translations.length!==batch.length)throw new Error('TRANSLATE_SHAPE')

        batch.forEach((source,index)=>{
          const translated=translations[index]
          if(typeof translated==='string'&&shouldAcceptDynamicTranslation(source,translated)){
            dynamicCache.set(cacheKey(language,source),translated.trim())
          }else{
            failedUntil.set(source,Date.now()+15_000)
          }
        })
        saveCache(language)
        if(!cancelled)applySubtree(document.body,language)
      }catch{
        batch.forEach(source=>failedUntil.set(source,Date.now()+60_000))
      }finally{
        flushing=false
        if(!cancelled&&pending.size)scheduleFlush()
      }
    }

    enqueueDynamicTranslation=enqueue
    document.documentElement.lang=language
    document.documentElement.dataset.i18nLang=language
    applySubtree(document.body,language)

    const observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        if(mutation.type==='characterData'){
          applyText(mutation.target as Text,language)
          continue
        }
        if(mutation.type==='attributes'&&mutation.target instanceof Element&&mutation.attributeName){
          applyAttribute(mutation.target,mutation.attributeName,language)
          continue
        }
        mutation.addedNodes.forEach(node=>applySubtree(node,language))
      }
    })

    observer.observe(document.body,{
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true,
      attributeFilter:[...TRANSLATABLE_ATTRS],
    })

    return()=>{
      cancelled=true
      if(timer!==null)window.clearTimeout(timer)
      observer.disconnect()
      if(enqueueDynamicTranslation===enqueue)enqueueDynamicTranslation=()=>{}
    }
  },[language])

  const t=useCallback((value:string)=>translateForRender(value,language),[language])
  const value=useMemo(()=>({language,setLanguage,t}),[language,setLanguage,t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(){
  return useContext(I18nContext)
}

export {APP_LANGUAGES}
