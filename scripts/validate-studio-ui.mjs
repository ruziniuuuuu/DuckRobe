import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createLookLink } from '../src/shared-look.js';
async function revealControl(selector, target = page) {
  let panel;
  if (/data-language|#about-button|#export-look|#repository-link/.test(selector)) panel = 'app-more';
  else if (/data-theme|#filter-favorites/.test(selector)) panel = 'collection-filter';
  else if (/data-remove-item|#clear-look/.test(selector)) panel = 'wearing-panel';
  if (panel && !await target.locator('#' + panel).evaluate(el => el.open)) await target.locator('#' + panel + ' > summary').click();
  await target.locator(selector).click();
}
const url=process.env.DUCKROBE_URL||'http://localhost:5173/';
const output=path.resolve(process.env.DUCKROBE_QA_OUTPUT||'test-results/studio-ui');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(45000);
const errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
async function ready(){await page.waitForFunction(()=>window.duckrobe?.ready,null,{timeout:180000});}
async function check(name,run){if(process.env.DUCKROBE_STUDIO_CHECK&&!new RegExp(process.env.DUCKROBE_STUDIO_CHECK).test(name))return;try{await run();checks.push({name,status:'passed'});console.log('PASS',name);}catch(error){checks.push({name,status:'failed',error:error.message});console.error('FAIL',name,error.message);}}
async function layout(){return page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return{width:innerWidth,overflow:document.documentElement.scrollWidth,stage:rect('.fitting-room'),closet:rect('.closet'),viewer:rect('.viewer'),save:rect('#save-look'),export:rect('#export-look'),columns:getComputedStyle(document.querySelector('.outfit-grid')).gridTemplateColumns.split(' ').length,scroll:getComputedStyle(document.querySelector('#catalog-scroll')).overflowY,framing:window.duckrobe.preview.getFraming()};});}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await ready();
 await check('full character dominates desktop, two-column wardrobe and collapsed tools',async()=>{
  const d=await layout();assert.equal(d.framing,'full');assert.equal(d.columns,2);assert(d.overflow<=1440);assert(d.stage.width>d.closet.width);assert(d.viewer.height>230);assert(d.save.bottom<=900&&d.export.bottom<=900);
  for(const id of ['colors-panel','moves-panel'])assert.equal(await page.locator('#'+id).evaluate(e=>e.open),false);
  assert.equal(await page.locator('#repository-link').getAttribute('href'),'https://github.com/ruziniuuuuu/DuckRobe');
  await page.screenshot({path:path.join(output,'desktop.png')});
 });
 await check('collections and bilingual search remain usable with collapsed color tools',async()=>{
  const catalog=await page.evaluate(()=>window.duckrobe.OUTFITS.map(({id,en,name})=>({id,en,name})));
  const themes=await page.evaluate(()=>window.duckrobe.THEMES.map(t=>t.id));
  for(const id of themes){await revealControl(`[data-theme="${id}"]`, page);assert.equal(await page.locator('[data-outfit]').count(),10);}
  await revealControl('[data-theme="all"]', page);
  for(const text of [catalog[0].en,catalog[0].name]){await page.locator('#outfit-search').fill(text);assert(await page.locator(`[data-outfit="${catalog[0].id}"]`).isVisible());}
  await revealControl('[data-language="zh"]', page);await page.locator('#colors-panel > summary').click();assert(/\p{Script=Han}/u.test(await page.locator('#color-lock').innerText()));await page.keyboard.press('Escape');
  await page.locator('#outfit-search').fill('no-such-duck-qa-837');assert.equal(await page.locator('[data-outfit]').count(),0);await page.locator('#clear-filters').click();assert.equal(await page.locator('[data-outfit]').count(),100);await revealControl('[data-language="en"]', page);
 });
 await check('categories frame the edited part and manual framing remains available',async()=>{
  await page.locator('[data-slot="hat"]').click();assert.equal((await layout()).framing,'portrait');
  await page.locator('#frame-camera').click();assert.equal((await layout()).framing,'full');await page.locator('#frame-camera').click();assert.equal((await layout()).framing,'portrait');
  await page.waitForFunction(()=>{const p=window.duckrobe.preview;return p.camera.position.distanceTo(p.controls.target)<.5});
  await page.locator('[data-slot="eyewear"]').click();assert.equal((await layout()).framing,'portrait');
  await page.locator('[data-slot="legwear"]').click();assert.equal((await layout()).framing,'full');
  await page.locator('[data-slot="all"]').click();await page.locator('[data-outfit="butter-walk"] .card-open').click();assert.equal((await layout()).framing,'full');
 });
 await check('exclusive panels, Escape focus, native color input and manual action dismissal',async()=>{
  await page.locator('#colors-panel > summary').click();assert(await page.locator('#shell-color').isVisible());
  await page.locator('#shell-color').evaluate(input=>{input.value='#fa792b';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>window.duckrobe.state.colors.shell),'#fa792b');
  await page.locator('#moves-panel > summary').click();await page.waitForFunction(()=>!document.querySelector('#colors-panel').open);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#moves-panel').evaluate(e=>e.open),false);assert(await page.locator('#moves-panel > summary').evaluate(e=>e===document.activeElement));
  await page.locator('#moves-panel > summary').click();await page.locator('[data-action="hop"]').click();assert.equal(await page.locator('#moves-panel').evaluate(e=>e.open),false);assert.equal((await layout()).framing,'full');
 });
 await check('laptop, narrow desktop, tablet and mobile retain comfortable columns in both languages',async()=>{
  for(const [width,height,columns] of [[1366,768,2],[1200,800,2],[768,1024,2],[390,844,3],[340,844,3],[390,667,3],[844,390,3]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   for(const language of ['en','zh']){
    await revealControl(`[data-language="${language}"]`, page);const d=await layout();assert(d.overflow<=width+1,JSON.stringify(d));assert.equal(d.columns,columns);
    assert.equal(d.scroll,'auto');assert(d.save.bottom<=height+1,JSON.stringify(d));assert(d.viewer.height>60,JSON.stringify(d));await page.keyboard.press('Escape');
    await page.locator('#colors-panel > summary').click();const bounds=await page.locator('#colors-panel .studio-panel-content').boundingBox();assert(bounds.x>=-1&&bounds.x+bounds.width<=width+1);await page.keyboard.press('Escape');
   }
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,`viewport-${width}.png`)});
  }
 });
 await check('full framing contains tall hats and wings, and reduced motion keeps camera changes immediate',async()=>{
  await page.setViewportSize({width:1440,height:900});
  const framed=await page.evaluate(async()=>{
   const app=window.duckrobe,p=app.preview;p.setMotion(false);
   const results=[];
   for(const id of ['library-spell','moon-garden','satellite-letter']){
    app.selectLook(id);p.setFraming('full',{immediate:true});p.camera.updateMatrixWorld(true);
    const native=p.rig.group;native.updateMatrixWorld(true);
    let minY=Infinity,maxY=-Infinity,minX=Infinity,maxX=-Infinity;
    native.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;const position=mesh.geometry.getAttribute('position');const v=mesh.position.clone();for(let i=0;i<position.count;i++){v.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).project(p.camera);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);}});
    results.push({id,minY,maxY,minX,maxX});
   }return results;
  });
  for(const frame of framed)assert(frame.minY> -1&&frame.maxY<1&&frame.minX> -1&&frame.maxX<1,JSON.stringify(frame));
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload({waitUntil:'domcontentloaded'});await ready();assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('#frame-camera').click();const a=await page.evaluate(()=>window.duckrobe.preview.camera.position.toArray());await page.waitForTimeout(250);const b=await page.evaluate(()=>window.duckrobe.preview.camera.position.toArray());assert(a.every((x,i)=>Math.abs(x-b[i])<1e-7));
 });

 await check('undo restores appearance and color intent without reverting filters or saved looks', async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('[data-slot="all"]').click();
  await page.locator('[data-outfit="butter-walk"] .card-open').click();
  const snapshot=()=>page.evaluate(()=>({selection:structuredClone(window.duckrobe.state.selection),colors:{...window.duckrobe.state.colors},colorLocked:window.duckrobe.state.colorLocked}));
  const before=await snapshot();
  await page.locator('[data-outfit="harbour-day"] .card-open').click();
  await page.locator('#undo-look').click();assert.deepEqual(await snapshot(),before);
  await page.locator('#colors-panel > summary').click();
  await page.locator('#shell-color').evaluate(input=>{for(const value of ['#112233','#223344','#334455']){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal((await snapshot()).colorLocked,true);
  await page.locator('#undo-look').click();assert.deepEqual(await snapshot(),before);
  await page.locator('#random-button').click();await page.locator('#undo-look').click();assert.deepEqual(await snapshot(),before);
  await revealControl('#clear-look');assert.equal(await page.evaluate(()=>window.duckrobe.selectedItemIds(window.duckrobe.state.selection).length),0);
  await page.locator('#undo-look').click();assert.deepEqual(await snapshot(),before);
  await page.locator('#save-look').click();const count=await page.locator('#saved-count').innerText();
  await page.locator('[data-slot="hat"]').click();await page.locator('[data-item] .card-open').last().click();
  await page.keyboard.press('Control+z');assert.deepEqual(await snapshot(),before);assert.equal(await page.locator('#saved-count').innerText(),count);
  assert.equal(await page.locator('[data-slot="hat"]').getAttribute('aria-pressed'),'true');
  await page.locator('#saved-nav').click();await page.locator('[data-saved] .card-delete').first().click();await page.locator('#toast-undo').click();assert.equal(await page.locator('#saved-count').innerText(),count);
 });
 await check('shared links restore exact colors with undo, reject damaged links and offer manual copying',async()=>{
  await revealControl('[data-language="en"]');await page.locator('#wardrobe-nav').click();await page.locator('[data-slot="all"]').click();
  await page.locator('[data-outfit="harbour-day"] .card-open').click();
  const before=await page.evaluate(()=>({selection:structuredClone(window.duckrobe.state.selection),colors:{...window.duckrobe.state.colors}}));
  const shared=await page.evaluate(()=>({selection:window.duckrobe.OUTFITS[0].selection,colors:{shell:'#123456',accent:'#fedcba'}}));const link=createLookLink(shared,url);
  await page.goto(link);await page.waitForFunction(()=>window.duckrobe.state.colors.shell==='#123456');
  assert.equal(new URL(page.url()).hash,'');await page.locator('#undo-look').click();
  assert.deepEqual(await page.evaluate(()=>({selection:structuredClone(window.duckrobe.state.selection),colors:{...window.duckrobe.state.colors}})),before);
  await page.goto(url+'#look=invalid');await page.waitForFunction(()=>document.querySelector('#toast-message').textContent.includes('link'));
  assert.deepEqual(await page.evaluate(()=>({selection:structuredClone(window.duckrobe.state.selection),colors:{...window.duckrobe.state.colors}})),before);
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('permission denied')}}});});
  await page.locator('#app-more > summary').click();await page.locator('#share-look').click();
  assert(await page.locator('#share-link-field').isVisible());assert((await page.locator('#share-link-field').inputValue()).includes('#look=v1.'));await page.keyboard.press('Escape');
  // A fresh visit must accept the link even when local colors were locked.
  await page.goto('about:blank');await page.goto(link);await ready();assert.equal(await page.evaluate(()=>window.duckrobe.state.colors.shell),'#123456');
 });
 await check('mobile catalog scroll and three changes leave the preview in place',async()=>{
  await page.setViewportSize({width:390,height:844});await page.locator('#wardrobe-nav').click();await page.locator('[data-slot="all"]').click();
  const before=await page.locator('#viewer').boundingBox();
  for(const id of ['harbour-day','sunday-linen','butter-walk']) await page.locator(`[data-outfit="${id}"] .card-open`).click();
  await page.locator('[data-outfit] .card-open').last().scrollIntoViewIfNeeded();
  const after=await page.locator('#viewer').boundingBox();assert.deepEqual(after,before);assert.equal(await page.evaluate(()=>scrollY),0);
  assert(after.height>150);await page.screenshot({path:path.join(output,'mobile-scroll.png')});
 });
 await check('favorites filter dismisses itself and leaves the first result clickable',async()=>{
  await page.locator('#wardrobe-nav').click();await page.locator('[data-slot="all"]').click();
  await page.locator('[data-outfit="butter-walk"] .card-heart').click();
  await revealControl('#filter-favorites');assert.equal(await page.locator('#collection-filter').evaluate(el=>el.open),false);
  await page.locator('[data-outfit="butter-walk"] .card-heart').click();assert.equal(await page.locator('[data-outfit]').count(),0);
  await revealControl('#filter-favorites');assert.equal(await page.locator('[data-outfit]').count(),100);
 });
 await check('no browser errors',async()=>assert.deepEqual(errors,[]));
}finally{await writeFile(path.join(output,'validation.json'),JSON.stringify({url,checks,errors},null,2));await browser.close();}
assert(checks.every(check=>check.status==='passed'),'Studio UI checks failed');
