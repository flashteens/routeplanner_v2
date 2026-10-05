import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateNetwork} from '../shared/network.js';
import {validateEditorHistory} from '../shared/editor-history.js';
import {findRoute} from '../shared/router.js';

export async function verifyBlankEditor(browser,origin,root){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[],blankRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{if(new URL(request.url()).pathname==='/data/_blank.json')blankRequests.push(request.url());});
  const add=async(tab,id)=>{
    await page.locator('.editor-tabs').getByRole('button',{name:tab,exact:true}).click();
    page.once('dialog',dialog=>{assert.equal(dialog.type(),'prompt');return dialog.accept(id);});
    await page.getByRole('button',{name:'Add ＋',exact:true}).click();
  };
  const download=async()=>{
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON',exact:true}).click();
    const file=await pending;assert.equal(file.suggestedFilename(),'_blank.json');
    return JSON.parse(await fs.readFile(await file.path(),'utf8'));
  };
  try{
    const systems=await fetch(origin+'/api/systems').then(r=>r.json());
    assert.equal(systems.length,4);assert.ok(systems.every(s=>s.id!=='_blank'));
    for(const path of ['/?conf=_blank','/api/networks/_blank'])assert.equal((await fetch(origin+path)).status,404);
    for(const [lang,label] of [['en','(Blank map)'],['zh','(空白地圖)'],['ja','(空白マップ)']]){
      const response=await page.goto(`${origin}/editor?conf=_blank&lang=${lang}`);assert.equal(response.status(),200);
      await page.locator('.editor-grid').waitFor();assert.equal(await page.locator('g[data-station]').count(),0);
      const option=page.locator('.header-settings option[value="_blank"]');assert.equal(await option.textContent(),label);
      assert.equal(await option.evaluate(o=>o.selected),true);
    }
    await page.goto(origin+'/?conf=ftmc&lang=en');await page.locator('.query-card').waitFor();
    assert.equal(await page.locator('.header-settings option[value="_blank"]').count(),0);
    await page.locator('.site-header nav').getByRole('link',{name:'Network editor',exact:true}).click();
    await page.locator('.editor-grid').waitFor();
    await page.getByRole('combobox',{name:'Transit system',exact:true}).selectOption('_blank');
    await page.locator('.map-heading h2').filter({hasText:'(Blank map)'}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('conf'),'_blank');
    assert.match(await page.locator('.site-header nav').getByRole('link',{name:'Route planner',exact:true}).getAttribute('href'),/conf=ftmc/);
    await add('Connections','too-early');assert.equal(await page.locator('path[data-edge]').count(),0);
    assert.match(await page.getByRole('status').textContent(),/Fix validation errors/);
    for(const [id,x,y] of [['A',0,0],['B',150,0],['C',150,100]]){
      await add('Stations',id);
      const position=page.locator('fieldset').filter({has:page.locator('legend',{hasText:'Map position'})});
      for(const [axis,value] of [['X',x],['Y',y]]){const field=position.getByLabel(axis,{exact:true});await field.fill(String(value));await field.press('Enter');}
    }
    await add('Lines','L1');await add('Connections','AB');
    await page.locator('.editor-panel').getByRole('button',{name:'Add bend',exact:true}).click();
    await add('Connections','BC');
    await page.getByLabel('Departure',{exact:true}).selectOption('B');
    await page.getByLabel('Destination',{exact:true}).selectOption('C');
    assert.equal(await page.locator('g[data-station]').count(),3);assert.equal(await page.locator('path[data-edge]').count(),2);
    const undo=page.getByRole('button',{name:'Undo',exact:true}),redo=page.getByRole('button',{name:'Redo',exact:true});
    let count=0;while(await undo.isEnabled()){assert.ok(count++<30);await undo.click();}
    assert.equal(await page.locator('g[data-station]').count(),0);assert.equal(await page.locator('path[data-edge]').count(),0);
    while(await redo.isEnabled())await redo.click();
    const saved=await download();assert.deepEqual(validateNetwork(saved),[]);assert.deepEqual(validateEditorHistory(saved,validateNetwork),[]);
    assert.equal(findRoute(saved,'A','C').metrics.timeSec,60);assert.equal(saved.edges[0].points.length,1);
    await page.locator('.json-actions input[type=file]').setInputFiles({name:'blank.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.getByRole('status').filter({hasText:'loaded'}).waitFor();
    assert.deepEqual(await download(),saved);
    await page.getByRole('button',{name:'Try this network →',exact:true}).click();await page.locator('.query-card').waitFor();
    for(const [index,id] of [[0,'A'],[1,'C']]){await page.locator('[role="combobox"]').nth(index).fill(id);await page.locator('.suggestions [role="option"]').first().click();}
    await page.locator('.result-card .metrics').waitFor();
    await page.getByRole('button',{name:'← Back to editor',exact:true}).click();await page.locator('.editor-grid').waitFor();
    await page.screenshot({path:root+'test-results/editor-blank.png',fullPage:true});
    await page.waitForFunction(async()=>Boolean(navigator.serviceWorker.controller)&&(await caches.keys()).some(k=>k.endsWith('-shell')));
    await context.setOffline(true);await page.reload();await page.locator('.editor-grid').waitFor();
    assert.equal(await page.locator('g[data-station]').count(),0,'Reload starts a fresh blank document; downloaded JSON preserves edits.');
    await add('Stations','Offline');assert.equal(await page.locator('g[data-station]').count(),1);
    assert.deepEqual(blankRequests,[],'Blank editor must not fetch a nonexistent network file.');assert.deepEqual(errors,[]);
    console.log('Blank editor: direct URL, editor-only multilingual menu, empty-state guards, creation, bends, Undo/Redo, JSON roundtrip, local routing and offline editing passed.');
  }finally{await context.close();}
}
