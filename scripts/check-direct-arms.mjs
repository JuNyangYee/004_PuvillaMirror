import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);}return next(s,c);}});
const T=await import('three');
const {directArmPose}=await import('../src/character/directArmPose.ts');
const {resolveDirectArmContact,directArmClearance}=await import('../src/character/directArmContact.ts');
const {PuuvillaCharacter}=await import('../src/character/puuvilla.ts');
const {BodyProcessor}=await import('../src/body.ts');
const {armSessionFixture}=await import('../dev/arm-session-fixture.ts');
const cfg=JSON.parse(readFileSync('public/config.json'));
cfg.body.armTrackingMode='direct'; // Explicit comparison mode; default may be hybrid.
const rig=JSON.parse(readFileSync('public/'+cfg.body.armRigPath.replace(/^\.\//,'')));
let changed=0,minimum=Infinity,maxFreeError=0,cases=0,worst=null;
const start=performance.now();
for(const side of [-1,1]){
 const j=rig.joints[side>0?'L':'R'],s=new T.Vector3(...j.shoulder),rest=new T.Vector3(...j.hand).sub(s),len=rest.length();rest.normalize();
 for(const theta of [0,.3,.6,1,1.5,2,2.7,Math.PI])for(const phi of [-2,-.5,0,.8,1.57,2.2,3])for(const bend of [-2,-1,0,.5,1.8]){
  const u=new T.Vector3(side*Math.sin(theta)*Math.cos(phi),-Math.cos(theta),Math.sin(theta)*Math.sin(phi));
  const f=u.clone().applyAxisAngle(new T.Vector3(0,0,side),bend);
  const uq=new T.Quaternion(),fq=new T.Quaternion();
  directArmPose(rest,rest,u,f,uq,fq);
  assert.ok(rest.clone().applyQuaternion(uq).distanceTo(u)<1e-7);
  assert.ok(rest.clone().applyQuaternion(fq).applyQuaternion(uq).distanceTo(f)<1e-7);
  const chest=new T.Quaternion().setFromEuler(new T.Euler(.13*Math.sin(phi),.2*Math.cos(theta),.12*Math.sin(bend)));
  const before=directArmClearance(s,len,u,f,chest,.45).minimum;
  resolveDirectArmContact(s,len,rest,rest,uq,fq,chest,.45);
  const au=rest.clone().applyQuaternion(uq),af=rest.clone().applyQuaternion(fq).applyQuaternion(uq);
  const after=directArmClearance(s,len,au,af,chest,.45).minimum;
  if(after<minimum){minimum=after;worst={side,theta,phi,bend,before,after};}
  if(before>=1.015)maxFreeError=Math.max(maxFreeError,au.distanceTo(u),af.distanceTo(f));else changed++;
  cases++;assert.ok(Number.isFinite(after));assert.ok(after>=before-1e-7);
 }
 // Production solveArm must bypass even deliberately extreme legacy settings.
 const fake={cfg:{body:{...cfg.body,armTrackingMode:'direct',armFollowPose:false,armRaiseMaxRad:.1,elbowGain:0,armElbowPlane:true}}};
 const arm={side,restUpper:rest,restFore:rest};
 const pose={shoulderL:[0,0,0],shoulderR:[0,0,0],elbowL:[0,-1,0],elbowR:[0,-1,0],wristL:[0,-1,-1],wristR:[0,-1,-1]};
 const uq=new T.Quaternion(),fq=new T.Quaternion();
 PuuvillaCharacter.prototype.solveArm.call(fake,arm,pose,new T.Quaternion(),uq,fq,1/60);
 assert.ok(rest.clone().applyQuaternion(uq).distanceTo(new T.Vector3(0,-1,0))<1e-7);
 assert.ok(rest.clone().applyQuaternion(fq).applyQuaternion(uq).distanceTo(new T.Vector3(0,0,-1))<1e-7);
}
console.log({cases,changed,minimum,maxFreeError,worst,elapsedMs:performance.now()-start});
assert.ok(minimum>=1.0149,'body clearance remains unresolved');
assert.ok(maxFreeError<1e-7,'free motion was constrained');
// Body input must retain the WORLD estimate, even when image-depth correction
// would flatten it. Keep acquisition/missing-person gating and optional OneEuro.
for(const mirror of [true,false]){
 const c=structuredClone(cfg);c.body.armTrackingMode='direct';c.body.additionalSmoothing=false;c.camera.mirror=mirror;
 const p=new BodyProcessor(c),raw=armSessionFixture(2.5).raw;let pose;
 for(let t=0;t<=500;t+=50)pose=p.update(raw,true,t);
 for(const [side,ids] of mirror?[['L',[12,14,16]],['R',[11,13,15]]]:[['L',[11,13,15]],['R',[12,14,16]]]){
  assert.ok(pose['arm'+side]>=c.body.minVisibility);
  for(const [key,id] of [['shoulder',ids[0]],['elbow',ids[1]],['wrist',ids[2]]]){
   const w=raw.world[id],want=[w.x*(mirror?-1:1),-w.y,-w.z];
   assert.deepEqual(pose[key+side],want);
  }
 }
}
// Rendered interpolation paths can collide even if both endpoints are clear.
// Exercise the actual post-slerp order through a continuous belly-crossing sweep.
let maxStep=0,minDynamic=Infinity,maxSpeed=0,worstStep=null;
for(const side of [-1,1]){
 const j=rig.joints[side>0?'L':'R'],s=new T.Vector3(...j.shoulder),rest=new T.Vector3(...j.hand).sub(s),len=rest.length();rest.normalize();
 for(const fps of [15,30,60]){
  const uq=new T.Quaternion(),fq=new T.Quaternion();let previous=null;
  for(let i=0;i<fps*8;i++){
   const t=i/fps,u=new T.Vector3(side*.45,-.8,.2*Math.sin(t)).normalize(),f=new T.Vector3(-side*Math.sin(t),-.3,.5).normalize();
   const tu=new T.Quaternion(),tf=new T.Quaternion(),chest=new T.Quaternion().setFromEuler(new T.Euler(.1*Math.sin(t),.15*Math.sin(t),0));
   directArmPose(rest,rest,u,f,tu,tf);const k=1-Math.exp(-28/fps);
   if(i===0){uq.copy(tu);fq.copy(tf);}else{uq.slerp(tu,k);fq.slerp(tf,k);}
   resolveDirectArmContact(s,len,rest,rest,uq,fq,chest,.45);
   const au=rest.clone().applyQuaternion(uq),af=rest.clone().applyQuaternion(fq).applyQuaternion(uq);
   minDynamic=Math.min(minDynamic,directArmClearance(s,len,au,af,chest,.45).minimum);
   if(previous){const step=previous.angleTo(af);maxStep=Math.max(maxStep,step);if(step*fps>maxSpeed){maxSpeed=step*fps;worstStep={side,fps,t,step};}}previous=af;
  }
 }
}
assert.ok(minDynamic>=1.0149);
console.log({minDynamic,maxStep,maxSpeed,worstStep});
assert.ok(maxSpeed<6, "contact projection introduced a discontinuity");
console.log('PASS: direct MediaPipe directions, legacy controls bypassed, free motion unchanged, body clearance after interpolation.');

// Exercise the actual character path: switchable contact, post-slerp geometry,
// torso frame conversion, and a return to the preserved legacy pipeline.
const {parseObj,fixInvertedWinding}=await import('../src/character/subdivide.ts');
const {NEUTRAL_PARAMS}=await import('../src/character/mapping.ts');
const c=structuredClone(cfg),parts=parseObj(readFileSync('public/'+c.character.modelPath.replace(/^\.\//,''),'utf8'));
parts.forEach(fixInvertedWinding);
const ch=new PuuvillaCharacter(c,parts,false,null,null,rig);
ch.setState({state:'MIMIC',progress:1,elapsedMs:1000});
const pose={shoulderL:[.2,.5,0],shoulderR:[-.2,.5,0],hipL:[.15,0,0],hipR:[-.15,0,0],armL:1,armR:1,hips:1,
 elbowL:[.22,.22,0],elbowR:[-.22,.22,0],wristL:[-.05,.27,.06],wristR:[.05,.27,.06]};
let frame=0;
const advance=()=>{for(let i=0;i<90;i++)ch.apply(NEUTRAL_PARAMS,1/60,frame++/60,pose,true);ch.prepareRender();};
c.body.armTorsoClearance=false;advance();
const rawDirections=ch.arms.map(a=>a.restUpper.clone().applyQuaternion(a.qUpper));
c.body.armTorsoClearance=true;advance();
for(const [i,a] of ch.arms.entries()){
 const j=ch.armJoints.find(j=>j.side===a.side);
 const u=a.restUpper.clone().applyQuaternion(a.qUpper),f=a.restFore.clone().applyQuaternion(a.qFore).applyQuaternion(a.qUpper);
 assert.ok(directArmClearance(j.s,j.h.distanceTo(j.s),u,f,ch.bones[2].quaternion,c.body.armBendSpread??.32).minimum>=1.0149);
 assert.ok(rawDirections[i].distanceTo(u)>.01,'contact toggle did not reach production arm joints');
}
assert.ok(ch.cageSurface.data.every(Number.isFinite),'non-finite production cage');
c.body.armTorsoClearance=false;advance();
for(const [i,a] of ch.arms.entries())assert.ok(rawDirections[i].distanceTo(a.restUpper.clone().applyQuaternion(a.qUpper))<1e-6);
c.body.armTrackingMode='legacy';advance();assert.ok(ch.cageSurface.data.every(Number.isFinite));
c.body.armTrackingMode='direct';advance();
for(const [i,a] of ch.arms.entries())assert.ok(rawDirections[i].distanceTo(a.restUpper.clone().applyQuaternion(a.qUpper))<1e-6);
console.log('PASS: production cage contact on/off, direct/legacy/direct live switches and restoration of raw directions.');
