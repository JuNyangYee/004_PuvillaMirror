import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);}return next(s,c);}});
const {PersonSelection,DEFAULT_PERSON}=await import('../src/personSelection.ts');
const {PresenceConfirmation}=await import('../src/presenceConfirmation.ts');
const {decodePeople}=await import('../src/yoloDecode.ts');
const {remapFace,remapPose,regionFor}=await import('../src/inferenceRegion.ts');
const a={x:.05,y:.15,w:.2,h:.45,score:.9},b={x:.6,y:.1,w:.35,h:.75,score:.8};
const cfg={...DEFAULT_PERSON},s=new PersonSelection(cfg);
s.update([a],0);assert.equal(s.selected,a);const revision=s.revision;
for(const t of [100,200,300,400,500,600,700,800]){s.update([b,a],t);assert.equal(s.selected,a,'brief challenger cannot switch');}
s.update([a,b],900);assert.equal(s.selected,b);assert.ok(s.revision>revision);
s.update([b,a],1000);assert.equal(s.selected,b,'result order cannot select a bystander');
const extended={...b,x:.45,w:.55};s.update([extended],1100);assert.ok(s.roi.x<=extended.x&&s.roi.x+s.roi.w>=extended.x+extended.w,'arm expansion immediate');
s.update([b],1200);assert.ok(s.roi.x<b.x,'contraction leaves room');s.expire(1700);assert.equal(s.selected,null);
// Missing current person must not bypass a long pending switch at the 500 ms loss timeout.
const missing=new PersonSelection({...cfg,switchHoldMs:1000});missing.update([a],0);
for(let t=100;t<1100;t+=100){missing.update([b],t);assert.notEqual(missing.selected,b);}
missing.update([b],1100);assert.equal(missing.selected,b);
// Alternating challengers and an inference stall restart their continuous dwell.
const c={...b,x:.31,w:.25},flicker=new PersonSelection(cfg);flicker.update([a],0);
for(let t=100;t<=1200;t+=100)flicker.update([a,t%200===0?b:c],t);
assert.equal(flicker.selected,a);flicker.update([a,b],1300);flicker.update([a,b],1700);assert.equal(flicker.selected,a);
const instant=new PersonSelection({...cfg,switchHoldMs:0});instant.update([a],0);instant.update([a,b],100);assert.equal(instant.selected,b);
const edge=new PersonSelection(cfg);edge.update([{...a,x:0,y:0}],0);assert.ok(edge.selected,'no legacy face/zone gate');
const gate=new PresenceConfirmation();assert.equal(gate.update(true,0,0,350,1500),false);
for(let now=16;now<1500;now+=16)assert.equal(gate.update(true,0,now,350,1500),false,'cached face cannot confirm');
gate.reset();for(const t of [0,100,200,300])assert.equal(gate.update(true,t,t,350,1500),false);
assert.equal(gate.update(true,400,400,350,1500),true);assert.equal(gate.update(false,500,500,350,1500),true);assert.equal(gate.update(false,1900,1900,350,1500),false);
gate.reset();gate.update(true,0,0,350,1500);gate.update(false,100,100,350,1500);
assert.equal(gate.update(true,200,200,350,1500),false);assert.equal(gate.update(true,300,300,350,1500),false);assert.equal(gate.update(true,400,400,350,1500),false,'empty frame restarts acquisition');
const r=regionFor({x:.2,y:.1,w:.4,h:.6,score:1},1000,500);
const f=remapFace({bbox:{x:.1,y:.2,w:.3,h:.4,cx:.25,cy:.4},landmarks:[{x:.5,y:.5,z:.1}]},r);
assert.ok(Math.abs(f.landmarks[0].x-.4)<1e-8);assert.ok(Math.abs(f.landmarks[0].y-.4)<1e-8);
const world=[{x:1,y:2,z:3}],image=Array.from({length:33},(_,i)=>({x:i/40,y:.5,visibility:1}));
const p=remapPose({world,image,nose:{x:.5,y:.5},shoulderW:.1},r);assert.equal(p.world,world);assert.equal(p.imageAspect,2);assert.equal(p.nose.x,.4);
for(const normalized of [true,false]){
 const data=new Float32Array(84*3),n=3,k=normalized?1:640;
 for(let i=0;i<n;i++){data[i]=.5*k;data[n+i]=.5*k;data[2*n+i]=.2*k;data[3*n+i]=.4*k;data[4*n+i]=.9-i*.1;}
 data[5*n+2]=.99;
 const people=decodePeople(data,[1,84,n],640,640,.4);assert.equal(people.length,1,'NMS and non-person exclusion');assert.ok(Math.abs(people[0].w-.2)<1e-6);
}
console.log('PASS: largest-person switch dwell, identity order, arm ROI expansion, loss, continuous/cancelled switch dwell, fresh-only confirmation, crop coordinates, world pose preservation, YOLO normalized/pixel output + NMS');

// Delayed positive evidence keeps a pending computation distinct from absence.
const delayed=new PersonSelection(cfg);delayed.update([a],0,undefined,100);const ownerRevision=delayed.revision;
delayed.expire(650,200);assert.equal(delayed.selected,a,'bounded pending inference may finish after lease');
delayed.update([a],200,undefined,700);assert.equal(delayed.revision,ownerRevision,'late same-person result does not reset');
delayed.update([],750,undefined,1250);assert.equal(delayed.selected,null,'explicit empty result ends expired lease');
assert.equal(delayed.revision,ownerRevision,'absence alone does not rebuild the graph');
delayed.update([a],1300,undefined,1350);assert.equal(delayed.revision,ownerRevision,'brief same-person return stays warm');
delayed.expire(2401,1400);assert.equal(delayed.selected,null,'pending computation has a hard deadline');
delayed.update([b],2500,undefined,2550);assert.ok(delayed.revision>ownerRevision,'different person resets graph');
const afterSwitch=delayed.revision;delayed.expire(3100);delayed.update([b],6000);assert.ok(delayed.revision>afterSwitch,'long absence cannot reuse identity');
// Fresh absence must not borrow the pending-result grace.
const empty=new PersonSelection(cfg);empty.update([a],0);empty.update([],100);empty.expire(500,200);assert.equal(empty.selected,null);
// No response and no pending work expires at the original configured timeout.
const stalled=new PersonSelection(cfg);stalled.update([a],0);stalled.expire(500);assert.equal(stalled.selected,null);
console.log('PASS: delayed result vs observed absence, bounded inference wait, warm same-person return and real identity reset');

const draws=[];let sizes=0;
globalThis.document={createElement:()=>{let width=300,height=150;return {
  get width(){return width},set width(v){width=v;sizes++},get height(){return height},set height(v){height=v;sizes++},
  getContext:()=>({fillStyle:'',fillRect(...a){draws.push(['clear',...a])},drawImage(...a){draws.push(['draw',...a])}})
};}};
const {PersonCrop}=await import('../src/inferenceRegion.ts');const masked=new PersonCrop(),source={width:1280,height:720};
masked.update(source,a,0);const firstSize=sizes;
masked.update(source,b,1);assert.equal(sizes,firstSize,'moving/resizing YOLO boxes never resize inference canvas');
assert.deepEqual(masked.region,{x:0,y:0,w:1,h:1,aspect:1280/720});
assert.equal(masked.canvas.width,1280);assert.equal(masked.canvas.height,720);
const lastDraw=draws.at(-1);assert.equal(lastDraw[2],lastDraw[6]);assert.equal(lastDraw[3],lastDraw[7]);
assert.equal(lastDraw[4],lastDraw[8]);assert.equal(lastDraw[5],lastDraw[9]);
assert.equal(draws.at(-2)[0],'clear','old-person pixels cleared on every input frame');
masked.reset();masked.update({width:720,height:1280},a,2);assert.equal(masked.canvas.width,720);assert.equal(masked.canvas.height,1280);
console.log('PASS: stable masked input, unchanged original coordinates, cleared background and portrait rotation');
