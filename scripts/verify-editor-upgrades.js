import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createBlankNetwork} from '../shared/blank-network.js';
import {addEditorItem} from '../shared/editor-defaults.js';
import {validateNetwork} from '../shared/network.js';
import {validateEditorHistory} from '../shared/editor-history.js';

export async function verifyEditorUpgrades(browser,origin,root){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const selectTab=tab=>page.locator('.editor-tabs').getByRole('button',{name:tab,exact:true}).click();
  const download=async()=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON',exact:true}).click();return JSON.parse(await fs.readFile(await(await pending).path(),'utf8'));};
  const fill=async(name,value)=>{const input=page.getByLabel(name,{exact:true});await input.fill(value);await input.press('Enter');};
  const edge=async id=>{await selectTab('Connections');await page.locator('.editor-list-tools input').fill(id);await page.locator('.editor-list button').first().click();};
  try{
    let d=createBlankNetwork();for(const[tab,id]of [['stations','A'],['stations','B'],['stations','C'],['lines','L1'],['lines','L2'],['lines','#B.HALL'],['lines','#_B_C']])d=addEditorItem(d,tab,id);
    d.stations.B.names={zh:'暗黑河',en:'Dark River'};d.stations.B.codes=['DR02'];d.stations.B.coordinates={x:100,y:66,z:200};d.stations.B.position={x:100,y:0};d.stations.C.position={x:200,y:100};
    const metric={timeSec:10,distanceKm:0,price:0},transfer={kind:'transfer',from:'B',to:'B',bidirectional:true,metrics:metric,delayWhenUnfamiliar:true};
    d.edges=[{...transfer,id:'e00001',fromLine:'L1',toLine:'L2',lineId:'L1',direction:'WRONG',directionLabel:{en:'WRONG'},displayLineId:'L1'}, {...transfer,id:'e00002',fromLine:'L1:E',toLine:'#B.HALL',reverseTimeSec:12}, {...transfer,id:'e00003',fromLine:'#B.HALL',toLine:'#_B_C',bidirectional:false}, {id:'walk',kind:'walk',from:'B',to:'C',lineId:'#_B_C',bidirectional:false,metrics:metric,delayWhenUnfamiliar:false}];
    await page.goto(origin+'/editor?conf=_blank&lang=en');await page.locator('.editor-grid').waitFor();await page.locator('.json-actions input[type=file]').setInputFiles({name:'upgrades.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.getByRole('status').waitFor();
    await selectTab('Stations');await page.locator('.editor-list-tools input').fill('100 66 200');assert.match(await page.locator('.editor-list button').first().textContent(),/Dark River/);
    await edge('e00001');assert.match(await page.locator('.editor-list small').first().textContent(),/L1 → L2/);
    assert.equal(await page.locator('[data-transfer-node="L1"]').count(),1);assert.equal(await page.locator('[data-transfer-node="L1:E"]').count(),1);assert.equal(await page.locator('[data-transfer-node="#B.HALL"]').count(),1);
    const graph=page.locator('.transfer-graph'),before=await graph.locator('[data-transfer-node]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.transferNode,n.getAttribute('transform')]));
    await graph.locator('[data-transfer-edge="e00002"]').press('Enter');assert.match(await page.locator('.selected-heading').textContent(),/e00002/);
    assert.deepEqual(await graph.locator('[data-transfer-node]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.transferNode,n.getAttribute('transform')])),before);
    await fill('From line / direction','L2');await fill('To line / direction','#_B_C');assert.match(await page.locator('.editor-list button.selected small').textContent(),/L2 → #_B_C/);
    // Leaving a search without selecting a station must not clear a required endpoint.
    await page.getByLabel('Departure',{exact:true}).fill('unmatched station');await page.getByRole('button',{name:'Download JSON',exact:true}).click();assert.match(await page.locator('.json-workbench').getByRole('status').textContent(),/pending/i);await page.getByRole('button',{name:'Cancel pending edits',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.editor-station-picker input').value==='Dark River');await fill('Departure','100 66 200');assert.equal(await page.getByLabel('Departure',{exact:true}).inputValue(),'Dark River');
    await page.locator('.editor-list-tools').getByRole('button',{name:'Add ＋',exact:true}).click();assert.match(await page.locator('.selected-heading').textContent(),/e00004/);
    await page.getByLabel('Connection type',{exact:true}).selectOption('transfer');await fill('Departure','B');await fill('From line / direction','L2');await fill('To line / direction','#B.HALL');let saved=await download(),added=saved.edges.find(e=>e.id==='e00004');
    assert.equal(added.lineId,undefined);assert.equal(added.direction,undefined);assert.equal(added.directionLabel,undefined);assert.equal(added.delayWhenUnfamiliar,true);
    await page.getByLabel('Connection type',{exact:true}).selectOption('walk');saved=await download();assert.equal(saved.edges.find(e=>e.id==='e00004').fromLine,undefined);assert.equal(saved.edges.find(e=>e.id==='e00004').delayWhenUnfamiliar,false);
    await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.edit-fields select').value==='transfer');assert.equal(await page.getByLabel('Connection type',{exact:true}).inputValue(),'transfer');await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.edit-fields select').value==='walk');assert.equal(await page.getByLabel('Connection type',{exact:true}).inputValue(),'walk');
    // Camera center is used for new stations even after zooming and panning.
    await selectTab('Stations');await page.locator('.editor-list-tools input').fill('');const map=page.locator('.map-canvas svg');await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    const box=await map.boundingBox();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.8);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.65);await page.mouse.up();const view=(await map.getAttribute('viewBox')).split(' ').map(Number);
    page.once('dialog',dialog=>dialog.accept('Visible'));await page.locator('.editor-list-tools').getByRole('button',{name:'Add ＋',exact:true}).click();saved=await download();const position=saved.stations.Visible.position;assert.ok(Math.abs(position.x-(view[0]+view[2]/2))<=1);assert.ok(Math.abs(position.y-(view[1]+view[3]/2))<=1);assert.equal(await map.getAttribute('viewBox'),view.join(' '));
    assert.deepEqual(validateNetwork(saved),[]);assert.deepEqual(validateEditorHistory(saved,validateNetwork),[]);
    await edge('e00001');await page.screenshot({path:root+'test-results/editor-transfer-graph.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await graph.locator('.transfer-edge-list').getByRole('button',{name:/^e00003 ·/}).click();assert.match(await page.locator('.selected-heading').textContent(),/e00003/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:root+'test-results/editor-transfer-graph-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);console.log('Editor upgrades: automatic IDs, XYZ station search and required drafts, transfer cleanup/Undo/Redo, exact graph endpoints/stable layout/selection, viewport station creation and mobile bounds passed.');
  }finally{await context.close();}
}
