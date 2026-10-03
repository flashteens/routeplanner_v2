import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export async function verifyImprovements(browser,origin,root){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    for(const conf of ['ftmc','ftmc_preview','trtc','newisle'])for(const lang of ['en','zh','ja']){
      const network=JSON.parse(await fs.readFile(`${root}public/data/${conf}.json`,'utf8'));
      await page.goto(`${origin}/?conf=${conf}&lang=${lang}`);
      await page.locator('.query-card').waitFor();
      const primary=page.locator('.source-button');
      assert.match(await primary.getAttribute('href'),conf==='trtc'?/metro\.taipei/:/planetminecraft\.com\/project\//);
      assert.equal(await page.locator('.query-card select').first().locator('option').count(),4);
      const marker={en:'Unofficial',zh:'非官方',ja:'非公式'}[lang];
      for(const title of [await page.title(),await page.locator('.page-intro h1').textContent()])assert.equal(title.includes(`(${marker})`),['trtc','newisle'].includes(conf));
      if(conf==='trtc'){
        assert.equal(await primary.textContent(),{en:'Taipei Metro website ↗',zh:'台北捷運官網 ↗',ja:'台北メトロ公式サイト ↗'}[lang]);
        assert.equal(await page.locator('.page-intro .network-description').textContent(),network.footer.description[lang]);
        assert.equal(await page.locator('footer .network-description').textContent(),network.footer.description[lang]);
      }
    }
    for(const field of ['from','to']){
      await page.goto(`${origin}/?conf=ftmc&lang=zh&${field}=NV`);
      await page.locator('.result-card .station-details').waitFor();
      const detail=await page.locator('.result-card').innerText();
      for(const text of ['Notchland Village','諾基蘭村','車站代碼','可搭乘路線','X -620','Y 80','Z 580'])assert.ok(detail.includes(text),text);
      assert.match(await page.locator('.result-card a').getAttribute('href'),/flashteens\.fandom\.com\/wiki\/Special:Search\?query=Notchland/);
    }
    await page.goto(`${origin}/?conf=ftmc&lang=en&from=NV&to=FH`);
    await page.locator('.map-field.from').click();assert.equal(await page.locator('.map-field.to').count(),1);
    await page.locator('g[data-station="NV"]').press('Enter');assert.equal(new URL(page.url()).searchParams.get('to'),'NV');
    await page.locator('.map-field.to').click();await page.locator('g[data-station="FH"]').press('Enter');assert.equal(new URL(page.url()).searchParams.get('from'),'FH');
    const wording={en:['Transfer: via','Continue on','no train change'],zh:['轉乘：途經','繼續搭乘','不需換車'],ja:['乗換：','引き続き乗車','乗換不要']};
    for(const lang of ['en','zh','ja']){
      await page.goto(`${origin}/?conf=ftmc&lang=${lang}&from=BX_PV&to=SGP`);await page.locator('.itinerary').waitFor();
      const text=await page.locator('.itinerary').innerText();for(const word of wording[lang])assert.ok(text.includes(word));
      const html=await fetch(`${origin}/route?conf=ftmc&lang=${lang}&from=BX_PV&to=SGP`).then(response=>response.text());for(const word of wording[lang])assert.ok(html.includes(word));
    }
    await page.goto(`${origin}/editor?conf=trtc&lang=en`);await page.locator('.editor-panel').waitFor();
    assert.equal(await page.locator('.json-actions button').count(),2);
    assert.equal(await page.locator('.network-json').count(),0);
    assert.equal(await page.getByRole('button',{name:'Load JSON',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Save JSON to text',exact:true}).count(),0);
    await page.getByRole('button',{name:'System settings',exact:true}).click();
    const footer=page.getByLabel('Footer descriptions (JSON)',{exact:true});
    await footer.fill(JSON.stringify({en:'Custom waiting policy',zh:'自訂候車說明',ja:'待ち時間の説明'}));await footer.press('Tab');
    await page.getByRole('button',{name:'Try this network',exact:false}).click();
    assert.equal(await page.locator('.page-intro .network-description').textContent(),'Custom waiting policy');
    await page.getByRole('button',{name:'Back to editor',exact:false}).click();
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    await page.getByRole('button',{name:'System settings',exact:true}).click();
    assert.match(await page.getByLabel('Footer descriptions (JSON)',{exact:true}).inputValue(),/do not include any waiting time/);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}

  console.log('Improvements: primary links, unofficial titles, footer customization, four preferences, single-station info, mode switch, three-language instructions and file-only editor passed.');
  await verifyTouch(browser,origin,root);
}

export async function verifyTouch(browser,origin,root){
  const errors=[];
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const touch=await mobile.newPage();touch.on('pageerror',error=>errors.push(error.message));
  const cdp=await mobile.newCDPSession(touch);
  async function pinch(first,second,targetScale=2){
    const midpoint={x:(first.x+second.x)/2,y:(first.y+second.y)/2};
    const points=(scale)=>[first,second].map((p,i)=>({id:i+1,x:midpoint.x+(p.x-midpoint.x)*scale,y:midpoint.y+(p.y-midpoint.y)*scale}));
    const svg=touch.locator('.map-canvas svg'),before=(await svg.getAttribute('viewBox')).split(' ').map(Number);
    const anchor=await svg.evaluate((s,p)=>new DOMPoint(p.x,p.y).matrixTransform(s.getScreenCTM().inverse()).toJSON(),midpoint);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(1)});
    for(const progress of [.25,.5,.75,1])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(1+(targetScale-1)*progress)});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    try{await touch.waitForFunction(({width,scale})=>Math.abs(Number(document.querySelector('.map-canvas svg').getAttribute('viewBox').split(' ')[2])-width/scale)<width*.05,{width:before[2],scale:targetScale},{timeout:5000});}catch(error){await touch.screenshot({path:root+'test-results/touch-failure.png',fullPage:true});console.log('Touch diagnostic',JSON.stringify({first,second,before,viewBox:await svg.getAttribute('viewBox')}));throw error;}
    const after=await svg.evaluate((s,p)=>new DOMPoint(p.x,p.y).matrixTransform(s.getScreenCTM().inverse()).toJSON(),midpoint);
    assert.ok(Math.hypot(after.x-anchor.x,after.y-anchor.y)<before[2]*.01,'Pinch keeps the map point under its midpoint.');
    assert.ok(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout does not overflow.');
  }
  try{
    await touch.goto(`${origin}/?conf=trtc&lang=en`);await touch.locator('.map-card').scrollIntoViewIfNeeded();
    let box=await touch.locator('.map-canvas svg').boundingBox();
    await pinch({x:box.x+box.width/2-30,y:box.y+box.height/2},{x:box.x+box.width/2+30,y:box.y+box.height/2});
    await pinch({x:box.x+box.width/2-30,y:box.y+box.height/2},{x:box.x+box.width/2+30,y:box.y+box.height/2},.5);
    assert.equal(new URL(touch.url()).searchParams.has('from'),false,'Pinch does not choose a station.');
    await touch.screenshot({path:root+'test-results/planner-touch.png',fullPage:true});
    await touch.goto(`${origin}/editor?conf=trtc&lang=en`);await touch.locator('.editor-panel').waitFor();
    await touch.locator('.map-heading select').selectOption('BR');await touch.locator('.map-card').scrollIntoViewIfNeeded();
    const station=touch.locator('g[data-station="BR01"]'),position=await station.getAttribute('transform');
    await station.scrollIntoViewIfNeeded();
    box=await station.locator('circle').first().boundingBox();const first={x:box.x+box.width/2,y:box.y+box.height/2};
    const hit=await touch.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('[data-station]')?.dataset.station,first);
    assert.equal(hit,'BR01','The editor pinch starts on the visible station, clear of map controls.');
    await pinch(first,{x:first.x+40,y:first.y});
    assert.equal(await station.getAttribute('transform'),position,'Pinch starting on a station does not drag it.');
    assert.ok(await touch.getByRole('button',{name:'Undo',exact:true}).isDisabled(),'Pinch does not create an edit history group.');
    box=await station.locator('circle').first().boundingBox();const grab={id:1,x:box.x+box.width/2,y:box.y+box.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[grab]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...grab,x:grab.x-18,y:grab.y-12}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.notEqual(await station.getAttribute('transform'),position,'A single finger can drag a station after pinching.');
    assert.ok(await touch.getByRole('button',{name:'Undo',exact:true}).isEnabled());
    await touch.screenshot({path:root+'test-results/editor-touch.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Mobile touch: native pinch zoom in/out, midpoint anchoring, station protection, and subsequent single-finger editing passed.');
  }catch(error){await touch.screenshot({path:root+'test-results/touch-failure.png',fullPage:true});throw error;}finally{await mobile.close();}
}
