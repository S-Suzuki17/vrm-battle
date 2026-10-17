import bpy
import bmesh
import math
import struct
import json
import os

CUSTOM_DIR = r"C:\Users\souta\vrm-battle\custom_characters"
os.makedirs(CUSTOM_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, base_color, metallic=0.0, roughness=0.4, emission_color=None, emission_strength=0.0):
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


def add_bevel(obj, width=0.02, segments=2):
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def parent_keep_transform(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def create_vrm_humanoid_rig():
    """
    VRM 1.0 (VRMC_vrm) 必須・標準ヒューマノイドボーン階層をEmptyノードで構築し、
    GLBエクスポート後にVRMC_vrmのhumanBonesに100%マッピングされる構造を返します。
    """
    bones = {}
    bone_Specs = [
        ("hips", None, (0, 0, 0.78)),
        ("spine", "hips", (0, 0, 0.92)),
        ("chest", "spine", (0, 0, 1.12)),
        ("neck", "chest", (0, 0, 1.38)),
        ("head", "neck", (0, 0, 1.48)),
        ("leftUpperArm", "chest", (0.28, 0, 1.28)),
        ("leftLowerArm", "leftUpperArm", (0.34, 0, 1.02)),
        ("leftHand", "leftLowerArm", (0.36, 0, 0.78)),
        ("rightUpperArm", "chest", (-0.28, 0, 1.28)),
        ("rightLowerArm", "rightUpperArm", (-0.34, 0, 1.02)),
        ("rightHand", "rightLowerArm", (-0.36, 0, 0.78)),
        ("leftUpperLeg", "hips", (0.15, 0, 0.74)),
        ("leftLowerLeg", "leftUpperLeg", (0.15, 0, 0.40)),
        ("leftFoot", "leftLowerLeg", (0.15, -0.05, 0.08)),
        ("rightUpperLeg", "hips", (-0.15, 0, 0.74)),
        ("rightLowerLeg", "rightUpperLeg", (-0.15, 0, 0.40)),
        ("rightFoot", "rightLowerLeg", (-0.15, -0.05, 0.08)),
    ]

    for name, parent_name, loc in bone_Specs:
        node = bpy.data.objects.new(name, None)
        node.location = loc
        bpy.context.collection.objects.link(node)
        if parent_name and parent_name in bones:
            parent_keep_transform(node, bones[parent_name])
        bones[name] = node

    # Three.js / Unity でも名前で直接引けるエイリアスリンク
    bones["Torso"] = bones["chest"]
    bones["Head"] = bones["head"]
    bones["LeftArm"] = bones["leftUpperArm"]
    bones["RightArm"] = bones["rightUpperArm"]
    bones["LeftLeg"] = bones["leftUpperLeg"]
    bones["RightLeg"] = bones["rightUpperLeg"]

    return bones


def convert_glb_to_vrm1(glb_path, vrm_path, char_title, char_author, skill_name):
    """
    GLBファイルのJSONチャンクに VRMC_vrm (VRM 1.0) 拡張とメタデータ、
    およびヒューマノイドボーンのノードインデックス対応表を注入し、本物の .vrm ファイルを生成します。
    """
    with open(glb_path, "rb") as f:
        data = f.read()

    magic, version, total_len = struct.unpack("<III", data[:12])
    json_len, json_type = struct.unpack("<II", data[12:20])
    json_bytes = data[20:20 + json_len]
    rest_bin_chunk = data[20 + json_len:]

    gltf = json.loads(json_bytes.decode("utf-8"))

    # ノード名からインデックスを検索
    human_bone_names = [
        "hips", "spine", "chest", "neck", "head",
        "leftUpperArm", "leftLowerArm", "leftHand",
        "rightUpperArm", "rightLowerArm", "rightHand",
        "leftUpperLeg", "leftLowerLeg", "leftFoot",
        "rightUpperLeg", "rightLowerLeg", "rightFoot"
    ]
    human_bones_map = {}
    for idx, node in enumerate(gltf.get("nodes", [])):
        n_name = node.get("name", "")
        if n_name in human_bone_names:
            human_bones_map[n_name] = {"node": idx}

    if "extensionsUsed" not in gltf:
        gltf["extensionsUsed"] = []
    if "VRMC_vrm" not in gltf["extensionsUsed"]:
        gltf["extensionsUsed"].append("VRMC_vrm")

    if "extensions" not in gltf:
        gltf["extensions"] = {}

    gltf["extensions"]["VRMC_vrm"] = {
        "specVersion": "1.0",
        "meta": {
            "name": char_title,
            "title": char_title,
            "version": "1.0",
            "authors": [char_author],
            "copyrightInformation": f"Custom Character ({skill_name})",
            "licenseUrl": "https://vrm.dev/licenses/1.0/",
            "avatarPermission": "everyone",
            "allowExcessivelyViolentUsage": False,
            "allowExcessivelySexualUsage": False,
            "commercialUsage": "personalNonProfit",
            "allowPoliticalOrReligiousUsage": False,
            "allowAntisocialOrHateUsage": False,
            "creditNotation": "optional",
            "allowRedistribution": True,
            "modification": "allowModification"
        },
        "humanoid": {
            "humanBones": human_bones_map
        }
    }

    new_json_bytes = json.dumps(gltf, ensure_ascii=False).encode("utf-8")
    pad = (4 - (len(new_json_bytes) % 4)) % 4
    new_json_bytes += b" " * pad

    new_total_len = 12 + 8 + len(new_json_bytes) + len(rest_bin_chunk)
    with open(vrm_path, "wb") as out:
        out.write(struct.pack("<III", magic, version, new_total_len))
        out.write(struct.pack("<II", len(new_json_bytes), json_type))
        out.write(new_json_bytes)
        out.write(rest_bin_chunk)

    print(f"[VRM1Builder] Generated valid VRM 1.0: {vrm_path} ({len(human_bones_map)} humanoid bones mapped)")


def generate_png_texture(filename, bg_rgb, accent_rgb, stripe_rgb):
    """
    Unity 6 の UserCharacterLoader.cs や Web版の画像ドロップで使える
    カスタムキャラクター用テクスチャ (.png) を生成します。
    """
    w, h = 256, 256
    img = bpy.data.images.new(name=filename, width=w, height=h, alpha=True)
    pixels = [0.0] * (w * h * 4)

    for y in range(h):
        for x in range(w):
            idx = (y * w + x) * 4
            cx, cy = (x - w / 2.0) / (w / 2.0), (y - h / 2.0) / (h / 2.0)
            dist = math.hypot(cx, cy)

            # 幾何学的なエンブレム模様を描画
            if abs(dist - 0.65) < 0.06 or abs(cx) < 0.08 or abs(cy) < 0.08:
                r, g, b = accent_rgb
            elif (x + y) % 32 < 8:
                r, g, b = stripe_rgb
            else:
                r, g, b = bg_rgb

            pixels[idx] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b
            pixels[idx + 3] = 1.0

    img.pixels = pixels
    png_path = os.path.join(CUSTOM_DIR, filename)
    img.filepath_raw = png_path
    img.file_format = 'PNG'
    img.save()
    print(f"[TextureGen] Saved PNG texture: {png_path}")


def export_character_package(base_name, char_title, char_author, skill_name):
    glb_path = os.path.join(CUSTOM_DIR, f"{base_name}.glb")
    fbx_path = os.path.join(CUSTOM_DIR, f"{base_name}.fbx")
    vrm_path = os.path.join(CUSTOM_DIR, f"{base_name}.vrm")

    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True)
    bpy.ops.export_scene.fbx(filepath=fbx_path, use_selection=False, apply_scale_options='FBX_SCALE_ALL')
    convert_glb_to_vrm1(glb_path, vrm_path, char_title, char_author, skill_name)


# ==============================================================================
# キャラ①：蒼穹の戦乙女 セラフ (valkyrie_seraph)
# ==============================================================================
def build_valkyrie_seraph():
    clear_scene()
    bones = create_vrm_humanoid_rig()

    mat_silver = make_material("ValkyrieSilver", (0.90, 0.94, 1.0), metallic=0.82, roughness=0.18)
    mat_royal_blue = make_material("RoyalBlue", (0.10, 0.32, 0.85), metallic=0.55, roughness=0.28)
    mat_gold = make_material("CelestialGold", (0.98, 0.80, 0.22), metallic=0.92, roughness=0.18)
    mat_wing_glow = make_material("SeraphWingGlow", (0.15, 0.92, 1.0), metallic=0.1, roughness=0.1, emission_color=(0.15, 0.88, 1.0), emission_strength=6.5)

    # 胴体 (聖騎士アーマー)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.19, radius2=0.26, depth=0.52, location=(0, 0, 1.08))
    torso = bpy.context.active_object
    add_bevel(torso, 0.02, 2)
    assign_material(torso, mat_silver)
    parent_keep_transform(torso, bones["chest"])

    # 胸の蒼い聖晶石コア
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.08, location=(0, -0.21, 1.15))
    core = bpy.context.active_object
    assign_material(core, mat_wing_glow)
    parent_keep_transform(core, bones["chest"])

    # バトルスカート (タセット)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.34, radius2=0.19, depth=0.34, location=(0, 0, 0.74))
    skirt = bpy.context.active_object
    assign_material(skirt, mat_royal_blue)
    parent_keep_transform(skirt, bones["hips"])

    # 背中の6枚の光翼 (Seraph Energy Wings)
    for side in (-1, 1):
        for w_idx, (ang_y, length, z_off) in enumerate([(0.35, 0.85, 1.28), (0.05, 0.72, 1.15), (-0.25, 0.55, 1.02)]):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.48, 0.18, z_off))
            wing = bpy.context.active_object
            wing.scale = (length, 0.025, 0.11)
            wing.rotation_euler = (0.15, side * ang_y, side * 0.25)
            add_bevel(wing, 0.01, 1)
            assign_material(wing, mat_wing_glow)
            parent_keep_transform(wing, bones["chest"])

    # 頭部 & 戦乙女の羽根ティアラ & ツインテールリボン
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.18, location=(0, 0, 1.54))
    head = bpy.context.active_object
    assign_material(head, mat_silver)
    parent_keep_transform(head, bones["head"])

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.15, 1.54))
    visor = bpy.context.active_object
    visor.scale = (0.26, 0.06, 0.06)
    assign_material(visor, mat_wing_glow)
    parent_keep_transform(visor, bones["head"])

    for side in (-1, 1):
        # 頭部の羽根冠
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.22, -0.02, 1.66))
        tiara_wing = bpy.context.active_object
        tiara_wing.scale = (0.03, 0.22, 0.14)
        tiara_wing.rotation_euler = (0.3, side * 0.35, 0)
        assign_material(tiara_wing, mat_gold)
        parent_keep_transform(tiara_wing, bones["head"])

    # 両腕 & 聖槍 (Valkyrie Lance)
    for side_name, sx in [("leftUpperArm", 0.30), ("rightUpperArm", -0.30)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.065, depth=0.46, location=(sx, 0, 1.04))
        arm = bpy.context.active_object
        assign_material(arm, mat_silver)
        parent_keep_transform(arm, bones[side_name])

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.13, location=(sx * 1.05, 0, 1.28))
        shld = bpy.context.active_object
        assign_material(shld, mat_gold)
        parent_keep_transform(shld, bones[side_name])

    # 右手の聖槍 (Valkyrie Glowing Lance)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.11, radius2=0.01, depth=1.45, location=(-0.34, -0.45, 1.0), rotation=(-math.pi / 2, 0, 0))
    lance = bpy.context.active_object
    assign_material(lance, mat_wing_glow)
    parent_keep_transform(lance, bones["rightUpperArm"])

    # 両脚
    for side_name, lx in [("leftUpperLeg", 0.15), ("rightUpperLeg", -0.15)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.08, depth=0.68, location=(lx, 0, 0.38))
        leg = bpy.context.active_object
        assign_material(leg, mat_royal_blue)
        parent_keep_transform(leg, bones[side_name])

    export_character_package("valkyrie_seraph", "蒼穹の戦乙女 セラフ", "Souta Custom Studio", "🌟 聖裁・セラフィック・ノヴァ 🌟")
    generate_png_texture("valkyrie_seraph_skin.png", (0.88, 0.94, 1.0), (0.1, 0.85, 1.0), (0.95, 0.78, 0.2))


# ==============================================================================
# キャラ②：紅蓮の剣豪 クロガネ (crimson_samurai_kuro)
# ==============================================================================
def build_crimson_samurai():
    clear_scene()
    bones = create_vrm_humanoid_rig()

    mat_onyx = make_material("SamuraiOnyx", (0.08, 0.08, 0.11), metallic=0.78, roughness=0.25)
    mat_crimson = make_material("SamuraiCrimson", (0.78, 0.08, 0.12), metallic=0.6, roughness=0.3)
    mat_gold = make_material("SamuraiGold", (0.95, 0.72, 0.15), metallic=0.92, roughness=0.2)
    mat_red_glow = make_material("KatanaRedGlow", (1.0, 0.08, 0.18), metallic=0.2, roughness=0.1, emission_color=(1.0, 0.1, 0.18), emission_strength=7.5)

    # 胴丸鎧 (Do-Maru)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.06))
    torso = bpy.context.active_object
    torso.scale = (0.48, 0.30, 0.54)
    add_bevel(torso, 0.04, 2)
    assign_material(torso, mat_onyx)
    parent_keep_transform(torso, bones["chest"])

    # 胸の紅蓮襷ライン
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.16, 1.08))
    sash = bpy.context.active_object
    sash.scale = (0.42, 0.04, 0.42)
    sash.rotation_euler = (0, 0.65, 0)
    assign_material(sash, mat_red_glow)
    parent_keep_transform(sash, bones["chest"])

    # 草摺 (腰鎧プレート)
    for ang_deg in [0, 90, 180, 270]:
        rad = math.radians(ang_deg)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(math.cos(rad) * 0.24, math.sin(rad) * 0.18, 0.72))
        plate = bpy.context.active_object
        plate.scale = (0.22, 0.22, 0.26)
        assign_material(plate, mat_crimson)
        parent_keep_transform(plate, bones["hips"])

    # 兜 (Kabuto) & 黄金の三日月クワガタ前立て
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.20, location=(0, 0, 1.54))
    head = bpy.context.active_object
    assign_material(head, mat_onyx)
    parent_keep_transform(head, bones["head"])

    # 兜の吹き返し・シコロ
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.28, radius2=0.18, depth=0.22, location=(0, 0.03, 1.48))
    shikoro = bpy.context.active_object
    assign_material(shikoro, mat_crimson)
    parent_keep_transform(shikoro, bones["head"])

    # 黄金クワガタ角 (三日月)
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.16, -0.16, 1.72))
        horn = bpy.context.active_object
        horn.scale = (0.28, 0.03, 0.08)
        horn.rotation_euler = (0, -side * 0.65, 0)
        add_bevel(horn, 0.01, 1)
        assign_material(horn, mat_gold)
        parent_keep_transform(horn, bones["head"])

    # 紅い眼光バイザー
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.18, 1.53))
    visor = bpy.context.active_object
    visor.scale = (0.26, 0.05, 0.05)
    assign_material(visor, mat_red_glow)
    parent_keep_transform(visor, bones["head"])

    # 両腕 & 大袖装甲 & 妖刀「紅蓮丸」
    for side_name, sx in [("leftUpperArm", 0.34), ("rightUpperArm", -0.34)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx * 1.12, 0, 1.25))
        osode = bpy.context.active_object
        osode.scale = (0.14, 0.28, 0.32)
        add_bevel(osode, 0.02, 1)
        assign_material(osode, mat_crimson)
        parent_keep_transform(osode, bones[side_name])

        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.075, depth=0.48, location=(sx, 0, 1.02))
        arm = bpy.context.active_object
        assign_material(arm, mat_onyx)
        parent_keep_transform(arm, bones[side_name])

    # 右手の妖刀「紅蓮丸」
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.35, -0.55, 0.98))
    katana = bpy.context.active_object
    katana.scale = (0.03, 1.25, 0.07)
    assign_material(katana, mat_red_glow)
    parent_keep_transform(katana, bones["rightUpperArm"])

    # 両脚
    for side_name, lx in [("leftUpperLeg", 0.16), ("rightUpperLeg", -0.16)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.09, depth=0.68, location=(lx, 0, 0.38))
        leg = bpy.context.active_object
        assign_material(leg, mat_onyx)
        parent_keep_transform(leg, bones[side_name])

    export_character_package("crimson_samurai_kuro", "紅蓮の剣豪 クロガネ", "Souta Custom Studio", "⚡ 秘剣・紅蓮一閃 ⚡")
    generate_png_texture("crimson_samurai_kuro_skin.png", (0.08, 0.08, 0.1), (1.0, 0.1, 0.18), (0.95, 0.72, 0.15))


# ==============================================================================
# キャラ③：黄金の覇王 レオ (golden_brawler_leo)
# ==============================================================================
def build_golden_brawler():
    clear_scene()
    bones = create_vrm_humanoid_rig()

    mat_gold_armor = make_material("BrawlerGold", (0.98, 0.75, 0.12), metallic=0.88, roughness=0.22)
    mat_cape_red = make_material("RoyalCapeRed", (0.85, 0.12, 0.15), metallic=0.15, roughness=0.65)
    mat_dark_bronze = make_material("DarkBronze", (0.28, 0.20, 0.12), metallic=0.7, roughness=0.35)
    mat_solar_glow = make_material("SolarHakiGlow", (1.0, 0.65, 0.05), metallic=0.1, roughness=0.1, emission_color=(1.0, 0.6, 0.05), emission_strength=7.0)

    # マッシブな胸部
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.08))
    torso = bpy.context.active_object
    torso.scale = (0.54, 0.34, 0.56)
    add_bevel(torso, 0.06, 2)
    assign_material(torso, mat_gold_armor)
    parent_keep_transform(torso, bones["chest"])

    # 背中の覇王マント (Royal Cape)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.22, 0.85))
    cape = bpy.context.active_object
    cape.scale = (0.68, 0.04, 0.95)
    cape.rotation_euler = (0.18, 0, 0)
    add_bevel(cape, 0.02, 1)
    assign_material(cape, mat_cape_red)
    parent_keep_transform(cape, bones["chest"])

    # 頭部 & ライオンたてがみ & 王冠クラウン
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.20, location=(0, 0, 1.55))
    head = bpy.context.active_object
    assign_material(head, mat_dark_bronze)
    parent_keep_transform(head, bones["head"])

    # 黄金の王冠
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.17, depth=0.16, location=(0, 0, 1.72))
    crown = bpy.context.active_object
    assign_material(crown, mat_solar_glow)
    parent_keep_transform(crown, bones["head"])

    # 太陽眼光バイザー
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.18, 1.55))
    visor = bpy.context.active_object
    visor.scale = (0.28, 0.06, 0.06)
    assign_material(visor, mat_solar_glow)
    parent_keep_transform(visor, bones["head"])

    # 両腕 & 超巨大「獅子王の覇気ガントレット」
    for side_name, sx in [("leftUpperArm", 0.38), ("rightUpperArm", -0.38)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.095, depth=0.45, location=(sx, 0, 1.08))
        arm = bpy.context.active_object
        assign_material(arm, mat_dark_bronze)
        parent_keep_transform(arm, bones[side_name])

        # 巨大ガントレット拳
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.22, location=(sx * 1.05, -0.12, 0.84))
        fist = bpy.context.active_object
        fist.scale = (0.95, 1.25, 0.95)
        assign_material(fist, mat_solar_glow)
        parent_keep_transform(fist, bones[side_name])

    # 両脚
    for side_name, lx in [("leftUpperLeg", 0.17), ("rightUpperLeg", -0.17)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.105, depth=0.68, location=(lx, 0, 0.38))
        leg = bpy.context.active_object
        assign_material(leg, mat_gold_armor)
        parent_keep_transform(leg, bones[side_name])

    export_character_package("golden_brawler_leo", "黄金の覇王 レオ", "Souta Custom Studio", "🔥 覇王・獅子奮迅撃 🔥")
    generate_png_texture("golden_brawler_leo_skin.png", (0.95, 0.72, 0.1), (1.0, 0.45, 0.05), (0.85, 0.12, 0.15))


if __name__ == "__main__":
    build_valkyrie_seraph()
    build_crimson_samurai()
    build_golden_brawler()
    print("[CustomCharGen] ALL 3 CUSTOM UPLOADABLE CHARACTERS GENERATED SUCCESSFULLY!")
    bpy.ops.wm.quit_blender()
