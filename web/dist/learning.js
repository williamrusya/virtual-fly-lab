// Connectome-constrained rate model, not recorded activity or a full MB simulation.
// Anatomy stays immutable. Memory lives in one efficacy per real KC->MBON edge.
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
function hash(id){let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export class MushroomBody {
  constructor(data){
    this.data=data;this.p=data.parameters;this.n=data.neurons.length;
    this.kcs=[];this.dans=[];this.mbons=[];
    data.neurons.forEach((n,i)=>({KC:this.kcs,DAN:this.dans,MBON:this.mbons}[n.role]).push(i));
    this.cues=[new Set(),new Set(),new Set()];
    const ordered=[...this.kcs].sort((a,b)=>hash(data.neurons[a].id)-hash(data.neurons[b].id));
    const size=Math.max(1,Math.floor(ordered.length*.1));
    for(let cue=0;cue<3;cue++)for(const i of ordered.slice(cue*size,(cue+1)*size))this.cues[cue].add(i);
    this.edges=data.edges.filter(([a,b])=>data.neurons[a].role==='KC'&&data.neurons[b].role==='MBON');
    this.modulators=this.edges.map(([,b])=>this.dans.filter(d=>
      data.neurons[d].compartment===data.neurons[b].compartment&&
      data.edges.some(([a,c])=>a===d&&c===b)));
    if(this.modulators.some(ds=>!ds.length))throw new Error('No matching anatomical DAN projection');
    this.normalizer=new Float64Array(this.n);
    for(const [a,b,count] of this.edges)if(this.cues[0].has(a))this.normalizer[b]+=count;
    if(this.mbons.some(b=>!this.normalizer[b]))throw new Error('Cue has no MBON drive');
    this.rates=new Float64Array(this.n);this.reference=new Float64Array(this.n);
    this.trace=new Float64Array(this.n);this.weights=new Float64Array(this.edges.length).fill(1);
    this.pending=0;this.pulseRemaining=0;this.pulsePower=0;
    this.plasticityEnabled=true;this.danSilenced=false;this.avoidance=0;
    this.stepCount=0;
  }
  reinforce(power=1){
    if(![1,2,3].includes(power))throw new Error('Invalid reinforcement');
    this.pulsePower=1+(power-1)*.5;this.pulseRemaining=this.p.reinforcement_duration_s;
  }
  clearMemory(){
    this.weights.fill(1);this.clearActivity();
  }
  clearActivity(){
    this.trace.fill(0);this.rates.fill(0);this.reference.fill(0);
    this.pulseRemaining=0;this.pulsePower=0;this.avoidance=0;this.pending=0;
  }
  advance(seconds,cue=null){
    if(!Number.isFinite(seconds)||seconds<0||![null,0,1,2].includes(cue))throw new Error('Invalid learning input');
    this.pending+=seconds;
    const p=this.p,dt=p.dt_s,kcDecay=Math.exp(-dt/p.kc_tau_s),danDecay=Math.exp(-dt/p.dan_tau_s),
      outputDecay=Math.exp(-dt/p.mbon_tau_s),traceDecay=Math.exp(-dt/p.eligibility_tau_s);
    while(this.pending+1e-12>=dt){
      this.pending-=dt;this.stepCount++;
      for(const i of this.kcs){
        const drive=cue!==null&&this.cues[cue].has(i)?1:0;
        this.rates[i]=drive+(this.rates[i]-drive)*kcDecay;
        this.trace[i]=Math.max(this.rates[i],this.trace[i]*traceDecay);
      }
      for(const i of this.dans){
        const drive=!this.danSilenced&&this.pulseRemaining>1e-12?this.pulsePower:0;
        this.rates[i]=this.danSilenced?0:drive+(this.rates[i]-drive)*danDecay;
      }
      this.pulseRemaining=Math.max(0,this.pulseRemaining-dt);
      const current=new Float64Array(this.n),baseline=new Float64Array(this.n);
      for(let e=0;e<this.edges.length;e++){
        const [a,b,count]=this.edges[e];
        const dopamine=mean(this.modulators[e].map(d=>this.rates[d]));
        if(this.plasticityEnabled)this.weights[e]=Math.max(p.minimum_efficacy,
          this.weights[e]*Math.exp(-p.learning_rate_per_s*this.trace[a]*dopamine*dt));
        const input=count*this.rates[a]/this.normalizer[b];
        current[b]+=input*this.weights[e];baseline[b]+=input;
      }
      for(const b of this.mbons){
        this.rates[b]=current[b]+(this.rates[b]-current[b])*outputDecay;
        this.reference[b]=baseline[b]+(this.reference[b]-baseline[b])*outputDecay;
      }
      const reference=mean(this.mbons.map(b=>this.reference[b]));
      const output=mean(this.mbons.map(b=>this.rates[b]));
      // Counterfactual baseline is a normalization instrument, not another fly neuron.
      this.avoidance=reference>.05?Math.max(0,Math.min(1,1-output/reference)):0;
    }
  }
  snapshot(){
    let changed=0;const loss=[0,0,0],total=[0,0,0];
    this.edges.forEach(([a,,n],e)=>{if(this.weights[e]<.999)changed++;
      for(let cue=0;cue<3;cue++)if(this.cues[cue].has(a)){loss[cue]+=n*(1-this.weights[e]);total[cue]+=n;}});
    return {neurons:this.n,plasticConnections:this.edges.length,changedConnections:changed,
      cueSynapticDepression:total[0]?loss[0]/total[0]:0,
      cueDepression:total.map((n,i)=>n?loss[i]/n:0),avoidance:this.avoidance,
      activeKCs:this.kcs.filter(i=>this.rates[i]>.1).length,
      eligibility:Math.max(...this.kcs.map(i=>this.trace[i])),
      dopamineActivity:mean(this.dans.map(i=>this.rates[i])),
      outputActivity:mean(this.mbons.map(i=>this.rates[i])),
      referenceActivity:mean(this.mbons.map(i=>this.reference[i])),
      plasticityEnabled:this.plasticityEnabled,danSilenced:this.danSilenced};
  }
}
