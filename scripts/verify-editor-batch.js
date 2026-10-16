import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createBlankNetwork} from '../shared/blank-network.js';
import {addEditorItem} from '../shared/editor-defaults.js';
import {readCSV,writeCSV} from '../shared/editor-batch.js';
import {validateNetwork} from '../shared/network.js';
import {validateEditorHistory} from '../shared/editor-history.js';

export async function verifyEditorBatch(browser,origin,root){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const dialog=page.getByRole('dialog'),csv=dialog.getByLabel('CSV list',{exact:true});
 const click=label=>dialog.getByRole('button',{name:label,exact:true}).click();
 const review=async()=>{await click('Next: review changes');await dialog.getByRole('heading',{name:'Review changes before applying',exact:true}).waitFor();};
 const apply=async()=>{await click('Apply all changes');await dialog.waitFor({state:'detached'});};
 const open=async type=>{await page.locator('.batch-toolbar').getByRole('button',{name:'Batch edit '+type,exact:true}).click();await csv.waitFor();};
 const download=async()=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON',exact:true}).click();return JSON.parse(await fs.readFile(await(await pending).path(),'utf8'));};
 const change=async fn=>{const rows=readCSV(await csv.inputValue()).map(r=>r.cells);fn(rows);await csv.fill(writeCSV(rows));};
 const upload=async d=>{await page.locator('.json-actions input[type=file]').setInputFiles({name:'batch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.getByRole('status').filter({hasText:/loaded/i}).waitFor();};
 try{
  let d=createBlankNetwork();for(const[tab,id]of [['stations','A'],['stations','B'],['stations','C'],['stations','Orphan'],['lines','L1'],['lines','L2'],['lines','#B.HALL']])d=addEditorItem(d,tab,id);
  for(const[i,s]of Object.values(d.stations).entries()){s.position={x:i*100,y:i*50};s.coordinates={x:i*1000,y:62,z:0};}
  d=addEditorItem(d,'edges','e00001');d.edges[0]={...d.edges[0],direction:'E',reverseDirection:'W',points:[{x:40,y:10}],directionLabel:{en:'River, "bank"',zh:'河岸',ja:'川'}};
  d.edges.push({...d.edges[0],id:'e00002',from:'B',to:'C',lineId:'L2'});
  await page.goto(origin+'/editor?conf=_blank&lang=en');await page.locator('.editor-grid').waitFor();await upload(d);
  await page.locator('[data-station-warning="Orphan"]').waitFor();assert.equal(await page.locator('[data-station-warning="B"]').count(),1);assert.match(await page.locator('.station-warnings').textContent(),/No ride or walk/);
  await open('stations');assert.match(await dialog.locator('.batch-backup').textContent(),/not a full map backup/);await review();assert.equal(await dialog.getByRole('button',{name:'Apply all changes',exact:true}).isDisabled(),true);await click('Cancel');
  await open('stations');await change(rows=>{rows[1][1]='A, "Garden"';rows.push(['D','New station','新站','500 62 0']);rows.push(['E','No coordinates','無座標','']);});await review();assert.equal(await dialog.locator('.batch-change').count(),3);assert.match(await dialog.textContent(),/estimated from nearby/);assert.match(await dialog.textContent(),/visible map center/);assert.equal(await page.locator('[data-station="D"]').count(),0);await apply();
  const stationSave=await download();assert.equal(stationSave.editorHistory.entries.length,1);assert.equal(stationSave.stations.A.names.en,'A, "Garden"');assert.ok(stationSave.stations.D.position.x>0&&stationSave.stations.D.position.x<100);assert.deepEqual(validateEditorHistory(stationSave,validateNetwork),[]);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('[data-station="D"]').waitFor({state:'detached'});await page.getByRole('button',{name:'Redo',exact:true}).click();await page.locator('[data-station="D"]').waitFor();
  await open('connections');await dialog.getByLabel('Line or station to edit',{exact:true}).selectOption('L1');await change(rows=>{rows[1][rows[0].indexOf('Time (seconds)')]='45';const row=[...rows[1]];row[0]='';row[1]='A';row[2]='C';rows.push(row);});await review();assert.equal(await dialog.locator('.batch-change').count(),2);await apply();let saved=await download();assert.equal(saved.edges.find(e=>e.id==='e00001').metrics.timeSec,45);assert.deepEqual(saved.edges.find(e=>e.id==='e00001').points,d.edges[0].points);assert.deepEqual(saved.edges.find(e=>e.id==='e00001').directionLabel,d.edges[0].directionLabel);assert.equal(saved.edges.find(e=>e.id==='e00003').lineId,'L1');assert.equal(saved.editorHistory.entries.length,2);
  await open('connections');await dialog.getByLabel('List type',{exact:true}).selectOption('transfer');await dialog.getByLabel('Line or station to edit',{exact:true}).selectOption('B');assert.equal(readCSV(await csv.inputValue()).length,1);await change(rows=>rows.push(['','L1','#B.HALL','true','10','0','0','','true','','']));await review();await apply();saved=await download();assert.equal(saved.edges.find(e=>e.id==='e00004').from,'B');assert.equal(saved.edges.find(e=>e.id==='e00004').fromLine,'L1');
  await open('connections');await dialog.getByLabel('List type',{exact:true}).selectOption('transfer');await dialog.getByLabel('Line or station to edit',{exact:true}).selectOption('B');await change(rows=>rows.push(['','#B.HALL','L2','false','8','0','0','','true','','']));await review();await apply();await page.locator('[data-station-warning="B"]').waitFor({state:'detached'});saved=await download();assert.deepEqual(validateNetwork(saved),[]);assert.deepEqual(validateEditorHistory(saved,validateNetwork),[]);
  // Required fields and malformed CSV never modify the document.
  await open('stations');await change(rows=>rows[1].pop());await click('Next: review changes');await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByRole('button',{name:'Apply all changes',exact:true}).count(),0);page.once('dialog',d=>d.dismiss());await click('Cancel');assert.equal(await dialog.isVisible(),true);page.once('dialog',d=>d.accept());await click('Cancel');await dialog.waitFor({state:'detached'});assert.deepEqual(await download(),saved);
  await open('stations');await change(rows=>rows.splice(rows.findIndex(r=>r[0]==='B'),1));await review();assert.ok(await dialog.locator('.batch-change.delete').count()>=5);await click('Back to edit list');assert.ok((await csv.inputValue()).includes('New station'));page.once('dialog',d=>d.accept());await click('Cancel');await dialog.waitFor({state:'detached'});assert.deepEqual(await download(),saved);
  // Mobile native dialog bounds, keyboard focus, warning selection and localized instructions.
  await page.setViewportSize({width:390,height:844});await open('stations');assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)));await page.screenshot({path:root+'test-results/editor-batch-mobile.png',fullPage:true});await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  await page.locator('.station-warnings').getByRole('button',{name:'Orphan · Orphan',exact:true}).click();await page.locator('.selected-heading').filter({hasText:'Orphan'}).waitFor();
  for(const[lang,title,backup]of [['zh','批次編輯車站','不是完整的路線圖備份'],['ja','駅を一括編集','バックアップではありません']]){await page.goto(origin+'/editor?conf=_blank&lang='+lang);await page.locator('.batch-toolbar').getByRole('button',{name:title,exact:true}).click();await page.getByRole('dialog').waitFor();assert.match(await dialog.locator('.batch-backup').textContent(),new RegExp(backup));assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));await page.keyboard.press('Escape');}
  await page.goto(origin+'/?conf=ftmc&lang=en');await page.locator('.map-canvas').waitFor();assert.equal(await page.locator('[data-station-warning],.station-warnings,.batch-toolbar').count(),0);
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/editor?conf=_blank&lang=en');await page.locator('.editor-grid').waitFor();await upload(saved);await open('stations');await change(rows=>{rows[1][1]='Review example';rows.splice(rows.findIndex(r=>r[0]==='B'),1);});await review();await page.screenshot({path:root+'test-results/editor-batch-review.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('Batch editor: localized CSV, no-op/invalid/cancel protection, station kNN/fallback, grouped Undo/Redo, travel bends/labels, transfer scopes and numbering, deletion review, mobile dialog, live warnings and planner isolation passed.');
 }finally{await context.close();}
}
