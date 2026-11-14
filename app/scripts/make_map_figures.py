"""
make_map_figures.py - builds the three map-marker figures (habitat, rover, astronaut)
and renders them as transparent PNG sprites, per docs habitat-marker.md / map-figures.md.

Run from the repo root (Blender 3.6 - 4.x, no add-ons needed):

    blender -b -P app/scripts/make_map_figures.py -- --out app/public/markers

Writes:
    app/public/markers/habitat@1x.png  @2x  @3x   (64 / 128 / 192 px)
    app/public/markers/rover@1x.png    @2x  @3x
    app/public/markers/astronaut@1x.png @2x @3x
    app/public/markers/src/map-figures.blend      (all three, shared camera + lights)

Shared rules from the spec:
  * orthographic camera, ~57 deg down from horizontal, 3/4 view (figures yawed 45 deg)
  * "front" (airlock / windshield / visor) faces south-east = bottom-right of the image
  * key light from the top-left (north-west), dim fill, soft contact shadow baked
    in through a shadow-catcher plane
  * the figure's ground point (world origin) lands on the exact image centre
  * ~6 px transparent margin at 64 px
World axes: +X = east (image right), +Y = north (image up), +Z = up. Metres.
"""

import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

# ----------------------------------------------------------------------------- settings
CAM_ELEVATION_DEG = 57.5      # spec: 55-60 deg from horizontal
FIGURE_YAW_DEG    = -45.0     # rotates local +X (front) to south-east
KEY_AZIMUTH_DEG   = 135.0     # where the key light comes FROM, measured CCW from east (135 = NW)
KEY_ELEVATION_DEG = 62.0      # check against HiRISE tile shadows and adjust
KEY_SOFTNESS_DEG  = 14.0      # sun angular size -> shadow blur
SIZES             = {1: 64, 2: 128, 3: 192}
MARGIN_PX_AT_1X   = 6
SAMPLES           = 96
MAX_BYTES         = 40 * 1024

# ----------------------------------------------------------------------------- colours
def srgb(hexstr, a=1.0):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)

OFF_WHITE = srgb('#ebe7df')
DUST      = srgb('#c4a07c')
DARK_GREY = srgb('#3a3a3c')
SOIL      = srgb('#9b6a4a')
PANEL     = srgb('#26303d')
VISOR     = srgb('#2a2216')
LAMP_CYAN = srgb('#3fd0ff')
HATCH     = srgb('#2b2b2e')

# ----------------------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def link_collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col

WORLD_REF = bpy.data.objects.new('WorldRef', None)   # unrotated empty: world-space texture coords
scene.collection.objects.link(WORLD_REF)

# ----------------------------------------------------------------------------- materials
def _bsdf(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    return nt, nt.nodes['Principled BSDF']

def _set(bsdf, names, value):
    for n in names:
        if n in bsdf.inputs:
            bsdf.inputs[n].default_value = value
            return

def mat_flat(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    nt, b = _bsdf(m)
    b.inputs['Base Color'].default_value = color
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m

def mat_hull(name, dust_from_z, dust_to_z):
    """Off-white with dust-stained beige on the lower part, by world height."""
    m = bpy.data.materials.new(name)
    nt, b = _bsdf(m)
    b.inputs['Roughness'].default_value = 0.55
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.object = WORLD_REF
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = dust_from_z
    mr.inputs['From Max'].default_value = dust_to_z
    # a little noise so the dust line is not a ruler-straight edge
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.2
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 0.18
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = DUST
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = OFF_WHITE
    L = nt.links
    L.new(tc.outputs['Object'], sep.inputs['Vector'])
    L.new(sep.outputs['Z'], mr.inputs['Value'])
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    L.new(noise.outputs['Fac'], mul.inputs[0])
    L.new(mr.outputs['Result'], add.inputs[0])
    L.new(mul.outputs['Value'], add.inputs[1])
    L.new(add.outputs['Value'], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m

def mat_lamp(name, strength=14.0):
    m = bpy.data.materials.new(name)
    nt, b = _bsdf(m)
    b.inputs['Base Color'].default_value = LAMP_CYAN
    _set(b, ['Emission Color', 'Emission'], LAMP_CYAN)
    _set(b, ['Emission Strength'], strength)
    return m

def mat_soil(name):
    m = bpy.data.materials.new(name)
    nt, b = _bsdf(m)
    b.inputs['Roughness'].default_value = 1.0
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.object = WORLD_REF
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.9
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb('#87593c')
    ramp.color_ramp.elements[1].color = srgb('#a8775a')
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m

def mat_panel(name):
    """Dark blue-grey with a faint cell grid."""
    m = bpy.data.materials.new(name)
    nt, b = _bsdf(m)
    b.inputs['Roughness'].default_value = 0.35
    b.inputs['Metallic'].default_value = 0.3
    tc = nt.nodes.new('ShaderNodeTexCoord')
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = 0.0
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Brick Width'].default_value = 0.55
    brick.inputs['Row Height'].default_value = 0.55
    brick.inputs['Mortar Size'].default_value = 0.03
    brick.inputs['Color1'].default_value = PANEL
    brick.inputs['Color2'].default_value = PANEL
    brick.inputs['Mortar'].default_value = srgb('#56657a')
    nt.links.new(tc.outputs['Object'], brick.inputs['Vector'])
    nt.links.new(brick.outputs['Color'], b.inputs['Base Color'])
    return m

M_DARK  = mat_flat('Dark grey', DARK_GREY, 0.7)
M_CHASSIS = mat_flat('Chassis grey', srgb('#5c5c60'), 0.6)
M_HATCH = mat_flat('Hatch', HATCH, 0.5)
M_VISOR = mat_flat('Visor', VISOR, 0.15, 0.85)
M_LAMP  = mat_lamp('Lamp cyan')
M_SOIL  = mat_soil('Mars soil')
M_PANEL = mat_panel('Solar panel')

# ----------------------------------------------------------------------------- mesh helpers
_current = {'col': None, 'root': None}

def _finish(obj, mat, smooth=True):
    if mat is not None:
        obj.data.materials.append(mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
        if hasattr(obj.data, 'use_auto_smooth'):          # Blender < 4.1
            obj.data.use_auto_smooth = True
            obj.data.auto_smooth_angle = math.radians(40)
        else:                                             # Blender 4.1+: mark sharp edges by angle
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True); bpy.context.view_layer.objects.active = obj
            try:
                bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
            except Exception:
                pass
    for c in obj.users_collection:
        c.objects.unlink(obj)
    _current['col'].objects.link(obj)
    obj.parent = _current['root']
    return obj

def _new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    return obj

def cylinder(name, a, b, r, mat, segs=24, smooth=True):
    """Capped cylinder from point a to point b (figure-local coordinates)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=d.length)
    obj = _new_obj(name, bm)
    obj.location = (a + b) / 2
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = d.normalized().to_track_quat('Z', 'Y')
    return _finish(obj, mat, smooth)

def cone(name, a, b, r1, r2, mat, segs=24):
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=d.length)
    obj = _new_obj(name, bm)
    obj.location = (a + b) / 2
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = d.normalized().to_track_quat('Z', 'Y')
    return _finish(obj, mat)

def ellipsoid(name, center, radii, mat, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    obj = _new_obj(name, bm)
    obj.location = center
    obj.rotation_euler = [math.radians(x) for x in rot]
    return _finish(obj, mat)

def sphere(name, center, r, mat):
    return ellipsoid(name, center, (r, r, r), mat)

def capsule(name, a, b, r, mat):
    cylinder(name, a, b, r, mat, segs=16)
    sphere(name + ' end A', a, r, mat)
    sphere(name + ' end B', b, r, mat)

def rbox(name, center, size, mat, bevel=0.1, rot=(0, 0, 0)):
    """Box with rounded edges; size = full extents (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel,
                        segments=3, affect='EDGES', profile=0.5)
    obj = _new_obj(name, bm)
    obj.location = center
    obj.rotation_euler = [math.radians(x) for x in rot]
    o = _finish(obj, mat)
    return o

def begin_figure(name):
    col = link_collection(name)
    root = bpy.data.objects.new(name + ' root', None)
    col.objects.link(root)
    root.rotation_euler = (0, 0, math.radians(FIGURE_YAW_DEG))
    _current['col'], _current['root'] = col, root
    return col

# ============================================================================= HABITAT
# Recognisable surface base: vertical two-storey hub with a domed roof and a lit window
# band, a smaller side dome joined by a tunnel, a soil berm round both, roof comms mast
# with the cyan lamp, and solar panels behind. Local +X = front (airlock -> south-east).
def torus(name, center, R, r, mat, z_scale=1.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48,
                                     minor_segments=12, location=center)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (1, 1, z_scale)
    return _finish(obj, mat)

def build_habitat():
    col = begin_figure('habitat')
    HR, WALL = 4.0, 6.2
    hull = mat_hull('Habitat hull', 0.2, 2.6)
    win = mat_lamp('Window glow', strength=4.0)
    win.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb('#ffc46b')
    _set(win.node_tree.nodes['Principled BSDF'], ['Emission Color', 'Emission'], srgb('#ffc46b'))

    cylinder('Hub wall', (0, 0, 0), (0, 0, WALL), HR, hull, segs=48)
    ellipsoid('Hub roof', (0, 0, WALL), (HR, HR, 1.2), hull)
    cylinder('Roof rim', (0, 0, WALL - 0.05), (0, 0, WALL + 0.12), HR + 0.12, M_DARK, segs=48)
    for k in range(8):                                   # window band, upper storey
        a = math.radians(-157.5 + 45 * k)
        rbox('Window', (HR * math.cos(a), HR * math.sin(a), 4.5), (0.3, 1.25, 1.0), win,
             bevel=0.1, rot=(0, 0, math.degrees(a)))
    torus('Hub berm', (0, 0, 0), HR + 0.35, 1.3, M_SOIL, z_scale=0.85)

    cylinder('Airlock', (HR - 0.4, 0, 1.45), (HR + 2.3, 0, 1.45), 1.25, hull)
    cylinder('Hatch', (HR + 2.3, 0, 1.45), (HR + 2.4, 0, 1.45), 0.9, M_HATCH)

    dc = (-5.0, -5.0, 0.0)                               # side dome, ends up west (image left)
    ellipsoid('Side dome', dc, (2.7, 2.7, 2.6), hull)
    torus('Dome berm', dc, 2.85, 0.9, M_SOIL, z_scale=0.8)
    cylinder('Tunnel', (-2.4, -2.4, 1.2), (-3.4, -3.4, 1.2), 1.05, hull)

    mx, my = -1.4, 1.4                                   # roof comms mast + the one cyan lamp
    cylinder('Mast', (mx, my, WALL + 0.8), (mx, my, WALL + 3.0), 0.13, M_DARK, segs=12)
    cone('Dish', (mx + 0.15, my - 0.1, WALL + 2.0), (mx + 0.55, my - 0.3, WALL + 2.3), 0.75, 0.12, M_DARK)
    sphere('Lamp', (mx, my, WALL + 3.2), 0.4, M_LAMP)

    for px in (-2.2, 1.4):                               # solar panels behind (north-east)
        cylinder('Panel post', (px, 6.6, 0), (px, 6.6, 1.2), 0.1, M_DARK, segs=10)
        rbox('Solar panel', (px, 6.6, 1.35), (3.4, 2.3, 0.08), M_PANEL, bevel=0.02, rot=(25, 0, 0))
    return col

# ============================================================================= ROVER
# Small pressurised rover; local +X = front (windshield).
def build_rover():
    col = begin_figure('rover')
    hull = mat_hull('Rover hull', 0.7, 2.3)
    rbox('Chassis', (0, 0, 1.0), (4.8, 2.5, 0.55), M_CHASSIS, bevel=0.12)
    rbox('Cabin', (-0.25, 0, 2.15), (4.0, 2.35, 1.75), hull, bevel=0.45)
    rbox('Windshield', (1.66, 0, 2.35), (0.3, 2.05, 1.0), M_VISOR, bevel=0.1, rot=(0, -25, 0))
    rbox('Rear hatch', (-2.27, 0, 2.05), (0.1, 1.1, 1.1), M_HATCH, bevel=0.04)
    for x in (-1.6, 0.0, 1.6):
        for sy in (-1, 1):
            y = sy * 1.42
            cylinder('Wheel', (x, y - 0.25, 0.58), (x, y + 0.25, 0.58), 0.58, M_DARK, segs=24)
            cylinder('Hub', (x, y + sy * 0.25, 0.58), (x, y + sy * 0.28, 0.58), 0.28, hull, segs=16)
    cylinder('Mast', (-1.5, 0.6, 3.0), (-1.5, 0.6, 3.75), 0.07, M_DARK, segs=10)
    sphere('Lamp', (-1.5, 0.6, 3.85), 0.17, M_LAMP)
    return col

# ============================================================================= ASTRONAUT
# One suited figure, ~1.9 m; local +X = front (visor).
def build_astronaut():
    col = begin_figure('astronaut')
    suit = mat_hull('Suit', 0.15, 0.75)
    for sy in (-1, 1):
        capsule('Leg', (0.02, sy * 0.15, 0.16), (0.0, sy * 0.14, 0.86), 0.12, suit)
        rbox('Boot', (0.07, sy * 0.15, 0.08), (0.34, 0.2, 0.16), M_DARK, bevel=0.05)
        capsule('Arm', (0.0, sy * 0.33, 1.42), (0.13, sy * 0.39, 0.95), 0.085, suit)
        sphere('Glove', (0.14, sy * 0.4, 0.9), 0.08, M_DARK)
    rbox('Torso', (0.0, 0, 1.2), (0.4, 0.58, 0.66), suit, bevel=0.12)
    rbox('Backpack', (-0.33, 0, 1.26), (0.3, 0.52, 0.7), suit, bevel=0.07)
    sphere('Helmet', (0.03, 0, 1.68), 0.2, suit)
    ellipsoid('Visor', (0.1, 0, 1.69), (0.14, 0.165, 0.13), M_VISOR)
    sphere('Lamp', (0.04, 0.19, 1.82), 0.045, M_LAMP)
    return col

# ----------------------------------------------------------------------------- camera, lights, catcher
def look_from(obj, direction, dist):
    obj.location = Vector(direction).normalized() * dist
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = (-obj.location).to_track_quat('-Z', 'Y')

def az_el(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))

rig = link_collection('rig')

cam_data = bpy.data.cameras.new('Marker camera')
cam_data.type = 'ORTHO'
cam_data.clip_end = 500
cam = bpy.data.objects.new('Marker camera', cam_data)
rig.objects.link(cam)
look_from(cam, az_el(-90, CAM_ELEVATION_DEG), 120)   # from the south, looking north and down
scene.camera = cam

key_dir = az_el(KEY_AZIMUTH_DEG, KEY_ELEVATION_DEG)
key = bpy.data.objects.new('Key', bpy.data.lights.new('Key', 'SUN'))
key.data.energy = 3.2
key.data.angle = math.radians(KEY_SOFTNESS_DEG)
key.data.color = (1.0, 0.97, 0.92)
rig.objects.link(key); look_from(key, key_dir, 50)

fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'SUN'))
fill.data.energy = 0.7
fill.data.color = (0.85, 0.9, 1.0)
for attr in ('use_shadow',):
    if hasattr(fill.data, attr): setattr(fill.data, attr, False)
if hasattr(fill.data, 'cycles') and hasattr(fill.data.cycles, 'cast_shadow'):
    fill.data.cycles.cast_shadow = False
rig.objects.link(fill); look_from(fill, az_el(-45, 25), 50)

bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200)
catcher = _new_obj('Shadow catcher', bm)
for c in catcher.users_collection: c.objects.unlink(catcher)
rig.objects.link(catcher)
catcher.is_shadow_catcher = True

world = bpy.data.worlds.new('Ambient'); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.42, 0.36, 0.32, 1)
bg.inputs['Strength'].default_value = 0.55

# ----------------------------------------------------------------------------- render settings
r = scene.render
r.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
r.film_transparent = True
r.resolution_percentage = 100
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
r.image_settings.color_depth = '8'
r.image_settings.compression = 100
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'

# ----------------------------------------------------------------------------- framing
def fit_ortho(col):
    """Ortho scale so everything (and its hard shadow) fits around the centred ground point."""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    inv = cam.matrix_world.inverted()
    sun = key_dir.normalized()
    ext = 0.0
    for obj in col.all_objects:
        if obj.type != 'MESH':
            continue
        ev = obj.evaluated_get(deps)
        me = ev.to_mesh()
        for v in me.vertices:
            p = ev.matrix_world @ v.co
            q = p - sun * (0.6 * p.z / sun.z)        # most of the (soft) shadow on the ground
            for pt in (p, q):
                c = inv @ pt
                ext = max(ext, abs(c.x), abs(c.y))
        ev.to_mesh_clear()
    usable = (SIZES[1] - 2 * MARGIN_PX_AT_1X) / SIZES[1]
    return 2 * ext / usable

# ----------------------------------------------------------------------------- go
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = 'app/public/markers'
if '--out' in argv:
    out = argv[argv.index('--out') + 1]
out = os.path.abspath(out)
os.makedirs(os.path.join(out, 'src'), exist_ok=True)

figures = {'habitat': build_habitat(), 'rover': build_rover(), 'astronaut': build_astronaut()}
scales = {name: fit_ortho(col) for name, col in figures.items()}

for name, col in figures.items():
    for other, ocol in figures.items():
        ocol.hide_render = (other != name)
        ocol.hide_viewport = (other != name)
    cam_data.ortho_scale = scales[name]
    for k, px in SIZES.items():
        r.resolution_x = r.resolution_y = px
        path = os.path.join(out, f'{name}@{k}x.png')
        r.filepath = path
        bpy.ops.render.render(write_still=True)
        size = os.path.getsize(path)
        flag = '' if size <= MAX_BYTES else '   <-- over 40 KB, lower SAMPLES or use WebP'
        print(f'[map-figures] {path}  {size / 1024:.1f} KB  ortho={scales[name]:.2f} m{flag}')

# leave the habitat active in the saved file; keep each figure's scale as a property
for name, col in figures.items():
    col['ortho_scale'] = scales[name]
    col.hide_render = col.hide_viewport = (name != 'habitat')
cam_data.ortho_scale = scales['habitat']
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'src', 'map-figures.blend'))
print('[map-figures] done')
