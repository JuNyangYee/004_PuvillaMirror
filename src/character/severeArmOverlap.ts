import {Quaternion,Vector3} from 'three';
import {directArmClearance,resolveDirectArmContact} from './directArmContact';

// This is an INNER boundary of the inflated torso proxy, not the skin surface.
// At .75 a paw may still overlap the body. Source rest/socket overlap is valid.
export const SEVERE_ARM_BOUNDARY=.75;

/** Last-resort guard for buried limbs, after the original mapping and smoothing.
 * Mild overlap returns without touching either quaternion. Never project all the
 * way to the outer body surface, which changed the natural hanging-arm shape. */
export function preventSevereArmOverlap(shoulder:Vector3,length:number,restUpper:Vector3,restFore:Vector3,upperQ:Quaternion,foreQ:Quaternion,chest:Quaternion,spread:number){
 const beforeU=upperQ.clone(),beforeF=foreQ.clone();
 const upper=restUpper.clone().applyQuaternion(upperQ),fore=restFore.clone().applyQuaternion(foreQ).applyQuaternion(upperQ);
 if(directArmClearance(shoulder,length,upper,fore,chest,spread).minimum>=SEVERE_ARM_BOUNDARY)return false;
 resolveDirectArmContact(shoulder,length,restUpper,restFore,upperQ,foreQ,chest,spread,SEVERE_ARM_BOUNDARY);
 // Local gradient steps may overshoot. Trim the correction at the first safe
 // point so barely crossing the inner boundary cannot add a full angular step.
 const resultU=restUpper.clone().applyQuaternion(upperQ),resultF=restFore.clone().applyQuaternion(foreQ).applyQuaternion(upperQ);
 const ru=new Quaternion().setFromUnitVectors(upper,resultU),rf=new Quaternion().setFromUnitVectors(fore,resultF);
 const u=new Vector3(),f=new Vector3(),q=new Quaternion();
 const at=(t:number)=>{
  u.copy(upper).applyQuaternion(q.identity().slerp(ru,t));
  f.copy(fore).applyQuaternion(q.identity().slerp(rf,t));
  return directArmClearance(shoulder,length,u,f,chest,spread).minimum;
 };
 if(at(1)<SEVERE_ARM_BOUNDARY-1e-5)return upperQ.angleTo(beforeU)+foreQ.angleTo(beforeF)>1e-8;
 let lo=0,hi=1;
 for(let i=1;i<=16;i++)if(at(i/16)>=SEVERE_ARM_BOUNDARY-1e-5){lo=(i-1)/16;hi=i/16;break;}
 for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(at(mid)>=SEVERE_ARM_BOUNDARY-1e-5)hi=mid;else lo=mid;}
 at(hi);
 upperQ.setFromUnitVectors(restUpper,u);
 foreQ.setFromUnitVectors(restFore,f.applyQuaternion(upperQ.clone().invert()));
 return true;
}
