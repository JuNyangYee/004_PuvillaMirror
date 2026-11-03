import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
import * as THREE from 'three';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&c.parentURL&&!/\.[a-z]+$/i.test(s)){const p=new URL(s+'.ts',c.parentURL);if(existsSync(p))return next(p.href,c);}return next(s,c);}});
const {Snowfall,SNOW_VOLUME,SNOW_BASE_FLAKES}=await import('../src/snowfall.ts');
const {BACKDROP_WALL_Z}=await import('../src/groundedBackdrop.ts');
const {PuuvillaCharacter}=await import('../src/character/puuvilla.ts');
const {parseObj,fixInvertedWinding}=await import('../src/character/subdivide.ts');
const cfg=JSON.parse(readFileSync('public/config.json','utf8'));
const rig=JSON.parse(readFileSync('public/'+cfg.body.armRigPath.replace(/^\//,''),'utf8'));
const parts=parseObj(readFileSync('public/'+cfg.character.modelPath.replace(/^\//,''),'utf8'));parts.forEach(fixInvertedWinding);
const character=new PuuvillaCharacter(cfg,parts,false,null,null,rig);
character.root.updateMatrixWorld(true);
let backZ=Infinity;const v=new THREE.Vector3();
character.root.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)backZ=Math.min(backZ,v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).z);});

const snowCfg={enabled:true,amount:1,speed:1};
const snow=new Snowfall(cfg.character.modelScale,cfg.character.focusYcm,snowCfg);
const {position,motion}=snow.points.geometry.attributes;
assert.equal(position.count,SNOW_BASE_FLAKES*2);
for(let i=0;i<position.count;i++){
 const z=position.getZ(i);
 // nearest reach including the z sway stays behind the character's back; farthest stays in front of the photo wall
 assert.ok(z+SNOW_VOLUME.swayZ<=SNOW_VOLUME.nearZ+1e-6&&z-SNOW_VOLUME.swayZ>BACKDROP_WALL_Z,'flake depth '+z);
 assert.ok(Math.abs(position.getX(i))<=SNOW_VOLUME.halfWidth&&position.getY(i)>=0&&position.getY(i)<1);
 // whole cycles per loop → phase 1 lands every flake exactly where phase 0 started
 assert.ok(Number.isInteger(motion.getX(i))&&motion.getX(i)>=1&&Number.isInteger(motion.getY(i)),'seamless loop');
}
assert.ok(SNOW_VOLUME.nearZ<backZ-.3,`snow nearZ ${SNOW_VOLUME.nearZ} must sit behind the character back ${backZ.toFixed(3)}`);

const renderer={getCurrentViewport:t=>t.set(0,0,810,1440)},u=snow.points.material.uniforms;
const draw=()=>{snow.points.onBeforeRender(renderer);return snow.points.geometry.drawRange.count;};
snow.show(false,false);assert.equal(snow.points.visible,false,'hidden without the winter photo');
snow.show(true,true);assert.equal(snow.points.visible,true);draw();assert.equal(u.painted.value,1);assert.equal(u.pixelScale.value,720);
snow.show(true,false);draw();assert.equal(u.painted.value,0);
for(const [amount,count] of [[0,0],[.5,450],[1,900],[2,1800],[5,1800],[-1,0]]){snowCfg.amount=amount;assert.equal(draw(),count);}
snowCfg.enabled=false;snow.show(true,false);assert.equal(snow.points.visible,false,'settings switch');
assert.equal(snow.points.material.depthWrite,false);assert.equal(snow.points.material.depthTest,true);
console.log('PASS: snow volume behind the character and in front of the photo wall, seamless loop, winter-only, amount and oil profile');
console.log({characterBackZ:+backZ.toFixed(3),snowNearZ:SNOW_VOLUME.nearZ,snowFarZ:SNOW_VOLUME.farZ,wallZ:BACKDROP_WALL_Z});
