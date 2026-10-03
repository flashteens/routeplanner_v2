import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {findRoute} from '../shared/router.js';
import {validateNetwork} from '../shared/network.js';
import {routeText,translator} from '../shared/format.js';
import {systemTitle,footerDescription,segmentInstruction,sourceLinks} from '../shared/presentation.js';
import {recordEdit,replayHistory,validateEditorHistory} from '../shared/editor-history.js';
import {applyPresentation} from '../scripts/presentation.js';

const network=id=>JSON.parse(fs.readFileSync(new URL(`../public/data/${id}.json`,import.meta.url)));
const dict=lang=>JSON.parse(fs.readFileSync(new URL(`../public/i18n/${lang}.json`,import.meta.url)));

test('each network offers four route preferences and its localized primary link',()=>{
  for(const id of ['ftmc','ftmc_preview','trtc','newisle']){
    const data=network(id);
    assert.deepEqual(data.options.criteria,['time','transfers','stops','mixed']);
    assert.throws(()=>findRoute(data,Object.keys(data.stations)[0],Object.keys(data.stations)[1],{criteria:'transferTime'}),/INVALID_CRITERIA/);
    for(const lang of ['en','zh','ja']){
      assert.match(sourceLinks(data,lang)[0].url,id==='trtc'?/metro\.taipei/:/planetminecraft\.com\/project\//);
      assert.equal(systemTitle(data,lang,translator(dict(lang))).includes(translator(dict(lang))('unofficial')),['trtc','newisle'].includes(id));
    }
    assert.deepEqual(applyPresentation(structuredClone(data)),data,'Migration preserves the checked-in presentation metadata.');
  }
});

test('TRTC waiting-time descriptions are portable and included in all text results',()=>{
  const data=network('trtc'),route=findRoute(data,'BR01','R28');
  for(const lang of ['en','zh','ja'])assert.ok(routeText(data,route,lang,dict(lang)).includes(footerDescription(data,lang)));
  assert.equal(footerDescription({footer:{description:{en:'Custom waiting-time policy'}}},'ja'),'Custom waiting-time policy');
});

test('walkway and through-running instructions match the supplied example in three languages',()=>{
  const data=network('ftmc'),route=findRoute(data,'BX_PV','SGP');
  assert.equal(route.transfers,1);
  const expected={en:['Transfer: via','Continue on','no train change'],zh:['轉乘：途經','繼續搭乘','不需換車'],ja:['乗換：','引き続き乗車','乗換不要']};
  for(const [lang,words] of Object.entries(expected)){
    const text=routeText(data,route,lang,dict(lang));for(const word of words)assert.ok(text.includes(word));
    const s=route.segments;
    assert.ok(segmentInstruction(data,s,1,lang,translator(dict(lang))).includes(words[0]));
    assert.ok(!segmentInstruction(data,s,3,lang,translator(dict(lang))).includes(words[1]),'Riding after a transfer still requires boarding.');
  }
});

test('custom footer descriptions support validation, undo, redo, and history roundtrips',()=>{
  const before=network('trtc'),after={...before,footer:{description:{en:'Custom text',zh:'自訂說明',ja:'カスタム説明'}}};
  const edited=recordEdit(before,after,{kind:'edit',target:'settings:footer'},validateNetwork);
  assert.deepEqual(validateEditorHistory(edited,validateNetwork),[]);
  const undone=replayHistory(edited,false,validateNetwork);assert.deepEqual(undone.footer,before.footer);
  assert.deepEqual(replayHistory(undone,true,validateNetwork).footer,after.footer);
  for(const footer of [[],{description:[]},{description:{zh:42}}])assert.ok(validateNetwork({...before,footer}).length);
});
