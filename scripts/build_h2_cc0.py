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
LOW = {'paint': 5200, 'trim': 1600, 'chrome': 1200, 'glass': 500, 'lamp': 900, 'amber': 280, 'tail': 500, 'tire': 520, 'rim': 360, 'decal': 200}


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
    set_in(bsdf, ['Coat Roughness', 'Clearcoat Roughness'], 0.12)
    if emission is not None:
        set_in(bsdf, ['Emission Color', 'Emission'], emission)
        set_in(bsdf, ['Emission Strength'], strength)
    return mat


def build_materials():
    # Garrett's H2 yellow, sampled from the reference photo (~224, 180, 65).
    return {
        'paint': make_mat('paint', srgb(224, 180, 65), 0.05, 0.32, coat=1.0),
        'trim': make_mat('trim', srgb(18, 18, 18), 0.0, 0.58),
        'chrome': make_mat('chrome', srgb(214, 216, 218), 1.0, 0.16),
        'glass': make_mat('glass', srgb(8, 12, 16), 0.85, 0.06),
        'lamp': make_mat('lamp', srgb(255, 246, 230), 0.0, 0.3, srgb(255, 248, 236), 8.0),
        'amber': make_mat('amber', srgb(255, 140, 20), 0.0, 0.35, srgb(255, 120, 0), 4.0),
        'tail': make_mat('tail', srgb(180, 8, 6), 0.0, 0.35, srgb(255, 16, 8), 5.0),
        'tire': make_mat('tire', srgb(22, 22, 22), 0.0, 0.88),
        'rim': make_mat('rim', srgb(186, 190, 194), 1.0, 0.28),
        'decal': make_mat('decal', srgb(12, 12, 12), 0.0, 0.62),
    }


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
    add_grille_bars()


def add_grille_bars():
    """Seven chrome slats in front of the fascia. Decimation closes the
    source grille into a solid panel, and the real H2 reads as vertical bars."""
    import bmesh
    xs = []
    for obj in meshes():
        if obj.get('role') in ('tire', 'rim'):
            continue
        for v in obj.data.vertices:
            if abs(v.co.y) < 0.55 and 0.68 < v.co.z < 1.15:
                xs.append(v.co.x)
    if not xs:
        print('grille skipped, no fascia')
        return
    nose = max(xs)
    bm = bmesh.new()

    def cube(xa, xb, ya, yb, za, zb):
        made = bmesh.ops.create_cube(bm, size=1.0)
        for v in made['verts']:
            v.co.x = xa + (v.co.x + 0.5) * (xb - xa)
            v.co.y = ya + (v.co.y + 0.5) * (yb - ya)
            v.co.z = za + (v.co.z + 0.5) * (zb - za)

    y0, y1 = -0.52, 0.52
    z0, z1 = 0.70, 1.14
    x0, x1 = nose - 0.008, nose + 0.016
    t = 0.02
    cube(x0, x1, y0, y1, z0, z0 + t)
    cube(x0, x1, y0, y1, z1 - t, z1)
    cube(x0, x1, y0, y0 + t, z0, z1)
    cube(x0, x1, y1 - t, y1, z0, z1)
    gap, n = 0.042, 7
    slot = ((y1 - y0) - gap * (n + 1)) / n
    for i in range(n):
        a = y0 + gap + i * (slot + gap)
        cube(x0, x1, a, a + max(slot, 0.02), z0 + t * 0.6, z1 - t * 0.6)
    mesh = bpy.data.meshes.new('GrilleBars')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('GrilleBars', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['role'] = 'body'
    print(f'grille at x {nose:.2f} {tri_count(obj)} tris')


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


def finish(obj, budget, wheel=None):
    cleanup_mesh(obj)
    count = decimate_to(obj, budget)
    cleanup_mesh(obj)
    if wheel:
        bake_axle(obj, 0.50 if wheel == 'tire' else 0.40)
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
        export_texcoords=False,
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
    # Low LOD is a second decimate of the high meshes, wheels included.
    low_objs = []
    for obj in keep:
        copy = duplicate(obj)
        bucket = obj.get('bucket')
        role = obj.get('role')
        if role == 'tire':
            budget, wheel = LOW['tire'], 'tire'
        elif role == 'rim':
            budget, wheel = LOW['rim'], 'rim'
        else:
            budget, wheel = LOW.get(bucket, 200), None
        # The high mesh is already reduced, so only collapse further.
        count = decimate_to(copy, budget)
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
