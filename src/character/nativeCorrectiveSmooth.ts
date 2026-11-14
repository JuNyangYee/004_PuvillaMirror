import * as THREE from 'three';

export interface NativeSmoothSettings {factor:number;iterations:number;weights:number[]}

/** Rest-detail preserving, corner-frame delta mush for the exported Blender
 * LENGTH_WEIGHTED settings. Algorithm reference:
 * https://github.com/blender/blender/blob/main/source/blender/modifiers/intern/MOD_correctivesmooth.cc
 * Keep this before subdivision, as in the source modifier stack. */
export class NativeCorrectiveSmooth {
  private edges:number[][]=[];
  private degree:Float64Array;
  private corners:number[][]=[];
  private detail:number[][]=[];
  private work:Float64Array;
  private totals:Float64Array;
  private accum:Float64Array;
  constructor(rest:number[][],faces:number[][],private settings:NativeSmoothSettings){
    const n=rest.length;this.degree=new Float64Array(n);this.work=new Float64Array(n*3);this.totals=new Float64Array(n);this.accum=new Float64Array(n*3);
    const seen=new Set<string>();
    for(const f of faces)for(let k=0;k<f.length;k++){
      const a=f[k],b=f[(k+1)%f.length],key=[Math.min(a,b),Math.max(a,b)].join(':');
      if(!seen.has(key)){seen.add(key);this.edges.push([a,b]);this.degree[a]++;this.degree[b]++;}
      this.corners.push([f[(k+f.length-1)%f.length],a,b]);
    }
    const original=Float64Array.from(rest.flat()),smoothed=original.slice();this.smooth(smoothed);
    this.detail=this.corners.map(c=>{
      const frame=this.frame(smoothed,c),i=c[1]*3,d=new THREE.Vector3(original[i]-smoothed[i],original[i+1]-smoothed[i+1],original[i+2]-smoothed[i+2]);
      return frame.axes.map(axis=>axis.dot(d));
    });
  }
  private smooth(p:Float64Array){
    for(let pass=0;pass<this.settings.iterations;pass++){
      this.work.fill(0);this.totals.fill(0);
      for(const [a,b] of this.edges){
        const ia=a*3,ib=b*3,x=p[ib]-p[ia],y=p[ib+1]-p[ia+1],z=p[ib+2]-p[ia+2],length=Math.hypot(x,y,z);
        this.totals[a]+=length;this.totals[b]+=length;
        for(let k=0;k<3;k++){const d=(p[ib+k]-p[ia+k])*length;this.work[ia+k]+=d;this.work[ib+k]-=d;}
      }
      for(let i=0;i<this.degree.length;i++){
        const divisor=this.totals[i]*this.degree[i];if(divisor<1e-6)continue;
        const factor=2*this.settings.factor*this.settings.weights[i]/divisor;
        for(let k=0;k<3;k++)p[i*3+k]+=factor*this.work[i*3+k];
      }
    }
  }
  private frame(p:Float64Array,[prev,i,next]:number[]){
    const at=(j:number)=>new THREE.Vector3().fromArray(p,j*3),center=at(i);
    const a=at(prev).sub(center).normalize(),b=center.clone().sub(at(next)).normalize();
    const normal=new THREE.Vector3().crossVectors(a,b).normalize(),x=a.clone().add(b).normalize(),y=new THREE.Vector3().crossVectors(normal,x);
    const weight=normal.lengthSq()>.5?Math.acos(Math.max(-1,Math.min(1,a.dot(b)))):0;
    return {axes:[x,y,normal],weight};
  }
  apply(p:Float64Array){
    this.smooth(p);this.accum.fill(0);this.totals.fill(0);
    this.corners.forEach((c,j)=>{
      const {axes,weight}=this.frame(p,c),i=c[1],delta=new THREE.Vector3();
      axes.forEach((axis,k)=>delta.addScaledVector(axis,this.detail[j][k]));
      this.totals[i]+=weight;for(let k=0;k<3;k++)this.accum[i*3+k]+=delta.getComponent(k)*weight;
    });
    for(let i=0;i<this.totals.length;i++)if(this.totals[i]>1e-8)for(let k=0;k<3;k++)p[i*3+k]+=this.accum[i*3+k]/this.totals[i];
  }
}
