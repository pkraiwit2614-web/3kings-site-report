/** Shared read-only room grouping for Hotel OOO/OOS and Defect searches. Must match DefectCombineRoomEnhancer and SQL membership migration. */
export const HOTEL_COMBINE_GROUPS: readonly (readonly string[])[] = [
  [
    "A213",
    "A214"
  ],
  [
    "A217",
    "A218"
  ],
  [
    "A221",
    "A222"
  ],
  [
    "A223",
    "A224",
    "A225"
  ],
  [
    "A308",
    "A309"
  ],
  [
    "A313",
    "A314"
  ],
  [
    "A317",
    "A318"
  ],
  [
    "A402",
    "A403"
  ],
  [
    "A404",
    "A405"
  ],
  [
    "A413",
    "A414"
  ],
  [
    "A417",
    "A418"
  ],
  [
    "A506",
    "A507"
  ],
  [
    "A508",
    "A509"
  ],
  [
    "A513",
    "A514"
  ],
  [
    "A521",
    "A522"
  ],
  [
    "A602",
    "A603"
  ],
  [
    "A604",
    "A605"
  ],
  [
    "A606",
    "A607"
  ],
  [
    "A608",
    "A609"
  ],
  [
    "A613",
    "A614"
  ],
  [
    "A621",
    "A622"
  ],
  [
    "A623",
    "A624"
  ],
  [
    "A702",
    "A703"
  ],
  [
    "A704",
    "A705"
  ],
  [
    "A706",
    "A707"
  ],
  [
    "A708",
    "A709"
  ],
  [
    "A713",
    "A714"
  ],
  [
    "A717",
    "A718"
  ],
  [
    "B610",
    "B611"
  ],
  [
    "B614",
    "B615"
  ],
  [
    "B712",
    "B713"
  ]
] as const

const members = new Map<string,readonly string[]>(HOTEL_COMBINE_GROUPS.flatMap(group=>group.map(room=>[room,group] as const)))

/** Good01–Good05 are Hotel aliases for B101–B105, never separate room records. */
export function normalizeHotelRoom(value:string):string {
  const cleaned=String(value||'').trim().toUpperCase().replace(/[\s-]/g,'')
  const good=cleaned.match(/^GOOD0?([1-5])$/)
  if(good)return 'B10'+good[1]
  // Also accept a displayed label when it is copied back into a search or edit field.
  const labeled=cleaned.match(/^B10([1-5])\(GOOD0?\1\)$/)
  return labeled?'B10'+labeled[1]:cleaned
}

/** Extra name for display only; stored room IDs remain B101–B105. */
export function hotelRoomAlias(value:string):string|null {
  const match=normalizeHotelRoom(value).match(/^B10([1-5])$/)
  return match?'Good-0'+match[1]:null
}
export function hotelRoomLabel(value:string):string {
  const canonical=normalizeHotelRoom(value)
  const alias=hotelRoomAlias(canonical)
  return alias?canonical+' ('+alias+')':canonical
}
export function hotelRoomMembers(value:string):readonly string[]{
  const key=normalizeHotelRoom(value)
  return members.get(key)||[key]
}
export function hotelRoomKey(value:string):string {
  return hotelRoomMembers(value)[0]||normalizeHotelRoom(value)
}
export function hotelRoomMatchesSearch(room:string,query:string):boolean {
  const needles=query.split(/[,，\s]+/).map(normalizeHotelRoom).filter(Boolean)
  if(!needles.length)return true
  return needles.some(needle=>hotelRoomMembers(room).some(member=>member.includes(needle)))
}
