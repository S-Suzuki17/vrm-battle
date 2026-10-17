import bpy
import bmesh
import math
import random
import os

OUTPUT_DIR = r"C:\Users\souta\vrm-battle\assets\models"
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, base_color, metallic=0.0, roughness=0.5, emission_color=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission_color and emission_strength > 0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def assign_material(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def add_bevel(obj, width=0.03, segments=2):
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def export_model(filename_base):
    glb_path = os.path.join(OUTPUT_DIR, f"{filename_base}.glb")
    fbx_path = os.path.join(OUTPUT_DIR, f"{filename_base}.fbx")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_apply=True
    )
    bpy.ops.export_scene.fbx(
        filepath=fbx_path,
        use_selection=False,
        apply_scale_options='FBX_SCALE_ALL'
    )
    print(f"[BlenderGen] Exported: {glb_path} and {fbx_path}")


# ==============================================================================
# 1. アンリミテッドクルーズ風・古代遺跡の断崖コロシアム (colosseum_arena)
# ==============================================================================
def build_colosseum_arena():
    clear_scene()
    random.seed(42)

    # マテリアル定義
    mat_sandstone = make_material("Sandstone", (0.76, 0.68, 0.52), metallic=0.05, roughness=0.75)
    mat_dark_stone = make_material("DarkStone", (0.48, 0.43, 0.35), metallic=0.1, roughness=0.8)
    mat_cliff_rock = make_material("CliffRock", (0.26, 0.25, 0.23), metallic=0.05, roughness=0.92)
    mat_ancient_gold = make_material("AncientGold", (0.85, 0.65, 0.20), metallic=0.85, roughness=0.3, emission_color=(0.85, 0.55, 0.1), emission_strength=0.3)
    mat_iron = make_material("DarkIron", (0.15, 0.16, 0.18), metallic=0.85, roughness=0.4)
    mat_ember = make_material("FireEmber", (1.0, 0.35, 0.05), metallic=0.0, roughness=0.2, emission_color=(1.0, 0.45, 0.05), emission_strength=8.0)
    mat_moss = make_material("AncientMoss", (0.22, 0.38, 0.18), metallic=0.0, roughness=0.85)

    arena_r = 11.0

    # 1. 断崖絶壁の岩盤ベース (Cliff Island Base)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=arena_r + 1.8, depth=9.0, location=(0, 0, -4.6))
    cliff = bpy.context.active_object
    cliff.name = "CliffIslandBase"
    # 頂点をランダムに凹凸変位させて自然の岩肌を作る
    bm = bmesh.new()
    bm.from_mesh(cliff.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    for v in bm.verts:
        if v.co.z < 4.2:  # 上面はフラットに保つ
            factor = 1.0 + random.uniform(-0.12, 0.15)
            v.co.x *= factor
            v.co.y *= factor
            v.co.z += random.uniform(-0.3, 0.3)
        else:
            v.co.x *= 0.88
            v.co.y *= 0.88
    bm.to_mesh(cliff.data)
    bm.free()
    assign_material(cliff, mat_cliff_rock)

    # 2. コロシアムメイン石畳フロア
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=arena_r, depth=0.45, location=(0, 0, -0.22))
    floor = bpy.context.active_object
    floor.name = "ArenaMainFloor"
    add_bevel(floor, width=0.06, segments=2)
    assign_material(floor, mat_sandstone)

    # 3. 外周の段差リング石ブロック (24分割の楔形石ブロック)
    num_blocks = 24
    for i in range(num_blocks):
        ang = (i * 2.0 * math.pi) / num_blocks
        bx = math.cos(ang) * (arena_r - 0.55)
        by = math.sin(ang) * (arena_r - 0.55)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, 0.08))
        blk = bpy.context.active_object
        blk.name = f"CurbBlock_{i}"
        blk.scale = (0.95, 2.55, 0.18 + random.uniform(-0.02, 0.02))
        blk.rotation_euler = (0, 0, ang)
        add_bevel(blk, width=0.04, segments=2)
        assign_material(blk, mat_dark_stone if i % 2 == 0 else mat_sandstone)

    # 4. 古代レリーフ紋章リング (二重の黄金リング＆クロスライン)
    for r_idx, r_val in enumerate([arena_r * 0.82, arena_r * 0.42, 1.4]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=r_val,
            minor_radius=0.08 if r_idx < 2 else 0.06,
            major_segments=48,
            minor_segments=12,
            location=(0, 0, 0.01)
        )
        ring = bpy.context.active_object
        ring.name = f"AncientReliefRing_{r_idx}"
        ring.scale.z = 0.25
        assign_material(ring, mat_ancient_gold)

    # 5. フルーティング（縦溝）入り古代ギリシャ風石柱 (8本、うち2本は崩落)
    pillar_angles = [0, 45, 90, 135, 180, 225, 270, 315]
    for idx, deg in enumerate(pillar_angles):
        rad = math.radians(deg)
        pr = arena_r - 0.65
        px = math.cos(rad) * pr
        py = math.sin(rad) * pr

        is_broken = idx in (1, 5)
        p_height = 2.6 if is_broken else 5.6

        # 台座 (Pedestal)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, 0.35))
        ped = bpy.context.active_object
        ped.name = f"PillarPedestal_{idx}"
        ped.scale = (1.35, 1.35, 0.7)
        ped.rotation_euler = (0, 0, rad)
        add_bevel(ped, width=0.05, segments=2)
        assign_material(ped, mat_dark_stone)

        # フルーティング柱身 (Fluted Shaft)
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.52, depth=p_height, location=(px, py, 0.7 + p_height / 2.0))
        shaft = bpy.context.active_object
        shaft.name = f"PillarShaft_{idx}"
        # 1つおきの頂点を内側にへこませて縦溝を作る
        bm = bmesh.new()
        bm.from_mesh(shaft.data)
        for v in bm.verts:
            ang_v = math.atan2(v.co.y, v.co.x)
            flute = math.cos(ang_v * 16.0) * 0.035
            v.co.x += math.cos(ang_v) * flute
            v.co.y += math.sin(ang_v) * flute
            if is_broken and v.co.z > 0:
                # 破断面のギザギザ
                v.co.z += math.sin(ang_v * 3.0) * 0.25
        bm.to_mesh(shaft.data)
        bm.free()
        assign_material(shaft, mat_sandstone)

        if not is_broken:
            # 柱頭 (Capital)
            cap_z = 0.7 + p_height + 0.2
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, cap_z))
            cap = bpy.context.active_object
            cap.name = f"PillarCapital_{idx}"
            cap.scale = (1.45, 1.45, 0.42)
            cap.rotation_euler = (0, 0, rad)
            add_bevel(cap, width=0.06, segments=2)
            assign_material(cap, mat_dark_stone)
        else:
            # 床に転がる折れた柱の瓦礫
            dx = px * 0.86
            dy = py * 0.86
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.48, depth=1.8, location=(dx, dy, 0.42))
            debris = bpy.context.active_object
            debris.name = f"FallenPillarDebris_{idx}"
            debris.rotation_euler = (math.radians(82), math.radians(15), rad + 0.5)
            assign_material(debris, mat_sandstone)

    # 6. 北側（奥）の巨大遺跡アーチ梁 (Entablature Beam connecting top pillars)
    rad_a = math.radians(255)
    rad_b = math.radians(285)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -(arena_r - 0.65), 6.8))
    arch_beam = bpy.context.active_object
    arch_beam.name = "AncientArchBeam"
    arch_beam.scale = (8.8, 1.3, 0.85)
    add_bevel(arch_beam, width=0.08, segments=2)
    assign_material(arch_beam, mat_dark_stone)

    # 7. 4基の青銅＆石造り篝火台 (Brazier Torches)
    torch_angles = [30, 150, 210, 330]
    for tidx, deg in enumerate(torch_angles):
        rad = math.radians(deg)
        tr = arena_r * 0.75
        tx = math.cos(rad) * tr
        ty = math.sin(rad) * tr

        # 石の台座柱
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.45, radius2=0.28, depth=1.5, location=(tx, ty, 0.75))
        stand = bpy.context.active_object
        stand.name = f"TorchStand_{tidx}"
        add_bevel(stand, width=0.02, segments=1)
        assign_material(stand, mat_dark_stone)

        # 黒鉄の火鉢ボウル
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.22, radius2=0.52, depth=0.45, location=(tx, ty, 1.65))
        bowl = bpy.context.active_object
        bowl.name = f"TorchBowl_{tidx}"
        assign_material(bowl, mat_iron)

        # 燃え盛る炭火・炎コア
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.32, location=(tx, ty, 1.95))
        ember = bpy.context.active_object
        ember.name = f"TorchEmber_{tidx}"
        ember.scale = (1.0, 1.0, 1.35)
        assign_material(ember, mat_ember)

    export_model("colosseum_arena")


# ==============================================================================
# 2. スタイリッシュ・アーマーファイター素体 (fighter_cyber_knight)
# ==============================================================================
def build_fighter_model():
    clear_scene()

    mat_armor_main = make_material("ArmorMain", (0.12, 0.55, 0.85), metallic=0.75, roughness=0.25)
    mat_armor_dark = make_material("ArmorDark", (0.14, 0.16, 0.22), metallic=0.6, roughness=0.4)
    mat_visor_glow = make_material("VisorGlow", (0.0, 0.95, 1.0), metallic=0.1, roughness=0.1, emission_color=(0.0, 0.9, 1.0), emission_strength=5.0)
    mat_gold_trim = make_material("GoldTrim", (0.95, 0.75, 0.2), metallic=0.9, roughness=0.2)

    # ルートEmpty
    root = bpy.data.objects.new("FighterRoot", None)
    bpy.context.collection.objects.link(root)

    # 1. 胸部・胴体 (Torso)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.05))
    torso = bpy.context.active_object
    torso.name = "Torso"
    torso.scale = (0.46, 0.28, 0.56)
    add_bevel(torso, width=0.06, segments=3)
    assign_material(torso, mat_armor_main)
    torso.parent = root

    # 胸のリアクターコア
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.09, location=(0, -0.15, 1.12))
    core = bpy.context.active_object
    core.name = "ChestCore"
    assign_material(core, mat_visor_glow)
    core.parent = torso

    # 2. 頭部ヘルメット (Head)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.19, location=(0, 0, 1.52))
    head = bpy.context.active_object
    head.name = "Head"
    head.scale = (0.92, 1.05, 1.05)
    assign_material(head, mat_armor_dark)
    head.parent = root

    # V字バイザー
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.16, 1.53))
    visor = bpy.context.active_object
    visor.name = "HeadVisor"
    visor.scale = (0.28, 0.08, 0.07)
    add_bevel(visor, width=0.015, segments=2)
    assign_material(visor, mat_visor_glow)
    visor.parent = head

    # 頭頂部クレスト（トサカ型ブレード）
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.02, 1.68))
    crest = bpy.context.active_object
    crest.name = "HeadCrest"
    crest.scale = (0.04, 0.26, 0.14)
    add_bevel(crest, width=0.01, segments=2)
    assign_material(crest, mat_gold_trim)
    crest.parent = head

    # 3. 両腕 (LeftArm / RightArm) - ピボットを肩に配置
    for side, sx in [("LeftArm", 0.34), ("RightArm", -0.34)]:
        arm_pivot = bpy.data.objects.new(side, None)
        arm_pivot.location = (sx, 0, 1.26)
        bpy.context.collection.objects.link(arm_pivot)
        arm_pivot.parent = root

        # 肩アーマー (Pauldron)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx * 1.05, 0, 1.28))
        pauldron = bpy.context.active_object
        pauldron.name = f"{side}_Pauldron"
        pauldron.scale = (0.22, 0.24, 0.18)
        add_bevel(pauldron, width=0.04, segments=2)
        assign_material(pauldron, mat_gold_trim)
        pauldron.parent = arm_pivot
        pauldron.matrix_parent_inverse = arm_pivot.matrix_world.inverted()

        # 腕本体
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.075, depth=0.48, location=(sx * 1.05, 0, 1.02))
        limb = bpy.context.active_object
        limb.name = f"{side}_Mesh"
        add_bevel(limb, width=0.02, segments=2)
        assign_material(limb, mat_armor_main)
        limb.parent = arm_pivot
        limb.matrix_parent_inverse = arm_pivot.matrix_world.inverted()

    # 4. 両脚 (LeftLeg / RightLeg) - ピボットを股関節に配置
    for side, lx in [("LeftLeg", 0.15), ("RightLeg", -0.15)]:
        leg_pivot = bpy.data.objects.new(side, None)
        leg_pivot.location = (lx, 0, 0.72)
        bpy.context.collection.objects.link(leg_pivot)
        leg_pivot.parent = root

        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.09, depth=0.68, location=(lx, 0, 0.36))
        leg_mesh = bpy.context.active_object
        leg_mesh.name = f"{side}_Mesh"
        add_bevel(leg_mesh, width=0.02, segments=2)
        assign_material(leg_mesh, mat_armor_dark)
        leg_mesh.parent = leg_pivot
        leg_mesh.matrix_parent_inverse = leg_pivot.matrix_world.inverted()

        # ニーガード
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(lx, -0.08, 0.42))
        knee = bpy.context.active_object
        knee.name = f"{side}_Knee"
        knee.scale = (0.12, 0.08, 0.14)
        add_bevel(knee, width=0.02, segments=2)
        assign_material(knee, mat_gold_trim)
        knee.parent = leg_pivot
        knee.matrix_parent_inverse = leg_pivot.matrix_world.inverted()

    export_model("fighter_cyber_knight")


# ==============================================================================
# 3. 4タイプの専用武器モデル群 (Greatsword, SniperRifle, Gauntlet, PsyOrb)
# ==============================================================================
def build_weapons():
    # --- A. 重戦士の大剣 (weapon_greatsword) ---
    clear_scene()
    mat_blade = make_material("BladeSteel", (0.82, 0.85, 0.9), metallic=0.95, roughness=0.15)
    mat_crimson_glow = make_material("CrimsonCore", (1.0, 0.1, 0.2), metallic=0.2, roughness=0.1, emission_color=(1.0, 0.15, 0.2), emission_strength=6.0)
    mat_hilt = make_material("HiltGold", (0.85, 0.65, 0.15), metallic=0.9, roughness=0.25)
    mat_grip = make_material("GripDark", (0.15, 0.12, 0.12), metallic=0.2, roughness=0.8)

    # 刀身
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.65))
    blade = bpy.context.active_object
    blade.name = "SwordBlade"
    blade.scale = (0.18, 0.035, 1.15)
    add_bevel(blade, width=0.015, segments=2)
    assign_material(blade, mat_blade)

    # 刀身の中央発光ライン
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.6))
    core_line = bpy.context.active_object
    core_line.name = "BladeCore"
    core_line.scale = (0.05, 0.042, 0.95)
    assign_material(core_line, mat_crimson_glow)

    # 鍔 (Crossguard)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.05))
    guard = bpy.context.active_object
    guard.name = "CrossGuard"
    guard.scale = (0.42, 0.09, 0.09)
    add_bevel(guard, width=0.02, segments=2)
    assign_material(guard, mat_hilt)

    # グリップ
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.032, depth=0.32, location=(0, 0, -0.15))
    grip = bpy.context.active_object
    grip.name = "SwordGrip"
    assign_material(grip, mat_grip)

    export_model("weapon_greatsword")

    # --- B. スナイパーのライフル (weapon_sniper_rifle) ---
    clear_scene()
    mat_gunmetal = make_material("GunMetal", (0.18, 0.20, 0.25), metallic=0.88, roughness=0.28)
    mat_cyan_glow = make_material("CyanPlasma", (0.0, 0.9, 1.0), metallic=0.1, roughness=0.1, emission_color=(0.0, 0.85, 1.0), emission_strength=6.0)

    # メインレシーバー
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    body = bpy.context.active_object
    body.name = "RifleBody"
    body.scale = (0.08, 0.45, 0.14)
    add_bevel(body, width=0.015, segments=2)
    assign_material(body, mat_gunmetal)

    # ロングバレル
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.025, depth=0.95, location=(0, -0.65, 0.02), rotation=(math.pi / 2, 0, 0))
    barrel = bpy.context.active_object
    barrel.name = "RifleBarrel"
    assign_material(barrel, mat_gunmetal)

    # エネルギーレール発光部
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.45, 0.02))
    rail = bpy.context.active_object
    rail.name = "EnergyRail"
    rail.scale = (0.09, 0.55, 0.03)
    assign_material(rail, mat_cyan_glow)

    # スコープ
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.035, depth=0.28, location=(0, -0.05, 0.13), rotation=(math.pi / 2, 0, 0))
    scope = bpy.context.active_object
    scope.name = "RifleScope"
    assign_material(scope, mat_gunmetal)

    export_model("weapon_sniper_rifle")

    # --- C. サイキッカーの念動オーブ (weapon_psy_orb) ---
    clear_scene()
    mat_psy_core = make_material("PsyCrystal", (0.7, 0.2, 1.0), metallic=0.1, roughness=0.1, emission_color=(0.65, 0.15, 1.0), emission_strength=7.0)
    mat_ring_gold = make_material("RingGold", (0.95, 0.78, 0.2), metallic=0.92, roughness=0.2)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.14, location=(0, 0, 0))
    orb_core = bpy.context.active_object
    orb_core.name = "PsyCore"
    assign_material(orb_core, mat_psy_core)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.22, minor_radius=0.02, major_segments=24, minor_segments=8, rotation=(math.radians(35), 0, 0))
    ring_a = bpy.context.active_object
    ring_a.name = "GyroRingA"
    assign_material(ring_a, mat_ring_gold)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.26, minor_radius=0.018, major_segments=24, minor_segments=8, rotation=(0, math.radians(55), 0))
    ring_b = bpy.context.active_object
    ring_b.name = "GyroRingB"
    assign_material(ring_b, mat_ring_gold)

    export_model("weapon_psy_orb")


if __name__ == "__main__":
    build_colosseum_arena()
    build_fighter_model()
    build_weapons()
    print("[BlenderGen] ALL ASSETS GENERATED SUCCESSFULLY!")
    bpy.ops.wm.quit_blender()
