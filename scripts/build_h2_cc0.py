# Convert the CC0 Hummer H2 (brzynak, Blend Swap #79973) into the pace-car GLBs.
# The source scene is Blender 2.74 with the subdivision still on the modifier
# stack. This applies a reduced level, throws away the ground and the camera,
# decimates the body and the wheels separately, and writes glTF PBR materials.
#
#   blender --background assets/models/src/HUMMER.blend --python scripts/build_h2_cc0.py
import bpy
import math
import os
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'models')

TIRES = {'Cylinder.009', 'Cylinder.012', 'Cylinder.015', 'Cylinder.018'}
RIMS = {'Cylinder.010', 'Cylinder.011', 'Cylinder.016', 'Cylinder.020'}
HUBS = {'Cylinder.008', 'Cylinder.013', 'Cylinder.014', 'Cylinder.019'}

# Real 2003 H2. 35 in tire -> radius 0.4445 m. Length 189.8 in.
TIRE_R = 35 * 0.0254 / 2
LENGTH = 189.8 * 0.0254

MAT_MAP = {
    'DarkBlueMetallicPaint': 'paint',
    'Material.002': 'paint',
    'DarkGrayMetallicPaint': 'trim',
    'DarkMetal': 'trim',
    'Material.003': 'trim',
    'Tire Rubber': 'trim',
    'Brake caliper': 'trim',
    'Metal1': 'chrome',
    'Metal2': 'chrome',
    'AnodizedMetal': 'chrome',
    'MIRROR': 'chrome',
    'glass': 'glass',
    'whiteGlass': 'lamp',
    'orangeGLASS': 'amber',
    'redGLASS': 'tail',
}

BUCKET_NAME = {
    'paint': 'h2-body',
    'trim': 'h2-trim',
    'chrome': 'h2-chrome',
    'glass': 'h2-glass',
    'lamp': 'h2-headlamp',
    'amber': 'h2-marker',
    'tail': 'h2-tail',
    'decal': 'h2-decal',
}

# Triangle budgets. Wheels are per corner so the decimate keeps them round.
HIGH = {'paint': 12400, 'trim': 3800, 'chrome': 3000, 'glass': 1100, 'lamp': 500, 'amber': 280, 'tail': 280, 'tire': 1000, 'rim': 650, 'decal': 400}
LOW = {'paint': 3800, 'trim': 1000, 'chrome': 750, 'glass': 420, 'lamp': 640, 'amber': 200, 'tail': 320, 'tire': 500, 'rim': 360, 'decal': 200}


def srgb(r, g, b):
    def f(u):
        u = u / 255
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1)


def set_in(node, names, value):
    for name in names:
        sock = node.inputs.get(name)
        if sock is not None:
            sock.default_value = value
            return


def make_mat(name, color, metallic, roughness, emission=None, strength=0, coat=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(bsdf, ['Base Color'], color)
    set_in(bsdf, ['Metallic'], metallic)
    set_in(bsdf, ['Roughness'], roughness)
    set_in(bsdf, ['Alpha'], 1.0)
    set_in(bsdf, ['Coat Weight', 'Clearcoat'], coat)
    set_in(bsdf, ['Coat Roughness', 'Clearcoat Roughness'], 0.06)
    if emission is not None:
        set_in(bsdf, ['Emission Color', 'Emission'], emission)
        set_in(bsdf, ['Emission Strength'], strength)
    return mat


def build_materials():
    # Garrett's H2 yellow, sampled from the reference photo (~224, 180, 65).
    mats = {
        # Cleaner and brighter than the shaded sample. The photo's lit panel is a
        # clear yellow, not the mustard the old base color rendered as.
        'paint': make_mat('paint', srgb(246, 198, 42), 0.04, 0.18, coat=1.0),
        'trim': make_mat('trim', srgb(22, 22, 24), 0.0, 0.62),
        'chrome': make_mat('chrome', srgb(230, 232, 234), 1.0, 0.10),
        'glass': make_mat('glass', srgb(8, 12, 16), 0.85, 0.06),
        'lamp': make_mat('lamp', srgb(255, 246, 230), 0.0, 0.3, srgb(255, 248, 236), 8.0),
        'amber': make_mat('amber', srgb(255, 140, 20), 0.0, 0.35, srgb(255, 120, 0), 4.0),
        'tail': make_mat('tail', srgb(180, 8, 6), 0.0, 0.35, srgb(255, 16, 8), 5.0),
        'tire': make_mat('tire', srgb(16, 16, 16), 0.0, 0.78),
        'rim': make_mat('rim', srgb(168, 172, 176), 0.6, 0.35),
        'bowl': make_mat('bowl', srgb(186, 188, 190), 0.45, 0.38),
        'lens': make_mat('lens', srgb(235, 240, 242), 0.0, 0.04),
        'accent': make_mat('accent', srgb(176, 22, 28), 0.15, 0.4),
        'decal': make_mat('decal', srgb(12, 12, 12), 0.0, 0.62),
    }
    lens = next(n for n in mats['lens'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(lens, ['Transmission Weight', 'Transmission'], 0.92)
    set_in(lens, ['IOR'], 1.45)
    return mats


def activate(obj):
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def meshes():
    found = []
    for obj in bpy.data.objects:
        if obj is None or obj.type != 'MESH':
            continue
        if obj.name not in bpy.context.scene.collection.objects and all(obj.name not in col.objects for col in bpy.data.collections):
            bpy.context.scene.collection.objects.link(obj)
        found.append(obj)
    return found


def apply_modifiers(obj):
    if obj.data.shape_keys:
        obj.shape_key_clear()
    activate(obj)
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as err:
            print('modifier skip', obj.name, mod.name, err)
            if mod.name in obj.modifiers:
                obj.modifiers.remove(mod)


def apply_transforms(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def bounds(obj):
    xs, ys, zs = [], [], []
    for v in obj.data.vertices:
        xs.append(v.co.x)
        ys.append(v.co.y)
        zs.append(v.co.z)
    if not xs:
        return None
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def dims(b):
    return (b[1] - b[0], b[3] - b[2], b[5] - b[4])


def tri_count(obj):
    # Polygon count, not loop triangles. calc_loop_triangles() corrupts the
    # 2.74 meshes this file produces and makes the exporter drop them.
    return sum(max(1, len(poly.vertices) - 2) for poly in obj.data.polygons)


def boxify(obj, bars=3):
    """Replace a modifier-heavy detail with a few boxes of the same bounds."""
    b = bounds(obj)
    if not b:
        return
    x0, x1, y0, y1, z0, z1 = b
    spans = [(x1 - x0, 0), (y1 - y0, 1), (z1 - z0, 2)]
    spans.sort(reverse=True)
    long_axis = spans[0][1]
    import bmesh
    bm = bmesh.new()

    def cube(xa, xb, ya, yb, za, zb):
        made = bmesh.ops.create_cube(bm, size=1.0)
        for v in made['verts']:
            v.co.x = xa + (v.co.x + 0.5) * (xb - xa)
            v.co.y = ya + (v.co.y + 0.5) * (yb - ya)
            v.co.z = za + (v.co.z + 0.5) * (zb - za)

    if bars <= 1 or spans[0][0] < 0.05:
        cube(x0, x1, y0, y1, z0, z1)
    else:
        gap = spans[0][0] * 0.08
        slot = (spans[0][0] - gap * (bars - 1)) / bars
        for i in range(bars):
            a = (x0, y0, z0)
            c = (x1, y1, z1)
            start = (x0, y0, z0)[long_axis] + i * (slot + gap)
            a = list(a)
            c = list(c)
            a[long_axis] = start
            c[long_axis] = start + slot
            cube(a[0], c[0], a[1], c[1], a[2], c[2])
    mesh = bpy.data.meshes.new(obj.name + '_box')
    bm.to_mesh(mesh)
    bm.free()
    obj.data = mesh
    print(f'  boxify {obj.name} -> {tri_count(obj)} tris')


def decimate_to(obj, target):
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    sanitize(obj)
    tris = tri_count(obj)
    # Flatten the nearly-coplanar hood and fender facets before collapse so
    # the decimate doesn't wrinkle those panels.
    if tris > 25000:
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.dissolve_limit(
            bm, angle_limit=math.radians(11), verts=bm.verts, edges=bm.edges,
            use_dissolve_boundaries=False, delimit={'NORMAL'},
        )
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        tris = tri_count(obj)
    if tris <= target * 1.08 or tris < 8:
        return tris
    activate(obj)
    # Ratio is of triangles after the modifier triangulates. One pass on a
    # single source object lands on the target; joined shells do not.
    mod = obj.modifiers.new('Decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(0.001, min(1.0, target / float(tris)))
    mod.use_collapse_triangulate = True
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as err:
        print('decimate skip', obj.name, err)
        if mod.name in obj.modifiers:
            obj.modifiers.remove(mod)
    got = tri_count(obj)
    if got > target * 1.35 and 2000 < got < 12000:
        import bmesh
        for dist in (0.003, 0.007, 0.012, 0.02, 0.03):
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
            bmesh.ops.triangulate(bm, faces=list(bm.faces))
            bm.to_mesh(obj.data)
            bm.free()
            obj.data.update()
            got = tri_count(obj)
            if got <= target * 1.2:
                break
    print(f'  decimate {obj.name} {tris} -> {got} (wanted {target})')
    return got


def decimate_evenly(parts, target, floor=240):
    """Share a budget across pieces so one huge lamp does not eat the rest,
    and no lens is collapsed down to a handful of triangles."""
    parts = [p for p in parts if p and p.type == 'MESH' and len(p.data.polygons)]
    if not parts:
        return
    total = sum(tri_count(p) for p in parts) or 1
    if total <= target * 1.05:
        return
    for part in parts:
        decimate_to(part, max(floor, round(target * tri_count(part) / total)))


def decimate_parts(parts, target):
    """Hit a budget before objects are joined. The biggest piece keeps most of
    the budget so the body shell and the grille bars are not starved."""
    parts = [p for p in parts if p and p.type == 'MESH' and len(p.data.polygons)]
    if not parts:
        return
    # Lettering and lamp lenses are small and get wrecked by collapse.
    parts = [p for p in parts if not str(p.name).startswith('Text')]
    ranked = sorted(parts, key=tri_count, reverse=True)
    if not ranked:
        return
    main = ranked[0]
    rest = ranked[1:]
    if tri_count(main) > target:
        decimate_to(main, int(target * 0.7))
    leftover = max(0, target - tri_count(main))
    big = [p for p in rest if tri_count(p) > 500]
    small_used = sum(tri_count(p) for p in rest if p not in big)
    budget = max(0, leftover - small_used)
    total = sum(tri_count(p) for p in big) or 1
    for part in big:
        if budget < 80:
            decimate_to(part, 80)
        else:
            decimate_to(part, max(80, round(budget * tri_count(part) / total)))


def join_objects(parts, name):
    parts = [p for p in parts if p and p.type == 'MESH' and len(p.data.vertices) > 0]
    if not parts:
        return None
    activate(parts[0])
    for p in parts:
        p.select_set(True)
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def separate_by_material(obj):
    if len(obj.material_slots) <= 1:
        return [obj]
    activate(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')
    return [o for o in bpy.context.selected_objects if o.type == 'MESH']


def sanitize(obj):
    """Rebuild the mesh through bmesh so leftover 2.74 attributes cannot
    desync the loop arrays. Smooth shading is per face, with no modifier."""
    import bmesh
    src = obj.data
    slots = [slot.material for slot in obj.material_slots]
    bm = bmesh.new()
    bm.from_mesh(src)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    clean = bpy.data.meshes.new(src.name + '_c')
    bm.to_mesh(clean)
    bm.free()
    for mat in slots:
        clean.materials.append(mat)
    obj.data = clean
    if src.users == 0:
        bpy.data.meshes.remove(src)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()


def cleanup_mesh(obj):
    sanitize(obj)


def bake_axle(obj, max_ratio):
    """Make Blender Y the axle (thin) and leave the object rotation at zero.

    The glTF Y-up export turns Blender Y into Three Z, and auditPaceCar reads
    that local bounding box. A node rotation would be baked into the buffer
    and would point the axle the wrong way.
    """
    b = bounds(obj)
    if not b:
        return
    d = dims(b)
    axle = min(range(3), key=lambda i: d[i])
    center = Vector(((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2))
    for v in obj.data.vertices:
        v.co -= center
    if axle == 0:
        rot = Matrix.Rotation(math.radians(90), 4, 'Z')
    elif axle == 2:
        rot = Matrix.Rotation(math.radians(-90), 4, 'X')
    else:
        rot = Matrix.Identity(4)
    obj.data.transform(rot)
    obj.rotation_euler = (0, 0, 0)
    obj.location = center
    obj.data.update()
    b = bounds(obj)
    d = dims(b)
    diameter = max(d[0], d[2])
    width = d[1]
    cap = diameter * max_ratio
    if width > cap and width > 1e-4:
        for v in obj.data.vertices:
            v.co.y *= cap / width
        obj.data.update()
    b = bounds(obj)
    d = dims(b)
    print(f'  wheel {obj.name} local {d[0]:.3f} {d[1]:.3f} {d[2]:.3f}')


def add_decals(mats, body):
    b = bounds(body)
    if not b:
        return []
    made = []
    door_x = (b[0] + b[1]) * 0.5 - 0.15
    door_z = b[4] + (b[5] - b[4]) * 0.58
    half = max(abs(b[2]), abs(b[3]))
    for sign in (1, -1):
        curve = bpy.data.curves.new('PACE', 'FONT')
        curve.body = 'PACE CAR'
        curve.align_x = 'CENTER'
        curve.size = 0.09
        curve.extrude = 0.001
        curve.resolution_u = 2
        obj = bpy.data.objects.new('h2-decal', curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = Vector((door_x, sign * (half + 0.004), door_z))
        # Default text faces +Z. Tip it onto the door.
        # +90 turns the text's front toward -Y, so the +Y door needs the opposite.
        # The -Y door needs the letters spun 180 degrees or that side reads mirrored.
        obj.rotation_euler = (math.radians(-90 if sign > 0 else 90), 0, 0 if sign > 0 else math.pi)
        activate(obj)
        bpy.ops.object.convert(target='MESH')
        obj = bpy.context.view_layer.objects.active
        obj['bucket'] = 'decal'
        assign(obj, mats['decal'])
        apply_transforms(obj)
        made.append(obj)
    return made


def add_clearance_lamps(mats, body, amber_top):
    b = bounds(body)
    if not b:
        return []
    roof = b[5]
    if amber_top is not None and amber_top > roof - 0.08:
        return []
    made = []
    xs = (0.15, 0.15, 0.15, 0.15, 0.15)
    ys = (-0.55, -0.28, 0, 0.28, 0.55)
    for i, (x, y) in enumerate(zip(xs, ys)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, roof + 0.012))
        obj = bpy.context.view_layer.objects.active
        obj.scale = (0.035, 0.05, 0.018)
        apply_transforms(obj)
        obj.name = 'h2-marker'
        obj['bucket'] = 'amber'
        assign(obj, mats['amber'])
        made.append(obj)
    return made


def prepare_scene():
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH' or obj.name == 'Plane.029':
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    world = bpy.context.scene.world
    if world and world.use_nodes:
        world.use_nodes = False
    for obj in meshes():
        role = 'body'
        if obj.name in TIRES:
            role = 'tire'
        elif obj.name in RIMS or obj.name in HUBS:
            role = 'rim'
        obj['role'] = role
        verts = len(obj.data.vertices)
        for mod in obj.modifiers:
            if mod.type != 'SUBSURF':
                continue
            if role in ('tire', 'rim'):
                level = 1
            elif verts > 2500:
                level = 1
            else:
                level = 2
            mod.levels = level
            mod.render_levels = level
            print(f'subsurf {obj.name} -> {level} ({verts} cage verts)')
    for obj in list(meshes()):
        apply_modifiers(obj)
        apply_transforms(obj)
        sanitize(obj)
        if len(obj.data.vertices) == 0:
            bpy.data.objects.remove(obj, do_unlink=True)


def orient_and_scale():
    # The scene's nose is -Y. +90 degrees about Z puts that nose on +X,
    # which is forward after the glTF Y-up conversion.
    rot = Matrix.Rotation(math.pi / 2, 4, 'Z')
    for obj in meshes():
        for v in obj.data.vertices:
            v.co = rot @ v.co
        obj.data.update()
    tires = [o for o in meshes() if o.get('role') == 'tire']
    radii = []
    centers = []
    for tire in tires:
        b = bounds(tire)
        d = sorted(dims(b))
        radii.append((d[1] + d[2]) / 4)
        centers.append(Vector(((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2)))
    radius = sum(radii) / len(radii)
    axle_x = sum(c.x for c in centers) / len(centers)
    lat_y = sum(c.y for c in centers) / len(centers)
    ground = min(bounds(t)[4] for t in tires)
    xs = [v.co.x for o in meshes() for v in o.data.vertices]
    length = max(xs) - min(xs)
    scale = TIRE_R / radius
    print(f'source radius {radius:.3f} length {length:.3f} -> scale {scale:.4f} length {length * scale:.3f}')
    if not (4.65 <= length * scale <= 5.05):
        scale = LENGTH / length
        print(f'length override scale {scale:.4f}')
    origin = Vector((axle_x, lat_y, ground))
    for obj in meshes():
        for v in obj.data.vertices:
            v.co = (v.co - origin) * scale
        obj.data.update()
    tires = [o for o in meshes() if o.get('role') == 'tire']
    radii = []
    for tire in tires:
        d = sorted(dims(bounds(tire)))
        radii.append((d[1] + d[2]) / 4)
    xs = [v.co.x for o in meshes() for v in o.data.vertices]
    zs = [v.co.z for o in meshes() if o.get('role') != 'tire' for v in o.data.vertices]
    print(f'scaled radius {sum(radii)/len(radii):.3f} length {max(xs)-min(xs):.3f} roof {max(zs):.3f}')
    for obj in list(meshes()):
        if obj.name.startswith('Plane.011'):
            boxify(obj, bars=3)


def retopo(mats):
    # Wheels first, so body cladding that shares the rubber material stays body.
    for obj in list(meshes()):
        role = obj.get('role')
        if role == 'tire':
            assign(obj, mats['tire'])
            obj['bucket'] = 'tire'
        elif role == 'rim':
            assign(obj, mats['rim'])
            obj['bucket'] = 'rim'
    # One rim per tire. Hubs and any split rotor share that corner.
    def center_of(obj):
        b = bounds(obj)
        return Vector(((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2))
    tires = [o for o in meshes() if o.get('role') == 'tire' and bounds(o)]
    rims = [o for o in meshes() if o.get('role') == 'rim' and bounds(o)]
    print(f'corners tires {len(tires)} rim-parts {len(rims)}')
    for index, tire in enumerate(tires):
        near = sorted(rims, key=lambda r: (center_of(r) - center_of(tire)).length)[:max(1, len(rims) // len(tires))]
        # Keep parts that are actually at this corner, not just the N nearest globally.
        near = [r for r in rims if (center_of(r) - center_of(tire)).length < 0.85]
        if not near:
            continue
        joined = join_objects(near, f'h2-rim{index}')
        if joined:
            joined['role'] = 'rim'
            joined['bucket'] = 'rim'
            assign(joined, mats['rim'])
        for part in near:
            if part in rims:
                rims.remove(part)
    loose = []
    for obj in list(meshes()):
        if obj.get('role') in ('tire', 'rim'):
            continue
        parts = separate_by_material(obj)
        for part in parts:
            slot = part.material_slots[0].material.name if part.material_slots and part.material_slots[0].material else ''
            bucket = MAT_MAP.get(slot, 'trim')
            if part.name.startswith('Text') or part.name.startswith('Plane.011') or part.name.startswith('Grille'):
                bucket = 'chrome'
            if bucket == 'trim':
                span = bounds(part)
                # Roof and the upper pillars are body color on the reference H2.
                if span and span[4] > 1.50 and span[5] > 1.72 and (span[3] - span[2]) < 2.3:
                    bucket = 'paint'
            part['bucket'] = bucket
            part['role'] = 'body'
            assign(part, mats[bucket])
            loose.append(part)
    grouped = {k: [] for k in BUCKET_NAME}
    for obj in meshes():
        bucket = obj.get('bucket')
        if bucket in grouped:
            grouped[bucket].append(obj)
        elif obj.get('role') not in ('tire', 'rim'):
            grouped['trim'].append(obj)
    joined = {}
    for bucket, parts in grouped.items():
        if bucket == 'lamp':
            decimate_evenly(parts, 2200, floor=280)
        elif bucket == 'tail':
            decimate_evenly(parts, 1400, floor=200)
        elif bucket == 'amber':
            decimate_evenly(parts, 700, floor=120)
        elif bucket in HIGH and bucket != 'decal':
            decimate_parts(parts, HIGH[bucket])
        obj = join_objects(parts, BUCKET_NAME[bucket])
        if obj:
            obj['bucket'] = bucket
            obj['role'] = 'body'
            assign(obj, mats[bucket])
            joined[bucket] = obj
    return joined


def smooth_angle(obj, deg=35):
    """Split normals on creases steeper than deg so the hood stays smooth
    and the panel gaps stay sharp."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    limit = math.radians(deg)
    for edge in bm.edges:
        if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > limit:
            edge.smooth = False
        else:
            edge.smooth = True
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = True
    try:
        obj.data.calc_normals_split()
    except Exception:
        pass
    obj.data.update()


def finish(obj, budget, wheel=None):
    cleanup_mesh(obj)
    count = decimate_to(obj, budget)
    cleanup_mesh(obj)
    if wheel:
        bake_axle(obj, 0.50 if wheel == 'tire' else 0.40)
    elif obj.get('bucket') == 'paint':
        smooth_angle(obj, 35)
    return count


def export(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.data.validate(verbose=False, clean_customdata=True)
        obj.data.name = obj.name
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_draco_mesh_compression_enable=False,
    )
    print('wrote', path, os.path.getsize(path))


def duplicate(obj):
    copy = obj.copy()
    copy.data = obj.data.copy()
    # Assigning an existing name makes Blender steal it from the source object.
    copy.name = '_lowtmp_' + obj.name
    bpy.context.scene.collection.objects.link(copy)
    for key in ('role', 'bucket'):
        if key in obj:
            copy[key] = obj[key]
    copy.location = obj.location.copy()
    copy.rotation_euler = obj.rotation_euler.copy()
    copy.scale = obj.scale.copy()
    return copy


def _cube(bm, xa, xb, ya, yb, za, zb):
    made = bmesh_cube(bm)
    for v in made:
        v.co.x = xa + (v.co.x + 0.5) * (xb - xa)
        v.co.y = ya + (v.co.y + 0.5) * (yb - ya)
        v.co.z = za + (v.co.z + 0.5) * (zb - za)


def bmesh_cube(bm):
    import bmesh
    return bmesh.ops.create_cube(bm, size=1.0)['verts']


def _annulus(bm, r_in, r_out, y0, y1, n=28):
    """A short tube wall plus the front and back rings. Axle is Y."""
    rings = []
    for radius, y in ((r_in, y0), (r_out, y0), (r_out, y1), (r_in, y1)):
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(bm.verts.new((math.cos(a) * radius, y, math.sin(a) * radius)))
        rings.append(ring)
    pairs = ((0, 1), (1, 2), (2, 3), (3, 0))
    for a, b in pairs:
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((rings[a][i], rings[a][j], rings[b][j], rings[b][i]))


def _disc(bm, radius, y, n=20, z_axis=False):
    """Flat disc facing +Y, centered on the origin."""
    import bmesh
    ret = bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=n,
        radius1=radius, radius2=radius, depth=0.008,
    )
    bmesh.ops.rotate(
        bm, verts=ret['verts'], cent=(0, 0, 0),
        matrix=Matrix.Rotation(math.pi / 2, 3, 'X'),
    )
    bmesh.ops.translate(bm, verts=ret['verts'], vec=(0, y, 0))


def build_rim_mesh(outside, detail='high'):
    """One 17-inch H2 wheel made of joined prisms, not loose blades.

    The lip is a ring, the six spokes are thick trapezoids welded to it,
    and the windows are the open gaps. A disc behind the face shows through
    those windows. +Y is the outside.
    """
    import bmesh
    bm = bmesh.new()
    n = 48 if detail == 'high' else 24
    y_f, y_b = 0.056, 0.030
    r_o, r_i = 0.216, 0.196

    def prism(r0, r1, a0, a1, y0, y1, steps=1):
        for s in range(steps):
            t0 = a0 + (a1 - a0) * s / steps
            t1 = a0 + (a1 - a0) * (s + 1) / steps
            pts = [(r0, t0), (r0, t1), (r1, t1), (r1, t0)]
            bot = [bm.verts.new((math.cos(a) * r, y0, math.sin(a) * r)) for r, a in pts]
            top = [bm.verts.new((math.cos(a) * r, y1, math.sin(a) * r)) for r, a in pts]
            bm.faces.new(top)
            bm.faces.new(list(reversed(bot)))
            for k in range(4):
                nxt = (k + 1) % 4
                bm.faces.new((bot[k], top[k], top[nxt], bot[nxt]))

    for i in range(n):
        prism(r_i, r_o, 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n, y_b, y_f)
    # Spokes as wide as the windows: 30 degrees of metal, 30 of opening.
    for s in range(6):
        a = 2 * math.pi * s / 6
        prism(0.078, r_i, a - math.radians(15), a + math.radians(15), 0.032, y_f, 3)
    # Hub and raised cap.
    prism(0.0, 0.086, 0, 2 * math.pi, 0.032, y_f, n)
    prism(0.0, 0.052, 0, 2 * math.pi, y_f, y_f + 0.012, 16 if detail == 'high' else 10)
    for s in range(6):
        ang = 2 * math.pi * (s + 0.5) / 6
        ret = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=6,
            radius1=0.009, radius2=0.009, depth=0.012,
        )
        bmesh.ops.rotate(bm, verts=ret['verts'], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
        bmesh.ops.translate(bm, verts=ret['verts'], vec=(math.cos(ang) * 0.032, y_f + 0.014, math.sin(ang) * 0.032))
    # Brake-colored disc behind the spokes, seen through the windows.
    prism(0.02, 0.190, 0, 2 * math.pi, -0.004, 0.010, n)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if outside < 0:
        for v in bm.verts:
            v.co.y *= -1
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('h2-rim')
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    return mesh


def rebuild_rims(objs, detail='high', mat=None):
    for obj in objs:
        if obj.get('role') != 'rim':
            continue
        sign = 1 if obj.location.y >= 0 else -1
        fresh = build_rim_mesh(sign, detail)
        old = obj.data
        obj.data = fresh
        if old.users == 0:
            bpy.data.meshes.remove(old)
        if mat is not None:
            assign(obj, mat)
        # Darken the cavity behind the spokes so the six windows read as openings.
        mesh = obj.data
        if 'Color' not in mesh.color_attributes:
            mesh.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
        colors = mesh.color_attributes['Color']
        for poly in mesh.polygons:
            cavity = poly.center.y * sign < 0.008 and math.hypot(poly.center.x, poly.center.z) < 0.19
            rgba = (0.12, 0.12, 0.13, 1) if cavity else (1, 1, 1, 1)
            for li in poly.loop_indices:
                colors.data[li].color = rgba
            poly.use_smooth = not cavity
        b = bounds(obj)
        d = dims(b)
        print(f'  rim {obj.name} {detail} {d[0]:.3f} {d[1]:.3f} {d[2]:.3f} tris {tri_count(obj)}')


def apply_tread(obj):
    """Cylindrical UV plus a chunky all-terrain normal map on the source tire."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name='UVMap')
    uv = mesh.uv_layers.active.data
    ys = [v.co.y for v in mesh.vertices]
    y0, y1 = min(ys), max(ys)
    span = max(1e-4, y1 - y0)
    radii = [math.hypot(v.co.x, v.co.z) for v in mesh.vertices]
    r_max = max(radii) or 1
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            ang = math.atan2(v.z, v.x)
            radial = math.hypot(v.x, v.z) / r_max
            along = (v.y - y0) / span
            # Tread band sits in the middle of V. Sidewalls fall off to the edges.
            if radial > 0.92:
                vv = 0.38 + along * 0.24
            elif v.y >= 0:
                vv = 0.62 + (1 - radial) * 0.34
            else:
                vv = 0.38 - (1 - radial) * 0.34
            uv[li].uv = ((ang + math.pi) / (2 * math.pi), vv)
    img = bpy.data.images.get('h2-tread')
    if img is None:
        img = _tread_image()
    mat = mesh.materials[0] if mesh.materials else None
    if mat is None:
        return
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if any(n.type == 'NORMAL_MAP' for n in nt.nodes):
        return
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    normal = nt.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = 0.35
    nt.links.new(tex.outputs['Color'], normal.inputs['Color'])
    nt.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])


def _tread_image():
    w, h = 256, 64
    height = [0.0] * (w * h)
    for y in range(h):
        v = y / (h - 1)
        for x in range(w):
            u = x / w
            # Repeating tread blocks across the contact band.
            if 0.34 < v < 0.66:
                col = int(u * 18) % 2
                row = int((v - 0.34) / 0.32 * 3)
                if (col + row) % 2 == 0 and (x % 14) > 2 and ((y % 8) > 1):
                    height[y * w + x] = 0.22
            else:
                # Two raised sidewall ribs.
                band = abs(v - (0.18 if v < 0.5 else 0.82))
                if band < 0.035:
                    height[y * w + x] = 0.55
    pixels = [0.0] * (w * h * 4)
    for y in range(h):
        for x in range(w):
            l = height[y * w + (x - 1) % w]
            r = height[y * w + (x + 1) % w]
            d = height[((y - 1) % h) * w + x]
            u = height[((y + 1) % h) * w + x]
            nx, ny, nz = (l - r) * 0.7, (d - u) * 0.7, 1.0
            mag = math.sqrt(nx * nx + ny * ny + nz * nz)
            i = (y * w + x) * 4
            pixels[i] = (nx / mag + 1) * 0.5
            pixels[i + 1] = (ny / mag + 1) * 0.5
            pixels[i + 2] = (nz / mag + 1) * 0.5
            pixels[i + 3] = 1.0
    img = bpy.data.images.new('h2-tread', w, h, alpha=False)
    img.pixels.foreach_set(pixels)
    img.pack()
    return img


def fascia_nose():
    xs = []
    for obj in meshes():
        if obj.get('role') in ('tire', 'rim') or str(obj.name).startswith('h2-fascia'):
            continue
        for v in obj.data.vertices:
            if abs(v.co.y) < 0.72 and 0.80 < v.co.z < 1.16:
                xs.append(v.co.x)
    return max(xs) if xs else 2.2


def tuck_fascia(nose):
    """Recess only the slot openings and the lamp centers.

    The surround itself stays on the fascia. Pushing the whole nose back
    made the new frame stand off the body like a bull bar.
    """
    # Behind the black slot plate, so the source "HUMMER" letters don't
    # show through the openings.
    limit = nose - 0.075
    for obj in meshes():
        if obj.get('role') in ('tire', 'rim') or str(obj.name).startswith('h2-fascia') or str(obj.name).startswith('h2-headlamp-fascia') or str(obj.name).startswith('h2-marker-fascia'):
            continue
        touched = False
        for v in obj.data.vertices:
            in_slot = abs(v.co.y) < 0.50 and 0.82 < v.co.z < 1.16
            in_lamp = abs(abs(v.co.y) - 0.60) < 0.07 and abs(v.co.z - 0.99) < 0.07
            in_fog = abs(abs(v.co.y) - 0.50) < 0.055 and abs(v.co.z - 0.50) < 0.055
            if (in_slot or in_lamp or in_fog) and v.co.x > limit:
                v.co.x = limit
                touched = True
        if touched:
            obj.data.update()


def build_tire_mesh(detail='high'):
    """Smooth 35-inch tire. Rounded shoulder, 0.32 m tread, no paddles."""
    import bmesh
    segs = 32 if detail == 'high' else 20
    R, bead, hw = 0.445, 0.25, 0.16
    pts = []
    steps = 10 if detail == 'high' else 7
    for i in range(steps + 1):
        t = -1 + 2 * i / steps
        u = abs(t)
        y = t * hw
        if u < 0.62:
            radius = R - 0.003 * (u / 0.62) ** 2
        else:
            s = (u - 0.62) / 0.38
            radius = bead + (R - 0.018 - bead) * math.cos(s * math.pi / 2)
            y = math.copysign(hw * (0.62 + 0.38 * math.sin(s * math.pi / 2)), t)
        pts.append((radius, y))
    # Close across the bead so the shell is not an open ribbon.
    pts.append((bead - 0.01, 0.0))
    pts.append((bead - 0.01, pts[0][1]))
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        ang = 2 * math.pi * i / segs
        ca, sa = math.cos(ang), math.sin(ang)
        rings.append([bm.verts.new((r * ca, y, r * sa)) for r, y in pts])
    for i in range(segs):
        j = (i + 1) % segs
        for k in range(len(pts) - 1):
            bm.faces.new((rings[i][k], rings[j][k], rings[j][k + 1], rings[i][k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('h2-tire')
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


def replace_tires(objs, detail='high', mat=None):
    for obj in objs:
        if obj.get('role') != 'tire':
            continue
        fresh = build_tire_mesh(detail)
        old = obj.data
        obj.data = fresh
        if old.users == 0:
            bpy.data.meshes.remove(old)
        if mat is not None:
            assign(obj, mat)
        b = bounds(obj)
        d = dims(b)
        print(f'  tire {obj.name} {detail} {d[0]:.3f} {d[1]:.3f} {d[2]:.3f} tris {tri_count(obj)}')


def _rounded_plate(width, height, depth, radius):
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.object
    ob.scale = (depth, width, height)
    bpy.ops.object.transform_apply(scale=True)
    bev = ob.modifiers.new('Bevel', 'BEVEL')
    bev.width = radius
    bev.segments = 3
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(40)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='Bevel')
    return ob


def _box_cutter(sx, sy, sz, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    bev = ob.modifiers.new('Bevel', 'BEVEL')
    bev.width = min(sy, sz) * 0.22
    bev.segments = 2
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(40)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='Bevel')
    return ob


def build_fascia(mats):
    """One chrome casting, flush with the nose, slots recessed into it.

    Seven tall rounded slots and two headlamp holes are cut out of a thick
    rounded plate. The slot floors stay in the casting, 4 cm back. Lenses
    and reflector bowls sit in the holes.
    """
    import bmesh
    xs, ys = [], []
    for obj in meshes():
        if obj.get('role') in ('tire', 'rim') or str(obj.name).startswith('h2-fascia') or str(obj.name).startswith('h2-headlamp'):
            continue
        for v in obj.data.vertices:
            if 0.86 < v.co.z < 1.16 and abs(v.co.y) < 1.15:
                xs.append(v.co.x)
                if v.co.x > (max(xs) - 0.06 if len(xs) > 8 else -9):
                    ys.append(v.co.y)
    if not xs:
        print('fascia skipped')
        return []
    xs.sort()
    nose = xs[int(len(xs) * 0.97)]
    front_ys = []
    for obj in meshes():
        if obj.get('role') in ('tire', 'rim'):
            continue
        for v in obj.data.vertices:
            if v.co.x > nose - 0.05 and 0.86 < v.co.z < 1.16:
                front_ys.append(v.co.y)
    if len(front_ys) < 8:
        front_ys = ys
    half = min(0.78, (max(front_ys) - min(front_ys)) * 0.5 * 0.96)
    height = 0.22
    depth = 0.055
    zc = 0.99
    print(f'fascia nose {nose:.3f} half {half:.3f}')

    # Remove the source grille and lamp skin so it cannot show through the slots.
    for obj in list(meshes()):
        if obj.get('role') in ('tire', 'rim') or str(obj.name).startswith('h2-fascia') or str(obj.name).startswith('h2-headlamp-lens'):
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        kill = []
        for face in bm.faces:
            c = face.calc_center_median()
            in_grille = abs(c.y) < half + 0.02 and abs(c.z - zc) < height * 0.55 and c.x > nose - 0.10
            old_lamp = obj.name.startswith('h2-headlamp') and c.x > nose - 0.16 and c.z < zc - 0.06 and abs(c.y) < 0.95
            if in_grille or old_lamp:
                kill.append(face)
        if kill:
            bmesh.ops.delete(bm, geom=kill, context='FACES')
            bm.to_mesh(obj.data)
            obj.data.update()
        bm.free()

    plate = _rounded_plate(half * 2, height, depth, 0.014)
    # Cube was centered. Put the front face on the nose and the body behind it.
    plate.location.x = nose - depth / 2
    plate.location.z = zc
    bpy.context.view_layer.objects.active = plate
    bpy.ops.object.transform_apply(location=True)

    lamp_y = half - 0.105
    slot_half = lamp_y - 0.115
    bar = 0.028
    opening = (slot_half * 2 - bar * 6) / 7
    # Slot floors stop 4 cm behind the front face.
    for i in range(7):
        cy = -slot_half + bar + opening / 2 + i * (opening + bar)
        cutter = _box_cutter(0.048, opening * 0.92, height - 0.055, (nose - 0.012, cy, zc))
        bpy.context.view_layer.objects.active = plate
        mod = plate.modifiers.new('Slot', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    for sign in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.078, depth=0.07, location=(nose - 0.02, sign * lamp_y, zc),
            rotation=(0, math.pi / 2, 0), vertices=28,
        )
        cutter = bpy.context.object
        bpy.context.view_layer.objects.active = plate
        mod = plate.modifiers.new('Lamp', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)

    plate.name = 'h2-fascia'
    plate.data.name = 'h2-fascia'
    plate.data.materials.clear()
    plate.data.materials.append(mats['chrome'])
    if 'Color' not in plate.data.color_attributes:
        plate.data.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
    colors = plate.data.color_attributes['Color']
    # Pocket floors are near-black. The chrome bars and the surround stay bright.
    for poly in plate.data.polygons:
        c = poly.center
        floor = poly.normal.x > 0.45 and c.x < nose - 0.02 and abs(c.y) < slot_half + 0.02
        rgba = (0.02, 0.02, 0.025, 1) if floor else (1, 1, 1, 1)
        for li in poly.loop_indices:
            colors.data[li].color = rgba
        poly.use_smooth = True
    plate['bucket'] = 'chrome'
    plate['role'] = 'body'
    print(f'  fascia plate {tri_count(plate)} tris')

    made = [plate]
    # Reflector bowl and a clear lens, one object per side so the audit ray hits glass-over-bowl.
    for sign in (1, -1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.062, location=(nose - 0.046, sign * lamp_y, zc), segments=24, ring_count=12)
        bowl = bpy.context.object
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        # Keep the forward hemisphere only, then flatten it into a bowl.
        bpy.ops.object.mode_set(mode='OBJECT')
        bm = bmesh.new()
        bm.from_mesh(bowl.data)
        drop = [f for f in bm.faces if f.calc_center_median().x < nose - 0.050]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        bm.to_mesh(bowl.data)
        bm.free()
        bowl.data.materials.append(mats['bowl'])
        # Emissive bulb at the center of the bowl.
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=(nose - 0.034, sign * lamp_y, zc), segments=12, ring_count=8)
        bulb = bpy.context.object
        bulb.data.materials.append(mats['lamp'])
        bpy.ops.object.select_all(action='DESELECT')
        bowl.select_set(True)
        bulb.select_set(True)
        bpy.context.view_layer.objects.active = bowl
        bpy.ops.object.join()
        bowl.name = 'h2-headlamp-lens'
        bowl.data.materials.append(mats['lens'])
        # Lens: a thin disc just behind the chrome face.
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.070, depth=0.005, location=(nose - 0.014, sign * lamp_y, zc),
            rotation=(0, math.pi / 2, 0), vertices=28,
        )
        lens = bpy.context.object
        lens.data.materials.append(mats['lens'])
        bpy.ops.object.select_all(action='DESELECT')
        bowl.select_set(True)
        lens.select_set(True)
        bpy.context.view_layer.objects.active = bowl
        bpy.ops.object.join()
        bowl.name = 'h2-headlamp-lens'
        bowl['bucket'] = 'lamp'
        bowl['role'] = 'body'
        made.append(bowl)
        print(f'  lamp {sign} {tri_count(bowl)} tris')

    # Thin red accent, sitting on the bumper directly under the casting.
    bm = bmesh.new()
    _cube(bm, nose - 0.008, nose + 0.001, -half + 0.04, half - 0.04, zc - height / 2 - 0.016, zc - height / 2 - 0.006)
    mesh = bpy.data.meshes.new('h2-fascia-accent')
    bm.to_mesh(mesh)
    bm.free()
    accent = bpy.data.objects.new('h2-fascia-accent', mesh)
    bpy.context.scene.collection.objects.link(accent)
    assign(accent, mats['accent'])
    accent['bucket'] = 'accent'
    accent['role'] = 'body'
    made.append(accent)

    # Small amber lamps just outboard of the headlamps, on the casting line.
    bm = bmesh.new()
    for sign in (1, -1):
        cy = sign * (half - 0.03)
        _cube(bm, nose - 0.006, nose + 0.002, cy - 0.028, cy + 0.028, zc - 0.025, zc + 0.025)
    mesh = bpy.data.meshes.new('h2-marker-fascia')
    bm.to_mesh(mesh)
    bm.free()
    amber = bpy.data.objects.new('h2-marker-fascia', mesh)
    bpy.context.scene.collection.objects.link(amber)
    assign(amber, mats['amber'])
    amber['bucket'] = 'amber'
    amber['role'] = 'body'
    made.append(amber)
    return made


def replace_steps(mats):
    """One black step tube per side, with brackets tucked up under the rocker."""
    import bmesh
    # Drop the shattered source brackets that hang under the doors.
    for obj in list(meshes()):
        if obj.get('role') in ('tire', 'rim') or str(obj.name).startswith('h2-step'):
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        kill = []
        for face in bm.faces:
            c = face.calc_center_median()
            if c.z < 0.22 and 0.62 < abs(c.y) < 1.25 and -1.7 < c.x < 1.6:
                kill.append(face)
        if kill:
            bmesh.ops.delete(bm, geom=kill, context='FACES')
            bm.to_mesh(obj.data)
            obj.data.update()
        bm.free()
    bm = bmesh.new()
    for sign in (1, -1):
        y = sign * 0.96
        # Oval-ish tube: a flat bar.
        _cube(bm, -1.20, 1.05, y - 0.035, y + 0.035, 0.26, 0.33)
        for x in (-0.85, -0.05, 0.70):
            _cube(bm, x - 0.025, x + 0.025, y - sign * 0.02, y - sign * 0.10, 0.30, 0.50)
    mesh = bpy.data.meshes.new('h2-step')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('h2-step', mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign(obj, mats['trim'])
    obj['bucket'] = 'trim'
    obj['role'] = 'body'
    print(f'  steps {tri_count(obj)} tris')
    return obj


def main():
    prepare_scene()
    orient_and_scale()
    mats = build_materials()
    retopo(mats)
    body = next(o for o in meshes() if o.get('bucket') == 'paint')
    amber = [o for o in meshes() if o.get('bucket') == 'amber']
    amber_top = max((bounds(o)[5] for o in amber), default=None)
    # Door lettering from the font came out mirrored on one side, so it stays off.
    # The amber roof lamps are the pace-car mark.
    for obj in add_clearance_lamps(mats, body, amber_top):
        pass
    # Re-join markers and decals that were added after the first join.
    for bucket, name in (('amber', 'h2-marker'), ('decal', 'h2-decal')):
        parts = [o for o in meshes() if o.get('bucket') == bucket or o.name.startswith(name)]
        if parts:
            obj = join_objects(parts, name)
            if obj:
                obj['bucket'] = bucket
                assign(obj, mats[bucket])
    keep = []
    for obj in list(meshes()):
        bucket = obj.get('bucket')
        role = obj.get('role')
        if role == 'tire':
            budget = HIGH['tire']
            wheel = 'tire'
            if not obj.name.startswith('h2-tire'):
                obj.name = 'h2-tire'
        elif role == 'rim':
            budget = HIGH['rim']
            wheel = 'rim'
            if not obj.name.startswith('h2-rim'):
                obj.name = 'h2-rim'
        elif bucket in HIGH:
            budget = HIGH[bucket]
            wheel = None
            if bucket in ('lamp', 'tail', 'amber', 'decal'):
                budget = max(budget, tri_count(obj) + 10)
        else:
            print('drop', obj.name, role, bucket)
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        count = finish(obj, budget, wheel)
        keep.append(obj)
    # Unique names the loader and auditPaceCar both accept (no dots).
    n_tire = n_rim = 0
    for obj in keep:
        if obj.get('role') == 'tire':
            obj.name = 'h2-tire' if n_tire == 0 else f'h2-tire{n_tire}'
            n_tire += 1
        elif obj.get('role') == 'rim':
            obj.name = 'h2-rim' if n_rim == 0 else f'h2-rim{n_rim}'
            n_rim += 1
        print(f'high {obj.name} {tri_count(obj)} tris')
    rebuild_rims(keep, 'high', mats['rim'])
    replace_tires(keep, 'high', mats['tire'])
    for obj in keep:
        if obj.get('role') == 'tire':
            apply_tread(obj)
    fascia = build_fascia(mats)
    step = replace_steps(mats)
    keep.extend(fascia)
    keep.append(step)
    # Low LOD is a second decimate of the high meshes. Rebuilt rims and the
    # fascia are copied, not collapsed, so the spokes and the slots stay crisp.
    low_objs = []
    for obj in keep:
        copy = duplicate(obj)
        role = obj.get('role')
        name = obj.name
        if role == 'rim':
            rebuild_rims([copy], 'low', mats['rim'])
            count = tri_count(copy)
        elif role == 'tire':
            replace_tires([copy], 'low', mats['tire'])
            apply_tread(copy)
            count = tri_count(copy)
        elif name.startswith('h2-fascia') or name.startswith('h2-headlamp-fascia') or name.startswith('h2-marker-fascia') or name.startswith('h2-step'):
            count = tri_count(copy)
        else:
            count = decimate_to(copy, LOW.get(obj.get('bucket'), 200))
        copy.name = '_low_' + obj.name
        print(f'low {obj.name} {count} tris')
        low_objs.append((obj, copy))
        obj.hide_set(True)
        obj.select_set(False)
    # Park the high meshes under temporary names so the low export keeps the
    # names the pace-car audit looks for.
    for obj, copy in low_objs:
        parked = '_high_' + obj.name
        obj.name = parked
        copy.name = parked[len('_high_'):]
        copy.data.name = copy.name
    export(os.path.join(OUT, 'h2-low.glb'), [copy for _, copy in low_objs])
    for obj, copy in low_objs:
        bpy.data.objects.remove(copy, do_unlink=True)
        obj.name = obj.name[len('_high_'):]
        obj.hide_set(False)
    export(os.path.join(OUT, 'h2.glb'), keep)
    total = 0
    for obj in keep:
        n = tri_count(obj)
        total += n
    print('HIGH TOTAL', total, 'objects', len(keep))


if __name__ == '__main__':
    main()
