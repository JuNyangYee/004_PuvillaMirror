import * as THREE from 'three';

/** Fixed reference framing shared by reset, camera motion, and photo projection. */
export const CAMERA_FOV = 18;
export const INITIAL_VIEW = Object.freeze({
  pViewCenterCm: 95, pViewHeightCm: 250, pViewOffsetXcm: 0,
  cameraTiltDeg: -6, cameraYawDeg: 0,
});
export const ORBIT_LIMITS = Object.freeze({yaw:25,tiltMin:-12,tiltMax:-2});
export interface CameraView {
  pViewCenterCm:number; pViewHeightCm:number; pViewOffsetXcm:number;
  cameraTiltDeg:number; cameraYawDeg:number;
}

export function resetCameraView(view: CameraView): void {
  Object.assign(view, INITIAL_VIEW);
}
export function orbitAngles(yaw: number, tilt: number, dx: number, dy: number) {
  return {
    cameraYawDeg: Math.max(-ORBIT_LIMITS.yaw, Math.min(ORBIT_LIMITS.yaw, yaw - dx * .22)),
    cameraTiltDeg: Math.max(ORBIT_LIMITS.tiltMin, Math.min(ORBIT_LIMITS.tiltMax, tilt - dy * .16)),
  };
}

/** Orbit around the character's body; pan in camera space without rotating the rig. */
export function applyCameraView(camera: THREE.PerspectiveCamera, view: CameraView, scale: number, focusYcm: number): void {
  camera.fov = CAMERA_FOV;
  const distance=view.pViewHeightCm*scale/2/Math.tan(CAMERA_FOV*Math.PI/360);
  const pivotY=(INITIAL_VIEW.pViewCenterCm-focusYcm)*scale;
  const tilt=THREE.MathUtils.degToRad(view.cameraTiltDeg);
  const yaw=THREE.MathUtils.degToRad(view.cameraYawDeg ?? 0);
  camera.position.set(distance*Math.cos(tilt)*Math.sin(yaw),pivotY-distance*Math.sin(tilt),distance*Math.cos(tilt)*Math.cos(yaw));
  camera.lookAt(0,pivotY,0);
  const pan=new THREE.Vector3(view.pViewOffsetXcm*scale,(view.pViewCenterCm-INITIAL_VIEW.pViewCenterCm)*scale,0).applyQuaternion(camera.quaternion);
  camera.position.add(pan);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
