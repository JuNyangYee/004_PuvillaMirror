import type {Config} from './config';
import type {Scene} from './scene';
import type {Backdrop} from './backdrop';
import {orbitAngles,resetCameraView} from './cameraView';
const ICON_FULL =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICON_EXIT_FULL =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
const ICON_MIRROR =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>';
const ICON_OIL =
  '<svg viewBox="0 0 24 24" width="21" height="21" fill="#fff"><path d="M12 3C6.5 3 2.5 6.9 2.5 11.6c0 4.2 3.3 7.4 7.3 7.4 1.4 0 1.9-.8 1.9-1.6 0-1.2-1-1.6-1-2.6 0-.9.7-1.5 1.7-1.5h2.3c3.4 0 6.8-1.7 6.8-5.4C21.5 4.8 17.2 3 12 3z" opacity=".95"/><circle cx="7.2" cy="10.6" r="1.5" fill="#000" opacity=".35"/><circle cx="10.6" cy="7.1" r="1.5" fill="#000" opacity=".35"/><circle cx="15.2" cy="7.4" r="1.5" fill="#000" opacity=".35"/></svg>';
const ICON_BG =
  '<svg viewBox="0 0 24 24" width="21" height="21" fill="#fff"><circle cx="16.8" cy="7" r="2.4"/><path d="M2.5 19.5l6.2-9.3 4.1 6 2.4-3.2 6.3 6.5z"/></svg>';

/** Presentation buttons share one portrait-stage toolbar. */
export function setupViewControls(full:Config,scene:Scene,onChange:()=>void,backdrop:Backdrop|null):void{
  const stage=document.getElementById('stage')!;
  const toolbar=document.getElementById('viewControls')!;
  const cfg=full.scene;
  const button=(id:string,label:string,icon:string,order:number)=>{
    const b=document.createElement('button');b.type='button';b.id=id;b.className='view-control';
    b.title=label;b.setAttribute('aria-label',label);b.innerHTML=icon;b.style.order=String(order);
    b.addEventListener('pointerdown',e=>e.stopPropagation());toolbar.appendChild(b);return b;
  };
  const doc=document as Document & {webkitFullscreenElement?:Element;webkitExitFullscreen?:()=>void};
  const root=document.documentElement as HTMLElement & {webkitRequestFullscreen?:()=>void};
  const fsBtn=button('fullscreenToggle','전체화면',ICON_FULL,1);
  const isFull=()=>!!(document.fullscreenElement||doc.webkitFullscreenElement);
  const paintFs=()=>{fsBtn.innerHTML=isFull()?ICON_EXIT_FULL:ICON_FULL;fsBtn.setAttribute('aria-pressed',String(isFull()));};
  if(!root.requestFullscreen&&!root.webkitRequestFullscreen){fsBtn.disabled=true;fsBtn.title='이 브라우저는 전체화면을 지원하지 않습니다';}
  fsBtn.onclick=async()=>{try{if(isFull()){if(document.exitFullscreen)await document.exitFullscreen();else doc.webkitExitFullscreen?.();}else if(root.requestFullscreen)await root.requestFullscreen({navigationUI:'hide'});else root.webkitRequestFullscreen?.();}catch{}};
  document.addEventListener('fullscreenchange',()=>{paintFs();scene.resize();});
  document.addEventListener('webkitfullscreenchange',()=>{paintFs();scene.resize();});paintFs();
  const oBtn=button('oilToggle','유화 필터 조절',ICON_OIL,2);
  const mirrorBtn=button('outputMirrorToggle','캐릭터 좌우반전',ICON_MIRROR,3);
  const paintMirror=()=>{mirrorBtn.setAttribute('aria-pressed',String(cfg.outputMirror));mirrorBtn.style.background=cfg.outputMirror?'#586f95':'#18223890';};
  mirrorBtn.onclick=()=>{cfg.outputMirror=!cfg.outputMirror;paintMirror();if(scene.ready)scene.render();onChange();};paintMirror();
  const bgBtn=button('bgToggle','배경 전환: 겨울 마을 / 단색',ICON_BG,4);
  const paintBg=()=>bgBtn.setAttribute('aria-pressed',String(!!backdrop?.usesImage));
  bgBtn.onclick=()=>{backdrop?.next();paintBg();};paintBg();
  const settings=document.getElementById('overlayToggle');if(settings)toolbar.appendChild(settings);
  const oilPanel = document.createElement("div");
  oilPanel.id = "oilPanel";
  oilPanel.style.cssText='padding:14px;border-radius:14px;background:#14213bee;color:#fff;font:12px/1.3 system-ui;display:none;flex-direction:column;gap:9px';
  const oil = full.filter.oil;
  let saveT = 0;
  const saveOil = () => {
    clearTimeout(saveT);
    saveT = window.setTimeout(onChange, 400);
  };
  const row = (label: string) => {
    const r = document.createElement("div");
    r.style.cssText = "display:grid;grid-template-columns:72px 1fr 32px;align-items:center;gap:8px";
    const n = document.createElement("span");
    n.textContent = label;
    r.appendChild(n);
    oilPanel.appendChild(r);
    return r;
  };
  type OilNum = "strength" | "size" | "boil" | "grade" | "split";
  const addSlider = (label: string, key: OilNum, min: number, max: number, step: number) => {
    const r = row(label);
    const inp = document.createElement("input");
    inp.type = "range";
    inp.setAttribute("aria-label",label);
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(oil[key]);
    inp.style.cssText = "width:100%;accent-color:#fff;margin:0";
    const v = document.createElement("span");
    v.style.textAlign = "right";
    v.textContent = oil[key].toFixed(2);
    inp.oninput = () => {
      oil[key] = parseFloat(inp.value);
      v.textContent = oil[key].toFixed(2);
      saveOil();
    };
    r.append(inp, v);
  };
  const addSeg = (label: string, key: "fps" | "res", opts: [string, number][]) => {
    const r = row(label);
    r.style.gridTemplateColumns = "72px 1fr";
    const box = document.createElement("div");
    box.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:4px";
    const bs: [HTMLButtonElement, number][] = [];
    const paintSeg = () =>
      bs.forEach(([b, v]) => {
        const on = oil[key] === v;
        b.style.background = on ? "#fff" : "transparent";
        b.style.color = on ? "#111" : "#fff";
      });
    for (const [t, v] of opts) {
      const b = document.createElement("button");
      b.textContent = t;
      b.style.cssText = "border:1px solid rgba(255,255,255,.7);border-radius:6px;padding:3px 0;font:inherit;cursor:pointer";
      b.onclick = (e) => {
        e.stopPropagation();
        oil[key] = v;
        paintSeg();
        saveOil();
      };
      bs.push([b, v]);
      box.appendChild(b);
    }
    paintSeg();
    r.appendChild(box);
  };
  addSlider("강도", "strength", 0, 1.6, 0.05);
  addSlider("붓 크기", "size", 0.6, 1.8, 0.05);
  addSlider("획 변화", "boil", 0, 1, 0.05);
  addSeg("초당 그림", "fps", [["24", 24], ["12", 12], ["8", 8]]);
  addSlider("색 보정", "grade", 0, 1, 0.05);
  addSlider("비교 위치", "split", 0, 1, 0.01);
  addSeg("처리 해상도", "res", [["½", 0.5], ["¾", 0.75], ["1", 1]]);
  for (const ev of ["pointerdown", "pointermove", "wheel"]) oilPanel.addEventListener(ev, (e) => e.stopPropagation());
  stage.appendChild(oilPanel);

  oilPanel.setAttribute('aria-label','유화 필터 조절');
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=oil.enabled;
  const label=document.createElement('label');label.append(enabled,document.createTextNode(' 유화 필터 사용'));oilPanel.prepend(label);
  enabled.onchange=()=>{oil.enabled=enabled.checked;onChange();};
  let panelOpen=false;
  const showPanel=()=>{oilPanel.style.display=panelOpen?'flex':'none';oBtn.setAttribute('aria-expanded',String(panelOpen));};
  oBtn.setAttribute('aria-controls','oilPanel');oBtn.onclick=()=>{panelOpen=!panelOpen;showPanel();};showPanel();
  document.addEventListener('pointerdown',e=>{if(!oilPanel.contains(e.target as Node)&&!oBtn.contains(e.target as Node)){panelOpen=false;showPanel();}});
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){panelOpen=false;showPanel();}
    if(e.key.toLowerCase()!=='f'||e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.target instanceof HTMLElement&&(e.target.isContentEditable||e.target.closest('input,textarea,select')))return;
    e.preventDefault();const hidden=document.body.classList.toggle('controls-hidden');
    if(hidden){panelOpen=false;showPanel();if(document.activeElement instanceof HTMLElement&&document.activeElement.closest('.view-control'))document.activeElement.blur();}
  });
  // ── 확대·축소·이동 ──
  const el = scene.renderer.domElement;
  el.style.touchAction = "none";
  const pts = new Map<number, { x: number; y: number; pan: boolean }>();
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(onChange, 400);
  };
  const pan = (dx: number, dy: number) => {
    const v = scene.view();
    const cmPerPx = scene.cmPerPx;
    scene.setView({ ...v, offsetX: v.offsetX - dx * cmPerPx, center: v.center + dy * cmPerPx });
  };
  const zoom = (factor: number) => {
    const v = scene.view();
    scene.setView({ ...v, height: v.height / factor });
  };

  el.title = '좌클릭 드래그: 회전 · 휠클릭 드래그: 이동 · 휠: 확대/축소 · R: 시점 초기화';
  el.addEventListener('pointerdown', e => {
    if(e.pointerType==='mouse' && e.button!==0 && e.button!==1)return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, {x:e.clientX,y:e.clientY,pan:e.button===1});
  });
  el.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
  window.addEventListener('keydown',e=>{
    if(e.key.toLowerCase()!=='r'||e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
    if(e.target instanceof HTMLElement&&(e.target.isContentEditable||e.target.closest('input,textarea,select')))return;
    e.preventDefault();pts.clear();resetCameraView(cfg);scene.resize();save();
  });
  el.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      if(p.pan)pan(e.clientX-p.x,e.clientY-p.y);
      else {Object.assign(cfg,orbitAngles(cfg.cameraYawDeg,cfg.cameraTiltDeg,e.clientX-p.x,e.clientY-p.y));scene.resize();}
    } else if (pts.size === 2) {
      const [a, b] = [...pts.entries()];
      const other = a[0] === e.pointerId ? b[1] : a[1];
      const before = Math.hypot(p.x - other.x, p.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 10) zoom(after / before);
      // 두 손가락 중심 이동은 절반만큼 이동으로
      pan((e.clientX - p.x) / 2, (e.clientY - p.y) / 2);
    }
    p.x = e.clientX;
    p.y = e.clientY;
    save();
  });
  const up = (e: PointerEvent) => pts.delete(e.pointerId);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("lostpointercapture", up);
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(Math.exp(-e.deltaY * 0.0015));
      save();
    },
    { passive: false },
  );
}
