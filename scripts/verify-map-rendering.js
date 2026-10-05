import assert from 'node:assert/strict';

export async function verifyMapRendering(browser,origin,root){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(`${origin}/editor?conf=ftmc_preview&lang=en`);
    await page.locator('g[data-station="GB"]').waitFor();
    const toggle=page.getByLabel('Station labels',{exact:true});assert.ok(!await toggle.isChecked());
    const visible=()=>page.locator('g[data-station] text').evaluateAll(items=>[...new Set(items.map(t=>t.parentElement.dataset.stationType))].sort());
    await page.mouse.move(5,5);
    assert.deepEqual(await visible(),[]);
    for(let count=1;count<=8;count++){
      await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.mouse.move(5,5);
      const zoom=1.4**count,expected=['M','I','L'].filter(type=>zoom>={M:3,I:6,L:12}[type]).sort();
      assert.deepEqual(await visible(),expected,`Progressive labels at zoom ${zoom}`);
    }
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    await toggle.check();assert.equal(await page.locator('g[data-station] text').count(),await page.locator('g[data-station]').count());
    await toggle.uncheck();
    for(let i=0;i<8;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    const dimensions=(await page.locator('.map-canvas svg').getAttribute('viewBox')).split(' ').map(Number);
    for(const [name,cx,cy] of [['north',410,-7525],['central',260,-40]]){
      const view=`${cx-dimensions[2]/2} ${cy-dimensions[3]/2} ${dimensions[2]} ${dimensions[3]}`;
      // Crop the actual SVG DOM without changing JSON or triggering editor edits.
      await page.locator('.map-canvas svg').evaluate((svg,view)=>svg.setAttribute('viewBox',view),view);
      await page.locator('.map-card').screenshot({path:`${root}test-results/stations-${name}.png`});
    }
    assert.equal(await page.locator('g[data-station="GB"] [data-station-marker="M"]').count(),1);
    for(const id of ['GH','NWM'])assert.equal(await page.locator(`g[data-station="${id}"] [data-station-marker="I"]`).count(),1);
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    const downloads=page.waitForEvent('download');await page.locator('.json-actions button.primary').click();await downloads;
    assert.deepEqual(errors,[]);
    console.log('Map rendering: progressive labels, label toggle, three marker types and real SVG station screenshots passed.');
  }finally{await context.close();}
}
