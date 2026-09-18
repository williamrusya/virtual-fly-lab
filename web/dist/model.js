// Movement, health and reward are fictional. Optional brain gates sugar consumption.
export const WIDTH = 900, HEIGHT = 620;
export function createState(brain=null) {
  return {time:0,pleasure:18,stress:0,health:100,alive:true,paused:false,
    x:430,y:315,angle:-0.35,foods:[],shockUntil:0,cooldown:0,eatingUntil:0,
    eaten:0,shocks:0,events:[{time:0,text:'Новая муха исследует арену',kind:'start'}],nextId:1,
    brain,contactId:null,contactSeconds:0,contactSpikes:0,tasting:false};
}
const clamp=(v,min=0,max=100)=>Math.min(max,Math.max(min,v));
function event(s,text,kind){s.events.unshift({time:s.time,text,kind});s.events=s.events.slice(0,20);}
export function addFood(s,x,y){
  if(!s.alive||s.paused)return false;
  if(s.foods.length>=5)return false;
  s.foods.push({id:s.nextId++,x:clamp(x,90,810),y:clamp(y,90,530)});
  event(s,'Сахар добавлен · муха направляется к нему','food');return true;
}
export function shock(s,power){
  if(![1,2,3].includes(power))throw new Error('Сила импульса должна быть от 1 до 3');
  if(!s.alive||s.paused||s.cooldown>0)return false;
  s.stress=clamp(s.stress+power*22);s.pleasure=clamp(s.pleasure-power*12);
  s.health=clamp(s.health-power*11);s.shocks++;s.shockUntil=s.time+1.1;
  s.cooldown=.7;s.eatingUntil=0;s.angle+=Math.PI*.65;
  event(s,`Импульс ${['','слабый','средний','сильный'][power]} · стресс +${power*22}`, 'shock');
  checkDeath(s);return true;
}
function checkDeath(s){if(s.alive&&s.health<=0){s.alive=false;s.health=0;event(s,'Муха погибла · опыт завершён','death');}}
export function advance(s,dt){
  if(!Number.isFinite(dt)||dt<0)throw new Error('Invalid time step');
  if(!s.alive||s.paused)return;
  // Small integration steps keep motion and health independent of frame rate.
  for(let remaining=dt;remaining>1e-8&&s.alive;){
    const h=Math.min(remaining,.02);remaining-=h;s.time+=h;
    s.cooldown=Math.max(0,s.cooldown-h);
    s.pleasure=clamp(s.pleasure-.75*h);
    s.stress=clamp(s.stress-1.8*h);
    if(s.stress>70)s.health=clamp(s.health-(s.stress-70)*.2*h);
    checkDeath(s);if(!s.alive)break;
    const fleeing=s.time<s.shockUntil;
    let target=null;
    if(!fleeing&&s.foods.length){target=s.foods.reduce((best,f)=>
      Math.hypot(f.x-s.x,f.y-s.y)<Math.hypot(best.x-s.x,best.y-s.y)?f:best);}
    const contact=Boolean(target&&Math.hypot(target.x-s.x,target.y-s.y)<23);
    if(!contact||s.contactId!==target.id){s.contactId=contact?target.id:null;s.contactSpikes=0;s.contactSeconds=0;}
    const spikes=s.brain?s.brain.advance(h,contact):0;
    s.tasting=contact;
    if(contact){s.contactSeconds+=h;s.contactSpikes+=spikes;}
    // Explicit behavioral readout assumption, NOT an experimentally fitted law:
    // require 3 MN9 spikes and 300 ms contact before consuming the sugar portion.
    const neuralReady=!s.brain||(s.contactSpikes>=3&&s.contactSeconds>=.3);
    if(contact&&neuralReady){
      s.foods=s.foods.filter(f=>f.id!==target.id);s.pleasure=clamp(s.pleasure+32);
      s.stress=clamp(s.stress-14);s.health=clamp(s.health+4);s.eatingUntil=s.time+1;
      s.eaten++;event(s,'Сахар съеден · удовольствие +32','food');target=null;s.tasting=false;
    }
    if(s.time<s.eatingUntil||s.tasting)continue;
    let desired=s.angle+Math.sin(s.time*.65)*.025;
    if(target)desired=Math.atan2(target.y-s.y,target.x-s.x);
    // An active food target takes priority over exploratory boundary steering.
    if(!target&&(s.x<100||s.x>800||s.y<100||s.y>520))desired=Math.atan2(310-s.y,450-s.x);
    const difference=Math.atan2(Math.sin(desired-s.angle),Math.cos(desired-s.angle));
    s.angle+=clamp(difference,-h*4.5,h*4.5);
    const speed=(fleeing?150:target?100:55)*(0.5+s.health/200);
    s.x=clamp(s.x+Math.cos(s.angle)*speed*h,65,835);
    s.y=clamp(s.y+Math.sin(s.angle)*speed*h,65,555);
  }
}
export function status(s){
  if(!s.alive)return 'Погибла';if(s.paused)return 'Пауза';
  if(s.time<s.shockUntil)return 'Реакция на импульс';
  if(s.time<s.eatingUntil)return 'Ест сахар';
  if(s.tasting)return s.brain?.silenced?'MN9 отключён · поедание заблокировано':'Пробует сахар · работает нейронная цепь';
  if(s.stress>70)return 'Сильный стресс';if(s.foods.length)return 'Идёт к сахару';
  return 'Исследует арену';
}
