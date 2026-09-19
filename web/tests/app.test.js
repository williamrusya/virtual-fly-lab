import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('actual app loop updates both clock and visible sprite; feed control leads to eating', async()=>{
  const elements=new Map();let callback;
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(html.includes(`id="${id}"`),`missing UI element ${id}`);
  const context=new Proxy({}, {get:(o,key)=>o[key]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  function element(id){if(!elements.has(id))elements.set(id,{
    style:{},hidden:false,children:[],listeners:{},classList:{toggle(){}},
    getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:900,height:620}),
    setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;},
    replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},dataset:{},
  });return elements.get(id);}
  globalThis.document={hidden:false,getElementById:element,querySelector:element,
    createElement:()=>element(Symbol()),createTextNode:text=>text,addEventListener(){}};
  globalThis.Image=class{complete=true;naturalWidth=3072;addEventListener(){}};
  globalThis.matchMedia=()=>({matches:false});
  globalThis.requestAnimationFrame=fn=>{callback=fn;};
  const circuit=JSON.parse(await readFile(new URL('../dist/data/taste-circuit.json',import.meta.url),'utf8'));
  const learning=JSON.parse(await readFile(new URL('../dist/data/learning-circuit.json',import.meta.url),'utf8'));
  globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('learning-circuit')?learning:circuit});
  await import('../dist/app.js');
  await new Promise(resolve=>setImmediate(resolve));
  let now=1000;callback(now);const x0=parseFloat(element('fly-sprite').style.left);
  for(let i=0;i<120;i++){now+=1000/60;callback(now);}
  assert.ok(Math.abs(parseFloat(element('fly-sprite').style.left)-x0)>4,'visible sprite must move, not just clock');
  assert.equal(element('clock').textContent,'00:01');
  element('feed').listeners.click();
  assert.match(element('state-label').textContent,/сахару/);
  for(let i=0;i<300;i++){now+=1000/60;callback(now);}
  assert.ok(element('events').children.some(li=>li.children.includes('Сахар съеден · удовольствие +32')));
  element('pause').listeners.click();const frozen=element('fly-sprite').style.left;
  for(let i=0;i<60;i++){now+=1000/60;callback(now);}
  assert.equal(element('fly-sprite').style.left,frozen);
  element('pause').listeners.click();callback(now-5);callback(now);
  assert.ok(Number.isFinite(parseFloat(element('fly-sprite').style.left)));
  element('reset').listeners.click();callback(now);
  element('arena').listeners.pointerdown({clientX:430,clientY:315});
  now+=100;callback(now);
  element('shock').listeners.click();
  for(let i=0;i<180;i++){now+=1000/60;callback(now);}
  assert.ok(Number.parseInt(element('memory-value').textContent)>35);
  assert.ok(Number(element('changed-synapses').textContent)>0);
  element('clear-memory').listeners.click();
  assert.equal(element('memory-value').textContent,'0%');
  for(let i=0;i<600;i++){now+=1000/60;callback(now);}
  assert.ok(element('events').children.some(li=>li.children.includes('Сахар съеден · удовольствие +32')));
  element('reset').listeners.click();callback(now);
  element('freeze-plasticity').listeners.change({target:{checked:true}});
  element('arena').listeners.pointerdown({clientX:430,clientY:315});
  now+=100;callback(now);element('shock').listeners.click();
  for(let i=0;i<120;i++){now+=1000/60;callback(now);}
  assert.equal(element('memory-value').textContent,'0%');
  assert.equal(element('changed-synapses').textContent,0);
  element('place-pair').listeners.click();
  assert.equal(element('feed').disabled,true);assert.equal(element('test-choice').disabled,false);
  element('test-choice').listeners.click();
  assert.equal(element('shock').disabled,true);
  assert.match(element('choice-phase').textContent,/Проверка/);
  assert.match(element('choice-summary').textContent,/нет посещений/);
  for(let i=0;i<600;i++){now+=1000/60;callback(now);}
  assert.ok(Number(element('visits-test-0-value').textContent)+Number(element('visits-test-1-value').textContent)>0);
  element('reset').listeners.click();
  assert.equal(element('choice-phase').textContent,'Свободный режим');
  assert.equal(element('visits-test-0-value').textContent,0);
  element('start-spider').listeners.click();
  assert.equal(element('shock').disabled,true);assert.equal(element('feed').disabled,true);
  assert.match(element('spider-stats').textContent,/С обучением/);
  for(let i=0;i<120;i++){now+=100;callback(now);}
  assert.ok(Number.parseInt(element('web-memory-value').textContent)>35);
  element('start-spider-control').listeners.click();
  assert.match(element('spider-previous').textContent,/С обучением/);
  assert.equal(element('web-memory-value').textContent,'0%');
  assert.equal(element('freeze-plasticity').disabled,true);
  element('move-web').listeners.click();
  element('reset').listeners.click();assert.equal(element('shock').disabled,false);
});
