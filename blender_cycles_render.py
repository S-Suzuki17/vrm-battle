import bpy
import math
import random
import os

OUT_DIR = r"C:\Users\souta\vrm-battle\assets\renders"
os.makedirs(OUT_DIR, exist_ok=True)


def setup_cycles(samples=32, res_x=512, res_y=512, transparent=False):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    # Try GPU if available, otherwise CPU
    prefs = bpy.context.preferences
    cprefs = prefs.addons['cycles'].preferences if 'cycles' in prefs.addons else None
    if cprefs:
        for dev_type in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
            try:
                cprefs.compute_device_type = dev_type
                cprefs.get_devices()
                for d in cprefs.devices:
                    d.use = True
                scene.cycles.device = 'GPU'
                break
            except Exception:
                scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False  # Keep fast & compatible even without OIDN binary
    scene.cycles.use_adaptive_sampling = True
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    return scene


def make_pbr_mat(name, color, metallic=0.0, roughness=0.45, emission=None, em_strength=0.0, subsurf=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if subsurf > 0 and "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = subsurf
        if emission and em_strength > 0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = em_strength
    return mat


def assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def setup_world_sky(sun_elevation_deg=38.0):
    world = bpy.data.worlds.new("CyclesSkyWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()

    bg = nt.nodes.new("ShaderNodeBackground")
    sky = nt.nodes.new("ShaderNodeTexSky")
    out = nt.nodes.new("ShaderNodeOutputWorld")

    sky.sky_type = 'HOSEK_WILKIE'
    sky.sun_elevation = math.radians(sun_elevation_deg)
    sky.sun_rotation = math.radians(45.0)
    sky.turbidity = 2.4
    bg.inputs["Strength"].default_value = 1.35

    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


# ==============================================================================
# 1. Render Cycles Ray-Traced Colosseum Ground Texture (cycles_arena_ground.png)
# ==============================================================================
def render_arena_ground():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_cycles(samples=28, res_x=512, res_y=512, transparent=False)
    setup_world_sky(48.0)

    random.seed(42)
    dirt_mat = make_pbr_mat("DirtBase", (0.68, 0.52, 0.32), metallic=0.0, roughness=0.88)
    stone_mat = make_pbr_mat("AncientStone", (0.58, 0.54, 0.46), metallic=0.05, roughness=0.65)
    dark_stone = make_pbr_mat("DarkStone", (0.38, 0.35, 0.30), metallic=0.1, roughness=0.72)
    grass_mat = make_pbr_mat("ArenaGrass", (0.24, 0.46, 0.18), metallic=0.0, roughness=0.78)
    gold_rune = make_pbr_mat("RuneGlow", (1.0, 0.85, 0.3), emission=(1.0, 0.82, 0.25), em_strength=3.5)

    # Base dirt disc
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=10.5, depth=0.4, location=(0, 0, -0.2))
    base = bpy.context.active_object
    assign_mat(base, dirt_mat)

    # Outer grass border
    bpy.ops.mesh.primitive_torus_add(major_radius=10.2, minor_radius=1.2, major_segments=64, minor_segments=16, location=(0, 0, -0.1))
    grass_ring = bpy.context.active_object
    grass_ring.scale.z = 0.2
    assign_mat(grass_ring, grass_mat)

    # Concentric stone ring slabs (3D beveled blocks for real Cycles AO & shadows)
    for ring_r, count, size_w in [(8.4, 36, 0.65), (5.2, 24, 0.55), (2.2, 12, 0.48)]:
        for i in range(count):
            if random.random() < 0.12:
                continue  # weathered missing stone gap
            ang = (i / count) * math.pi * 2 + random.uniform(-0.02, 0.02)
            rx = math.cos(ang) * ring_r
            ry = math.sin(ang) * ring_r
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(rx, ry, random.uniform(0.01, 0.05)))
            slab = bpy.context.active_object
            slab.scale = (size_w, size_w * 1.35, 0.08)
            slab.rotation_euler.z = ang + math.pi / 2 + random.uniform(-0.08, 0.08)
            mod = slab.modifiers.new("Bevel", 'BEVEL')
            mod.width = 0.04
            mod.segments = 2
            assign_mat(slab, stone_mat if i % 2 == 0 else dark_stone)

    # Glowing boundary ring
    bpy.ops.mesh.primitive_torus_add(major_radius=9.3, minor_radius=0.07, major_segments=64, minor_segments=12, location=(0, 0, 0.03))
    rune = bpy.context.active_object
    assign_mat(rune, gold_rune)

    # Scattered 3D pebbles & dirt mounds
    for _ in range(95):
        r = random.uniform(0.5, 9.0)
        a = random.uniform(0, math.pi * 2)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=random.uniform(0.12, 0.35), location=(math.cos(a)*r, math.sin(a)*r, 0.02))
        peb = bpy.context.active_object
        peb.scale.z = 0.35
        peb.rotation_euler = (random.uniform(0, 3), random.uniform(0, 3), random.uniform(0, 3))
        assign_mat(peb, dark_stone if random.random() < 0.5 else dirt_mat)

    # Sun light for crisp ray-traced stone shadows
    bpy.ops.object.light_add(type='SUN', location=(8, -8, 15))
    sun = bpy.context.active_object
    sun.data.energy = 4.2
    sun.data.angle = math.radians(8.0)
    sun.rotation_euler = (math.radians(32), math.radians(24), math.radians(40))

    # Top-down Orthographic Camera
    bpy.ops.object.camera_add(location=(0, 0, 18.0), rotation=(0, 0, 0))
    cam = bpy.context.active_object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 20.5
    scene.camera = cam

    scene.render.filepath = os.path.join(OUT_DIR, "cycles_arena_ground.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered Cycles Arena Ground Texture!")


# ==============================================================================
# 2. Render Cycles 360 Equirectangular Environment Panorama (cycles_sky_env.png)
# ==============================================================================
def render_sky_panorama():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_cycles(samples=24, res_x=1024, res_y=512, transparent=False)
    setup_world_sky(32.0)

    ocean_mat = make_pbr_mat("OceanWater", (0.06, 0.36, 0.68), metallic=0.15, roughness=0.12)
    cliff_mat = make_pbr_mat("CoastalCliff", (0.32, 0.35, 0.38), metallic=0.0, roughness=0.82)
    cloud_mat = make_pbr_mat("FluffyCloud", (0.98, 0.98, 1.0), metallic=0.0, roughness=0.9, emission=(0.95, 0.96, 1.0), em_strength=0.45)

    # Ocean plane
    bpy.ops.mesh.primitive_plane_add(size=400.0, location=(0, 0, -4.0))
    ocean = bpy.context.active_object
    assign_mat(ocean, ocean_mat)

    # Distant mountain islands & clouds around horizon
    random.seed(7)
    for i in range(18):
        ang = (i / 18) * math.pi * 2
        dist = random.uniform(45.0, 85.0)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=random.uniform(8.0, 18.0), location=(math.cos(ang)*dist, math.sin(ang)*dist, -2.0))
        mtn = bpy.context.active_object
        mtn.scale = (1.6, 1.2, random.uniform(0.7, 1.4))
        assign_mat(mtn, cliff_mat)

    for i in range(24):
        ang = (i / 24) * math.pi * 2 + random.uniform(-0.1, 0.1)
        dist = random.uniform(35.0, 70.0)
        z_h = random.uniform(12.0, 28.0)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=6.5, location=(math.cos(ang)*dist, math.sin(ang)*dist, z_h))
        cl = bpy.context.active_object
        cl.scale = (2.2, 1.3, 0.65)
        bpy.ops.object.shade_smooth()
        assign_mat(cl, cloud_mat)

    bpy.ops.object.light_add(type='SUN', location=(0, 0, 20))
    sun = bpy.context.active_object
    sun.data.energy = 3.8
    sun.rotation_euler = (math.radians(52), 0, math.radians(35))

    # Equirectangular Panoramic Camera for PBR Environment Reflection + Skybox
    bpy.ops.object.camera_add(location=(0, 0, 2.0), rotation=(math.radians(90), 0, 0))
    cam = bpy.context.active_object
    cam.data.type = 'PANO'
    if hasattr(cam.data, "cycles"):
        cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
    scene.camera = cam

    scene.render.filepath = os.path.join(OUT_DIR, "cycles_sky_env.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered Cycles 360 Sky Panorama!")


# ==============================================================================
# 3. Render Cycles Ray-Traced Battle Showcase & Portraits
# ==============================================================================
def build_cycles_hero(root_loc=(-1.8, 0, 0)):
    skin_mat = make_pbr_mat("HeroSkin", (1.0, 0.85, 0.72), roughness=0.38, subsurf=0.35)
    hair_mat = make_pbr_mat("HeroBlueHair", (0.08, 0.48, 0.98), metallic=0.15, roughness=0.28)
    jacket_mat = make_pbr_mat("HeroJacket", (0.12, 0.22, 0.38), metallic=0.25, roughness=0.4)
    steel_mat = make_pbr_mat("RuneSteel", (0.78, 0.84, 0.92), metallic=0.92, roughness=0.16)
    dark_metal = make_pbr_mat("DarkSteel", (0.18, 0.20, 0.25), metallic=0.85, roughness=0.25)
    cyan_glow = make_pbr_mat("CyanRune", (0.0, 0.95, 1.0), emission=(0.0, 0.92, 1.0), em_strength=8.0)
    gold_mat = make_pbr_mat("GoldTrim", (1.0, 0.82, 0.18), metallic=0.95, roughness=0.18)

    hx, hy, hz = root_loc
    # Head
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.32, location=(hx, hy, hz + 1.55))
    head = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    assign_mat(head, skin_mat)

    # Spiky Blue Hair
    for i in range(12):
        ang = (i / 12) * math.pi * 2
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.14, depth=0.42, location=(hx + math.cos(ang)*0.22, hy + math.sin(ang)*0.22, hz + 1.75))
        sp = bpy.context.active_object
        sp.rotation_euler = (math.sin(ang)*0.6, -math.cos(ang)*0.6, 0)
        bpy.ops.object.shade_smooth()
        assign_mat(sp, hair_mat)

    # Forehead Goggles
    for gx in (-0.11, 0.11):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.085, depth=0.08, location=(hx + 0.26, hy + gx, hz + 1.68), rotation=(0, math.pi/2, 0))
        rim = bpy.context.active_object
        assign_mat(rim, gold_mat)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.065, depth=0.09, location=(hx + 0.265, hy + gx, hz + 1.68), rotation=(0, math.pi/2, 0))
        lens = bpy.context.active_object
        assign_mat(lens, cyan_glow)

    # Torso Jacket
    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=0.75, location=(hx, hy, hz + 1.0))
    torso = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    assign_mat(torso, jacket_mat)

    # Giant Rune Greatsword with Glowing Cyan Core
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(hx + 0.55, hy - 0.35, hz + 1.35))
    blade = bpy.context.active_object
    blade.scale = (0.08, 0.28, 1.65)
    blade.rotation_euler = (0.35, 0.45, -0.3)
    assign_mat(blade, steel_mat)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(hx + 0.55, hy - 0.35, hz + 1.35))
    core = bpy.context.active_object
    core.scale = (0.095, 0.07, 1.35)
    core.rotation_euler = (0.35, 0.45, -0.3)
    assign_mat(core, cyan_glow)


def build_cycles_oni_boss(root_loc=(1.8, 0, 0)):
    oni_skin = make_pbr_mat("OniCrimsonSkin", (0.72, 0.14, 0.14), roughness=0.42, subsurf=0.25)
    oni_armor = make_pbr_mat("OniPlateArmor", (0.45, 0.06, 0.06), metallic=0.78, roughness=0.28)
    horn_mat = make_pbr_mat("IvoryHorn", (0.95, 0.94, 0.88), roughness=0.25)
    eye_glow = make_pbr_mat("OniEyeGlow", (1.0, 0.85, 0.1), emission=(1.0, 0.8, 0.0), em_strength=6.0)

    bx, by, bz = root_loc
    # Muscular Torso
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.65, location=(bx, by, bz + 1.35))
    chest = bpy.context.active_object
    chest.scale = (0.85, 1.15, 1.1)
    bpy.ops.object.shade_smooth()
    assign_mat(chest, oni_skin)

    # Spiked Shoulder Pauldrons
    for sy in (-0.75, 0.75):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.38, location=(bx, by + sy, bz + 1.68))
        sh = bpy.context.active_object
        bpy.ops.object.shade_smooth()
        assign_mat(sh, oni_armor)
        for s in (-0.15, 0.0, 0.15):
            bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.08, depth=0.35, location=(bx + s, by + sy*1.2, bz + 1.95))
            sp = bpy.context.active_object
            assign_mat(sp, horn_mat)

    # Oni Head & Horns
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.36, location=(bx - 0.1, by, bz + 2.05))
    head = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    assign_mat(head, oni_skin)

    for hy_off in (-0.18, 0.18):
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.09, depth=0.45, location=(bx - 0.15, by + hy_off, bz + 2.42))
        horn = bpy.context.active_object
        horn.rotation_euler = (0, -0.35, 0)
        assign_mat(horn, horn_mat)

        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(bx - 0.42, by + hy_off*0.65, bz + 2.08))
        eye = bpy.context.active_object
        assign_mat(eye, eye_glow)

    # Giant War Hammer
    bpy.ops.mesh.primitive_cylinder_add(radius=0.44, depth=0.95, location=(bx - 0.65, by + 0.55, bz + 1.55), rotation=(math.pi/2, 0.3, 0.2))
    hammer = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    assign_mat(hammer, oni_armor)


def render_portraits_and_showcase():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_cycles(samples=36, res_x=256, res_y=256, transparent=False)
    setup_world_sky(36.0)

    build_cycles_hero((-1.8, 0, 0))
    build_cycles_oni_boss((1.8, 0, 0))

    # Studio 3-point lighting for rich Cycles specular & rim highlights
    bpy.ops.object.light_add(type='AREA', location=(0, -4.5, 3.8))
    key = bpy.context.active_object
    key.data.energy = 280.0
    key.data.size = 3.5
    key.rotation_euler = (math.radians(55), 0, 0)

    bpy.ops.object.light_add(type='AREA', location=(-3.5, 2.5, 3.2))
    rim_blue = bpy.context.active_object
    rim_blue.data.energy = 180.0
    rim_blue.data.color = (0.2, 0.85, 1.0)
    rim_blue.rotation_euler = (math.radians(60), 0, math.radians(-135))

    bpy.ops.object.light_add(type='AREA', location=(3.5, 2.5, 3.2))
    rim_red = bpy.context.active_object
    rim_red.data.energy = 180.0
    rim_red.data.color = (1.0, 0.35, 0.2)
    rim_red.rotation_euler = (math.radians(60), 0, math.radians(135))

    # 1. Hero Portrait Render
    bpy.ops.object.camera_add(location=(-0.55, -0.65, 1.72), rotation=(math.radians(84), 0, math.radians(-62)))
    cam = bpy.context.active_object
    cam.data.lens = 58
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT_DIR, "cycles_hero_portrait.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered Cycles Hero Portrait!")

    # 2. Oni Boss Portrait Render
    cam.location = (0.35, -0.65, 2.15)
    cam.rotation_euler = (math.radians(84), 0, math.radians(62))
    scene.render.filepath = os.path.join(OUT_DIR, "cycles_oni_portrait.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered Cycles Oni Boss Portrait!")

    # 3. Wide Battle Showcase Render (640x360)
    scene.render.resolution_x = 640
    scene.render.resolution_y = 360
    cam.location = (0.0, -4.8, 2.25)
    cam.rotation_euler = (math.radians(78), 0, 0)
    cam.data.lens = 35
    scene.render.filepath = os.path.join(OUT_DIR, "cycles_battle_showcase.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered Cycles Battle Showcase!")


if __name__ == "__main__":
    if not os.path.exists(os.path.join(OUT_DIR, "cycles_arena_ground.png")):
        render_arena_ground()
    render_sky_panorama()
    render_portraits_and_showcase()
    print("ALL BLENDER CYCLES RENDERS COMPLETE!")

