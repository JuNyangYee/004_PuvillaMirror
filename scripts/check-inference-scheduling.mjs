import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){
  if(s.startsWith('.') && c.parentURL && !/\.[a-z]+$/i.test(s)) {
    const p = new URL(s+'.ts',c.parentURL); if(existsSync(p)) return next(p.href,c);
  }
  return next(s,c);
}});
const {FaceRecovery} = await import('../src/faceRecovery.ts');
let crops = [];
globalThis.OffscreenCanvas = class {
  constructor(width,height) {this.width=width;this.height=height;}
  getContext() {return {filter:'',drawImage(...args){crops.push(args.slice(1,5));}};}
};
const input={width:1280,height:720}, hint={cx:.5,cy:.5,size:1};
let calls=0, timestamps=[];
const miss=(image,ts)=>{calls++;timestamps.push(ts);return [];};
const recovery=new FaceRecovery();
recovery.run(input,0,miss,hint);
assert.equal(calls,2,'same hint/search crop is inferred once, plus full-frame');
assert.deepEqual(crops,[[280,0,720,720]]);
recovery.run(input,34,miss,hint);
assert.equal(calls,4,'new frame must not reuse the prior empty observation');
assert.ok(timestamps.every((ts,i)=>i===0 || ts>timestamps[i-1]));
// Distinct regions are still searched; successful recovery remains immediate.
const distant=new FaceRecovery(); crops=[];let regionalCalls=0;
const face={bbox:{x:.4,y:.3,w:.2,h:.2,cx:.5,cy:.4}};
const found=distant.run(input,0,image=>image===input?[]:(++regionalCalls===2?[face]:[]),{cx:.1,cy:.3,size:.4});
assert.equal(regionalCalls,2); assert.equal(found.length,0,'search result outside the selected head hint must not replace it');
assert.notDeepEqual(crops[0],crops[1]);
console.log('PASS: same-frame crop deduplication, distinct-region recovery, fresh-frame retry');

let now=0, worker, sent=[], closedBitmaps=0, pendingBitmap=null;
Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
globalThis.document={hidden:false};globalThis.location={href:'http://localhost/'};
globalThis.fetch=async()=>({ok:true});
globalThis.Worker=class {
  terminated=false;
  constructor(){worker=this;}
  postMessage(data){if(data.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready',delegate:'GPU'}}));else sent.push(data);}
  terminate(){this.terminated=true;}
};
const bitmap=()=>({width:1280,height:720,close(){closedBitmaps++;}});
globalThis.createImageBitmap=()=>pendingBitmap ? pendingBitmap : Promise.resolve(bitmap());
const {FaceTracker}=await import('../src/tracker.ts');
const cfg=JSON.parse(readFileSync('public/config.json'));
async function setup(skip=1){
  now=0;sent=[];document.hidden=false;pendingBitmap=null;
  const tracker=new FaceTracker({...cfg.tracker,useWorker:true,inferenceEveryNFrames:skip});
  let fallbacks=0;tracker.initMain=async()=>{fallbacks++;};
  await tracker.init();
  return {tracker,w:worker,fallbacks:()=>fallbacks};
}
async function frame(s,video,time,inferenceMs=10){
  now=time;video.currentTime=time/1000;
  s.tracker.update(video,now,input,hint); await Promise.resolve();
  const d=sent.at(-1);
  if(d && d.ts===now) s.w.onmessage({data:{type:'result',faces:[],ts:d.ts,epoch:d.epoch,inferenceMs}});
}
for(const [interval,skip] of [[33,1],[500,1],[33,4]]){
  const s=await setup(skip),video={readyState:4,currentTime:0};
  for(let t=0;t<8000;t+=interval) await frame(s,video,t,10);
  assert.equal(s.fallbacks(),0,'low input rate/skipping is not slow computation');
  // Same video frame, camera stall, then hidden-tab return.
  for(let t=8000;t<12000;t+=33){now=t;s.tracker.update(video,now,input);}
  assert.equal(s.fallbacks(),0,'stalled camera must not terminate worker');
  document.hidden=true;await frame(s,video,13000,900);document.hidden=false;
  await frame(s,video,20000,10);assert.equal(s.fallbacks(),0);
  s.tracker.close();
}
const slow=await setup(),video={readyState:4,currentTime:0};
for(let i=0;i<20 && !slow.fallbacks();i++)await frame(slow,video,i*500,400);
assert.equal(slow.fallbacks(),1,'sustained slow computations still fall back');assert.equal(slow.w.terminated,true);
slow.tracker.close();
const spikes=await setup();
for(let i=0;i<120;i++)await frame(spikes,video,i*50,i%10===0?500:10);
assert.equal(spikes.fallbacks(),0,'occasional recovery pass is not sustained slowness');spikes.tracker.close();
const pending=await setup();let resolveBitmap;
pendingBitmap=new Promise(resolve=>{resolveBitmap=resolve;});
now=100;pending.tracker.update({readyState:4,currentTime:1},now,input);
pending.tracker.close();const before=closedBitmaps;resolveBitmap(bitmap());await Promise.resolve();
assert.equal(closedBitmaps,before+1);assert.equal(sent.length,0,'no transfer after disposal');
const rotated=await setup();pendingBitmap=new Promise(resolve=>{resolveBitmap=resolve;});
now=100;rotated.tracker.update({readyState:4,currentTime:1},now,input);
rotated.tracker.resetInput();resolveBitmap(bitmap());await Promise.resolve();
assert.equal(sent.length,0);assert.equal(rotated.tracker.busy,false);rotated.tracker.close();
const failed=await setup();failed.w.onerror({message:'lost context'});failed.w.onerror({message:'late error'});
assert.equal(failed.fallbacks(),1,'runtime failure falls back once');failed.tracker.close();
console.log('PASS: low camera rate, skipped frames, stalls/hidden tabs, true slowness, isolated spikes, disposal/rotation, runtime failure');
