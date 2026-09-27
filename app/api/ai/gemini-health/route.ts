import { NextResponse } from 'next/server'

export const runtime='nodejs'
export const maxDuration=15

export async function GET(){
  const apiKey=(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||'').trim()
  if(!apiKey)return NextResponse.json({ok:false,configured:false,error:'gemini_key_missing'},{status:503})
  try{
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{
      headers:{'x-goog-api-key':apiKey},
      cache:'no-store',
      signal:AbortSignal.timeout(10000),
    })
    const json=await response.json().catch(()=>null) as any
    const models=Array.isArray(json?.models)?json.models:[]
    const hasDefault=models.some((m:any)=>String(m?.name||'').endsWith('/gemini-3.5-flash-lite'))
    return NextResponse.json({ok:response.ok,configured:true,status:response.status,defaultModelAvailable:hasDefault,modelCount:models.length,error:response.ok?null:(json?.error?.message||'gemini_request_failed')},{status:response.ok?200:502})
  }catch(error){
    return NextResponse.json({ok:false,configured:true,error:error instanceof Error?error.message:'gemini_health_failed'},{status:502})
  }
}
