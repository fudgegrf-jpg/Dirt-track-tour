# Original compact performance pace SUV for Dirt Track Tour.
# Built in this script. Not a branded vehicle and not the CC0 Hummer mesh.
#
#   blender --background --python scripts/build_pace_suv.py
#
# Blender is Z-up, +X forward, +Y to the left. The glTF export turns that into
# three.js +X forward, +Y up, axle along Z, which is what auditPaceCar expects.
import bpy
import bmesh
import math
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'models')

# Compact performance SUV. Origin on the ground, midway between the axles.
FRONT_X = 1.36
REAR_X = -1.40
HALF_TRACK = 0.82
TIRE_R = 0.390
TIRE_HW = 0.116
WHEEL_Z = 0.398
ARCH_R = 0.470
NOSE_X = 2.26
TAIL_X = -2.18


def clamp(v, a, b):
    return max(a, min(b, v))


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def srgb(r, g, b):
    return (r / 255, g / 255, b / 255, 1)


def set_in(node, names, value):
    for name in names:
        sock = node.inputs.get(name)
        if sock is not None:
            sock.default_value = value
            return


def make_mat(name, color, metal, rough, emit=None, emit_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = name != 'glass'
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(bsdf, ['Base Color'], color)
    set_in(bsdf, ['Metallic'], metal)
    set_in(bsdf, ['Roughness'], rough)
    if emit is not None:
        set_in(bsdf, ['Emission Color', 'Emission'], emit)
        set_in(bsdf, ['Emission Strength'], emit_strength)
    mat['bucket'] = name
    return mat


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def shade(obj, angle=50):
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    try:
        mesh.calc_normals_split()
    except Exception:
        pass
    mesh.update()


def wheel_flare(x):
    f = 0.0
    for axle in (FRONT_X, REAR_X):
        f = max(f, math.exp(-((x - axle) / 0.38) ** 2))
    return f


def width_at(x):
    """Half-width of the outer skin."""
    nose = smoothstep(1.55, NOSE_X, x)
    tail = smoothstep(-1.62, TAIL_X, x)
    base = 0.955
    base = lerp(base, 0.78, nose)
    base = lerp(base, 0.84, tail)
    return base + 0.025 * wheel_flare(x) * (1.0 - max(nose, tail))


def roof_z(x):
    # Blunt nose, flat hood, tall cabin. An upright SUV, not a melted sedan.
    if x >= 1.72:
        return lerp(1.20, 1.04, smoothstep(1.72, NOSE_X, x))
    if x >= 0.62:
        return lerp(1.76, 1.20, smoothstep(0.62, 1.72, x))
    if x >= -0.70:
        return 1.78
    if x >= -1.55:
        return lerp(1.78, 1.28, smoothstep(-0.70, -1.55, x))
    return lerp(1.28, 0.96, smoothstep(-1.55, TAIL_X, x))


def arch_peak(x):
    """Opening height where a station cuts a wheel, else None."""
    best = None
    for axle in (FRONT_X, REAR_X):
        dx = x - axle
        if abs(dx) >= ARCH_R:
            continue
        z = WHEEL_Z + math.sqrt(ARCH_R * ARCH_R - dx * dx)
        best = z if best is None else max(best, z)
    return best


def section(x):
    """Closed ring around the body at station x. (y, z) pairs, +Y then -Y."""
    w = width_at(x)
    roof = roof_z(x)
    peak = arch_peak(x)
    belt = min(1.16 + 0.02 * wheel_flare(x), roof - 0.05)
    outer = 0.50
    if peak is not None and peak > 0.50:
        outer = min(peak, belt - 0.045)
    mid = clamp(max(0.78, outer + 0.10), outer + 0.04, belt - 0.02)
    lip_y = w - 0.046
    well_y = 0.66
    well_z = 0.34 if peak is None or peak < 0.55 else min(0.62, outer - 0.08)
    sill = 0.34
    belly = 0.305
    # Tuck the chin back so the bumper is not a vertical slab.
    def kx(z):
        # A small, even chin. A deeper tuck in the middle turned into a V.
        if x > 1.55 and z < 0.62:
            return x - 0.035 * smoothstep(1.55, NOSE_X, x)
        if x < -1.55 and z < 0.62:
            return x + 0.025 * smoothstep(-1.55, TAIL_X, x)
        return x

    shoulder = lerp(belt, roof, 0.62)
    rail_y = w * 0.64
    half = [
        (kx(belly), 0.0, belly),
        (kx(belly), 0.40, belly + 0.004),
        (kx(well_z), well_y, well_z),
        (kx(outer), lip_y, outer),
        (kx(outer), w, outer),
        (kx(mid), w, mid),
        (kx(belt), w * 0.992, belt),
        (kx(shoulder), w * 0.86, shoulder),
        (kx(roof), rail_y, roof - 0.012),
        (kx(roof), 0.0, roof),
    ]
    ring = list(half)
    for px, y, z in reversed(half[1:-1]):
        ring.append((px, -y, z))
    return ring


def stations():
    xs = []
    x = TAIL_X
    while x < NOSE_X - 1e-6:
        dx = 0.11
        for axle in (FRONT_X, REAR_X):
            if abs(x - axle) < 0.55:
                dx = 0.07
        xs.append(x)
        x += dx
    xs.append(NOSE_X)
    return xs


def build_body():
    xs = stations()
    rings = [section(x) for x in xs]
    n = len(rings[0])
    bm = bmesh.new()
    grid = []
    for ring in rings:
        grid.append([bm.verts.new(p) for p in ring])
    bm.verts.ensure_lookup_table()
    belt_edges = []
    lip_edges = []
    for i in range(len(grid) - 1):
        for j in range(n):
            a = grid[i][j]
            b = grid[i + 1][j]
            c = grid[i + 1][(j + 1) % n]
            d = grid[i][(j + 1) % n]
            try:
                f = bm.faces.new((a, b, c, d))
            except ValueError:
                continue
            # Point 6 in the half-ring is the belt, and its mirror is n-7.
            if j in (6, n - 7):
                belt_edges.extend(f.edges)
            if j in (4, n - 5):
                lip_edges.extend(f.edges)
    bm.faces.new(grid[0])
    bm.faces.new(list(reversed(grid[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    roof = max(bm.faces, key=lambda f: f.calc_center_median().z)
    if roof.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    crease = None
    if hasattr(bm.edges.layers, 'crease'):
        crease = bm.edges.layers.crease.verify()
    for e in bm.edges:
        if crease is not None:
            e[crease] = 0.0
        e.smooth = True
    for e in belt_edges:
        e.smooth = False
        if crease is not None:
            e[crease] = 0.92
    for e in lip_edges:
        e.smooth = False
        if crease is not None:
            e[crease] = 0.8
    # Door cuts: vertical edges nearest these stations, on the outer skin.
    for v in grid[0] + grid[-1]:
        for e in v.link_edges:
            e.smooth = False
            if crease is not None:
                e[crease] = 1.0
    for door_x in (0.95, 0.05, -0.78):
        i = min(range(len(xs)), key=lambda k: abs(xs[k] - door_x))
        for j in (4, 5, 6, n - 5, n - 6, n - 7):
            v = grid[i][j]
            for e in v.link_edges:
                other = e.other_vert(v)
                if abs(other.co.x - v.co.x) < 0.02 and abs(other.co.z - v.co.z) > 0.04:
                    e.smooth = False
                    if crease is not None:
                        e[crease] = max(e[crease], 0.85)
    mesh = bpy.data.meshes.new('h2-body')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('h2-body', mesh)
    link(obj)
    return obj


def subdivide(obj, level):
    mod = obj.modifiers.new('Sub', 'SUBSURF')
    mod.levels = level
    mod.render_levels = level
    mod.use_creases = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    shade(obj)


def recess_side_glass(obj):
    """Pull the window panels in so the glass can sit in a pocket."""
    windows = [
        (0.18, 0.92, 1.14, 1.50),
        (-0.72, 0.00, 1.14, 1.50),
    ]
    for v in obj.data.vertices:
        for x0, x1, z0, z1 in windows:
            if x0 < v.co.x < x1 and z0 < v.co.z < z1 and abs(v.co.y) > 0.55:
                fx = min(v.co.x - x0, x1 - v.co.x) / 0.08
                fz = min(v.co.z - z0, z1 - v.co.z) / 0.06
                t = clamp(min(fx, fz), 0.0, 1.0)
                if t <= 0:
                    continue
                v.co.y -= math.copysign(0.016 * t, v.co.y)
    # Windshield pocket, pushed back along X.
    for v in obj.data.vertices:
        if 0.55 < v.co.x < 1.42 and v.co.z > 1.18 and abs(v.co.y) < 0.72:
            t = clamp((v.co.z - 1.20) / 0.30, 0.0, 1.0) * clamp((1.40 - v.co.x) / 0.25, 0.0, 1.0)
            v.co.x -= 0.012 * t
    # Grille and lamp pocket in the nose.
    for v in obj.data.vertices:
        if v.co.x < 1.70 or not (0.58 < v.co.z < 1.02) or abs(v.co.y) > 0.78:
            continue
        dy = abs(v.co.y) / 0.74
        dz = abs(v.co.z - 0.80) / 0.22
        r = max(dy, dz)
        if r < 1.0:
            v.co.x -= 0.040 * (1.0 - r) ** 0.55
    obj.data.update()


def flatten_nose(obj):
    """Cut the rounded bulge off so the grille sits on a real front face."""
    xs = [v.co.x for v in obj.data.vertices if v.co.x > 1.85 and 0.48 < v.co.z < 1.06 and abs(v.co.y) < 0.7]
    if len(xs) < 8:
        return None
    xs.sort()
    plane = xs[len(xs) // 2]
    for v in obj.data.vertices:
        if v.co.x > 1.75 and 0.42 < v.co.z < 1.10 and abs(v.co.y) < 0.82:
            v.co.x = min(v.co.x, plane + 0.008)
    obj.data.update()
    print(f'  nose plane {plane:.3f}')
    return plane


def nose_x(obj, y, z):
    best = None
    for v in obj.data.vertices:
        if abs(v.co.y - y) < 0.08 and abs(v.co.z - z) < 0.06 and v.co.x > 1.4:
            best = v.co.x if best is None else max(best, v.co.x)
    return best if best is not None else 2.05


def new_mesh(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    link(obj)
    shade(obj)
    return obj


def add_box(bm, x0, x1, y0, y1, z0, z1):
    verts = [bm.verts.new(p) for p in (
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    )]
    faces = ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0))
    for f in faces:
        bm.faces.new(tuple(verts[i] for i in f))


def paint_cladding(body, paint, trim):
    """Black below a cut plane. Cutting the faces keeps the break a smooth line."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=Vector((0, 0, 0.46)),
        plane_no=Vector((0, 0, 1)),
    )
    bm.to_mesh(body.data)
    bm.free()
    body.data.materials.clear()
    body.data.materials.append(paint)
    body.data.materials.append(trim)
    for poly in body.data.polygons:
        poly.material_index = 1 if poly.center.z < 0.46 else 0
    body.data.update()


def build_glass():
    bm = bmesh.new()
    # A few millimetres thick so the end of the pane catches the audit ray.
    y = 0.956
    for sign in (1, -1):
        for x0, x1 in ((0.22, 0.78), (-0.62, -0.08)):
            add_box(bm, x0, x1, sign * y - 0.004, sign * y + 0.004, 1.22, 1.52)
    # Windshield, a single sheet leaned back.
    verts = []
    for yv, zv, xv in ((-0.70, 1.22, 1.36), (0.70, 1.22, 1.36), (0.62, 1.60, 0.62), (-0.62, 1.60, 0.62)):
        verts.append(bm.verts.new((xv, yv, zv)))
    bm.faces.new(verts)
    # Rear glass.
    rv = []
    for yv, zv, xv in ((-0.62, 1.58, -0.92), (0.62, 1.58, -0.92), (0.58, 1.24, -1.58), (-0.58, 1.24, -1.58)):
        rv.append(bm.verts.new((xv, yv, zv)))
    bm.faces.new(rv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_mesh('h2-glass', bm)


def build_grille(body):
    """A dark opening, a bright frame, and horizontal slats. Not a solid slab."""
    # Sit just proud of the highest yellow in the grille window, then the
    # body behind that window is pushed back so the casting cannot hide.
    front = nose_x(body, 0.0, 0.84)
    face = front + 0.006
    for v in body.data.vertices:
        in_grille = abs(v.co.y) < 0.47 and 0.62 < v.co.z < 0.98
        in_lamp = 0.50 < abs(v.co.y) < 0.68 and 0.66 < v.co.z < 0.94
        if (in_grille or in_lamp) and v.co.x > face - 0.05:
            v.co.x = face - 0.055
    body.data.update()
    chrome = bmesh.new()
    dark = bmesh.new()
    add_box(dark, face - 0.040, face - 0.026, -0.44, 0.44, 0.64, 0.96)
    add_box(chrome, face - 0.004, face + 0.004, -0.48, 0.48, 0.94, 0.985)
    add_box(chrome, face - 0.004, face + 0.004, -0.48, 0.48, 0.62, 0.665)
    add_box(chrome, face - 0.004, face + 0.004, -0.48, -0.42, 0.64, 0.96)
    add_box(chrome, face - 0.004, face + 0.004, 0.42, 0.48, 0.64, 0.96)
    for i in range(4):
        z = 0.700 + i * 0.058
        add_box(chrome, face - 0.022, face - 0.010, -0.40, 0.40, z, z + 0.012)
    return new_mesh('h2-chrome', chrome), new_mesh('h2-grille-back', dark)


def build_lamps(body):
    lens = bmesh.new()
    amber = bmesh.new()
    fog = bmesh.new()
    tail = bmesh.new()
    for sign in (1, -1):
        y = sign * 0.58
        face = nose_x(body, 0.0, 0.84) + 0.010
        add_box(lens, face - 0.004, face + 0.006, y - 0.055, y + 0.055, 0.68, 0.90)
        add_box(amber, face - 0.002, face + 0.010, y + sign * 0.035, y + sign * 0.060, 0.70, 0.88)
        fy = sign * 0.42
        fface = nose_x(body, fy, 0.48) - 0.004
        add_box(fog, fface - 0.004, fface + 0.008, fy - 0.045, fy + 0.045, 0.44, 0.53)
    # Tail lamps.
    for sign in (1, -1):
        y = sign * 0.62
        add_box(tail, TAIL_X - 0.01, TAIL_X + 0.012, y - 0.16, y + 0.10, 0.78, 0.98)
    # Roof bar lenses. The housing is separate trim. These sit on top of it.
    bar_z = roof_z(0.1) + 0.045
    for i, x in enumerate((-0.08, 0.02, 0.12, 0.22)):
        add_box(amber, x, x + 0.07, -0.10, 0.10, bar_z, bar_z + 0.012)
    return (
        new_mesh('h2-headlamp-lens', lens),
        new_mesh('h2-marker', amber),
        new_mesh('h2-headlamp-fog', fog),
        new_mesh('h2-tail', tail),
    )


def build_bar():
    bm = bmesh.new()
    z = roof_z(0.1)
    add_box(bm, -0.12, 0.34, -0.16, 0.16, z + 0.004, z + 0.040)
    # Feet.
    add_box(bm, -0.02, 0.04, -0.10, -0.06, z - 0.002, z + 0.012)
    add_box(bm, 0.16, 0.22, 0.06, 0.10, z - 0.002, z + 0.012)
    return new_mesh('h2-lightbar', bm)


def lathe_tire(segs, rows):
    """Tire in local space. Axle is Y. Tread sits at radius TIRE_R."""
    bm = bmesh.new()
    # Cross-section from inboard to outboard. Radius and half-width.
    profile = []
    for i in range(rows):
        t = i / (rows - 1)
        # Rounded shoulder: full radius through the crown, tucked at the bead.
        crown = math.sin(t * math.pi) ** 0.45
        radius = lerp(TIRE_R - 0.055, TIRE_R, crown)
        y = lerp(-TIRE_HW, TIRE_HW, t)
        profile.append((y, radius))
    rings = []
    for y, radius in profile:
        ring = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            # 4 mm blocks on the crown only. Not a paddle.
            bump = 0.0
            if radius > TIRE_R - 0.012:
                band = int(s / segs * 18)
                rib = int((y / TIRE_HW + 1) * 2.2)
                if (band + rib) % 2 == 0 and 0.15 < (s / segs * 18) % 1 < 0.85:
                    bump = 0.004
            ring.append(bm.verts.new((math.cos(a) * (radius + bump), y, math.sin(a) * (radius + bump))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(segs):
            bm.faces.new((rings[i][s], rings[i][(s + 1) % segs], rings[i + 1][(s + 1) % segs], rings[i + 1][s]))
    # Close only to the bead, so the alloy shows through the middle.
    bead = TIRE_R - 0.145
    for ring, inward in ((rings[0], True), (rings[-1], False)):
        y = ring[0].co.y
        inner = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            inner.append(bm.verts.new((math.cos(a) * bead, y, math.sin(a) * bead)))
        for s in range(segs):
            j = (s + 1) % segs
            if inward:
                bm.faces.new((ring[s], inner[s], inner[j], ring[j]))
            else:
                bm.faces.new((ring[s], ring[j], inner[j], inner[s]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_rim(segs):
    """Six-spoke alloy. Local +Y is outboard."""
    bm = bmesh.new()
    def ring(y, r_in, r_out, n):
        inner, outer = [], []
        for i in range(n):
            a = 2 * math.pi * i / n
            c, s = math.cos(a), math.sin(a)
            inner.append(bm.verts.new((c * r_in, y, s * r_in)))
            outer.append(bm.verts.new((c * r_out, y, s * r_out)))
        return inner, outer
    n = segs
    lip_i, lip_o = ring(0.055, 0.155, 0.232, n)
    barrel_i, barrel_o = ring(0.028, 0.155, 0.232, n)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lip_i[i], lip_i[j], lip_o[j], lip_o[i]))
        bm.faces.new((barrel_o[i], barrel_o[j], barrel_i[j], barrel_i[i]))
        bm.faces.new((lip_o[i], lip_o[j], barrel_o[j], barrel_o[i]))
        bm.faces.new((barrel_i[i], barrel_i[j], lip_i[j], lip_i[i]))
    # Six spokes with a recessed channel.
    for s in range(6):
        a = math.pi / 6 + s * math.pi / 3
        for r0, r1, y_face, half in (
            (0.055, 0.210, 0.062, 0.020),
            (0.055, 0.210, 0.046, 0.010),
        ):
            verts = []
            for rr, side in ((r0, -1), (r0, 1), (r1, 1), (r1, -1)):
                ang = a + side * half / max(rr, 0.05)
                verts.append(bm.verts.new((math.cos(ang) * rr, y_face, math.sin(ang) * rr)))
            bm.faces.new(verts)
    hub = bm.verts.new((0, 0.048, 0))
    cap = []
    for i in range(18):
        a = 2 * math.pi * i / 18
        cap.append(bm.verts.new((math.cos(a) * 0.052, 0.066, math.sin(a) * 0.052)))
    for i in range(18):
        bm.faces.new((hub, cap[i], cap[(i + 1) % 18]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def place_wheels(high):
    segs = 40 if high else 24
    rows = 10 if high else 7
    tire_bm = lathe_tire(segs, rows)
    rim_bm = build_rim(24 if high else 16)
    tires, rims = [], []
    spots = (
        ('h2-tire', 'h2-rim', FRONT_X, HALF_TRACK, False),
        ('h2-tire1', 'h2-rim1', FRONT_X, -HALF_TRACK, True),
        ('h2-tire2', 'h2-rim2', REAR_X, HALF_TRACK, False),
        ('h2-tire3', 'h2-rim3', REAR_X, -HALF_TRACK, True),
    )
    for tname, rname, x, y, flip in spots:
        tmesh = bpy.data.meshes.new(tname)
        tire_bm.to_mesh(tmesh)
        tobj = bpy.data.objects.new(tname, tmesh)
        tobj.location = (x, y, WHEEL_Z)
        if flip:
            tobj.rotation_euler[2] = math.pi
        link(tobj)
        shade(tobj)
        tires.append(tobj)
        rmesh = bpy.data.meshes.new(rname)
        rim_bm.to_mesh(rmesh)
        robj = bpy.data.objects.new(rname, rmesh)
        robj.location = (x, y, WHEEL_Z)
        if flip:
            robj.rotation_euler[2] = math.pi
        link(robj)
        shade(robj)
        rims.append(robj)
    tire_bm.free()
    rim_bm.free()
    return tires, rims


def build_details(body):
    bm = bmesh.new()
    # Mirrors.
    for sign in (1, -1):
        add_box(bm, 0.72, 0.92, sign * 0.96, sign * 1.06, 1.22, 1.30)
        add_box(bm, 0.78, 0.82, sign * 0.93, sign * 0.97, 1.24, 1.28)
    for sign in (1, -1):
        for x in (0.52, -0.32):
            add_box(bm, x, x + 0.11, sign * 0.968, sign * 0.984, 1.05, 1.08)
    add_box(bm, -0.62, 0.36, -0.52, 0.52, roof_z(0) + 0.002, roof_z(0) + 0.012)
    obj = new_mesh('h2-details', bm)
    return obj


def build_decal():
    """Block letters. Font conversion kept coming out mirrored on one side."""
    # Each glyph is a list of bars in a 4 by 6 cell: (x0, z0, x1, z1).
    glyphs = {
        'P': [(0, 0, 0.9, 6), (0.9, 3.1, 3.6, 4.2), (0.9, 4.8, 3.6, 6), (2.7, 3.1, 3.6, 6)],
        'A': [(0, 0, 0.9, 5.2), (2.7, 0, 3.6, 5.2), (0, 4.8, 3.6, 6), (0, 2.4, 3.6, 3.3)],
        'C': [(0, 0, 3.6, 1.1), (0, 4.9, 3.6, 6), (0, 0, 0.9, 6)],
        'E': [(0, 0, 0.9, 6), (0, 0, 3.6, 1.1), (0, 2.45, 3.1, 3.45), (0, 4.9, 3.6, 6)],
    }
    bm = bmesh.new()
    word = 'PACE'
    for sign in (1, -1):
        # From outside, the word reads left to right.
        order = word if sign < 0 else word[::-1]
        for i, ch in enumerate(order):
            x_cell = (0.15 if sign < 0 else 0.62) + (i if sign < 0 else -i) * 0.085
            for x0, z0, x1, z1 in glyphs[ch]:
                add_box(
                    bm,
                    x_cell + x0 * 0.012, x_cell + x1 * 0.012,
                    sign * 0.968, sign * 0.982,
                    0.90 + z0 * 0.012, 0.90 + z1 * 0.012,
                )
    return [new_mesh('h2-decal', bm)]


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def push_clear(obj, wheels, gap=0.055):
    """Keep every vertex outside the tire volume. Subdivision pulls the arch in."""
    mw = obj.matrix_world
    inv = mw.inverted()
    moved = 0
    for v in obj.data.vertices:
        p = mw @ v.co
        for x, y in wheels:
            if abs(p.y - y) > TIRE_HW + 0.004:
                continue
            dx, dz = p.x - x, p.z - WHEEL_Z
            radius = math.hypot(dx, dz)
            limit = TIRE_R + gap
            if radius < limit and radius > 1e-5:
                scale = limit / radius
                p.x = x + dx * scale
                p.z = WHEEL_Z + dz * scale
                v.co = inv @ p
                moved += 1
                break
    if moved:
        obj.data.update()
    return moved


def clip_count(obj, wheels):
    n = 0
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        for x, y in wheels:
            if abs(p.y - y) > TIRE_HW - 0.01:
                continue
            if math.hypot(p.x - x, p.z - WHEEL_Z) < TIRE_R - 0.008:
                n += 1
                break
    return n


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
    )
    print('wrote', path, os.path.getsize(path))


def tri_count(obj):
    mesh = obj.data
    if mesh.loop_triangles:
        mesh.calc_loop_triangles()
    return len(mesh.loop_triangles) if mesh.loop_triangles else sum(len(p.vertices) - 2 for p in mesh.polygons)


def build(high, mats):
    body = build_body()
    subdivide(body, 2 if high else 1)
    wheels = ((FRONT_X, HALF_TRACK), (FRONT_X, -HALF_TRACK), (REAR_X, HALF_TRACK), (REAR_X, -HALF_TRACK))
    print('  arch lift', push_clear(body, wheels))
    recess_side_glass(body)
    print('  arch lift after pockets', push_clear(body, wheels))
    flatten_nose(body)
    paint_cladding(body, mats['paint'], mats['trim'])
    glass = build_glass()
    assign(glass, mats['glass'])
    grille, grille_back = build_grille(body)
    assign(grille, mats['chrome'])
    assign(grille_back, mats['trim'])
    lens, amber, fog, tail = build_lamps(body)
    assign(lens, mats['lens'])
    assign(amber, mats['amber'])
    assign(fog, mats['fog'])
    assign(tail, mats['tail'])
    bar = build_bar()
    assign(bar, mats['trim'])
    details = build_details(body)
    assign(details, mats['trim'])
    tires, rims = place_wheels(high)
    for obj in tires:
        assign(obj, mats['tire'])
    for obj in rims:
        assign(obj, mats['rim'])
    try:
        decals = build_decal()
    except Exception as exc:
        print('decal skipped', exc)
        decals = []
    for obj in decals:
        assign(obj, mats['decal'])
    objects = [body, glass, grille, grille_back, lens, amber, fog, tail, bar, details, *tires, *rims, *decals]
    bad = 0
    for obj in objects:
        if obj in tires or obj in rims:
            continue
        n = clip_count(obj, wheels)
        if n:
            print('CLIP', obj.name, n)
            bad += n
    if bad:
        raise SystemExit(f'pace SUV intersects a tire ({bad} verts)')
    total = sum(tri_count(o) for o in objects)
    print(('HIGH' if high else 'LOW'), 'tris', total, 'objects', len(objects))
    return objects


def main():
    clear_scene()
    mats = {
        'paint': make_mat('paint', srgb(247, 196, 43), 0.04, 0.22),
        'trim': make_mat('trim', srgb(18, 18, 20), 0.02, 0.55),
        'chrome': make_mat('chrome', srgb(214, 218, 222), 1.0, 0.16),
        'glass': make_mat('glass', srgb(10, 14, 18), 0.82, 0.05),
        'lens': make_mat('lens', srgb(236, 242, 246), 0.0, 0.04),
        'amber': make_mat('amber', srgb(255, 150, 28), 0.0, 0.32, srgb(255, 140, 0), 3.2),
        'fog': make_mat('fog', srgb(255, 186, 120), 0.0, 0.3, srgb(255, 150, 70), 2.4),
        'tail': make_mat('tail', srgb(170, 12, 10), 0.0, 0.32, srgb(255, 24, 16), 2.2),
        'tire': make_mat('tire', srgb(18, 18, 18), 0.0, 0.72),
        'rim': make_mat('rim', srgb(176, 180, 184), 0.72, 0.28),
        'decal': make_mat('decal', srgb(16, 16, 18), 0.0, 0.5),
    }
    paint = next(n for n in mats['paint'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(paint, ['Coat Weight', 'Clearcoat'], 1.0)
    set_in(paint, ['Coat Roughness', 'Clearcoat Roughness'], 0.08)
    lens = next(n for n in mats['lens'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(lens, ['Transmission Weight', 'Transmission'], 0.85)
    high = build(True, mats)
    export(os.path.join(OUT, 'h2.glb'), high)
    # Park the high meshes and build the low set from scratch.
    for obj in high:
        obj.name = '_high_' + obj.name
        obj.hide_set(True)
        obj.select_set(False)
    low = build(False, mats)
    export(os.path.join(OUT, 'h2-low.glb'), low)


if __name__ == '__main__':
    main()
