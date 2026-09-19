import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState,advance,shock,addFood,startChoice} from '../dist/model.js';
import {MushroomBody} from '../dist/learning.js';
import {startSpider,moveWeb,webCue} from '../dist/spider.js';
const data=JSON.parse(readFileSync(new URL('../dist/data/learning-circuit.json',import.meta.url)));
const run=enabled=>{const s=createState(null,new MushroomBody(data));startSpider(s,enabled);return s;};
test('matched 60-second predator trials: synaptic learning reduces captures and preserves food seeking',()=>{
  const learned=run(true),control=run(false);
  for(let i=0;i<600;i++){advance(learned,.1);advance(control,.1);}
  assert.ok(learned.alive);assert.ok(learned.spider.escapes>=1);
  assert.ok(learned.spider.catches<control.spider.catches);
  assert.ok(learned.eaten>0);assert.ok(control.eaten>0);
  assert.ok(learned.learning.snapshot().cueDepression[2]>.35);
  assert.deepEqual(learned.learning.snapshot().cueDepression.slice(0,2),[0,0]);
  assert.ok(control.learning.weights.every(w=>w===1));
});
test('deep capture is fatal; death and pause freeze predator and neural state',()=>{
  const s=run(true);s.x=450;s.y=310;s.spider.x=480;
  s.paused=true;const before=JSON.stringify(s);advance(s,3);assert.equal(JSON.stringify(s),before);
  s.paused=false;advance(s,3);assert.equal(s.alive,false);
  assert.ok(s.events.some(e=>e.text.includes('Паук съел')));
  const dead=JSON.stringify(s);advance(s,2);assert.equal(JSON.stringify(s),dead);
});
test('web cue follows relocated geometry, controls reject interference, choice exits predator mode',()=>{
  const s=run(true);s.x=450;s.y=160;
  assert.equal(webCue(s),2);assert.equal(shock(s,1),false);assert.equal(addFood(s,100,100),false);
  assert.equal(moveWeb(s),true);assert.equal(webCue(s),null);
  s.spider.trapped=true;assert.equal(moveWeb(s),false);s.spider.trapped=false;
  assert.equal(startChoice(s),true);assert.equal(s.spider,null);
});
test('predator integration agrees across frame segmentation',()=>{
  const a=run(true),b=run(true);advance(a,8);for(let i=0;i<400;i++)advance(b,.02);
  assert.ok(Math.abs(a.x-b.x)<1e-7);assert.ok(Math.abs(a.y-b.y)<1e-7);
  assert.equal(a.spider.catches,b.spider.catches);
});
