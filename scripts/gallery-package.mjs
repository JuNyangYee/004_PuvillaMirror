import {createHash} from 'node:crypto';
export const ENGINE_URL='https://nau-filter-gallery.vercel.app/nau-filter/nau-filter.js';
export const PAGE_URL='https://nau-filter-gallery.vercel.app/';
export const hash=s=>createHash('sha256').update(s).digest('hex');
// Parse data literals only: never evaluate downloaded JavaScript on the server.
export function literal(text, start=0) {
 let i=start;
 const skip=()=>{while(true){const m=/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(text.slice(i));if(!m)break;i+=m[0].length;}};
 function value(){
  skip();const c=text[i++];
  if(c==='{'||c==='['){const arr=c==='[',out=arr?[]:{};skip();while(text[i] !== (arr?']':'}')){
   if(arr)out.push(value());else{skip();let key;if(text[i]==='"'||text[i]==="'")key=value();else{const m=/^[A-Za-z_$][\w$]*/.exec(text.slice(i));if(!m)throw Error('Unsupported literal key');key=m[0];i+=key.length;}
    if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsafe key');skip();if(text[i++]!==':')throw Error('Expected colon');out[key]=value();}
   skip();if(text[i]===','){i++;skip();}else if(text[i] !== (arr?']':'}'))throw Error('Unsupported literal expression');
  }i++;return out;}
  if(c==='"'||c==="'"){let out='';while(i<text.length){const ch=text[i++];if(ch===c)return out;if(ch==='\\'){const e=text[i++];if(e==='u'){out+=String.fromCharCode(parseInt(text.slice(i,i+4),16));i+=4;}else out+=({n:'\n',r:'\r',t:'\t'}[e]??e);}else out+=ch;}throw Error('Unclosed string');}
  i--;const m=/^(?:-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|true\b|false\b|null\b)/i.exec(text.slice(i));if(!m)throw Error('Unsupported expression near '+text.slice(i,i+35));i+=m[0].length;return JSON.parse(m[0].replace(/^(-?)\./,'$10.').replace(/\.(e|$)/i,'$1'));
 }
 return value();
}
function after(text,marker){const i=text.indexOf(marker);if(i<0)throw Error('Upstream structure changed: '+marker);return text.slice(i+marker.length);}
function decl(text,name){return literal(after(text,'const '+name+' ='));}
function member(text,name,key){return literal(after(after(text,'const '+name+' ='),key+':'));}
export function buildPackage(engine,page){
 if(engine.length>4e6||page.length>4e6||!engine.includes('export function createFilter('))throw Error('Invalid gallery module');
 const preset=member(engine,'PRESETS','oil2f'),webPreset=member(page,'PRESETS','oil2f');
 if(JSON.stringify(preset)!==JSON.stringify(webPreset))throw Error('Gallery page/module versions disagree; retry later');
 const base=decl(page,'CTRL_BASE'),ctrl=member(page,'CTRL','oil2f');
 const slider=decl(engine,'SLIDER_DEF');
 const perText=after(engine,'const PER_DEF =');
 // PER_DEF spreads the slider defaults; only that known spread is allowed.
 const per=literal(perText.replace('...SLIDER_DEF,',''));
 const defaults={...slider,...per,...Object.fromEntries(Object.entries(preset).filter(([,v])=>typeof v==='number')),...preset.tune};
 const oil=decl(engine,'OIL'),grade=decl(engine,'GRADE');
 const tuneRows=member(page,'TUNE_ROWS','oil').filter(r=>!r[6]||r[6].split('|').includes('oil2f'));
 tuneRows.push(decl(page,'GRADE_ROW'));
 const schema=[];
 for(const [key,row] of Object.entries(base)){
  const spec=key in ctrl?ctrl[key]:['flat','level'].includes(key)?null:[];
  if(spec===null)continue;
  if(!['level','boil','fps','grade'].includes(key)){if(key==='moodK')continue;throw Error('New base control requires adapter: '+key);}
  const [label,min,max,step]=row.map((v,i)=>spec[i]??v);
  schema.push({key,label,type:'number',min,max,step,default:defaults[key]});
 }
 for(const [key,label,min,max,step,help] of tuneRows){
  const [group,...path]=key.split('.');let d={OIL:oil,GRADE:grade}[group];
  for(const p of path)d=d?.[p];d=defaults[key]??d;
  if(typeof d!=='number')throw Error('No numeric default for '+key);
  schema.push({key,label,type:'number',min,max,step,help,default:d});defaults[key]=d;
 }
 for(const key of Object.keys(preset.tune))if(!schema.some(s=>s.key===key))throw Error('Preset parameter missing UI schema: '+key);
 for(const s of schema)if(![s.min,s.max,s.step,s.default].every(Number.isFinite)||s.min>=s.max||s.step<=0||s.default<s.min||s.default>s.max)throw Error('Invalid parameter '+s.key);
 const levels=member(engine,'LEVELS','oil2f');
 if(JSON.stringify(levels)!==JSON.stringify(member(page,'LEVELS','oil2f')))throw Error('Level curves disagree');
 const styleSelect=/<select id="style">([\s\S]*?)<\/select>/.exec(page)?.[1];
 const options=[...String(styleSelect).matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m=>({value:m[1],label:m[2]}));
 if(options.length!==2||options[0].value!=='flat'||options[1].value!=='3d')throw Error('Style API changed');
 schema.unshift({key:'style',label:'소스 그림체',type:'enum',options,default:'flat'});defaults.style='flat';
 const version=/갤러리 ([a-f0-9]+) (\d{4}-\d{2}-\d{2})/.exec(engine.slice(0,600));
 const data={format:1,source:ENGINE_URL,pageSource:PAGE_URL,version:version?.[1]??'unknown',date:version?.[2]??'',engineHash:hash(engine),pageHash:hash(page),schema,defaults,levels,engine};
 return {...data,id:hash(JSON.stringify(data))};
}
export async function download(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!r.ok)throw Error('Upstream HTTP '+r.status);
 const parts=[];let size=0;
 for await(const chunk of r.body){size+=chunk.length;if(size>4e6)throw Error('Upstream file too large');parts.push(chunk);}
 return Buffer.concat(parts).toString('utf8');
}
export async function latestPackage(){const [e,p]=await Promise.all([download(ENGINE_URL),download(PAGE_URL)]);return buildPackage(e,p);}
