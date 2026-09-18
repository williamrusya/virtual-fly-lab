import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,addFood,shock,advance,status} from '../dist/model.js';

test('food rewards consumption, not placement',()=>{
 const s=createState();const initial=s.pleasure;addFood(s,s.x+100,s.y);
 assert.equal(s.pleasure,initial);advance(s,4);
 assert.equal(s.eaten,1);assert.equal(s.foods.length,0);assert.ok(s.pleasure>initial+20);
});
test('shock immediately causes stress and damage, with cooldown',()=>{
 const s=createState();assert.ok(shock(s,2));assert.equal(s.stress,44);assert.equal(s.health,78);
 assert.equal(shock(s,2),false);assert.equal(s.shocks,1);advance(s,.8);assert.ok(shock(s,2));
});
test('repeated strong shocks kill; dead fly cannot be fed, moved or revived',()=>{
 const s=createState();for(let i=0;i<4&&s.alive;i++){shock(s,3);advance(s,.8);}
 assert.equal(s.alive,false);assert.equal(s.health,0);assert.equal(status(s),'Погибла');
 const snapshot=JSON.stringify(s);assert.equal(addFood(s,s.x,s.y),false);assert.equal(shock(s,1),false);
 advance(s,100);assert.equal(JSON.stringify(s),snapshot);assert.equal(createState().alive,true);
});
test('prolonged high stress damages health and can cause death',()=>{
 const s=createState();s.stress=100;s.health=3;advance(s,1);
 assert.equal(s.alive,false);assert.equal(s.health,0);
});
test('pause freezes time and disables stimuli',()=>{
 const s=createState();s.paused=true;const before=JSON.stringify(s);
 advance(s,20);assert.equal(shock(s,1),false);assert.equal(addFood(s,200,200),false);
 assert.equal(JSON.stringify(s),before);
});
test('stress recovers, food count is bounded, invalid shock fails without mutations',()=>{
 const s=createState();shock(s,1);advance(s,10);assert.ok(s.stress<22);
 for(let i=0;i<6;i++)addFood(s,300,300);assert.equal(s.foods.length,5);
 const before=JSON.stringify(s);assert.throws(()=>shock(s,4));assert.equal(JSON.stringify(s),before);
});
test('integration is independent of display frame rate',()=>{
 const a=createState(),b=createState();shock(a,2);shock(b,2);
 for(let i=0;i<60;i++)advance(a,1/60);for(let i=0;i<30;i++)advance(b,1/30);
 assert.ok(Math.abs(a.stress-b.stress)<1e-8);assert.ok(Math.abs(a.health-b.health)<1e-8);
 assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<2);
});

test('reaches sugar at all arena edges and behind the fly',()=>{
 for(const [x,y] of [[90,90],[810,90],[90,530],[810,530],[250,315]]){
   const s=createState();addFood(s,x,y);advance(s,15);
   assert.equal(s.eaten,1,`unreachable sugar at ${x},${y}`);
 }
});
