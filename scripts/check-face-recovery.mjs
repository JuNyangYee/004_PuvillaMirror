import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){
 if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){
  const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);
 }return next(s,c);
}});
import {FaceRecovery,remapRecoveryFace} from '../src/faceRecovery.ts';
const face={bbox:{x:.4,y:.2,w:.2,h:.3,cx:.5,cy:.35},yaw:5,pitch:3,roll:2,
 blend:{jawOpen:.1},mouth:{open:.1,corner:0},eyes:{left:.2,right:.2}};
let draws=[];
globalThis.OffscreenCanvas=class{
 constructor(w,h){this.width=w;this.height=h;}
 getContext(){return {filter:'',drawImage(...args){draws.push(args);}};}
};
const source={width:1280,height:720};
const recovery=new FaceRecovery();
let calls=0,lastTs=-Infinity,full=false,found=true;
const detect=(input,ts)=>{
 assert.ok(ts>lastTs);lastTs=ts;calls++;
 return (input===source?full:found)?[face]:[];
};
const first=recovery.run(source,100,detect);
assert.equal(calls,2);
assert.equal(recovery.mode,'recovery');
assert.equal(first[0].bbox.cx,.5);
assert.equal(first[0].bbox.w,.1125);
assert.equal(first[0].bbox.h,.3);
assert.equal(first[0].yaw,5);
assert.equal(draws[0][1],280);
recovery.run(source,133,detect);
assert.equal(calls,3,'locked recovery should run at incoming cadence, not 4 Hz');
found=false;
assert.deepEqual(recovery.run(source,166,detect),[],'failed recovery must not return cached face');
const afterLoss=calls;
recovery.run(source,200,detect);
assert.equal(calls,afterLoss+1,'brief loss retries the proven crop at frame cadence');
full=true;
assert.deepEqual(recovery.run(source,250,detect),[],'brief crop loss does not change inference framing');
assert.equal(recovery.run(source,1000,detect)[0],face);
assert.equal(recovery.mode,'full');
recovery.reset();full=false;found=true;
recovery.run(source,1260,detect);
assert.equal(draws.at(-1)[1],280,'reset starts from center');
const p=remapRecoveryFace(face,{x:0,y:280,size:720},720,1280);
assert.equal(p.bbox.cx,.5);
assert.equal(p.bbox.cy,(280+.35*720)/1280);
assert.equal(p.bbox.h,.16875);
assert.equal(p.blend,face.blend);
const {FaceRecovery:Before}=await import('../dev/face-recovery-before-v41.ts');
const {SignalProcessor}=await import('../src/signals.ts');
const cfg=JSON.parse(readFileSync('public/config.json'));
const recovered=remapRecoveryFace(face,{x:280,y:0,size:720},1280,720);
const stranger={...face,bbox:{x:.8,y:.1,w:.15,h:.3,cx:.875,cy:.25}};
for(const [Recovery,fixed] of [[Before,false],[FaceRecovery,true]]){
 const tracker=new Recovery(),signals=new SignalProcessor(cfg);
 let strangerVisible=false;
 const detect=(input)=>input===source?(strangerVisible?[stranger]:[]):[face];
 let faces=tracker.run(source,100,detect);
 signals.update({faces,inferenceMs:1},100,1280/720);
 strangerVisible=true;
 for(let now=1100;now<=4100;now+=100){
  faces=tracker.run(source,now,detect);
  signals.update({faces,inferenceMs:1},now,1280/720);
 }
 assert.equal(signals.target.cx,fixed?recovered.bbox.cx:stranger.bbox.cx,
  fixed?'bystander must not erase the still-detected recovered visitor':'baseline reproduces lost visitor / takeover');
}
const dedup=new FaceRecovery();
dedup.run(source,100,(input)=>input===source?[]:[face]);
let fullProbes=0;
assert.deepEqual(dedup.run(source,1100,(input)=>{if(input===source){fullProbes++;return [recovered,stranger];}return [face];}),[recovered]);
assert.equal(fullProbes,0,'healthy crop never alternates input framing for periodic probes');
assert.equal(dedup.mode,'recovery','matching full-frame probe must not discard a proven recovery region');
console.log('PASS: full-frame priority, recovery cadence, failure clearing, bounded search, timestamp monotonicity, portrait/landscape coordinates, reset');
console.log('PASS: reproduced full-frame bystander takeover; recovered visitor remains locked; same-face dedup without periodic framing changes');

const healthy=new FaceRecovery();let healthyCalls=0;
const hint={cx:.5,cy:.35,size:1};
for(let t=0;t<1500;t+=33){healthy.run(source,t,input=>{healthyCalls++;assert.equal(input,source);return [face];},hint);}
assert.equal(healthyCalls,46,'healthy full-frame tracking never needs an enlarged second pass');
const sticky=new FaceRecovery();const crops=[];
for(let t=0;t<1500;t+=33){sticky.run(source,t,input=>input===source?[]:[face],{cx:.5+.01*Math.sin(t),cy:.35,size:1});crops.push(draws.at(-1)?.slice(1,5));}
assert.ok(crops.every(c=>JSON.stringify(c)===JSON.stringify(crops[0])),'pose hint jitter cannot move a successful recovery crop');
console.log('PASS: full-frame first, one inference on healthy frames, stationary recovery input despite hint jitter');

const moving=new FaceRecovery();const head={...face,bbox:{x:.4,y:.4,w:.2,h:.2,cx:.5,cy:.5}};
moving.run(source,0,image=>image===source?[]:[head],{cx:.25,cy:.5,size:.4});
const shifted=moving.run(source,33,image=>image===source?[]:(draws.at(-1)[1]>600?[head]:[]),{cx:.75,cy:.5,size:.4});
assert.equal(shifted.length,1,'head leaving the old crop reframes immediately instead of an 800 ms freeze');
