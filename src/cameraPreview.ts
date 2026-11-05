import { applyImageSettings, currentVideoTrack } from "./camera";
import type {PersonBox} from "./personSelection";
import type {InferenceRegion} from "./inferenceRegion";
import type {RawPose} from "./poseTracker";
import type {RawFace} from "./tracker";
import {marginHandle,dragMargins,type Margins,type MarginHandle} from './recognitionMargins';
import type { Config } from "./config";

export interface VisionDebug {boxes:PersonBox[];selected:PersonBox|null;region:InferenceRegion|null;poses:RawPose[];faces:RawFace[];status:string;detail?:string;stage?:number;challenger?:PersonBox|null;switchProgress?:number}
const POSE_LINKS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[15,17],[15,19],[16,18],[16,20]];
/** Developer camera preview with draggable recognition margins. */
export class CameraPreview {
  private wrap: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private status: HTMLDivElement;
  private drag: {id:number;x:number;y:number;start:Margins;handle:MarginHandle}|null=null;

  /** Camera exposure or recognition margins changed (auto-save). */
  onChange: (() => void) | null = null;

  constructor(private cfg: Config, video: HTMLVideoElement | HTMLCanvasElement, hasCamera: boolean) {
    this.wrap = document.createElement("div");
    this.wrap.id = "camWrap";
    this.wrap.style.cssText =
      "position:fixed;right:12px;bottom:12px;width:min(42vw,420px);border-radius:8px;overflow:hidden;" +
      "border:1px solid #444;background:#111;z-index:5;display:flex;flex-direction:column";
    document.body.appendChild(this.wrap);
    const view = document.createElement("div");
    view.style.cssText = "position:relative;width:100%;aspect-ratio:16/9;touch-action:none";
    this.wrap.appendChild(view);
    if (hasCamera) {
      video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none;object-fit:contain;border:0;border-radius:0;opacity:1";
      view.appendChild(video);
      const fitSource = () => {
        const width = "videoWidth" in video ? video.videoWidth : video.width;
        const height = "videoHeight" in video ? video.videoHeight : video.height;
        if (!width || !height) return;
        const aspect = width / height;
        view.style.aspectRatio = String(aspect);
        // Limit height as well as width so portrait footage and controls fit.
        this.wrap.style.width = `min(42vw,420px,${50 * aspect}vh)`;
        document.documentElement.style.setProperty("--camera-preview-height", `min(${42 / aspect}vw,${420 / aspect}px,50vh)`);
      };
      video.addEventListener("loadedmetadata", fitSource);
      video.addEventListener("resize", fitSource);
      fitSource();
    } else {
      const note = document.createElement("div");
      note.textContent = "카메라 없음 (시뮬레이션)";
      note.style.cssText = "position:absolute;left:8px;top:6px;color:#888;font:12px system-ui";
      view.appendChild(note);
    }
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    view.appendChild(this.canvas);
    this.status=document.createElement('div');
    this.status.style.cssText='padding:5px 6px;color:#fff;font:11px/1.5 system-ui;white-space:pre-line';
    this.wrap.appendChild(this.status);
    if (hasCamera) this.buildExposureControls();
    this.ctx = this.canvas.getContext("2d")!;
    this.setupMarginDrag();

  }

  private canEditMargins():boolean {
    return this.cfg.debugVision.recognitionRange&&!document.body.classList.contains('debug-hidden')&&!document.body.classList.contains('kiosk');
  }

  private finishDrag():void {
    const drag=this.drag;if(!drag)return;
    this.drag=null;
    if(this.canvas.hasPointerCapture(drag.id))this.canvas.releasePointerCapture(drag.id);
    if(Object.keys(drag.start).some(k=>drag.start[k as keyof Margins]!==this.cfg.recognition.margins[k as keyof Margins]))this.onChange?.();
  }

  private setupMarginDrag():void {
    const canvas=this.canvas;
    canvas.title='가장자리·모서리: 마진 조절 / 안쪽: 범위 이동';
    const cursor=(h:MarginHandle|null)=>h==='move'?'move':h==='n'||h==='s'?'ns-resize':h==='e'||h==='w'?'ew-resize':h==='ne'||h==='sw'?'nesw-resize':h?'nwse-resize':'default';
    canvas.addEventListener('pointerdown',e=>{
      if(!this.canEditMargins()||e.button!==0||this.drag)return;
      const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      const handle=marginHandle(this.cfg.recognition.margins,x,y,r.width,r.height);
      if(!handle)return;
      this.drag={id:e.pointerId,x:x/r.width,y:y/r.height,start:{...this.cfg.recognition.margins},handle};
      canvas.setPointerCapture(e.pointerId);canvas.style.cursor=cursor(handle);e.preventDefault();e.stopPropagation();
    });
    canvas.addEventListener('pointermove',e=>{
      if(!this.canEditMargins()){this.finishDrag();return;}
      const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      if(this.drag){
        if(e.pointerId!==this.drag.id||!r.width||!r.height)return;
        Object.assign(this.cfg.recognition.margins,dragMargins(this.drag.start,this.drag.handle,x/r.width-this.drag.x,y/r.height-this.drag.y));
        e.preventDefault();
      }else canvas.style.cursor=cursor(marginHandle(this.cfg.recognition.margins,x,y,r.width,r.height));
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{
      if((e as PointerEvent).pointerId===this.drag?.id)this.finishDrag();
    });
    window.addEventListener('blur',()=>this.finishDrag());
  }

  /** Camera exposure controls, when supported by the device. */
  private buildExposureControls(): void {
    const track = currentVideoTrack();
    const caps = (track?.getCapabilities?.() ?? {}) as Record<string, { min: number; max: number; step?: number } | string[] | undefined>;
    const cc = this.cfg.camera;
    const panel = document.createElement("div");
    panel.style.cssText = "display:grid;grid-template-columns:auto 1fr 44px;gap:4px 8px;align-items:center;padding:6px 10px;font:12px system-ui;color:#ddd";
    // 숨기기/보이기 버튼 (상태는 config 에 저장)
    const toggle = document.createElement("button");
    toggle.style.cssText = "border:0;border-top:1px solid #333;background:#1b1b1b;color:#bbb;font:12px system-ui;padding:4px;cursor:pointer";
    const setHidden = (h: boolean) => {
      cc.controlsHidden = h;
      panel.style.display = h ? "none" : "grid";
      toggle.textContent = h ? "▲ 카메라 노출 조절 보이기" : "▼ 카메라 노출 조절 숨기기";
    };
    toggle.onclick = () => {
      setHidden(!cc.controlsHidden);
      this.onChange?.();
    };
    this.wrap.append(toggle, panel);
    setHidden(cc.controlsHidden);
    const apply = () => {
      cc.applyImageSettings = true;
      void applyImageSettings(cc);
    };
    const save = () => this.onChange?.();
    const rows: { show: () => boolean; els: HTMLElement[] }[] = [];
    const refresh = () => rows.forEach((r) => r.els.forEach((el) => (el.style.display = r.show() ? "" : "none")));

    if (caps.exposureMode) {
      const label = document.createElement("label");
      label.style.cssText = "grid-column:1 / span 3;display:flex;gap:6px;align-items:center;cursor:pointer";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = cc.autoExposure;
      cb.onchange = () => {
        cc.autoExposure = cb.checked;
        apply();
        refresh();
        save();
      };
      label.append(cb, "자동 노출 (끄면 노출 시간을 직접 조절)");
      panel.appendChild(label);
    }
    const slider = (name: string, key: "exposureTime" | "exposureCompensation" | "brightness" | "contrast", cap: string, show: () => boolean, unit = "") => {
      const c = caps[cap] as { min: number; max: number; step?: number } | undefined;
      if (!c || typeof c.min !== "number") return;
      const lab = document.createElement("span");
      lab.textContent = name;
      const input = document.createElement("input");
      input.type = "range";
      // 노출 시간은 웹캠이 2배 간격 단계(…312·625·1250…)로만 받는다 → 슬라이더도 그 단계로
      const log2 = key === "exposureTime" && c.min > 0;
      const toVal = (x: number) => (log2 ? c.min * Math.pow(2, Math.round(x)) : x);
      if (log2) {
        input.min = "0";
        input.max = String(Math.floor(Math.log2(c.max / c.min)));
        input.step = "1";
        input.value = String(Math.round(Math.log2(Math.max(c.min, cc[key]) / c.min)));
      } else {
        input.min = String(c.min);
        input.max = String(c.max);
        input.step = String(c.step || (c.max - c.min) / 100);
        input.value = String(Math.min(c.max, Math.max(c.min, cc[key])));
      }
      input.style.width = "100%";
      const val = document.createElement("span");
      const fmt = () => (val.textContent = `${Math.round(toVal(Number(input.value)) * 10) / 10}${unit}`);
      fmt();
      input.oninput = () => {
        cc[key] = toVal(Number(input.value));
        fmt();
        apply();
      };
      input.onchange = save;
      panel.append(lab, input, val);
      rows.push({ show, els: [lab, input, val] });
    };
    slider("노출 시간", "exposureTime", "exposureTime", () => !cc.autoExposure);
    slider("노출 보정", "exposureCompensation", "exposureCompensation", () => cc.autoExposure);
    slider("밝기", "brightness", "brightness", () => true);
    slider("대비", "contrast", "contrast", () => true);
    if (!panel.childElementCount) panel.textContent = "이 카메라는 노출 조절을 지원하지 않음";
    refresh();
  }

  draw(debug:VisionDebug): void {
    const editable=this.canEditMargins();
    this.canvas.style.pointerEvents=editable?'auto':'none';
    if(!editable)this.finishDrag();
    if(document.body.classList.contains("debug-hidden")||document.body.classList.contains("kiosk"))return;
    const c = this.canvas, g = this.ctx;
    const W = c.clientWidth, H = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    if(debug){
      const flags=this.cfg.debugVision,mirror=this.cfg.camera.mirror;
      if(flags.recognitionRange){
        const m=this.cfg.recognition.margins;
        const x=m.left*W,y=m.top*H,w=(1-m.left-m.right)*W,h=(1-m.top-m.bottom)*H;
        g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.rect(0,0,W,H);g.rect(x,y,w,h);g.fill('evenodd');
        g.strokeStyle=debug.stage===2?'#4eff8c':debug.stage===1?'#ffe16b':'#aab3c4';
        g.lineWidth=1.5;g.setLineDash([5,4]);g.strokeRect(x,y,w,h);g.setLineDash([]);
      }
      const px=(x:number)=>(mirror?1-x:x)*W;
      const box=(b:{x:number;y:number;w:number;h:number},color:string,label:string,dashed=false)=>{
        const x=(mirror?1-b.x-b.w:b.x)*W,y=b.y*H;
        g.strokeStyle=g.fillStyle=color;g.lineWidth=2;g.setLineDash(dashed?[5,3]:[]);
        g.strokeRect(x,y,b.w*W,b.h*H);g.setLineDash([]);g.font='11px system-ui';g.fillText(label,x+3,Math.max(12,y+12));
      };
      if(flags.yoloBoxes)for(const b of debug.boxes)box(b,b===debug.selected?'#4eff8c':'#ff9b50','YOLO '+Math.round(b.score*100)+'%'+(b===debug.selected?' · 선택':''));
      if(flags.yoloBoxes&&debug.challenger)box(debug.challenger,'#ffe16b','전환 대기 '+Math.round((debug.switchProgress??0)*100)+'%');
      if(flags.inputRegion&&debug.region)box(debug.region,'#51d9ff','MediaPipe 입력',true);
      if(flags.bodyPoints)for(const p of debug.poses){
        const pts=p.image;if(!pts)continue;
        const visible=(i:number)=>pts[i]&&Number.isFinite(pts[i].x)&&Number.isFinite(pts[i].y)&&(pts[i].visibility??p.world[i]?.visibility??0)>=this.cfg.body.minVisibility;
        g.strokeStyle='#42e9d0';g.lineWidth=1.5;g.beginPath();
        for(const [a,b] of POSE_LINKS)if(visible(a)&&visible(b)){g.moveTo(px(pts[a].x),pts[a].y*H);g.lineTo(px(pts[b].x),pts[b].y*H);}g.stroke();
        g.fillStyle='#42e9d0';for(let i=0;i<pts.length;i++)if(visible(i)){g.beginPath();g.arc(px(pts[i].x),pts[i].y*H,2.3,0,Math.PI*2);g.fill();}
      }
      if(flags.faceLandmarks){g.fillStyle='#ff82e9';for(const face of debug.faces)for(const p of face.landmarks??[]){g.fillRect(px(p.x)-.7,p.y*H-.7,1.4,1.4);}}
      this.status.textContent=debug.status+'\n'+(debug.detail??'');
      if(flags.recognitionRange){
        const m=this.cfg.recognition.margins,l=m.left*W,r=(1-m.right)*W,t=m.top*H,b=(1-m.bottom)*H;
        g.fillStyle='#fff';g.strokeStyle='#182331';g.lineWidth=1;
        for(const [x,y] of [[l,t],[(l+r)/2,t],[r,t],[l,(t+b)/2],[r,(t+b)/2],[l,b],[(l+r)/2,b],[r,b]]){
          g.fillRect(x-4,y-4,8,8);g.strokeRect(x-4,y-4,8,8);
        }
      }
    }
  }
}
