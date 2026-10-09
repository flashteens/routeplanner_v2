import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export async function verifyFieldHelp(browser,origin,root){
  const data=JSON.parse(await fs.readFile(root+'public/data/ftmc.json','utf8'));
  const errors=[];
  for(const lang of ['zh','en','ja']){
    const t=JSON.parse(await fs.readFile(root+`public/i18n/${lang}.json`,'utf8'));
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(`${origin}/editor?conf=ftmc&lang=${lang}`);await page.locator('.editor-grid').waitFor();
      await page.locator('.editor-tabs').getByRole('button',{name:t.edges,exact:true}).click();
      const check=async(field,text,docs)=>{
        const name=`${t.fieldHelp}: ${t[field]}`,button=page.getByRole('button',{name,exact:true}),panel=page.getByRole('dialog',{name,exact:true});
        await button.tap();await panel.waitFor();assert.ok((await panel.textContent()).includes(t[text]));
        const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,'Field help stays within mobile viewport.');
        if(docs){const link=panel.getByRole('link',{name:t.fieldHelpDocs,exact:true});assert.equal(await link.getAttribute('href'),`/docs/editor-fields.html#${docs}-${lang}`);assert.equal(await link.getAttribute('target'),'_blank');const response=await page.request.get(origin+'/docs/editor-fields.html');assert.equal(response.status(),200);assert.ok((await response.text()).includes(`id="${docs}-${lang}"`));}
        else assert.equal(await panel.getByRole('link').count(),0);
        await panel.getByRole('button',{name:t.close,exact:true}).tap();await panel.waitFor({state:'hidden'});
      };
      for(const kind of ['ride','walk','transfer']){
        const edge=data.edges.find(e=>e.kind===kind&&e.bidirectional);
        await page.locator('.editor-list-tools input').fill(edge.id);await page.locator('.editor-list button').first().click();
        await check('timeSec',`${kind}TimeHelp`);await check('reverseTimeSec',`${kind}TimeHelp`);
        await check('delayWhenUnfamiliar','familiarityHelp');await check('conditions','variantsHelp','variants');
      }
      await page.locator('.editor-tabs').getByRole('button',{name:t.settings,exact:true}).click();
      await check('footerDescription','footerDescriptionHelp');await check('fareMatrix','faresHelp','fares');await check('advanced','optionsHelp','options');
      assert.equal(await page.locator('.unsaved-status').count(),0,'Help does not edit the document.');
      assert.equal(await page.getByRole('button',{name:t.undo,exact:true}).isEnabled(),false);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }finally{await context.close();}
  }
  assert.deepEqual(errors,[]);
  console.log('Field help: localized ride/walk/transfer timing, variants, all settings JSON fields, mobile bounds, deployed documentation links and unchanged document passed.');
}
