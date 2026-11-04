import type {Config} from './config';
import {PersonSelection} from './personSelection';
import {log} from './logger';
/** At most one YOLO frame in flight, independent from face/pose inference cadence. */
export class PersonTracker {
  readonly selection:PersonSelection;
  status='준비 중';inferenceMs=0;
  private worker:Worker|null=null;
  private busy=false;private ready=false;private epoch=0;
  private videoTime=-1;private sent=-Infinity;private readyTimer:ReturnType<typeof setTimeout>|null=null;
  private options='';
  constructor(private cfg:Config){this.selection=new PersonSelection(cfg.person);}
  init():void {
    if(this.worker)return;
    let w:Worker;
    try{w=new Worker(new URL('./yoloWorker.ts',import.meta.url),{type:'module'});}catch(e){this.fail(String(e));return;}
    this.worker=w;
    this.status='YOLO 준비 중';
    this.readyTimer=setTimeout(()=>this.fail('YOLO 초기화 시간 초과'),45000);
    w.onmessage=({data:d})=>{
      if(this.worker!==w)return;
      if(d.type==='ready'){if(this.readyTimer)clearTimeout(this.readyTimer);this.ready=true;this.status='YOLO '+d.backend;}
      else if(d.type==='result'){
        this.busy=false;const now=performance.now();
        if(d.epoch!==this.epoch||now-d.ts>Math.min(1000,this.cfg.person.lostHoldMs))return;
        this.inferenceMs=d.inferenceMs;
        this.selection.update(d.boxes,d.ts,this.cfg.presence.lockZone,this.cfg.camera.mirror);
      }else if(d.type==='error')this.fail(d.message);
    };
    w.onerror=e=>this.fail(e.message);
    w.postMessage({type:'init',runtime:new URL('./onnxruntime/ort.all.bundle.min.mjs',location.href).href,
      wasm:new URL('./onnxruntime/',location.href).href,model:new URL('./yolo/yolo11n-seg.onnx',location.href).href});
  }
  private fail(message:string):void {
    this.close();this.status='YOLO 오류 · 인식 설정에서 재시도';log.error('yolo',message);
  }
  update(source:HTMLCanvasElement,videoTime:number,now:number):void {
    const key=JSON.stringify([this.cfg.person.enabled,this.cfg.person.criterion,this.cfg.person.confidence,this.cfg.presence.lockZone,this.cfg.camera.mirror]);
    if(this.options&&this.options!==key)this.reset();this.options=key;
    this.selection.expire(now);
    if(this.cfg.person.enabled&&this.status==='준비 중')this.init();
    if(!this.cfg.person.enabled||!this.ready)return;
    if(this.busy){if(now-this.sent>5000)this.fail('YOLO 추론 응답 시간 초과');return;}
    if(videoTime===this.videoTime||now-this.sent<this.cfg.person.intervalMs||!source.width||!source.height)return;
    const w=this.worker!,epoch=this.epoch;this.busy=true;this.videoTime=videoTime;this.sent=now;
    createImageBitmap(source).then(bitmap=>{
      if(w!==this.worker||epoch!==this.epoch){bitmap.close();if(w===this.worker)this.busy=false;return;}
      try{w.postMessage({type:'frame',bitmap,ts:now,epoch,confidence:this.cfg.person.confidence},[bitmap]);}
      catch(e){bitmap.close();this.fail(String(e));}
    },e=>this.fail(String(e)));
  }
  reset():void {this.epoch++;this.videoTime=-1;this.selection.reset();}
  restart():void {this.close();this.init();}
  close():void {if(this.readyTimer)clearTimeout(this.readyTimer);this.worker?.terminate();this.worker=null;this.ready=this.busy=false;this.reset();}
}
