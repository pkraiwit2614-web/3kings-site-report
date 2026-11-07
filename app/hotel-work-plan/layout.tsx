import {notFound} from 'next/navigation'

// Route deliberately retired. Keep historical page/source for non-destructive rollback.
// This server-side boundary prevents direct URLs from mounting the old UI or querying Supabase.
export default function RetiredHotelModuleLayout(){
  notFound()
}
