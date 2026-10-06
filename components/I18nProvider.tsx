'use client'

import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react'
import {APP_LANGUAGES,isAppLanguage,LANGUAGE_STORAGE_KEY,translateText,type AppLanguage} from '@/lib/i18n'

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
const SKIP_SELECTOR='script,style,noscript,textarea,code,pre,[data-i18n-skip]'

function shouldSkip(element:Element|null){
  return Boolean(element?.closest(SKIP_SELECTOR))
}

function applyText(node:Text,language:AppLanguage){
  const parent=node.parentElement
  if(!parent||shouldSkip(parent))return
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
  const next=translateText(original,language)
  if(current!==next)node.data=next
  textLastApplied.set(node,next)
}

function applyAttribute(element:Element,name:string,language:AppLanguage){
  if(shouldSkip(element))return
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
  const next=translateText(item.original,language)
  if(current!==next)element.setAttribute(name,next)
  item.lastApplied=next
}

function applyElement(element:Element,language:AppLanguage){
  if(shouldSkip(element))return
  for(const name of TRANSLATABLE_ATTRS)applyAttribute(element,name,language)
}

function applySubtree(root:Node,language:AppLanguage){
  if(root.nodeType===Node.TEXT_NODE){
    applyText(root as Text,language)
    return
  }
  if(!(root instanceof Element)&&root!==document.body)return
  if(root instanceof Element&&shouldSkip(root))return

  if(root instanceof Element)applyElement(root,language)
  const scope=root instanceof Element?root:document.body
  const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT)
  let node=walker.nextNode()
  while(node){applyText(node as Text,language);node=walker.nextNode()}
  scope.querySelectorAll('*').forEach(element=>applyElement(element,language))
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
    return()=>observer.disconnect()
  },[language])

  const t=useCallback((value:string)=>translateText(value,language),[language])
  const value=useMemo(()=>({language,setLanguage,t}),[language,setLanguage,t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(){
  return useContext(I18nContext)
}

export {APP_LANGUAGES}
