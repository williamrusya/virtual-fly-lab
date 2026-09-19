import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MushroomBody} from '../dist/learning.js';
import {createState,startChoice,advance,shock,addFood} from '../dist/model.js';
const data=JSON.parse(readFileSync(new URL('../dist/data/learning-circuit.json',import.meta.url),'utf8'));

test('two feeders are visited without training; either signal can acquire avoidance, independent of side',()=>{
 for(const [punished,swapped] of [[null,false],[0,false],[1,false],[0,true]]){
   const m=new MushroomBody(data);
   if(punished!==null){m.advance(.5,punished);m.reinforce(1);m.advance(.6,punished);}
   const s=createState(null,m);startChoice(s);startChoice(s,true,swapped);
   const before=[...m.weights];advance(s,35);
   assert.deepEqual([...m.weights],before,'test phase must preserve weights exactly');
   if(punished===null){assert.ok(s.visits.test.every(n=>n>=2));}
   else{assert.equal(s.visits.test[punished],0);assert.ok(s.visits.test[1-punished]>=2);}
   assert.equal(s.foods.length,2,'feeders persist after consumption');
   assert.ok(s.foods.some(f=>f.readyAt>0));
 }
});

test('visit counting uses entry/exit hysteresis, not frames or consumption',()=>{
 const s=createState({advance:()=>0});startChoice(s);s.x=220;s.y=310;
 advance(s,2);assert.deepEqual(s.visits.training,[1,0]);assert.equal(s.eaten,0);
 s.x=270;advance(s,.02);s.x=220;advance(s,.02);assert.equal(s.visits.training[0],1);
 s.x=300;advance(s,.02);s.x=220;advance(s,.02);assert.equal(s.visits.training[0],2);
 const visits=JSON.stringify(s.visits);s.paused=true;advance(s,10);assert.equal(JSON.stringify(s.visits),visits);
});

test('test preparation preserves weights and physiology, clears reinforcement, blocks shocks and separate food',()=>{
 const m=new MushroomBody(data),s=createState(null,m);startChoice(s);
 m.advance(.5,0);shock(s,1);m.advance(.2,0);
 s.visits.training=[2,1];const before=[...m.weights],health=s.health,stress=s.stress;
 assert.ok(startChoice(s,true,true));assert.equal(s.health,health);assert.equal(s.stress,stress);
 assert.equal(s.x,450);assert.equal(s.y,310);assert.deepEqual([...m.weights],before);
 assert.equal(m.pulseRemaining,0);assert.equal(m.snapshot().eligibility,0);
 assert.deepEqual(s.visits.training,[2,1]);assert.deepEqual(s.visits.test,[0,0]);
 assert.equal(s.foods.find(f=>f.cue===0).x,680);
 const snapshot=JSON.stringify(s);assert.equal(shock(s,3),false);assert.equal(addFood(s,400,300),false);
 assert.equal(JSON.stringify(s),snapshot);
});
