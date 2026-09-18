import {createState,addFood,shock,advance,status,avoidsSugar,canAssociate,clearMemory,WIDTH,HEIGHT} from './model.js?v=5';
import {TasteCircuit} from './neural.js?v=3';
import {MushroomBody} from './learning.js?v=5';
const $=id=>document.getElementById(id);
const canvas=$('arena'),ctx=canvas.getContext('2d');
const flyImage=new Image();flyImage.src='assets/fly-walk.png?v=2';
const sugarImage=new Image();sugarImage.src='assets/sugar.png';
let s=createState(),last=null,lastPaint=0,eventsSignature='',power=1,trail=[],neuralData=null,learningData=null,neuralError=false;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeText=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;

function draw(){
  ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.fillStyle='#dce3dd';ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.strokeStyle='#c8d2cb';ctx.lineWidth=.7;
  for(let x=0;x<WIDTH;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT);ctx.stroke();}
  for(let y=0;y<HEIGHT;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WIDTH,y);ctx.stroke();}
  ctx.strokeStyle='#b5c5ba';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(450,310,358,263,0,0,2*Math.PI);ctx.stroke();
  ctx.strokeStyle='#c8d3ca';ctx.beginPath();ctx.ellipse(450,310,344,249,0,0,2*Math.PI);ctx.stroke();
  for(let i=0;i<60;i++){const a=i*Math.PI/30;const r=i%5===0?1:.985;
    ctx.beginPath();ctx.moveTo(450+Math.cos(a)*358,310+Math.sin(a)*263);
    ctx.lineTo(450+Math.cos(a)*(r===1?348:353),310+Math.sin(a)*(r===1?253:258));ctx.stroke();}
  ctx.fillStyle='#819789';ctx.font='12px Manrope, sans-serif';ctx.textAlign='center';
  ctx.fillText('АРЕНА НАБЛЮДЕНИЯ',450,42);
  if(trail.length>1){
    ctx.strokeStyle='#64847360';ctx.lineWidth=2;ctx.beginPath();
    trail.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  }
  if(s.alive&&!avoidsSugar(s)&&s.foods.length&&s.time>=s.shockUntil){
    const target=s.foods.reduce((best,f)=>Math.hypot(f.x-s.x,f.y-s.y)<Math.hypot(best.x-s.x,best.y-s.y)?f:best);
    ctx.strokeStyle='#44806380';ctx.lineWidth=1.5;ctx.setLineDash([5,7]);
    ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(target.x,target.y);ctx.stroke();ctx.setLineDash([]);
  }
  s.foods.forEach(f=>{
    ctx.fillStyle='#ed9a4530';ctx.beginPath();ctx.arc(f.x,f.y,30,0,2*Math.PI);ctx.fill();
    ctx.strokeStyle='#cb793a80';ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(f.x,f.y,30,0,2*Math.PI);ctx.stroke();ctx.setLineDash([]);
    if(sugarImage.complete&&sugarImage.naturalWidth)ctx.drawImage(sugarImage,f.x-32,f.y-32,64,64);
    ctx.fillStyle='#425b50';ctx.font='bold 14px Manrope, sans-serif';ctx.fillText('САХАР',f.x,f.y+49);
  });
  if(s.time<s.shockUntil&&s.alive){
    ctx.strokeStyle='#d57940';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,58,0,2*Math.PI);ctx.stroke();
    ctx.fillStyle='#b36936';ctx.font='bold 23px sans-serif';ctx.fillText('ϟ',s.x+60,s.y-36);
  }
  if(s.time<s.eatingUntil&&s.alive){ctx.fillStyle='#438e65';ctx.font='bold 15px Manrope, sans-serif';ctx.fillText('+32 удовольствие',s.x,s.y-58);}
  // Position the sprite as a DOM layer, separate from the arena canvas.
  const sprite=$('fly-sprite');
  sprite.style.left=`${s.x/WIDTH*100}%`;sprite.style.top=`${s.y/HEIGHT*100}%`;
  sprite.style.transform=`translate(-50%, -50%) rotate(${s.angle+(s.alive?0:Math.PI/2)}rad)`;
  sprite.style.opacity=s.alive?'1':'.5';
  if(flyImage.complete&&flyImage.naturalWidth){
    const moving=neuralData&&s.alive&&!s.paused&&!s.tasting&&s.time>s.eatingUntil&&!reducedMotion;
    const frame=moving?Math.floor(s.time*24)%12:0;
    sprite.style.backgroundPosition=`${frame/11*100}% 0`;
    sprite.hidden=false;
  }
  if(!flyImage.complete||!flyImage.naturalWidth){ctx.fillStyle='#425953';ctx.fillText('Загрузка мухи…',450,310);}
}
function refresh(){
  $('clock').textContent=timeText(s.time);$('state-label').textContent=neuralData?status(s):neuralError?'Не удалось загрузить нейронные данные':'Загрузка нейронной цепи…';
  const memory=s.learning?.snapshot();
  $('memory').value=(memory?.cueSynapticDepression??0)*100;
  $('memory-value').textContent=`${Math.round((memory?.cueSynapticDepression??0)*100)}%`;
  $('memory-note').textContent='Ослабление связей активируемых сахаром KC → MBON; память хранится в весах';
  $('pairing-note').textContent=!s.alive?'Опыт завершён':s.paused?'Опыт на паузе':canAssociate(s)?'Активен след KC: импульс PPL1 может изменить синапсы':'Предложи сахар и подай слабый импульс при приближении или контакте';
  $('clear-memory').disabled=!neuralData||!s.alive||s.paused||!memory?.changedConnections;
  $('freeze-plasticity').disabled=!neuralData||!s.alive||s.paused;
  $('silence-dan').disabled=!neuralData||!s.alive||s.paused;
  $('kc-activity').textContent=memory?.activeKCs??0;
  $('dan-activity').textContent=(memory?.dopamineActivity??0).toFixed(2);
  $('mbon-activity').textContent=(memory?.outputActivity??0).toFixed(2);
  $('mbon-reference').textContent=(memory?.referenceActivity??0).toFixed(2);
  $('changed-synapses').textContent=memory?.changedConnections??0;
  document.querySelector('.chamber').classList.toggle('shocked',s.alive&&s.time<s.shockUntil);
  $('live-dot').style.background=!s.alive?'#f47c80':s.paused?'#94a5a7':s.stress>70?'#ffa46b':'#abecd4';
  for(const name of ['pleasure','stress','health']){
    $(name).value=s[name];$(name+'-value').innerHTML=`${Math.round(s[name])}<span>/100</span>`;
  }
  $('condition').textContent=!s.alive?'Погибла':s.health<30?'Критическое':s.stress>70?'Стресс':s.pleasure>55?'Довольна':'В норме';
  $('stress-note').textContent=!s.alive?'Опыт завершён':s.stress>70?'Сильный стресс снижает здоровье':s.stress>30?'Постепенно успокаивается':'Спокойное состояние';
  $('feed').disabled=!neuralData||!s.alive||s.paused||s.foods.length>=5;
  $('shock').disabled=!neuralData||!s.alive||s.paused||s.cooldown>0;
  $('intensity').disabled=!s.alive||s.paused;
  $('pause').disabled=!neuralData||!s.alive;$('pause').textContent=s.paused?'▶ Продолжить':'Ⅱ Пауза';
  $('pause').setAttribute('aria-pressed',String(s.paused));
  $('end-overlay').hidden=s.alive;
  $('arena-hint').textContent=!s.alive?'':s.paused?'Опыт на паузе':s.foods.length>=5?'На арене уже 5 порций сахара':'Нажми на арену, чтобы положить сахар';
  document.querySelector('.chamber').classList.toggle('paused',s.paused);
  $('silence-mn9').disabled=!neuralData||!s.alive;
  $('neural-state').textContent=neuralError?'Ошибка загрузки. Обнови страницу.':!neuralData?'Загрузка данных…':s.brain.silenced?'Выход MN9 отключён':s.tasting?'Сахар активирует входные нейроны':'Ожидает контакта с сахаром';
  if(s.brain){
    const stats=s.brain.snapshot();
    $('input-spikes').textContent=stats.sugarSpikes.toLocaleString('ru');
    $('active-neurons').textContent=stats.activeNeurons;
    $('output-spikes').textContent=stats.mn9Spikes.toLocaleString('ru');
    $('mn9-voltage').textContent=`${stats.mn9Voltage.toFixed(1)} мВ`;
  }
  const signature=JSON.stringify(s.events);
  if(signature!==eventsSignature){
    eventsSignature=signature;$('events').replaceChildren(...s.events.slice(0,6).map(e=>{
      const li=document.createElement('li');li.dataset.kind=e.kind;
      const time=document.createElement('time');time.textContent=timeText(e.time);
      li.append(time,document.createTextNode(e.text));return li;
    }));$('event-count').textContent=`${String(s.events.length).padStart(2,'0')} В ЖУРНАЛЕ`;
  }
}
function reset(){s=createState(neuralData?new TasteCircuit(neuralData):null,learningData?new MushroomBody(learningData):null);$('silence-mn9').checked=false;$('freeze-plasticity').checked=false;$('silence-dan').checked=false;last=null;trail=[];eventsSignature='';refresh();draw();}
function feed(x=s.x+Math.cos(s.angle)*190,y=s.y+Math.sin(s.angle)*190){if(!neuralData)return false;const ok=addFood(s,x,y);refresh();draw();return ok;}
function applyShock(){const ok=shock(s,power);refresh();draw();return ok;}
$('feed').addEventListener('click',()=>feed());
$('shock').addEventListener('click',applyShock);
$('intensity').addEventListener('input',e=>{
  power=Number(e.target.value);const label=['','Слабый','Средний','Сильный'][power];
  $('intensity-value').textContent=label;$('intensity').setAttribute('aria-valuetext',label);
});
$('pause').addEventListener('click',()=>{s.paused=!s.paused;last=null;refresh();draw();});
$('reset').addEventListener('click',reset);$('restart-overlay').addEventListener('click',reset);
$('clear-memory').addEventListener('click',()=>{clearMemory(s);refresh();draw();});
$('freeze-plasticity').addEventListener('change',e=>{if(s.learning)s.learning.plasticityEnabled=!e.target.checked;refresh();});
$('silence-dan').addEventListener('change',e=>{if(s.learning)s.learning.danSilenced=e.target.checked;refresh();});
$('silence-mn9').addEventListener('change',e=>{if(s.brain)s.brain.silenced=e.target.checked;refresh();});
canvas.addEventListener('pointerdown',e=>{
  const rect=canvas.getBoundingClientRect();feed((e.clientX-rect.left)/rect.width*WIDTH,(e.clientY-rect.top)/rect.height*HEIGHT);
});
document.addEventListener('visibilitychange',()=>{last=null;});
flyImage.addEventListener('error',()=>{$('state-label').textContent='Не удалось загрузить изображение. Обнови страницу.';});
function frame(now){
  const dt=last===null?0:Math.max(0,Math.min((now-last)/1000,.1));last=now;
  if(!document.hidden&&neuralData)advance(s,dt);
  const previous=trail.at(-1);
  if(!previous||Math.hypot(s.x-previous.x,s.y-previous.y)>4){trail.push({x:s.x,y:s.y});if(trail.length>100)trail.shift();}
  draw();if(now-lastPaint>100){refresh();lastPaint=now;}requestAnimationFrame(frame);
}
refresh();requestAnimationFrame(frame);
Promise.all(['data/taste-circuit.json?v=3','data/learning-circuit.json?v=5'].map(url=>fetch(url).then(response=>{
  if(!response.ok)throw new Error('Neural data unavailable');return response.json();
}))).then(([data,learning])=>{
  if(data.format!==1||data.neurons.length!==447||data.edges.length!==24403)throw new Error('Unexpected circuit data');
  if(learning.format!==1||learning.neurons.length!==910||learning.edges.length!==3287)throw new Error('Unexpected learning circuit');
  // Validate construction before enabling the application.
  new MushroomBody(learning);learningData=learning;neuralData=data;reset();
}).catch(()=>{neuralError=true;refresh();});

// Optional WebMCP shares exactly the actions and state of the visible controls.
const context=document.modelContext;
if(context?.registerTool){
  const lifecycle=new AbortController();
  const snapshot=()=>({alive:s.alive,paused:s.paused,pleasure:s.pleasure,stress:s.stress,health:s.health,foodPortions:s.foods.length,learning:s.learning?.snapshot()??null,avoidsSugar:avoidsSugar(s),status:status(s),neural:s.brain?.snapshot()??null});
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_fly_state',description:'Read the current fictional fly state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>snapshot()});
  register({name:'apply_fly_action',description:'Add food, apply a fictional shock, pause, resume, or reset the experiment.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['food','shock','pause','resume','reset']},power:{type:'integer',minimum:1,maximum:3}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{
    if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['action','power'].includes(k)))throw new Error('Invalid input');
    const {action,power:level=1}=input;if(![1,2,3].includes(level))throw new Error('Invalid power');
    if(!['food','shock','pause','resume','reset'].includes(action))throw new Error('Invalid action');
    if(!neuralData)throw new Error('Neural circuit not loaded');
    if(action==='food'&&!feed())throw new Error('Cannot add food now');
    if(action==='shock'&&!shock(s,level))throw new Error('Cannot apply shock now');
    if(action==='reset')reset();
    if(action==='pause'||action==='resume'){if(!s.alive)throw new Error('Fly is dead');s.paused=action==='pause';}
    refresh();draw();return snapshot();
  }});
  addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
