'use client'
import {getSupabase} from '@/lib/supabase'
import {setBrowserPermissions,type PermissionSnapshot} from '@/lib/accessControl'
export const PERMISSION_EVENT='3kings:permissions-changed'
let pending:Promise<PermissionSnapshot>|null=null
let last:PermissionSnapshot|null=null
let loadedAt=0
export function applyPermissionSnapshot(value:PermissionSnapshot){
  const changed=last?.revision!==value.revision
  last=value;loadedAt=Date.now();setBrowserPermissions(value)
  if(changed)window.dispatchEvent(new Event(PERMISSION_EVENT))
}
export async function loadPermissions(force=false):Promise<PermissionSnapshot>{
  if(!force&&last&&Date.now()-loadedAt<2000)return last
  if(pending)return pending
  pending=(async()=>{
    const {data,error}=await getSupabase().rpc('role_permission_matrix_read')
    if(error||!data||!Array.isArray(data.rows))throw new Error('ไม่สามารถตรวจสอบสิทธิ์ล่าสุดได้ กรุณาลองใหม่')
    applyPermissionSnapshot(data as PermissionSnapshot)
    return data as PermissionSnapshot
  })()
  try{return await pending}finally{pending=null}
}
