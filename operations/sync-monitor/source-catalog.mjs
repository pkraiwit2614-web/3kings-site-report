/**
 * Source whitelist from confirmed 3 Kings operational Source/Sync logs.
 * Prevents accidental delivery of test.xlsx or non-master QA artifacts.
 * A non-whitelisted record must be logged as an observer anomaly, never sent
 * as a canonical Master sync success or failure.
 */
export const CANONICAL_SYNC_SOURCES=Object.freeze({
 defects:Object.freeze(['Handover_Defect_Summary_Updated_28-09-2026.xlsx']),
 materials:Object.freeze(['ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx']),
 photos:Object.freeze(['Picture Progress']),
 schedule:Object.freeze([
  'Above Villa Plot6 Construction Progress_Updated_2026-09-21.xlsx',
  'Above Villa Plot7 Construction Progress_Updated_2026-09-21.xlsx',
  'Above Villa Plot8 Construction Progress_Updated_2026-09-21.xlsx',
  'Above Villa Plot9 Construction Progress_Updated_2026-09-21.xlsx'
 ])
});
export function isCanonicalSyncSource(type,file){
 return Object.prototype.hasOwnProperty.call(CANONICAL_SYNC_SOURCES,type) &&
  typeof file==='string' && CANONICAL_SYNC_SOURCES[type].includes(file);
}
