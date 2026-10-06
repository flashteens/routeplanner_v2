import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {root,oldRoot} from './legacy.js';
import {findRoute} from '../shared/router.js';
import {validateNetwork} from '../shared/network.js';
import {verifyImprovements} from './verify-improvements.js';
import {verifyMapRendering} from './verify-map-rendering.js';
import {verifyBlankEditor} from './verify-blank-editor.js';
import {verifyEditorDirections} from './verify-editor-directions.js';
import {verifyFieldHelp} from './verify-field-help.js';
import {verifyArrivalHelp} from './verify-arrival-help.js';
import {stationAppearance,labelDirection} from '../shared/station-symbol.js';

process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root,'.browser-cache');
const port=Number(process.env.VERIFY_PORT || 3030),origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',chunk=>log+=chunk);server.stderr.on('data',chunk=>log+=chunk);
let browser;
const errors=[];
async function checkOld(){
  // Git metadata can change between machines; preserve the original website hashes.
  const hashes=JSON.parse(await fs.readFile(root+'docs/legacy-hashes.json','utf8')).filter(item=>!item.file.startsWith('.git/'));
  for(const item of hashes){const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(oldRoot,item.file))).digest('hex');assert.equal(actual,item.sha256,`Legacy file changed: ${item.file}`);}
  console.log(`Verified ${hashes.length} legacy files remain unchanged.`);
}
async function waitFor(predicate,description,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Timed out: ${description}`);}
async function networkKeys(page){return page.evaluate(async()=>{const name=(await caches.keys()).find(key=>key.endsWith('-network'));if(!name)return[];return(await(await caches.open(name)).keys()).map(req=>new URL(req.url).pathname);});}
async function browserEnvironment(){
  // WSL may have no CJK fonts despite the Windows host already providing them.
  // Reuse two read-only host fonts; keep fontconfig's generated cache here.
  const files=['msjh.ttc','meiryo.ttc'],source='/mnt/c/Windows/Fonts/';
  if(process.platform!=='linux'||!await fs.access(source+files[0]).then(()=>true,()=>false))return process.env;
  const directory=path.join(process.env.PLAYWRIGHT_BROWSERS_PATH,'test-fonts');
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await fs.symlink(source+file,path.join(directory,file)).catch(e=>{if(e.code!=='EEXIST')throw e;});
  const config=path.join(process.env.PLAYWRIGHT_BROWSERS_PATH,'test-fonts.conf'),cache=path.join(process.env.PLAYWRIGHT_BROWSERS_PATH,'fontconfig-cache');
  const xml=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  await fs.writeFile(config,`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>/usr/share/fonts</dir><dir>${xml(directory)}</dir><cachedir>${xml(cache)}</cachedir><alias><family>sans-serif</family><prefer><family>DejaVu Sans</family><family>Microsoft JhengHei</family><family>Meiryo</family></prefer></alias><alias><family>system-ui</family><prefer><family>DejaVu Sans</family><family>Microsoft JhengHei</family><family>Meiryo</family></prefer></alias></fontconfig>`);
  return {...process.env,FONTCONFIG_FILE:config};
}
try{
  await waitFor(async()=>{try{return(await fetch(origin+'/api/systems')).ok;}catch{return false;}},'server startup');
  for(const[conf,from,to]of [['ftmc','NV','FH'],['ftmc_preview','NV','FH'],['trtc','BR01','R28'],['newisle','AZ','WF']]){
    const data=JSON.parse(await fs.readFile(root+`public/data/${conf}.json`,'utf8'));
    const response=await fetch(`${origin}/api/route?conf=${conf}&from=${from}&to=${to}`);
    assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');
    const result=await response.json();assert.deepEqual(result,JSON.parse(JSON.stringify(findRoute(data,from,to))));
    const html=await fetch(`${origin}/?conf=${conf}&from=${from}&to=${to}&lang=zh`).then(r=>r.text());
    assert.ok(html.includes('application/ld+json')&&html.includes(data.stations[from].names.zh));assert.ok(!html.includes('__ROUTE_CONTENT__'));
    const readable=await fetch(`${origin}/route?conf=${conf}&from=${from}&to=${to}&lang=ja`).then(r=>r.text());
    assert.ok(readable.includes('所要時間')&&readable.includes(data.stations[from].names.en));
  }
  for(const[url,status]of [['/api/route?from=bad&to=FH',400],['/api/route?from=NV&to=FH&criteria=fare',400],['/api/route?conf=nr&from=NV&to=FH',404],['/api/networks/../../foo',404]])assert.equal((await fetch(origin+url)).status,status);
  console.log('API, CORS, parameters and crawler-readable HTML passed.');
  if(process.argv.includes('--api-only')){await checkOld();process.exitCode=0;}
  else {
    const {chromium}=await import('playwright');
    browser=await chromium.launch({headless:true,env:await browserEnvironment()});
    const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();
    let lastExport;
    const exportEditor=async()=>{const pending=page.waitForEvent('download');await page.locator('.json-actions button.primary').click();const download=await pending;lastExport=JSON.parse(await fs.readFile(await download.path(),'utf8'));return lastExport;};
    const importEditor=async value=>{await page.locator('.json-actions input[type=file]').setInputFiles({name:'network.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});await page.waitForFunction(()=>document.querySelector('.json-actions input[type=file]').value===''&&document.querySelector('.json-workbench').getAttribute('aria-busy')==='false');};
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/?conf=ftmc&lang=en&from=NV&to=FH&horseSpeedClass=_NEX&enableExpressCarts=0');
    await page.locator('.result-card .metrics').waitFor();
    await page.locator('.options summary').click();
    assert.equal(await page.locator('select').filter({has:page.locator('option[value="_NEX"]')}).inputValue(),'_NEX');
    const combos=page.locator('[role="combobox"]');
    await combos.nth(0).fill('諾基蘭村');await page.locator('.suggestions [role="option"]').first().click();
    assert.equal(await combos.nth(0).inputValue(),'Notchland Village');
    await combos.nth(0).fill('-620 80 580');await page.locator('.distance-tag').first().waitFor();
    assert.match(await page.locator('.distance-tag').first().textContent(),/0 m away/);
    await page.locator('.suggestions [role="option"]').first().click();
    await combos.nth(1).fill('Railway Museum');await page.locator('.suggestions [role="option"]').first().click();
    await page.locator('.result-card .metrics').waitFor();
    const requestCount={api:0};page.on('request',req=>{if(req.url().includes('/api/route'))requestCount.api++;});
    await combos.nth(1).focus();await page.locator('g[data-station="FH"]').press('Enter');
    await waitFor(async()=>new URL(page.url()).searchParams.get('to')==='FH','station map selection');
    assert.ok(await page.locator('path[data-edge][stroke-opacity="0.95"]').count()>0);
    assert.equal(requestCount.api,0,'Interactive planner must calculate locally.');
    await page.getByRole('button',{name:'Copy directions',exact:true}).click();
    const clipboard=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(clipboard.includes('Notchland Village')&&clipboard.includes('FlashTeens House'));
    await fs.mkdir(root+'test-results',{recursive:true});
    await page.locator('.options summary').click();await page.getByRole('button',{name:'Fit journey',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));
    const fittedMap=await page.locator('.map-canvas svg').boundingBox();
    for(const station of ['NV','FH']){const label=await page.locator(`g[data-station="${station}"] text`).boundingBox();assert.ok(label.x>=fittedMap.x&&label.x+label.width<=fittedMap.x+fittedMap.width,'Fitted endpoint labels must remain visible.');}
    await page.screenshot({path:root+'test-results/planner-desktop.png',fullPage:true});
    await waitFor(async()=>{return(await networkKeys(page)).includes('/data/ftmc.json');},'FTMC offline cache');
    await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('ja');
    await page.getByRole('button',{name:'経路をコピー',exact:true}).waitFor();
    assert.ok((await page.locator('.journey-title').textContent()).includes('Notchland Village'));
    await page.getByRole('combobox',{name:'鉄道システム',exact:true}).selectOption('trtc');
    await page.locator('.query-card').waitFor();
    await waitFor(async()=>JSON.stringify(await networkKeys(page))==='["/data/trtc.json"]','only current JSON cached');
    const cacheNames=await page.evaluate(()=>caches.keys());
    const translations=await page.evaluate(async name=>(await(await caches.open(name)).keys()).map(r=>new URL(r.url).pathname),cacheNames.find(k=>k.endsWith('-shell')));
    assert.ok(['en','zh','ja'].every(lang=>translations.includes(`/i18n/${lang}.json`)));
    await context.setOffline(true);
    await page.reload();await page.locator('.query-card').waitFor();
    await combos.nth(0).fill('動物園');await page.locator('.suggestions [role="option"]').first().click();
    await combos.nth(1).fill('淡水');await page.locator('.suggestions [role="option"]').first().click();
    await page.locator('.result-card .metrics').waitFor();
    assert.ok((await page.locator('.metrics').textContent()).includes('TWD'));
    await page.getByRole('combobox',{name:'言語',exact:true}).selectOption('zh');await page.getByRole('button',{name:'複製路線文字',exact:true}).waitFor();
    await context.setOffline(false);
    await page.goto(origin+'/editor?conf=trtc&lang=zh');await page.locator('.editor-panel').waitFor();
    assert.equal(await page.locator('.map-heading select option').count(),9,'Only physical Taipei lines and branches belong in the map legend.');
    await page.locator('.map-card').screenshot({path:root+'test-results/taipei-official-layout.png'});
    await page.goto(origin+'/editor?conf=ftmc&lang=en');await page.locator('.editor-panel').waitFor();
    assert.equal(await page.locator('.map-heading option[value="L6N"]').count(),0);
    assert.equal(await page.locator('.map-heading option[value="YYL2"]').count(),0);
    await page.locator('.map-card').screenshot({path:root+'test-results/roft-map.png'});
    await page.locator('.map-heading select').selectOption('L6');await page.getByLabel('Station labels',{exact:true}).check();
    await page.locator('.map-card').screenshot({path:root+'test-results/roft-line6.png'});
    await page.getByLabel('Station labels',{exact:true}).uncheck();await page.locator('.map-heading select').selectOption('');
    await page.locator('.editor-list button').first().click();
    await page.getByLabel('Official English name',{exact:true}).fill('Edited Station');
    await exportEditor();
    let saved=lastExport;assert.equal(saved.stations.AC02.names.en,'Edited Station');assert.deepEqual(validateNetwork(saved),[]);
    const editLine=saved.edges.find(e=>e.kind==='ride'&&(e.from==='AC02'||e.to==='AC02')).lineId;
    await page.locator('.map-heading select').selectOption(editLine);
    const sta=page.locator('g[data-station="AC02"]');await sta.scrollIntoViewIfNeeded();
    const position=await sta.locator('circle').first().boundingBox();
    const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-station]')?.getAttribute('data-station'),{x:position.x+position.width/2,y:position.y+position.height/2});
    assert.equal(hit,'AC02','Drag must start on the intended visible station.');
    await page.mouse.move(position.x+position.width/2,position.y+position.height/2);await page.mouse.down();await page.mouse.move(position.x+30,position.y+25,{steps:5});await page.mouse.up();
    await exportEditor();
    const dragged=lastExport;assert.notDeepEqual(dragged.stations.AC02.position,saved.stations.AC02.position);assert.deepEqual(dragged.stations.AC02.coordinates,saved.stations.AC02.coordinates);
    // Selecting and slightly dragging a different station immediately switches
    // the sidebar, even when it was displaying system settings.
    await page.getByRole('button',{name:'System settings',exact:true}).click();
    const other=page.locator('g[data-station="AC03"]');await other.scrollIntoViewIfNeeded();
    const otherBox=await other.locator('circle').first().boundingBox();
    await page.mouse.move(otherBox.x+otherBox.width/2,otherBox.y+otherBox.height/2);await page.mouse.down();
    assert.match(await page.locator('.selected-heading').textContent(),/AC03/);
    await page.mouse.move(otherBox.x+otherBox.width/2+5,otherBox.y+otherBox.height/2+4);await page.mouse.up();
    await sta.locator('circle').first().hover();await sta.locator('text').click();
    assert.match(await page.locator('.selected-heading').textContent(),/AC02/,'A label click selects its station too.');
    assert.equal(await page.locator('.edit-fields').getByText('Station label offset',{exact:true}).count(),0);
    await page.getByLabel('Station type',{exact:true}).selectOption('M');await page.getByLabel('Label direction',{exact:true}).selectOption('8');
    await exportEditor();
    const symbolEdit=lastExport;assert.equal(symbolEdit.stations.AC02.symbol,'M-8');assert.equal(symbolEdit.stations.AC02.labelOffset,undefined);
    await page.getByRole('button',{name:'Undo',exact:true}).click();assert.notEqual(await page.getByLabel('Label direction',{exact:true}).inputValue(),'8');
    await page.getByRole('button',{name:'Redo',exact:true}).click();assert.equal(await page.getByLabel('Label direction',{exact:true}).inputValue(),'8');
    // Grab away from the label's origin: drag chooses a direction in both
    // languages without moving the station or storing a zoom-dependent offset.
    for(const lang of ['en','zh']){
      await page.locator('.header-settings select').nth(1).selectOption(lang);
      await exportEditor();
      const before=lastExport;
      const label=sta.locator('text');await label.scrollIntoViewIfNeeded();
      const style=stationAppearance(before.stations.AC02),units=Number(await label.getAttribute('font-size'))/12;
      const start=await label.evaluate(text=>{const r=text.getBoundingClientRect();for(const x of [.7,.3,.5,.9,.1])for(const y of [.3,.5,.7]){const p={x:r.x+r.width*x,y:r.y+r.height*y},hit=document.elementFromPoint(p.x,p.y);if(hit?.localName==='text'&&hit.closest('[data-station]')?.dataset.station==='AC02')return p;}return null;});
      assert.ok(start,'A visible part of the selected label must be available to drag.');
      const screenDelta={x:lang==='en'?23:-40,y:17};
      const delta=await page.locator('.map-canvas svg').evaluate((svg,d)=>{const m=svg.getScreenCTM().inverse();return{x:m.a*d.x+m.c*d.y,y:m.b*d.x+m.d*d.y};},screenDelta);
      const labelHit=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('[data-station]')?.dataset.station,start);
      assert.equal(labelHit,'AC02');
      await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+screenDelta.x,start.y+screenDelta.y,{steps:5});await page.mouse.up();
      await exportEditor();
      const after=lastExport.stations.AC02;
      assert.equal(after.symbol,`${style.type}-${labelDirection(style.x*units+delta.x,style.y*units+delta.y)}`,`${lang}: label drag snaps to its symbol direction`);
      assert.equal(after.labelOffset,undefined);assert.equal(after.labelAnchor,undefined);
      assert.deepEqual(after.position,before.stations.AC02.position);
      assert.equal(await label.getAttribute('text-anchor'),stationAppearance(after).anchor);
    }
    await page.locator('.header-settings select').nth(1).selectOption('en');
    const labelScreenDistance=()=>sta.locator('text').evaluate(text=>{const m=text.getScreenCTM(),x=Number(text.getAttribute('x')),y=Number(text.getAttribute('y'));return Math.hypot(m.a*x+m.c*y,m.b*x+m.d*y);});
    const labelScreenGap=async()=>await labelScreenDistance()-(await sta.locator('[data-station-marker]').boundingBox()).width/2;
    const initialGap=await labelScreenGap();await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    assert.ok(Math.abs(await labelScreenGap()-initialGap)<0.01,'The gap from the expanded station boundary to its label stays constant in screen pixels when zooming.');
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    const initialView=await page.locator('.map-canvas svg').getAttribute('viewBox');
    for(let i=0;i<13;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    const enlargedView=await page.locator('.map-canvas svg').getAttribute('viewBox');
    assert.ok(Number(initialView.split(' ')[2])/Number(enlargedView.split(' ')[2])>64,'Editor supports precise zoom beyond the previous cap.');
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    await page.locator('.editor-tabs button').filter({hasText:'Connections'}).click();await page.locator('.editor-list button').first().click();
    const edge=await page.locator('path[data-edge]').first().getAttribute('data-edge');
    const beforePoints=dragged.edges.find(e=>e.id===edge).points.length;
    const svg=await page.locator('.map-canvas svg').boundingBox();
    await page.locator(`path[data-edge="${edge}"]`).dispatchEvent('pointerdown',{button:0,shiftKey:true,clientX:svg.x+svg.width/2,clientY:svg.y+svg.height/2});
    await exportEditor();saved=lastExport;assert.equal(saved.edges.find(e=>e.id===edge).points.length,beforePoints+1);
    const selectedPointCount=saved.edges.find(e=>e.id===edge).points.length;
    await page.locator('.edit-fields').getByRole('button',{name:'Add bend',exact:true}).click();
    await exportEditor();saved=lastExport;
    assert.equal(saved.edges.find(e=>e.id===edge).points.length,selectedPointCount+1,'Sidebar adds only one bend per click.');
    // Drag and remove a visible bend with actual mouse gestures, then round-trip it.
    const bend=await page.locator('circle[data-point]').evaluateAll((circles,center)=>circles.map(c=>{const b=c.getBoundingClientRect();return {index:Number(c.dataset.point),x:b.x+b.width/2,y:b.y+b.height/2};}).sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y))[0],{x:svg.x+svg.width/2,y:svg.y+svg.height/2});
    assert.ok(bend);
    await page.mouse.move(bend.x,bend.y);await page.mouse.down();await page.mouse.move(bend.x+25,bend.y+18,{steps:5});await page.mouse.up();
    await exportEditor();
    const movedBend=lastExport;
    assert.notDeepEqual(movedBend.edges.find(e=>e.id===edge).points[bend.index],saved.edges.find(e=>e.id===edge).points[bend.index]);
    assert.deepEqual(movedBend.edges.find(e=>e.id===edge).metrics,saved.edges.find(e=>e.id===edge).metrics);
    const removeHit=await page.locator(`circle[data-point="${bend.index}"]`).evaluate(circle=>{
      const r=circle.getBoundingClientRect();
      for(const dx of [0,-.3,.3])for(const dy of [0,-.3,.3]){const p={x:r.x+r.width*(.5+dx),y:r.y+r.height*(.5+dy)};if(document.elementFromPoint(p.x,p.y)===circle)return p;}
      return null;
    });
    assert.ok(removeHit,'A visible part of the dragged control point must be available.');
    await page.mouse.click(removeHit.x,removeHit.y,{button:'right'});
    await exportEditor();saved=lastExport;
    assert.equal(saved.edges.find(e=>e.id===edge).points.length,movedBend.edges.find(e=>e.id===edge).points.length-1);
    await page.screenshot({path:root+'test-results/editor-desktop.png',fullPage:true});

    await importEditor('{bad');assert.match(await page.locator('.notice').textContent(),/Invalid JSON/);
    await importEditor(saved);assert.match(await page.locator('.notice').textContent(),/loaded successfully/);
    // Newly added edges follow line/from/to changes while preserving explicit overrides.
    await page.getByRole('button',{name:'Connections',exact:true}).click();
    page.once('dialog',dialog=>dialog.accept('browser-defaults'));
    await page.locator('.editor-list-tools').getByRole('button',{name:'Add',exact:false}).click();
    const fields=page.locator('.edit-fields');
    await fields.getByLabel('Departure',{exact:true}).selectOption('RS');
    await fields.getByLabel('Destination',{exact:true}).selectOption('CH');
    await fields.getByLabel('Line',{exact:true}).fill('L6');
    await exportEditor();
    let defaultsData=lastExport,newEdge=defaultsData.edges.find(e=>e.id==='browser-defaults');
    assert.equal(newEdge.direction,'L6_N');assert.equal(newEdge.reverseDirection,'L6_S');assert.equal(newEdge.metrics.distanceKm,.268);
    await fields.getByLabel('Forward direction identifier',{exact:true}).fill('CUSTOM');
    await fields.getByLabel('Destination',{exact:true}).selectOption('CP');
    assert.equal(await fields.getByLabel('Forward direction identifier',{exact:true}).inputValue(),'CUSTOM');
    await fields.getByLabel('Update suggested defaults automatically',{exact:true}).check();
    await fields.getByLabel('Connection type',{exact:true}).selectOption('transfer');
    await fields.getByLabel('Departure',{exact:true}).selectOption('CH');
    await exportEditor();
    assert.match(await page.locator('[role="status"]').textContent(),/ready to download/,await page.locator('.edit-fields').innerText());
    defaultsData=lastExport;newEdge=defaultsData.edges.find(e=>e.id==='browser-defaults');
    assert.equal(newEdge.from,newEdge.to,JSON.stringify(newEdge));assert.equal(newEdge.metrics.distanceKm,0);assert.deepEqual(validateNetwork(defaultsData),[]);
    await importEditor(saved);
    await page.getByRole('button',{name:'System settings',exact:true}).click();
    await page.getByLabel('Journey options',{exact:true}).fill('[]');
    await page.locator('.json-actions button.primary').click();
    await page.locator('.edit-fields .error').waitFor();
    await page.getByRole('button',{name:'Cancel pending edits',exact:true}).click();
    assert.deepEqual(await exportEditor(),saved,'Invalid advanced JSON must leave the working network intact.');
    const beforeReload=saved;
    await page.getByRole('button',{name:'Try this network',exact:false}).click();await page.locator('.query-card').waitFor();await page.getByRole('button',{name:'Back to editor',exact:false}).click();await exportEditor();assert.deepEqual(lastExport,beforeReload);
    // Undo/redo: mixed movement gestures on A, movement on B, then B's name.
    await page.goto(origin+'/editor?conf=trtc&lang=en');await page.locator('.editor-panel').waitFor();
    const original=await exportEditor();
    await page.locator('.map-heading select').selectOption('BR');
    const a=page.locator('g[data-station="BR01"]'),b=page.locator('g[data-station="BR02"]');
    await a.press('ArrowRight');await a.press('ArrowDown');
    await a.scrollIntoViewIfNeeded();
    const grab=await a.locator('circle').first().boundingBox();
    await page.mouse.move(grab.x+grab.width/2,grab.y+grab.height/2);await page.mouse.down();await page.mouse.move(grab.x+grab.width/2-15,grab.y+grab.height/2-12,{steps:4});await page.mouse.up();
    assert.equal((await exportEditor()).editorHistory.entries.length,1,'Arrows and drag of A form one group.');
    await b.press('ArrowLeft');await b.press('ArrowDown');await b.press('Enter');
    const stationName=page.getByLabel('Official English name',{exact:true});
    await stationName.fill('Renamed Muzha');
    assert.equal(await b.locator('text').textContent(),original.stations.BR02.names.en,'Uncommitted text remains a draft.');
    await stationName.press('Tab');
    const threeGroups=await exportEditor();assert.equal(threeGroups.editorHistory.entries.length,3);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    let undone=await exportEditor();assert.equal(undone.stations.BR02.names.en,original.stations.BR02.names.en);assert.deepEqual(undone.stations.BR02.position,threeGroups.stations.BR02.position);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    undone=await exportEditor();assert.deepEqual(undone.stations.BR02.position,original.stations.BR02.position);assert.deepEqual(undone.stations.BR01.position,threeGroups.stations.BR01.position);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    undone=await exportEditor();assert.deepEqual(undone.stations,original.stations);assert.equal(undone.editorHistory.cursor,0);
    for(let i=0;i<3;i++)await page.keyboard.press('Control+Shift+Z');
    assert.deepEqual((await exportEditor()).stations,threeGroups.stations);
    await stationName.fill('');await stationName.press('Tab');
    await page.locator('.edit-fields [role="alert"]').waitFor();
    assert.equal(await b.locator('text').textContent(),'Renamed Muzha','Invalid drafts leave the map intact.');
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    assert.equal(lastExport.editorHistory.cursor,3);
    await page.getByRole('button',{name:'Cancel pending edits',exact:true}).click();
    assert.equal(await stationName.inputValue(),'Renamed Muzha');
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    await page.getByLabel('Official Traditional Chinese name',{exact:true}).fill('木柵測試');
    const branched=await exportEditor();assert.equal(branched.editorHistory.cursor,3);assert.equal(branched.editorHistory.entries.length,3);
    assert.ok(await page.getByRole('button',{name:'Redo',exact:true}).isDisabled(),'A new edit clears the previous redo branch.');
    await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();
    const portable=await exportEditor();assert.equal(portable.editorHistory.cursor,1);
    await importEditor(portable);
    assert.deepEqual((await exportEditor()).editorHistory,portable.editorHistory,'JSON load retains both undo and redo groups.');
    await page.getByRole('button',{name:'Redo',exact:true}).click();await page.getByRole('button',{name:'Redo',exact:true}).click();
    const restored=await exportEditor();assert.deepEqual(restored.stations,branched.stations);
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Clear history',exact:true}).click();
    assert.deepEqual((await exportEditor()).editorHistory,restored.editorHistory,'Cancelling confirmation retains history.');
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Clear history',exact:true}).click();
    const cleared=await exportEditor();assert.deepEqual(cleared.editorHistory,{version:1,entries:[],cursor:0});assert.deepEqual(cleared.stations,restored.stations);
    const damagedImport=structuredClone(portable);damagedImport.names.en='History recovery example';damagedImport.editorHistory.entries[0].kind='execute';
    let warning='';page.once('dialog',async dialog=>{warning=dialog.message();await dialog.dismiss();});
    await importEditor(damagedImport);
    assert.match(warning,/1 groups will be lost; 2 validated groups will remain/);
    assert.deepEqual(await exportEditor(),cleared,'Rejecting damaged JSON keeps the complete current document.');
    page.once('dialog',dialog=>dialog.accept());await importEditor(damagedImport);
    const recovered=await exportEditor();assert.deepEqual(recovered.stations,portable.stations);assert.equal(recovered.names.en,damagedImport.names.en);
    assert.deepEqual(recovered.editorHistory,{version:1,entries:portable.editorHistory.entries.slice(1),cursor:0},'Accepting keeps only the validated suffix, with its cursor adjusted.');
    await page.getByRole('button',{name:'Redo',exact:true}).click();await page.getByRole('button',{name:'Redo',exact:true}).click();
    assert.deepEqual((await exportEditor()).stations,branched.stations,'The retained redo groups remain usable.');
    await importEditor(portable);
    // Fault injection after a valid import simulates a bug that damages an
    // in-memory group. Use React's existing component setter only in this test;
    // production has no debug endpoint or bypass for history validation.
    const brokenRuntime=structuredClone(portable);brokenRuntime.editorHistory.entries[0].changes[0].before.value.names.en='';
    await page.locator('.editor-panel').evaluate((element,broken)=>{
      const key=Object.keys(element).find(k=>k.startsWith('__reactFiber$'));let fiber=element[key];
      while(fiber){const props=fiber.memoizedProps;if(props?.data?.schemaVersion===2&&typeof props.setData==='function'&&typeof props.onPreview==='function'){props.setData(broken);return;}fiber=fiber.return;}
      throw new Error('Editor setter unavailable for history fault injection.');
    },brokenRuntime);
    let replayWarning='';page.once('dialog',async dialog=>{replayWarning=dialog.message();await dialog.accept();});
    await page.getByRole('button',{name:'Undo',exact:true}).click();assert.match(replayWarning,/Invalid edit history/);
    assert.equal(await a.getAttribute('aria-label'),`Station: ${portable.stations.BR01.names.en}`,'Failed replay preserves the current station name.');
    const replayPosition=await a.evaluate(station=>{const m=station.transform.baseVal.consolidate().matrix;return {x:m.e,y:m.f};});
    assert.ok(Math.hypot(replayPosition.x-portable.stations.BR01.position.x,replayPosition.y-portable.stations.BR01.position.y)<1e-6,'Failed replay preserves the current map position.');
    await b.press('Enter');await page.getByLabel('Official English name',{exact:true}).fill('Edited after history failure');
    const afterFailure=await exportEditor();assert.equal(afterFailure.editorHistory.entries.length,1);assert.equal(afterFailure.editorHistory.cursor,1);
    assert.deepEqual(afterFailure.stations.BR01,portable.stations.BR01);assert.equal(afterFailure.stations.BR02.names.en,'Edited after history failure');
    assert.ok(await page.getByRole('button',{name:'Redo',exact:true}).isDisabled(),'A normal edit replaces the old redo branch after replay failure.');
    await page.getByRole('button',{name:'Undo',exact:true}).click();assert.deepEqual((await exportEditor()).stations,portable.stations);
    await page.getByRole('button',{name:'Redo',exact:true}).click();assert.equal((await exportEditor()).stations.BR02.names.en,'Edited after history failure');
    await page.screenshot({path:root+'test-results/editor-history.png',fullPage:true});
    await b.press('ArrowRight');
    assert.equal(await page.locator('.unsaved-status').count(),1,'Further map edits remain unsaved after a download.');
    const system=page.locator('.header-settings select').first();
    page.once('dialog',dialog=>dialog.dismiss());await system.selectOption('ftmc');
    assert.equal(await system.inputValue(),'trtc','Cancelling a network switch retains the current system.');
    assert.equal((await exportEditor()).stations.BR02.names.en,'Edited after history failure');
    await b.press('ArrowRight');
    let leaveType='';page.once('dialog',async dialog=>{leaveType=dialog.type();await dialog.dismiss();});
    await page.locator('.site-header nav a').first().click();
    assert.equal(leaveType,'beforeunload','Navigation uses the browser-native unsaved changes prompt.');
    assert.equal(new URL(page.url()).pathname,'/editor');
    page.once('dialog',dialog=>dialog.accept());await system.selectOption('ftmc');
    await waitFor(async()=>await page.locator('.map-heading h2').textContent()==='Republic of FlashTeens','accepted network switch');
    assert.equal(await page.locator('.unsaved-status').count(),0,'A newly opened network starts clean.');
    await page.locator('.editor-list button').first().click();
    await page.getByLabel('Official English name',{exact:true}).fill('Pending draft before close');
    await page.locator('.unsaved-status').waitFor();
    const closeDialog=page.waitForEvent('dialog'),closing=page.close({runBeforeUnload:true}),dialog=await closeDialog;
    assert.equal(dialog.type(),'beforeunload','An uncommitted draft also prevents closing without confirmation.');
    await dialog.dismiss();await closing;assert.equal(page.isClosed(),false);assert.equal(await page.getByLabel('Official English name',{exact:true}).inputValue(),'Pending draft before close');
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON',exact:true}).click();
    const downloaded=await downloadPromise;assert.equal(downloaded.suggestedFilename(),'ftmc.json');
    assert.equal(await page.locator('.unsaved-status').count(),0,'A successful JSON download marks the current document clean.');
    await page.getByLabel('Station type',{exact:true}).selectOption('M');await page.locator('.unsaved-status').waitFor();
    const secondDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON',exact:true}).click();await secondDownload;
    assert.equal(await page.locator('.unsaved-status').count(),0,'Subsequent edits become unsaved until another download.');
    await page.goto(origin+'/?conf=ftmc_preview&lang=zh&from=NV&to=FH');await page.locator('.preview-theme .result-card .metrics').waitFor();assert.match(await page.title(),/預覽版/);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:root+'test-results/planner-mobile.png',fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page must not overflow horizontally.');
    assert.deepEqual(errors,[],'No browser runtime errors');
    console.log('Browser: multilingual/coordinate search, map selection/highlight, local routing, copy, editor edits/drag/bends/JSON roundtrip, preview and mobile passed.');
    console.log('Offline: reload, station search, local routing, language switching and one-system cache passed.');
    await verifyImprovements(browser,origin,root);
    await verifyMapRendering(browser,origin,root);
    await verifyBlankEditor(browser,origin,root);
    await verifyEditorDirections(browser,origin,root);
    await verifyArrivalHelp(browser,origin,root);
    await verifyFieldHelp(browser,origin,root);
    await checkOld();
  }
}catch(error){console.error(error);if(log)console.error(log);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
