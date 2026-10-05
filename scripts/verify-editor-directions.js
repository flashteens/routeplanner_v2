import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createBlankNetwork} from '../shared/blank-network.js';
import {addEditorItem} from '../shared/editor-defaults.js';
import {validateNetwork} from '../shared/network.js';
import {validateEditorHistory} from '../shared/editor-history.js';

export async function verifyEditorDirections(browser,origin,root){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const exportJSON=async()=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下載 JSON',exact:true}).click();return JSON.parse(await fs.readFile(await(await pending).path(),'utf8'));};
  const select=async id=>{await page.locator('.editor-tabs').getByRole('button',{name:'連接與轉乘',exact:true}).click();await page.locator('.editor-list button').filter({has:page.locator('small',{hasText:new RegExp(`^${id} ·`)})}).click();};
  const fill=async(name,value)=>{const field=page.getByLabel(name,{exact:true});await field.fill(value);await field.press('Enter');};
  try{
    let data=createBlankNetwork();for(const [tab,id] of [['stations','A'],['stations','B'],['lines','L1'],['lines','L3']])data=addEditorItem(data,tab,id);
    data.stations.B.position={x:100,y:100};data=addEditorItem(data,'edges','a');
    const edge={...data.edges[0],direction:'E',reverseDirection:'W'};
    data.edges=[{...edge,directionLabel:{zh:'順時針',en:'Platform 2',ja:'2番'}},{...edge,id:'b',directionLabel:{zh:'順時針',en:'Platform 3'}},{...edge,id:'c',direction:'W',reverseDirection:'E',reverseDirectionLabel:{zh:'往森林'}},{...edge,id:'d',lineId:'L3',directionLabel:{zh:'另一條線'}},{...edge,id:'e',direction:'N',reverseDirection:'S',directionLabel:{zh:'另一方向'}}];
    await page.goto(origin+'/editor?conf=_blank&lang=zh');await page.locator('.editor-grid').waitFor();
    await page.locator('.json-actions input[type=file]').setInputFiles({name:'directions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await page.locator('.json-workbench').getByRole('status').waitFor();await select('a');
    const forward=page.locator('[data-direction-label="directionLabel"]'),reverse=page.locator('[data-direction-label="reverseDirectionLabel"]');
    assert.equal(await forward.getAttribute('open'),null);assert.equal(await reverse.getAttribute('open'),null);
    await forward.locator('summary').click();await reverse.locator('summary').click();
    assert.equal(await forward.locator('input').count(),3,'Existing Japanese is preserved and editable.');
    assert.ok((await forward.locator('input').first().getAttribute('placeholder')).includes('月台'));
    assert.equal(await forward.locator('input[required]').count(),0);
    await fill('正向方向文字內容 · 英文','Platform 9');
    const apply=forward.getByRole('button',{name:'套用到 L1 路線的 E 方向上所有 3 個路段',exact:true});
    const before=await exportJSON();let confirmation='';
    page.once('dialog',dialog=>{confirmation=dialog.message();return dialog.dismiss();});await apply.click();
    assert.match(confirmation,/順時針 \[en: Platform 9\]/);assert.match(confirmation,/順時針 \[en: Platform 3\]/);assert.match(confirmation,/往森林/);assert.ok(!confirmation.includes('[ja:'));
    assert.deepEqual(await exportJSON(),before,'Cancel leaves every target and history unchanged.');
    page.once('dialog',dialog=>dialog.accept());await apply.click();const applied=await exportJSON();
    assert.deepEqual(applied.edges[1].directionLabel,applied.edges[0].directionLabel);assert.deepEqual(applied.edges[2].reverseDirectionLabel,applied.edges[0].directionLabel);
    assert.deepEqual(applied.edges[3],before.edges[3]);assert.deepEqual(applied.edges[4],before.edges[4]);
    assert.equal(applied.editorHistory.entries.length,before.editorHistory.entries.length+1);
    await page.getByRole('button',{name:'復原',exact:true}).click();assert.deepEqual((await exportJSON()).edges,before.edges);
    await page.getByRole('button',{name:'重做',exact:true}).click();assert.deepEqual(await exportJSON(),applied);
    await select('c');await reverse.locator('summary').click();await fill('反向方向文字內容 · 繁體中文','反向套用');
    page.once('dialog',dialog=>dialog.accept());await reverse.getByRole('button',{name:'套用到 L1 路線的 E 方向上所有 3 個路段',exact:true}).click();
    const reversed=await exportJSON();assert.equal(reversed.edges[0].directionLabel.zh,'反向套用');assert.equal(reversed.edges[1].directionLabel.zh,'反向套用');
    await select('a');
    for(const [name,value] of [['正向方向識別代碼',''],['正向方向識別代碼','W'],['反向方向識別代碼','E']]){
      await fill(name,value);assert.equal(await page.getByLabel(name,{exact:true}).getAttribute('aria-invalid'),'true');
      await page.getByRole('button',{name:'下載 JSON',exact:true}).click();assert.match(await page.locator('.json-workbench').getByRole('status').textContent(),/待提交/);
      await page.getByLabel(name,{exact:true}).press('Escape');assert.equal(await page.getByLabel(name,{exact:true}).getAttribute('aria-invalid'),'false');
    }
    await page.getByLabel('雙向通行',{exact:true}).uncheck();await fill('反向方向識別代碼','');assert.equal(await page.getByLabel('反向方向識別代碼').getAttribute('required'),null);
    await exportJSON();await page.getByLabel('雙向通行',{exact:true}).check();assert.equal(await page.getByLabel('反向方向識別代碼').getAttribute('aria-invalid'),'true');
    await fill('反向方向識別代碼','W');
    await page.getByLabel('連接類型',{exact:true}).selectOption('walk');
    await fill('正向方向識別代碼','');await fill('反向方向識別代碼','');await exportJSON();
    await fill('正向方向識別代碼','E');await fill('反向方向識別代碼','E');assert.equal(await page.getByLabel('反向方向識別代碼').getAttribute('aria-invalid'),'true');
    await page.getByLabel('反向方向識別代碼').press('Escape');await fill('反向方向識別代碼','W');
    const final=await exportJSON();assert.deepEqual(validateNetwork(final),[]);assert.deepEqual(validateEditorHistory(final,validateNetwork),[]);
    await page.setViewportSize({width:390,height:844});await forward.locator('summary').click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:root+'test-results/editor-directions-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
    console.log('Editor directions: optional multilingual text, live scope count, grouped confirmation, cancel/apply across both slots, atomic Undo/Redo, ride/walk validation and mobile passed.');
  }finally{await context.close();}
}
