const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

const filename=path.join(__dirname,'../lib/embedRenderedSvgFonts.ts')
const moduleForTest={exports:{}}
new Function('module','exports',ts.transpileModule(fs.readFileSync(filename,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText)(moduleForTest,moduleForTest.exports)
const {embedRenderedSvgFonts}=moduleForTest.exports

function fixture({font='"__Noto_Sans_Thai_demo", sans-serif',face=true}={}){
  const calls=[]
  const group={setAttribute(name,value){calls.push(['group',name,value])}}
  const source={querySelectorAll(){return [{}]}}
  const clone={
    style:{fontFamily:''},firstChild:{},
    querySelectorAll(){return [group]},
    insertBefore(node){calls.push(['style',node.textContent])},
  }
  const rule={
    type:5,
    style:{fontFamily:'"__Noto_Sans_Thai_demo"',src:'url("/_next/static/media/noto.woff2")'},
    cssText:'@font-face{font-family:"__Noto_Sans_Thai_demo";font-weight:100 900;src:url("/_next/static/media/noto.woff2") format("woff2");unicode-range:U+0E00-0E7F}',
  }
  globalThis.CSSRule={FONT_FACE_RULE:5,IMPORT_RULE:3}
  globalThis.document={
    fonts:{ready:Promise.resolve()},
    baseURI:'https://example.com/defect-flow',
    styleSheets:[{href:'https://example.com/_next/static/css/app.css',cssRules:face?[rule]:[]}],
    createElementNS(){return {textContent:''}},
  }
  globalThis.getComputedStyle=()=>({fontFamily:font})
  globalThis.fetch=async url=>{
    calls.push(['fetch',url])
    return {ok:true,blob:async()=>new Blob(['FONT'],{type:'font/woff2'})}
  }
  globalThis.FileReader=class {
    readAsDataURL(){this.result='data:font/woff2;base64,Rk9OVA==';this.onload()}
  }
  return {source,clone,calls}
}

test('PNG export embeds next/font Noto Sans Thai bytes while preserving the exact text family',async()=>{
  const f=fixture()
  await embedRenderedSvgFonts(f.source,f.clone)
  assert.equal(f.clone.style.fontFamily,'"__Noto_Sans_Thai_demo", sans-serif')
  assert.ok(f.calls.some(c=>c[0]==='group'&&c[2]==='"__Noto_Sans_Thai_demo", sans-serif'))
  assert.ok(f.calls.some(c=>c[0]==='fetch'&&c[1]==='https://example.com/_next/static/media/noto.woff2'))
  const embedded=f.calls.find(c=>c[0]==='style')?.[1]
  assert.match(embedded,/data:font\/woff2;base64,Rk9OVA==/)
  assert.match(embedded,/unicode-range:U\+0E00-0E7F/)
  assert.match(embedded,/font-weight:100 900/)
})

test('Missing generated next/font face blocks misleading PNG export instead of substituting another font',async()=>{
  const f=fixture({face:false})
  await assert.rejects(embedRenderedSvgFonts(f.source,f.clone),/active web font could not be found/)
  assert.ok(!f.calls.some(c=>c[0]==='style'))
})

test('System-font-only diagrams still export without unnecessary network requests',async()=>{
  const f=fixture({font:'Tahoma, sans-serif',face:false})
  await embedRenderedSvgFonts(f.source,f.clone)
  assert.equal(f.clone.style.fontFamily,'Tahoma, sans-serif')
  assert.ok(!f.calls.some(c=>c[0]==='fetch'))
})
