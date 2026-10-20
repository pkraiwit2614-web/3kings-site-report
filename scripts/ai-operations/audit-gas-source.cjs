'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function audit(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/ai-operations/gas-source-manifest.json'),'utf8'));
 if(manifest.mode!=='staging'||manifest.version!==1||!Array.isArray(manifest.paths))throw Error('INVALID_STAGING_MANIFEST');
 const seen=new Set();
 const files=manifest.paths.map(name=>{
  if(typeof name!=='string'||!name.endsWith('.gs')||name.includes('/')||name.includes('..')||seen.has(name))throw Error('UNSAFE_PATH');
  seen.add(name);
  const bytes=fs.readFileSync(path.join(root,'docs/apps-script',name));
  return {name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 });
 return {mode:'STAGING_READ_ONLY',liveProjects:'UNVERIFIED',files};
}
if(require.main===module)process.stdout.write(JSON.stringify(audit(),null,2)+'\n');
module.exports={audit};
