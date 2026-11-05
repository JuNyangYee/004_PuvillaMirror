import {Quaternion,Vector3} from 'three';
import {standingFollowDirection} from './standingArmPose';
import {StandingElbowPlane} from './standingElbowPlane';
import {directArmPose} from './directArmPose';

function blendDirection(stable:Vector3,observed:Vector3,amount:number){
 const rotation=new Quaternion().setFromUnitVectors(stable,observed);
 return stable.clone().applyQuaternion(new Quaternion().slerp(rotation,amount));
}

/** Blend DIRECTIONS before collision projection, not already-corrected poses:
 * mixing two collision-free poses can otherwise put the arm back in the body.
 * Palm and temporal stabilization stay in the existing pipeline. */
export function hybridArmPose(side:1|-1,restUpper:Vector3,restFore:Vector3,upper:Vector3,fore:Vector3,plane:StandingElbowPlane,dt:number,amount:number,outU:Quaternion,outF:Quaternion){
 const stableUpper=standingFollowDirection(side,restUpper,upper);
 const stableFore=plane.direction(upper,fore,side,1,dt)
  .applyQuaternion(new Quaternion().setFromUnitVectors(upper,stableUpper));
 directArmPose(restUpper,restFore,blendDirection(stableUpper,upper,amount),blendDirection(stableFore,fore,amount),outU,outF);
}
