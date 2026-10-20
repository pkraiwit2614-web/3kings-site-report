'use strict'
// LOCAL/CI staging reference only. Vercel route remains fail-closed:
// fs locks are not distributed between serverless instances.
const fs=require('node:fs/promises')
const path=require('node:path')
const {randomUUID}=require('node:crypto')
const {identity,planExpressDelta}=require('./delta.cjs')
const MODES=new Set(['po_history','pr_history','po_daily','pr_daily'])
const SAFE_SHA=/^[a-f0-9]{64}$/
const MAX_DOCUMENTS=6000,MAX_LINES=60000

function validateImport({report,sourceMode,canonical}){
 if(!MODES.has(sourceMode)||!report||!Array.isArray(report.documents)||
   !Array.isArray(report.qa)||!SAFE_SHA.test(report.sourceSha256||'')||
   !Array.isArray(canonical))throw Error('ATOMIC_IMPORT_PREFLIGHT_REQUIRED')
 if((sourceMode.startsWith('po_')&&report.reportType!=='PO_PL')||
    (sourceMode.startsWith('pr_')&&report.reportType!=='PR_PC'))
   throw Error('ATOMIC_IMPORT_SOURCE_TYPE_MISMATCH')
 const lineCount=report.documents.reduce((total,d)=>total+(Array.isArray(d.items)?d.items.length:MAX_LINES+1),0)
 if(report.documents.length>MAX_DOCUMENTS||lineCount>MAX_LINES)
   throw Error('ATOMIC_IMPORT_LIMIT_EXCEEDED')
}
async function stageExpressAtomic({report,sourceMode,canonical,store}){
 // canonical must be a verified internal snapshot, NEVER taken from a public request.
 // store.transaction must hold one EXCLUSIVE lock through read/decision/commit,
 // and must roll back every insert when any step fails.
 validateImport({report,sourceMode,canonical})
 if(!store||typeof store.transaction!=='function')
   throw Error('DISTRIBUTED_TRANSACTION_STORE_REQUIRED')
 return store.transaction(sourceMode,async tx=>{
  const prior=await tx.readAll()
  const delta=planExpressDelta(report,prior,canonical,
    {maxDocumentsPerPage:100,maxItemsPerPage:1000})
  if(delta.gate==='HOLD_SOURCE_INTEGRITY')
   return {result:'HOLD_SOURCE_INTEGRITY',inserted:0,summary:delta.summary,
    sourceSha256:report.sourceSha256}
  const plans=delta.pages.flat(),byKey=new Map(report.documents.map(d=>[identity(d),d]))
  let inserted=0
  for(const p of plans){
   if(p.decision!=='new_candidate')continue
   const d=byKey.get(p.key)
   if(!d)throw Error('ATOMIC_IMPORT_IDENTITY_MISMATCH')
   // One document identity regardless of multi-Plot tags. No costs/receipts copied.
   await tx.insert({poNo:d.poNo,supplierCode:d.supplierCode,
     fingerprint:p.fingerprint,sourceSha256:report.sourceSha256,
     projectCodes:[...d.projectCodes],lineCount:p.lineCount})
   inserted++
  }
  return {result:inserted?'STAGED_ATOMIC_LOCAL':'NO_CHANGE',
   inserted,summary:delta.summary,sourceSha256:report.sourceSha256,
   receiptEvidence:'unverified',productionWritesAllowed:false}
 })
}

/**
 * Real filesystem atomic staging for isolated CI/desktop test runs.
 * One exclusive O_EXCL file lock per source mode + temp fsync + atomic rename.
 * NEVER use this store on Vercel, for distributed workers, or for real PO data.
 */
class LocalAtomicStagingStore{
 constructor(directory){if(!path.isAbsolute(directory))throw Error('STAGING_DIRECTORY_MUST_BE_ABSOLUTE');this.directory=directory}
 file(mode){if(!MODES.has(mode))throw Error('INVALID_STAGING_MODE');return path.join(this.directory,mode+'.json')}
 async readAll(mode){
  const filename=this.file(mode)
  let raw
  try{raw=await fs.readFile(filename,'utf8')}
  catch(e){if(e.code==='ENOENT')return [];throw e}
  const result=JSON.parse(raw)
  if(!Array.isArray(result)||result.length>MAX_DOCUMENTS)throw Error('STAGING_CORRUPT')
  const keys=new Set()
  for(const d of result){
   const key=identity(d)
   if(keys.has(key)||!SAFE_SHA.test(d.fingerprint||'')||
      !SAFE_SHA.test(d.sourceSha256||''))throw Error('STAGING_CORRUPT')
   keys.add(key)
  }
  return result
 }
 async transaction(mode,operation){
  if(process.env.VERCEL||process.env.VERCEL_ENV)
   throw Error('LOCAL_STAGE_FORBIDDEN_IN_HOSTED_RUNTIME')
  const filename=this.file(mode)
  await fs.mkdir(this.directory,{recursive:true,mode:0o700})
  const lockFile=filename+'.lock'
  let lock
  try{lock=await fs.open(lockFile,'wx',0o600)}
  catch(e){if(e.code==='EEXIST')throw Error('ATOMIC_STAGE_LOCK_BUSY');throw e}
  let temp
  try{
   const previous=await this.readAll(mode)
   const records=new Map(previous.map(d=>[identity(d),d]))
   let dirty=false
   const tx={
    readAll:async()=>[...records.values()],
    insert:async d=>{
     const key=identity(d)
     if(records.has(key)||!SAFE_SHA.test(d.fingerprint||'')||
       !SAFE_SHA.test(d.sourceSha256||''))throw Error('ATOMIC_STAGE_DUPLICATE_OR_INVALID')
     records.set(key,structuredClone(d));dirty=true
     if(records.size>MAX_DOCUMENTS)throw Error('ATOMIC_IMPORT_LIMIT_EXCEEDED')
    }
   }
   const result=await operation(tx)
   if(dirty){
    temp=filename+'.'+randomUUID()+'.tmp'
    const handle=await fs.open(temp,'wx',0o600)
    try{
     await handle.writeFile(JSON.stringify([...records.values()]))
     await handle.sync()
    }finally{await handle.close()}
    await fs.rename(temp,filename);temp=null
    const dir=await fs.open(this.directory,'r')
    try{await dir.sync()}finally{await dir.close()}
   }
   return result
  }finally{
   if(temp)await fs.unlink(temp).catch(()=>{})
   await lock.close()
   await fs.unlink(lockFile)
  }
 }
}
module.exports={stageExpressAtomic,LocalAtomicStagingStore}
