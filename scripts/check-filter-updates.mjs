import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {buildPackage,buildShowPackage,literal,hash} from './gallery-package.mjs';
import {filterUpdates} from './filter-updates.mjs';
const pack=JSON.parse(await readFile('scripts/fixtures/gallery-b1325c7.json','utf8'));
const page=await readFile('scripts/fixtures/gallery-controls.html','utf8');
const baseline=buildPackage(pack.engine,page);
assert.equal(baseline.schema.length,16);
assert.equal(baseline.defaults.fps,15);assert.equal(baseline.defaults['OIL.refineT'],.1);
assert.throws(()=>literal('{a:process.exit()}'));
assert.throws(()=>literal('{__proto__:1}'));
assert.throws(()=>buildPackage('<html/>',page));
assert.throws(()=>buildPackage(pack.engine.replace('strength:0.29','strength:0.3'),page),/disagree/);
const changedPage=page.replace('"눈·코 테 정리",0,1,0.05','"눈·코 테 정리",0,2,0.01');
const rangeChange=buildPackage(pack.engine,changedPage);
assert.equal(rangeChange.schema.find(s=>s.key==='OIL.eye').max,2);
assert.equal(rangeChange.schema.find(s=>s.key==='OIL.eye').step,.01);
const added=buildPackage(pack.engine.replace('eye: 0 };','eye: 0, extra: .25 };'),page.replace('oil:[','oil:[["OIL.extra","새 조절",0,1,0.01,"설명"],'));
assert.equal(added.schema.find(s=>s.key==='OIL.extra').default,.25);
// Real historical releases must remain testable after operators update current.json.
const newer=JSON.parse(await readFile('scripts/fixtures/gallery-7f58eaa.json','utf8'));
const newerPage=await readFile('scripts/fixtures/gallery-controls-7f58eaa.html','utf8');
const rebuilt=buildPackage(newer.engine,newerPage);
assert.equal(rebuilt.schema.length,20);
assert.deepEqual(rebuilt.schema,newer.schema);
assert.deepEqual(rebuilt.defaults,newer.defaults);
for(const [key,value] of Object.entries({edge:1,spill:1,slope:1,halo:0})){
 const s=rebuilt.schema.find(s=>s.key==='OIL.'+key);
 assert.deepEqual([s.min,s.max,s.step,s.default],[0,1,.05,value]);
}
for(const p of [pack,newer,JSON.parse(await readFile('public/filter/current.json','utf8')),JSON.parse(await readFile('src/vendor/gallery-bundle.json','utf8'))]){
 const {id,...data}=p;assert.equal(hash(JSON.stringify(data)),id);
 assert.equal(hash(p.engine),p.engineHash);
}

const showPack=JSON.parse(await readFile('scripts/fixtures/gallery-show-bba7e36.json','utf8'));
const showPage=await readFile('scripts/fixtures/show-1109.html','utf8');
const showItems=await readFile('scripts/fixtures/show-items-1109.json','utf8');
const showControls=await readFile('scripts/fixtures/gallery-controls-bba7e36.html','utf8');
const fromShow=buildShowPackage(showPack.engine,showControls,showPage,showItems);
assert.equal(fromShow.pageSource,'https://nau-filter-gallery.vercel.app/show/');
assert.deepEqual(fromShow.schema,showPack.schema);assert.deepEqual(fromShow.defaults,showPack.defaults);
assert.equal(fromShow.schema.length,28);
assert.deepEqual([fromShow.defaults.style,fromShow.defaults.level,fromShow.defaults.fps,fromShow.defaults.grain,fromShow.defaults.showVersion],['3d',50,20,'0.7','1']);
assert.deepEqual(fromShow.show.versions.map(v=>v.id),['1','2','3']);
assert.equal(fromShow.show.versions[1].boil,0);assert.equal(fromShow.show.versions[2].tune['OIL.layerH'],.05);
const changedShow=buildShowPackage(showPack.engine,showControls,showPage.replace('"OIL.layerH": 0.05','"OIL.layerH": 0.08'),showItems);
assert.notEqual(changedShow.id,fromShow.id);assert.equal(changedShow.show.versions[2].tune['OIL.layerH'],.08);
const changedItems=JSON.parse(showItems);changedItems.items[0].look.fps=24;
assert.equal(buildShowPackage(showPack.engine,showControls,showPage,JSON.stringify(changedItems)).defaults.fps,24);
assert.throws(()=>buildShowPackage(showPack.engine,showControls,showPage.replace('"OIL.layerH": 0.05','"OIL.missing": 0.05'),showItems),/Unsupported show parameter/);
assert.throws(()=>buildShowPackage(showPack.engine,showControls,showPage.replace('../nau-filter/nau-filter.js','https://evil.example/module.js'),showItems),/engine path/);
assert.throws(()=>buildShowPackage(showPack.engine,showControls,showPage.replace('"OIL.layerH": 0.05','"OIL.layerH": process.exit()'),showItems));

const tmp=await mkdtemp(join(tmpdir(),'mimic-filter-'));
let incoming=showPack;
await mkdir(join(tmp,'filter'));await writeFile(join(tmp,'filter/current.json'),JSON.stringify(pack));
const middleware=filterUpdates(tmp,async()=>{if(incoming instanceof Error)throw incoming;return incoming;});
const server=createServer(middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
async function request(path,body,origin=url){const r=await fetch(url+'/__mimic/filter-update/'+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
try{
 assert.equal((await request('check',{},'https://evil.example')).status,403);
 assert.equal((await request('apply',{id:pack.id,tested:true})).status,400);
 const check=await request('check',{});assert.equal(check.data.same,false);assert.equal(check.data.candidate.pageSource,fromShow.pageSource);
 assert.equal((await request('apply',{id:showPack.id})).status,400);
 assert.equal((await request('apply',{id:showPack.id,tested:true})).status,200);
 let saved=JSON.parse(await readFile(join(tmp,'filter/current.json')));assert.equal(saved.id,showPack.id);
 assert.ok((await request('status')).data.history.includes(pack.id));
 incoming=Error('offline');assert.equal((await request('check',{})).status,400);
 saved=JSON.parse(await readFile(join(tmp,'filter/current.json')));assert.equal(saved.id,showPack.id);
 assert.equal((await request('candidate',{id:'../config'})).status,400);
 assert.equal((await request('rollback',{id:pack.id,tested:true})).status,200);
 assert.equal(JSON.parse(await readFile(join(tmp,'filter/current.json'))).id,pack.id);
}finally{await new Promise(r=>server.close(r));await rm(tmp,{recursive:true,force:true});}
console.log('PASS: upstream defaults/schema, new controls/ranges, mismatched versions, untrusted literals, local-origin restriction, apply/history/offline/rollback');
