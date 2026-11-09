import {createHash} from 'node:crypto';
export const ENGINE_URL='https://nau-filter-gallery.vercel.app/nau-filter/nau-filter.js';
export const PAGE_URL='https://nau-filter-gallery.vercel.app/';
export const SHOW_URL='https://nau-filter-gallery.vercel.app/show/';
export const ITEMS_URL=new URL('items.json',SHOW_URL).href;
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
export function buildShowPackage(engine,page,show,itemsText){
 const base=buildPackage(engine,page),{id:oldId,...data}=base;
 if(show.length>4e6||itemsText.length>4e6)throw Error('Show data too large');
 const modulePath=/import\s*\{[^}]*createFilter[^}]*\}\s*from\s*["']([^"']+)["']/.exec(show)?.[1];
 if(!modulePath||new URL(modulePath,SHOW_URL).href!==ENGINE_URL)throw Error('Show engine path changed');
 const versions=decl(show,'VERSIONS'),lookDef=decl(show,'LOOK_DEF'),items=JSON.parse(itemsText).items;
 if(!Array.isArray(versions)||!versions.length||versions.length>20||!Array.isArray(items)||!items.length)throw Error('Invalid show catalog');
 const ids=new Set();
 for(const v of versions){
  if(typeof v.id!=='string'||ids.has(v.id)||typeof v.name!=='string')throw Error('Invalid show version');ids.add(v.id);
  for(const k of Object.keys(v))if(!['id','name','about','tune','boil'].includes(k))throw Error('New show version option: '+k);
  for(const [key,value] of Object.entries({...v.tune,...(v.boil===undefined?{}:{boil:v.boil})})){
   const spec=data.schema.find(s=>s.key===key);
   if(!spec||spec.type!=='number'||!Number.isFinite(value)||value<spec.min||value>spec.max)throw Error('Unsupported show parameter: '+key);
  }
 }
 const version=/v:\s*String\(pick\("v",\s*"([^"\n]+)"/.exec(show)?.[1];
 if(!ids.has(version))throw Error('Show default version changed');
 // The unparameterized /show/ route opens the first playable entry, 3D before flat.
 const first=items.flatMap(it=>it.vers?['3d','flat'].filter(k=>it.vers[k]?.src).map(k=>({...it,...it.vers[k],style:k==='3d'?'3d':it.vers[k].style??it.style})):it.src||it.live?[it]:[])[0];
 if(!first)throw Error('No playable show entry');
 const look={...lookDef,...first.look};
 if(look.filter!=='A'||look.normal===true||look.fine!=null)throw Error('Unsupported show look');
 for(const k of Object.keys(look))if(!['filter','level','fps','fine','grain','normal'].includes(k))throw Error('New show look option: '+k);
 const grainMatch=/seg\("grains",\s*(\[[^\]]+\])\.map/.exec(show);
 const grains=grainMatch?literal(grainMatch[1]):null;
 if(!grains?.length||!grains.every(n=>typeof n==='number'&&n>0&&n<=4)||!grains.includes(look.grain))throw Error('Show grain choices changed');
 Object.assign(data.defaults,{style:first.style||'flat',level:look.level,fps:look.fps||data.defaults.fps,grain:String(look.grain),showVersion:version});
 if(!['3d','flat'].includes(data.defaults.style))throw Error('Show style changed');
 for(const spec of data.schema){spec.default=data.defaults[spec.key];if(spec.type==='number'&&(!Number.isFinite(spec.default)||spec.default<spec.min||spec.default>spec.max))throw Error('Show default out of range: '+spec.key);}
 data.schema.unshift({key:'showVersion',label:'쇼 유화 버전',type:'enum',default:version,options:versions.map(v=>({value:v.id,label:v.id+' · '+v.name})),help:versions.map(v=>v.id+': '+(v.about||v.name)).join('\n')});
 data.schema.push({key:'grain',label:'결 크기',type:'enum',default:String(look.grain),options:grains.map(n=>({value:String(n),label:'×'+n}))});
 Object.assign(data,{pageSource:SHOW_URL,schemaSource:PAGE_URL,pageHash:hash(show),schemaHash:hash(page),itemsSource:ITEMS_URL,itemsHash:hash(itemsText),show:{versions,defaultVersion:version,itemTitle:first.title,look,style:data.defaults.style}});
 return {...data,id:hash(JSON.stringify(data))};
}
export async function latestPackage(){
 const [e,p,s,i]=await Promise.all([download(ENGINE_URL),download(PAGE_URL),download(SHOW_URL),download(ITEMS_URL)]);
 return buildShowPackage(e,p,s,i);
}
