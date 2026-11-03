import * as THREE from 'three';
import {assetUrl} from './embedded';
import {portraitViewport} from './presentation';

export type BgStyle='orange'|'winter';
export const BG_STYLES:BgStyle[]=['orange','winter'];
const KEY='pubilla-mimic-bg';
/** User-supplied winter scene, cropped to fill the same portrait stage as the renderer. */
export class Backdrop{
  readonly canvas=document.createElement('canvas');
  private tex:THREE.CanvasTexture|null=null;
  private image:HTMLImageElement|null=null;
  private worldTex:THREE.Texture|null=null;
  private worldRendered=false;
  get worldTexture(){return this.usesImage?this.worldTex:null;}
  get imageAspect(){return this.image?this.image.naturalWidth/this.image.naturalHeight:16/9;}
  setWorldRendered(on:boolean){this.worldRendered=on;this.canvas.style.display=on?"none":this.usesImage&&this.drawn?"block":"none";}
  private loading:Promise<void>|null=null;
  private drawn=false;
  style:BgStyle='winter';
  onChange:(()=>void)|null=null;
  constructor(private grad:{top:string;bottom:string}){
    this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none;z-index:0';
    const app=document.getElementById('app')!;app.parentElement!.insertBefore(this.canvas,app);
    try{const saved=localStorage.getItem(KEY);if(saved==='orange'||saved==='winter')this.style=saved;}catch{}
    addEventListener('resize',()=>this.draw());
    void this.set(this.style,false);
  }
  get usesImage(){return this.style==='winter';}
  get texture():THREE.Texture|null{return !this.worldRendered&&this.usesImage&&this.drawn?this.tex:null;}
  // The reference image already contains its trees; no extra foreground branches.
  frontTexture():THREE.Texture|null{return null;}
  setFrontBaked(_on:boolean):void{}
  async set(style:BgStyle,save=true):Promise<void>{
    this.style=style;
    if(save)try{localStorage.setItem(KEY,style);}catch{}
    if(this.usesImage)await this.load();
    if(this.style===style)this.draw();
  }
  private load():Promise<void>{
    this.loading??=new Promise<void>(resolve=>{
      const image=new Image();image.decoding='async';
      image.onload=()=>{this.image=image;this.worldTex=new THREE.Texture(image);this.worldTex.colorSpace=THREE.SRGBColorSpace;this.worldTex.needsUpdate=true;resolve();};
      image.onerror=()=>{console.warn('[backdrop] Winter image could not be loaded');this.loading=null;resolve();};
      image.src=assetUrl('./bg/winter-village-reference.png');
    });
    return this.loading;
  }
  draw():void{
    if(this.worldRendered){this.canvas.style.display="none";this.onChange?.();return;}
    if(this.usesImage&&this.image){
      const {width:W,height:H}=portraitViewport(innerWidth,innerHeight);
      if(!W||!H)return;
      const pr=Math.min(devicePixelRatio||1,2),cw=Math.round(W*pr),ch=Math.round(H*pr);
      if(this.canvas.width!==cw||this.canvas.height!==ch||!this.tex){
        this.canvas.width=cw;this.canvas.height=ch;this.tex?.dispose();
        this.tex=new THREE.CanvasTexture(this.canvas);this.tex.minFilter=THREE.LinearFilter;this.tex.generateMipmaps=false;
      }
      const g=this.canvas.getContext('2d')!,im=this.image;
      const scale=Math.max(cw/im.naturalWidth,ch/im.naturalHeight);
      const width=im.naturalWidth*scale,height=im.naturalHeight*scale;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cw,ch);
      g.drawImage(im,(cw-width)/2,(ch-height)/2,width,height);
      this.tex.needsUpdate=true;this.drawn=true;
    }
    this.canvas.style.display=!this.worldRendered&&this.usesImage&&this.drawn?'block':'none';
    this.onChange?.();
  }
  next():BgStyle{const next=this.usesImage?'orange':'winter';void this.set(next);return next;}
  get gradient(){return this.grad;}
}
