"""Blender numerical oracle for the runtime corrective smoother; never saves source."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
o=bpy.data.objects['pu_body']
for m in o.modifiers:
    m.show_viewport=m.type=='CORRECTIVE_SMOOTH'
order=list(dict.fromkeys(i for f in o.data.polygons for i in f.vertices))
def xyz(p): return [p.x,p.z,-p.y]
o.shape_key_add(name='Basis')
k=o.shape_key_add(name='fixture');k.value=1
for i,v in enumerate(o.data.vertices):
    side=1 if v.co.x>=0 else -1
    influence=sum(g.weight for g in v.groups if o.vertex_groups[g.group].name in ['upper_arm.'+('L' if side>0 else 'R'),'forearm.'+('L' if side>0 else 'R'),'hand.'+('L' if side>0 else 'R')])
    pivot=Vector((27*side,2,110))
    moved=pivot+Matrix.Rotation(math.radians(-120*side),3,'Y')@(v.co-pivot)
    k.data[i].co=v.co.lerp(moved,influence)
bpy.context.view_layer.update()
ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
fixture={'input':[xyz(k.data[i].co) for i in order], 'expected':[xyz(mesh.vertices[i].co) for i in order]}
Path('scripts/fixtures/v4-smooth-oracle.json').write_text(json.dumps(fixture))
ev.to_mesh_clear()
