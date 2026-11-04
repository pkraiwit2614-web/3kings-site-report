'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(require('node:path').resolve(__dirname,'../docs/apps-script/ExpressBridgeMasterImporter_2026-10-22.gs'),'utf8');
const beforeSha='855e7e99e96a9734c44e221ccbaba0adcaa5c165b2b5b25ba356959439c209d5';
const beforeFp='6747a66b88622e300f45251120fccd4073d0b30a3556aba41732292ec5f1f0fa';
const nowFp='9d196d0eeb7f461771b20c1800d14bad05f40ba3c0705e89323c936e3aa5ca15';
const state={value:'OLD_CHECKPOINT',sourceFp:nowFp,db:{document_count:3768,line_count:13288},unchanged:true};
const props={getProperty:()=>state.value,setProperty:(k,v)=>{if(k!=='EXPRESS_BRIDGE_MASTER_REGISTER_LAST_XML_SHA_V1')throw Error('SCOPE');state.value=v}};
const context=vm.createContext({
 console:{log:()=>{}},
 EB_dbFingerprint_:()=>state.sourceFp,
 expressQueueDBComplete20261102_:fp=>fp===beforeFp?state.db:null,
 EB_qaVerifyFolderUnchanged_:()=>{if(!state.unchanged)throw Error('SOURCE_FOLDER_CHANGED_DURING_IMPORT')}
});
new vm.Script(src).runInContext(context);
context.props=props;context.current='VERIFIED_XML_SHA_PAIR';context.sha=beforeSha;context.files=Array(21).fill({});
const run=()=>vm.runInContext('EB_masterReconcileVerifiedCheckpoint20261104_(props,current,sha,files)',context);
run();assert.equal(state.value,'VERIFIED_XML_SHA_PAIR','only checkpoint is repaired');
state.value='OLD_CHECKPOINT';context.sha='f'.repeat(64);assert.throws(run,/MASTER_REGISTER_MANUAL_EDIT_OR_STATE_MISSING_HOLD/);assert.equal(state.value,'OLD_CHECKPOINT');
context.sha=beforeSha;state.sourceFp='f'.repeat(64);assert.throws(run,/MASTER_REGISTER_MANUAL_EDIT_OR_STATE_MISSING_HOLD/);assert.equal(state.value,'OLD_CHECKPOINT');
state.sourceFp=nowFp;state.db=null;assert.throws(run,/EXPRESS_CHECKPOINT_PREVIOUS_DB_PROOF_MISSING_HOLD/);assert.equal(state.value,'OLD_CHECKPOINT');
state.db={document_count:3768,line_count:13288};state.unchanged=false;assert.throws(run,/SOURCE_FOLDER_CHANGED_DURING_IMPORT/);assert.equal(state.value,'OLD_CHECKPOINT');
state.unchanged=true;context.files=Array(20).fill({});assert.throws(run,/MASTER_REGISTER_MANUAL_EDIT_OR_STATE_MISSING_HOLD/);assert.equal(state.value,'OLD_CHECKPOINT');
assert.match(src,/if\(!isWrite\)throw Error\('MASTER_REGISTER_MANUAL_EDIT_OR_STATE_MISSING_HOLD'\)/);
assert.match(src,/EB_masterReconcileVerifiedCheckpoint20261104_\(prop,current,srcHash,sources\)/);
console.log('PASS: checkpoint recovery only for pinned Master SHA, 21 canonical sources, 19-row DB complete, stable folder, and actual owner write');