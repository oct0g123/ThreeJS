"""
Little Garden - example Blender model: a cosy mushroom house.

This shows the Blender -> three.js pipeline the game uses. Run it either way:

  * In Blender: open the Scripting tab, open this file, press "Run Script".
  * Headless:   blender --background --python blender/mushroom_house.py
                (or `pip install bpy` and run it with a matching Python)

It builds the model and exports models/mushroom_house.glb. Every .glb in the
models/ folder shows up in the game automatically (see src/objects/custom.js).

Conventions the game's importer understands:
  - 1 unit = 1 metre, base of the model at z=0, front of the house facing -Y.
  - Plain material colours (Principled BSDF Base Color).
  - Emission makes a material glow at night (windows, lamps).
  - Material names containing "Leaves"/"Grass"/"Foliage" sway in the wind.
"""

import math
import os
import random

import bpy  # must come first: it makes bmesh/mathutils importable outside Blender
import bmesh
from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "models", "mushroom_house.glb"))
random.seed(7)


def srgb(hex_color):
    """'#rrggbb' -> linear RGBA tuple, which is what Blender colour sockets expect."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def material(name, color, roughness=0.8, emission=None, strength=2.0):
    m = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        m.use_nodes = True  # always on from Blender 5
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = srgb(color)
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = srgb(emission)
        bsdf.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = srgb(color)
    return m


def mesh_object(name, bm, mat, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = Euler(rotation)
    ob.scale = scale
    if isinstance(mat, (list, tuple)):
        for m in mat:
            me.materials.append(m)
    else:
        me.materials.append(mat)
    return ob


def smooth(ob, angle=40):
    for p in ob.data.polygons:
        p.use_smooth = True
    # Blender 4.1+: keep hard edges crisp with a "smooth by angle" pass if available.
    try:
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
        ob.select_set(False)
    except Exception:
        pass


def cylinder(name, mat, radius, depth, segments=24, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=depth)
    return mesh_object(name, bm, mat, **kw)


def sphere(name, mat, radius, segments=16, rings=10, **kw):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    return mesh_object(name, bm, mat, **kw)


def cube(name, mat, size, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    return mesh_object(name, bm, mat, **kw)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    walls = material("Walls", "#f4e7d0", 0.9)
    cap = material("Cap", "#d8473b", 0.6)
    gills = material("Gills", "#ead2b0", 0.9)
    spots = material("Spots", "#fff7ee", 0.7)
    door = material("Door", "#8a5a3b", 0.8)
    trim = material("Trim", "#fbf5ea", 0.7)
    brass = material("Brass", "#e8c25a", 0.4)
    glass = material("Window Glow", "#cfe3ef", 0.2, emission="#ffcf7a", strength=2.0)
    lamp = material("Lamp Glow", "#ffe2a6", 0.3, emission="#ffcf7a", strength=3.0)
    stone = material("Stone", "#b8b2a7", 0.95)
    chimney = material("Chimney", "#8e8a84", 0.9)
    leaves = material("Leaves", "#6aa843", 0.9)
    petals = material("Petals", "#ff8fb1", 0.8)

    # --- stem: a slightly tapered, bevelled cylinder -------------------------
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.8, radius2=0.68, depth=1.5)
    stem = mesh_object("Stem", bm, walls, location=(0, 0, 0.75))
    bev = stem.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.06
    bev.segments = 3
    smooth(stem)

    # --- cap: half an ellipsoid with a flat underside ------------------------
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=1.0)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, -0.18), plane_no=(0, 0, 1), clear_inner=True)
    cut_edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    filled = bmesh.ops.holes_fill(bm, edges=cut_edges, sides=0)
    for f in filled["faces"]:
        f.material_index = 1
    cap_ob = mesh_object("Cap", bm, [cap, gills], location=(0, 0, 1.62), scale=(1.42, 1.42, 0.92))
    sub = cap_ob.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    smooth(cap_ob, 60)

    # white spots sitting on the cap surface
    a, c = 1.42, 0.92
    for i in range(11):
        theta = i / 11 * math.tau + random.uniform(-0.25, 0.25)
        phi = random.uniform(0.35, 1.25)
        p = Vector((a * math.sin(phi) * math.cos(theta), a * math.sin(phi) * math.sin(theta), c * math.cos(phi)))
        n = Vector((p.x / a**2, p.y / a**2, p.z / c**2)).normalized()
        r = random.uniform(0.11, 0.2)
        ob = sphere(f"Spot{i}", spots, r, 12, 6, location=Vector((0, 0, 1.62)) + p * 0.985, scale=(1, 1, 0.32))
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = n.to_track_quat("Z", "Y")
        smooth(ob)

    # --- door (front = -Y) ---------------------------------------------------
    cube("Door", door, (0.5, 0.12, 0.62), location=(0, -0.72, 0.36))
    cylinder("DoorArch", door, 0.25, 0.12, 20, location=(0, -0.72, 0.67), rotation=(math.pi / 2, 0, 0))
    sphere("Knob", brass, 0.04, 8, 6, location=(0.15, -0.8, 0.38))
    cube("Step", stone, (0.7, 0.4, 0.08), location=(0, -0.95, 0.04))
    smooth(cylinder("Stone1", stone, 0.22, 0.06, 10, location=(0.15, -1.38, 0.03)))
    smooth(cylinder("Stone2", stone, 0.18, 0.06, 10, location=(-0.1, -1.72, 0.03)))

    # --- round windows with white frames ------------------------------------
    for i, (ang, z) in enumerate([(-0.95, 0.95), (0.95, 0.95), (math.pi, 0.9), (2.2, 0.55)]):
        r = 0.74 - (z - 0.2) * 0.07
        loc = (math.sin(ang) * r, -math.cos(ang) * r, z)
        rot = (math.pi / 2, 0, ang)
        cylinder(f"Window{i}", glass, 0.16, 0.1, 20, location=loc, rotation=rot)
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, segments=20, radius=0.19, cap_ends=False)
        ring = mesh_object(f"WindowFrame{i}", bm, trim, location=loc, rotation=rot)
        mod = ring.modifiers.new("Skin", "SKIN")
        for v in ring.data.skin_vertices[""].data:
            v.radius = (0.035, 0.035)
        smooth(ring)

    # --- little chimney poking through the cap ------------------------------
    cylinder("Chimney", chimney, 0.12, 0.7, 12, location=(0.55, 0.45, 2.35), rotation=(0.15, -0.2, 0))
    cylinder("ChimneyTop", chimney, 0.16, 0.1, 12, location=(0.62, 0.5, 2.7), rotation=(0.15, -0.2, 0))

    # --- hanging lamp by the door -------------------------------------------
    cube("LampArm", chimney, (0.04, 0.22, 0.04), location=(0.42, -0.8, 1.12))
    sphere("Lamp", lamp, 0.08, 12, 8, location=(0.42, -0.9, 1.0))

    # --- grass tufts and flowers around the base (these sway in the wind) ---
    for i in range(9):
        ang = i / 9 * math.tau + random.uniform(-0.2, 0.2)
        if abs(math.atan2(math.sin(ang), -math.cos(ang))) < 0.5:
            continue  # keep the doorway clear
        r = random.uniform(0.85, 1.0)
        for k in range(3):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=3, radius1=0.035, radius2=0.0, depth=random.uniform(0.25, 0.45))
            mesh_object(
                f"Grass{i}_{k}", bm, leaves,
                location=(math.sin(ang) * r + random.uniform(-0.06, 0.06), -math.cos(ang) * r + random.uniform(-0.06, 0.06), 0.15),
                rotation=(random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), 0),
            )
        if i % 3 == 0:
            sphere(f"Flower{i}", petals, 0.05, 8, 6, location=(math.sin(ang) * (r + 0.08), -math.cos(ang) * (r + 0.08), 0.32))


def export():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_apply=True,  # bake modifiers (bevel, subdivision, skin)
        export_yup=True,  # glTF/three.js are Y-up
        export_materials="EXPORT",
    )
    print(f"Exported {OUT}")


if __name__ == "__main__":
    build()
    export()
