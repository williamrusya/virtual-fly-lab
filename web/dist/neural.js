// Shiu-parameter LIF dynamics on an explicitly reduced, real-connectivity graph.
// Anatomy is measured; cell dynamics, input encoding and behavioral decoding are assumptions.
export class TasteCircuit {
  constructor(data, seed=1) {
    this.data=data;this.p=data.parameters;this.n=data.neurons.length;
    this.v=new Float64Array(this.n);this.g=new Float64Array(this.n);
    this.refractoryUntil=new Int32Array(this.n);this.counts=new Uint32Array(this.n);
    this.activity=new Float64Array(this.n);this.inputSet=new Set(data.inputs);
    this.outgoing=Array.from({length:this.n},()=>[]);
    for(const [pre,post,,signed] of data.edges)this.outgoing[pre].push([post,signed*this.p.mv_per_synapse]);
    this.delaySteps=Math.round(this.p.delay_ms/this.p.dt_ms);this.slots=this.delaySteps+1;
    this.queue=new Float64Array(this.slots*this.n);
    this.em=Math.exp(-this.p.dt_ms/this.p.membrane_ms);
    this.es=Math.exp(-this.p.dt_ms/this.p.synapse_ms);
    this.coupling=this.p.synapse_ms/(this.p.membrane_ms-this.p.synapse_ms)*(this.em-this.es);
    this.reset(seed);
  }
  reset(seed=1){
    this.v.fill(this.p.rest_mv);this.g.fill(0);this.queue.fill(0);this.counts.fill(0);
    this.activity.fill(0);this.refractoryUntil.fill(0);this.tick=0;this.pendingMs=0;
    this.rng=seed>>>0||1;this.totalSpikes=0;this.outputSpikes=0;this.silenced=false;
  }
  random(){let x=this.rng;x^=x<<13;x^=x>>>17;x^=x<<5;this.rng=x>>>0;return this.rng/4294967296;}
  advance(seconds,contact=false){
    if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid neural time');
    this.pendingMs+=seconds*1000;let output=0;
    while(this.pendingMs+1e-9>=this.p.dt_ms){
      this.pendingMs-=this.p.dt_ms;
      const spiked=[];
      for(let i=0;i<this.n;i++){
        this.activity[i]*=.999;
        if(this.silenced&&i===this.data.output){this.v[i]=this.p.rest_mv;this.g[i]=0;continue;}
        if(this.tick>=this.refractoryUntil[i]){
          this.v[i]=this.p.rest_mv+(this.v[i]-this.p.rest_mv)*this.em+this.g[i]*this.coupling;
          this.g[i]*=this.es;
          if(this.v[i]>this.p.threshold_mv)spiked.push(i);
        }
      }
      const slot=(this.tick%this.slots)*this.n;
      for(let i=0;i<this.n;i++){this.g[i]+=this.queue[slot+i];this.queue[slot+i]=0;}
      if(contact)for(const i of this.data.inputs){
        if(this.random()<this.p.input_hz*this.p.dt_ms/1000)this.v[i]+=this.p.input_mv;
      }
      for(const i of spiked){
        this.v[i]=this.p.reset_mv;this.g[i]=0;
        this.refractoryUntil[i]=this.tick+(this.inputSet.has(i)?0:Math.round(this.p.refractory_ms/this.p.dt_ms));
        this.counts[i]++;this.activity[i]+=1;this.totalSpikes++;
        if(i===this.data.output){output++;this.outputSpikes++;}
        const future=((this.tick+this.delaySteps)%this.slots)*this.n;
        for(const [post,weight] of this.outgoing[i])this.queue[future+post]+=weight;
      }
      this.tick++;
    }
    return output;
  }
  snapshot(){
    return {neurons:this.n,connections:this.data.edges.length,totalSpikes:this.totalSpikes,
      mn9Spikes:this.outputSpikes,mn9Voltage:this.v[this.data.output],
      sugarSpikes:this.data.inputs.reduce((sum,i)=>sum+this.counts[i],0),
      activeNeurons:this.activity.reduce((sum,v)=>sum+(v>.1?1:0),0),
      silenced:this.silenced};
  }
}
