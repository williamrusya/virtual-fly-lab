import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MushroomBody} from '../dist/learning.js';
const data=JSON.parse(readFileSync(new URL('../dist/data/learning-circuit.json',import.meta.url),'utf8'));
const fresh=()=>new MushroomBody(data);
function train(m){m.advance(.5,0);m.reinforce(1);m.advance(.6,0);m.advance(5,null);}

test('learning circuit contains annotated IDs, real positive counts, and compartment-matched modulation',()=>{
 const m=fresh();assert.equal(m.kcs.length,905);assert.equal(m.mbons.length,3);assert.equal(m.dans.length,2);
 assert.equal(m.edges.length,2575);assert.equal(data.edges.length,3287);
 assert.equal(data.edges.reduce((s,e)=>s+e[2],0),15062);
 assert.equal(new Set(data.neurons.map(n=>n.id)).size,910);
 for(const n of data.neurons)assert.match(n.id,/^\d{18}$/);
 for(const [a,b,n] of data.edges){assert.ok(Number.isInteger(n)&&n>0);assert.ok(data.neurons[a]&&data.neurons[b]);}
 for(let i=0;i<m.edges.length;i++)for(const d of m.modulators[i]){
   assert.equal(data.neurons[d].compartment,data.neurons[m.edges[i][1]].compartment);
   assert.ok(data.edges.some(([a,b])=>a===d&&b===m.edges[i][1]));
 }
});

test('paired activity changes synapses, depresses MBON recall and spares a separate cue',()=>{
 const m=fresh();train(m);const learned=[...m.weights];
 assert.ok(learned.some(w=>w<.5));assert.ok(learned.every(w=>w>=.05&&w<=1));
 m.advance(.5,0);assert.ok(m.avoidance>.6);
 assert.ok(m.snapshot().outputActivity<m.snapshot().referenceActivity*.4);
 m.advance(5,null);m.advance(.5,1);assert.ok(m.avoidance<.001);
 // Sufficient settling prevents a residual KC trace being mistaken for long-term memory.
 m.advance(90,null);m.advance(.5,0);assert.ok(m.avoidance>.6);
 assert.ok([...m.weights].every((w,i)=>Math.abs(w-learned[i])<1e-8));
});

test('cue alone, shock alone, delayed shock, blocked plasticity and silenced DAN are controls',()=>{
 for(const condition of ['cue-only','shock-only','delayed','frozen','DAN-off']){
   const m=fresh();
   if(condition==='frozen')m.plasticityEnabled=false;
   if(condition==='DAN-off')m.danSilenced=true;
   if(condition==='cue-only')m.advance(2,0);
   else if(condition==='shock-only'){m.reinforce(1);m.advance(2,null);}
   else if(condition==='delayed'){m.advance(.5,0);m.advance(30,null);m.reinforce(1);m.advance(2,null);}
   else train(m);
   m.advance(5,null);m.advance(.5,0);
   assert.ok(m.avoidance<.001,condition);assert.equal(m.snapshot().changedConnections,0,condition);
 }
});

test('memory is causally in weights: transplant transfers recall; reset restores baseline',()=>{
 const trained=fresh();train(trained);
 const recipient=fresh();recipient.weights.set(trained.weights);recipient.advance(.5,0);
 assert.ok(recipient.avoidance>.6);assert.equal(recipient.snapshot().dopamineActivity,0);
 recipient.clearMemory();recipient.advance(.5,0);assert.equal(recipient.avoidance,0);
 assert.ok([...recipient.weights].every(w=>w===1));
});

test('learning integration is deterministic across frame segmentation',()=>{
 const a=fresh(),b=fresh();a.advance(.5,0);for(let i=0;i<50;i++)b.advance(.01,0);
 a.reinforce(1);b.reinforce(1);a.advance(.7,0);for(let i=0;i<70;i++)b.advance(.01,0);
 assert.deepEqual([...a.weights],[...b.weights]);assert.deepEqual([...a.rates],[...b.rates]);
});
