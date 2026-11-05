import {Quaternion,Vector3} from 'three';
import {RoundedElbowFrame} from './standingBend';
import {directArmPose} from './directArmPose';

// Torso proxy in the source mesh's spine frame (cm). Separate from the old
// inflated-paw ellipsoid: each sample includes its own upper/fore/paw radius.
// The blended shoulder socket is deliberately excluded from self-collision.
const center=new Vector3(0,69,.5),pivot=new Vector3(0,88,0);
const samples=[.3,.4,.5,.6,.7,.8,.9,1,1.1];
const target=1.015;
export function directArmClearance(shoulder:Vector3,length:number,upper:Vector3,fore:Vector3,chest:Quaternion,spread:number){
 const frame=new RoundedElbowFrame(length,upper,fore,spread),p=new Vector3();
 let minimum=Infinity,penalty=0;
 for(const t of samples){
  const thickness=t<.5?4+(t-.3)*15:t<.8?7+(t-.5)*10:10;
  frame.center(t*length,p).add(shoulder).sub(pivot).applyQuaternion(chest).add(pivot).sub(center);
  const rho=Math.hypot(p.x/(38+thickness),p.y/(58+thickness),p.z/(38+thickness));
  minimum=Math.min(minimum,rho);penalty+=Math.max(0,target-rho)**2;
 }
 return {minimum,penalty};
}

/** Project only colliding poses. Free directions are bit-for-bit untouched.
 * Both upper arm and forearm can move; there is no lift-preservation constraint.
 * Run after temporal interpolation, so the displayed pose is what gets tested. */
export function resolveDirectArmContact(shoulder:Vector3,length:number,restUpper:Vector3,restFore:Vector3,upperQ:Quaternion,foreQ:Quaternion,chest:Quaternion,spread:number){
 const desiredU=restUpper.clone().applyQuaternion(upperQ),desiredF=restFore.clone().applyQuaternion(foreQ).applyQuaternion(upperQ);
 const measure=(u:Vector3,f:Vector3)=>directArmClearance(shoulder,length,u,f,chest,spread);
 let u=desiredU.clone(),f=desiredF.clone(),score=measure(u,f);
 if(score.minimum>=target)return 0;
 const initial=score.minimum,eps=.002,axis=new Vector3(),basis:Vector3[]=[];
 // Numerical tangent gradient uses the same rounded curve as the displayed
 // cage. Bounded work; no geometry traversal, inference or physics engine.
 for(let iteration=0;iteration<24 && score.minimum<target-1e-5;iteration++){
  basis.length=0;
  for(const d of [u,f]){
   axis.set(Math.abs(d.y)<.9?0:1,Math.abs(d.y)<.9?1:0,0);
   const a=new Vector3().crossVectors(d,axis).normalize();
   basis.push(a,new Vector3().crossVectors(d,a).normalize());
  }
  const gradient=basis.map((b,i)=>{
   const cu=u.clone(),cf=f.clone();(i<2?cu:cf).addScaledVector(b,eps).normalize();
   return (measure(cu,cf).penalty-score.penalty)/eps;
  });
  const norm=Math.hypot(...gradient);if(norm<1e-9)break;
  let accepted=false;
  for(const step of [.16,.08,.04,.02,.01]){
   const cu=u.clone(),cf=f.clone();
   basis.forEach((b,i)=>(i<2?cu:cf).addScaledVector(b,-step*gradient[i]/norm));
   cu.normalize();cf.normalize();const next=measure(cu,cf);
   if(next.penalty<score.penalty){u=cu;f=cf;score=next;accepted=true;break;}
  }
  if(!accepted)break;
 }
 if(score.minimum<target-1e-5){
  // Escape a folded arm's local minimum through the closest feasible path.
  // Search symmetric outward/front/back/up exits, rather than always forcing
  // arms in front. Only used when the local projection could not clear them.
  let bestCost=Infinity,bestU=u,bestF=f;
  const inv=chest.clone().invert(),side=Math.sign(shoulder.x);
  const exits=[[side,0,0],[side,.7,0],[side,-.5,.5],[side,0,1],[side,0,-1],[side,1,1]];
  for(const xyz of exits){
   const exit=new Vector3(...xyz).normalize().applyQuaternion(inv);
   const ru=new Quaternion().setFromUnitVectors(desiredU,exit),rf=new Quaternion().setFromUnitVectors(desiredF,exit);
   const qu=new Quaternion(),qf=new Quaternion(),cu=new Vector3(),cf=new Vector3();
   const at=(t:number)=>{cu.copy(desiredU).applyQuaternion(qu.identity().slerp(ru,t));cf.copy(desiredF).applyQuaternion(qf.identity().slerp(rf,t));return measure(cu,cf).minimum;};
   for(let i=1;i<=16;i++){
    if(at(i/16)<target)continue;
    let lo=(i-1)/16,hi=i/16;
    for(let k=0;k<10;k++){const mid=(lo+hi)/2;if(at(mid)>=target)hi=mid;else lo=mid;}
    at(hi);const cost=desiredU.angleTo(cu)**2+desiredF.angleTo(cf)**2;
    if(cost<bestCost){bestCost=cost;bestU=cu.clone();bestF=cf.clone();}
    break;
   }
  }
  u=bestU;f=bestF;score=measure(u,f);
 }
 if(score.minimum>initial)directArmPose(restUpper,restFore,u,f,upperQ,foreQ);
 return Math.max(0,score.minimum-initial);
}
