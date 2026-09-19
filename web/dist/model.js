import {webCue,spiderStep,webSteering} from './spider.js?v=7';
// Movement, health and reward are fictional. Optional brain gates sugar consumption.
export const WIDTH = 900, HEIGHT = 620;
export function createState(brain=null,learning=null) {
  return {time:0,pleasure:18,stress:0,health:100,alive:true,paused:false,
    x:430,y:315,angle:-0.35,foods:[],shockUntil:0,cooldown:0,eatingUntil:0,
    eaten:0,shocks:0,events:[{time:0,text:'Новая муха исследует арену',kind:'start'}],nextId:1,
    brain,contactId:null,contactSeconds:0,contactSpikes:0,tasting:false,
    escapeAngle:0,learning,spider:null,activeCue:null,choiceMode:false,choicePhase:'training',
    visits:{training:[0,0],test:[0,0]},visitInside:null,choiceSwapped:false,targetId:null};
}
export function startChoice(s,test=false,swap=false){
  if(!s.alive||s.paused)return false;
  if(test&&!s.choiceMode)return false;
  s.spider=null;s.choiceMode=true;s.choicePhase=test?'test':'training';s.choiceSwapped=swap;
  if(!test)s.visits={training:[0,0],test:[0,0]};else s.visits.test=[0,0];
  s.foods=[0,1].map(cue=>({id:s.nextId++,cue,x:(cue===0)!==swap?220:680,y:310,feeder:true,readyAt:0}));
  s.x=450;s.y=310;s.angle=-Math.PI/2;s.shockUntil=0;s.cooldown=0;s.eatingUntil=0;
  s.contactId=null;s.contactSeconds=0;s.contactSpikes=0;s.tasting=false;s.activeCue=null;s.visitInside=null;s.targetId=null;
  s.learning?.clearActivity();
  event(s,test?'Проверка без тока · муха в центре, веса сохранены':'Две кормушки A/B · начало наблюдения и обучения','start');return true;
}
export const availableFoods=s=>s.foods.filter(f=>!f.feeder||s.time>=f.readyAt);
export const avoidsSugar=s=>s.activeCue!==2&&(s.learning?.avoidance??0)>=(s.learning?.p.avoidance_threshold??.35);
export const canAssociate=s=>(s.learning?.snapshot().eligibility??0)>.1;
export function clearMemory(s){
  if(!s.alive||s.paused||s.spider)return false;
  s.learning?.clearMemory();
  event(s,'Синаптические веса восстановлены · здоровье и стресс сохранены','memory');return true;
}
const clamp=(v,min=0,max=100)=>Math.min(max,Math.max(min,v));
function event(s,text,kind){s.events.unshift({time:s.time,text,kind});s.events=s.events.slice(0,20);}
export function addFood(s,x,y,cue=0){
  if(![0,1].includes(cue))throw new Error('Invalid cue');
  if(s.choiceMode||s.spider)return false;
  if(!s.alive||s.paused)return false;
  if(s.foods.length>=5)return false;
  s.foods.push({id:s.nextId++,cue,x:clamp(x,90,810),y:clamp(y,90,530)});
  event(s,avoidsSugar(s)?'Сахар добавлен · муха помнит опасность':'Сахар добавлен · муха направляется к нему','food');return true;
}
export function shock(s,power){
  if(![1,2,3].includes(power))throw new Error('Сила импульса должна быть от 1 до 3');
  if(!s.alive||s.paused||s.cooldown>0)return false;
  if(s.spider||(s.choiceMode&&s.choicePhase==='test'))return false;
  s.learning?.reinforce(power);
  s.stress=clamp(s.stress+power*22);s.pleasure=clamp(s.pleasure-power*12);
  s.health=clamp(s.health-power*11);s.shocks++;s.shockUntil=s.time+1.1;
  s.cooldown=.7;s.eatingUntil=0;
  const nearby=s.foods.reduce((best,f)=>!best||Math.hypot(f.x-s.x,f.y-s.y)<Math.hypot(best.x-s.x,best.y-s.y)?f:best,null);
  const away=nearby&&Math.hypot(nearby.x-s.x,nearby.y-s.y)>1
    ?Math.atan2(s.y-nearby.y,s.x-nearby.x):s.angle+Math.PI;
  // Escape toward free arena space when a turn away from food would hit a wall.
  const endX=s.x+Math.cos(away)*100,endY=s.y+Math.sin(away)*100;
  s.escapeAngle=endX<75||endX>825||endY<75||endY>545?Math.atan2(310-s.y,450-s.x):away;
  s.angle=s.escapeAngle;s.tasting=false;s.contactId=null;s.contactSeconds=0;s.contactSpikes=0;
  event(s,`Импульс ${['','слабый','средний','сильный'][power]} · стресс +${power*22}`, 'shock');
  if(s.learning)event(s,'Сигнал подкрепления PPL1 · изменение весов зависит от активности KC','memory');
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
    const nearest=availableFoods(s).reduce((best,f)=>!best||Math.hypot(f.x-s.x,f.y-s.y)<Math.hypot(best.x-s.x,best.y-s.y)?f:best,null);
    // Explicit surrogate sensory encoding: nearby sugar presents a fixed KC cue.
    // This is not a reconstructed taste/vision-to-KC pathway.
    s.activeCue=webCue(s)??(nearest&&Math.hypot(nearest.x-s.x,nearest.y-s.y)<180?(nearest.cue??0):null);
    if(s.learning){
      const enabled=s.learning.plasticityEnabled;
      if(s.choiceMode&&s.choicePhase==='test')s.learning.plasticityEnabled=false;
      s.learning.advance(h,s.activeCue);s.learning.plasticityEnabled=enabled;
    }
    if(spiderStep(s,h,event)){s.brain?.advance(h,false);s.contactId=null;s.contactSeconds=0;s.contactSpikes=0;continue;}
    if(s.choiceMode){
      const inside=s.foods.find(f=>f.id===s.visitInside);
      if(inside&&Math.hypot(inside.x-s.x,inside.y-s.y)>65)s.visitInside=null;
      if(!s.visitInside&&nearest&&Math.hypot(nearest.x-s.x,nearest.y-s.y)<40){
        s.visitInside=nearest.id;s.visits[s.choicePhase][nearest.cue]++;
        event(s,`Посещение ${nearest.cue===0?'A':'B'} · ${s.choicePhase==='test'?'проверка без тока':'обучение'}`,'visit');
      }
    }
    const avoiding=avoidsSugar(s);
    let target=!fleeing&&!avoiding?nearest:null;
    if(s.choiceMode&&!fleeing){
      const available=availableFoods(s);
      target=available.find(f=>f.id===s.targetId)??nearest;
      if(avoiding&&target&&target.cue===(nearest?.cue??s.activeCue)){
        target=available.find(f=>f.cue!==target.cue)??null;
      }
      s.targetId=target?.id??null;
    }
    const contact=Boolean(!fleeing&&nearest&&Math.hypot(nearest.x-s.x,nearest.y-s.y)<23);
    if(!contact||s.contactId!==nearest.id){s.contactId=contact?nearest.id:null;s.contactSpikes=0;s.contactSeconds=0;}
    const spikes=s.brain?s.brain.advance(h,contact):0;
    s.tasting=contact&&!avoiding&&target?.id===nearest?.id;
    if(contact){s.contactSeconds+=h;s.contactSpikes+=spikes;}
    // Explicit behavioral readout assumption, NOT an experimentally fitted law:
    // require 3 MN9 spikes and 300 ms contact before consuming the sugar portion.
    const neuralReady=!s.brain||(s.contactSpikes>=3&&s.contactSeconds>=.3);
    if(contact&&neuralReady&&!avoiding&&target?.id===nearest.id){
      if(target.feeder)target.readyAt=s.time+8;
      else s.foods=s.foods.filter(f=>f.id!==target.id);
      s.pleasure=clamp(s.pleasure+32);
      s.stress=clamp(s.stress-14);s.health=clamp(s.health+4);s.eatingUntil=s.time+1;
      s.eaten++;event(s,'Сахар съеден · удовольствие +32','food');target=null;s.tasting=false;
    }
    if(s.time<s.eatingUntil||s.tasting)continue;
    let desired=fleeing?s.escapeAngle:s.angle+Math.sin(s.time*.65)*.025;
    if(target)desired=Math.atan2(target.y-s.y,target.x-s.x);
    // An active food target takes priority over exploratory boundary steering.
    if(!target&&(s.x<100||s.x>800||s.y<100||s.y>520))desired=Math.atan2(310-s.y,450-s.x);
    if(!fleeing&&!target&&avoiding&&nearest&&Math.hypot(nearest.x-s.x,nearest.y-s.y)<180){
      const distance=Math.hypot(nearest.x-s.x,nearest.y-s.y);
      desired=distance>1?Math.atan2(s.y-nearest.y,s.x-nearest.x):s.angle;
      // Slide along a wall instead of indefinitely pushing against its clamp.
      let dx=Math.cos(desired),dy=Math.sin(desired);
      if((s.x<90&&dx<0)||(s.x>810&&dx>0)){dx=0;if(Math.abs(dy)<.1)dy=s.y<310?1:-1;}
      if((s.y<90&&dy<0)||(s.y>530&&dy>0)){dy=0;if(Math.abs(dx)<.1)dx=s.x<450?1:-1;}
      desired=Math.atan2(dy,dx);
    }
    if(!fleeing){const steering=webSteering(s,target);if(steering!==null)desired=steering;}
    const difference=Math.atan2(Math.sin(desired-s.angle),Math.cos(desired-s.angle));
    s.angle+=clamp(difference,-h*4.5,h*4.5);
    const speed=(fleeing?150:target?100:55)*(0.5+s.health/200);
    s.x=clamp(s.x+Math.cos(s.angle)*speed*h,65,835);
    s.y=clamp(s.y+Math.sin(s.angle)*speed*h,65,555);
  }
}
export function status(s){
  if(!s.alive)return s.spider&&s.health===0?'Опыт завершён · муха погибла':'Погибла';if(s.paused)return 'Пауза';
  if(s.spider?.trapped)return 'В паутине · пытается вырваться';
  if(s.activeCue===2&&s.learning?.avoidance>=.35)return 'Обходит паутину · память об опасности';
  if(s.time<s.shockUntil)return 'Реакция на импульс';
  if(avoidsSugar(s)&&s.foods.length)return 'Избегает сахара · помнит удар';
  if(s.time<s.eatingUntil)return 'Ест сахар';
  if(s.tasting)return s.brain?.silenced?'MN9 отключён · поедание заблокировано':'Пробует сахар · работает нейронная цепь';
  if(s.stress>70)return 'Сильный стресс';if(s.foods.length)return 'Идёт к сахару';
  return 'Исследует арену';
}
