import {hotelRoomKey} from './hotelRoomGroups'

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

/**
 * Flow Combine=1 reads exactly the same authoritative Combine groups as
 * OOO/OOS, Defect search, and edits. The participation flag changes only
 * which branch is shown; it must not change the room identity.
 */
export function flowCombineKey(room:string,_hotelParticipation:string):string {
  return hotelRoomKey(room)
}
