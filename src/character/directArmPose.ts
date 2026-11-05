import {Quaternion,Vector3} from 'three';

/** Exact bone directions in the rendered chest frame. No rest-angle floor,
 * camera-depth reconstruction, bend gain, elbow-plane lock or angle clamp. */
export function directArmPose(restUpper:Vector3,restFore:Vector3,upper:Vector3,fore:Vector3,outU:Quaternion,outF:Quaternion){
 outU.setFromUnitVectors(restUpper,upper);
 outF.setFromUnitVectors(restFore,fore.clone().applyQuaternion(outU.clone().invert()));
}
