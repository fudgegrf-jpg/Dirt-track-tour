# RETIRED. This generated the shell that used to be h2.glb. The game no longer
# loads that mesh. The pace SUV is Kenney's CC0 Car Kit model, dressed by
# scripts/dress_kenney_suv.py. Kept so the earlier attempt stays in the tree.
#
#   blender --background --python scripts/archive/build_pace_suv_generated.py
#
# Blender Z-up, +X forward, +Y left. Export is glTF Y-up: three.js +X forward,
# +Y up, wheel axle along Z.
import bpy
import bmesh
import math
import os
from mathutils import Vector

# Do not write the runtime models. A run of this retired script stays in archive/out.
OUT = os.path.join(os.path.dirname(__file__), 'out')

FRONT_X = 1.34
REAR_X = -1.38
HALF_TRACK = 0.80
TIRE_R = 0.388
TIRE_HW = 0.118
WHEEL_Z = 0.396
ARCH_R = 0.485
# Outer skin of the doors. The tire's outer face stays inboard of this.
SKIN_Y = 0.96
BELT_Z = 1.08
SILL_Z = 0.40
ROOF_Z = 1.72


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
    return mat


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def finish(name, bm, sharp=True):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    if sharp:
        # Crease nothing globally; callers mark edges before finish via smooth flag.
        pass
    mesh.update()
    return obj


def q(bm, pts):
    verts = [bm.verts.new(p) for p in pts]
    try:
        bm.faces.new(verts)
    except ValueError:
        pass
    return verts


def grid(bm, rows):
    """rows is a list of polylines. Bridge consecutive rows with quads."""
    made = []
    for row in rows:
        made.append([bm.verts.new(p) for p in row])
    for i in range(len(made) - 1):
        a, b = made[i], made[i + 1]
        for j in range(len(a) - 1):
            try:
                bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
            except ValueError:
                pass
    return made


def hold_seams(obj):
    """Keep window and arch borders sharp. Let the broad panels relax a little."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    crease = bm.edges.layers.crease.verify() if hasattr(bm.edges.layers, 'crease') else None
    for edge in bm.edges:
        border = len(edge.link_faces) < 2
        angle = 0.0 if border else edge.calc_face_angle(0.0)
        # Borders stay put. Only the sharp cage corners keep a partial crease,
        # so the panels can become continuous surfaces.
        weight = 1.0 if border else (0.28 if angle > math.radians(62) else 0.0)
        edge.smooth = weight < 0.5
        if crease is not None:
            edge[crease] = weight
    bm.to_mesh(obj.data)
    bm.free()


def subdivide_shell(obj, level):
    hold_seams(obj)
    mod = obj.modifiers.new('Sub', 'SUBSURF')
    mod.levels = level
    mod.render_levels = level
    mod.use_creases = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def bevel(obj, width=0.010, segments=2):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(38)
    mod.affect = 'EDGES'
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        print('bevel skip', obj.name, exc)
        if mod.name in obj.modifiers:
            obj.modifiers.remove(mod)


YS = [-0.96, -0.68, 0.0, 0.68, 0.96]
# Six heights at every station: sill, cladding, arch, belt, window, roof.
STATIONS = [
    (-2.06, [0.38, 0.56, 1.02, 1.14, 1.46, 1.56]),
    (-1.62, [0.38, 0.58, 1.06, 1.20, 1.50, 1.62]),
    (-1.38, [0.38, 0.60, 1.08, 1.28, 1.56, 1.68]),
    (-0.95, [0.38, 0.66, 1.12, 1.52, 1.64, 1.72]),
    (-0.62, [0.38, 0.70, 1.16, 1.54, 1.66, 1.72]),
    (-0.06, [0.38, 0.72, 1.16, 1.54, 1.66, 1.72]),
    (0.10, [0.38, 0.72, 1.16, 1.54, 1.66, 1.72]),
    (0.58, [0.40, 0.74, 1.16, 1.54, 1.66, 1.72]),
    (0.92, [0.40, 0.82, 1.12, 1.40, 1.60, 1.70]),
    (1.22, [0.40, 0.88, 1.08, 1.12, 1.14, 1.16]),
    (1.55, [0.40, 0.90, 1.04, 1.08, 1.10, 1.12]),
    (1.88, [0.40, 0.88, 1.00, 1.04, 1.06, 1.08]),
    (2.16, [0.38, 0.56, 0.88, 0.96, 1.02, 1.06]),
]


def _face(bm, verts, keys):
    try:
        bm.faces.new([verts[k] for k in keys])
    except ValueError:
        pass


def _window_side(ix, iz):
    """Upper side faces that are glass, not pillars."""
    front = 6 <= ix <= 7 and iz in (2, 3)
    rear = 4 <= ix <= 4 and iz in (2, 3)
    return front or rear


def _window_top(ix, iy):
    # Sloped bays between the A-pillar station and the cowl, center only.
    return ix == 8 and iy in (1, 2)


def _window_tail(iy, iz):
    return iy in (1, 2) and iz in (2, 3)


def _window_nose(iy, iz):
    grille = iy in (1, 2) and iz == 1
    lamp = iy in (0, 3) and iz in (1, 2)
    return grille or lamp


def build_body(arch_steps):
    """One connected shell. Window, grille and lamp faces are left open."""
    bm = bmesh.new()
    n_y = len(YS) - 1
    n_z = 5
    verts = {}
    for ix, (x, zs) in enumerate(STATIONS):
        for iy, y in enumerate(YS):
            for iz, z in enumerate(zs):
                verts[(ix, iy, iz)] = bm.verts.new((x, y, z))

    def quad(a, b, c, d):
        _face(bm, verts, (a, b, c, d))

    n_x = len(STATIONS) - 1
    # Sides.
    for ix in range(n_x):
        for iz in range(n_z):
            if _window_side(ix, iz):
                continue
            quad((ix, 0, iz), (ix + 1, 0, iz), (ix + 1, 0, iz + 1), (ix, 0, iz + 1))
            quad((ix, n_y, iz + 1), (ix + 1, n_y, iz + 1), (ix + 1, n_y, iz), (ix, n_y, iz))
    # Roof and hood, the highest band.
    for ix in range(n_x):
        for iy in range(n_y):
            if _window_top(ix, iy):
                continue
            quad((ix, iy, n_z), (ix, iy + 1, n_z), (ix + 1, iy + 1, n_z), (ix + 1, iy, n_z))
    # Belly.
    for ix in range(n_x):
        for iy in range(n_y):
            quad((ix, iy, 0), (ix + 1, iy, 0), (ix + 1, iy + 1, 0), (ix, iy + 1, 0))
    # Tail.
    for iy in range(n_y):
        for iz in range(n_z):
            if _window_tail(iy, iz):
                continue
            quad((0, iy, iz), (0, iy, iz + 1), (0, iy + 1, iz + 1), (0, iy + 1, iz))
    # Nose.
    for iy in range(n_y):
        for iz in range(n_z):
            if _window_nose(iy, iz):
                continue
            quad((n_x, iy + 1, iz), (n_x, iy + 1, iz + 1), (n_x, iy, iz + 1), (n_x, iy, iz))

    # Open the wheel bays. A rectangular station grid cannot draw the arch,
    # so the boundary verts are pulled onto the arch circle afterwards.
    wheels = (FRONT_X, REAR_X)
    drop = []
    for face in bm.faces:
        c = face.calc_center_median()
        if abs(c.y) < 0.8:
            continue
        for axle in wheels:
            if math.hypot(c.x - axle, c.z - WHEEL_Z) < ARCH_R + 0.02 and c.z < WHEEL_Z + 0.62:
                drop.append(face)
                break
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    # Turn the stair-step bite into a semicircle, then give the fascia holes
    # a short return so the grille and lamps sit in a recess instead of a gap.
    arch_edges = []
    fascia_edges = []
    for edge in bm.edges:
        if len(edge.link_faces) != 1:
            continue
        mid = (edge.verts[0].co + edge.verts[1].co) * 0.5
        if mid.x > 2.05:
            fascia_edges.append(edge)
            continue
        if abs(mid.y) < 0.75 or mid.z > 1.02:
            continue
        for axle in wheels:
            if math.hypot(mid.x - axle, mid.z - WHEEL_Z) < 0.85:
                arch_edges.append(edge)
                break
    if arch_edges:
        bmesh.ops.subdivide_edges(bm, edges=arch_edges, cuts=4)
    for v in bm.verts:
        if not any(len(e.link_faces) == 1 for e in v.link_edges):
            continue
        if v.co.x > 2.0 or abs(v.co.y) < 0.75 or v.co.z > 1.02:
            continue
        for axle in wheels:
            dx, dz = v.co.x - axle, v.co.z - WHEEL_Z
            radius = math.hypot(dx, dz)
            if 0.12 < radius < 0.9:
                scale = ARCH_R / radius
                v.co.x = axle + dx * scale
                v.co.z = WHEEL_Z + dz * scale
                break
    if fascia_edges:
        extruded = bmesh.ops.extrude_edge_only(bm, edges=fascia_edges)
        for item in extruded['geom']:
            if isinstance(item, bmesh.types.BMVert):
                item.co.x -= 0.016

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    roof_face = max(bm.faces, key=lambda f: f.calc_center_median().z)
    if roof_face.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    return finish('h2-body', bm)


def _retired_body(arch_steps):
    """Yellow panels with real openings. Glass occupies the openings."""
    bm = bmesh.new()
    # Hood. Flat enough to read as a hood, crowned a centimeter in the middle.
    hood = []
    for i, x in enumerate((2.12, 1.85, 1.55, 1.22, 1.04)):
        row = []
        for y in (-0.72, -0.36, 0.0, 0.36, 0.72):
            crown = 0.018 * (1.0 - abs(y) / 0.72)
            z = 1.02 + (1.04 - (x - 1.04) / 1.08) * 0.10 + crown
            # The nose end of the hood drops onto the top of the front face.
            if x > 2.0:
                z = 1.02 + crown * 0.4
            row.append((x, y, z))
        hood.append(row)
    grid(bm, hood)

    # Front face, a frame around the grille and the two lamps. The holes stay open.
    x = 2.155
    # Border strips: below the grille, above it, and the outer corners.
    q(bm, [(x, -0.86, 0.50), (x, 0.86, 0.50), (x, 0.86, 0.60), (x, -0.86, 0.60)])
    q(bm, [(x, -0.86, 0.94), (x, 0.86, 0.94), (x, 0.86, 1.04), (x, -0.86, 1.04)])
    # Cheeks beside the lamps, and the bridge between lamp and grille.
    for sign in (1, -1):
        q(bm, [
            (x, sign * 0.78, 0.60), (x, sign * 0.86, 0.60),
            (x, sign * 0.86, 0.94), (x, sign * 0.78, 0.94),
        ])
        q(bm, [
            (x, sign * 0.40, 0.60), (x, sign * 0.50, 0.60),
            (x, sign * 0.50, 0.94), (x, sign * 0.40, 0.94),
        ])
    # Hood nose cap, closing the hood onto the top of the face.
    q(bm, [(2.12, -0.72, 1.02), (2.12, 0.72, 1.02), (x, 0.86, 1.04), (x, -0.86, 1.04)])

    # Front fenders. An arch of quads over each front wheel, then a panel up to the hood.
    for sign in (1, -1):
        arch = []
        for i in range(arch_steps + 1):
            a = math.radians(200) + math.radians(140) * i / arch_steps
            px = FRONT_X + math.cos(a) * ARCH_R
            pz = WHEEL_Z + math.sin(a) * ARCH_R
            y0 = sign * 0.78
            y1 = sign * SKIN_Y
            arch.append([(px, y0, pz), (px, y1, pz)])
        # arch rows are pairs; bridge them as a ribbon
        ribbon = []
        for i in range(arch_steps + 1):
            a = math.radians(200) + math.radians(140) * i / arch_steps
            px = FRONT_X + math.cos(a) * ARCH_R
            pz = WHEEL_Z + math.sin(a) * ARCH_R
            ribbon.append([(px, sign * 0.80, pz), (px, sign * SKIN_Y, pz)])
        grid(bm, ribbon)
        # Panel from the top of the arch up to the hood edge.
        q(bm, [
            (FRONT_X - 0.15, sign * SKIN_Y, WHEEL_Z + ARCH_R),
            (FRONT_X + 0.15, sign * SKIN_Y, WHEEL_Z + ARCH_R),
            (1.20, sign * 0.78, 1.08),
            (1.50, sign * 0.78, 1.06),
        ])
        # Outer fender face ahead of the wheel, from the arch forward to the fascia.
        q(bm, [
            (FRONT_X + ARCH_R * 0.7, sign * SKIN_Y, WHEEL_Z + 0.05),
            (2.155, sign * 0.86, 0.60),
            (2.155, sign * 0.86, 1.04),
            (FRONT_X + 0.05, sign * SKIN_Y, WHEEL_Z + ARCH_R),
        ])

    # Doors and quarters. Solid below the belt. Window openings above it.
    for sign in (1, -1):
        y = sign * SKIN_Y
        # Rocker and door skin between the wheels.
        q(bm, [
            (FRONT_X - ARCH_R + 0.02, y, SILL_Z),
            (REAR_X + ARCH_R - 0.02, y, SILL_Z),
            (REAR_X + ARCH_R - 0.02, y, BELT_Z),
            (FRONT_X - ARCH_R + 0.02, y, BELT_Z),
        ])
        # A pillar
        q(bm, [(1.02, y, BELT_Z), (0.92, y, BELT_Z), (0.48, sign * 0.78, ROOF_Z - 0.02), (0.58, sign * 0.82, ROOF_Z - 0.02)])
        # B pillar
        q(bm, [(-0.02, y, BELT_Z), (0.10, y, BELT_Z), (0.10, y, 1.58), (-0.02, y, 1.58)])
        # C pillar
        q(bm, [(-0.78, y, BELT_Z), (-0.66, y, BELT_Z), (-0.66, sign * 0.78, ROOF_Z - 0.04), (-0.86, sign * 0.74, 1.55)])
        # Sill above the front door window (header)
        q(bm, [(0.16, y, 1.56), (0.88, y, 1.56), (0.88, y, 1.64), (0.16, y, 1.64)])
        q(bm, [(-0.64, y, 1.56), (-0.08, y, 1.56), (-0.08, y, 1.64), (-0.64, y, 1.64)])
        # Rear fender arch
        ribbon = []
        for i in range(arch_steps + 1):
            a = math.radians(200) + math.radians(140) * i / arch_steps
            px = REAR_X + math.cos(a) * ARCH_R
            pz = WHEEL_Z + math.sin(a) * ARCH_R
            ribbon.append([(px, sign * 0.80, pz), (px, sign * SKIN_Y, pz)])
        grid(bm, ribbon)
        # Quarter panel behind the rear wheel
        q(bm, [
            (REAR_X - ARCH_R * 0.75, y, WHEEL_Z + 0.08),
            (-2.04, sign * 0.86, 0.55),
            (-2.04, sign * 0.80, 1.20),
            (REAR_X - 0.05, y, WHEEL_Z + ARCH_R),
        ])

    # Roof, flat, stopping where the glass begins.
    roof = []
    for x in (0.42, 0.05, -0.35, -0.72):
        roof.append([(x, y, ROOF_Z) for y in (-0.70, -0.35, 0.0, 0.35, 0.70)])
    grid(bm, roof)
    # Roof rails, a low shoulder so the roof does not melt into the glass.
    for sign in (1, -1):
        q(bm, [
            (0.42, sign * 0.70, ROOF_Z), ( -0.72, sign * 0.70, ROOF_Z),
            (-0.72, sign * 0.84, ROOF_Z - 0.04), (0.42, sign * 0.84, ROOF_Z - 0.04),
        ])

    # Tailgate, frame around the rear window.
    tx = -2.02
    q(bm, [(tx, -0.78, 0.55), (tx, 0.78, 0.55), (tx, 0.78, 1.12), (tx, -0.78, 1.12)])
    q(bm, [(tx, -0.78, 1.52), (tx, 0.78, 1.52), (tx, 0.78, 1.66), (tx, -0.78, 1.66)])
    for sign in (1, -1):
        q(bm, [
            (tx, sign * 0.62, 1.12), (tx, sign * 0.78, 1.12),
            (tx, sign * 0.78, 1.52), (tx, sign * 0.62, 1.52),
        ])
    # Tailgate slope up to the roof so the rear window has a header.
    q(bm, [(-0.72, -0.70, ROOF_Z), (-0.72, 0.70, ROOF_Z), (tx, 0.62, 1.58), (tx, -0.62, 1.58)])

    # Underbody, a simple floor so the car is not a hollow shell from below.
    q(bm, [(-1.9, -0.55, 0.34), (1.9, -0.55, 0.34), (1.9, 0.55, 0.34), (-1.9, 0.55, 0.34)])

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    roof_face = max(bm.faces, key=lambda f: f.calc_center_median().z)
    if roof_face.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    return finish('h2-body', bm)


def build_cladding(arch_steps):
    """Black bumper and rocker. One designed piece, meeting the arches."""
    bm = bmesh.new()
    # Front bumper, a straight bar proud of the fascia by a centimeter.
    q(bm, [(2.175, -0.90, 0.34), (2.175, 0.90, 0.34), (2.175, 0.90, 0.52), (2.175, -0.90, 0.52)])
    q(bm, [(2.175, -0.90, 0.34), (2.08, -0.90, 0.34), (2.08, 0.90, 0.34), (2.175, 0.90, 0.34)])
    q(bm, [(2.175, -0.90, 0.52), (2.175, 0.90, 0.52), (2.10, 0.90, 0.52), (2.10, -0.90, 0.52)])
    for sign in (1, -1):
        q(bm, [
            (2.175, sign * 0.90, 0.34), (2.175, sign * 0.90, 0.52),
            (FRONT_X + 0.15, sign * SKIN_Y + sign * 0.012, WHEEL_Z),
            (FRONT_X + 0.35, sign * 0.90, 0.36),
        ])
    # Rocker between the wheels.
    for sign in (1, -1):
        y = sign * (SKIN_Y + 0.012)
        q(bm, [
            (FRONT_X - 0.15, y, 0.32), (REAR_X + 0.15, y, 0.32),
            (REAR_X + 0.15, y, 0.50), (FRONT_X - 0.15, y, 0.50),
        ])
        # Arch lip, lower half only, so it reads as cladding not a floating strip.
        lip = []
        for i in range(arch_steps // 2 + 1):
            a = math.radians(210) + math.radians(120) * i / (arch_steps // 2)
            for axle in (FRONT_X, REAR_X):
                pass
        for axle in (FRONT_X, REAR_X):
            row_a, row_b = [], []
            for i in range(arch_steps // 2 + 1):
                a = math.radians(205) + math.radians(130) * i / max(1, arch_steps // 2)
                px = axle + math.cos(a) * (ARCH_R + 0.01)
                pz = WHEEL_Z + math.sin(a) * (ARCH_R + 0.01)
                row_a.append((px, sign * 0.90, pz))
                row_b.append((px, sign * (SKIN_Y + 0.02), pz))
            # row_a/row_b are not a grid of rows. Build a ribbon manually.
            verts_a = [bm.verts.new(p) for p in row_a]
            verts_b = [bm.verts.new(p) for p in row_b]
            for i in range(len(verts_a) - 1):
                try:
                    bm.faces.new((verts_a[i], verts_a[i + 1], verts_b[i + 1], verts_b[i]))
                except ValueError:
                    pass
    # Rear bumper.
    q(bm, [(-2.10, -0.82, 0.34), (-2.10, 0.82, 0.34), (-2.10, 0.82, 0.52), (-2.10, -0.82, 0.52)])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return finish('h2-trim', bm)


def add_pane(bm, corners, thickness=0.006):
    """A glass pane. corners are the outer face, wound with the normal pointing out."""
    outer = [bm.verts.new(p) for p in corners]
    a, b, c, d = (Vector(p) for p in corners)
    normal = (b - a).cross(d - a)
    if normal.length < 1e-8:
        return
    normal.normalize()
    inner = [bm.verts.new(Vector(p) - normal * thickness) for p in corners]
    bm.faces.new(outer)
    bm.faces.new(list(reversed(inner)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((outer[i], inner[i], inner[j], outer[j]))


def build_glass():
    bm = bmesh.new()
    # Windshield fills the sloped opening between the cowl and the roof.
    # Its outer face sits a few millimetres proud of that opening.
    add_pane(bm, [
        (1.235, -0.66, 1.175),
        (1.235, 0.66, 1.175),
        (0.90, 0.66, 1.715),
        (0.90, -0.66, 1.715),
    ])
    # Door and quarter windows. The outer face is 6 mm inboard of the door skin,
    # inside an opening, so the pillars frame it and the center is glass.
    for sign in (1, -1):
        y = sign * (YS[-1] - 0.008)
        # Front door. Winding puts the outer normal outboard.
        add_pane(bm, [
            (0.88, y, 1.20), (0.16, y, 1.20), (0.16, y, 1.60), (0.88, y, 1.60),
        ] if sign > 0 else [
            (0.16, y, 1.20), (0.88, y, 1.20), (0.88, y, 1.60), (0.16, y, 1.60),
        ])
        add_pane(bm, [
            (-0.10, y, 1.20), (-0.58, y, 1.20), (-0.58, y, 1.60), (-0.10, y, 1.60),
        ] if sign > 0 else [
            (-0.58, y, 1.20), (-0.10, y, 1.20), (-0.10, y, 1.60), (-0.58, y, 1.60),
        ])
    # Rear window, just proud of the tail face.
    add_pane(bm, [
        (-2.072, 0.64, 1.08),
        (-2.072, -0.64, 1.08),
        (-2.072, -0.64, 1.44),
        (-2.072, 0.64, 1.44),
    ])
    return finish('h2-glass', bm, sharp=False)


def build_fascia_inserts():
    """Dark grille and lamps, both behind the yellow face so they cannot tear out."""
    grille = bmesh.new()
    lamps = bmesh.new()
    amber = bmesh.new()
    fog = bmesh.new()
    tail = bmesh.new()
    # Grille back and slats. Front face of the yellow is x=2.155. These stop at 2.145.
    gx = 2.145
    q(grille, [(gx, -0.64, 0.58), (gx, 0.64, 0.58), (gx, 0.64, 0.86), (gx, -0.64, 0.86)])
    for i in range(4):
        z = 0.615 + i * 0.058
        q(grille, [
            (gx + 0.006, -0.58, z), (gx + 0.006, 0.58, z),
            (gx + 0.006, 0.58, z + 0.016), (gx + 0.006, -0.58, z + 0.016),
        ])
    for sign in (1, -1):
        lx = 2.142
        q(lamps, [
            (lx, sign * 0.70, 0.58), (lx, sign * 0.94, 0.58),
            (lx, sign * 0.94, 0.94), (lx, sign * 0.70, 0.94),
        ])
        q(amber, [
            (lx + 0.003, sign * 0.86, 0.60), (lx + 0.003, sign * 0.93, 0.60),
            (lx + 0.003, sign * 0.93, 0.92), (lx + 0.003, sign * 0.86, 0.92),
        ])
        q(tail, [
            (-2.055, sign * 0.42, 0.78), (-2.055, sign * 0.72, 0.78),
            (-2.055, sign * 0.72, 0.98), (-2.055, sign * 0.42, 0.98),
        ])
        q(fog, [
            (2.16, sign * 0.28, 0.40), (2.16, sign * 0.42, 0.40),
            (2.16, sign * 0.42, 0.48), (2.16, sign * 0.28, 0.48),
        ])
    return (
        finish('h2-grille-back', grille, sharp=False),
        finish('h2-headlamp-lens', lamps, sharp=False),
        finish('h2-marker', amber, sharp=False),
        finish('h2-headlamp-fog', fog, sharp=False),
        finish('h2-tail', tail, sharp=False),
    )


def build_details():
    bm = bmesh.new()
    # Roof bar. This is the highest thing, so the flashing pods land on it.
    q(bm, [(-0.05, -0.22, ROOF_Z + 0.02), (0.32, -0.22, ROOF_Z + 0.02),
           (0.32, 0.22, ROOF_Z + 0.02), (-0.05, 0.22, ROOF_Z + 0.02)])
    q(bm, [(-0.05, -0.22, ROOF_Z + 0.055), (0.32, -0.22, ROOF_Z + 0.055),
           (0.32, 0.22, ROOF_Z + 0.055), (-0.05, 0.22, ROOF_Z + 0.055)])
    for sign in (1, -1):
        # Mirror heads, outboard of the A pillar, clear of the glass.
        q(bm, [
            (0.78, sign * 1.00, 1.20), (0.98, sign * 1.00, 1.20),
            (0.98, sign * 1.10, 1.32), (0.78, sign * 1.10, 1.32),
        ])
        # Door handles, on the door skin below the glass.
        for x in (0.55, -0.32):
            q(bm, [
                (x, sign * (SKIN_Y + 0.008), 1.00),
                (x + 0.10, sign * (SKIN_Y + 0.008), 1.00),
                (x + 0.10, sign * (SKIN_Y + 0.008), 1.035),
                (x, sign * (SKIN_Y + 0.008), 1.035),
            ])
    return finish('h2-details', bm, sharp=False)


def pace_image():
    # 5x7 bitmap glyphs. Drawn so U=0 is the start of the word.
    font = {
        'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
        'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
        'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
        'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
        ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
        'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    }
    text = 'PACE CAR'
    cols = sum(6 if ch != ' ' else 3 for ch in text)
    w, h = cols * 8, 7 * 8 + 16
    img = bpy.data.images.new('pace-car', w, h, alpha=True)
    pix = [0.0] * (w * h * 4)
    x = 4
    for ch in text:
        glyph = font[ch]
        gw = 5 if ch != ' ' else 2
        for row in range(7):
            for col in range(gw):
                bit = glyph[row][col] if col < len(glyph[row]) else '0'
                if bit != '1':
                    continue
                for dy in range(8):
                    for dx in range(8):
                        px = x + col * 8 + dx
                        py = 8 + (6 - row) * 8 + dy
                        if 0 <= px < w and 0 <= py < h:
                            i = (py * w + px) * 4
                            pix[i:i + 4] = (0.05, 0.05, 0.06, 1.0)
        x += (gw + 1) * 8
    img.pixels.foreach_set(pix)
    img.pack()
    return img


def build_decal():
    img = pace_image()
    mat = bpy.data.materials.new('decal')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(bsdf, ['Roughness'], 0.45)
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if 'Alpha' in tex.outputs and 'Alpha' in bsdf.inputs:
        mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.blend_method = 'CLIP'
    bm = bmesh.new()
    # +Y side. From outside (+Y, looking -Y) viewer's left is +X, so the
    # start of the word is at the larger X.
    y = SKIN_Y + 0.006
    verts = [
        bm.verts.new((0.72, y, 0.90)),
        bm.verts.new((0.22, y, 0.90)),
        bm.verts.new((0.22, y, 0.98)),
        bm.verts.new((0.72, y, 0.98)),
    ]
    face = bm.faces.new(verts)
    uv = bm.loops.layers.uv.new('UVMap')
    loops = face.loops
    for loop, pair in zip(loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = pair
    # -Y side. Viewer's left is -X, so the start of the word is at the smaller X.
    y = -(SKIN_Y + 0.006)
    verts = [
        bm.verts.new((0.22, y, 0.90)),
        bm.verts.new((0.72, y, 0.90)),
        bm.verts.new((0.72, y, 0.98)),
        bm.verts.new((0.22, y, 0.98)),
    ]
    face = bm.faces.new(verts)
    for loop, pair in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = pair
    obj = finish('h2-decal', bm, sharp=False)
    obj.data.materials.append(mat)
    return obj


def lathe_tire(segs, rows):
    bm = bmesh.new()
    profile = []
    for i in range(rows):
        t = i / (rows - 1)
        crown = math.sin(t * math.pi) ** 0.55
        radius = (TIRE_R - 0.058) + 0.058 * crown
        y = -TIRE_HW + 2 * TIRE_HW * t
        profile.append((y, radius))
    rings = []
    for y, radius in profile:
        ring = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            groove = 0.0
            if radius > TIRE_R - 0.01:
                band = int(s / segs * 16)
                if band % 2 == 0:
                    groove = -0.003
            ring.append(bm.verts.new((
                math.cos(a) * (radius + groove), y, math.sin(a) * (radius + groove),
            )))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(segs):
            j = (s + 1) % segs
            bm.faces.new((rings[i][s], rings[i][j], rings[i + 1][j], rings[i + 1][s]))
    bead = TIRE_R - 0.150
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
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def build_rim(segs):
    """Five broad spokes and a deep lip. Not a wire wheel."""
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
    lip_i, lip_o = ring(0.072, 0.150, 0.228, n)
    barrel_i, barrel_o = ring(0.040, 0.150, 0.228, n)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lip_i[i], lip_i[j], lip_o[j], lip_o[i]))
        bm.faces.new((barrel_o[i], barrel_o[j], barrel_i[j], barrel_i[i]))
        bm.faces.new((lip_o[i], lip_o[j], barrel_o[j], barrel_o[i]))
        bm.faces.new((barrel_i[i], barrel_i[j], lip_i[j], lip_i[i]))
    # Five spokes. Outer chord is about 7 cm, so the opening is not a wire gap.
    for s in range(5):
        a = math.pi / 5 + s * 2 * math.pi / 5
        for r0, r1, y_face, half_w in (
            (0.055, 0.200, 0.078, 0.036),
            (0.055, 0.200, 0.058, 0.022),
        ):
            verts = []
            for rr, side in ((r0, -1), (r0, 1), (r1, 1), (r1, -1)):
                ang = a + side * (half_w / max(rr, 0.05))
                verts.append(bm.verts.new((math.cos(ang) * rr, y_face, math.sin(ang) * rr)))
            bm.faces.new(verts)
    hub = bm.verts.new((0, 0.055, 0))
    cap = []
    for i in range(20):
        a = 2 * math.pi * i / 20
        cap.append(bm.verts.new((math.cos(a) * 0.055, 0.082, math.sin(a) * 0.055)))
    for i in range(20):
        bm.faces.new((hub, cap[i], cap[(i + 1) % 20]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def place_wheels(high):
    segs = 42 if high else 24
    rows = 9 if high else 6
    tire_bm = lathe_tire(segs, rows)
    rim_bm = build_rim(28 if high else 16)
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
        tires.append(tobj)
        rmesh = bpy.data.meshes.new(rname)
        rim_bm.to_mesh(rmesh)
        robj = bpy.data.objects.new(rname, rmesh)
        robj.location = (x, y, WHEEL_Z)
        if flip:
            robj.rotation_euler[2] = math.pi
        link(robj)
        rims.append(robj)
    tire_bm.free()
    rim_bm.free()
    for obj in tires + rims:
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.data.update()
    return tires, rims


def push_clear(obj, gap=0.05):
    wheels = ((FRONT_X, HALF_TRACK), (FRONT_X, -HALF_TRACK), (REAR_X, HALF_TRACK), (REAR_X, -HALF_TRACK))
    moved = 0
    for v in obj.data.vertices:
        p = v.co
        for x, y in wheels:
            if abs(p.y - y) > TIRE_HW + 0.02:
                continue
            dx, dz = p.x - x, p.z - WHEEL_Z
            radius = math.hypot(dx, dz)
            limit = TIRE_R + gap
            if 1e-5 < radius < limit:
                scale = limit / radius
                p.x = x + dx * scale
                p.z = WHEEL_Z + dz * scale
                v.co = p
                moved += 1
                break
    if moved:
        obj.data.update()
    return moved


def clip_count(obj):
    wheels = ((FRONT_X, HALF_TRACK), (FRONT_X, -HALF_TRACK), (REAR_X, HALF_TRACK), (REAR_X, -HALF_TRACK))
    n = 0
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        for x, y in wheels:
            if abs(p.y - y) > TIRE_HW - 0.01:
                continue
            if math.hypot(p.x - x, p.z - WHEEL_Z) < TIRE_R - 0.006:
                n += 1
                break
    return n


def assert_visible():
    """The glass and the lamps have to be the first thing a ray hits."""
    deps = bpy.context.evaluated_depsgraph_get()
    checks = [
        ('windshield', Vector((1.7, 0.0, 1.55)), Vector((-0.55, 0.0, -0.25)), 'h2-glass'),
        ('side glass', Vector((0.5, 1.5, 1.40)), Vector((0, -1, 0)), 'h2-glass'),
        ('side glass other', Vector((0.5, -1.5, 1.40)), Vector((0, 1, 0)), 'h2-glass'),
        ('rear glass', Vector((-2.5, 0.0, 1.26)), Vector((1, 0, 0)), 'h2-glass'),
        ('headlamp', Vector((2.6, 0.82, 0.78)), Vector((-1, 0, 0)), 'h2-headlamp'),
        ('headlamp other', Vector((2.6, -0.82, 0.78)), Vector((-1, 0, 0)), 'h2-headlamp'),
    ]
    bad = []
    for label, origin, direction, expect in checks:
        direction = direction.normalized()
        hit, _loc, _n, _i, obj, _m = bpy.context.scene.ray_cast(deps, origin, direction)
        name = obj.name if hit and obj else 'nothing'
        if not hit or not name.startswith(expect):
            bad.append(f'{label} hit {name}')
    if bad:
        raise SystemExit('glass or lamps occluded: ' + '; '.join(bad))
    print('  visibility ok')


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
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def build(high, mats):
    body = build_body(14 if high else 8)
    if high:
        subdivide_shell(body, 2)
    else:
        subdivide_shell(body, 1)
    print('  body clearance', push_clear(body, 0.06))
    # Black lower cladding is the bottom of the same shell, cut on a plane
    # so the break is a line and not a second intersecting skin.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                           plane_co=Vector((0, 0, 0.52)), plane_no=Vector((0, 0, 1)))
    bm.to_mesh(body.data)
    bm.free()
    body.data.materials.append(mats['paint'])
    body.data.materials.append(mats['trim'])
    for poly in body.data.polygons:
        poly.material_index = 1 if poly.center.z < 0.52 else 0
    glass = build_glass()
    glass.data.materials.append(mats['glass'])
    grille, lens, amber, fog, tail = build_fascia_inserts()
    grille.data.materials.append(mats['trim'])
    lens.data.materials.append(mats['lens'])
    amber.data.materials.append(mats['amber'])
    fog.data.materials.append(mats['fog'])
    tail.data.materials.append(mats['tail'])
    details = build_details()
    details.data.materials.append(mats['trim'])
    tires, rims = place_wheels(high)
    for obj in tires:
        obj.data.materials.append(mats['tire'])
    for obj in rims:
        obj.data.materials.append(mats['rim'])
    decal = build_decal()
    objects = [body, glass, grille, lens, amber, fog, tail, details, decal, *tires, *rims]
    for obj in objects:
        if obj in tires or obj in rims:
            continue
        n = clip_count(obj)
        if n:
            raise SystemExit(f'{obj.name} intersects a tire ({n} verts)')
    assert_visible()
    total = sum(tri_count(o) for o in objects)
    print(('HIGH' if high else 'LOW'), 'tris', total, 'objects', len(objects))
    return objects


def main():
    clear_scene()
    mats = {
        'paint': make_mat('paint', srgb(242, 196, 48), 0.05, 0.28),
        'trim': make_mat('trim', srgb(16, 16, 18), 0.04, 0.55),
        'glass': make_mat('glass', srgb(12, 16, 20), 0.55, 0.08),
        'lens': make_mat('lens', srgb(230, 236, 240), 0.0, 0.06),
        'amber': make_mat('amber', srgb(255, 150, 30), 0.0, 0.35, srgb(255, 140, 0), 2.4),
        'fog': make_mat('fog', srgb(255, 190, 120), 0.0, 0.3, srgb(255, 160, 70), 1.5),
        'tail': make_mat('tail', srgb(160, 16, 12), 0.0, 0.35, srgb(255, 20, 12), 1.6),
        'tire': make_mat('tire', srgb(22, 22, 22), 0.0, 0.70),
        'rim': make_mat('rim', srgb(186, 190, 194), 0.85, 0.28),
    }
    paint = next(n for n in mats['paint'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(paint, ['Coat Weight', 'Clearcoat'], 0.6)
    set_in(paint, ['Coat Roughness', 'Clearcoat Roughness'], 0.12)
    lens = next(n for n in mats['lens'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(lens, ['Transmission Weight', 'Transmission'], 0.55)
    high = build(True, mats)
    export(os.path.join(OUT, 'h2.glb'), high)
    for obj in high:
        obj.name = '_high_' + obj.name
        obj.hide_set(True)
        obj.select_set(False)
    low = build(False, mats)
    export(os.path.join(OUT, 'h2-low.glb'), low)


if __name__ == '__main__':
    main()
