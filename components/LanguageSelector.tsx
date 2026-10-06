'use client'

import {APP_LANGUAGES,useI18n} from '@/components/I18nProvider'
import type {AppLanguage} from '@/lib/i18n'

export default function LanguageSelector({compact=false}:{compact?:boolean}){
  const {language,setLanguage}=useI18n()
  return <label className={compact?'language-selector compact':'language-selector'} data-i18n-skip>
    <span>Language</span>
    <select aria-label="Language" value={language} onChange={event=>setLanguage(event.currentTarget.value as AppLanguage)}>
      {APP_LANGUAGES.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  </label>
}
