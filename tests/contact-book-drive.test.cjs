const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const vm=require('node:vm')
const {createHash,generateKeyPairSync}=require('node:crypto')
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048})
const privatePem=privateKey.export({type:'pkcs8',format:'pem'})

function client({initial='contact_id,category\r\n3KC-0001,ร้านค้า\r\n',initialVersion='42',canEdit=true,externalChange=false}={}){
  let content=initial,version=initialVersion
  let patched=0,tokenCalls=0,gets=0
  const calls=[]
  const fakeFetch=async(url,init={})=>{
    const target=String(url)
    calls.push({url:target,method:init.method||'GET'})
    if(target==='https://oauth2.googleapis.com/token'){
      tokenCalls++
      return new Response(JSON.stringify({access_token:'test-token',expires_in:3600}),{status:200})
    }
    if(target.includes('/upload/drive/v3/files/')){
      patched++
      content=String(init.body)
      version=String(Number(version)+1)
      return new Response(JSON.stringify({id:'test-file',version,modifiedTime:'2026-10-15T01:00:00.000Z'}),{status:200})
    }
    if(target.includes('alt=media')){
      const old=content
      if(externalChange)version=String(Number(version)+1)
      return new Response(old,{status:200})
    }
    if(target.includes('/drive/v3/files/')){
      return new Response(JSON.stringify({id:'test-file',mimeType:'text/csv',version,
        name:'Contact Book.csv',modifiedTime:'2026-10-15T00:00:00.000Z',
        md5Checksum:createHash('md5').update(content,'utf8').digest('hex'),capabilities:{canEdit}}),{status:200})
    }
    return new Response(null,{status:404})
  }
  const module={exports:{}}
  const src=fs.readFileSync('lib/contactBookDrive.ts','utf8').replace(
    /'1pea9ALaYxhVNvBzuGb615s7_M8rYesic'/g,"'test-file'"
  )
  const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const testEnv={VERCEL_ENV:'production',GOOGLE_CONTACT_BOOK_SERVICE_ACCOUNT_JSON:JSON.stringify({
    client_email:'contact-sync@test-project.iam.gserviceaccount.com',
    private_key:privatePem,token_uri:'https://oauth2.googleapis.com/token'
  })}
  vm.runInNewContext(compiled,{module,exports:module.exports,require:(name)=>{
    if(name==='node:crypto')return require('node:crypto')
    if(name==='@/lib/contactBook')return {CONTACT_BOOK_CSV_FILE_ID:'test-file'}
    throw Error('unexpected import '+name)
  },process:{env:testEnv},Date,URLSearchParams,Headers,Response,fetch:fakeFetch,Buffer,JSON,Error,Number,String,Boolean})
  return {api:module.exports,patches:()=>patched,tokenCalls:()=>tokenCalls,requests:()=>calls,version:()=>version,content:()=>content}
}
test('Drive GET verifies file ID, CSV MIME, version, checksum and edit capability',async()=>{
  const d=client()
  const got=await d.api.getContactCsvDrive()
  assert.equal(got.version,'42')
  assert.equal(got.canEdit,true)
  assert.equal(d.patches(),0)
  assert.equal(d.tokenCalls(),1)
})
test('Drive PATCH requires current file version, canEdit, and preserves same file ID',async()=>{
  const d=client()
  await assert.rejects(()=>d.api.writeContactCsvDrive('changed','41'),/version_conflict/)
  assert.equal(d.patches(),0)
  const result=await d.api.writeContactCsvDrive('changed','42')
  assert.equal(result.id,'test-file')
  assert.equal(d.patches(),1)
  const saved=await d.api.getContactCsvDrive()
  assert.equal(saved.csv,'changed')
  assert.equal(saved.version,'43')
})
test('Drive denies writes when permission is read-only',async()=>{
  const d=client({canEdit:false})
  await assert.rejects(()=>d.api.writeContactCsvDrive('changed','42'),/write_permission_denied/)
  assert.equal(d.patches(),0)
})
test('Drive GET rejects inconsistent reads when source changes midflight',async()=>{
  const d=client({externalChange:true})
  await assert.rejects(()=>d.api.getContactCsvDrive(),/changed_during_read/)
})
