import {NextRequest,NextResponse} from 'next/server'
import {authorizeCalendarApi} from '@/lib/googleCalendarApiAuth'
import {googleCalendarServiceConfigured,googleCalendarServiceFetch} from '@/lib/googleCalendarServer'
import {WORK_CALENDAR_IDS} from '@/lib/workCalendars'

export const runtime='nodejs'
export const dynamic='force-dynamic'

function noStore(body:unknown,status=200){
  return NextResponse.json(body,{status,headers:{'cache-control':'no-store'}})
}

function safeCalendarId(value:unknown){
  const id=String(value||'')
  return WORK_CALENDAR_IDS.has(id)?id:''
}

function safeEventId(value:unknown){
  const id=String(value||'').trim()
  return /^[A-Za-z0-9_\-]{4,1024}$/.test(id)?id:''
}

function cleanBody(value:any){
  const body:any={}
  const summary=String(value?.summary||'').trim().slice(0,500)
  if(!summary)throw new Error('event_title_required')
  body.summary=summary

  const description=String(value?.description||'').trim()
  if(description)body.description=description.slice(0,4000)

  if(value?.start?.date&&value?.end?.date){
    body.start={date:String(value.start.date).slice(0,10)}
    body.end={date:String(value.end.date).slice(0,10)}
    return body
  }

  if(value?.start?.dateTime&&value?.end?.dateTime){
    body.start={
      dateTime:String(value.start.dateTime).slice(0,40),
      timeZone:'Asia/Bangkok',
    }
    body.end={
      dateTime:String(value.end.dateTime).slice(0,40),
      timeZone:'Asia/Bangkok',
    }
    return body
  }

  throw new Error('event_time_required')
}

function calendarBase(calendarId:string){
  return 'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events'
}

async function requireAuth(request:NextRequest,mutate=false){
  const auth=await authorizeCalendarApi(request)
  if(!auth)return {error:noStore({error:'unauthorized'},401)}
  if(mutate&&!auth.editable)return {error:noStore({error:'forbidden'},403)}
  if(!googleCalendarServiceConfigured())return {error:noStore({error:'shared_calendar_not_configured'},503)}
  return {auth}
}

export async function GET(request:NextRequest){
  const gate=await requireAuth(request,false)
  if(gate.error)return gate.error

  const calendarId=safeCalendarId(request.nextUrl.searchParams.get('calendar_id'))
  const timeMin=String(request.nextUrl.searchParams.get('time_min')||'').trim()
  const timeMax=String(request.nextUrl.searchParams.get('time_max')||'').trim()
  if(!calendarId||!timeMin||!timeMax)return noStore({error:'invalid_query'},400)

  const params=new URLSearchParams({
    singleEvents:'true',
    orderBy:'startTime',
    maxResults:'2500',
    timeMin,
    timeMax,
  })

  try{
    const data=await googleCalendarServiceFetch<any>(calendarBase(calendarId)+'?'+params.toString())
    return noStore(data)
  }catch(error){
    const status=(error as Error&{status?:number}).status||502
    return noStore({error:(error as Error).message},status)
  }
}

export async function POST(request:NextRequest){
  const gate=await requireAuth(request,true)
  if(gate.error)return gate.error

  try{
    const input=await request.json()
    const calendarId=safeCalendarId(input?.calendarId)
    if(!calendarId)return noStore({error:'invalid_calendar'},400)
    const body=cleanBody(input?.event)
    const data=await googleCalendarServiceFetch<any>(calendarBase(calendarId),{
      method:'POST',
      body:JSON.stringify(body),
    })
    return noStore(data,201)
  }catch(error){
    const status=(error as Error&{status?:number}).status||400
    return noStore({error:(error as Error).message},status)
  }
}

export async function PATCH(request:NextRequest){
  const gate=await requireAuth(request,true)
  if(gate.error)return gate.error

  try{
    const input=await request.json()
    const calendarId=safeCalendarId(input?.calendarId)
    const eventId=safeEventId(input?.eventId)
    if(!calendarId||!eventId)return noStore({error:'invalid_target'},400)
    const body=cleanBody(input?.event)
    const data=await googleCalendarServiceFetch<any>(calendarBase(calendarId)+'/'+encodeURIComponent(eventId),{
      method:'PATCH',
      body:JSON.stringify(body),
    })
    return noStore(data)
  }catch(error){
    const status=(error as Error&{status?:number}).status||400
    return noStore({error:(error as Error).message},status)
  }
}

export async function DELETE(request:NextRequest){
  const gate=await requireAuth(request,true)
  if(gate.error)return gate.error

  try{
    const input=await request.json()
    const calendarId=safeCalendarId(input?.calendarId)
    const eventId=safeEventId(input?.eventId)
    if(!calendarId||!eventId)return noStore({error:'invalid_target'},400)

    await googleCalendarServiceFetch<null>(calendarBase(calendarId)+'/'+encodeURIComponent(eventId),{
      method:'DELETE',
    })
    return noStore({ok:true})
  }catch(error){
    const status=(error as Error&{status?:number}).status||400
    return noStore({error:(error as Error).message},status)
  }
}
