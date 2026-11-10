# Original Hummer H2 pace-car generator. Shape only: no wordmark, badge, or
# downloaded mesh. Dimensions are the published 2003 H2, in metres.
#   blender --background --python scripts/build_h2.py -- --out assets/models
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

IN = 0.0254
L = 189.8 * IN
W = 81.2 * IN
H = 77.8 * IN
WB = 122.8 * IN
FOH = 32.6 * IN
ROH = 34.6 * IN
TRACK = 69.4 * IN
FA = WB / 2
RA = -WB / 2
NOSE = FA + FOH
TAIL = RA - ROH
TIRE_R = 35 * IN / 2
RIM_R = 17 * IN / 2

# One roof. The glass band is ~40% of the yellow side (rocker to roof).
BELT = 1.26
ROCK = 0.48
ROOF = 1.90
GLASS_BOT = 1.32
GLASS_TOP = 1.82
HALF_W = W / 2


def lerp(a, b, t):
    if isinstance(a, tuple):
        return tuple(lerp(x, y, t) for x, y in zip(a, b))
    return a + (b - a) * t


def clamp(v, a, b):
    return max(a, min(b, v))


def smooth(t):
    t = clamp(t, 0, 1)
    return t * t * (3 - 2 * t)


def hood_z(x, y):
    """Flat hood, a shut-line drop, and the H2's cowl-corner bulges."""
    t = clamp((x - 1.12) / (2.22 - 1.12), 0, 1)
    base = lerp(1.40, 1.18, t)
    yn = abs(y)
    crown = 0.010 * (1 - min(1, (yn / 0.86) ** 2))
    # Raised corners just ahead of the windshield, where the real hood swells.
    bulge = 0.038 * math.exp(-((yn - 0.48) / 0.16) ** 2) * math.exp(-((x - 1.48) / 0.28) ** 2)
    crease = smooth(clamp((yn - 0.74) / 0.14, 0, 1)) * 0.028
    return base + crown + bulge - crease


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.update()
    obj = bpy.data.objects.new(name, me)
    if mat:
        obj.data.materials.append(mat)
    return link(obj)


def finish(obj, bevel=0.011, segs=2, angle=38):
    """Small bevel on every panel edge, then weighted normals so the faces stay flat."""
    obj.data.use_auto_smooth = True
    obj.data.auto_smooth_angle = math.radians(55)
    bev = obj.modifiers.new('Bevel', 'BEVEL')
    bev.width = bevel
    bev.segments = segs
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(angle)
    bev.affect = 'EDGES'
    bev.miter_outer = 'MITER_ARC'
    wn = obj.modifiers.new('WN', 'WEIGHTED_NORMAL')
    wn.keep_sharp = True
    wn.weight = 50
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers):
        try:
            with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
                bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as exc:
            print('modifier failed', obj.name, mod.name, exc)
    obj.select_set(False)
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.use_auto_smooth = True
    return obj


def shade_flat_edges(obj, angle_deg=50):
    me = obj.data
    me.use_auto_smooth = True
    me.auto_smooth_angle = math.radians(angle_deg)


def make_mat(name, color, metal=0.0, rough=0.45, coat=0.0, coat_rough=0.25, emit=0.0, emit_color=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.blend_method = 'OPAQUE'
    mat.use_backface_culling = name != 'glass'
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    def put(keys, value):
        for k in keys:
            if k in bsdf.inputs:
                sock = bsdf.inputs[k]
                if sock.type == 'RGBA':
                    if isinstance(value, (int, float)):
                        sock.default_value = (value, value, value, 1)
                    else:
                        sock.default_value = tuple(value) + ((1,) if len(value) == 3 else ())
                else:
                    sock.default_value = value
                return
    put(['Base Color'], color)
    put(['Metallic'], metal)
    put(['Roughness'], rough)
    put(['Coat Weight', 'Clearcoat'], coat)
    put(['Coat Roughness', 'Clearcoat Roughness'], coat_rough)
    if emit:
        put(['Emission Color', 'Emission'], emit_color or color)
        put(['Emission Strength'], emit)
    return mat


def box(name, center, size, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    cx, cy, cz = center
    for v in bm.verts:
        v.co.x = v.co.x * sx + cx
        v.co.y = v.co.y * sy + cy
        v.co.z = v.co.z * sz + cz
    return mesh_obj(name, bm, mat)


def cyl(name, radius, depth, loc, rot, mat, verts=32):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=radius, radius2=radius, depth=depth)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[2], 4, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=loc)
    return mesh_obj(name, bm, mat)


def apply_bool(target, cutter, op='DIFFERENCE'):
    mod = target.modifiers.new('Bool', 'BOOLEAN')
    mod.operation = op
    mod.object = cutter
    mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    try:
        with bpy.context.temp_override(object=target, active_object=target, selected_objects=[target], selected_editable_objects=[target]):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        print('bool failed', target.name, op, exc)
    target.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return target


def join(name, objects, mat):
    bm = bmesh.new()
    for obj in objects:
        if obj is None:
            continue
        tmp = bmesh.new()
        tmp.from_mesh(obj.data)
        tmp.transform(obj.matrix_world)
        mapping = {}
        tmp.verts.ensure_lookup_table()
        for v in tmp.verts:
            mapping[v.index] = bm.verts.new(v.co.copy())
        bm.verts.ensure_lookup_table()
        for f in tmp.faces:
            try:
                bm.faces.new([mapping[v.index] for v in f.verts])
            except ValueError:
                pass
        tmp.free()
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.003)
    obj = mesh_obj(name, bm, mat)
    for o in objects:
        if o is not None and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    return obj


def grille_tube(mat, low):
    """Rounded-rectangle chrome tube, lying in the YZ plane."""
    half_w, half_h, rad = 0.90, 0.175, 0.07
    hw, hh = half_w - rad, half_h - rad
    segs = []
    def add_line(a, b, n):
        for i in range(n):
            t = i / n
            segs.append(lerp(a, b, t))
    def add_arc(cx, cz, a0, a1, n):
        for i in range(n):
            a = lerp(a0, a1, i / n)
            segs.append((cx + math.cos(a) * rad, cz + math.sin(a) * rad))
    n_w = 6 if low else 10
    n_h = 2 if low else 3
    n_c = 3 if low else 4
    # start bottom, -Y, going +Y. Y is lateral, Z is up. Center of tube at local 0.
    add_line((-hw, -half_h), (hw, -half_h), n_w)
    add_arc(hw, -hh, -math.pi / 2, 0, n_c)
    add_line((half_w, -hh), (half_w, hh), n_h)
    add_arc(hw, hh, 0, math.pi / 2, n_c)
    add_line((hw, half_h), (-hw, half_h), n_w)
    add_arc(-hw, hh, math.pi / 2, math.pi, n_c)
    add_line((-half_w, hh), (-half_w, -hh), n_h)
    add_arc(-hw, -hh, math.pi, math.pi * 1.5, n_c)
    curve = bpy.data.curves.new('grille', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = 0.034
    curve.bevel_resolution = 2 if low else 3
    curve.splines.new('POLY')
    sp = curve.splines[0]
    sp.points.add(len(segs) - 1)
    for p, (y, z) in zip(sp.points, segs):
        p.co = (0, y, z, 1)
    sp.use_cyclic_u = True
    obj = bpy.data.objects.new('h2-chrome-grille', curve)
    obj.location = (2.345, 0, 1.02)
    obj.data.materials.append(mat)
    return link(obj)


def ggrid(bm, nu, nv, fn, flip=False):
    rows = []
    for i in range(nu + 1):
        rows.append([bm.verts.new(Vector(fn(i / max(nu, 1), j / max(nv, 1)))) for j in range(nv + 1)])
    for i in range(nu):
        for j in range(nv):
            quad = (rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]) if flip else (rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1])
            try:
                bm.faces.new(quad)
            except ValueError:
                pass


def arch_z(x, axle, rad=0.62):
    dx = (x - axle) / rad
    if abs(dx) >= 1:
        return None
    return 0.42 + math.sqrt(max(0.0, 1 - dx * dx)) * rad


def build_body(paint, trim, chrome, glass, lamp, amber, fog, tail, low):
    bevel = 0.008 if low else 0.012
    segs = 1 if low else 2
    # Solid lower body. Booleans only work on a closed mesh, so this starts as a box.
    body = box('h2-body', (-0.02, 0, (0.42 + BELT) / 2), (4.54, HALF_W * 2, BELT - 0.42), paint)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=2 if low else 3, use_grid_fill=True)
    # Hood: flat center, shut-line drop, cowl-corner bulges.
    for v in bm.verts:
        if v.co.z > BELT - 0.08 and v.co.x > 1.05:
            v.co.z = hood_z(v.co.x, v.co.y)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    for axle in (FA, RA):
        cutter = cyl('arch-cut', 0.60, 3.2, (axle, 0, 0.46), (math.pi / 2, 0, 0), None, 24 if low else 32)
        apply_bool(body, cutter, 'DIFFERENCE')
    # Closed cabin, raked windshield, sitting on the belt. Union keeps the body solid.
    cabin = box('cabin', (-0.46, 0, (BELT + ROOF) / 2), (3.24, 1.76, ROOF - BELT), paint)
    bm = bmesh.new()
    bm.from_mesh(cabin.data)
    for v in bm.verts:
        if v.co.z > (BELT + ROOF) * 0.5 and v.co.x > 0.2:
            v.co.x = 0.78
        if v.co.z > (BELT + ROOF) * 0.5 and v.co.x < -1.0:
            v.co.x = -1.96
        if v.co.z > ROOF - 0.04:
            v.co.z = ROOF + 0.016 * (1 - min(1.0, (abs(v.co.y) / 0.9) ** 2))
    bm.to_mesh(cabin.data)
    bm.free()
    apply_bool(body, cabin, 'UNION')
    # Window recesses. Cutters stop at y=0.72 so they do not pierce the cabin.
    windows = ((0.78, 1.34, 1.80), (-0.34, 1.34, 1.76), (-1.32, 1.50, 1.70))
    sizes = ((0.50, 0.36, 0.44), (1.16, 0.36, 0.40), (0.30, 0.36, 0.20))
    for (cx, z0, z1), (sx, sy, sz) in zip(windows, sizes):
        for s in (1, -1):
            cutter = box('win-cut', (cx, 0.90 * s, (z0 + z1) / 2), (sx, sy, sz), None)
            apply_bool(body, cutter, 'DIFFERENCE')
    me = body.data
    me.calc_loop_triangles()
    print('solid body tris', len(me.loop_triangles), 'verts', len(me.vertices))
    yw = 1.02

    finish(body, bevel=bevel, segs=segs, angle=40)

    # Glass sits in the openings, just proud enough to seal them.
    panes = []
    def pane(name_unused, verts):
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in verts]
        bm.faces.new(vs)
        bm.normal_update()
        panes.append(bm)
    # windshield
    def wind(u, v):
        return (lerp(1.145, 0.80, v) + 0.008 * (1 - u * u), u * lerp(0.72, 0.62, v), lerp(1.34, 1.84, v))
    # build a small grid so the bow is real
    bm = bmesh.new()
    nu, nv = (6, 5) if low else (10, 8)
    grid = []
    for i in range(nu + 1):
        row = []
        for j in range(nv + 1):
            row.append(bm.verts.new(wind(i / nu * 2 - 1, j / nv)))
        grid.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    glass_obj_parts = [mesh_obj('h2-glass-wind', bm, glass)]
    bm = bmesh.new()
    nu, nv = (6, 4) if low else (8, 6)
    grid = []
    for i in range(nu + 1):
        row = []
        for j in range(nv + 1):
            u = i / nu * 2 - 1
            v = j / nv
            row.append(bm.verts.new((lerp(-2.18, -2.00, v), u * lerp(0.66, 0.54, v), lerp(1.38, 1.82, v))))
        grid.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    glass_obj_parts.append(mesh_obj('h2-glass-rear', bm, glass))
    for s in (1, -1):
        y = 0.86 * s
        # Slightly larger than the holes, and just outboard of the cabin wall.
        quads = [
            [(1.08, y, GLASS_BOT), (0.42, y, GLASS_BOT), (0.42, y, GLASS_TOP), (0.78, y, GLASS_TOP + 0.02)],
            [(0.38, y, GLASS_BOT), (-1.02, y, GLASS_BOT), (-1.02, y, GLASS_TOP - 0.02), (0.38, y, GLASS_TOP)],
            [(-1.08, y, 1.46), (-1.50, y, 1.50), (-1.42, y, 1.74), (-1.08, y, 1.72)],
        ]
        for q in quads:
            bm = bmesh.new()
            vs = [bm.verts.new(p) for p in q]
            try:
                bm.faces.new(vs if s > 0 else list(reversed(vs)))
            except ValueError:
                bm.faces.new(vs)
            glass_obj_parts.append(mesh_obj('h2-glass-side', bm, glass))
    glass_obj = join('h2-glass', glass_obj_parts, glass)

    # Chrome grille tube and the seven slots, lamps inside the surround.
    tube = grille_tube(chrome, low)
    # convert curve to mesh so the GLB is a plain mesh
    bpy.context.view_layer.objects.active = tube
    tube.select_set(True)
    with bpy.context.temp_override(object=tube, active_object=tube, selected_objects=[tube], selected_editable_objects=[tube]):
        bpy.ops.object.convert(target='MESH')
    tube.select_set(False)
    tube.name = 'h2-chrome'
    bars = []
    for i in range(7):
        zbar = -0.46 + i * (0.92 / 6)
        bars.append(box('bar', (2.372, zbar, 1.03), (0.02, 0.032, 0.26), chrome))
    # Wait: Y is lateral. I used zbar as the second component but box() is (x, y, z). Fix below.
    # The loop above passed zbar as Y. That is correct (lateral). Good.
    red = box('h2-tail-line', (2.378, 0, 0.90), (0.012, 0.95, 0.012), tail)
    chrome_obj = join('h2-chrome', [tube] + bars, chrome)

    # Round lamps inside the frame. Cylinders along X.
    lenses = []
    bezels = []
    for s in (1, -1):
        lenses.append(cyl('h2-headlamp', 0.105, 0.03, (2.385, 0.66 * s, 1.03), (0, math.pi / 2, 0), lamp, 20 if low else 28))
        # torus bezel
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=24 if not low else 16, radius1=0.122, radius2=0.122, depth=0.02)
        # a thin ring: use a torus via spin of a small circle is heavier; a flat ring is enough
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 4, 'Y'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(2.392, 0.66 * s, 1.03))
        bezels.append(mesh_obj('bezel', bm, chrome))
        # amber corner, on the fender just outside the tube
        box('h2-marker', (2.30, 0.98 * s, 1.00), (0.03, 0.09, 0.045), amber)
    # fog lamps in the bumper
    for s in (1, -1):
        cyl('h2-fog', 0.055, 0.03, (2.40, 0.62 * s, 0.58), (0, math.pi / 2, 0), fog, 16)
    head = join('h2-headlamp', lenses, lamp)
    if bezels:
        join('h2-chrome-bez', bezels, chrome)

    # Chunky bumper, flares, rockers, scoop, mirrors.
    bumper = box('h2-trim-bumper', (2.28, 0, 0.62), (0.24, 2.00, 0.52), trim)
    finish(bumper, bevel=0.02 if not low else 0.012, segs=segs, angle=50)
    # corner returns
    for s in (1, -1):
        box('h2-trim', (2.12, 1.00 * s, 0.58), (0.28, 0.16, 0.42), trim)
    # skid
    box('h2-chrome-skid', (2.05, 0, 0.36), (0.32, 1.05, 0.04), chrome)
    # center scoop
    scoop = box('h2-trim-scoop', (1.72, 0, hood_z(1.72, 0) + 0.012), (0.78, 0.46, 0.02), trim)
    for i in range(5):
        box('slot', (1.48 + i * 0.12, 0, hood_z(1.6, 0) + 0.02), (0.08, 0.36, 0.008), trim)
    # flares
    for axle in (FA, RA):
        for s in (1, -1):
            flare = cyl('flare', 0.56, 0.08, (axle, 1.04 * s, 0.46), (math.pi / 2, 0, 0), trim, 20 if low else 28)
            # keep only the upper half roughly by a difference? full ring is ok behind the body; the visible lip is the part outside.
    # running boards
    for s in (1, -1):
        cyl('h2-trim-step', 0.03, 2.05, (-0.1, 1.08 * s, 0.40), (0, math.pi / 2, 0), trim, 10)
    # mirrors: black housing, short arm
    for s in (1, -1):
        box('h2-trim-arm', (1.02, 1.10 * s, 1.50), (0.04, 0.10, 0.04), trim)
        box('h2-trim-mirror', (0.98, 1.18 * s, 1.56), (0.18, 0.07, 0.11), trim)
        # reflective face
        bm = bmesh.new()
        y = 1.22 * s
        vs = [(-0.06, y, 1.51), (0.08, y, 1.51), (0.08, y, 1.61), (-0.06, y, 1.61)]
        bmv = [bm.verts.new(p) for p in vs]
        bm.faces.new(bmv if s < 0 else list(reversed(bmv)))
        mesh_obj('h2-chrome-mirror', bm, chrome)
    # tail lamps
    for s in (1, -1):
        box('h2-tail', (-2.36, 0.78 * s, 1.05), (0.04, 0.10, 0.36), tail)
    # door handles
    for s in (1, -1):
        box('h2-trim-handle', (0.62, 1.04 * s, 1.12), (0.14, 0.02, 0.035), trim)
        box('h2-trim-handle', (-0.40, 1.04 * s, 1.12), (0.14, 0.02, 0.035), trim)
    # rocker cladding
    for s in (1, -1):
        box('h2-trim-rock', (-0.2, 1.04 * s, 0.52), (3.3, 0.04, 0.16), trim)

    # Collect trim into one object except we already created many. Join all trim-named.
    trims = [o for o in bpy.context.scene.objects if o.type == 'MESH' and (o.name.startswith('h2-trim') or o.name.startswith('flare') or o.name == 'slot')]
    if trims:
        join('h2-trim', trims, trim)
    chromes = [o for o in list(bpy.context.scene.objects) if o.type == 'MESH' and 'chrome' in o.name and o.name != 'h2-chrome']
    # h2-chrome already exists; join the extras into it
    extra = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('h2-chrome') and o.name != 'h2-chrome']
    # also bars already joined. skid and mirror faces:
    more = [o for o in bpy.context.scene.objects if o.type == 'MESH' and ('skid' in o.name or 'mirror' in o.name or o.name.startswith('h2-chrome-'))]
    base = bpy.data.objects.get('h2-chrome')
    if base and more:
        more = [o for o in more if o != base]
        if more:
            joined = join('h2-chrome', [base] + more, chrome)
            joined.name = 'h2-chrome'

    return body, glass_obj, head


def build_wheel(mat_tire, mat_rim, low):
    seg = 24 if low else 48
    # Tire profile in XZ, spun around Y? create_cone is along Z. We'll spin a profile around Y
    # by building the surface directly: angle around XZ, width along Y.
    profile = [
        (0.50, -0.05), (0.58, -0.28), (0.70, -0.44), (0.84, -0.50),
        (0.93, -0.40), (0.99, -0.22), (1.00, -0.08), (1.00, 0.08),
        (0.99, 0.22), (0.93, 0.40), (0.84, 0.50), (0.70, 0.44),
        (0.58, 0.28), (0.50, 0.05),
    ]
    tw = 0.165  # half of a 330 mm section, but the tuples are fractions of TIRE width
    width = 0.33
    bm = bmesh.new()
    rings = []
    blocks = 14 if low else 18
    for i in range(seg):
        a = i / seg * math.pi * 2
        c, s = math.cos(a), math.sin(a)
        ring = []
        on_block = (i % max(1, seg // blocks)) < (seg // blocks) * 0.55
        for k, zf in profile:
            r = TIRE_R * k
            y = zf * width
            # tread blocks on the crown only
            if on_block and abs(zf) < 0.18:
                r += 0.02
            ring.append(bm.verts.new((c * r, y, s * r)))
        rings.append(ring)
    n = len(profile)
    for i in range(seg):
        i2 = (i + 1) % seg
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((rings[i][k], rings[i2][k], rings[i2][k2], rings[i][k2]))
    tire = mesh_obj('h2-tire', bm, mat_tire)
    for p in tire.data.polygons:
        p.use_smooth = True
    tire.data.use_auto_smooth = True
    tire.data.auto_smooth_angle = math.radians(60)

    # Deep-dish 6-spoke. Spokes are faceted boxes, lip sits proud.
    parts = []
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=seg, radius1=0.205, radius2=0.205, depth=0.028)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 4, 'X'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0.12, 0))
    parts.append(mesh_obj('lip', bm, mat_rim))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=seg, radius1=0.198, radius2=0.198, depth=0.02)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 4, 'X'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0.03, 0))
    parts.append(mesh_obj('barrel', bm, mat_rim))
    # center cap
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16 if low else 20, radius1=0.072, radius2=0.062, depth=0.03)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 4, 'X'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0.145, 0))
    parts.append(mesh_obj('cap', bm, mat_rim))
    # Six thick faceted spokes, set back from the lip so the wheel is dished.
    sbm = bmesh.new()
    for i in range(6):
        a = i / 6 * math.pi * 2
        ca, sa = math.cos(a), math.sin(a)
        tx, tz = -sa, ca
        def ring(r, y, half, thick):
            return [
                (ca * r + tx * half, y, sa * r + tz * half),
                (ca * r - tx * half, y, sa * r - tz * half),
                (ca * r - tx * half, y + thick, sa * r - tz * half),
                (ca * r + tx * half, y + thick, sa * r + tz * half),
            ]
        for sign in (1,):
            inner = ring(0.05, 0.05, 0.042, 0.035)
            outer = ring(0.19, 0.10, 0.05, 0.04)
            vs = [sbm.verts.new(p) for p in inner + outer]
            faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (3, 2, 1, 0), (4, 5, 6, 7)]
            for f in faces:
                try:
                    sbm.faces.new([vs[k] for k in f])
                except ValueError:
                    pass
    parts.append(mesh_obj('spokes', sbm, mat_rim))
    rim = join('h2-rim', parts, mat_rim)
    for p in rim.data.polygons:
        p.use_smooth = False
    return tire, rim


def place_wheels(tire, rim, low):
    half = TRACK / 2
    spots = [(FA, half, TIRE_R), (FA, -half, TIRE_R), (RA, half, TIRE_R), (RA, -half, TIRE_R)]
    tires, rims = [], []
    for i, (x, y, z) in enumerate(spots):
        t = tire.copy()
        t.data = tire.data
        t.location = (x, y, z)
        t.rotation_euler = (0, 0, math.pi if y < 0 else 0)
        t.name = 'h2-tire'
        link(t)
        tires.append(t)
        r = rim.copy()
        r.data = rim.data
        r.location = (x, y, z)
        r.rotation_euler = (0, 0, math.pi if y < 0 else 0)
        r.name = 'h2-rim'
        link(r)
        rims.append(r)
    # spare faces the tail. Rotate the object so local +Y (face) points toward -X.
    spare = tire.copy()
    spare.data = tire.data
    spare.name = 'h2-spare'
    spare.location = (TAIL - 0.12, 0, 1.08)
    spare.rotation_euler = (0, 0, math.pi / 2)
    link(spare)
    spare_r = rim.copy()
    spare_r.data = rim.data
    spare_r.name = 'h2-spare-rim'
    spare_r.location = spare.location
    spare_r.rotation_euler = spare.rotation_euler
    link(spare_r)
    bpy.data.objects.remove(tire, do_unlink=True)
    bpy.data.objects.remove(rim, do_unlink=True)
    return tires


def consolidate():
    keep = ('h2-tire', 'h2-rim', 'h2-spare', 'h2-glass', 'h2-headlamp', 'h2-body')
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH' or any(obj.name.startswith(k) for k in keep):
            continue
        mat = obj.data.materials[0] if obj.data.materials else None
        groups.setdefault(mat.name if mat else 'misc', []).append(obj)
    for key, objs in groups.items():
        if not objs:
            continue
        mat = objs[0].data.materials[0] if objs[0].data.materials else None
        joined = join('h2-' + key, objs, mat)
        joined.name = 'h2-' + key


def export(path):
    consolidate()
    # Drop leftover cutters and hidden helpers.
    for obj in list(bpy.context.scene.objects):
        if obj.hide_render or obj.name.startswith('cut') or obj.name.startswith('arch'):
            bpy.data.objects.remove(obj, do_unlink=True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        use_selection=False,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
        export_normals=True,
    )
    tris = 0
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            tris += len(obj.data.loop_triangles) if obj.data.loop_triangles else sum(len(p.vertices) - 2 for p in obj.data.polygons)
            obj.data.calc_loop_triangles()
            tris = 0
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
        print(f'  {obj.name:22} {len(obj.data.loop_triangles):6} tris')
    print('TOTAL', tris, path)


def workbench(path, loc, target, ortho=False, scale=4.2):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = False
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO' if ortho else 'PERSP'
    if ortho:
        cam_data.ortho_scale = scale
    else:
        cam_data.lens = 35
        cam_data.sensor_width = 36
    cam = bpy.data.objects.new('cam', cam_data)
    link(cam)
    cam.location = loc
    direction = Vector(target) - Vector(loc)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.color = (0.55, 0.62, 0.68)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def build(low, out_dir, preview):
    reset_scene()
    paint = make_mat('paint', (0.86, 0.42, 0.015), metal=0.02, rough=0.38, coat=0.55, coat_rough=0.22)
    trim = make_mat('trim', (0.02, 0.02, 0.022), metal=0.06, rough=0.72)
    chrome = make_mat('chrome', (0.85, 0.88, 0.9), metal=1.0, rough=0.12)
    glass = make_mat('glass', (0.01, 0.015, 0.02), metal=0.85, rough=0.06, coat=1.0, coat_rough=0.04)
    lamp = make_mat('lamp', (0.85, 0.9, 0.95), metal=0.05, rough=0.12, emit=1.2, emit_color=(0.75, 0.85, 1.0))
    amber = make_mat('amber', (1.0, 0.45, 0.05), metal=0.0, rough=0.35, emit=1.4, emit_color=(1.0, 0.45, 0.02))
    fog = make_mat('fog', (0.95, 0.93, 0.85), metal=0.05, rough=0.2, emit=0.6, emit_color=(1.0, 0.95, 0.8))
    tail = make_mat('tail', (0.45, 0.02, 0.01), metal=0.1, rough=0.35, emit=0.8, emit_color=(0.8, 0.02, 0.0))
    # names the exporter will keep
    paint.name = 'paint'
    build_body(paint, trim, chrome, glass, lamp, amber, fog, tail, low)
    tire, rim = build_wheel(make_mat('tire', (0.012, 0.012, 0.012), rough=0.92), make_mat('rim', (0.55, 0.58, 0.60), metal=0.9, rough=0.28), low)
    place_wheels(tire, rim, low)
    # Force the material names the loader looks up, and unique object names the audit needs.
    # Blender uniquifies object names; the loader accepts the h2-tire prefix.
    path = os.path.join(out_dir, 'h2-low.glb' if low else 'h2.glb')
    export(path)
    if preview and not low:
        workbench(os.path.join(preview, 'blend-side.png'), (0, -7.2, 1.15), (0, 0, 0.95), ortho=True, scale=5.4)
        workbench(os.path.join(preview, 'blend-front.png'), (6.2, 0.01, 1.15), (0.4, 0, 0.95), ortho=False)
        workbench(os.path.join(preview, 'blend-34.png'), (4.6, -3.4, 1.25), (0.15, 0.05, 0.95), ortho=False)
        workbench(os.path.join(preview, 'blend-rear.png'), (-5.4, -3.2, 1.25), (-0.2, 0, 1.0), ortho=False)


def main():
    argv = sys.argv
    out = 'assets/models'
    preview = '/tmp/h2shots'
    if '--' in argv:
        args = argv[argv.index('--') + 1:]
        if '--out' in args:
            out = args[args.index('--out') + 1]
        if '--preview' in args:
            preview = args[args.index('--preview') + 1]
    os.makedirs(preview, exist_ok=True)
    out = os.path.abspath(out)
    print('building high')
    build(False, out, preview)
    print('building low')
    build(True, out, None)


if __name__ == '__main__':
    main()
