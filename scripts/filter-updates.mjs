import {readFile,mkdir,writeFile,rename,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {latestPackage} from './gallery-package.mjs';
export function filterUpdates(site,fetchPackage=latestPackage){
 const dir=resolve(site,'filter'),current=resolve(dir,'current.json'),history=resolve(dir,'history');
 let candidate=null,busy=false;
 const read=async file=>JSON.parse(await readFile(file,'utf8'));
 const atomic=async(file,data)=>{await mkdir(dir,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(data));await rename(tmp,file);};
 const summary=p=>({id:p.id,version:p.version,date:p.date,schema:p.schema});
 async function versions(){try{return (await readdir(history)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>n.slice(0,-5));}catch{return [];}}
 return async(req,res,next=()=>{res.statusCode=404;res.end();})=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!path.startsWith('/__mimic/filter-update'))return next();
  res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');
  // Only local operator requests may download/replace executable filter code.
  const host=req.headers.host||'';
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)|| (req.headers.origin&&req.headers.origin!=='http://'+host)){
   res.statusCode=403;res.end(JSON.stringify({error:'Local same-origin requests only'}));return;
  }
  if(busy){res.statusCode=409;res.end(JSON.stringify({error:'Update in progress'}));return;}
  busy=true;
  try{
   let result;
   if(req.method==='GET'&&path.endsWith('/status'))result={active:summary(await read(current)),history:await versions()};
   else if(req.method==='POST'){
    if(req.headers.origin!=='http://'+host)throw Error('Same-origin required');
    let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('Request too large');body+=chunk;}
    const input=JSON.parse(body||'{}');
    if(path.endsWith('/check')){
     candidate=null;candidate=await fetchPackage();result={same:candidate.id===(await read(current)).id,candidate};
    }else if(path.endsWith('/apply')||path.endsWith('/rollback')){
     const rollback=path.endsWith('/rollback');
     if(!/^[a-f0-9]{64}$/.test(input.id))throw Error('Invalid version');
     const target=rollback?await read(resolve(history,input.id+'.json')):candidate;
     if(!target||target.id!==input.id||input.tested!==true)throw Error('Test this candidate first');
     const old=await read(current);await mkdir(history,{recursive:true});
     await writeFile(resolve(history,old.id+'.json'),JSON.stringify(old),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
     await atomic(current,target);candidate=null;result={active:summary(target)};
    }else if(path.endsWith('/candidate')){
     if(!/^[a-f0-9]{64}$/.test(input.id))throw Error('Invalid version');
     result={candidate:await read(resolve(history,input.id+'.json'))};
    }else throw Error('Unknown operation');
   }else throw Error('Unsupported method');
   res.end(JSON.stringify(result));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}finally{busy=false;}
 };
}
export default function filterUpdatePlugin(){
 let root;
 return {name:'mimic-filter-updates',configResolved:c=>{root=c.root;},configureServer:server=>{server.middlewares.use(filterUpdates(resolve(root,'public')));},configurePreviewServer:server=>{server.middlewares.use(filterUpdates(resolve(root,'dist')));}};
}
