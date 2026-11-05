import assert from 'node:assert/strict';
import {marginHandle,dragMargins} from '../src/recognitionMargins.ts';
const m={left:.1,right:.2,top:.1,bottom:.2};
assert.equal(marginHandle(m,40,30,400,300),'nw');
assert.equal(marginHandle(m,320,150,400,300),'e');
assert.equal(marginHandle(m,150,150,400,300),'move');
assert.equal(marginHandle(m,0,150,400,300),null);
assert.equal(marginHandle(m,0,0,0,0),null);
assert.deepEqual(dragMargins(m,'nw',.1,.2),{left:.2,right:.2,top:.30000000000000004,bottom:.2});
assert.deepEqual(dragMargins(m,'se',.1,.1),{left:.1,right:.1,top:.1,bottom:.1});
for(const handle of ['n','s','e','w','ne','nw','se','sw','move'])for(const d of [-10,10]){
  const next=dragMargins(m,handle,d,d);
  for(const v of Object.values(next))assert.ok(v>=0&&v<=.45);
  assert.ok(1-next.left-next.right>=.0999999&&1-next.top-next.bottom>=.0999999,'never collapses');
  if(handle==='move'){
    assert.ok(Math.abs(next.left+next.right-m.left-m.right)<1e-10,'move preserves width');
    assert.ok(Math.abs(next.top+next.bottom-m.top-m.bottom)<1e-10,'move preserves height');
  }
}
assert.deepEqual(m,{left:.1,right:.2,top:.1,bottom:.2},'drag snapshot is immutable');
console.log('PASS: margin handles, edge and corner resize, bounded move, minimum range');
