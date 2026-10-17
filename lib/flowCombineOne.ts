import {hotelRoomKey,normalizeHotelRoom} from './hotelRoomGroups'

/**
 * Source: "อัพเดทห้องของโรงแรม Defect.xlsx" (Hotel Engineer, 17 Oct 2026).
 * Its 128 hotel entries expand to 144 physical rooms: precisely 16 confirmed
 * pairs. Other physical pairs in the general Condo Combine map must NOT be
 * collapsed in the hotel portion of Flow Combine = 1.
 * This read-only Flow counting rule never modifies room identities/statuses.
 */
export const HOTEL_ENGINEER_COMBINE_PAIRS: readonly (readonly [string,string])[] = [
  ['A213','A214'],['A217','A218'],['A308','A309'],['A317','A318'],
  ['A402','A403'],['A413','A414'],['A417','A418'],['A508','A509'],
  ['A513','A514'],['A602','A603'],['A613','A614'],['A621','A622'],
  ['A702','A703'],['A706','A707'],['B610','B611'],['B614','B615'],
] as const

const hotelEngineerKeys=new Map<string,string>(
  HOTEL_ENGINEER_COMBINE_PAIRS.flatMap(([first,second])=>[[first,first],[second,first]])
)

/**
 * Hotel: engineer-confirmed pairs only (144 physical => 128 room units).
 * Non-hotel: existing Condo Combine room map, without changing its source.
 * Keep sectors separate even if future room participation flags change.
 */
export function flowCombineKey(room:string,hotelParticipation:string):string {
  const normalized=normalizeHotelRoom(room)
  if(hotelParticipation==='ร่วมโรงแรม')return hotelEngineerKeys.get(normalized)||normalized
  if(hotelParticipation==='ไม่ร่วมโรงแรม')return hotelRoomKey(normalized)
  return normalized
}
