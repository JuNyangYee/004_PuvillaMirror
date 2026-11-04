/// <reference lib="webworker" />
import {decodePeople} from './yoloDecode';
declare const self:DedicatedWorkerGlobalScope;
let ort:any,session:any;let backend='';
const canvas=new OffscreenCanvas(640,640),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
const pixels=new Float32Array(3*640*640);
self.onmessage=async({data:d})=>{
  if(d.type==='init'){
    try{
      ort=await import(/* @vite-ignore */ d.runtime);
      ort.env.wasm.wasmPaths=d.wasm;ort.env.wasm.numThreads=1;ort.env.logLevel='warning';
      const response=await fetch(d.model);if(!response.ok)throw Error('YOLO model HTTP '+response.status);
      const bytes=await response.arrayBuffer();
      try{session=await ort.InferenceSession.create(bytes,{executionProviders:['webgpu'],graphOptimizationLevel:'all'});backend='WebGPU';}
      catch{session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});backend='WASM';}
      self.postMessage({type:'ready',backend});
    }catch(e){self.postMessage({type:'error',message:String(e)});}
    return;
  }
  if(d.type!=='frame')return;
  const start=performance.now();let tensor:any,outputs:any;
  try{
    const b=d.bitmap as ImageBitmap,w=b.width,h=b.height,scale=Math.min(640/w,640/h);
    ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,640,640);ctx.drawImage(b,(640-w*scale)/2,(640-h*scale)/2,w*scale,h*scale);
    const image=ctx.getImageData(0,0,640,640).data,plane=640*640;
    for(let i=0;i<plane;i++){pixels[i]=image[i*4]/255;pixels[plane+i]=image[i*4+1]/255;pixels[plane*2+i]=image[i*4+2]/255;}
    tensor=new ort.Tensor('float32',pixels,[1,3,640,640]);
    outputs=await session.run({[session.inputNames[0]]:tensor});
    const head=Object.values(outputs).find((t:any)=>t.dims.length===3) as any;
    if(!head)throw Error('YOLO detection head missing');
    const boxes=decodePeople(head.data,head.dims,w,h,d.confidence);
    self.postMessage({type:'result',boxes,ts:d.ts,epoch:d.epoch,inferenceMs:performance.now()-start});
  }catch(e){self.postMessage({type:'error',message:String(e)});}
  finally{d.bitmap.close();tensor?.dispose();if(outputs)for(const t of Object.values(outputs) as any[])t.dispose();}
};
