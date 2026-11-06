import {readFile} from 'node:fs/promises';
import {latestPackage,hash} from './gallery-package.mjs';
const remote=await latestPackage();
const current=JSON.parse(await readFile('public/filter/current.json','utf8'));
const bundled=JSON.parse(await readFile('src/vendor/gallery-bundle.json','utf8'));
for(const p of [remote,current,bundled]){
 const {id,...data}=p;
 if(hash(JSON.stringify(data))!==id||hash(p.engine)!==p.engineHash)throw Error('Invalid package hash: '+p.version);
}
const previous=new Map(current.schema.map(s=>[s.key,s]));
console.log(JSON.stringify({
 latest:{version:remote.version,date:remote.date,id:remote.id,controls:remote.schema.length},
 current:{version:current.version,matchesLatest:current.id===remote.id},
 bundled:{version:bundled.version,matchesLatest:bundled.id===remote.id},
 added:remote.schema.filter(s=>!previous.has(s.key)),
 changed:remote.schema.filter(s=>previous.has(s.key)&&JSON.stringify(s)!==JSON.stringify(previous.get(s.key))),
 removed:current.schema.filter(s=>!remote.schema.some(n=>n.key===s.key)),
},null,2));
