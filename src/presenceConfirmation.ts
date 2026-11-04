/** Fresh observations only. Held/cached faces can sustain a session, never acquire it. */
export class PresenceConfirmation {
  private start=-Infinity;private last=-Infinity;private observation=-Infinity;private count=0;
  private accepted=false;
  reset():void {this.start=this.last=this.observation=-Infinity;this.count=0;this.accepted=false;}
  update(valid:boolean,observedAt:number|undefined,now:number,holdMs:number,lostMs:number):boolean {
    if(now-this.last>=lostMs){this.accepted=false;this.count=0;this.start=-Infinity;}
    if(observedAt!==undefined&&Number.isFinite(observedAt)&&observedAt>this.observation&&observedAt<=now&&now-observedAt<500){
      this.observation=observedAt;
      if(valid){
        if(this.count===0||now-this.last>350){this.start=observedAt;this.count=0;}
        this.last=observedAt;this.count++;
        if(this.count>=3&&observedAt-this.start>=holdMs)this.accepted=true;
      }else if(!this.accepted){this.start=-Infinity;this.count=0;}
    }
    return this.accepted;
  }
}
