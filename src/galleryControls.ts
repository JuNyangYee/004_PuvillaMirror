import {galleryPackage,effectiveValues,syncGallerySettings,resetGallerySettings,testGallery,type OilSettings,type GalleryPackage} from './galleryFilter';
import type GUI from 'lil-gui';
export function galleryControls(parent:HTMLElement,oil:OilSettings,onChange:()=>void){
 const box=document.createElement('div');parent.append(box);
 function paint(){
  box.replaceChildren();
  const p=galleryPackage(),v=effectiveValues(oil),caption=document.createElement('p');caption.textContent=(p.show?'쇼 유화 · ':'갤러리 유화 · ')+p.version+' / '+p.date;box.append(caption);
  for(const s of [...p.schema].sort((a,b)=>Number(b.key==='level')-Number(a.key==='level'))){
   const row=document.createElement('label');row.style.cssText='display:grid;grid-template-columns:110px 1fr 62px;align-items:center;gap:6px;margin:7px 0';
   row.title=s.help??'';const name=document.createElement('span');name.textContent=s.label;row.append(name);
   if(s.type==='enum'){
    const select=document.createElement('select');select.setAttribute('aria-label',s.label);
    for(const option of s.options??[])select.add(new Option(option.label,option.value));
    select.value=String(v[s.key]);select.onchange=()=>{if(s.key==='showVersion')for(const key of Object.keys(oil.gallery!.values))if(key.includes('.')||key==='boil')delete oil.gallery!.values[key];oil.gallery!.values[s.key]=select.value;syncGallerySettings(oil);onChange();paint();};row.append(select);
   }else{
    const range=document.createElement('input'),num=document.createElement('input');range.type='range';num.type='number';
    for(const input of [range,num]){input.min=String(s.min);input.max=String(s.max);input.step=String(s.step);input.value=String(v[s.key]);input.setAttribute('aria-label',s.label+(input===num?' 값':''));input.style.width='100%';}
    // Preserve defaults such as 1.23 even when they do not land on slider steps.
    const set=(from:HTMLInputElement,to:HTMLInputElement)=>{const n=Number(from.value);if(!Number.isFinite(n))return;const value=Math.max(s.min!,Math.min(s.max!,n));oil.gallery!.values[s.key]=value;to.value=String(value);syncGallerySettings(oil);onChange();};
    range.oninput=()=>set(range,num);num.onchange=()=>{set(num,range);paint();};
    range.onchange=()=>{if(s.key==='level')paint();};row.append(range,num);
   }
   box.append(row);
  }
  const reset=document.createElement('button');reset.textContent=p.show?'쇼 첫 화면 기본값으로':'이 판의 갤러리 기본값으로';reset.onclick=()=>{resetGallerySettings(oil);onChange();paint();};box.append(reset);
  const info=document.createElement('p');info.style.opacity='.7';info.textContent=p.show?'show/의 버전·첫 화면 기본값과 모듈의 조절 항목을 함께 받습니다. 처리 해상도는 미믹 설정을 사용하며 결 크기는 쇼와 같은 비율로 적용합니다.':'기본값·조절 범위는 갤러리에서 가져옵니다. 비교 위치와 처리 해상도는 이 앱의 출력 설정입니다.';box.append(info);
 }
 paint();
}
export function galleryUpdateControls(gui:GUI){
 const folder=gui.addFolder('유화 필터 업데이트'),text=document.createElement('div');
 text.style.cssText='white-space:pre-wrap;padding:8px;font:12px/1.5 system-ui';folder.$children.append(text);
 let candidate:GalleryPackage|null=null,busy=false;
 const api=async(path:string,body?:unknown)=>{
  const r=await fetch('./__mimic/filter-update/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({error:'로컬 개발/미리보기/전시 서버에서 업데이트할 수 있습니다.'}));if(!r.ok)throw Error(d.error);return d;
 };
 const run=async(fn:()=>Promise<void>)=>{if(busy)return;busy=true;try{await fn();}catch(e){text.textContent=String(e)+'\n현재 적용판은 유지됩니다.';}finally{busy=false;}};
 const p=galleryPackage();text.textContent=(p.show?'출처: '+p.pageSource+'\n':'')+'화면 적용판: '+p.version+' ('+p.date+')\n효과 코드 + 조절 항목·범위·기본값을 함께 받습니다.';
 folder.add({check:()=>run(async()=>{
  candidate=null;text.textContent='갤러리 최신판 확인 중…';const r=await api('check',{});candidate=r.candidate;
  text.textContent=(r.same?'이미 최신판입니다.':'새 판을 받았습니다.')+'\n'+candidate!.version+' / '+candidate!.date+'\n조절 항목 '+candidate!.schema.length+'개\n적용하면 이 판의 기본값을 사용합니다.';
 })},'check').name('최신판 확인');
 folder.add({apply:()=>run(async()=>{
  if(!candidate)throw Error('먼저 최신판을 확인하세요');
  text.textContent='GPU 시험 렌더 중…';await testGallery(candidate);
  await api('apply',{id:candidate.id,tested:true});text.textContent='적용 완료. 새로고침하면 반영됩니다.';
 })},'apply').name('시험 렌더 후 적용');
 folder.add({history:()=>run(async()=>{
  const r=await api('status',{});history.replaceChildren();
  if(!r.history.length){history.textContent='이전 판 없음';return;}
  for(const id of r.history){
   const button=document.createElement('button');button.textContent='복원 · '+id.slice(0,12);button.onclick=()=>run(async()=>{
    const {candidate:old}=await api('candidate',{id});text.textContent='이전 판 시험 렌더 중…';await testGallery(old);
    await api('rollback',{id,tested:true});text.textContent='이전 판 복원 완료. 새로고침하면 반영됩니다.';
   });history.append(button);
  }
 })},'history').name('이전 판 목록');
 const history=document.createElement('div');history.style.cssText='display:grid;gap:5px;padding:8px';folder.$children.append(history);
 folder.add({reload:()=>location.reload()},'reload').name('새로고침해서 반영');folder.close();
}
