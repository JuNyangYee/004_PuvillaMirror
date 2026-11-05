import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);}return next(s,c);}});
const {BodyProcessor}=await import('../src/body.ts');
const {BodyProcessor:Before}=await import('../dev/body-before-v26.ts');
const {armTrackingFixture}=await import('../dev/arm-tracking-fixture.ts');
const cfg=JSON.parse(readFileSync('public/config.json')),raw=armTrackingFixture(2.5).raw;
const processor=new BodyProcessor(cfg);
for(let t=0;t<3000;t+=33)assert.ok(processor.update(raw,true,t));
let lost;
for(let t=3000;t<7000;t+=33)lost=processor.update(null,true,t);
assert.equal(lost,null,'no cached body after selected person disappears');
// Modest confidence drift on a steady pose must not drop either arm.
const stable=new BodyProcessor(cfg),oldStable=new Before(cfg);let oldRejected=0;
for(let frame=0;frame<600;frame++){
 const r=structuredClone(raw),now=frame*1000/30;
 if(now>3000)for(const id of [13,14,15,16])r.world[id].visibility=.58;
 const a=stable.update(r,true,now),b=oldStable.update(r,true,now);
 if(now>3200){assert.equal(a.armL,.58);assert.equal(a.armR,.58);if(b.armL===0)oldRejected++;}
}
assert.ok(oldRejected>400);
const bad=structuredClone(raw);bad.world[15].visibility=.58;bad.world[15].x+=.25;
const movedArm=stable.update(bad,true,20100).armR;
assert.equal(movedArm,cfg.body.armTrackingMode==='direct'?.58:0,'mode-specific movement acceptance');
cfg.body.armTrackingMode='legacy';
const legacy=new BodyProcessor(cfg);
for(let t=0;t<1000;t+=33)legacy.update(raw,true,t);
assert.equal(legacy.update(bad,true,1023).armR,0,'legacy drift protection must remain available');
console.log('PASS: selected pose continuity, dropout clears, steady confidence drift and moving uncertain arm rejection');

// Extra smoothing can be bypassed without changing MediaPipe's native output.
const comparisonCfg=structuredClone(cfg);comparisonCfg.body.additionalSmoothing=false;
const bypass=new BodyProcessor(comparisonCfg);
bypass.update(raw,true,0);
const moved=structuredClone(raw);for(const p of moved.world)p.x+=.04;
const direct=bypass.update(moved,true,33);
const leftId=comparisonCfg.camera.mirror?12:11;
const expected=(comparisonCfg.camera.mirror?-1:1)*moved.world[leftId].x;
assert.equal(direct.shoulderL[0],expected,'bypass passes current joint sample unchanged');
comparisonCfg.body.additionalSmoothing=true;
assert.equal(bypass.update(moved,true,66).shoulderL[0],expected,'enable starts with current sample');
const further=structuredClone(moved);for(const p of further.world)p.x+=.04;
const filtered=bypass.update(further,true,99).shoulderL[0];
const target=(comparisonCfg.camera.mirror?-1:1)*further.world[leftId].x;
assert.ok(Math.abs(filtered-target)>1e-5,'enabled filter smooths a new movement');
comparisonCfg.body.additionalSmoothing=false;
assert.equal(bypass.update(further,true,132).shoulderL[0],target,'disable immediately bypasses filter');
console.log('PASS: additional body smoothing bypass, live enable/disable and clean history');
