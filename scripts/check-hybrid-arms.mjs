import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);}return next(s,c);}});
const T=await import('three');
const {hybridArmPose}=await import('../src/character/hybridArmPose.ts');
const {StandingElbowPlane}=await import('../src/character/standingElbowPlane.ts');
const {standingFollowDirection}=await import('../src/character/standingArmPose.ts');
const {directArmClearance}=await import('../src/character/directArmContact.ts');
const {hybridFollowAmount}=await import('../src/armTrackingMode.ts');
const {PuuvillaCharacter}=await import('../src/character/puuvilla.ts');
const {BodyProcessor}=await import('../src/body.ts');
const {armSessionFixture}=await import('../dev/arm-session-fixture.ts');
const {parseObj,fixInvertedWinding}=await import('../src/character/subdivide.ts');
const {NEUTRAL_PARAMS}=await import('../src/character/mapping.ts');
const cfg=JSON.parse(readFileSync('public/config.json'));
cfg.body.armTrackingMode='hybrid';cfg.body.armHybridFollow=.35;
const rig=JSON.parse(readFileSync('public/'+cfg.body.armRigPath.replace(/^\.\//,'')));
let cases=0,relaxed=0;
for(const side of [-1,1]){
 const j=rig.joints[side>0?'L':'R'],rest=new T.Vector3(...j.hand).sub(new T.Vector3(...j.shoulder)).normalize();
 for(const theta of [0,.15,.35,.6,1,1.8,2.7,Math.PI])for(const phi of [-1,0,.8,2.8]){
  const u=new T.Vector3(side*Math.sin(theta)*Math.cos(phi),-Math.cos(theta),Math.sin(theta)*Math.sin(phi));
  const f=u.clone().applyAxisAngle(new T.Vector3(0,0,side),1.2);
  const old=standingFollowDirection(side,rest,u),before=old.angleTo(u);
  const uq=new T.Quaternion(),fq=new T.Quaternion();
  hybridArmPose(side,rest,rest,u,f,new StandingElbowPlane(),1/60,.35,uq,fq);
  const actual=rest.clone().applyQuaternion(uq);
  assert.ok(Math.abs(actual.angleTo(u)-before*.65)<1e-6);
  if(before>.01)relaxed++;
  hybridArmPose(side,rest,rest,u,f,new StandingElbowPlane(),1/60,1,uq,fq);
  assert.ok(rest.clone().applyQuaternion(uq).distanceTo(u)<1e-7);
  assert.ok(rest.clone().applyQuaternion(fq).applyQuaternion(uq).distanceTo(f)<1e-7);
  cases++;
 }
}
assert.ok(relaxed>10);
assert.equal(hybridFollowAmount({...cfg.body,armHybridFollow:NaN}),.35);
assert.equal(hybridFollowAmount({...cfg.body,armHybridFollow:2}),1);
assert.equal(hybridFollowAmount({...cfg.body,armHybridFollow:-1}),0);
let depthMixed=0;
for(const mirror of [false,true]){
 const out={};
 for(const mode of ['legacy','hybrid','direct']){
  const c=structuredClone(cfg);c.camera.mirror=mirror;c.body.armTrackingMode=mode;c.body.additionalSmoothing=false;
  const p=new BodyProcessor(c),raw=armSessionFixture(2.5).raw;
  for(let t=0;t<=500;t+=50)out[mode]=p.update(raw,true,t);
 }
 for(const side of ['L','R']){
  const fore=p=>new T.Vector3(...p['wrist'+side]).sub(new T.Vector3(...p['elbow'+side])).normalize();
  const a=fore(out.legacy),b=fore(out.direct),h=fore(out.hybrid),angle=a.angleTo(b);
  if(angle>.01){assert.ok(h.angleTo(b)<angle&&h.angleTo(a)>0);depthMixed++;}
 }
}
assert.ok(depthMixed>0);
const parts=parseObj(readFileSync('public/'+cfg.character.modelPath.replace(/^\.\//,''),'utf8'));parts.forEach(fixInvertedWinding);
const ch=new PuuvillaCharacter(cfg,parts,false,null,null,rig);
ch.setState({state:'MIMIC',progress:1,elapsedMs:1000});
cfg.body.armTorsoClearance=false; // Hybrid must protect even with stale saved settings.
cfg.body.armFollowPose=false; // Hybrid owns its mapping independently of the old flag.
let minimum=Infinity,maxStep=0,previous=null;
for(let i=0;i<480;i++){
 const t=i/60,pose={shoulderL:[.2,.5,0],shoulderR:[-.2,.5,0],hipL:[.15,0,0],hipR:[-.15,0,0],armL:1,armR:1,hips:1};
 for(const [side,sign] of [['L',1],['R',-1]]){
  const u=new T.Vector3(sign*.35,-.9,.1*Math.sin(t)).normalize();
  const f=new T.Vector3(-sign*Math.sin(t),-.3,.5).normalize();
  pose['elbow'+side]=pose['shoulder'+side].map((v,k)=>v+u.getComponent(k)*.28);
  pose['wrist'+side]=pose['elbow'+side].map((v,k)=>v+f.getComponent(k)*.28);
 }
 ch.apply(NEUTRAL_PARAMS,1/60,t,pose,true);
 const directions=[];
 for(const arm of ch.arms){
  const j=ch.armJoints.find(j=>j.side===arm.side),u=arm.restUpper.clone().applyQuaternion(arm.qUpper),f=arm.restFore.clone().applyQuaternion(arm.qFore).applyQuaternion(arm.qUpper);
  minimum=Math.min(minimum,directArmClearance(j.s,j.h.distanceTo(j.s),u,f,ch.bones[2].quaternion,cfg.body.armBendSpread??.32).minimum);
  directions.push(f);
 }
 if(previous&&i>60)maxStep=Math.max(maxStep,...directions.map((v,k)=>v.angleTo(previous[k])));
 previous=directions;
 if(i%5===0){ch.prepareRender();assert.ok(ch.cageSurface.data.every(Number.isFinite));}
}
assert.ok(minimum>=1.0149,'production hybrid penetrates the torso proxy');
assert.ok(maxStep<.1,'hybrid has a contact discontinuity');
console.log({cases,relaxed,depthMixed,minimum,maxStep});
console.log('PASS: closer observed directions, partially retained depth stabilization, exact direct endpoint, mandatory post-interpolation body protection and finite production cage.');

ch.setState({state:'IDLE',progress:0,elapsedMs:0});
for(let i=0;i<120;i++){
 ch.apply(NEUTRAL_PARAMS,1/60,8+i/60,null,true);
 for(const arm of ch.arms){
  const j=ch.armJoints.find(j=>j.side===arm.side),u=arm.restUpper.clone().applyQuaternion(arm.qUpper),f=arm.restFore.clone().applyQuaternion(arm.qFore).applyQuaternion(arm.qUpper);
  assert.ok(directArmClearance(j.s,j.h.distanceTo(j.s),u,f,ch.bones[2].quaternion,cfg.body.armBendSpread??.32).minimum>=1.0149,'return to idle penetrates torso');
 }
}
console.log('PASS: body protection remains active through tracking loss and idle.');
