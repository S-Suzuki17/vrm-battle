import bpy
import bmesh
import math
import os
import random

OUT_RENDERS = r"C:\Users\souta\vrm-battle\assets\renders"
OUT_MODELS = r"C:\Users\souta\vrm-battle\assets\models"
os.makedirs(OUT_RENDERS, exist_ok=True)
os.makedirs(OUT_MODELS, exist_ok=True)


def setup_cycles(samples=32, res_x=512, res_y=512, transparent=False):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for dev_type in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
            try:
                prefs.compute_device_type = dev_type
                prefs.get_devices()
                if any(d.type != 'CPU' for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = True
                    scene.cycles.device = 'GPU'
                    break
            except Exception:
                pass
    except Exception:
        pass

    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.05
    scene.cycles.use_denoising = False
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    scene.view_settings.view_transform = 'AgX'
    return scene


def assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def make_pbr_mat(name, base_color, metallic=0.0, roughness=0.5, emission_color=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission_color and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def make_building_window_material(name, facade_rgb, window_tint_rgb, emission_strength=3.2):
    """
    動画 (youtu.be/uk404c43pRY) の「ひと手間でビルをそれっぽくする」窓グリッド発光＆反射シェーダー
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex_coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (4.5, 4.5, 6.0)
    links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])

    brick = nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.0
    if "Color1" in brick.inputs:
        brick.inputs["Color1"].default_value = (*window_tint_rgb, 1.0)
    if "Color2" in brick.inputs:
        brick.inputs["Color2"].default_value = (0.04, 0.06, 0.10, 1.0)
    if "Mortar" in brick.inputs:
        brick.inputs["Mortar"].default_value = (*facade_rgb, 1.0)
    if "Scale" in brick.inputs:
        brick.inputs["Scale"].default_value = 6.0
    if "Mortar Size" in brick.inputs:
        brick.inputs["Mortar Size"].default_value = 0.08
    if "Mortar Smooth" in brick.inputs:
        brick.inputs["Mortar Smooth"].default_value = 0.02
    if "Bias" in brick.inputs:
        brick.inputs["Bias"].default_value = -0.25
    if "Brick Width" in brick.inputs:
        brick.inputs["Brick Width"].default_value = 0.45
    if "Row Height" in brick.inputs:
        brick.inputs["Row Height"].default_value = 0.32
    links.new(mapping.outputs["Vector"], brick.inputs["Vector"])

    links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.65
    bsdf.inputs["Roughness"].default_value = 0.18

    if "Emission Color" in bsdf.inputs:
        links.new(brick.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    return mat


def render_scramble_crossing_ground():
    """
    1. 渋谷スクランブル交差点（5方向横断歩道・濡れアスファルト・白線・マンホール）をCyclesでレンダリング
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_cycles(samples=36, res_x=512, res_y=512, transparent=False)

    world = bpy.data.worlds.new("CityGroundWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.14, 0.18, 0.28, 1.0)
    bg.inputs["Strength"].default_value = 1.6

    # 濡れたリアルなアスファルト地面（バンプ＆ラフネスムラ付き）
    asphalt_mat = bpy.data.materials.new("WetAsphalt")
    asphalt_mat.use_nodes = True
    nodes = asphalt_mat.node_tree.nodes
    links = asphalt_mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.075, 0.082, 0.098, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.15

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 28.0
    noise.inputs["Detail"].default_value = 10.0
    noise.inputs["Roughness"].default_value = 0.65

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.38
    ramp.color_ramp.elements[0].color = (0.12, 0.12, 0.12, 1.0)  # 水たまり反射
    ramp.color_ramp.elements[1].position = 0.68
    ramp.color_ramp.elements[1].color = (0.68, 0.68, 0.68, 1.0)  # 乾いたアスファルト

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    bpy.ops.mesh.primitive_plane_add(size=24.0, location=(0, 0, 0))
    ground = bpy.context.active_object
    assign_mat(ground, asphalt_mat)

    # 横断歩道の白ペイントマテリアル
    stripe_mat = make_pbr_mat("WhiteRoadPaint", (0.92, 0.94, 0.96), metallic=0.05, roughness=0.42,
                              emission_color=(0.85, 0.90, 0.95), emission_strength=0.22)
    yellow_mat = make_pbr_mat("YellowCurbPaint", (0.98, 0.72, 0.12), metallic=0.1, roughness=0.35,
                              emission_color=(0.98, 0.72, 0.12), emission_strength=0.35)
    neon_cyan_mat = make_pbr_mat("NeonGuide", (0.05, 0.88, 1.0), metallic=0.2, roughness=0.2,
                                 emission_color=(0.05, 0.88, 1.0), emission_strength=2.2)

    def add_crosswalk(cx, cy, angle_deg, width=3.4, length=7.5, stripe_count=9):
        rot_z = math.radians(angle_deg)
        cos_a = math.cos(rot_z)
        sin_a = math.sin(rot_z)
        for i in range(stripe_count):
            offset = (i - (stripe_count - 1) / 2.0) * (length / stripe_count)
            # 横断歩道の縦方向ベクトル (-sin_a, cos_a) に沿って白線を並べる
            sx = cx - sin_a * offset
            sy = cy + cos_a * offset
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, sy, 0.015))
            st = bpy.context.active_object
            st.scale = (width * 0.5, 0.22, 0.01)
            st.rotation_euler = (0, 0, rot_z)
            assign_mat(st, stripe_mat)

    # 渋谷スクランブル交差点：東西南北4本の横断歩道 ＋ 斜めスクランブル横断歩道2本！
    add_crosswalk(0.0, 6.2, 0.0, width=3.2, length=8.2, stripe_count=10)
    add_crosswalk(0.0, -6.2, 0.0, width=3.2, length=8.2, stripe_count=10)
    add_crosswalk(6.2, 0.0, 90.0, width=3.2, length=8.2, stripe_count=10)
    add_crosswalk(-6.2, 0.0, 90.0, width=3.2, length=8.2, stripe_count=10)
    # 象徴的な斜めスクランブル横断歩道！
    add_crosswalk(0.0, 0.0, 42.0, width=2.6, length=12.8, stripe_count=15)
    add_crosswalk(0.0, 0.0, -42.0, width=2.2, length=11.5, stripe_count=13)

    # 外周の黄色い道路規制ライン＆都市マンホール
    bpy.ops.mesh.primitive_torus_add(major_radius=10.1, minor_radius=0.14, major_segments=64, minor_segments=12, location=(0, 0, 0.02))
    outer_ring = bpy.context.active_object
    assign_mat(outer_ring, yellow_mat)

    bpy.ops.mesh.primitive_torus_add(major_radius=9.75, minor_radius=0.06, major_segments=64, minor_segments=12, location=(0, 0, 0.025))
    inner_ring = bpy.context.active_object
    assign_mat(inner_ring, neon_cyan_mat)

    # 渋谷マンホール蓋
    manhole_mat = make_pbr_mat("ManholeIron", (0.22, 0.24, 0.28), metallic=0.85, roughness=0.32)
    for mx, my in ((2.8, -1.9), (-3.1, 2.2)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.52, depth=0.03, location=(mx, my, 0.015))
        mh = bpy.context.active_object
        assign_mat(mh, manhole_mat)

    # 街灯＆ネオンサインの反射用エリアライト
    bpy.ops.object.light_add(type='SUN', location=(8, -8, 16))
    sun = bpy.context.active_object
    sun.data.energy = 3.2
    sun.data.color = (1.0, 0.92, 0.82)
    sun.rotation_euler = (math.radians(32), math.radians(18), math.radians(35))

    for lx, ly, col in ((-8, 8, (0.0, 0.85, 1.0)), (8, -8, (1.0, 0.25, 0.55)), (8, 8, (1.0, 0.82, 0.25))):
        bpy.ops.object.light_add(type='POINT', location=(lx, ly, 4.5))
        pt = bpy.context.active_object
        pt.data.energy = 350.0
        pt.data.color = col

    # 真上からのオルソカメラ
    bpy.ops.object.camera_add(location=(0, 0, 18.0), rotation=(0, 0, 0))
    cam = bpy.context.active_object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 22.0
    scene.camera = cam

    scene.render.filepath = os.path.join(OUT_RENDERS, "cycles_city_ground.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered Cycles Shibuya Scramble Ground!")


def build_gis_tokyo_city_blocks():
    """
    動画 (youtu.be/uk404c43pRY) の手法で都市区画フットプリントからビル群・109風ランドマーク・
    ネオン看板・屋上設備・街灯・信号機を一括生成する
    """
    random.seed(42)

    mat_glass_blue = make_building_window_material("SkyscraperBlue", (0.12, 0.16, 0.24), (0.35, 0.82, 1.0), 2.4)
    mat_glass_warm = make_building_window_material("SkyscraperWarm", (0.18, 0.16, 0.15), (1.0, 0.82, 0.45), 2.2)
    mat_glass_cyber = make_building_window_material("SkyscraperCyber", (0.10, 0.12, 0.18), (0.85, 0.35, 1.0), 2.5)
    mat_concrete = make_pbr_mat("UrbanConcrete", (0.28, 0.30, 0.34), metallic=0.1, roughness=0.65)
    mat_dark_metal = make_pbr_mat("DarkSteel", (0.12, 0.14, 0.18), metallic=0.82, roughness=0.28)
    mat_sidewalk = make_pbr_mat("SidewalkStone", (0.42, 0.44, 0.48), metallic=0.05, roughness=0.55)

    neon_mats = [
        make_pbr_mat("NeonPink", (1.0, 0.15, 0.55), 0.1, 0.2, (1.0, 0.15, 0.55), 5.5),
        make_pbr_mat("NeonCyan", (0.0, 0.92, 1.0), 0.1, 0.2, (0.0, 0.92, 1.0), 5.5),
        make_pbr_mat("NeonGold", (1.0, 0.78, 0.10), 0.1, 0.2, (1.0, 0.78, 0.10), 5.0),
        make_pbr_mat("NeonGreen", (0.15, 1.0, 0.48), 0.1, 0.2, (0.15, 1.0, 0.48), 4.8),
    ]
    red_beacon_mat = make_pbr_mat("RedBeacon", (1.0, 0.08, 0.08), 0.1, 0.2, (1.0, 0.08, 0.08), 8.0)

    # 1. 渋谷109風の象徴的な円筒形ランドマークタワー（正面奥）
    tx, ty = 0.0, -17.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=3.4, depth=22.0, location=(tx, ty, 11.0))
    cylinder_tower = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    assign_mat(cylinder_tower, mat_glass_blue)

    # タワー上部の巨大ネオンビジョンパネル
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=3.52, depth=5.5, location=(tx, ty, 17.5))
    vision = bpy.context.active_object
    assign_mat(vision, neon_mats[1])

    # 2. 交差点を取り囲むGIS都市区画ビル群（カメラ手前側 [y > 9, abs(x) < 12] は視界確保のため開ける）
    building_footprints = [
        # (x, y, width_x, depth_y, height, mat_index)
        (-10.5, -14.5, 6.2, 5.8, 26.0, 0),
        (10.5, -14.5, 6.4, 5.8, 24.0, 1),
        (-17.5, -9.5, 5.8, 6.2, 19.5, 2),
        (17.5, -9.5, 5.8, 6.2, 21.0, 0),
        (-18.5, 0.0, 6.0, 7.0, 28.0, 1),
        (18.5, 0.0, 6.0, 7.0, 30.0, 2),
        (-16.5, 9.5, 5.5, 5.5, 17.0, 0),
        (16.5, 9.5, 5.5, 5.5, 18.0, 1),
        # 第2リング（外周の超高層新宿・渋谷スカイラインビル群）
        (-22.0, -22.0, 8.0, 8.0, 42.0, 0),
        (-8.0, -27.0, 7.5, 7.0, 48.0, 2),
        (8.0, -27.0, 7.5, 7.0, 45.0, 1),
        (22.0, -22.0, 8.0, 8.0, 39.0, 0),
        (-28.0, -6.0, 7.5, 8.5, 36.0, 1),
        (28.0, -6.0, 7.5, 8.5, 38.0, 2),
        (-26.0, 12.0, 7.0, 7.0, 31.0, 2),
        (26.0, 12.0, 7.0, 7.0, 33.0, 0),
    ]

    glass_mats = [mat_glass_blue, mat_glass_warm, mat_glass_cyber]

    for idx, (bx, by, wx, dy, h, m_idx) in enumerate(building_footprints):
        # 歩道台座
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, 0.2))
        sw = bpy.context.active_object
        sw.scale = (wx * 0.58, dy * 0.58, 0.2)
        assign_mat(sw, mat_sidewalk)

        # ビル本体（GIS Extrude風）
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, h * 0.5))
        bldg = bpy.context.active_object
        bldg.scale = (wx * 0.5, dy * 0.5, h * 0.5)
        assign_mat(bldg, glass_mats[m_idx % len(glass_mats)])

        # 屋上ペントハウス＆空調室外機（ひと手間でリアルにするディテール）
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx + 0.5, by - 0.4, h + 0.9))
        roof_box = bpy.context.active_object
        roof_box.scale = (wx * 0.25, dy * 0.25, 0.9)
        assign_mat(roof_box, mat_concrete)

        # 屋上の赤色航空障害灯
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(bx - wx * 0.42, by + dy * 0.42, h + 0.35))
        beacon = bpy.context.active_object
        assign_mat(beacon, red_beacon_mat)

        # ビル壁面の縦長ネオン看板（交差点側に向けて配置）
        sign_mat = neon_mats[idx % len(neon_mats)]
        ang_to_center = math.atan2(-by, -bx)
        sx = bx + math.cos(ang_to_center) * (wx * 0.52)
        sy = by + math.sin(ang_to_center) * (dy * 0.52)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, sy, min(h * 0.55, 11.0)))
        sign = bpy.context.active_object
        sign.scale = (0.18, 0.95, 3.2)
        sign.rotation_euler = (0, 0, ang_to_center)
        assign_mat(sign, sign_mat)

    # 3. 東京タワー／電波塔ランドマーク（遠景中央右奥）
    tower_red = make_pbr_mat("TokyoTowerRed", (0.95, 0.18, 0.12), 0.4, 0.3, (0.95, 0.22, 0.12), 2.5)
    tower_white = make_pbr_mat("TokyoTowerWhite", (0.95, 0.95, 0.98), 0.4, 0.3, (0.95, 0.95, 0.98), 2.0)
    tt_x, tt_y = 16.5, -36.0
    for tier in range(6):
        z0 = tier * 9.5 + 4.75
        r_bot = 3.8 * (1.0 - tier * 0.13)
        r_top = 3.8 * (1.0 - (tier + 1) * 0.13)
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=r_bot, radius2=r_top, depth=9.5, location=(tt_x, tt_y, z0))
        seg = bpy.context.active_object
        seg.rotation_euler = (0, 0, math.pi / 4)
        assign_mat(seg, tower_red if tier % 2 == 0 else tower_white)


def render_city_sky_and_showcase_and_export_glb():
    """
    2. 3D都市モデルを .glb に書き出しつつ、Cyclesで360°都市環境マップと都市ショーケース画像をレンダリング
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_cycles(samples=28, res_x=1024, res_y=512, transparent=False)

    # 夕暮れ〜トワイライトのドラマチックな東京の空（Nishita Sky）
    world = bpy.data.worlds.new("TokyoTwilightWorld")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.35

    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_elevation = math.radians(10.5)
    sky.sun_rotation = math.radians(40.0)
    sky.altitude = 120.0
    sky.air_density = 1.3
    sky.aerosol_density = 1.5
    sky.ozone_density = 2.5

    links.new(sky.outputs["Color"], bg.inputs["Color"])
    links.new(bg.outputs["Background"], out.inputs["Surface"])

    # 都市ビル群を生成
    build_gis_tokyo_city_blocks()

    # 360° Equirectangular パノラマカメラで都市環境マップをレンダリング
    bpy.ops.object.camera_add(location=(0, 0, 3.5), rotation=(math.pi / 2, 0, 0))
    pano_cam = bpy.context.active_object
    pano_cam.data.type = 'PANO'
    try:
        pano_cam.data.panorama_type = 'EQUIRECTANGULAR'
    except Exception:
        pass
    scene.camera = pano_cam
    scene.render.filepath = os.path.join(OUT_RENDERS, "cycles_city_sky.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered Cycles 360 City Sky Environment!")

    # 認定証カード＆ショーケース用のワイド都市パースペクティブレンダリング
    scene.render.resolution_x = 640
    scene.render.resolution_y = 360
    pano_cam.data.type = 'PERSP'
    pano_cam.data.lens = 28
    pano_cam.location = (0.0, 12.5, 4.2)
    pano_cam.rotation_euler = (math.radians(82), 0, 0)
    scene.render.filepath = os.path.join(OUT_RENDERS, "cycles_city_showcase.png")
    bpy.ops.render.render(write_still=True)
    print("Rendered Cycles City Showcase!")

    # GLB ステージアセットとして書き出し
    glb_path = os.path.join(OUT_MODELS, "tokyo_city_stage.glb")
    try:
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB')
        print("Exported 3D City Stage GLB:", glb_path)
    except Exception as e:
        print("GLB export warning:", e)


if __name__ == "__main__":
    if not os.path.exists(os.path.join(OUT_RENDERS, "cycles_city_ground.png")):
        render_scramble_crossing_ground()
    render_city_sky_and_showcase_and_export_glb()
    print("ALL BLENDER 5.2 TOKYO CITY ASSETS COMPLETE!")

