import {NextRequest,NextResponse} from 'next/server'
import {verifyLineWebhookSignature} from '@/lib/lineAutopilotSecurity'

export const runtime='nodejs'
export const dynamic='force-dynamic'

function respond(data:unknown,status:number){
  return NextResponse.json(data,{status,headers:{'cache-control':'no-store'}})
}

/**
 * Receiver-only preview. No storage, messages, account changes, or triggers.
 * Preserve any existing company LINE OA webhook until integration reviewed.
 */
export async function POST(request:NextRequest){
  const secret=process.env.LINE_CHANNEL_SECRET
  if(!secret)return respond({error:'line_channel_not_configured'},503)
  const raw=await request.text()
  if(Buffer.byteLength(raw,'utf8')>131072)return respond({error:'payload_too_large'},413)
  if(!verifyLineWebhookSignature(raw,request.headers.get('x-line-signature'),secret)){
    return respond({error:'invalid_signature'},401)
  }
  let data:unknown
  try{data=JSON.parse(raw)}catch{return respond({error:'invalid_json'},400)}
  if(!data||typeof data!=='object'||Array.isArray(data)){
    return respond({error:'invalid_payload'},400)
  }
  const body=data as {destination?:unknown;events?:unknown}
  if(typeof body.destination!=='string'||!Array.isArray(body.events)||body.events.length>100){
    return respond({error:'invalid_events'},400)
  }
  const expected=process.env.LINE_BOT_DESTINATION_ID
  if(expected&&expected!==body.destination)return respond({error:'wrong_destination'},403)
  // Do not log message bodies, user/group IDs, tokens, or raw webhook events.
  console.info('line_autopilot_webhook_verified',{eventCount:body.events.length})
  return respond({ok:true,processed:0,mode:'receiver_only'},200)
}
