import {createHmac, timingSafeEqual} from 'node:crypto'

/** Verify LINE HMAC over the original, unmodified HTTP request body. */
export function verifyLineWebhookSignature(rawBody:string, signature:string|null, secret:string):boolean {
  if(!secret||!signature||!/^[a-zA-Z0-9+/]+={0,2}$/.test(signature))return false
  const expected=createHmac('sha256',secret).update(rawBody,'utf8').digest()
  const received=Buffer.from(signature,'base64')
  return expected.length===received.length&&timingSafeEqual(expected,received)
}

export type LineAlert={category:'system'|'management'|'site';siteCode?:string}
export type LineRoutingConfig={ownerUserId?:string;mainGroupId?:string;siteGroupsJson?:string}

/** Fail-closed routing: unknown sites or missing owner/group never fall back to other audiences. */
export function resolveLineAlertDestination(alert:LineAlert,config:LineRoutingConfig):string|null {
  const validUser=(id:unknown):id is string=>typeof id==='string'&&/^U[0-9a-f]{32}$/i.test(id)
  const validGroup=(id:unknown):id is string=>typeof id==='string'&&/^C[0-9a-f]{32}$/i.test(id)
  if(alert.category==='system')return validUser(config.ownerUserId)?config.ownerUserId:null
  if(alert.category==='management')return validGroup(config.mainGroupId)?config.mainGroupId:null
  if(alert.category!=='site'||!alert.siteCode||!/^[A-Z0-9-]{2,32}$/.test(alert.siteCode))return null
  try{
    const groups=JSON.parse(config.siteGroupsJson||'{}')
    if(!groups||typeof groups!=='object'||Array.isArray(groups))return null
    const target=Object.prototype.hasOwnProperty.call(groups,alert.siteCode)?groups[alert.siteCode]:null
    return validGroup(target)?target:null
  }catch{return null}
}
