import { NextResponse } from 'next/server'
import { getVercelOidcToken } from '@vercel/oidc'

export const runtime='nodejs'

export async function GET(){
  try{
    const apiKey=process.env.AI_GATEWAY_API_KEY
    const token=apiKey||await getVercelOidcToken()
    return NextResponse.json({ok:Boolean(token),auth:apiKey?'api_key':'oidc'})
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:'unknown_error'},{status:500})
  }
}
