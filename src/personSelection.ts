/** Camera-normalized boxes, before preview mirroring. No image data is retained. */
export interface PersonBox { x:number; y:number; w:number; h:number; score:number }
export interface PersonOptions {
  enabled:boolean; confidence:number; intervalMs:number; padding:number;
  switchRatio:number; switchHoldMs:number; lostHoldMs:number;
}
export const DEFAULT_PERSON:PersonOptions={enabled:true,confidence:.4,intervalMs:100,padding:.2,
  switchRatio:1.1,switchHoldMs:800,lostHoldMs:500};
export function overlap(a:PersonBox,b:PersonBox):number {
  const w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
  const h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  return w*h/Math.max(1e-8,a.w*a.h+b.w*b.h-w*h);
}
export function expandedBox(b:PersonBox,padding:number):PersonBox {
  const x=Math.max(0,b.x-b.w*padding),y=Math.max(0,b.y-b.h*padding);
  return {...b,x,y,w:Math.min(1,b.x+b.w*(1+padding))-x,h:Math.min(1,b.y+b.h*(1+padding))-y};
}
// A pending computation may delay evidence, but never keep a visitor indefinitely.
export const PERSON_RESULT_MAX_AGE_MS=1000;
const OWNER_MEMORY_MS=2000;
export class PersonSelection {
  selected:PersonBox|null=null;
  roi:PersonBox|null=null;
  candidates:PersonBox[]=[];
  revision=0;
  private seen=-Infinity;
  private owner:PersonBox|null=null;
  private ownerSeen=-Infinity;
  private matched=false;
  private pending:PersonBox|null=null;
  private pendingAt=0;
  private updated=-Infinity;
  private lastDetection=-Infinity;
  get challenger():PersonBox|null {return this.pending;}
  switchProgress(now:number):number {return this.pending?Math.min(1,Math.max(0,(now-this.pendingAt)/Math.max(1,this.cfg.switchHoldMs))):0;}
  constructor(private cfg:PersonOptions){}
  reset():void {this.selected=this.roi=this.pending=null;this.candidates=[];this.seen=this.lastDetection=this.updated=this.ownerSeen=-Infinity;this.owner=null;this.matched=false;this.revision++;}
  expire(now:number,pendingAt=-Infinity):void {
    const waiting=this.matched&&Number.isFinite(pendingAt)&&pendingAt>=this.seen&&
      pendingAt<=this.seen+this.cfg.lostHoldMs&&now-pendingAt<=PERSON_RESULT_MAX_AGE_MS;
    // Losing visibility is not a new identity. Keep the graph warm for a brief
    // same-person return; confirmed input and recognition still stop immediately.
    if(this.selected && now-this.seen>=this.cfg.lostHoldMs&&!waiting){this.selected=this.roi=null;}
    if(now-this.lastDetection>Math.max(350,this.cfg.intervalMs*3)){this.pending=null;this.candidates=[];}
  }
  update(boxes:PersonBox[],now:number,eligible:(b:PersonBox)=>boolean=()=>true,receivedAt=now):void {
    if(!Number.isFinite(now)||now<=this.lastDetection)return;
    this.expire(receivedAt,now);this.lastDetection=now;
    this.candidates=boxes.filter(b=>[b.x,b.y,b.w,b.h,b.score].every(Number.isFinite)&&b.w>0&&b.h>0&&b.score>=this.cfg.confidence);
    const valid=this.candidates.filter(eligible);
    const rank=(b:PersonBox)=>b.w*b.h;
    const best=valid.reduce<PersonBox|null>((a,b)=>!a||rank(b)>rank(a)?b:a,null);
    const old=this.selected;
    const matches=old?valid.map(b=>({b,i:overlap(old,b)})).filter(v=>v.i>.15).sort((a,b)=>b.i-a.i):[];
    const current=matches[0]?.b??null;
    let chosen:PersonBox|null=current;
    if(!old&&!this.pending)chosen=best;
    else if(best&&best!==current&&(!current||rank(best)>rank(current)*this.cfg.switchRatio)){
      if(!this.pending||overlap(this.pending,best)<.3)this.pendingAt=now;
      this.pending=best;
      if(now-this.pendingAt>=this.cfg.switchHoldMs)chosen=best;
    }else this.pending=null;
    this.matched=!!current;
    if(!chosen){this.expire(receivedAt);return;}
    if(!old||chosen!==current){
      const returning=!old&&this.owner&&receivedAt-this.ownerSeen<=OWNER_MEMORY_MS&&overlap(this.owner,chosen)>.15;
      if(!returning)this.revision++;
      this.roi=null;this.pending=null;
    }
    this.selected=chosen;this.seen=receivedAt;this.matched=true;
    this.owner=chosen;this.ownerSeen=receivedAt;
    const next=expandedBox(chosen,this.cfg.padding),prev=this.roi;
    if(prev){
      // Expansion is immediate so a newly extended arm is never delayed by smoothing.
      // Only contraction eases, retaining some room for motion between detections.
      const k=1-Math.exp(-Math.min(1,(now-this.updated)/1000)*4);
      const left=Math.min(next.x,prev.x+(next.x-prev.x)*k);
      const top=Math.min(next.y,prev.y+(next.y-prev.y)*k);
      const right=Math.max(next.x+next.w,prev.x+prev.w+(next.x+next.w-prev.x-prev.w)*k);
      const bottom=Math.max(next.y+next.h,prev.y+prev.h+(next.y+next.h-prev.y-prev.h)*k);
      this.roi={...next,x:left,y:top,w:right-left,h:bottom-top};
    }else this.roi=next;
    this.updated=now;
  }
}
/** Head output must belong to the selected person's upper body, not a box-edge bystander. */
export function faceInPerson(f:{bbox:{cx:number;cy:number}},b:PersonBox):boolean {
  return f.bbox.cx>=b.x&&f.bbox.cx<=b.x+b.w&&f.bbox.cy>=b.y&&f.bbox.cy<=b.y+b.h*.65;
}
