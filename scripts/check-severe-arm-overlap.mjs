import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);}return next(s,c);}});
const T=await import('three');
const {preventSevereArmOverlap,SEVERE_ARM_BOUNDARY}=await import('../src/character/severeArmOverlap.ts');
const {directArmClearance}=await import('../src/character/directArmContact.ts');
const {directArmPose}=await import('../src/character/directArmPose.ts');
const {PuuvillaCharacter}=await import('../src/character/puuvilla.ts');
const {parseObj,fixInvertedWinding}=await import('../src/character/subdivide.ts');
const {NEUTRAL_PARAMS}=await import('../src/character/mapping.ts');
const cfg=JSON.parse(readFileSync('public/config.json'));
cfg.body.armTrackingMode='legacy';cfg.body.armSevereOverlap=true;
const rig=JSON.parse(readFileSync('public/'+cfg.body.armRigPath.replace(/^\.\//,'')));
let unchanged=0,corrected=0,worst=Infinity,restMinimum=Infinity,outerOverlapRetained=0;
for(const side of [-1,1]){
 const j=rig.joints[side>0?'L':'R'],s=new T.Vector3(...j.shoulder),rest=new T.Vector3(...j.hand).sub(s),len=rest.length();rest.normalize();
 const uq=new T.Quaternion(),fq=new T.Quaternion(),chest=new T.Quaternion();
 restMinimum=Math.min(restMinimum,directArmClearance(s,len,rest,rest,chest,.45).minimum);
 assert.equal(preventSevereArmOverlap(s,len,rest,rest,uq,fq,chest,.45),false);
 assert.deepEqual(uq.toArray(),[0,0,0,1]);assert.deepEqual(fq.toArray(),[0,0,0,1]);
 for(const theta of [0,.3,.6,1,1.5,2,2.7,Math.PI])for(const phi of [-2,-.5,0,.8,1.57,2.2,3])for(const bend of [-2,-1,0,.5,1.8]){
  const u=new T.Vector3(side*Math.sin(theta)*Math.cos(phi),-Math.cos(theta),Math.sin(theta)*Math.sin(phi));
  const f=u.clone().applyAxisAngle(new T.Vector3(0,0,side),bend);
  directArmPose(rest,rest,u,f,uq,fq);
  chest.setFromEuler(new T.Euler(.13*Math.sin(phi),.2*Math.cos(theta),.12*Math.sin(bend)));
  const before=directArmClearance(s,len,u,f,chest,.45).minimum,oldU=uq.toArray(),oldF=fq.toArray();
  preventSevereArmOverlap(s,len,rest,rest,uq,fq,chest,.45);
  const au=rest.clone().applyQuaternion(uq),af=rest.clone().applyQuaternion(fq).applyQuaternion(uq);
  const after=directArmClearance(s,len,au,af,chest,.45).minimum;
  assert.ok(Number.isFinite(after));
  if(before>=SEVERE_ARM_BOUNDARY){
   assert.deepEqual(uq.toArray(),oldU);assert.deepEqual(fq.toArray(),oldF);unchanged++;
   if(before<1)outerOverlapRetained++;
  }else{
   assert.ok(after>=SEVERE_ARM_BOUNDARY-1.1e-5);
   assert.ok(after<SEVERE_ARM_BOUNDARY+.002,'pushed out to full surface instead of stopping at inner boundary');
   worst=Math.min(worst,after);corrected++;
  }
 }
}
assert.ok(corrected>50&&outerOverlapRetained>20);
function character(c){const parts=parseObj(readFileSync('public/'+c.character.modelPath.replace(/^\.\//,''),'utf8'));parts.forEach(fixInvertedWinding);return new PuuvillaCharacter(c,parts,false,null,null,rig);}
const off=structuredClone(cfg);off.body.armSevereOverlap=false;
const a=character(off),b=character(cfg);
let basicFrames=0;
for(const state of ['IDLE','MIMIC']){
 a.setState({state,progress:1,elapsedMs:1000});b.setState({state,progress:1,elapsedMs:1000});
 for(let i=0;i<180;i++){
  a.apply(NEUTRAL_PARAMS,1/60,i/60,null,true);b.apply(NEUTRAL_PARAMS,1/60,i/60,null,true);
  for(let j=0;j<a.arms.length;j++){
   assert.deepEqual(b.arms[j].qUpper.toArray(),a.arms[j].qUpper.toArray(),'natural resting upper arm changed');
   assert.deepEqual(b.arms[j].qFore.toArray(),a.arms[j].qFore.toArray(),'natural resting forearm changed');
  }
  basicFrames++;
 }
}
let buriedFrames=0,minProtected=Infinity,maxStep=0,previous=null;
a.setState({state:'MIMIC',progress:1,elapsedMs:1000});b.setState({state:'MIMIC',progress:1,elapsedMs:1000});
for(let i=0;i<360;i++){
 const t=i/60,pose={shoulderL:[.2,.5,0],shoulderR:[-.2,.5,0],hipL:[.15,0,0],hipR:[-.15,0,0],armL:1,armR:1,hips:1};
 for(const [side,sign] of [['L',1],['R',-1]]){
  const u=new T.Vector3(-sign*.55,-.8,.12*Math.sin(t)).normalize(),f=new T.Vector3(-sign*.6,.2,.15*Math.cos(t)).normalize();
  pose['elbow'+side]=pose['shoulder'+side].map((v,k)=>v+u.getComponent(k)*.28);
  pose['wrist'+side]=pose['elbow'+side].map((v,k)=>v+f.getComponent(k)*.28);
 }
 a.apply(NEUTRAL_PARAMS,1/60,t+3,pose,true);b.apply(NEUTRAL_PARAMS,1/60,t+3,pose,true);
 for(const ch of [a,b])for(const arm of ch.arms){
  const j=ch.armJoints.find(j=>j.side===arm.side),u=arm.restUpper.clone().applyQuaternion(arm.qUpper),f=arm.restFore.clone().applyQuaternion(arm.qFore).applyQuaternion(arm.qUpper);
  const d=directArmClearance(j.s,j.h.distanceTo(j.s),u,f,ch.bones[2].quaternion,.45).minimum;
  if(ch===a&&d<.7)buriedFrames++;
  if(ch===b)minProtected=Math.min(minProtected,d);
 }
 const directions=b.arms.map(arm=>arm.restFore.clone().applyQuaternion(arm.qFore).applyQuaternion(arm.qUpper));
 if(previous&&i>60)maxStep=Math.max(maxStep,...directions.map((v,k)=>v.angleTo(previous[k])));
 previous=directions;
}
assert.ok(buriedFrames>0,'fixture did not reproduce a deeply buried legacy arm');
assert.ok(minProtected>=SEVERE_ARM_BOUNDARY-1.1e-5);
b.prepareRender();assert.ok(b.cageSurface.data.every(Number.isFinite));
console.log({unchanged,corrected,outerOverlapRetained,worst,restMinimum,basicFrames,buriedFrames,minProtected,maxStep});
assert.ok(maxStep<.1, "deep-overlap correction jumped during a smooth input sweep");
console.log('PASS: source rest and idle/missing-pose joints unchanged; mild overlap retained; deeply buried legacy limbs stop at inner boundary after smoothing.');
