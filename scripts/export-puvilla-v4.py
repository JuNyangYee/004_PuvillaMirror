"""Run with Blender -b SOURCE.blend --python scripts/export-puvilla-v4.py.

Exports rest geometry without changing/saving the source .blend. Body/eyes/nose
stay quad cages for the app's subdivision; the scarf includes rest shrinkwrap,
linear vertex colors and weights mapped to the app's eight-bone skeleton.
"""
import bpy
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models'
source = Path(bpy.data.filepath)
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        obj.data.pose_position = 'REST'
bpy.context.view_layer.update()

def point(obj, vertex):
    p = obj.matrix_world @ vertex.co
    return (p.x, p.z, -p.y)  # Blender Z-up to app Y-up, units remain cm.

lines = ['# Puvilla_rig_muffler_v4.blend rest cages; scarf in pu_muffler_v4.bin']
offset = 1
parts = []
for name in ['pu_body', 'pu_eyes_L', 'pu_eyes_R', 'pu_nose']:
    obj = bpy.data.objects[name]
    lines.append('o ' + name)
    for v in obj.data.vertices:
        lines.append('v %.8f %.8f %.8f' % point(obj, v))
    for face in obj.data.polygons:
        lines.append('f ' + ' '.join(str(offset + i) for i in face.vertices))
    offset += len(obj.data.vertices)
    parts.append({'name': name, 'vertices': len(obj.data.vertices), 'faces': len(obj.data.polygons)})
OUT.joinpath('pu_v4.obj').write_text('\n'.join(lines) + '\n', encoding='utf8')

obj = bpy.data.objects['pu_muffler']
evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
assert len(mesh.vertices) == len(obj.data.vertices), 'Scarf topology changed; weight correspondence needs review'
mesh.calc_loop_triangles()
color_node = next(n for n in obj.data.materials[0].node_tree.nodes if n.type == 'VERTEX_COLOR')
attribute = mesh.color_attributes.get(color_node.layer_name) or mesh.color_attributes.active_color
assert attribute is not None, 'Missing scarf color attribute'
# Preserve color seams by splitting on position-index + linear color.
bone_map = {'hips': 0, 'spine': 1, 'chest': 2, 'head': 3,
            'shoulder.L': 2, 'shoulder.R': 2, 'upper_arm.L': 4,
            'forearm.L': 5, 'hand.L': 5, 'upper_arm.R': 6,
            'forearm.R': 7, 'hand.R': 7}
positions, colors, indices, skin_indices, skin_weights = [], [], [], [], []
lookup = {}
for tri in mesh.loop_triangles:
    for li in tri.loops:
        vi = mesh.loops[li].vertex_index
        rgb = attribute.data[li if attribute.domain == 'CORNER' else vi].color[:3]
        color = tuple(round(max(0, min(1, c)) * 255) for c in rgb)
        key = (vi, color)
        if key not in lookup:
            lookup[key] = len(positions) // 3
            positions.extend(point(obj, mesh.vertices[vi]))
            colors.extend(color)
            weights = {}
            for group in obj.data.vertices[vi].groups:
                name = obj.vertex_groups[group.group].name
                if name in bone_map:
                    bone = bone_map[name]
                    weights[bone] = weights.get(bone, 0) + group.weight
            top = sorted(weights.items(), key=lambda x: -x[1])[:4]
            total = sum(w for _, w in top)
            assert total > 0, 'Unweighted scarf vertex'
            top += [(0, 0)] * (4 - len(top))
            skin_indices.extend(i for i, _ in top)
            skin_weights.extend(w / total for _, w in top)
        indices.append(lookup[key])
n = len(positions) // 3
dominant = [c for c, _ in Counter(tuple(colors[i:i+3]) for i in range(0, len(colors), 3)).most_common(2)]
dominant.sort(key=lambda c: c[1])
palette = {'red': [c / 255 for c in dominant[0]], 'cream': [c / 255 for c in dominant[1]]}
header = json.dumps({'verts': n, 'tris': len(indices) // 3, 'colors': True,
                     'skin': True, 'source': source.name, 'palette': palette}, separators=(',', ':')).encode()
header += b' ' * ((-len(header)) % 4)
color_bytes = bytes(colors)
color_bytes += b'\0' * ((-len(color_bytes)) % 4)
with OUT.joinpath('pu_muffler_v4.bin').open('wb') as f:
    f.write(struct.pack('<I', len(header)))
    f.write(header)
    f.write(struct.pack('<%df' % len(positions), *positions))
    f.write(color_bytes)
    f.write(struct.pack('<%dI' % len(indices), *indices))
    f.write(struct.pack('<%dH' % len(skin_indices), *skin_indices))
    f.write(struct.pack('<%df' % len(skin_weights), *skin_weights))
evaluated.to_mesh_clear()
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
report = {'source': source.name, 'sourceSha256': source_hash,
          'sourceUnchanged': True, 'blenderVersion': bpy.app.version_string,
          'parts': parts, 'scarfVertices': n, 'scarfTriangles': len(indices) // 3,
          'colorSpace': 'linear RGB, quantized u8', 'boneMap': bone_map,
          'limitations': ['Blender IK controls are not imported; app tracking drives its runtime skeleton.',
                          'Shrinkwrap evaluated in rest pose; Blender live corrective modifiers are not run in browser.']}
OUT.joinpath('pu_v4.source.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print(json.dumps(report, indent=2))
