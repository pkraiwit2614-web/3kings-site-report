'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const worker=fs.readFileSync(path.join(__dirname,'../operations/cloudflare/3kings-line-autopilot-owner-only.mjs'),'utf8');
const edge=fs.readFileSync(path.join(__dirname,'../operations/supabase/kings_daily_line_images-owner-only.ts'),'utf8');
test('worker uses authenticated daily bridge for owner claims, never direct Supabase RPC',()=>{
 const schedule=worker.slice(worker.lastIndexOf('async scheduled('));
 assert.match(schedule,/dailyOwnerSummaryTick\(env,\{db:dailyLineRpc,hash:sha256hex\}\)/);
 assert.doesNotMatch(schedule,/dailySiteSendTick\(/);
 assert.doesNotMatch(schedule,/dailyOwnerSummaryTick\(env,\{db:sb/);
});
test('Edge only adds owner daily claim under authenticated private bridge and validated date/key',()=>{
 const part=edge.slice(edge.indexOf("if(kind==='line_autopilot_claim')"));
 assert.match(edge,/if\(!await auth\(req\)\)/);
 assert.match(part,/data\.args\.p_alert_kind!=='daily_site_report'/);
 assert.match(part,/data\.args\.p_target_scope==='owner'/);
 assert.match(part,/if\(!isDate\(date\)\)/);
 assert.match(part,/timeZone:'Asia\/Bangkok'/);
 assert.match(part,/weekday===0\|\|date!==reportDate/);
 assert.match(part,/crypto\.subtle\.digest\('SHA-256',keyBytes\)/);
 assert.match(part,/if\(data\.args\.p_event_key!==expected\)/);
 assert.match(part,/owner_key_forbidden/);
 assert.match(part,/else if\(data\.args\.p_target_scope!=='site_group'\)/);
});
test('Edge does not send LINE or alter message routes, images, or QA',()=>{
 assert.ok(edge.includes("'line_autopilot_daily_route','daily_line_record_delivery'"));
 assert.ok(edge.includes("'line_autopilot_claim','line_autopilot_ack'"));
 assert.ok(edge.includes("return json({error:'invalid_signature'},403)"));
 assert.ok(edge.includes("daily_line_image_read"));
 assert.doesNotMatch(edge,/api\.line\.me/);
});
