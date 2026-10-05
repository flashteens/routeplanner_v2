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
    const invalidSlopes=await page.locator('path[data-edge]').evaluateAll(paths=>paths.flatMap(path=>{
      const tokens=path.getAttribute('d').match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)||[];let i=0,previous;
      const point=()=>({x:Number(tokens[i++]),y:Number(tokens[i++])});
      while(i<tokens.length){const command=tokens[i++];if(command==='Q'){point();previous=point();continue;}const next=point();if(command==='L'){const dx=Math.abs(next.x-previous.x),dy=Math.abs(next.y-previous.y);if(dx>1e-6&&dy>1e-6&&Math.abs(dx-dy)>1e-6)return[path.dataset.edge];}previous=next;}
      return [];
    }));
    assert.deepEqual(invalidSlopes,[],'Every rendered straight SVG segment must be horizontal, vertical or exactly 45 degrees');
    for(const [name,cx,cy] of [['north',410,-7525],['central',260,-40],['sal-west',2280,-120],['sal-south',2160,135]]){
      const view=`${cx-dimensions[2]/2} ${cy-dimensions[3]/2} ${dimensions[2]} ${dimensions[3]}`;
      // Crop the actual SVG DOM without changing JSON or triggering editor edits.
      await page.locator('.map-canvas svg').evaluate((svg,view)=>svg.setAttribute('viewBox',view),view);
      await page.locator('.map-card').screenshot({path:`${root}test-results/stations-${name}.png`});
    }
    assert.equal(await page.locator('g[data-station="GB"] [data-station-marker="M"]').count(),1);
    for(const id of ['GH','NWM'])assert.equal(await page.locator(`g[data-station="${id}"] [data-station-marker="I"]`).count(),1);
    const megaStroke=Number(await page.locator('g[data-station="GB"] [data-station-marker]').getAttribute('stroke-width'));
    const mediumStroke=Number(await page.locator('g[data-station="GH"] [data-station-marker]').getAttribute('stroke-width'));
    assert.equal(megaStroke,mediumStroke*2,'Mega stations have a visibly thicker circular outline');
    assert.equal(await page.locator('g[data-station="SE12"] [data-station-marker]').getAttribute('data-station-marker'),'L');
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    const downloads=page.waitForEvent('download');await page.locator('.json-actions button.primary').click();await downloads;
    assert.deepEqual(errors,[]);
    console.log('Map rendering: progressive labels, label toggle, three marker types, octilinear straight segments and real SVG station screenshots passed.');
  }finally{await context.close();}
}
