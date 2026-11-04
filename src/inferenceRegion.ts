import type { PersonBox } from './personSelection';
import type { RawFace } from './tracker';
import type { RawPose } from './poseTracker';
export type InferenceRegion={x:number;y:number;w:number;h:number;aspect:number};
export function regionFor(b:PersonBox,width:number,height:number):InferenceRegion {
  const x=Math.floor(b.x*width),y=Math.floor(b.y*height);
  const right=Math.min(width,Math.ceil((b.x+b.w)*width-1e-8)),bottom=Math.min(height,Math.ceil((b.y+b.h)*height-1e-8));
  return {x:x/width,y:y/height,w:(right-x)/width,h:(bottom-y)/height,aspect:width/height};
}
export function remapFace(f:RawFace,r:InferenceRegion):RawFace {
  const b=f.bbox;return {...f,bbox:{x:r.x+b.x*r.w,y:r.y+b.y*r.h,w:b.w*r.w,h:b.h*r.h,cx:r.x+b.cx*r.w,cy:r.y+b.cy*r.h},
    landmarks:f.landmarks?.map(p=>({x:r.x+p.x*r.w,y:r.y+p.y*r.h,z:p.z*r.w}))};
}
export function remapPose(p:RawPose,r:InferenceRegion):RawPose {
  const image=p.image?.map(v=>({...v,x:r.x+v.x*r.w,y:r.y+v.y*r.h}));
  return {...p,image,imageAspect:r.aspect,nose:{x:r.x+p.nose.x*r.w,y:r.y+p.nose.y*r.h},
    shoulderW:image?Math.hypot(image[11].x-image[12].x,image[11].y-image[12].y):p.shoulderW*r.w};
}
export class PersonCrop {
  readonly canvas=document.createElement('canvas');
  private time=-1;
  region:InferenceRegion|null=null;
  reset():void {this.time=-1;this.region=null;}
  update(source:HTMLCanvasElement,b:PersonBox,time:number):HTMLCanvasElement {
    if(time===this.time&&this.region)return this.canvas;
    this.time=time;const r=regionFor(b,source.width,source.height);this.region=r;
    const sw=Math.round(r.w*source.width),sh=Math.round(r.h*source.height),scale=Math.min(1,960/Math.max(sw,sh));
    const w=Math.max(2,Math.round(sw*scale)),h=Math.max(2,Math.round(sh*scale));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.canvas.getContext('2d')!.drawImage(source,Math.round(r.x*source.width),Math.round(r.y*source.height),sw,sh,0,0,w,h);
    return this.canvas;
  }
}
