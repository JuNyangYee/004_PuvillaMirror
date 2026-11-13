import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {portraitViewport,enforcePresentation} from '../src/presentation.ts';
for(const [w,h] of [[1920,1080],[1080,1920],[390,844],[844,390],[220,600],[0,0]]){
 const size=portraitViewport(w,h);assert.ok(size.width<=w&&size.height<=h+1e-9);
 if(w&&h)assert.ok(Math.abs(size.width/size.height-9/16)<1e-12);
}
const cfg=JSON.parse(readFileSync('public/config.json','utf8'));
Object.assign(cfg.scene,{layout:'landscape',aspect:2,outputMirror:true,pViewCenterCm:145});
Object.assign(cfg.outfit,{style:'classic',seatBody:true,sitBody:true});
Object.assign(cfg.character,{model:'proxy',modelPath:'./models/seat.bin'});
cfg.filter.enabled=true;const oil=structuredClone(cfg.filter.oil),camera=structuredClone(cfg.camera);
const result=enforcePresentation(cfg);
assert.equal(result.scene.layout,'portrait');assert.equal(result.scene.aspect,9/16);
assert.equal(result.outfit.style,'christmas');assert.equal(result.outfit.seatBody,false);assert.equal(result.outfit.sitBody,false);
assert.equal(result.character.model,'puuvilla');assert.equal(result.character.modelPath,'./models/pu_v4.obj');
assert.equal(result.outfit.muffler.fittedPath,'./models/pu_muffler_v4.bin');
assert.equal(result.filter.enabled,false);assert.deepEqual(result.filter.oil,oil);assert.deepEqual(result.camera,camera);
assert.equal(result.scene.outputMirror,true);assert.equal(result.scene.pViewCenterCm,145);
console.log('PASS: portrait fit, legacy layout/model overrides, independent operator preferences');
