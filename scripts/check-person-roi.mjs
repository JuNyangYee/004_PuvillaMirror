import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);}return next(s,c);}});
const {PersonSelection,DEFAULT_PERSON}=await import('../src/personSelection.ts');
const {PresenceConfirmation}=await import('../src/presenceConfirmation.ts');
const {decodePeople}=await import('../src/yoloDecode.ts');
const {remapFace,remapPose,regionFor}=await import('../src/inferenceRegion.ts');
const zone={x:0,y:0,w:1,h:1},a={x:.05,y:.15,w:.2,h:.45,score:.9},b={x:.6,y:.1,w:.35,h:.75,score:.8};
const cfg={...DEFAULT_PERSON},s=new PersonSelection(cfg);
s.update([a],0,zone,false);assert.equal(s.selected,a);const revision=s.revision;
for(const t of [100,200,300,400,500]){s.update([b,a],t,zone,false);assert.equal(s.selected,a,'brief challenger cannot switch');}
s.update([a,b],600,zone,false);assert.equal(s.selected,b);assert.ok(s.revision>revision);
s.update([b,a],700,zone,false);assert.equal(s.selected,b,'order cannot select a bystander');
const extended={...b,x:.45,w:.55};s.update([extended],800,zone,false);assert.ok(s.roi.x<=extended.x&&s.roi.x+s.roi.w>=extended.x+extended.w,'arm expansion immediate');
s.update([b],900,zone,false);assert.ok(s.roi.x< b.x,'contraction has room');s.expire(1400);assert.equal(s.selected,null);
const mirrored=new PersonSelection(cfg);mirrored.update([a,b],0,{x:0,y:0,w:.4,h:1},true);assert.equal(mirrored.selected,b);
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
console.log('PASS: largest-person switch dwell, identity order, arm ROI expansion, loss, mirrored zone, fresh-only confirmation, crop coordinates, world pose preservation, YOLO normalized/pixel output + NMS');
