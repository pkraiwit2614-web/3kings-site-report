import {notFound} from 'next/navigation'

/**
 * The Work Calendar page is retired from the 3 Kings Web App.
 * Keep the original page, API routes, linked procurement records, and event data
 * intact; this additive server layout blocks direct visits without code deletion.
 * Calendar GAS trigger/sync shutdown requires separate live Apps Script readback.
 */
export default function RetiredWorkCalendarLayout(){
  notFound()
}
