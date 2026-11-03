import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);}return next(s,c);}});
const {PuuvillaCharacter}=await import('../src/character/puuvilla.ts');
const {parseObj,fixInvertedWinding}=await import('../src/character/subdivide.ts');
const {NEUTRAL_PARAMS}=await import('../src/character/mapping.ts');
const {BodyProcessor}=await import('../src/body.ts');
const {armSessionFixture}=await import('../dev/arm-session-fixture.ts');
const {PaintCadence}=await import('../src/paintCadence.ts');
const cfg=JSON.parse(readFileSync('public/config.json','utf8'));
const rig=JSON.parse(readFileSync('public/'+cfg.body.armRigPath.replace(/^\//,''),'utf8'));
function character(){const parts=parseObj(readFileSync('public/'+cfg.character.modelPath.replace(/^\//,''),'utf8'));parts.forEach(fixInvertedWinding);return new PuuvillaCharacter(cfg,parts,false,null,null,rig);}
const a=character(),b=character();
assert.ok(a.cageSurface&&b.cageSurface,'actual production cage required');
const proc=new BodyProcessor(cfg),cadence=new PaintCadence();
const startA=a.cageSurface.evaluationCount,startB=b.cageSurface.evaluationCount;
let maxPositionError=0,maxNormalError=0,displayFrames=0;
for(let i=0;i<600;i++){
 const t=i/60,body=proc.update(armSessionFixture(t,true).raw,true,t*1000);
 const state={state:'MIMIC',progress:1,elapsedMs:t*1000};
 a.setState(state);b.setState(state);
 a.apply(NEUTRAL_PARAMS,1/60,t,body);b.apply(NEUTRAL_PARAMS,1/60,t,body,true);
 if(cadence.take(t,12,'test',0)){
  displayFrames++;b.prepareRender();
  const da=a.cageSurface.data,db=b.cageSurface.data;
  assert.equal(da.length,db.length);
  for(let j=0;j<da.length;j++){
   assert.ok(Number.isFinite(db[j]));const error=Math.abs(da[j]-db[j]);
   if(j%8<3)maxPositionError=Math.max(maxPositionError,error);
   else if(j%8>=4&&j%8<7)maxNormalError=Math.max(maxNormalError,error);
  }
  // Existing cage cache uses a 1e-9 matrix tolerance; different sampling can
  // retain slightly different settled poses. Use the existing cage-test bounds.
  assert.ok(maxPositionError<2e-5,'position differs at frame '+i);
  assert.ok(maxNormalError<2e-6,'normal differs at frame '+i);
 }
 for(let j=0;j<a.bones.length;j++)assert.ok(a.bones[j].quaternion.angleTo(b.bones[j].quaternion)<1e-6,'joint interpolation differs');
}
const immediate=a.cageSurface.evaluationCount-startA,deferred=b.cageSurface.evaluationCount-startB;
assert.equal(displayFrames,120);assert.ok(deferred<=120);assert.ok(immediate>deferred*4);
// Returning to the immediate API must update the latest pose without a lag.
for(let i=600;i<610;i++){
 const t=i/60,body=proc.update(armSessionFixture(t,true).raw,true,t*1000);
 a.apply(NEUTRAL_PARAMS,1/60,t,body);b.apply(NEUTRAL_PARAMS,1/60,t,body);
 assert.ok(b.cageSurface.data.every((v,j)=>Math.abs(v-a.cageSurface.data[j])<2e-5));
}
console.log('PASS: actual character, equivalent visible positions/normals and continuous joints; immediate rendering resumes');
console.log({simulationFrames:600,displayFrames,immediate,deferred,maxPositionError,maxNormalError});
