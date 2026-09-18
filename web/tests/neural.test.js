import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TasteCircuit} from '../dist/neural.js';
import {createState,addFood,advance,shock,clearMemory} from '../dist/model.js';
const data=JSON.parse(readFileSync(new URL('../dist/data/taste-circuit.json',import.meta.url),'utf8'));

test('anatomical data retains exact string IDs, integer synapse counts and signed connections',()=>{
 assert.equal(data.neurons.length,447);assert.equal(data.edges.length,24403);
 assert.equal(data.neurons[data.output].id,'720575940660219265');assert.equal(data.inputs.length,21);
 assert.equal(new Set(data.neurons.map(n=>n.id)).size,447);
 for(const n of data.neurons)assert.match(n.id,/^\d{18}$/);
 for(const [pre,post,count,signed] of data.edges){
  assert.ok(pre>=0&&pre<447&&post>=0&&post<447);assert.ok(Number.isInteger(count)&&count>0);
  assert.equal(Math.abs(signed),count);
 }
 assert.ok(data.edges.some(e=>e[3]<0));
 assert.equal(data.edges.reduce((sum,e)=>sum+e[2],0),218932);
});
test('real reduced circuit is silent at rest and drives MN9 with sugar input',()=>{
 const brain=new TasteCircuit(data);brain.advance(.5,false);assert.equal(brain.totalSpikes,0);
 brain.advance(.5,true);assert.ok(brain.outputSpikes>10);assert.ok(brain.snapshot().sugarSpikes>100);
 assert.ok([...brain.v,...brain.g].every(Number.isFinite));
});
test('disconnecting the graph or silencing MN9 abolishes output but preserves input spikes',()=>{
 for(const disconnect of [false,true]){
  const brain=new TasteCircuit(disconnect?{...data,edges:[]}:data);brain.silenced=!disconnect;
  brain.advance(.5,true);assert.equal(brain.outputSpikes,0);assert.ok(brain.snapshot().sugarSpikes>100);
 }
});
test('feeding causally requires neural output, not contact alone',()=>{
 for(const silenced of [false,true]){
  const brain=new TasteCircuit(data);brain.silenced=silenced;
  const s=createState(brain);addFood(s,s.x,s.y);advance(s,.15);assert.equal(s.eaten,0);
  advance(s,.6);assert.equal(s.eaten,silenced?0:1);
  if(silenced){assert.ok(s.tasting);brain.silenced=false;advance(s,.5);assert.equal(s.eaten,1);}
 }
});
test('seeded neural integration is invariant to outer frame segmentation',()=>{
 const a=new TasteCircuit(data,42),b=new TasteCircuit(data,42);
 a.advance(.2,true);for(let i=0;i<20;i++)b.advance(.01,true);
 assert.deepEqual([...a.counts],[...b.counts]);assert.deepEqual([...a.v],[...b.v]);
 a.reset(42);assert.equal(a.totalSpikes,0);assert.ok([...a.v].every(v=>v===-52));
});
test('exact passive decay agrees with closed-form voltage solution',()=>{
 const simple={...data,neurons:[{id:'1'}],inputs:[],output:0,edges:[],parameters:{...data.parameters,threshold_mv:100}};
 const brain=new TasteCircuit(simple);brain.v[0]=-42;brain.g[0]=2;brain.advance(.01);
 const em=Math.exp(-10/20),es=Math.exp(-10/5);
 const expected=-52+10*em+2*5/(20-5)*(em-es);
 assert.ok(Math.abs(brain.v[0]-expected)<1e-10);assert.ok(Math.abs(brain.g[0]-2*es)<1e-10);
});

test('learned avoidance gates feeding separately from an unchanged FlyWire circuit',()=>{
 const brain=new TasteCircuit(data),s=createState(brain);
 addFood(s,s.x,s.y);advance(s,.2);assert.equal(s.eaten,0);assert.ok(brain.outputSpikes>0);
 shock(s,1);advance(s,2);assert.equal(s.eaten,0);
 // Move to the stimulus as an experimental probe: taste still drives the circuit.
 s.x=s.foods[0].x;s.y=s.foods[0].y;
 const before=brain.snapshot().sugarSpikes;advance(s,.1);
 assert.ok(brain.snapshot().sugarSpikes>before);assert.equal(s.eaten,0);assert.equal(brain.silenced,false);
 clearMemory(s);advance(s,10);assert.equal(s.eaten,1);
});
