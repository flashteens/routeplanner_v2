import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export async function verifyArrivalHelp(browser,origin,root){
  const data=JSON.parse(await fs.readFile(root+'public/data/ftmc.json','utf8'));
  const edge=data.edges.find(e=>e.lineId==='L6'&&e.from==='CMI'&&e.to==='CH');
  const dicts=Object.fromEntries(await Promise.all(['en','zh','ja'].map(async lang=>[lang,JSON.parse(await fs.readFile(root+`public/i18n/${lang}.json`,'utf8'))])));
  const select=async(page,t)=>{
    await page.locator('.editor-grid').waitFor();await page.locator('.editor-tabs').getByRole('button',{name:t.edges,exact:true}).click();
    await page.locator('.editor-list-tools input').fill(edge.id);await page.locator('.editor-list button').first().click();
  };
  const errors=[],context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
    for(const lang of ['en','zh','ja']){
      const t=dicts[lang];await page.goto(`${origin}/editor?conf=ftmc&lang=${lang}`);await select(page,t);
      assert.equal(await page.locator('[data-direction-label="arrivalDirectionLabel"],[data-direction-label="reverseArrivalDirectionLabel"]').count(),0);
      for(const field of ['arrivalDirection','reverseArrivalDirection']){
        const name=`${t.fieldHelp}: ${t[field]}`,help=page.getByRole('button',{name,exact:true}),panel=page.getByRole('dialog',{name,exact:true});
        assert.equal(await help.getAttribute('aria-expanded'),'false');
        await help.hover();await panel.waitFor();assert.equal(await help.getAttribute('aria-expanded'),'true');
        assert.ok((await panel.textContent()).includes(field==='arrivalDirection'?'direction':'reverseDirection'));
        assert.ok(await panel.getByRole('img',{name:t.arrivalHelpDiagram,exact:true}).isVisible());
        assert.ok((await panel.locator('figcaption').textContent()).includes('IN'));assert.ok((await panel.locator('figcaption').textContent()).includes('LOOP'));
        await page.getByLabel(t.direction,{exact:true}).hover();await panel.waitFor({state:'hidden'});
        await help.focus();await page.keyboard.press('Enter');await panel.waitFor();await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
      }
      assert.equal(await page.getByLabel(t.arrivalDirection,{exact:true}).inputValue(),edge.arrivalDirection);
      assert.equal(await page.getByLabel(t.reverseArrivalDirection,{exact:true}).inputValue(),edge.reverseArrivalDirection);
      assert.equal(await page.locator('.unsaved-status').count(),0,'Reading help must not edit the document.');
      assert.equal(await page.getByRole('button',{name:t.undo,exact:true}).isEnabled(),false);
    }
  }finally{await context.close();}
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));
  try{
    const t=dicts.zh;await phone.goto(origin+'/editor?conf=ftmc&lang=zh');await select(phone,t);
    for(const field of ['arrivalDirection','reverseArrivalDirection']){
      const name=`${t.fieldHelp}: ${t[field]}`,help=phone.getByRole('button',{name,exact:true}),panel=phone.getByRole('dialog',{name,exact:true});
      await help.tap();await panel.waitFor();assert.equal(await help.getAttribute('aria-expanded'),'true');
      const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,'Mobile help stays within the viewport.');
      assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(field==='arrivalDirection')await phone.screenshot({path:root+'test-results/editor-arrival-help-mobile.png',fullPage:true});
      await help.tap();await panel.waitFor({state:'hidden'});
      await help.tap();await panel.waitFor();await panel.getByRole('button',{name:t.close,exact:true}).tap();await panel.waitFor({state:'hidden'});
      await help.tap();await panel.waitFor();await phone.locator('.map-heading h2').tap();await panel.waitFor({state:'hidden'});
    }
    assert.equal(await phone.locator('.unsaved-status').count(),0);
    assert.equal(await phone.getByLabel(t.reverseDirection,{exact:true}).inputValue(),edge.reverseArrivalDirection,'Existing L6 same-code ordinary/reverse-arrival settings remain intact.');
    assert.deepEqual(errors,[]);
    console.log('Arrival help: three-language hover/keyboard, optional existing fields, figure-9 diagram, mobile tap/toggle/close/outside click, viewport bounds and no document changes passed.');
  }finally{await mobile.close();}
}
