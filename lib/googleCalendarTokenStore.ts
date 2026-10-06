const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

async function rpc<T>(name:string,accessToken:string,body:Record<string,unknown>):Promise<T>{
  const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{
      apikey:SUPABASE_KEY,
      authorization:'Bearer '+accessToken,
      'content-type':'application/json',
    },
    body:JSON.stringify(body),
    cache:'no-store',
  })
  const text=await response.text()
  let parsed:unknown=null
  if(text){
    try{parsed=JSON.parse(text)}catch{parsed=text}
  }
  if(!response.ok){
    const message=typeof parsed==='object'&&parsed&&'message' in parsed?String((parsed as {message?:unknown}).message||''):String(parsed||'')
    throw new Error(message||('supabase_calendar_token_rpc_http_'+response.status))
  }
  return parsed as T
}

export async function storeEncryptedGoogleRefreshToken(accessToken:string,ciphertext:string){
  await rpc<null>('google_calendar_owner_token_upsert',accessToken,{p_ciphertext:ciphertext})
}

export async function getEncryptedGoogleRefreshToken(accessToken:string){
  const value=await rpc<string|null>('google_calendar_owner_token_get',accessToken,{})
  return typeof value==='string'&&value?value:null
}
