import bundled from './vendor/gallery-bundle.json';
import type {Config} from './config';
export interface Control {key:string;label:string;type:string;min?:number;max?:number;step?:number;help?:string;default:number|string;options?:{value:string;label:string}[]}
export interface GalleryPackage {format:number;id:string;version:string;date:string;source:string;engine:string;engineHash:string;schema:Control[];defaults:Record<string,any>;levels:{rows:any[][]};[key:string]:any}
export interface GalleryEngine {set(o:Record<string,unknown>):void;render(source:HTMLCanvasElement,o?:{time:number;force?:boolean}):boolean;dispose():void;gl:WebGL2RenderingContext;info:{ms:number};_debug:{state:Record<string,number>}}
type Factory=(canvas:HTMLCanvasElement,options:Record<string,unknown>)=>GalleryEngine;
export type OilSettings=Config['filter']['oil'];
let active:GalleryPackage=bundled as GalleryPackage;
let factory:Factory;
export const galleryPackage=()=>active;
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,'0')).join('');
export async function testGallery(p:GalleryPackage):Promise<Factory>{
 if(p.format!==1||p.source!=='https://nau-filter-gallery.vercel.app/nau-filter/nau-filter.js'||!p.schema?.length||p.schema.length>100||p.engine.length>4e6)throw Error('지원하지 않는 필터 패키지');
 const {id,...data}=p;
 if(await sha(JSON.stringify(data))!==id||await sha(p.engine)!==p.engineHash)throw Error('필터 파일 무결성 확인 실패');
 const url=URL.createObjectURL(new Blob([p.engine],{type:'text/javascript'}));
 let create:Factory;
 try{create=(await import(/* @vite-ignore */ url)).createFilter;}finally{URL.revokeObjectURL(url);}
 const canvas=document.createElement('canvas'),src=document.createElement('canvas');src.width=256;src.height=320;
 const ctx=src.getContext('2d')!;ctx.fillStyle='#7699c5';ctx.fillRect(0,0,256,320);ctx.fillStyle='#fff4df';ctx.fillRect(70,30,120,240);ctx.fillStyle='#171d26';ctx.fillRect(95,90,16,16);ctx.fillRect(150,90,16,16);
 let fx:GalleryEngine|undefined;
 try{
  fx=create(canvas,{filter:'oil2f',short:256,level:50,normal:false,style:'flat',boil:0});
  if(!fx.render(src,{time:0,force:true}))throw Error('필터 시험 렌더 실패');
  const gl=fx.gl,pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  if(gl.getError()!==gl.NO_ERROR)throw Error('필터 GPU 오류');
  let lo=255,hi=0;for(let i=0;i<pixels.length;i+=4){lo=Math.min(lo,pixels[i]);hi=Math.max(hi,pixels[i]);}
  if(hi-lo<20)throw Error('필터가 빈 화면을 출력합니다');
  // The module must accept every downloaded tune path and expose the advertised values.
  fx.set({tune:Object.fromEntries(p.schema.filter(s=>s.key.includes('.')).map(s=>[s.key,s.default]))});
  for(const s of p.schema.filter(s=>s.key.startsWith('OIL.'))){
   let v:any=(fx as any)._debug;for(const key of s.key.split('.'))v=v?.[key];
   if(v!==s.default)throw Error('필터 파라미터 API 변경: '+s.key);
  }
 }finally{fx?.dispose();}
 return create;
}
export function effectiveValues(oil:OilSettings):Record<string,number|string>{
 const vals={...active.defaults},overrides=oil.gallery?.values??{},level=Number(overrides.level??vals.level)/100,style=overrides.style??'flat';
 for(const row of active.levels.rows){
  let [key,lo,mid,hi]=row;const path=key.replace(/^state\./,'');mid??=vals[path];
  if(style==='3d'&&row.length>4){lo=row[4];mid=row[5]??mid;hi=row[6];}
  if(typeof mid==='number')vals[path]=level<=.5?lo*(1-level*2)+mid*level*2:mid*(2-level*2)+hi*(level*2-1);
 }
 return {...vals,...overrides};
}
export function syncGallerySettings(oil:OilSettings){
 const v=effectiveValues(oil);for(const key of ['strength','size','boil','fps','grade'] as const)oil[key]=Number(v[key]);
}
export function resetGallerySettings(oil:OilSettings){oil.gallery={revision:active.id,values:{},history:oil.gallery?.history??{}};syncGallerySettings(oil);}
function migrate(oil:OilSettings){
 const old=oil.gallery;
 if(old?.revision!==active.id){
  const history={...old?.history};
  if(old)history[old.revision]={...old.values};
  else history.legacy={strength:oil.strength,size:oil.size,boil:oil.boil,fps:oil.fps,grade:oil.grade};
  oil.gallery={revision:active.id,values:history[active.id]??{},history};
 }
 // Drop removed keys and clamp saved values to the downloaded schema.
 const values=oil.gallery!.values;
 for(const key of Object.keys(values)){
  const s=active.schema.find(s=>s.key===key),v=values[key];
  if(!s){delete values[key];continue;}
  if(s.type==='number'){if(typeof v!=='number'||!Number.isFinite(v))delete values[key];else values[key]=Math.max(s.min!,Math.min(s.max!,v));}
  else if(!s.options?.some(o=>o.value===v))delete values[key];
 }
 syncGallerySettings(oil);
}
export async function initializeGallery(oil:OilSettings){
 let p:GalleryPackage;
 try{const r=await fetch('./filter/current.json',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);p=await r.json();factory=await testGallery(p);active=p;}
 catch(e){console.warn('[filter] 저장된 필터를 불러올 수 없어 내장 검증판 사용',e);active=bundled as GalleryPackage;factory=await testGallery(active);}
 migrate(oil);
}
export function createGalleryEngine(canvas:HTMLCanvasElement){return factory(canvas,{filter:'oil2f',normal:false,short:256});}
export function engineOptions(oil:OilSettings,short:number){
 const v=effectiveValues(oil),tune=Object.fromEntries(Object.entries(oil.gallery?.values??{}).filter(([k])=>k.includes('.')));
 return {filter:'oil2f',short,normal:false,level:v.level,style:v.style,boil:v.boil,fps:v.fps,grade:v.grade,tune};
}
