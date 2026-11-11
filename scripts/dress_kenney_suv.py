# Dress Kenney's CC0 Car Kit SUV as the pace car.
# The mesh is the author's. This only recolors faces, splits the existing
# window and lamp faces out, and adds a lightbar plus a door decal.
#   blender --background --python scripts/dress_kenney_suv.py
import os

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets/models/source/kenney/suv.glb')
DECAL = os.path.join(ROOT, 'assets/models/source/kenney/pace-car-decal.png')
OUT = os.path.join(ROOT, 'assets/models')
# Kenney's units are about half a metre. Uniform scale only, so the SUV sits
# at a compact-road height without stretching the author's proportions.
SCALE = 1.42

GLASS, LAMP, TAIL, PLATE, PAINT, TRIM, BODY = range(7)


def srgb(r, g, b):
    def f(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


def material(name, rgb, rough=0.5, metal=0.0, emit=0.0, double=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not double
    mat.blend_method = 'OPAQUE'
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = srgb(*rgb)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = srgb(*rgb)
        bsdf.inputs['Emission Strength'].default_value = emit
    return mat


def sample(poly, uv, px, w, h):
    u = sum(uv.data[i].uv.x for i in poly.loop_indices) / poly.loop_total
    v = sum(uv.data[i].uv.y for i in poly.loop_indices) / poly.loop_total
    x = min(w - 1, max(0, int(u * (w - 1))))
    y = min(h - 1, max(0, int(v * (h - 1))))
    i = (y * w + x) * 4
    return px[i], px[i + 1], px[i + 2]


# Wheel centers in the imported Blender space (Z up, nose toward -Y).
WHEELS = ((0.30, -0.76, 0.30), (-0.30, -0.76, 0.30), (0.30, 0.56, 0.30), (-0.30, 0.56, 0.30))


def on_arch(center):
    # The flare is a fan of faces around the tyre. Recoloring part of that fan
    # turns the author's smooth arch into a sawtooth, so the flare keeps its texture.
    for wx, wy, wz in WHEELS:
        horiz = ((center.x - wx) ** 2 + (center.y - wy) ** 2) ** 0.5
        if horiz < 0.46 and center.z > wz - 0.05:
            return True
    return False


def classify_body(r, g, b, center):
    y, z = center.y, center.z
    if r > 0.9 and g > 0.65 and b < 0.45 and y < -0.9:
        return LAMP
    if r > 0.7 and g < 0.5 and b < 0.45 and y > 0.8:
        return TAIL
    if b > 0.90 and g > 0.85 and r > 0.72 and b > r + 0.04:
        return GLASS
    if r > 0.90 and g > 0.90 and b > 0.90 and z < 0.45:
        return PLATE
    if g > r + 0.18 and g > b + 0.05:
        return PAINT
    if max(r, g, b) - min(r, g, b) < 0.18:
        if on_arch(center):
            return BODY
        if z > 0.98:
            return BODY
        if y > 0.25 and z > 0.62:
            return BODY
        if z < 0.80:
            return TRIM
    return BODY


def tag_faces(obj, kinds):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.faces.layers.int.new('kind')
    for face, kind in zip(bm.faces, kinds):
        face[layer] = kind
    bm.to_mesh(obj.data)
    bm.free()


def separate_kind(obj, kind, name):
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bm = bmesh.from_edit_mesh(obj.data)
    layer = bm.faces.layers.int['kind']
    any_sel = False
    for face in bm.faces:
        face.select = face[layer] == kind
        any_sel = any_sel or face.select
    bmesh.update_edit_mesh(obj.data)
    if not any_sel:
        bpy.ops.object.mode_set(mode='OBJECT')
        return None
    before = set(bpy.data.objects)
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    created = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if not created:
        raise RuntimeError(f'no mesh separated for {name}')
    created[0].name = name
    return created[0]


def assign_body_materials(obj, mats):
    me = obj.data
    # Keep the imported atlas on BODY faces. Everything else is a flat color.
    atlas = me.materials[0] if me.materials else None
    if atlas:
        atlas.name = 'body'
    me.materials.clear()
    order = [BODY, PAINT, TRIM, TAIL, PLATE]
    slot = {}
    if atlas:
        me.materials.append(atlas)
        slot[BODY] = 0
    for kind in order:
        if kind == BODY and atlas:
            continue
        if kind not in mats:
            continue
        slot[kind] = len(me.materials)
        me.materials.append(mats[kind])
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.faces.layers.int['kind']
    for face in bm.faces:
        face.material_index = slot.get(face[layer], 0)
    bm.to_mesh(me)
    bm.free()


def bake(obj):
    mw = obj.matrix_world.copy()
    for vert in obj.data.vertices:
        w = mw @ vert.co
        x, y, z = w.x * SCALE, w.y * SCALE, w.z * SCALE
        # +90° about Blender Z. After glTF export (+Y up) the nose is +X,
        # up is +Y, and the wheel axle is +Z, which is what the game expects.
        vert.co = Vector((-y, x, z))
    obj.matrix_world = Matrix.Identity(4)


def consistent_normals(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except RuntimeError:
        pass
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for poly in obj.data.polygons:
        poly.use_smooth = False


def give_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def add_box(name, center, half, mat):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for vert in bm.verts:
        vert.co.x = center.x + vert.co.x * half.x
        vert.co.y = center.y + vert.co.y * half.y
        vert.co.z = center.z + vert.co.z * half.z
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    give_material(obj, mat)
    return obj


def add_decal(name, center, normal, width, height, image):
    n = normal.normalized()
    up = Vector((0, 0, 1))
    tangent = up.cross(n)
    if tangent.length < 1e-4:
        tangent = Vector((1, 0, 0))
    tangent.normalize()
    bitangent = n.cross(tangent)
    bitangent.normalize()
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    corners = [(-1, 0), (1, 0), (1, 1), (-1, 1)]
    verts = []
    for su, sv in corners:
        co = center + tangent * (su * width * 0.5) + bitangent * ((sv - 0.5) * height)
        verts.append(bm.verts.new(co))
    face = bm.faces.new(verts)
    uv_layer = bm.loops.layers.uv.new('UVMap')
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for loop, uv in zip(face.loops, uvs):
        loop[uv_layer].uv = uv
    if face.normal.dot(n) < 0:
        bm.faces.ensure_lookup_table()
        bmesh.ops.reverse_faces(bm, faces=[face])
        # reversing flips the UV winding too; restore a left-to-right reading
        for loop, uv in zip(face.loops, uvs):
            loop[uv_layer].uv = uv
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mat = bpy.data.materials.new(name + '-mat')
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.55
    obj.data.materials.append(mat)
    return obj


def bounds_of(obj):
    xs, ys, zs = [], [], []
    for v in obj.data.vertices:
        xs.append(v.co.x)
        ys.append(v.co.y)
        zs.append(v.co.z)
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and obj.data.users > 1:
            obj.data = obj.data.copy()
    image = bpy.data.images['colormap']
    w, h = image.size
    px = list(image.pixels)
    body = bpy.data.objects['body']
    uv = body.data.uv_layers.active
    kinds = []
    counts = {i: 0 for i in range(7)}
    for poly in body.data.polygons:
        r, g, b = sample(poly, uv, px, w, h)
        center = body.matrix_world @ poly.center
        kind = classify_body(r, g, b, center)
        kinds.append(kind)
        counts[kind] += 1
    names = ['GLASS', 'LAMP', 'TAIL', 'PLATE', 'PAINT', 'TRIM', 'BODY']
    print('BODY KINDS', {names[k]: counts[k] for k in counts})
    tag_faces(body, kinds)

    wheel_kinds = {}
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH' or not obj.name.startswith('wheel-') or obj.name == 'wheel-back':
            continue
        wuv = obj.data.uv_layers.active
        tagged = []
        for poly in obj.data.polygons:
            r, g, b = sample(poly, wuv, px, w, h)
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            tagged.append(1 if lum > 0.34 else 0)
        wheel_kinds[obj.name] = tagged
        tag_faces(obj, tagged)
        print(obj.name, 'rim faces', sum(tagged), 'tire faces', len(tagged) - sum(tagged))

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for obj in meshes:
        bake(obj)
        consistent_normals(obj)

    mats = {
        PAINT: material('paint', (0.949, 0.769, 0.188), rough=0.42, metal=0.0),
        TRIM: material('trim', (0.07, 0.075, 0.08), rough=0.62, metal=0.0),
        TAIL: material('tail', (0.85, 0.12, 0.06), rough=0.35, emit=0.6),
        PLATE: material('plate', (0.82, 0.84, 0.86), rough=0.4),
        GLASS: material('glass', (0.03, 0.05, 0.07), rough=0.06, metal=0.85, double=True),
        LAMP: material('headlamp', (1.0, 0.93, 0.72), rough=0.18, emit=1.6),
    }
    glass = separate_kind(body, GLASS, 'h2-glass')
    lamps = separate_kind(body, LAMP, 'h2-headlamp')
    if glass:
        give_material(glass, mats[GLASS])
    if lamps:
        give_material(lamps, mats[LAMP])
    assign_body_materials(body, mats)
    body.name = 'h2-body'

    spare = bpy.data.objects.get('wheel-back')
    if spare:
        spare.name = 'h2-mounted-spare'
    n = 0
    for src_name in ('wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'):
        wheel = bpy.data.objects.get(src_name)
        if wheel is None:
            print('MISSING', src_name)
            continue
        before = set(bpy.data.objects)
        rim = separate_kind(wheel, 1, f'h2-rim{n}')
        wheel.name = f'h2-tire{n}'
        lo, hi = bounds_of(wheel)
        print(f'tire{n} blender bbox', [round(hi[i] - lo[i], 3) for i in range(3)], 'verts', len(wheel.data.vertices))
        if rim is None:
            print('NO RIM', src_name, 'new objects', [o.name for o in bpy.data.objects if o not in before])
        else:
            print(f'rim{n}', rim.name, rim.type, 'verts', len(rim.data.vertices), 'faces', len(rim.data.polygons), 'mesh', rim.data.name)
        n += 1

    roof = max(v.co.z for v in body.data.vertices)
    bar_mat = material('lightbar', (1.0, 0.69, 0.0), rough=0.4, emit=1.8)
    # Blender X is game-forward, Blender Y is game -Z, Blender Z is game-up.
    add_box('h2-lightbar', Vector((0.02, 0.0, roof + 0.045)), Vector((0.08, 0.32, 0.04)), bar_mat)

    decal_image = bpy.data.images.load(DECAL)
    sides = []
    for poly in body.data.polygons:
        mat = body.data.materials[poly.material_index]
        if mat.name != 'paint':
            continue
        normal = poly.normal
        if abs(normal.y) < 0.8:
            continue
        center = poly.center
        if not (0.55 < center.z < 1.35 and -0.15 < center.x < 1.05):
            continue
        sides.append((abs(poly.area), normal.copy(), center + normal.normalized() * 0.012, normal.y > 0))
    print('decal candidates', len(sides))
    placed = {}
    for area, normal, center, positive in sorted(sides, reverse=True):
        key = 'pos' if positive else 'neg'
        if key in placed:
            continue
        placed[key] = center
        add_decal('h2-pace-mark' if key == 'neg' else 'h2-pace-mark-b', center, normal, 0.70, 0.16, decal_image)
        print('decal', key, [round(c, 3) for c in center], 'n', [round(c, 3) for c in normal])

    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)

    print('OBJECTS', [(o.name, len(o.data.polygons)) for o in bpy.data.objects if o.type == 'MESH'])
    if glass:
        lo, hi = bounds_of(glass)
        print('GLASS Z', round(lo[2], 3), round(hi[2], 3), 'X', round(lo[0], 3), round(hi[0], 3))

    os.makedirs(OUT, exist_ok=True)
    for filename in ('h2.glb', 'h2-low.glb'):
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(OUT, filename),
            export_format='GLB',
            export_apply=True,
            export_yup=True,
            export_texcoords=True,
            export_normals=True,
            export_materials='EXPORT',
            export_lights=False,
            export_cameras=False,
        )
        print('exported', filename, os.path.getsize(os.path.join(OUT, filename)))

    # Local preview, same orientation the game will load after the exporter's Y-up conversion.
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    world = bpy.data.worlds.new('preview')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.55, 0.62, 0.70, 1)
    bg.inputs[1].default_value = 1.0
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.2
    sun_obj = bpy.data.objects.new('sun', sun)
    scene.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (0.9, 0.2, 0.8)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 48
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0.1, 0.0, 0.85))
    views = {
        'front': Vector((5.2, 2.4, 1.15)),
        'side': Vector((0.2, -5.6, 1.15)),
        'rear': Vector((-5.2, -2.2, 1.15)),
        'corner': Vector((3.4, -3.6, 1.35)),
    }
    preview = '/tmp/suv-dressed'
    os.makedirs(preview, exist_ok=True)
    for name, pos in views.items():
        cam.location = pos
        cam.rotation_euler = (target - pos).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(preview, name + '.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
