// Fictional predator mechanics. Cue 2 is synthetic, not reconstructed vision.
export function startSpider(s,enabled=true){
  if(!s.alive||s.paused||!s.learning)return false;
  s.choiceMode=false;s.learning.clearMemory();s.learning.plasticityEnabled=enabled;s.learning.danSilenced=false;
  s.x=200;s.y=310;s.angle=0;s.time=0;s.health=100;s.stress=0;s.pleasure=18;s.eaten=0;
  s.shockUntil=0;s.eatingUntil=0;s.cooldown=0;s.contactId=null;s.contactSeconds=0;s.contactSpikes=0;s.tasting=false;
  s.activeCue=null;s.events=[{time:0,text:enabled?'Паук и паутина · новый опыт с обучением':'Паук и паутина · новый опыт без обучения',kind:'start'}];
  s.foods=[{id:s.nextId++,cue:0,x:700,y:310,feeder:true,readyAt:0}];
  s.spider={x:510,y:310,webX:450,webY:310,radius:55,trapped:false,caughtAt:0,immuneUntil:0,catches:0,escapes:0,enabled,moved:false};
  return true;
}
export function moveWeb(s){
  const p=s.spider;if(!p||p.trapped||!s.alive||s.paused)return false;
  p.moved=!p.moved;p.webY=p.moved?440:310;p.x=p.webX+60;p.y=p.webY;return true;
}
export function webCue(s){const p=s.spider;return p&&Math.hypot(s.x-p.webX,s.y-p.webY)<p.radius+100?2:null;}
export function spiderStep(s,h,log){
  const p=s.spider;if(!p)return false;
  p.radius=Math.min(95,p.radius+h*3);
  let distance=Math.hypot(s.x-p.webX,s.y-p.webY);
  if(!p.trapped&&s.time>=p.immuneUntil&&distance<p.radius){
    p.trapped=true;p.caughtAt=s.time;p.catches++;s.eatingUntil=0;s.tasting=false;
    s.learning?.reinforce(2);s.stress=Math.min(100,s.stress+18);
    log(s,'Муха попала в паутину · паук приближается','shock');
  }
  if(!p.trapped){
    const a=Math.atan2(p.webY-p.y,p.webX+60-p.x);
    if(Math.hypot(p.webX+60-p.x,p.webY-p.y)>2){p.x+=Math.cos(a)*25*h;p.y+=Math.sin(a)*25*h;}
    return false;
  }
  const a=Math.atan2(s.y-p.y,s.x-p.x);p.x+=Math.cos(a)*35*h;p.y+=Math.sin(a)*35*h;
  if(Math.hypot(s.x-p.x,s.y-p.y)<17){s.health=0;s.alive=false;s.tasting=false;log(s,'Паук съел муху · опыт завершён','death');return true;}
  // An innate escape reflex exists in both groups; repeated captures exhaust it.
  const away=Math.atan2(s.y-p.webY,s.x-p.webX);s.angle=away;
  if(s.time-p.caughtAt>.8){const speed=32/Math.max(1,p.catches);s.x+=Math.cos(away)*speed*h;s.y+=Math.sin(away)*speed*h;}
  distance=Math.hypot(s.x-p.webX,s.y-p.webY);
  if(distance>p.radius+5){p.trapped=false;p.escapes++;p.immuneUntil=s.time+1.5;
    s.escapeAngle=away;s.shockUntil=s.time+1;log(s,'Муха вырвалась из паутины','memory');}
  return true;
}
export function webSteering(s,target){
  const p=s.spider;if(!p||s.activeCue!==2||s.learning.avoidance<s.learning.p.avoidance_threshold)return null;
  const dx=s.x-p.webX,dy=s.y-p.webY,d=Math.hypot(dx,dy);
  if(d>p.radius+90)return null;
  // Chosen motor decoder: tangent plus outward pressure routes around a web.
  const side=target&&((target.x-s.x)*(-dy)+(target.y-s.y)*dx)<0?-1:1;
  const push=Math.max(0,(p.radius+65-d)/25);
  return Math.atan2(side*dx+push*dy,-side*dy+push*dx);
}
