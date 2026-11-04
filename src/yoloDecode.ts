import {overlap,type PersonBox} from './personSelection';
/** YOLO11 COCO channel-first head; accepts detection (84) and seg (116) exports. */
export function decodePeople(data:Float32Array,dims:readonly number[],width:number,height:number,threshold:number):PersonBox[]{
  const channels=dims[1],n=dims[2];
  if(dims.length!==3||dims[0]!==1||![84,116].includes(channels)||data.length!==channels*n)throw Error('Unsupported YOLO output shape: '+dims.join('x'));
  const scale=Math.min(640/width,640/height),cw=width*scale/640,ch=height*scale/640;
  const ox=(1-cw)/2,oy=(1-ch)/2;
  let max=0;for(let i=0;i<4*n;i++)max=Math.max(max,data[i]);const norm=max>2?1/640:1;
  const boxes:PersonBox[]=[];
  for(let i=0;i<n;i++){
    const score=data[4*n+i];if(!Number.isFinite(score)||score<threshold)continue;
    let person=true;for(let c=5;c<84;c++)if(data[c*n+i]>score){person=false;break;}if(!person)continue;
    const x=(data[i]*norm-data[2*n+i]*norm/2-ox)/cw,y=(data[n+i]*norm-data[3*n+i]*norm/2-oy)/ch;
    const right=Math.min(1,x+data[2*n+i]*norm/cw),bottom=Math.min(1,y+data[3*n+i]*norm/ch);
    const b={x:Math.max(0,x),y:Math.max(0,y),w:right-Math.max(0,x),h:bottom-Math.max(0,y),score};
    if(Object.values(b).every(Number.isFinite)&&b.w>.015&&b.h>.03)boxes.push(b);
  }
  boxes.sort((a,b)=>b.score-a.score);const kept:PersonBox[]=[];
  for(const b of boxes){if(kept.every(k=>overlap(k,b)<.5))kept.push(b);if(kept.length>=20)break;}
  return kept;
}
