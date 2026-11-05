import type {PersonBox} from './personSelection';
import type {TrackResult} from './tracker';
import {PresenceConfirmation} from './presenceConfirmation';

export interface RecognitionOptions {
  confirmMs:number;
  margins:{left:number;right:number;top:number;bottom:number};
  prepareArea:number;
  activeArea:number;
  faceHeight:number;
  prepareLookDeg:number;
}
export const DEFAULT_RECOGNITION:RecognitionOptions={confirmMs:350,
  margins:{left:.05,right:.05,top:.02,bottom:.02},prepareArea:.02,activeArea:.08,faceHeight:.06,prepareLookDeg:18};
export type RecognitionStage=0|1|2;
export interface RecognitionStatus {stage:RecognitionStage;personArea:number;faceHeight:number;reason:string}
export function pointInRecognitionRange(x:number,y:number,cfg:RecognitionOptions,mirror:boolean):boolean {
  const m=cfg.margins,px=mirror?1-x:x;
  return px>=m.left&&px<=1-m.right&&y>=m.top&&y<=1-m.bottom;
}
export function personInRecognitionRange(b:PersonBox,cfg:RecognitionOptions,mirror:boolean):boolean {
  // Use body box center, allowing extended arms to cross the margins.
  return b.w*b.h>=cfg.prepareArea&&pointInRecognitionRange(b.x+b.w/2,b.y+b.h/2,cfg,mirror);
}
/** Range/size readiness is separate from YOLO ownership and fresh face confirmation. */
export class RecognitionGate {
  readonly confirmation=new PresenceConfirmation();
  status:RecognitionStatus={stage:0,personArea:0,faceHeight:0,reason:'사람 대기'};
  constructor(private cfg:RecognitionOptions,private presence:{faceLostHoldMs:number}){}
  reset():void {this.confirmation.reset();this.status={stage:0,personArea:0,faceHeight:0,reason:'사람 대기'};}
  update(person:PersonBox|null,track:TrackResult,now:number,aspect:number,mirror:boolean,usePerson=true):RecognitionStatus {
    const face=track.faces.length===1?track.faces[0]:null;
    const faceHeight=face?face.bbox.h/Math.min(1,Math.max(.01,aspect)):0;
    const personArea=person?person.w*person.h:0;
    const hasCandidate=usePerson?!!person&&personInRecognitionRange(person,this.cfg,mirror):!!face||this.status.stage===2;
    if(!hasCandidate){this.reset();return this.status;}
    const retain=this.status.stage===2?.85:1;
    const largeEnough=!usePerson||personArea>=Math.max(this.cfg.prepareArea,this.cfg.activeArea)*retain;
    const faceInside=!!face&&pointInRecognitionRange(face.bbox.cx,face.bbox.cy,this.cfg,mirror);
    const faceLarge=faceHeight>=this.cfg.faceHeight*retain;
    // A visible face that is too small/outside leaves mimic; an absent face gets the normal short grace period.
    if(!largeEnough||face&&(!faceInside||!faceLarge))this.confirmation.reset();
    const accepted=this.confirmation.update(largeEnough&&faceInside&&faceLarge,track.observedAtMs,now,this.cfg.confirmMs,this.presence.faceLostHoldMs);
    const stage:RecognitionStage=largeEnough&&accepted?2:1;
    this.status={stage,personArea,faceHeight,reason:stage===2?'인식됨':!largeEnough?'사람 크기 확인 중':!face?'얼굴 대기':!faceInside?'얼굴이 허용 범위 밖':!faceLarge?'얼굴 크기 확인 중':'얼굴 연속 확인 중'};
    return this.status;
  }
}
