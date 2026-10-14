import type {SupabaseClient} from '@supabase/supabase-js'
import type {PermissionSnapshot} from '@/lib/accessControl'
// Request-local only: never put authorization snapshots in server module state.
export async function readPermissionSnapshot(client:SupabaseClient):Promise<PermissionSnapshot>{
 const {data,error}=await client.rpc('role_permission_matrix_read')
 if(error||!data||!Array.isArray(data.rows))throw new Error('PERMISSION_CHECK_UNAVAILABLE')
 return data as PermissionSnapshot
}
