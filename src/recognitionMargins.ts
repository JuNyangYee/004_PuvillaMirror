import type {RecognitionOptions} from './recognitionGate';
export type Margins = RecognitionOptions['margins'];
export type MarginHandle = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'|'move';
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
/** Coordinates and margins are in the displayed (possibly mirrored) image. */
export function marginHandle(m:Margins,x:number,y:number,width:number,height:number):MarginHandle|null {
  if(width<=0||height<=0)return null;
  const l=m.left*width,r=(1-m.right)*width,t=m.top*height,b=(1-m.bottom)*height;
  const near=10;
  if(x<l-near||x>r+near||y<t-near||y>b+near)return null;
  const horizontal=Math.abs(x-l)<=near?'w':Math.abs(x-r)<=near?'e':'';
  const vertical=Math.abs(y-t)<=near?'n':Math.abs(y-b)<=near?'s':'';
  return (vertical+horizontal||'move') as MarginHandle;
}
export function dragMargins(start:Margins,handle:MarginHandle,dx:number,dy:number):Margins {
  const m={...start};
  if(handle==='move'){
    const sx=start.left+start.right,sy=start.top+start.bottom;
    m.left=clamp(start.left+dx,Math.max(0,sx-.45),Math.min(.45,sx));m.right=sx-m.left;
    m.top=clamp(start.top+dy,Math.max(0,sy-.45),Math.min(.45,sy));m.bottom=sy-m.top;
  }else{
    if(handle.includes('w'))m.left=clamp(start.left+dx,0,.45);
    if(handle.includes('e'))m.right=clamp(start.right-dx,0,.45);
    if(handle.includes('n'))m.top=clamp(start.top+dy,0,.45);
    if(handle.includes('s'))m.bottom=clamp(start.bottom-dy,0,.45);
  }
  return m;
}
