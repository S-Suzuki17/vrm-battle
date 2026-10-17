import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ========================================================
// 1. CPUボス 5大バリエーション ＆ 非同期ゴーストプール定義
// ========================================================
const ARCHETYPE_INFO = {
    speed_assassin: {
        id: "speed_assassin",
        label: "⚡ スピード連撃型",
        beats: "one_shot_buster",
        color: "#00f2fe"
    },
    one_shot_buster: {
        id: "one_shot_buster",
        label: "💥 一撃必殺・広範囲型",
        beats: "iron_counter",
        color: "#ff6b6b"
    },
    iron_counter: {
        id: "iron_counter",
        label: "🛡️ 鉄壁ガード・カウンター型",
        beats: "speed_assassin",
        color: "#ffd32a"
    }
};

const CPU_BOSS_TYPES = [
    {
        id: "oni_berserker",
        name: "赤鬼オーガ・ゴウラ",
        ghostOwner: "@Goura_Destroyer",
        style: "💥 一撃必殺・重撃ハンマー型",
        archetype: "one_shot_buster",
        category: "melee-weapon",
        skinColor: 0xb33939,
        armorColor: 0x7d1111,
        accentColor: 0xffdd59,
        scale: 1.28,
        poiseMax: 110,
        presetSliders: { atk: 36, range: 34, stun: 18, atkspd: 6, spd: 6 },
        presetGambits: [
            { cond: "sp_50", act: "ult_ex" },
            { cond: "dist_near", act: "atk_launch" },
            { cond: "always", act: "atk_wide" }
        ]
    },
    {
        id: "spiked_behemoth",
        name: "棘獣ベヒーモス・ガルム",
        ghostOwner: "@Garm_Speedster",
        style: "⚡ スピード剛腕ラッシュ型",
        archetype: "speed_assassin",
        category: "melee-bare",
        skinColor: 0x8c6239,
        armorColor: 0x4a3525,
        accentColor: 0xff9f1a,
        scale: 1.35,
        poiseMax: 125,
        presetSliders: { atk: 16, range: 14, stun: 26, atkspd: 26, spd: 18 },
        presetGambits: [
            { cond: "enemy_stun", act: "skill_arts" },
            { cond: "dist_near", act: "atk_rush" },
            { cond: "always", act: "approach" }
        ]
    },
    {
        id: "stone_golem",
        name: "古代機兵ゴーレム",
        ghostOwner: "@Aegis_Golem99",
        style: "🛡️ 鉄壁ガード・岩石砲型",
        archetype: "iron_counter",
        category: "snipe-bare",
        skinColor: 0x957d65,
        armorColor: 0x5c4d3c,
        accentColor: 0x00f2fe,
        scale: 1.38,
        poiseMax: 140,
        presetSliders: { atk: 24, range: 28, stun: 32, atkspd: 8, spd: 8 },
        presetGambits: [
            { cond: "enemy_attack", act: "guard_counter" },
            { cond: "sp_20", act: "skill_arts" },
            { cond: "always", act: "atk_wide" }
        ]
    },
    {
        id: "paladin_knight",
        name: "聖堂重装騎士・ガウェイン",
        ghostOwner: "@Gawain_HolyOrder",
        style: "🛡️ 鉄壁ガード＆聖大剣型",
        archetype: "iron_counter",
        category: "melee-weapon",
        skinColor: 0xdcdde1,
        armorColor: 0x718093,
        accentColor: 0xfbc531,
        scale: 1.22,
        poiseMax: 115,
        presetSliders: { atk: 22, range: 24, stun: 28, atkspd: 14, spd: 12 },
        presetGambits: [
            { cond: "enemy_attack", act: "guard_counter" },
            { cond: "sp_50", act: "ult_ex" },
            { cond: "always", act: "atk_launch" }
        ]
    },
    {
        id: "lizard_dragonkin",
        name: "竜鱗リザード・ドラコ",
        ghostOwner: "@Draco_Blitz",
        style: "⚡ 高速爪牙＆火球アサシン型",
        archetype: "speed_assassin",
        category: "snipe-weapon",
        skinColor: 0x4cd137,
        armorColor: 0x218c74,
        accentColor: 0xff5e57,
        scale: 1.18,
        poiseMax: 95,
        presetSliders: { atk: 14, range: 16, stun: 20, atkspd: 28, spd: 22 },
        presetGambits: [
            { cond: "sp_50", act: "ult_ex" },
            { cond: "enemy_guard", act: "atk_launch" },
            { cond: "always", act: "atk_rush" }
        ]
    }
];

// URLパラメータ (?ghost=...) からのSNS挑戦状ゴーストデータ
let challengedGhostData = null;

// Blender 5.2 Cycles プリレンダリング画像キャッシュ（証明書カード＆テクスチャ用）
const cyclesImages = {
    showcase: null,
    heroPortrait: null,
    oniPortrait: null
};

// ========================================================
// 2. ゲーム全体ステート ＆ プレイヤー設定（1人1体制限・負けるまでロック）
// ========================================================
let currentWins = 0;
let highScore = Number(localStorage.getItem("battle_high_score") || 0);
let roundTimer = 99;
let roundTimerAccum = 0;
let isGameActive = true;
let isAutoBattle = true;          // 3Dオート対戦（監督・軍師モード）デフォルトON
let isCinematicSpectator = false; // UI非表示・シネマティック観戦モード
let comboHits = 0;
let comboDamage = 0;
let comboResetTimer = null;

// 敗北時アナリティクス計測用
const battleStats = {
    damageDealt: 0,
    damageTaken: 0,
    stunsInflicted: 0,
    maxCombo: 0,
    skillsUsed: 0,
    lastEnemyMove: "豪腕クラッシュ"
};

// Three.js シーン＆ポストプロセス管理
let scene, camera, renderer, composer, bloomPass, clock;
let toonGradientMap = null;
let cyclesEnvMap = null;
let arenaRadius = 10.2;
let effectsList = [];
let projectilesList = [];
let playerAuraParticles = [];
let ambientSparkles = [];
let dustTimer = 0;
let cameraShakeIntensity = 0;
let hitStopTimer = 0;
let isKoSlowMo = false;
let slowMoTimer = 0;
let cinematicCameraMode = null;

// プレイヤー管理オブジェクト（キャラデザ・動き・VFX・AI作戦・パラメータ配分統合）
const player = {
    group: null,
    animPivot: null,
    mesh: null,
    joints: {},
    customJoints: null,
    vrm: null,
    customGlb: null,
    isVrm: false,
    isCustomRig: false,

    // 【負けるまで変更不可ロック (is_active)】
    is_active: false,
    isCustomCharLocked: false,
    registeredCharName: "PLAYER (自作)",
    archetype: "speed_assassin",

    // ① キャラデザイン設定
    design: {
        name: "PLAYER (自作)",
        style: "goggle_hero",      // goggle_hero, ponytail_valkyrie, astral_mage, cyber_brawler, straw_adventurer
        weapon: "rune_greatsword", // rune_greatsword, sword_shield, magic_staff, knuckle_gauntlet, crimson_katana
        hairColor: "#1e90ff",
        outfitColor: "#253b56",
        auraColor: "#00f2fe"
    },

    // ② 動き（モーション型） ＆ ③ 技エフェクト属性
    motionType: "heavy_buster",    // heavy_buster, speed_rush, acrobat_martial, magic_shooter
    vfxElement: "plasma_cyan",     // plasma_cyan, flame_crimson, holy_astral, void_gravity
    skillName: "⚡ 蒼雷・神速烈空閃 ⚡",
    themeColor: 0x00f2fe,

    // ④ 決められた範囲内で配分された各種パラメータ（合計100PT上限）
    sliderPts: { atk: 20, range: 20, stun: 20, atkspd: 20, spd: 20 },
    atkScale: 1.05,       // 攻撃力倍率 [0.85x 〜 1.40x]
    attackRange: 3.4,     // 通常技範囲 [2.4m 〜 4.5m]
    specialRange: 11.5,   // 必殺技範囲 [m]
    stunPower: 1.12,      // ひるませ力・崩し [0.80x 〜 1.50x]
    atkSpeed: 1.08,       // 攻撃速度倍率 [0.85x 〜 1.35x]
    speed: 6.3,           // 移動速度 [5.2 〜 8.0]

    // ⑤ オート対戦用 AI作戦ガンビット (IF条件 + THEN行動 × 3スロット)
    gambits: [
        { cond: "sp_50", act: "ult_ex" },
        { cond: "enemy_stun", act: "skill_arts" },
        { cond: "always", act: "atk_rush" }
    ],
    aiDecisionTimer: 0,

    // バトルリアルタイム状態
    hp: 1000,
    maxHp: 1000,
    sp: 60,
    maxSp: 100,
    position: new THREE.Vector3(-3.8, 0, 0.8),
    airY: 0,
    airVelY: 0,
    rotationY: Math.PI * 0.45,
    velocity: new THREE.Vector3(),
    state: "idle", // idle, move, attack, skill, special, guard, dodge, jump, damaged, down
    attackSubType: "rush",
    stateTimer: 0,
    stateDuration: 0.35,
    comboStep: 0,
    isGuarding: false,
    isInvincible: false,
    guardBarrierMesh: null,
    animTime: 0
};

// CPU管理オブジェクト（ひるみ・体幹ゲージ・打ち上げ・非同期ゴースト対応）
const cpu = {
    group: null,
    animPivot: null,
    mesh: null,
    joints: {},
    bossInfo: CPU_BOSS_TYPES[0],
    archetype: "one_shot_buster",
    themeColor: 0xff4757,
    hp: 1000,
    maxHp: 1000,
    sp: 20,
    maxSp: 100,
    poise: 110,           // 体幹値（0になると大ひるみブレイク）
    maxPoise: 110,
    stunTimer: 0,         // ひるみ（Hit-Stun）残り時間
    position: new THREE.Vector3(3.8, 0, -0.8),
    airY: 0,              // 打ち上げ高度
    airVelY: 0,
    rotationY: -Math.PI * 0.55,
    velocity: new THREE.Vector3(),
    speed: 4.6,
    state: "idle",        // idle, move, attack, special, guard, stunned, launched, down
    stateTimer: 0,
    stateDuration: 0.4,
    comboStep: 0,
    isGuarding: false,
    guardBarrierMesh: null,
    aiTimer: 0,
    aiAction: "idle",
    animTime: 0
};

const input = {
    moveX: 0,
    moveZ: 0,
    guard: false,
    lockOn: true
};

// ========================================================
// 3. トゥーンシェーディング（セル画階調）＆ 黒アウトライン生成ユーティリティ
// ========================================================
function getToonGradientMap() {
    if (toonGradientMap) return toonGradientMap;
    // 4段階のアニメ＋リッチ陰影グラデーションマップ
    const data = new Uint8Array([
        75, 78, 98, 255,
        145, 148, 168, 255,
        215, 218, 230, 255,
        255, 255, 255, 255
    ]);
    const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    toonGradientMap = tex;
    return tex;
}

/**
 * Blender Cycles環境マップ反射 ＆ アニメ調リムハイライト対応ハイブリッドマテリアル
 */
function createToonMaterial(colorHex, emissiveHex = 0x000000, emissiveIntensity = 0.0, metalness = 0.18, roughness = 0.42) {
    return new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        emissive: new THREE.Color(emissiveHex),
        emissiveIntensity: emissiveIntensity,
        metalness: metalness,
        roughness: roughness,
        envMapIntensity: 1.35
    });
}

/**
 * メッシュにアニメ調の黒い輪郭線（Inverted Hull Outline）を付与する
 */
function addAnimeOutline(mesh, thickness = 0.022) {
    if (!mesh || !mesh.geometry) return mesh;
    const outlineMat = new THREE.MeshBasicMaterial({
        color: 0x0d1017,
        side: THREE.BackSide
    });
    const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
    outlineMesh.scale.setScalar(1.0 + thickness);
    outlineMesh.name = "AnimeOutline";
    mesh.add(outlineMesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function createOutlinedPart(geometry, material, outlineThickness = 0.024) {
    const m = new THREE.Mesh(geometry, material);
    addAnimeOutline(m, outlineThickness);
    return m;
}

/**
 * Blender 5.2 Cycles レンダリング画像（証明書カード＆ポートレート用）をプリロード
 */
function preloadCyclesAssets() {
    const loadImg = (src, key) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { cyclesImages[key] = img; };
        img.src = src;
    };
    loadImg('./assets/renders/cycles_battle_showcase.png', 'showcase');
    loadImg('./assets/renders/cycles_hero_portrait.png', 'heroPortrait');
    loadImg('./assets/renders/cycles_oni_portrait.png', 'oniPortrait');
}

// ========================================================
// 4. Three.js シーン初期化 ＆ Blender Cycles 絶景コロシアム構築
// ========================================================
async function initScene() {
    preloadCyclesAssets();
    parseUrlGhostChallenger();

    const container = document.getElementById('three-canvas-container');
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x5ea8dc);
    scene.fog = new THREE.FogExp2(0x8ecae6, 0.0075);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 320);
    camera.position.set(-5.8, 3.3, 6.2);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);

    // ポストプロセス（UnrealBloomPass による Cycles 発光・斬撃・魔法陣の輝き強調）
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.38,  // strength: 剣閃やルーン魔法陣が美しく輝く強度
        0.55,  // radius
        0.78   // threshold: 高輝度エフェクトとCycles反射ハイライトのみを発光
    );
    composer.addPass(bloomPass);

    clock = new THREE.Clock();

    // 明るい昼の太陽光ライティング ＋ リムライト2灯（Cycles風3点照明）
    const hemiLight = new THREE.HemisphereLight(0xe8f9fd, 0x8d99ae, 1.45);
    hemiLight.position.set(0, 35, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff5d6, 2.65);
    sunLight.position.set(16, 28, 18);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 75;
    const d = 15;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // キャラクターの立体感を際立たせるシアン＆ゴールドのバックリムライト
    const rimLightCyan = new THREE.DirectionalLight(0x00f2fe, 0.95);
    rimLightCyan.position.set(-18, 12, -16);
    scene.add(rimLightCyan);

    const rimLightWarm = new THREE.DirectionalLight(0xffbe0b, 0.75);
    rimLightWarm.position.set(18, 10, -14);
    scene.add(rimLightWarm);

    // Blender 5.2 Cycles コロシアム構築
    createDaylightAnimeColosseum();

    // プレイヤー＆CPU生成
    createCharacters();

    // 初期CPUボス（またはURL挑戦状ゴースト）配置
    spawnNextCpu();

    window.addEventListener('resize', onResize);
    animate();
}

function createDaylightAnimeColosseum() {
    const envGroup = new THREE.Group();
    const texLoader = new THREE.TextureLoader();

    // 0. Blender 5.2 Cycles 360° パノラマ環境マップ＆スカイドーム読み込み
    texLoader.load('./assets/renders/cycles_sky_env.png', skyTex => {
        skyTex.mapping = THREE.EquirectangularReflectionMapping;
        skyTex.colorSpace = THREE.SRGBColorSpace;
        cyclesEnvMap = skyTex;
        scene.environment = skyTex;

        const skyDomeGeo = new THREE.SphereGeometry(185, 48, 32);
        const skyDomeMat = new THREE.MeshBasicMaterial({
            map: skyTex,
            side: THREE.BackSide,
            fog: false
        });
        const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
        skyDome.position.y = -6.0;
        envGroup.add(skyDome);
    });

    // 1. Blender 5.2 Cycles レイトレーシング石畳＆古代ルーン刻印コロシアム床
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 512;
    groundCanvas.height = 512;
    const gctx = groundCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(256, 256, 20, 256, 256, 256);
    grad.addColorStop(0, '#d2b47c');
    grad.addColorStop(0.65, '#b8945a');
    grad.addColorStop(1, '#7c623a');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 512, 512);
    const fallbackGroundTex = new THREE.CanvasTexture(groundCanvas);

    const floorMat = new THREE.MeshStandardMaterial({
        map: fallbackGroundTex,
        roughness: 0.48,
        metalness: 0.18,
        envMapIntensity: 1.25
    });

    // Blender 5.2 Cycles でレンダリングした高精細石畳＆発光ルーン床テクスチャを適用
    texLoader.load('./assets/renders/cycles_arena_ground.png', cyclesGroundTex => {
        cyclesGroundTex.colorSpace = THREE.SRGBColorSpace;
        cyclesGroundTex.anisotropy = 8;
        floorMat.map = cyclesGroundTex;
        floorMat.needsUpdate = true;
    });

    const floorMesh = new THREE.Mesh(new THREE.CylinderGeometry(arenaRadius + 1.5, arenaRadius + 2.2, 1.4, 64), floorMat);
    floorMesh.position.y = -0.7;
    floorMesh.receiveShadow = true;
    envGroup.add(floorMesh);

    // アリーナ中央の黄金ルーン魔法陣リング（Bloom対応）
    const runeInnerRing = new THREE.Mesh(
        new THREE.RingGeometry(3.55, 3.72, 64),
        new THREE.MeshBasicMaterial({ color: 0x00f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
    );
    runeInnerRing.rotation.x = -Math.PI / 2;
    runeInnerRing.position.y = 0.02;
    envGroup.add(runeInnerRing);

    // 外周の緑の芝生エッジ
    const grassMat = createToonMaterial(0x588157, 0x000000, 0, 0.05, 0.8);
    const grassRing = new THREE.Mesh(new THREE.RingGeometry(arenaRadius - 0.3, arenaRadius + 3.2, 64), grassMat);
    grassRing.rotation.x = -Math.PI / 2;
    grassRing.position.y = 0.01;
    grassRing.receiveShadow = true;
    envGroup.add(grassRing);

    // 2. 光る黄金の境界リング ＋ 木の杭と横木のフェンス（画像1・2の柵を再現）
    const glowRingMat = new THREE.MeshBasicMaterial({ color: 0xffe66d, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const glowRing = new THREE.Mesh(new THREE.RingGeometry(arenaRadius - 0.14, arenaRadius + 0.10, 64), glowRingMat);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.03;
    envGroup.add(glowRing);

    const woodMat = createToonMaterial(0x6f4e37, 0x000000, 0, 0.1, 0.72);
    const postCount = 28;
    for (let i = 0; i < postCount; i++) {
        const ang = (i / postCount) * Math.PI * 2;
        if (ang > Math.PI * 0.22 && ang < Math.PI * 0.78) continue;

        const px = Math.cos(ang) * (arenaRadius + 0.3);
        const pz = Math.sin(ang) * (arenaRadius + 0.3);
        const post = createOutlinedPart(new THREE.BoxGeometry(0.24, 1.15, 0.24), woodMat, 0.02);
        post.position.set(px, 0.55, pz);
        post.rotation.y = -ang;
        envGroup.add(post);

        const rail = createOutlinedPart(new THREE.BoxGeometry(0.12, 0.16, 2.4), woodMat, 0.015);
        rail.position.set(px, 0.82, pz);
        rail.rotation.y = -ang;
        envGroup.add(rail);
    }

    // 3. 右奥の「巨大な大樹 (Ancient Great Tree)」(画像1・2右上の象徴的な大樹)
    const treeGroup = new THREE.Group();
    treeGroup.position.set(7.5, 0, -9.8);
    const trunkMat = createToonMaterial(0x5c4033, 0x000000, 0, 0.08, 0.78);
    const trunk = createOutlinedPart(new THREE.CylinderGeometry(1.4, 2.4, 11.0, 12), trunkMat, 0.015);
    trunk.position.y = 5.0;
    trunk.rotation.z = 0.08;
    treeGroup.add(trunk);

    const leafMat1 = createToonMaterial(0x386641, 0x0b1f10, 0.12, 0.05, 0.65);
    const leafMat2 = createToonMaterial(0x6a994e, 0x163012, 0.15, 0.05, 0.60);
    const canopyPositions = [
        [0, 10.5, 0, 4.8], [-3.2, 9.2, 1.2, 3.6], [3.0, 9.5, -1.0, 3.8], [0.8, 12.2, 1.0, 3.5]
    ];
    canopyPositions.forEach(([cx, cy, cz, cr], idx) => {
        const canopy = createOutlinedPart(new THREE.DodecahedronGeometry(cr, 1), idx % 2 === 0 ? leafMat1 : leafMat2, 0.015);
        canopy.position.set(cx, cy, cz);
        treeGroup.add(canopy);
    });
    envGroup.add(treeGroup);

    // 4. 古代ギリシャ風の折れた石柱 ＆ 黄金かがり火クリスタル ＆ 左奥の岩山クリフ
    const pillarMat = createToonMaterial(0x95a5a6, 0x000000, 0, 0.22, 0.52);
    const crystalBeaconMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
    const pillarCoords = [
        [-4.5, -11.5, 6.5, 0.05],
        [-8.8, -8.5, 4.2, -0.12],
        [3.2, -12.2, 4.8, 0.04],
        [10.8, -6.2, 7.2, -0.18]
    ];
    pillarCoords.forEach(([x, z, h, tilt]) => {
        const p = createOutlinedPart(new THREE.CylinderGeometry(0.65, 0.72, h, 14), pillarMat, 0.018);
        p.position.set(x, h / 2 - 0.2, z);
        p.rotation.z = tilt;
        envGroup.add(p);

        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), crystalBeaconMat);
        crystal.position.set(x, h + 0.35, z);
        envGroup.add(crystal);
    });

    // 左奥の岩山
    const cliffMat = createToonMaterial(0x576574, 0x000000, 0, 0.15, 0.68);
    for (let i = 0; i < 6; i++) {
        const rock = createOutlinedPart(new THREE.DodecahedronGeometry(3.2 + i * 0.6, 0), cliffMat, 0.012);
        rock.position.set(-13.5 + i * 2.2, 2.2 + (i % 2) * 1.5, -11.0 - i * 1.2);
        envGroup.add(rock);
    }

    // フィールド内の小石プロップ
    for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 6.2 + Math.random() * 3.2;
        const pebble = createOutlinedPart(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.22, 0), cliffMat, 0.02);
        pebble.position.set(Math.cos(ang) * r, 0.08, Math.sin(ang) * r);
        pebble.scale.y = 0.55;
        envGroup.add(pebble);
    }

    // 5. 空中を舞う黄金・蒼光の環境マナ粒子（32個）
    const moteGeo = new THREE.OctahedronGeometry(0.055, 0);
    for (let i = 0; i < 32; i++) {
        const mMat = new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? 0xffe66d : 0x00f2fe,
            transparent: true,
            opacity: 0.75
        });
        const mote = new THREE.Mesh(moteGeo, mMat);
        const ang = Math.random() * Math.PI * 2;
        const rad = 1.5 + Math.random() * (arenaRadius - 1.0);
        const y = 0.4 + Math.random() * 3.6;
        mote.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
        envGroup.add(mote);
        ambientSparkles.push({
            mesh: mote,
            baseY: y,
            angle: ang,
            radius: rad,
            speed: 0.18 + Math.random() * 0.35,
            phase: Math.random() * Math.PI * 2
        });
    }

    // 6. 遠景の青い大海原 (Cycles環境反射つきの水面)
    const seaGeo = new THREE.PlaneGeometry(360, 360);
    const seaMat = new THREE.MeshStandardMaterial({
        color: 0x1e6bb8,
        roughness: 0.16,
        metalness: 0.65,
        envMapIntensity: 1.6
    });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -2.2;
    envGroup.add(sea);

    scene.add(envGroup);
}

// ========================================================
// 5. 細密アニメ調 3D プレイヤーモデル生成（髪型・ゴーグル・服装・武器5種）
// ========================================================
function createCharacters() {
    player.group = new THREE.Group();
    player.animPivot = new THREE.Group();
    player.group.add(player.animPivot);

    player.guardBarrierMesh = createGuardShield(0x00f2fe);
    player.group.add(player.guardBarrierMesh);

    // プレイヤー周囲の常時キラキラオーラ粒子 (画像1の主人公オーラ再現)
    const auraGeo = new THREE.OctahedronGeometry(0.06, 0);
    for (let i = 0; i < 14; i++) {
        const pMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x00f2fe : 0xffdd59, transparent: true, opacity: 0.85 });
        const pMesh = new THREE.Mesh(auraGeo, pMat);
        player.group.add(pMesh);
        playerAuraParticles.push({
            mesh: pMesh,
            mat: pMat,
            angle: (i / 14) * Math.PI * 2,
            heightOffset: Math.random() * 1.6,
            radius: 0.45 + Math.random() * 0.35,
            speed: 1.8 + Math.random() * 1.5
        });
    }

    scene.add(player.group);

    // CPUグループ初期化
    cpu.group = new THREE.Group();
    cpu.animPivot = new THREE.Group();
    cpu.group.add(cpu.animPivot);
    cpu.guardBarrierMesh = createGuardShield(0xff4757);
    cpu.group.add(cpu.guardBarrierMesh);
    scene.add(cpu.group);

    rebuildPlayerModelFromDesign();
}

/**
 * ユーザーのキャラデザ設定（style, weapon, hairColor, outfitColor, auraColor）から
 * トゥーン輪郭線付きの細密3Dアニメキャラクターを構築する
 */
function rebuildPlayerModelFromDesign() {
    if (player.isVrm) return; // 外部VRM導入中はVRMを優先

    if (player.mesh) {
        player.animPivot.remove(player.mesh);
    }

    const d = player.design;
    const hairCol = new THREE.Color(d.hairColor).getHex();
    const outfitCol = new THREE.Color(d.outfitColor).getHex();
    const auraCol = new THREE.Color(d.auraColor).getHex();
    player.themeColor = auraCol;

    // オーラ粒子の色を同期
    playerAuraParticles.forEach((p, idx) => {
        p.mat.color.setHex(idx % 2 === 0 ? auraCol : 0xffdd59);
    });

    const root = new THREE.Group();
    const joints = {};

    const skinMat = createToonMaterial(0xffe0bd);
    const hairMat = createToonMaterial(hairCol);
    const outfitMat = createToonMaterial(outfitCol);
    const whiteMat = createToonMaterial(0xf5f6fa);
    const darkPantsMat = createToonMaterial(0x1e272e);
    const bootMat = createToonMaterial(0x5c4033);
    const goldMat = createToonMaterial(0xffd32a, 0xff9f1a, 0.2);
    const glowMat = new THREE.MeshBasicMaterial({ color: auraCol });

    // --- 胴体 (Torso) ---
    const torso = new THREE.Group();
    torso.position.set(0, 1.05, 0);
    root.add(torso);
    joints.torso = torso;

    if (d.style === "astral_mage") {
        // 魔導士ローブ
        const robe = createOutlinedPart(new THREE.ConeGeometry(0.46, 1.05, 12), outfitMat);
        robe.position.y = -0.15;
        torso.add(robe);
        const collar = createOutlinedPart(new THREE.CylinderGeometry(0.28, 0.34, 0.22, 12), goldMat);
        collar.position.y = 0.25;
        torso.add(collar);
    } else if (d.style === "ponytail_valkyrie") {
        // 女剣士バトルアーマー＆プリーツスカート
        const chest = createOutlinedPart(new THREE.CylinderGeometry(0.23, 0.19, 0.44, 12), outfitMat);
        chest.position.y = 0.14;
        torso.add(chest);
        const midriff = createOutlinedPart(new THREE.CylinderGeometry(0.18, 0.19, 0.16, 12), skinMat);
        midriff.position.y = -0.10;
        torso.add(midriff);
        const skirt = createOutlinedPart(new THREE.CylinderGeometry(0.20, 0.36, 0.34, 14), outfitMat);
        skirt.position.y = -0.28;
        torso.add(skirt);
    } else {
        // 王道ジャケット＆インナーシャツ＆ベルト
        const shirt = createOutlinedPart(new THREE.CylinderGeometry(0.23, 0.20, 0.54, 12), whiteMat);
        shirt.position.y = 0.08;
        torso.add(shirt);
        const jacket = createOutlinedPart(new THREE.CylinderGeometry(0.26, 0.23, 0.48, 12, 1, false, 0, Math.PI * 1.65), outfitMat);
        jacket.rotation.y = -Math.PI * 0.82;
        jacket.position.y = 0.11;
        torso.add(jacket);
        // 肩パッド
        const lPad = createOutlinedPart(new THREE.SphereGeometry(0.15, 10, 10), outfitMat);
        lPad.position.set(0.27, 0.26, 0);
        const rPad = createOutlinedPart(new THREE.SphereGeometry(0.15, 10, 10), outfitMat);
        rPad.position.set(-0.27, 0.26, 0);
        torso.add(lPad, rPad);
        // ベルト＆ポーチ
        const belt = createOutlinedPart(new THREE.CylinderGeometry(0.22, 0.22, 0.10, 12), bootMat);
        belt.position.y = -0.18;
        const buckle = createOutlinedPart(new THREE.BoxGeometry(0.12, 0.12, 0.08), goldMat);
        buckle.position.set(0, -0.18, -0.21);
        torso.add(belt, buckle);
    }

    // --- 頭部・アニメ顔・髪型・装備 (Head) ---
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.54, 0);
    torso.add(headGroup);
    joints.head = headGroup;

    const headSphere = createOutlinedPart(new THREE.SphereGeometry(0.23, 16, 16), skinMat);
    headGroup.add(headSphere);

    // アニメ風の瞳（前方は -Z 方向）
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: hairCol });
    [-0.08, 0.08].forEach(ex => {
        const ew = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eyeWhiteMat);
        ew.scale.set(1, 1.3, 0.4);
        ew.position.set(ex, 0.02, -0.205);
        const ep = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), eyePupilMat);
        ep.scale.set(1, 1.3, 0.4);
        ep.position.set(ex, 0.02, -0.218);
        headGroup.add(ew, ep);
    });

    // スタイル別の髪型・頭装備
    if (d.style === "goggle_hero") {
        // 画像1：ツンツン青髪 ＋ 額のゴーグル
        const hairCap = createOutlinedPart(new THREE.SphereGeometry(0.245, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.65), hairMat);
        hairCap.rotation.x = -0.25;
        headGroup.add(hairCap);

        const spikeAngles = [
            [0, 0.28, -0.05, -0.4, 0],
            [-0.18, 0.24, -0.02, -0.3, 0.5],
            [0.18, 0.24, -0.02, -0.3, -0.5],
            [-0.22, 0.12, 0.14, 0.5, 0.7],
            [0.22, 0.12, 0.14, 0.5, -0.7],
            [0, 0.22, 0.20, 0.8, 0],
            [-0.12, 0.18, -0.18, -0.7, 0.2],
            [0.12, 0.18, -0.18, -0.7, -0.2]
        ];
        spikeAngles.forEach(([sx, sy, sz, rx, rz]) => {
            const sp = createOutlinedPart(new THREE.ConeGeometry(0.085, 0.26, 6), hairMat, 0.02);
            sp.position.set(sx, sy, sz);
            sp.rotation.set(rx, 0, rz);
            headGroup.add(sp);
        });

        // 額のパイロットゴーグル
        const strap = createOutlinedPart(new THREE.CylinderGeometry(0.248, 0.248, 0.06, 16), bootMat, 0.015);
        strap.position.y = 0.11;
        strap.rotation.z = 0.05;
        headGroup.add(strap);
        [-0.085, 0.085].forEach(gx => {
            const rim = createOutlinedPart(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 12), goldMat, 0.015);
            rim.rotation.x = Math.PI / 2;
            rim.position.set(gx, 0.12, -0.22);
            const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.066, 12), glowMat);
            lens.rotation.x = Math.PI / 2;
            lens.position.set(gx, 0.12, -0.22);
            headGroup.add(rim, lens);
        });

    } else if (d.style === "ponytail_valkyrie") {
        // 画像2左上：紅髪ポニーテール女剣士
        const hairBase = createOutlinedPart(new THREE.SphereGeometry(0.245, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.65), hairMat);
        headGroup.add(hairBase);
        const ponytail = createOutlinedPart(new THREE.ConeGeometry(0.13, 0.62, 10), hairMat);
        ponytail.position.set(0, 0.06, 0.34);
        ponytail.rotation.x = -Math.PI * 0.62;
        headGroup.add(ponytail);
        const tie = createOutlinedPart(new THREE.TorusGeometry(0.07, 0.025, 8, 12), goldMat);
        tie.position.set(0, 0.14, 0.22);
        headGroup.add(tie);

    } else if (d.style === "astral_mage") {
        // 画像2右上：とんがり帽子の魔法使い
        const brim = createOutlinedPart(new THREE.CylinderGeometry(0.52, 0.52, 0.04, 20), outfitMat);
        brim.position.y = 0.16;
        const cone = createOutlinedPart(new THREE.ConeGeometry(0.28, 0.65, 14), outfitMat);
        cone.position.y = 0.46;
        cone.rotation.x = 0.18;
        headGroup.add(brim, cone);

    } else if (d.style === "cyber_brawler") {
        // 画像2左下：サイバーバイザー格闘家
        const helm = createOutlinedPart(new THREE.SphereGeometry(0.255, 16, 16), outfitMat);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.16), new THREE.MeshBasicMaterial({ color: 0xff3838 }));
        visor.position.set(0, 0.04, -0.19);
        headGroup.add(helm, visor);

    } else {
        // 画像2右下：麦わら帽子の冒険者
        const strawMat = createToonMaterial(0xfbc531);
        const redBandMat = createToonMaterial(0xe84118);
        const brim = createOutlinedPart(new THREE.CylinderGeometry(0.46, 0.46, 0.035, 20), strawMat);
        brim.position.y = 0.16;
        const dome = createOutlinedPart(new THREE.SphereGeometry(0.25, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), strawMat);
        dome.position.y = 0.15;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.06, 16), redBandMat);
        band.position.y = 0.19;
        headGroup.add(brim, dome, band);
    }

    // --- 両腕 (LeftArm & RightArm) ---
    const createArm = (isRight) => {
        const armGroup = new THREE.Group();
        armGroup.position.set(isRight ? -0.32 : 0.32, 0.22, 0);
        const upper = createOutlinedPart(new THREE.CylinderGeometry(0.075, 0.068, 0.46, 10), skinMat);
        upper.position.y = -0.20;
        const glove = createOutlinedPart(new THREE.BoxGeometry(0.13, 0.18, 0.14), outfitMat);
        glove.position.y = -0.44;
        armGroup.add(upper, glove);
        torso.add(armGroup);
        return armGroup;
    };
    joints.leftArm = createArm(false);
    joints.rightArm = createArm(true);

    // --- 武器の装着 (5種) ---
    attachSelectedWeapon(joints.rightArm, joints.leftArm, torso, d.weapon, auraCol);

    // --- 両脚 (LeftLeg & RightLeg) ---
    const createLeg = (isRight) => {
        const legGroup = new THREE.Group();
        legGroup.position.set(isRight ? -0.13 : 0.13, 0.78, 0);
        const pant = createOutlinedPart(new THREE.CylinderGeometry(0.095, 0.08, 0.44, 10), darkPantsMat);
        pant.position.y = -0.22;
        const boot = createOutlinedPart(new THREE.BoxGeometry(0.16, 0.34, 0.26), bootMat);
        boot.position.set(0, -0.58, -0.04);
        legGroup.add(pant, boot);
        root.add(legGroup);
        return legGroup;
    };
    joints.leftLeg = createLeg(false);
    joints.rightLeg = createLeg(true);

    player.mesh = root;
    player.joints = joints;
    player.animPivot.add(root);

    // 左上の丸型顔アイコンCanvasも再描画
    drawPlayerPortrait();
}

/**
 * 選択された武器メッシュを生成して腕に装着する
 */
function attachSelectedWeapon(rightArm, leftArm, torso, weaponType, auraCol) {
    const steelMat = createToonMaterial(0x7f8fa6);
    const darkMetalMat = createToonMaterial(0x2f3640);
    const goldMat = createToonMaterial(0xffd32a);
    const glowMat = new THREE.MeshBasicMaterial({ color: auraCol });

    if (weaponType === "rune_greatsword") {
        // 画像1の象徴的な「大型メカニック・ルーン大剣」
        const swordGroup = new THREE.Group();
        swordGroup.position.set(0, -0.48, -0.12);
        swordGroup.rotation.x = -Math.PI * 0.42;

        const hilt = createOutlinedPart(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), darkMetalMat);
        const guard = createOutlinedPart(new THREE.BoxGeometry(0.44, 0.16, 0.14), darkMetalMat);
        guard.position.y = 0.24;
        const coreGem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), glowMat);
        coreGem.rotation.x = Math.PI / 2;
        coreGem.position.y = 0.24;

        const blade = createOutlinedPart(new THREE.BoxGeometry(0.24, 1.48, 0.05), steelMat, 0.025);
        blade.position.y = 1.02;
        const bladeTip = createOutlinedPart(new THREE.ConeGeometry(0.14, 0.34, 4), steelMat, 0.025);
        bladeTip.rotation.y = Math.PI / 4;
        bladeTip.position.y = 1.92;

        // 刀身中央の青く光るエネルギーライン (画像1再現)
        const energyLine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.065), glowMat);
        energyLine.position.y = 0.98;

        swordGroup.add(hilt, guard, coreGem, blade, bladeTip, energyLine);
        rightArm.add(swordGroup);

    } else if (weaponType === "sword_shield") {
        // 片手剣 ＆ 左腕のラウンドシールド
        const swordGroup = new THREE.Group();
        swordGroup.position.set(0, -0.46, -0.10);
        swordGroup.rotation.x = -Math.PI * 0.45;
        const guard = createOutlinedPart(new THREE.BoxGeometry(0.32, 0.08, 0.10), goldMat);
        guard.position.y = 0.15;
        const blade = createOutlinedPart(new THREE.BoxGeometry(0.12, 1.05, 0.04), steelMat);
        blade.position.y = 0.70;
        swordGroup.add(guard, blade);
        rightArm.add(swordGroup);

        const shield = createOutlinedPart(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16), steelMat);
        shield.rotation.z = Math.PI / 2;
        shield.position.set(0.14, -0.36, -0.05);
        leftArm.add(shield);

    } else if (weaponType === "magic_staff") {
        // 星霊の魔導スタッフ
        const staffGroup = new THREE.Group();
        staffGroup.position.set(0, -0.44, -0.10);
        staffGroup.rotation.x = -Math.PI * 0.38;
        const rod = createOutlinedPart(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 8), createToonMaterial(0x6f4e37));
        rod.position.y = 0.55;
        const ring = createOutlinedPart(new THREE.TorusGeometry(0.16, 0.03, 8, 16), goldMat);
        ring.position.y = 1.42;
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 1), glowMat);
        orb.position.y = 1.42;
        staffGroup.add(rod, ring, orb);
        rightArm.add(staffGroup);

    } else if (weaponType === "knuckle_gauntlet") {
        // 両拳の大型ガントレット
        [rightArm, leftArm].forEach(arm => {
            const fist = createOutlinedPart(new THREE.DodecahedronGeometry(0.18, 0), goldMat);
            fist.position.set(0, -0.48, -0.04);
            arm.add(fist);
        });

    } else if (weaponType === "crimson_katana") {
        // 妖刀・紅蓮大太刀
        const katanaGroup = new THREE.Group();
        katanaGroup.position.set(0, -0.46, -0.10);
        katanaGroup.rotation.x = -Math.PI * 0.45;
        const tsuba = createOutlinedPart(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 12), goldMat);
        tsuba.position.y = 0.16;
        const blade = createOutlinedPart(new THREE.BoxGeometry(0.06, 1.42, 0.03), glowMat);
        blade.position.y = 0.88;
        katanaGroup.add(tsuba, blade);
        rightArm.add(katanaGroup);
    }
}

// ========================================================
// 6. CPU ボスモンスター 5種の細密トゥーン3Dモデル生成 (画像1・2再現)
// ========================================================
function setupCpuBossModel(bossInfo) {
    if (cpu.mesh) {
        cpu.animPivot.remove(cpu.mesh);
    }

    const root = new THREE.Group();
    const joints = {};

    const skinMat = createToonMaterial(bossInfo.skinColor);
    const armorMat = createToonMaterial(bossInfo.armorColor);
    const accentMat = createToonMaterial(bossInfo.accentColor);
    const whiteMat = createToonMaterial(0xf5f6fa);
    const darkMat = createToonMaterial(0x1e272e);

    // 筋骨隆々の巨躯 (Torso)
    const torso = new THREE.Group();
    torso.position.set(0, 1.25, 0);
    root.add(torso);
    joints.torso = torso;

    const chest = createOutlinedPart(new THREE.CylinderGeometry(0.48, 0.36, 0.78, 12), skinMat, 0.025);
    chest.position.y = 0.15;
    torso.add(chest);

    const armorPlate = createOutlinedPart(new THREE.CylinderGeometry(0.50, 0.42, 0.42, 12), armorMat, 0.022);
    armorPlate.position.y = 0.22;
    torso.add(armorPlate);

    const belt = createOutlinedPart(new THREE.CylinderGeometry(0.39, 0.42, 0.22, 12), darkMat);
    belt.position.y = -0.25;
    const buckle = createOutlinedPart(new THREE.SphereGeometry(0.13, 10, 10), accentMat);
    buckle.position.set(0, -0.25, -0.38);
    torso.add(belt, buckle);

    // 両肩のトゲ付き巨大ショルダーアーマー (画像1の赤鬼・画像2のベヒーモス再現)
    [-0.54, 0.54].forEach(sx => {
        const pauldron = createOutlinedPart(new THREE.SphereGeometry(0.28, 12, 12), armorMat, 0.025);
        pauldron.position.set(sx, 0.38, 0);
        for (let s = 0; s < 3; s++) {
            const spike = createOutlinedPart(new THREE.ConeGeometry(0.065, 0.26, 6), whiteMat, 0.02);
            spike.position.set((sx > 0 ? 0.16 : -0.16), 0.18 + s * 0.05, (s - 1) * 0.12);
            spike.rotation.z = sx > 0 ? -0.6 : 0.6;
            pauldron.add(spike);
        }
        torso.add(pauldron);
    });

    // 頭部 (Head)
    const head = new THREE.Group();
    head.position.set(0, 0.68, -0.05);
    torso.add(head);
    joints.head = head;

    const face = createOutlinedPart(new THREE.DodecahedronGeometry(0.28, 1), skinMat, 0.025);
    head.add(face);

    // 怒り目 ＆ 2本の角
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd59 });
    [-0.10, 0.10].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
        eye.position.set(ex, 0.05, -0.25);
        const horn = createOutlinedPart(new THREE.ConeGeometry(0.065, 0.32, 6), whiteMat, 0.02);
        horn.position.set(ex * 1.6, 0.28, -0.08);
        horn.rotation.x = -0.35;
        head.add(eye, horn);
    });

    // リザードマンの場合は長い尻尾を追加
    if (bossInfo.id === "lizard_dragonkin") {
        const tail = createOutlinedPart(new THREE.ConeGeometry(0.18, 1.35, 8), skinMat);
        tail.position.set(0, -0.35, 0.65);
        tail.rotation.x = Math.PI * 0.62;
        torso.add(tail);
    }

    // 剛腕 (LeftArm & RightArm)
    const createBossArm = (isRight) => {
        const armGroup = new THREE.Group();
        armGroup.position.set(isRight ? -0.56 : 0.56, 0.28, 0);
        const upper = createOutlinedPart(new THREE.CylinderGeometry(0.15, 0.13, 0.56, 10), skinMat);
        upper.position.y = -0.24;
        const bracer = createOutlinedPart(new THREE.CylinderGeometry(0.16, 0.15, 0.28, 10), armorMat);
        bracer.position.y = -0.52;
        armGroup.add(upper, bracer);
        torso.add(armGroup);
        return armGroup;
    };
    joints.leftArm = createBossArm(false);
    joints.rightArm = createBossArm(true);

    // 赤鬼の「巨大ウォーハンマー」（画像1の赤鬼が持つハンマーを完全再現！）
    if (bossInfo.category === "melee-weapon") {
        const hammerGroup = new THREE.Group();
        hammerGroup.position.set(0, -0.62, -0.15);
        hammerGroup.rotation.x = -Math.PI * 0.42;

        const handle = createOutlinedPart(new THREE.CylinderGeometry(0.05, 0.05, 1.85, 8), darkMat);
        handle.position.y = 0.55;
        const headCyl = createOutlinedPart(new THREE.CylinderGeometry(0.34, 0.34, 0.78, 12), armorMat, 0.025);
        headCyl.rotation.z = Math.PI / 2;
        headCyl.position.y = 1.42;
        const band1 = createOutlinedPart(new THREE.CylinderGeometry(0.36, 0.36, 0.10, 12), accentMat);
        band1.rotation.z = Math.PI / 2;
        band1.position.set(-0.22, 1.42, 0);
        const band2 = band1.clone();
        band2.position.set(0.22, 1.42, 0);

        hammerGroup.add(handle, headCyl, band1, band2);
        joints.rightArm.add(hammerGroup);
    }

    // 両脚
    const createBossLeg = (isRight) => {
        const legGroup = new THREE.Group();
        legGroup.position.set(isRight ? -0.22 : 0.22, 0.85, 0);
        const thigh = createOutlinedPart(new THREE.CylinderGeometry(0.17, 0.14, 0.55, 10), darkMat);
        thigh.position.y = -0.26;
        const boot = createOutlinedPart(new THREE.BoxGeometry(0.24, 0.35, 0.34), armorMat);
        boot.position.set(0, -0.64, -0.05);
        legGroup.add(thigh, boot);
        root.add(legGroup);
        return legGroup;
    };
    joints.leftLeg = createBossLeg(false);
    joints.rightLeg = createBossLeg(true);

    root.scale.setScalar(bossInfo.scale || 1.25);
    cpu.mesh = root;
    cpu.joints = joints;
    cpu.animPivot.add(root);

    drawCpuPortrait(bossInfo);
}

// ========================================================
// 7. 左上＆右上の丸型アニメ顔アイコン Canvas 描画 (画像1・2再現)
// ========================================================
function drawPlayerPortrait() {
    const canvas = document.getElementById('player-portrait-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 背景グラデーション
    const bg = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    bg.addColorStop(0, player.design.auraColor || '#00f2fe');
    bg.addColorStop(1, '#1e3799');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 襟・ジャケット
    ctx.fillStyle = player.design.outfitColor || '#253b56';
    ctx.beginPath();
    ctx.arc(w / 2, h + 6, 34, Math.PI, 0);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111';
    ctx.stroke();

    // 顔輪郭
    ctx.fillStyle = '#ffe0bd';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 6, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // アニメ瞳
    ctx.fillStyle = '#fff';
    ctx.fillRect(w / 2 - 13, h / 2 + 2, 8, 9);
    ctx.fillRect(w / 2 + 5, h / 2 + 2, 8, 9);
    ctx.fillStyle = player.design.hairColor || '#1e90ff';
    ctx.fillRect(w / 2 - 11, h / 2 + 3, 5, 7);
    ctx.fillRect(w / 2 + 7, h / 2 + 3, 5, 7);
    ctx.fillStyle = '#000';
    ctx.fillRect(w / 2 - 14, h / 2, 10, 2);
    ctx.fillRect(w / 2 + 4, h / 2, 10, 2);

    // 口元（自信のある笑み）
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 15, 5, 0.1 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // ツンツン髪
    ctx.fillStyle = player.design.hairColor || '#1e90ff';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 24, h / 2 + 2);
    ctx.lineTo(w / 2 - 28, h / 2 - 16);
    ctx.lineTo(w / 2 - 12, h / 2 - 12);
    ctx.lineTo(w / 2 - 4, h / 2 - 28);
    ctx.lineTo(w / 2 + 8, h / 2 - 14);
    ctx.lineTo(w / 2 + 24, h / 2 - 22);
    ctx.lineTo(w / 2 + 25, h / 2 + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 額のゴーグル（goggle_hero時）
    if (player.design.style === 'goggle_hero') {
        ctx.fillStyle = '#00f2fe';
        ctx.strokeStyle = '#ffd32a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w / 2 - 9, h / 2 - 8, 6, 0, Math.PI * 2);
        ctx.arc(w / 2 + 9, h / 2 - 8, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

function drawCpuPortrait(bossInfo) {
    const canvas = document.getElementById('cpu-portrait-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    bg.addColorStop(0, '#ff5e57');
    bg.addColorStop(1, '#4a0e0e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const hexStr = '#' + new THREE.Color(bossInfo.skinColor).getHexString();
    ctx.fillStyle = hexStr;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 6, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2本の白い角
    ctx.fillStyle = '#f5f6fa';
    [-16, 16].forEach(hx => {
        ctx.beginPath();
        ctx.moveTo(w / 2 + hx - 6, h / 2 - 10);
        ctx.lineTo(w / 2 + hx * 1.4, h / 2 - 28);
        ctx.lineTo(w / 2 + hx + 6, h / 2 - 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    });

    // 眼光と牙
    ctx.fillStyle = '#ffdd59';
    ctx.fillRect(w / 2 - 14, h / 2, 9, 6);
    ctx.fillRect(w / 2 + 5, h / 2, 9, 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(w / 2 - 10, h / 2 + 14, 20, 6);
}

function createGuardShield(colorHex) {
    const geo = new THREE.SphereGeometry(1.15, 20, 20);
    const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        transparent: true,
        opacity: 0.0
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.05;
    return mesh;
}

// ========================================================
// 8. 🎨 オリキャラ・クリエイト＆AI作戦工房（負けるまで変更不可ロック & 3すくみ）
// ========================================================
let studioSyncSlidersFn = null;

function determinePlayerArchetype(ptAtk, ptRange, ptStun, ptAtkSpd, ptSpd, motionType) {
    if (motionType === "speed_rush" || (ptAtkSpd + ptSpd >= 44)) {
        return "speed_assassin";
    }
    if (motionType === "heavy_buster" || (ptAtk + ptRange >= 50)) {
        return "one_shot_buster";
    }
    return "iron_counter";
}

function getArchetypeMultiplier(attackerArch, defenderArch) {
    const info = ARCHETYPE_INFO[attackerArch];
    if (info && info.beats === defenderArch) {
        return 1.22; // 相性有利（3すくみ勝利でダメージ＆崩し1.22倍！）
    }
    return 1.0;
}

function parseUrlGhostChallenger() {
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('ghost');
        if (!raw) return;
        const decoded = JSON.parse(decodeURIComponent(atob(raw)));
        if (decoded && decoded.name) {
            challengedGhostData = decoded;
        }
    } catch (e) {
        console.warn("Ghost URL parse skipped:", e);
    }
}

function buildChallengeUrl() {
    const payload = {
        name: player.design.name,
        streak: currentWins,
        arch: player.archetype,
        atk: player.atkScale,
        range: player.attackRange,
        stun: player.stunPower,
        spd: player.speed,
        sliders: player.sliderPts,
        gambits: player.gambits
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?ghost=${encoded}`;
}

function setupCreatorStudio() {
    const modal = document.getElementById('creator-modal');
    const openBtn = document.getElementById('open-creator-btn');
    const avatarFrame = document.getElementById('player-avatar-frame');
    const closeBtn = document.getElementById('close-creator-btn');
    const previewBtn = document.getElementById('btn-apply-preview');
    const lockBtn = document.getElementById('btn-lock-register');

    const sliders = {
        atk: document.getElementById('sl-atk'),
        range: document.getElementById('sl-range'),
        stun: document.getElementById('sl-stun'),
        atkspd: document.getElementById('sl-atkspd'),
        spd: document.getElementById('sl-spd')
    };

    const MAX_TOTAL_PT = 100;

    function syncSlidersAndCalculateStats(changedKey) {
        let total = Object.values(sliders).reduce((acc, el) => acc + Number(el.value), 0);
        if (total > MAX_TOTAL_PT && changedKey) {
            const overflow = total - MAX_TOTAL_PT;
            sliders[changedKey].value = Math.max(0, Number(sliders[changedKey].value) - overflow);
            total = MAX_TOTAL_PT;
        }

        const ptAtk = Number(sliders.atk.value);
        const ptRange = Number(sliders.range.value);
        const ptStun = Number(sliders.stun.value);
        const ptAtkSpd = Number(sliders.atkspd.value);
        const ptSpd = Number(sliders.spd.value);

        const calcAtk = Number((0.85 + (ptAtk / 40) * 0.55).toFixed(2));       // 0.85x 〜 1.40x
        const calcRange = Number((2.4 + (ptRange / 40) * 2.1).toFixed(1));     // 2.4m 〜 4.5m
        const calcStun = Number((0.80 + (ptStun / 40) * 0.70).toFixed(2));     // 0.80x 〜 1.50x
        const calcAtkSpd = Number((0.85 + (ptAtkSpd / 40) * 0.50).toFixed(2)); // 0.85x 〜 1.35x
        const calcSpd = Number((5.2 + (ptSpd / 40) * 2.8).toFixed(1));         // 5.2 〜 8.0

        document.getElementById('val-atk').innerText = `${calcAtk.toFixed(2)}x (${ptAtk}pt)`;
        document.getElementById('val-range').innerText = `${calcRange.toFixed(1)}m (${ptRange}pt)`;
        document.getElementById('val-stun').innerText = `${calcStun.toFixed(2)}x (${ptStun}pt)`;
        document.getElementById('val-atkspd').innerText = `${calcAtkSpd.toFixed(2)}x (${ptAtkSpd}pt)`;
        document.getElementById('val-spd').innerText = `${calcSpd.toFixed(1)} (${ptSpd}pt)`;

        const rem = MAX_TOTAL_PT - total;
        const badge = document.getElementById('cr-pt-badge');
        badge.innerText = `残り: ${rem} / ${MAX_TOTAL_PT} PT`;
        badge.style.background = rem === 0 ? '#10b981' : '#0284c7';

        return {
            ptAtk, ptRange, ptStun, ptAtkSpd, ptSpd,
            calcAtk, calcRange, calcStun, calcAtkSpd, calcSpd
        };
    }

    studioSyncSlidersFn = syncSlidersAndCalculateStats;

    Object.entries(sliders).forEach(([key, el]) => {
        el.addEventListener('input', () => syncSlidersAndCalculateStats(key));
    });

    // ワンクリック配分プリセット（3すくみ対応）
    document.querySelectorAll('.alloc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (player.is_active || player.isCustomCharLocked) {
                showAnnouncement('🔒 出撃ロック中！敗北（引退）するまでキャラ変更はできません！', '#ff4757');
                return;
            }
            const preset = btn.getAttribute('data-preset');
            if (preset === 'balance') {
                sliders.atk.value = 14; sliders.range.value = 14; sliders.stun.value = 18; sliders.atkspd.value = 28; sliders.spd.value = 26;
                document.getElementById('cr-motion').value = 'speed_rush';
                document.getElementById('ai-cond-1').value = 'sp_50'; document.getElementById('ai-act-1').value = 'ult_ex';
                document.getElementById('ai-cond-2').value = 'enemy_stun'; document.getElementById('ai-act-2').value = 'skill_arts';
                document.getElementById('ai-cond-3').value = 'always'; document.getElementById('ai-act-3').value = 'atk_rush';
            } else if (preset === 'power_range') {
                sliders.atk.value = 36; sliders.range.value = 36; sliders.stun.value = 16; sliders.atkspd.value = 6; sliders.spd.value = 6;
                document.getElementById('cr-motion').value = 'heavy_buster';
                document.getElementById('ai-cond-1').value = 'sp_50'; document.getElementById('ai-act-1').value = 'ult_ex';
                document.getElementById('ai-cond-2').value = 'enemy_guard'; document.getElementById('ai-act-2').value = 'atk_launch';
                document.getElementById('ai-cond-3').value = 'always'; document.getElementById('ai-act-3').value = 'atk_wide';
            } else if (preset === 'combo_stun') {
                sliders.atk.value = 18; sliders.range.value = 18; sliders.stun.value = 34; sliders.atkspd.value = 16; sliders.spd.value = 14;
                document.getElementById('cr-motion').value = 'acrobat_martial';
                document.getElementById('ai-cond-1').value = 'enemy_attack'; document.getElementById('ai-act-1').value = 'guard_counter';
                document.getElementById('ai-cond-2').value = 'enemy_stun'; document.getElementById('ai-act-2').value = 'skill_arts';
                document.getElementById('ai-cond-3').value = 'always'; document.getElementById('ai-act-3').value = 'atk_launch';
            }
            syncSlidersAndCalculateStats();
        });
    });

    function readGambitsFromUI() {
        return [
            {
                cond: document.getElementById('ai-cond-1')?.value || 'sp_50',
                act: document.getElementById('ai-act-1')?.value || 'ult_ex'
            },
            {
                cond: document.getElementById('ai-cond-2')?.value || 'enemy_stun',
                act: document.getElementById('ai-act-2')?.value || 'skill_arts'
            },
            {
                cond: document.getElementById('ai-cond-3')?.value || 'always',
                act: document.getElementById('ai-act-3')?.value || 'atk_rush'
            }
        ];
    }

    function applyStudioSettingsToPlayer(lockRegistration = false) {
        if (player.is_active || player.isCustomCharLocked) {
            showAnnouncement(`🔒 出撃ロック中！(${player.registeredCharName}) 負けるまで変更不可！`, "#ff4757");
            return;
        }

        const stats = syncSlidersAndCalculateStats();
        player.sliderPts = {
            atk: stats.ptAtk,
            range: stats.ptRange,
            stun: stats.ptStun,
            atkspd: stats.ptAtkSpd,
            spd: stats.ptSpd
        };

        player.design.name = document.getElementById('cr-name').value.trim() || "PLAYER (自作)";
        player.design.style = document.getElementById('cr-style').value;
        player.design.weapon = document.getElementById('cr-weapon').value;
        player.design.hairColor = document.getElementById('cr-hair-color').value;
        player.design.outfitColor = document.getElementById('cr-outfit-color').value;
        player.design.auraColor = document.getElementById('cr-aura-color').value;

        player.motionType = document.getElementById('cr-motion').value;
        player.vfxElement = document.getElementById('cr-vfx').value;
        player.skillName = document.getElementById('cr-skill-name').value.trim() || "⚡ 蒼雷・神速烈空閃 ⚡";

        player.atkScale = stats.calcAtk;
        player.attackRange = stats.calcRange;
        player.stunPower = stats.calcStun;
        player.atkSpeed = stats.calcAtkSpd;
        player.speed = stats.calcSpd;
        player.specialRange = Number((player.attackRange * 3.1).toFixed(1));
        player.gambits = readGambitsFromUI();

        player.archetype = determinePlayerArchetype(
            stats.ptAtk, stats.ptRange, stats.ptStun, stats.ptAtkSpd, stats.ptSpd, player.motionType
        );

        // 外部VRMから自作デザインへ戻す場合はクリーンアップ
        if (player.vrm) {
            player.animPivot.remove(player.vrm.scene);
            VRMUtils.deepDispose(player.vrm.scene);
            player.vrm = null;
        }
        if (player.customGlb) {
            player.animPivot.remove(player.customGlb);
            player.customGlb = null;
        }
        player.isVrm = false;
        player.customJoints = null;

        rebuildPlayerModelFromDesign();
        updatePlayerSpecHud();

        document.getElementById('player-name').innerText = player.design.name;
        spawnGroundSlamVFX(player.position, player.themeColor, 1.1);

        if (lockRegistration) {
            lockCustomCharacterSlot(player.design.name);
            modal.style.display = 'none';
            showAnnouncement(`🚀 ${player.design.name} 出撃ロック完了！(敗北するまで変更不可)`, "#00f2fe");
        } else {
            modal.style.display = 'none';
            showAnnouncement(`✨ プレビュー反映完了！`, "#ffd32a");
        }
    }

    openBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
    avatarFrame.addEventListener('click', () => { modal.style.display = 'flex'; });
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    previewBtn.addEventListener('click', () => applyStudioSettingsToPlayer(false));
    lockBtn.addEventListener('click', () => applyStudioSettingsToPlayer(true));

    // D&D ＆ 外部ファイル（.vrm / .glb / .png）導入
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('vrm-file-input');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
        dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
    });
    dropArea.addEventListener('drop', e => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleExternalFileImport(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files.length > 0) {
            handleExternalFileImport(e.target.files[0]);
            fileInput.value = '';
        }
    });
    document.querySelectorAll('.dock-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const vrmPath = btn.getAttribute('data-vrm');
            if (vrmPath) loadExternalModelFromUrl(vrmPath, vrmPath.split('/').pop());
        });
    });

    syncSlidersAndCalculateStats();
    updatePlayerSpecHud();
}

/**
 * 出撃登録（is_active = true）: 連勝中・生存中は一切の変更・解除をロック！
 */
function lockCustomCharacterSlot(charName) {
    player.is_active = true;
    player.isCustomCharLocked = true;
    player.registeredCharName = charName;

    const badge = document.getElementById('slot-limit-badge');
    if (badge) {
        badge.innerText = `🔒 出撃ロック中 (敗北まで変更不可)`;
        badge.classList.add('locked');
    }
    const regLabel = document.getElementById('registered-char-label');
    if (regLabel) {
        regLabel.innerText = `${charName} (サバイバル出撃中・変更不可)`;
        regLabel.style.color = '#ffd32a';
    }
    const previewBtn = document.getElementById('btn-apply-preview');
    const lockBtn = document.getElementById('btn-lock-register');
    if (previewBtn) previewBtn.disabled = true;
    if (lockBtn) {
        lockBtn.innerText = `🔒 出撃中: ${charName} (敗北するまで変更不可)`;
        lockBtn.disabled = true;
    }
}

/**
 * 敗北時（引退時）のみ呼ばれるロック解除処理 (is_active = false)
 */
function unlockCharacterOnDefeat() {
    player.is_active = false;
    player.isCustomCharLocked = false;

    const badge = document.getElementById('slot-limit-badge');
    if (badge) {
        badge.innerText = `🟢 編成可能 (引退によりロック解除)`;
        badge.classList.remove('locked');
    }
    const regLabel = document.getElementById('registered-char-label');
    if (regLabel) {
        regLabel.innerText = `新キャラ作成・変更可能`;
        regLabel.style.color = '#7bed9f';
    }
    const previewBtn = document.getElementById('btn-apply-preview');
    const lockBtn = document.getElementById('btn-lock-register');
    if (previewBtn) previewBtn.disabled = false;
    if (lockBtn) {
        lockBtn.innerText = `🚀 このオリキャラで出撃登録する（負けるまで変更不可！）`;
        lockBtn.disabled = false;
    }
}

/**
 * 自分を倒した敵（CPU/ゴースト）のAIガンビット＆ステータス配分を1タップでコピーしてスタジオを開く
 */
function copyEnemyBuildAndOpenStudio() {
    unlockCharacterOnDefeat();
    const boss = cpu.bossInfo || CPU_BOSS_TYPES[0];
    const presetSliders = boss.presetSliders || { atk: 24, range: 24, stun: 24, atkspd: 14, spd: 14 };
    const presetGambits = boss.presetGambits || [
        { cond: "sp_50", act: "ult_ex" },
        { cond: "enemy_stun", act: "skill_arts" },
        { cond: "always", act: "atk_rush" }
    ];

    document.getElementById('sl-atk').value = presetSliders.atk;
    document.getElementById('sl-range').value = presetSliders.range;
    document.getElementById('sl-stun').value = presetSliders.stun;
    document.getElementById('sl-atkspd').value = presetSliders.atkspd;
    document.getElementById('sl-spd').value = presetSliders.spd;

    if (presetGambits[0]) {
        document.getElementById('ai-cond-1').value = presetGambits[0].cond;
        document.getElementById('ai-act-1').value = presetGambits[0].act;
    }
    if (presetGambits[1]) {
        document.getElementById('ai-cond-2').value = presetGambits[1].cond;
        document.getElementById('ai-act-2').value = presetGambits[1].act;
    }
    if (presetGambits[2]) {
        document.getElementById('ai-cond-3').value = presetGambits[2].cond;
        document.getElementById('ai-act-3').value = presetGambits[2].act;
    }

    document.getElementById('cr-name').value = `${boss.name.split('・')[0]}継承者`;
    if (studioSyncSlidersFn) studioSyncSlidersFn();

    document.getElementById('result-modal').style.display = 'none';
    resetGame();
    document.getElementById('creator-modal').style.display = 'flex';
    showAnnouncement(`⚡ 強敵「${boss.name}」のAI＆ステ構成をコピーしました！`, "#00f2fe");
}

function updatePlayerSpecHud() {
    const specEl = document.getElementById('player-spec-tag');
    if (specEl) {
        specEl.innerText = `⚔️ATK:${player.atkScale.toFixed(2)}x | 📏範囲:${player.attackRange.toFixed(1)}m | 💫崩し:${player.stunPower.toFixed(2)}x | ⚡攻速:${player.atkSpeed.toFixed(2)}x`;
    }
    const archEl = document.getElementById('player-archetype-badge');
    if (archEl) {
        const info = ARCHETYPE_INFO[player.archetype] || ARCHETYPE_INFO.speed_assassin;
        archEl.innerText = info.label;
        archEl.style.color = info.color;
    }
}

function handleExternalFileImport(file) {
    if (player.isCustomCharLocked) {
        alert(`⚠️ オリキャラの導入は【1人1体まで】です！\n現在の登録キャラ: ${player.registeredCharName}`);
        return;
    }
    const lower = file.name.toLowerCase();
    const blobUrl = URL.createObjectURL(file);
    if (lower.endsWith('.vrm') || lower.endsWith('.glb')) {
        loadExternalModelFromUrl(blobUrl, file.name);
    } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        const texLoader = new THREE.TextureLoader();
        texLoader.load(blobUrl, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            if (player.mesh) {
                player.mesh.traverse(c => {
                    if (c.isMesh && c.name !== "AnimeOutline") {
                        c.material = c.material.clone();
                        c.material.map = tex;
                        c.material.needsUpdate = true;
                    }
                });
            }
            const name = file.name.replace(/\.(png|jpg|jpeg)$/i, '');
            document.getElementById('player-name').innerText = name;
            lockCustomCharacterSlot(name);
            document.getElementById('creator-modal').style.display = 'none';
            showAnnouncement(`🔒 ${name} を1人1体枠に登録しました！`, "#ffd32a");
        });
    }
}

function loadExternalModelFromUrl(url, fileName) {
    if (player.isCustomCharLocked) {
        alert(`⚠️ オリキャラの導入は【1人1体まで】です！\n現在の登録キャラ: ${player.registeredCharName}`);
        return;
    }
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'flex';
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    loader.load(url, gltf => {
        const vrm = gltf.userData.vrm;
        const modelRoot = vrm ? vrm.scene : gltf.scene;
        if (player.mesh) player.mesh.visible = false;
        if (player.vrm) player.animPivot.remove(player.vrm.scene);
        if (player.customGlb) player.animPivot.remove(player.customGlb);

        modelRoot.traverse(obj => {
            if (obj.isMesh) {
                addAnimeOutline(obj, 0.018);
            }
        });

        const isPreset = fileName.includes('valkyrie_seraph') || fileName.includes('crimson_samurai') || fileName.includes('golden_brawler');
        player.isCustomRig = isPreset;
        player.isVrm = true;
        if (vrm) {
            player.vrm = vrm;
            vrm.scene.rotation.y = isPreset ? 0 : Math.PI;
            player.animPivot.add(vrm.scene);
        } else {
            player.customGlb = modelRoot;
            player.animPivot.add(modelRoot);
        }

        const metaName = vrm?.meta?.name || fileName.replace(/\.(vrm|glb)$/i, '');
        document.getElementById('player-name').innerText = metaName;
        lockCustomCharacterSlot(metaName);
        overlay.style.display = 'none';
        document.getElementById('creator-modal').style.display = 'none';
        spawnGroundSlamVFX(player.position, player.themeColor, 1.2);
        showAnnouncement(`🔒 ${metaName} 参戦！(1/1体ロック)`, "#00f2fe");
    }, null, () => {
        overlay.style.display = 'none';
    });
}

// ========================================================
// 9. 多層3D技エフェクト（VFX）エンジン（属性別・技範囲連動スケール）
// ========================================================
function getVfxPalette() {
    switch (player.vfxElement) {
        case "flame_crimson": return { main: 0xff3838, sub: 0xffbe0b, core: 0xffffff };
        case "holy_astral":   return { main: 0xfff200, sub: 0x70a1ff, core: 0xffffff };
        case "void_gravity":  return { main: 0x9b59b6, sub: 0x00d2d3, core: 0xf5f6fa };
        default:              return { main: 0x00f2fe, sub: 0xffdd59, core: 0xffffff };
    }
}

function spawnDamageNumber(x, y, z, damage, type = "normal", labelPrefix = "") {
    const layer = document.getElementById('damage-numbers-layer');
    if (!layer) return;

    const pos = new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, y + 1.5, z + (Math.random() - 0.5) * 0.6);
    pos.project(camera);
    const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

    const elem = document.createElement('div');
    elem.className = `floating-dmg ${type}`;
    elem.innerText = labelPrefix ? `${labelPrefix} ${damage}` : damage;
    elem.style.left = `${screenX}px`;
    elem.style.top = `${screenY}px`;
    layer.appendChild(elem);

    setTimeout(() => {
        if (elem.parentNode) elem.parentNode.removeChild(elem);
    }, 780);
}

/**
 * 技範囲（player.attackRange）に比例してスケールする3重クレセント斬撃波
 */
function spawnCrescentSlash(origin, targetPos, colorHex, comboStep = 1, rangeScale = 1.0) {
    const vfxGroup = new THREE.Group();
    vfxGroup.position.copy(origin).add(new THREE.Vector3(0, 1.1 + player.airY, 0));
    vfxGroup.lookAt(targetPos.x, 1.1 + cpu.airY, targetPos.z);

    if (comboStep === 1) vfxGroup.rotateZ(Math.PI * 0.20);
    else if (comboStep === 2) vfxGroup.rotateX(Math.PI * 0.46);
    else vfxGroup.rotateY(Math.PI * 0.48);

    const arcRadius = (comboStep === 3 ? 1.55 : 1.25) * rangeScale;
    const arcSpan = comboStep === 2 ? Math.PI * 1.7 : Math.PI * 1.2;

    const outerGeo = new THREE.RingGeometry(arcRadius * 0.52, arcRadius, 28, 1, 0, arcSpan);
    const outerMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);

    const coreGeo = new THREE.RingGeometry(arcRadius * 0.76, arcRadius * 0.95, 28, 1, 0, arcSpan * 0.9);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 1.0 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.z = 0.01;

    vfxGroup.add(outerMesh, coreMesh);
    scene.add(vfxGroup);

    const forwardDir = new THREE.Vector3().subVectors(targetPos, origin).setY(0).normalize();
    effectsList.push({
        mesh: vfxGroup,
        life: 0.25,
        maxLife: 0.25,
        update: (dt, item) => {
            const r = item.life / item.maxLife;
            item.mesh.position.addScaledVector(forwardDir, dt * 6.5);
            item.mesh.scale.multiplyScalar(1.0 + dt * 3.5);
            outerMesh.rotation.z += dt * 14;
            coreMesh.rotation.z += dt * 14;
            outerMat.opacity = r * 0.9;
            coreMat.opacity = r;
        }
    });
}

/**
 * 攻撃ヒット時のアニメ調サンバースト閃光 ＆ 物理火花スパーク (画像2下段のインパクト閃光再現)
 */
function spawnHitSparks(hitPos, colorHex = 0xffbe0b, count = 36) {
    const container = new THREE.Group();
    container.position.copy(hitPos).add(new THREE.Vector3(0, 1.15 + cpu.airY, 0));
    scene.add(container);

    const flashMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 })
    );
    const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.95, 16),
        new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0 })
    );
    ringMesh.lookAt(camera.position);
    container.add(flashMesh, ringMesh);

    const sparks = [];
    const sparkGeo = new THREE.ConeGeometry(0.045, 0.45, 5);
    sparkGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffffff : colorHex, transparent: true, opacity: 1.0 });
        const sp = new THREE.Mesh(sparkGeo, mat);
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.25) * Math.PI;
        const spd = 6.0 + Math.random() * 11.0;
        const vel = new THREE.Vector3(Math.cos(phi) * Math.cos(theta) * spd, Math.sin(phi) * spd + 2.5, Math.cos(phi) * Math.sin(theta) * spd);
        sp.lookAt(vel);
        container.add(sp);
        sparks.push({ mesh: sp, vel, mat });
    }

    effectsList.push({
        mesh: container,
        life: 0.34,
        maxLife: 0.34,
        update: (dt, item) => {
            const ratio = item.life / item.maxLife;
            flashMesh.scale.multiplyScalar(1.0 + dt * 6.0);
            flashMesh.material.opacity = Math.max(0, (ratio - 0.4) * 1.6);
            ringMesh.scale.multiplyScalar(1.0 + dt * 11.0);
            ringMesh.material.opacity = ratio;
            sparks.forEach(s => {
                s.vel.y -= 24.0 * dt;
                s.mesh.position.addScaledVector(s.vel, dt);
                s.mat.opacity = ratio;
            });
        }
    });
}

function spawnGroundSlamVFX(pos, colorHex = 0xffbe0b, scale = 1.0) {
    const group = new THREE.Group();
    group.position.set(pos.x, 0.05, pos.z);
    scene.add(group);

    const waveMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.3 * scale, 0.85 * scale, 32), waveMat);
    wave.rotation.x = -Math.PI / 2;

    const pillarMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.75 });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * scale, 0.9 * scale, 5.5 * scale, 16, 1, true), pillarMat);
    pillar.position.y = 2.75 * scale;

    group.add(wave, pillar);

    effectsList.push({
        mesh: group,
        life: 0.45,
        maxLife: 0.45,
        update: (dt, item) => {
            const ratio = item.life / item.maxLife;
            wave.scale.addScalar(dt * 12.0 * scale);
            waveMat.opacity = ratio;
            pillar.scale.x = 1.0 + (1.0 - ratio) * 1.4;
            pillar.scale.z = 1.0 + (1.0 - ratio) * 1.4;
            pillarMat.opacity = ratio * 0.75;
        }
    });
}

function spawnFootstepDust(pos, scale = 1.0) {
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xd8c395, transparent: true, opacity: 0.55 });
    const dust = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 * scale, 0), dustMat);
    dust.position.set(pos.x + (Math.random() - 0.5) * 0.4, 0.12, pos.z + (Math.random() - 0.5) * 0.4);
    scene.add(dust);

    effectsList.push({
        mesh: dust,
        life: 0.38,
        maxLife: 0.38,
        update: (dt, item) => {
            item.mesh.position.y += dt * 1.1;
            item.mesh.scale.addScalar(dt * 3.0);
            dustMat.opacity = (item.life / item.maxLife) * 0.5;
        }
    });
}

function spawnAfterimageGhost(entity, colorHex = 0x00f2fe) {
    const ghostMat = new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true, transparent: true, opacity: 0.6 });
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 1.35, 10), ghostMat);
    g.position.copy(entity.position).add(new THREE.Vector3(0, 0.9 + entity.airY, 0));
    scene.add(g);

    effectsList.push({
        mesh: g,
        life: 0.32,
        maxLife: 0.32,
        update: (dt, item) => {
            ghostMat.opacity = (item.life / item.maxLife) * 0.6;
        }
    });
}

// ========================================================
// 10. ひるみ（Hit-Stun）＆ 打ち上げ ＆ 連続コンボチェインシステム
// ========================================================
function addCombo(hits, damage) {
    comboHits += hits;
    comboDamage += damage;
    if (comboHits > battleStats.maxCombo) {
        battleStats.maxCombo = comboHits;
    }

    const rightDisp = document.getElementById('combo-display');
    const leftDisp = document.getElementById('combo-display-left');
    document.getElementById('combo-hits-num').innerText = comboHits;
    document.getElementById('combo-hits-left').innerText = comboHits;
    document.getElementById('combo-damage-num').innerText = comboDamage;

    rightDisp.classList.add('active');
    leftDisp.classList.add('active');

    if (comboResetTimer) clearTimeout(comboResetTimer);
    comboResetTimer = setTimeout(() => {
        rightDisp.classList.remove('active');
        leftDisp.classList.remove('active');
        comboHits = 0;
        comboDamage = 0;
    }, 2400);
}

/**
 * プレイヤーの通常攻撃 3系統（⚡連撃 rush / ⚔️広範囲斬撃 wide / 🗡️打ち上げ強攻撃 launch）
 */
function performPlayerAttack(subType = "rush") {
    if (!isGameActive) return;
    if (player.state === "special" || player.state === "down") return;

    const cancelWindow = 0.16 / player.atkSpeed;
    if ((player.state === "attack" || player.state === "skill") && player.stateTimer > cancelWindow) return;

    player.attackSubType = subType;
    player.comboStep = (player.comboStep % 4) + 1;
    player.state = "attack";

    const baseDur = subType === "launch" ? 0.46 : (subType === "wide" ? 0.38 : 0.28);
    player.stateDuration = baseDur / player.atkSpeed;
    player.stateTimer = player.stateDuration;

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();
    player.rotationY = Math.atan2(toCpu.x, toCpu.z);

    const lunge = subType === "launch" ? 7.5 : (subType === "wide" ? 6.0 : 5.0);
    player.velocity.copy(toCpu.clone().normalize().multiplyScalar(lunge));
    spawnFootstepDust(player.position, 1.5);

    const pal = getVfxPalette();
    const rangeRatio = player.attackRange / 3.1;

    if (player.motionType === "magic_shooter") {
        spawnMagicProjectile(player.position, toCpu.clone().normalize(), pal.main, subType);
    }

    spawnCrescentSlash(player.position, cpu.position, subType === "launch" ? pal.sub : pal.main, player.comboStep, rangeRatio);

    const effectiveRange = player.attackRange * (subType === "wide" ? 1.15 : (subType === "launch" ? 1.05 : 1.0));
    if (dist <= effectiveRange) {
        const rawDmg = subType === "launch" ? 95 : (subType === "wide" ? 68 : 46);
        const isFinisher = player.comboStep === 4 || subType === "launch";
        const archMult = getArchetypeMultiplier(player.archetype, cpu.archetype);
        let finalDmg = Math.round(rawDmg * player.atkScale * archMult * (1 + comboHits * 0.03));

        const poiseDamage = (subType === "launch" ? 48 : (subType === "wide" ? 30 : 22)) * player.stunPower * archMult;
        cpu.poise = Math.max(0, cpu.poise - poiseDamage);

        if (cpu.isGuarding && subType !== "launch" && cpu.poise > 0) {
            finalDmg = Math.floor(finalDmg * 0.2);
            spawnHitSparks(cpu.position, 0x70a1ff, 18);
            spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, finalDmg, "guard", "GUARD");
        } else {
            cpu.isGuarding = false;
            const stunDuration = (subType === "launch" ? 0.85 : 0.52) * player.stunPower;
            cpu.stunTimer = stunDuration;
            cpu.aiTimer = Math.max(cpu.aiTimer, stunDuration + 0.15);
            battleStats.stunsInflicted++;

            if (subType === "launch" || (player.comboStep === 4 && player.airY <= 0.1)) {
                cpu.state = "launched";
                cpu.stateDuration = stunDuration;
                cpu.stateTimer = stunDuration;
                cpu.airVelY = 7.8;
                cpu.velocity.add(toCpu.clone().normalize().multiplyScalar(3.5));
                spawnGroundSlamVFX(cpu.position, pal.sub, 1.1);
                spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, finalDmg, "crit", archMult > 1 ? "WEAK! LAUNCH!" : "LAUNCH!");
            } else {
                cpu.state = "stunned";
                cpu.stateDuration = stunDuration;
                cpu.stateTimer = stunDuration;
                if (cpu.airY > 0.1) {
                    cpu.airVelY = Math.max(cpu.airVelY, 2.8);
                }
                cpu.velocity.add(toCpu.clone().normalize().multiplyScalar(2.4));
                spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, finalDmg, isFinisher ? "crit" : "stun", archMult > 1 ? "相性有利!" : (comboHits >= 2 ? "STUN!" : ""));
            }

            cameraShakeIntensity = isFinisher ? 0.38 : 0.16;
            hitStopTimer = isFinisher ? 0.065 : 0.03;
            spawnHitSparks(cpu.position, pal.sub, isFinisher ? 48 : 30);
        }

        applyDamage('cpu', finalDmg);
        addCombo(1, finalDmg);
        player.sp = Math.min(player.maxSp, player.sp + 10);
        updateGauges();
    }
}

/**
 * 魔導シューター型・遠距離ホーミング魔弾
 */
function spawnMagicProjectile(startPos, dir, colorHex, subType) {
    const orbGeo = new THREE.OctahedronGeometry(subType === "launch" ? 0.38 : 0.24, 1);
    const orbMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const mesh = new THREE.Mesh(orbGeo, orbMat);
    mesh.position.copy(startPos).add(new THREE.Vector3(0, 1.2 + player.airY, 0));
    scene.add(mesh);

    projectilesList.push({
        mesh,
        vel: dir.clone().multiplyScalar(18.0),
        life: 0.75,
        colorHex,
        subType
    });
}

/**
 * 🔥 固有スキル技 (SKILLボタン / O・Fキー / SP 20消費)
 */
function performSkillArts() {
    if (!isGameActive) return;
    if (player.sp < 20) {
        if (!isAutoBattle) showAnnouncement("SP 20% 必要です！", "#ff4757");
        return;
    }
    if (player.state === "special" || player.state === "down") return;

    player.sp -= 20;
    battleStats.skillsUsed++;
    player.state = "skill";
    player.stateDuration = 0.62 / player.atkSpeed;
    player.stateTimer = player.stateDuration;

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();
    player.rotationY = Math.atan2(toCpu.x, toCpu.z);
    player.velocity.copy(toCpu.clone().normalize().multiplyScalar(10.5));

    const pal = getVfxPalette();
    spawnGroundSlamVFX(player.position, pal.main, 1.2);
    spawnCrescentSlash(player.position, cpu.position, pal.main, 2, (player.attackRange / 3.1) * 1.35);

    const archMult = getArchetypeMultiplier(player.archetype, cpu.archetype);
    if (dist <= player.attackRange * 1.45) {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (!isGameActive) return;
                const hitDmg = Math.round(52 * player.atkScale * archMult);
                cpu.state = "stunned";
                cpu.stunTimer = 0.65 * player.stunPower;
                cpu.stateTimer = cpu.stunTimer;
                battleStats.stunsInflicted++;
                if (i === 2) cpu.airVelY = 5.5;
                spawnHitSparks(cpu.position, i % 2 === 0 ? pal.main : pal.sub, 32);
                spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, hitDmg, "crit", "SKILL!");
                applyDamage('cpu', hitDmg);
                addCombo(1, hitDmg);
                cameraShakeIntensity = 0.28;
            }, i * 110);
        }
    }
    updateGauges();
}

/**
 * 🌟 必殺奥義 EX (SP 50消費)
 */
function performPlayerSpecial() {
    if (!isGameActive) return;
    if (player.sp < 50) {
        if (!isAutoBattle) showAnnouncement("SP 50% 必要です！", "#ff4757");
        return;
    }
    if (player.state === "special" || player.state === "down") return;

    player.sp -= 50;
    battleStats.skillsUsed++;
    updateGauges();

    player.state = "special";
    player.stateDuration = 1.25;
    player.stateTimer = 1.25;
    player.isInvincible = true;
    player.velocity.set(0, 0, 0);

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    player.rotationY = Math.atan2(toCpu.x, toCpu.z);

    const pal = getVfxPalette();
    spawnGroundSlamVFX(player.position, pal.main, 1.4);
    cinematicCameraMode = "zoom_player";

    const cutin = document.getElementById('special-cutin');
    document.getElementById('cutin-char').innerText = player.design.name;
    document.getElementById('cutin-skill').innerText = player.skillName;
    cutin.classList.add('active');

    const archMult = getArchetypeMultiplier(player.archetype, cpu.archetype);

    setTimeout(() => {
        cutin.classList.remove('active');
        cinematicCameraMode = "action_wide";

        spawnGroundSlamVFX(cpu.position, pal.main, 2.2);
        spawnGroundSlamVFX(cpu.position, pal.sub, 1.6);

        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                if (!isGameActive) return;
                const partDmg = Math.round(78 * player.atkScale * archMult);
                spawnHitSparks(cpu.position, i % 2 === 0 ? pal.main : pal.sub, 45);
                spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, partDmg, "crit", i === 4 ? "FINISH!!" : "EX!");
                applyDamage('cpu', partDmg);
                addCombo(1, partDmg);
            }, i * 85);
        }

        cameraShakeIntensity = 0.75;
        hitStopTimer = 0.10;
        cpu.velocity.add(toCpu.normalize().multiplyScalar(14.0));
        cpu.airVelY = 6.5;
        cpu.state = "down";
        cpu.stateDuration = 1.2;
        cpu.stateTimer = 1.2;

        setTimeout(() => {
            cinematicCameraMode = null;
            player.isInvincible = false;
        }, 620);
    }, 480);
}

function performPlayerDodge() {
    if (!isGameActive) return;
    if (player.sp < 15 || player.state === "special" || player.state === "down") return;

    player.sp -= 15;
    updateGauges();

    player.state = "dodge";
    player.stateDuration = 0.28;
    player.stateTimer = 0.28;
    player.isInvincible = true;

    let dir = new THREE.Vector3(input.moveX, 0, input.moveZ);
    if (dir.lengthSq() < 0.01) {
        dir.set(-Math.sin(player.rotationY), 0, -Math.cos(player.rotationY));
    } else {
        dir.normalize();
    }
    player.velocity.copy(dir.multiplyScalar(player.speed * 2.1));

    const pal = getVfxPalette();
    spawnAfterimageGhost(player, pal.main);
    setTimeout(() => spawnAfterimageGhost(player, pal.main), 70);
    setTimeout(() => { player.isInvincible = false; }, 280);
}

function performPlayerJump() {
    if (!isGameActive || player.airY > 0.05 || player.state === "special" || player.state === "down") return;
    player.airVelY = 7.6;
    player.state = "jump";
    player.stateDuration = 0.55;
    player.stateTimer = 0.55;
    spawnFootstepDust(player.position, 1.6);
}

// ========================================================
// 11. ダメージ ＆ ラウンド進行管理（5連勝ごとの生存報告 ＆ 敗北時の名誉引退）
// ========================================================
function applyDamage(target, amount) {
    if (target === 'cpu') {
        const dealt = Math.min(cpu.hp, Math.round(amount));
        battleStats.damageDealt += dealt;
        cpu.hp = Math.max(0, cpu.hp - dealt);
        updateGauges();
        if (cpu.hp <= 0 && isGameActive) {
            handleVictory();
        }
    } else {
        if (player.isInvincible) return;
        let finalDmg = Math.round(amount);
        if (player.isGuarding) {
            finalDmg = Math.floor(amount * 0.15);
            player.sp = Math.min(player.maxSp, player.sp + 14);
            spawnHitSparks(player.position, 0x00f2fe, 20);
            spawnDamageNumber(player.position.x, player.position.y, player.position.z, finalDmg, "guard", "GUARD");
        } else {
            cameraShakeIntensity = 0.30;
            spawnHitSparks(player.position, 0xff3838, 35);
            spawnDamageNumber(player.position.x, player.position.y, player.position.z, finalDmg, "normal");
            player.state = "damaged";
            player.stateDuration = 0.34;
            player.stateTimer = 0.34;
        }
        battleStats.damageTaken += finalDmg;
        player.hp = Math.max(0, player.hp - finalDmg);
        updateGauges();
        if (player.hp <= 0 && isGameActive) {
            handleGameOver();
        }
    }
}

function updateGauges() {
    const pHpPct = (player.hp / player.maxHp) * 100;
    document.getElementById('player-hp-bar').style.width = `${pHpPct}%`;
    document.getElementById('player-hp-delay').style.width = `${pHpPct}%`;
    document.getElementById('player-hp-text').innerText = `${player.hp} / ${player.maxHp}`;

    const pSpPct = (player.sp / player.maxSp) * 100;
    document.getElementById('player-sp-bar').style.width = `${pSpPct}%`;
    document.getElementById('player-sp-text').innerText = `SP ${Math.floor(player.sp)}%`;

    const cHpPct = (cpu.hp / cpu.maxHp) * 100;
    document.getElementById('cpu-hp-bar').style.width = `${cHpPct}%`;
    document.getElementById('cpu-hp-delay').style.width = `${cHpPct}%`;
    document.getElementById('cpu-hp-text').innerText = `${cpu.hp} / ${cpu.maxHp}`;

    const cPoisePct = (cpu.poise / cpu.maxPoise) * 100;
    document.getElementById('cpu-sp-bar').style.width = `${cPoisePct}%`;
    document.getElementById('cpu-stun-text').innerText = cpu.stunTimer > 0 ? `😵 ひるみ中!` : `体幹 ${Math.round(cPoisePct)}%`;
}

function showAnnouncement(text, color = "#ffd32a") {
    const elem = document.getElementById('battle-announcement');
    elem.innerText = text;
    elem.style.color = color;
    elem.classList.remove('active');
    void elem.offsetWidth;
    elem.classList.add('active');
    setTimeout(() => elem.classList.remove('active'), 1700);
}

function handleVictory() {
    isGameActive = false;
    isKoSlowMo = true;
    slowMoTimer = 1.25;
    spawnGroundSlamVFX(cpu.position, 0xffd32a, 2.0);
    showAnnouncement("K.O. !! 🏆 ROUND CLEAR!", "#ffd32a");

    // 1勝目達成時点で、未ロックなら自動的にサバイバル出撃ロック（is_active = true）を有効化
    if (!player.is_active) {
        lockCustomCharacterSlot(player.design.name);
    }

    currentWins++;
    document.getElementById('current-wins').innerText = currentWins;
    document.getElementById('round-num-val').innerText = currentWins + 1;

    if (currentWins > highScore) {
        highScore = currentWins;
        localStorage.setItem("battle_high_score", highScore);
        document.getElementById('high-score').innerText = highScore;
    }

    // 5連勝ごと（5, 10, 15...連勝）に「生存報告（マウント）ポップアップ」を表示！
    if (currentWins > 0 && currentWins % 5 === 0) {
        setTimeout(() => {
            document.getElementById('milestone-wins-num').innerText = currentWins;
            document.getElementById('milestone-char-desc').innerText =
                `愛機「${player.design.name}」(${ARCHETYPE_INFO[player.archetype]?.label || 'カスタム型'}) が無敗で ${currentWins} 連勝を突破！SNSに生存報告して挑戦者を募ろう！`;
            document.getElementById('milestone-modal').style.display = 'flex';
        }, 1600);
    } else {
        setTimeout(() => spawnNextCpu(), 2000);
    }
}

function handleGameOver() {
    isGameActive = false;
    player.state = "down";
    player.stateDuration = 2.0;
    player.stateTimer = 2.0;
    showAnnouncement("DEFEATED... 💀 名誉の引退", "#ff4757");

    if (currentWins > highScore) {
        highScore = currentWins;
        localStorage.setItem("battle_high_score", highScore);
        document.getElementById('high-score').innerText = highScore;
    }

    // 【重要】敗北した瞬間のみ is_active = false となり、キャラ変更ロックが解除される！
    unlockCharacterOnDefeat();

    const boss = cpu.bossInfo || CPU_BOSS_TYPES[0];
    const epitaph = `【引退】「${player.design.name}」、強敵「${boss.name}」の前に散る。通算 ${currentWins} 連勝。我が戦いに悔いなし！`;

    // 敗因アナリティクス診断メッセージ作成
    const enemyArchInfo = ARCHETYPE_INFO[cpu.archetype] || ARCHETYPE_INFO.one_shot_buster;
    const counterArchKey = Object.keys(ARCHETYPE_INFO).find(k => ARCHETYPE_INFO[k].beats === cpu.archetype) || "speed_assassin";
    const counterArchInfo = ARCHETYPE_INFO[counterArchKey];

    const adviceHtml =
        `🔍 <strong>敗因レポート:</strong> 強敵「<strong>${boss.name}</strong>」は <strong>${enemyArchInfo.label}</strong> でした。<br>` +
        `💡 <strong>次回対策:</strong> 3すくみで有利な「<strong>${counterArchInfo.label}</strong>」にビルド変更するか、下のボタンで敵のAI＆ステータス構成を丸ごとコピーしてリベンジしましょう！`;

    setTimeout(() => {
        document.getElementById('retirement-epitaph').innerText = epitaph;
        document.getElementById('modal-wins').innerText = currentWins;
        document.getElementById('modal-high-score').innerText = highScore;
        document.getElementById('an-dmg-dealt').innerText = battleStats.damageDealt.toLocaleString();
        document.getElementById('an-dmg-taken').innerText = battleStats.damageTaken.toLocaleString();
        document.getElementById('an-stuns').innerText = `${battleStats.stunsInflicted}回 (最大${battleStats.maxCombo}Hit)`;
        document.getElementById('defeat-advice-box').innerHTML = adviceHtml;
        document.getElementById('result-modal').style.display = 'flex';
    }, 1350);
}

function spawnNextCpu() {
    let boss = CPU_BOSS_TYPES[currentWins % CPU_BOSS_TYPES.length];

    // URLパラメータ (?ghost=...) のSNS挑戦状ゴーストが乱入している場合（初戦）
    if (challengedGhostData && currentWins === 0) {
        boss = {
            ...CPU_BOSS_TYPES[0],
            name: `${challengedGhostData.name} (挑戦状ゴースト)`,
            ghostOwner: `🔥 ${challengedGhostData.streak || 5}連勝王者`,
            style: ARCHETYPE_INFO[challengedGhostData.arch]?.label || "💥 SNS挑戦者ゴースト",
            archetype: challengedGhostData.arch || "one_shot_buster",
            skinColor: 0x6c5ce7,
            armorColor: 0x2d3436,
            accentColor: 0x00f2fe,
            presetSliders: challengedGhostData.sliders || CPU_BOSS_TYPES[0].presetSliders,
            presetGambits: challengedGhostData.gambits || CPU_BOSS_TYPES[0].presetGambits
        };
    }

    cpu.bossInfo = boss;
    cpu.archetype = boss.archetype || "one_shot_buster";
    cpu.maxHp = Math.round(1000 * Math.pow(1.08, currentWins));
    cpu.hp = cpu.maxHp;
    cpu.maxPoise = Math.round(boss.poiseMax * Math.pow(1.04, currentWins));
    cpu.poise = cpu.maxPoise;
    cpu.stunTimer = 0;
    cpu.airY = 0;
    cpu.airVelY = 0;
    cpu.speed = Math.min(7.2, 4.6 + currentWins * 0.14);
    cpu.position.set(3.8, 0, -0.8);
    cpu.velocity.set(0, 0, 0);
    cpu.state = "idle";

    roundTimer = 99;
    document.getElementById('round-timer-val').innerText = roundTimer;
    document.getElementById('round-num-val').innerText = currentWins + 1;

    if (currentWins > 0) {
        player.hp = Math.min(player.maxHp, Math.round(player.hp + player.maxHp * 0.35));
    } else {
        player.hp = player.maxHp;
        battleStats.damageDealt = 0;
        battleStats.damageTaken = 0;
        battleStats.stunsInflicted = 0;
        battleStats.maxCombo = 0;
        battleStats.skillsUsed = 0;
    }
    player.sp = Math.min(player.maxSp, player.sp + 30);
    player.position.set(-3.8, 0, 0.8);
    player.airY = 0;
    player.airVelY = 0;
    player.velocity.set(0, 0, 0);
    player.state = "idle";

    document.getElementById('cpu-name').innerText = `Lv.${currentWins + 1} ${boss.name}`;
    document.getElementById('cpu-type').innerText = `${boss.ghostOwner || '@Ghost'} | ${boss.style}`;

    const cpuArchEl = document.getElementById('cpu-archetype-badge');
    if (cpuArchEl) {
        const info = ARCHETYPE_INFO[cpu.archetype] || ARCHETYPE_INFO.one_shot_buster;
        cpuArchEl.innerText = info.label;
        cpuArchEl.style.color = info.color;
    }

    setupCpuBossModel(boss);
    spawnGroundSlamVFX(cpu.position, boss.accentColor, 1.2);
    updateGauges();
    isGameActive = true;
    showAnnouncement(
        challengedGhostData && currentWins === 0
            ? `🔥 SNS挑戦状ゴースト「${challengedGhostData.name}」乱入！`
            : `ROUND ${currentWins + 1} - FIGHT!`,
        "#00f2fe"
    );
}

function resetGame() {
    currentWins = 0;
    document.getElementById('current-wins').innerText = currentWins;
    document.getElementById('result-modal').style.display = 'none';
    document.getElementById('milestone-modal').style.display = 'none';
    player.hp = player.maxHp;
    player.sp = 60;
    spawnNextCpu();
}

/**
 * X (旧Twitter) への「生存報告マウント」または「名誉の引退ポスト」共有（挑戦状URLつき）
 */
function shareOnX(mode = "retired") {
    const challengeUrl = buildChallengeUrl();
    const archLabel = ARCHETYPE_INFO[player.archetype]?.label || "⚡カスタム型";
    let text = "";

    if (mode === "survival") {
        text =
            `🔥【生存報告】現在 ${currentWins} 連勝中！！\n` +
            `愛機「${player.design.name}」(${archLabel} / ATK:${player.atkScale}x / 範囲:${player.attackRange}m) が無敗でサバイバル継続中！\n` +
            `「誰かこいつを止めてみろ！」👇このリンクから直接対戦！\n\n` +
            `#自作キャラバトル #アンリミテッドコロシアム`;
    } else {
        const bossName = cpu.bossInfo?.name || "強敵";
        text =
            `⚔️【引退】「${player.design.name}」、強敵「${bossName}」の前に散る。\n` +
            `通算 🔥【 ${currentWins} 連勝 】🔥 (${archLabel})\n` +
            `我が戦いに悔いなし！👇このキャラのゴーストに挑戦する\n\n` +
            `#自作キャラバトル #アンリミテッドコロシアム`;
    }

    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(challengeUrl)}`;
    window.open(xUrl, '_blank');
}

// ========================================================
// 11.5 🖼️ 公式額縁入り「連勝認定証＆キャラカード」Canvas画像ジェネレーター
// ========================================================
const GAMBIT_COND_LABELS = {
    sp_50: "SP50%以上",
    sp_20: "SP20%以上",
    enemy_stun: "敵がひるみ/浮き中",
    enemy_attack: "敵が攻撃モーション中",
    enemy_guard: "敵がガード固め中",
    hp_low: "自分HP35%以下",
    dist_near: "近距離間合い内",
    dist_far: "遠距離間合い外",
    always: "常時(デフォルト)"
};

const GAMBIT_ACT_LABELS = {
    ult_ex: "🌟必殺奥義EX",
    skill_arts: "🔥スキル技",
    atk_launch: "🗡️打ち上げ強攻撃",
    atk_wide: "⚔️広範囲なぎ払い",
    atk_rush: "⚡高速4連撃",
    guard_counter: "🛡️ガード固め",
    dodge_step: "💨無敵ステップ",
    approach: "🏃高速接近"
};

function renderCertificateCanvas(statusType = "SURVIVAL") {
    const canvas = document.getElementById('certificate-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;   // 960
    const H = canvas.height;  // 540

    // 1. リッチダーク背景グラデーション
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#070b19');
    bgGrad.addColorStop(0.5, '#101d38');
    bgGrad.addColorStop(1, '#090d1a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Blender 5.2 Cycles バトルショーケース画像を右半分背景にブレンド描画
    if (cyclesImages.showcase) {
        ctx.save();
        ctx.globalAlpha = 0.34;
        ctx.drawImage(cyclesImages.showcase, W * 0.32, 0, W * 0.68, H);
        ctx.restore();
    }

    // 3. 豪華な二重黄金額縁フレーム
    ctx.strokeStyle = '#ffd32a';
    ctx.lineWidth = 5;
    ctx.strokeRect(16, 16, W - 32, H - 32);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, W - 52, H - 52);

    // 四隅のコーナーオーナメント
    const corners = [[16, 16], [W - 36, 16], [16, H - 36], [W - 36, H - 36]];
    ctx.fillStyle = '#ffd32a';
    corners.forEach(([cx, cy]) => ctx.fillRect(cx, cy, 20, 20));

    // 4. ヘッダー称号帯
    ctx.fillStyle = '#ffd32a';
    ctx.font = '900 18px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText('👑 UNLIMITED COLOSSEUM — OFFICIAL SURVIVAL RECORD (BLENDER 5.2 CYCLES)', 46, 62);

    // ステータスバッジ（生存中 or 名誉引退）
    const isRetired = statusType === "RETIRED";
    ctx.fillStyle = isRetired ? '#eb2f06' : '#00b894';
    ctx.fillRect(46, 78, 220, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 16px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(isRetired ? '📜 【名誉引退・最終戦績証】' : '🔥 【無敗サバイバル生存証】', 58, 101);

    // 5. キャラクター名 ＆ 3すくみタイプ
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 42px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(player.design.name, 46, 162);

    const archInfo = ARCHETYPE_INFO[player.archetype] || ARCHETYPE_INFO.speed_assassin;
    ctx.fillStyle = archInfo.color;
    ctx.font = '800 20px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(`${archInfo.label}  |  必殺奥義: ${player.skillName}`, 46, 196);

    // 6. 大迫力の連勝記録ボックス
    ctx.fillStyle = 'rgba(255, 211, 42, 0.14)';
    ctx.strokeStyle = '#ffd32a';
    ctx.lineWidth = 2.5;
    ctx.fillRect(46, 218, 430, 108);
    ctx.strokeRect(46, 218, 430, 108);

    ctx.fillStyle = '#ffd32a';
    ctx.font = '900 22px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(isRetired ? '通算サバイバル連勝記録' : '現在継続中の連勝記録', 66, 252);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 58px "Cinzel", "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(`${currentWins} WIN STREAK`, 66, 310);

    // 7. パラメータ配分バー (100PT)
    const statRows = [
        { label: `⚔️ 攻撃力 (${player.atkScale.toFixed(2)}x)`, ratio: (player.atkScale - 0.85) / 0.55, color: '#ff6b6b' },
        { label: `📏 技範囲 (${player.attackRange.toFixed(1)}m)`, ratio: (player.attackRange - 2.4) / 2.1, color: '#00f2fe' },
        { label: `💫 崩し力 (${player.stunPower.toFixed(2)}x)`, ratio: (player.stunPower - 0.80) / 0.70, color: '#ffd32a' },
        { label: `⚡ 攻撃速度 (${player.atkSpeed.toFixed(2)}x)`, ratio: (player.atkSpeed - 0.85) / 0.50, color: '#7bed9f' },
        { label: `👟 移動速度 (${player.speed.toFixed(1)})`, ratio: (player.speed - 5.2) / 2.8, color: '#a29bfe' }
    ];

    ctx.font = '800 15px "M PLUS Rounded 1c", sans-serif';
    statRows.forEach((row, idx) => {
        const y = 356 + idx * 30;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(row.label, 46, y);

        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(235, y - 13, 240, 14);
        ctx.fillStyle = row.color;
        ctx.fillRect(235, y - 13, Math.max(12, Math.min(1, row.ratio) * 240), 14);
    });

    // 8. 右側：Blender Cycles キャラクターポートレート ＆ AI作戦ガンビット一覧
    if (cyclesImages.heroPortrait) {
        ctx.save();
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 3;
        ctx.strokeRect(520, 68, 175, 175);
        ctx.drawImage(cyclesImages.heroPortrait, 520, 68, 175, 175);
        ctx.restore();
    }
    if (cyclesImages.oniPortrait) {
        ctx.save();
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 3;
        ctx.strokeRect(725, 68, 175, 175);
        ctx.drawImage(cyclesImages.oniPortrait, 725, 68, 175, 175);
        ctx.restore();
    }

    ctx.fillStyle = '#00f2fe';
    ctx.font = '900 18px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText('🧠 登録AI作戦ガンビット (AUTO LOGIC)', 520, 276);

    player.gambits.forEach((g, i) => {
        const gy = 310 + i * 44;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(520, gy - 24, 385, 34);
        ctx.strokeRect(520, gy - 24, 385, 34);

        ctx.fillStyle = '#ffd32a';
        ctx.font = '800 14px "M PLUS Rounded 1c", sans-serif';
        const cText = GAMBIT_COND_LABELS[g.cond] || g.cond;
        const aText = GAMBIT_ACT_LABELS[g.act] || g.act;
        ctx.fillText(`優先${i + 1}: [IF ${cText}] ➔ [${aText}]`, 532, gy - 2);
    });

    // 9. フッター刻印
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 13px "M PLUS Rounded 1c", sans-serif';
    const dateStr = new Date().toLocaleDateString('ja-JP');
    ctx.fillText(`総与ダメージ: ${battleStats.damageDealt.toLocaleString()} | 最大コンボ: ${battleStats.maxCombo} HIT | 発行日: ${dateStr}`, 520, 488);
}

function openCertificateModal(statusType = "SURVIVAL") {
    renderCertificateCanvas(statusType);
    document.getElementById('cert-modal').style.display = 'flex';
}

function downloadCertificatePng() {
    const canvas = document.getElementById('certificate-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `colosseum_${player.design.name}_${currentWins}wins.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// ========================================================
// 12. プレイヤー自動AI（IF+THEN ガンビット）＆ CPU AI ＆ 全身モーション補間
// ========================================================
function evaluateGambitCondition(condKey, dist) {
    switch (condKey) {
        case "sp_50":        return player.sp >= 50;
        case "sp_20":        return player.sp >= 20;
        case "enemy_stun":   return cpu.stunTimer > 0 || cpu.airY > 0.1 || cpu.state === "stunned" || cpu.state === "launched";
        case "enemy_attack": return cpu.state === "attack";
        case "enemy_guard":  return cpu.isGuarding;
        case "hp_low":       return player.hp <= player.maxHp * 0.35;
        case "dist_near":    return dist <= player.attackRange * 1.08;
        case "dist_far":     return dist > player.attackRange * 1.08;
        case "always":
        default:             return true;
    }
}

function executeGambitAction(actKey, dist, toCpu, dt) {
    input.guard = false;
    const dir = toCpu.clone().normalize();

    if (actKey === "ult_ex") {
        if (player.sp >= 50) {
            if (dist <= player.specialRange) {
                performPlayerSpecial();
                return true;
            } else {
                player.velocity.addScaledVector(dir, player.speed * dt * 7.2);
                return true;
            }
        }
        return false;
    }

    if (actKey === "skill_arts") {
        if (player.sp >= 20) {
            if (dist <= player.attackRange * 1.35) {
                performSkillArts();
                return true;
            } else {
                player.velocity.addScaledVector(dir, player.speed * dt * 7.2);
                return true;
            }
        }
        return false;
    }

    if (actKey === "guard_counter") {
        if (cpu.state === "attack" && dist < 3.6) {
            input.guard = true;
            return true;
        }
        if (dist <= player.attackRange * 1.05) {
            performPlayerAttack("launch");
            return true;
        }
    }

    if (actKey === "dodge_step") {
        if (player.sp >= 15) {
            performPlayerDodge();
            return true;
        }
        return false;
    }

    if (actKey === "approach") {
        if (dist > player.attackRange * 0.82) {
            player.velocity.addScaledVector(dir, player.speed * dt * 7.2);
            return true;
        }
        performPlayerAttack("rush");
        return true;
    }

    // 通常攻撃系 (atk_rush / atk_wide / atk_launch)
    const subType = actKey === "atk_launch" ? "launch" : (actKey === "atk_wide" ? "wide" : "rush");
    const reach = player.attackRange * (subType === "wide" ? 1.12 : 0.98);

    if (dist > reach) {
        player.velocity.addScaledVector(dir, player.speed * dt * 7.0);
        return true;
    } else {
        performPlayerAttack(subType);
        return true;
    }
}

/**
 * 3Dオート対戦（監督・軍師モード）: ユーザーが組んだ3つのガンビットを優先順に評価して自動戦闘！
 */
function updatePlayerAutoAI(dt) {
    if (!isAutoBattle || !isGameActive) return false;
    if (player.state === "special" || player.state === "down" || player.state === "damaged") return false;

    // 手動キー入力が入っている間は手動操作を優先
    if (Math.abs(input.moveX) > 0.05 || Math.abs(input.moveZ) > 0.05) return false;

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();
    player.rotationY = Math.atan2(toCpu.x, toCpu.z);

    player.aiDecisionTimer -= dt;
    if (player.aiDecisionTimer > 0 && player.state === "attack") return false;

    for (let i = 0; i < player.gambits.length; i++) {
        const g = player.gambits[i];
        if (evaluateGambitCondition(g.cond, dist)) {
            const prevVelSq = player.velocity.lengthSq();
            const acted = executeGambitAction(g.act, dist, toCpu, dt);
            if (acted) {
                player.aiDecisionTimer = 0.08 / player.atkSpeed;
                return player.velocity.lengthSq() > prevVelSq + 0.05;
            }
        }
    }
    return false;
}

function updateCpuAI(dt) {
    if (!isGameActive || cpu.state === "down") return;

    // 体幹自然回復
    cpu.poise = Math.min(cpu.maxPoise, cpu.poise + 8.0 * dt);

    // 😵 ひるみ中（Hit-Stun）や空中打ち上げ中は攻撃・移動できない！
    if (cpu.stunTimer > 0 || cpu.airY > 0.05) {
        cpu.stunTimer = Math.max(0, cpu.stunTimer - dt);
        cpu.isGuarding = false;
        return;
    }

    cpu.aiTimer -= dt;
    const toPlayer = new THREE.Vector3().subVectors(player.position, cpu.position);
    const dist = toPlayer.length();
    cpu.rotationY = Math.atan2(toPlayer.x, toPlayer.z);

    const atkScale = Math.pow(1.05, currentWins) * getArchetypeMultiplier(cpu.archetype, player.archetype);

    if (cpu.aiTimer <= 0) {
        cpu.aiTimer = Math.max(0.28, 0.62 - currentWins * 0.02) + Math.random() * 0.25;
        if (dist > 2.6) {
            cpu.aiAction = "chase";
        } else {
            const r = Math.random();
            if (r < 0.65) cpu.aiAction = "attack";
            else cpu.aiAction = "guard";
        }
    }

    cpu.isGuarding = false;
    if (cpu.aiAction === "chase") {
        cpu.velocity.add(toPlayer.clone().normalize().multiplyScalar(cpu.speed * dt * 5.2));
    } else if (cpu.aiAction === "attack" && cpu.state !== "attack") {
        cpu.comboStep = (cpu.comboStep % 3) + 1;
        cpu.state = "attack";
        cpu.stateDuration = 0.46;
        cpu.stateTimer = 0.46;
        cpu.velocity.add(toPlayer.clone().normalize().multiplyScalar(3.8));
        spawnCrescentSlash(cpu.position, player.position, 0xff3838, cpu.comboStep, 1.15);
        if (dist < 2.9 && cpu.stunTimer <= 0) {
            applyDamage('player', 58 * atkScale);
        }
    } else if (cpu.aiAction === "guard") {
        cpu.isGuarding = true;
    }
}

function updateFullBodyMotion(entity, dt, isMoving) {
    entity.animTime += dt * (isMoving ? 14.0 : 4.2);
    const t = entity.animTime;
    const pivot = entity.animPivot;
    const j = entity.customJoints || entity.joints || {};
    const dur = Math.max(0.01, entity.stateDuration || 0.35);
    const p = THREE.MathUtils.clamp(1.0 - (entity.stateTimer / dur), 0.0, 1.0);

    let py = entity.airY || 0;
    let rx = 0, ry = 0, rz = 0;
    let torsoY = 0;
    let lArmX = 0, lArmZ = 0.18, rArmX = 0, rArmZ = -0.18;
    let lLegX = 0, rLegX = 0;

    if (entity.state === "attack" || entity.state === "skill") {
        if (entity.attackSubType === "launch" || entity.comboStep === 3) {
            py += Math.sin(p * Math.PI) * 1.15;
            rx = -p * Math.PI * 2.0;
            rArmX = -2.4 + p * 3.1;
            lArmX = -1.8 + p * 2.5;
        } else if (entity.attackSubType === "wide" || entity.comboStep === 2) {
            ry = p * Math.PI * 2.0;
            rx = 0.20;
            rArmX = -1.4; rArmZ = -1.1;
            lArmX = -1.2; lArmZ = 1.0;
        } else {
            const sw = p < 0.25 ? -p * 2.0 : (p - 0.25) * 1.35;
            rx = 0.26;
            torsoY = THREE.MathUtils.lerp(-0.75, 0.95, Math.max(0, sw));
            rArmX = THREE.MathUtils.lerp(-2.2, 0.85, Math.max(0, sw));
            lLegX = -0.55; rLegX = 0.55;
        }
    } else if (entity.state === "stunned") {
        rx = -0.55 * Math.sin(p * Math.PI);
        rz = Math.sin(t * 8.0) * 0.18;
        rArmX = -0.9; lArmX = -0.9;
    } else if (entity.state === "launched") {
        rx = p * Math.PI * 2.0;
        rArmX = -1.4; lArmX = -1.4;
    } else if (entity.state === "down") {
        rx = -Math.PI * 0.46;
    } else if (entity.isGuarding) {
        py -= 0.12;
        lArmX = -1.2; lArmZ = -0.35;
        rArmX = -1.2; rArmZ = 0.35;
    } else if (isMoving) {
        rx = 0.28;
        py += Math.abs(Math.sin(t)) * 0.12;
        torsoY = Math.sin(t) * 0.28;
        lLegX = Math.sin(t) * 0.88;
        rLegX = -Math.sin(t) * 0.88;
        lArmX = -Math.sin(t) * 0.75 - 0.2;
        rArmX = Math.sin(t) * 0.75 - 0.35;
    } else {
        py += Math.sin(t * 0.8) * 0.04;
        torsoY = -0.24;
        rArmX = -0.45 + Math.sin(t * 0.8) * 0.08;
        lArmX = -0.35 - Math.sin(t * 0.8) * 0.08;
        lLegX = -0.16; rLegX = 0.16;
    }

    if (pivot) {
        pivot.position.y = py;
        pivot.rotation.set(rx, ry, rz);
    }
    if (j.torso) j.torso.rotation.y = torsoY;
    if (j.leftArm) { j.leftArm.rotation.x = lArmX; j.leftArm.rotation.z = lArmZ; }
    if (j.rightArm) { j.rightArm.rotation.x = rArmX; j.rightArm.rotation.z = rArmZ; }
    if (j.leftLeg) j.leftLeg.rotation.x = lLegX;
    if (j.rightLeg) j.rightLeg.rotation.x = rLegX;
}

// ========================================================
// 13. メインアニメーションループ（Bloom合成 ＆ スマート観戦カメラ）
// ========================================================
function animate() {
    requestAnimationFrame(animate);

    let rawDt = Math.min(clock.getDelta(), 0.05);
    const elapsedTime = clock.getElapsedTime();

    if (hitStopTimer > 0) {
        hitStopTimer -= rawDt;
        if (cameraShakeIntensity > 0.01) {
            camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
            camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
        }
        if (composer) composer.render();
        else renderer.render(scene, camera);
        return;
    }

    let dt = rawDt;
    if (isKoSlowMo) {
        slowMoTimer -= rawDt;
        dt *= 0.22;
        if (slowMoTimer <= 0) isKoSlowMo = false;
    }

    if (isGameActive) {
        roundTimerAccum += dt;
        if (roundTimerAccum >= 1.0) {
            roundTimerAccum = 0;
            roundTimer = Math.max(0, roundTimer - 1);
            document.getElementById('round-timer-val').innerText = String(roundTimer).padStart(2, '0');
        }
        player.sp = Math.min(player.maxSp, player.sp + 4.8 * dt);
        updateGauges();
    }

    // プレイヤー周囲のキラキラオーラ更新
    playerAuraParticles.forEach(p => {
        p.angle += dt * p.speed;
        const y = ((p.heightOffset + elapsedTime * 0.9) % 1.65) + 0.15;
        p.mesh.position.set(Math.cos(p.angle) * p.radius, y + player.airY, Math.sin(p.angle) * p.radius);
        p.mesh.rotation.y += dt * 4;
    });

    // コロシアム全体の浮遊マナ粒子アニメーション
    ambientSparkles.forEach(sp => {
        sp.angle += dt * sp.speed * 0.4;
        sp.mesh.position.x = Math.cos(sp.angle) * sp.radius;
        sp.mesh.position.z = Math.sin(sp.angle) * sp.radius;
        sp.mesh.position.y = sp.baseY + Math.sin(elapsedTime * 1.8 + sp.phase) * 0.35;
        sp.mesh.rotation.y += dt * 2.5;
    });

    // 重力・空中物理（打ち上げ・ジャンプ）
    [player, cpu].forEach(ent => {
        if (ent.airY > 0 || ent.airVelY !== 0) {
            ent.airY += ent.airVelY * dt;
            ent.airVelY -= 19.5 * dt;
            if (ent.airY <= 0) {
                ent.airY = 0;
                ent.airVelY = 0;
                spawnFootstepDust(ent.position, 1.5);
            }
        }
    });

    // プレイヤー移動 ＆ オートバトルAIガンビット駆動
    let playerMoving = false;
    if (isGameActive && player.state !== "special" && player.state !== "down") {
        const autoMoved = updatePlayerAutoAI(dt);
        if (autoMoved) playerMoving = true;

        player.isGuarding = input.guard && player.state !== "attack";
        player.guardBarrierMesh.material.opacity = player.isGuarding ? 0.38 : 0.0;

        if (!player.isGuarding && player.state !== "attack" && (Math.abs(input.moveX) > 0.05 || Math.abs(input.moveZ) > 0.05)) {
            playerMoving = true;
            const camForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
            const camRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
            const moveVec = new THREE.Vector3().addScaledVector(camRight, input.moveX).addScaledVector(camForward, -input.moveZ).normalize();
            player.velocity.add(moveVec.multiplyScalar(player.speed * dt * 6.8));

            if (input.lockOn) {
                const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
                player.rotationY = Math.atan2(toCpu.x, toCpu.z);
            } else {
                player.rotationY = Math.atan2(moveVec.x, moveVec.z);
            }
        }

        if (playerMoving) {
            dustTimer -= dt;
            if (dustTimer <= 0 && player.airY <= 0.05) {
                spawnFootstepDust(player.position, 1.1);
                dustTimer = 0.11;
            }
        }
    }

    if (player.stateTimer > 0) {
        player.stateTimer -= dt;
        if (player.stateTimer <= 0) {
            player.state = "idle";
            player.comboStep = 0;
        }
    }
    if (cpu.stateTimer > 0) {
        cpu.stateTimer -= dt;
        if (cpu.stateTimer <= 0 && cpu.stunTimer <= 0) cpu.state = "idle";
    }

    updateCpuAI(dt);
    cpu.guardBarrierMesh.material.opacity = cpu.isGuarding ? 0.38 : 0.0;

    // 魔弾プロジェクタイル更新
    for (let i = projectilesList.length - 1; i >= 0; i--) {
        const pr = projectilesList[i];
        pr.life -= dt;
        pr.mesh.position.addScaledVector(pr.vel, dt);
        if (pr.mesh.position.distanceTo(cpu.position.clone().add(new THREE.Vector3(0, 1.1, 0))) < 1.35) {
            const dmg = Math.round(54 * player.atkScale * getArchetypeMultiplier(player.archetype, cpu.archetype));
            cpu.stunTimer = 0.48 * player.stunPower;
            cpu.state = "stunned";
            cpu.stateTimer = cpu.stunTimer;
            battleStats.stunsInflicted++;
            spawnHitSparks(cpu.position, pr.colorHex, 28);
            spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, dmg, "stun", "MAGIC!");
            applyDamage('cpu', dmg);
            addCombo(1, dmg);
            scene.remove(pr.mesh);
            projectilesList.splice(i, 1);
            continue;
        }
        if (pr.life <= 0) {
            scene.remove(pr.mesh);
            projectilesList.splice(i, 1);
        }
    }

    // 位置＆アリーナ境界
    player.position.addScaledVector(player.velocity, dt);
    player.velocity.multiplyScalar(0.82);
    cpu.position.addScaledVector(cpu.velocity, dt);
    cpu.velocity.multiplyScalar(0.82);

    [player, cpu].forEach(ent => {
        const d = Math.hypot(ent.position.x, ent.position.z);
        if (d > arenaRadius - 0.7) ent.position.multiplyScalar((arenaRadius - 0.7) / d);
    });

    player.group.position.copy(player.position);
    player.group.rotation.y = player.rotationY + (player.isVrm && !player.isCustomRig ? 0 : Math.PI);
    cpu.group.position.copy(cpu.position);
    cpu.group.rotation.y = cpu.rotationY + Math.PI;

    if (player.vrm) player.vrm.update(dt);
    updateFullBodyMotion(player, dt, playerMoving);
    updateFullBodyMotion(cpu, dt, cpu.velocity.lengthSq() > 0.25);

    // エフェクト更新
    for (let i = effectsList.length - 1; i >= 0; i--) {
        const fx = effectsList[i];
        fx.life -= dt;
        fx.update(dt, fx);
        if (fx.life <= 0) {
            scene.remove(fx.mesh);
            effectsList.splice(i, 1);
        }
    }

    // ダイナミックTPS＆スマート観戦カメラワーク
    const midPoint = new THREE.Vector3().addVectors(player.position, cpu.position).multiplyScalar(0.5);
    const toPlayerFromCpu = new THREE.Vector3().subVectors(player.position, cpu.position).normalize();
    const rightVec = new THREE.Vector3(-toPlayerFromCpu.z, 0, toPlayerFromCpu.x);

    let camTargetPos;
    let lookTarget = new THREE.Vector3(midPoint.x, 1.25 + (player.airY + cpu.airY) * 0.35, midPoint.z);

    if (cinematicCameraMode === "zoom_player") {
        const frontDir = new THREE.Vector3(Math.sin(player.rotationY), 0, Math.cos(player.rotationY));
        camTargetPos = player.position.clone().addScaledVector(frontDir, 2.3).add(new THREE.Vector3(0.7, 1.4, 0));
        lookTarget.copy(player.position).add(new THREE.Vector3(0, 1.3, 0));
        camera.position.lerp(camTargetPos, 0.22);
    } else if (isCinematicSpectator) {
        // 🎬 観戦カメラモード時はゆっくり周回しながらコンボ時にダイナミックズーム
        const orbitAng = elapsedTime * 0.35;
        const zoomDist = comboHits >= 3 || cpu.airY > 0.2 ? 5.2 : 7.0;
        camTargetPos = new THREE.Vector3(
            midPoint.x + Math.cos(orbitAng) * zoomDist,
            2.3 + Math.sin(elapsedTime * 0.7) * 0.55,
            midPoint.z + Math.sin(orbitAng) * zoomDist
        );
        camera.position.lerp(camTargetPos, 0.08);
    } else {
        const dynamicZoom = comboHits >= 3 || cpu.airY > 0.25 ? 3.65 : 4.4;
        camTargetPos = player.position.clone()
            .addScaledVector(toPlayerFromCpu, dynamicZoom)
            .addScaledVector(rightVec, -1.15)
            .add(new THREE.Vector3(0, 2.75, 0));
        camera.position.lerp(camTargetPos, 0.11);
    }

    if (cameraShakeIntensity > 0.01) {
        camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
        camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
        cameraShakeIntensity *= 0.84;
    } else {
        cameraShakeIntensity = 0;
    }
    camera.lookAt(lookTarget);

    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

function onResize() {
    const container = document.getElementById('three-canvas-container');
    if (!container || !renderer) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
}

// ========================================================
// 14. 入力バインド（監督バー ＆ キーボード ＆ 左下ATTACK / 右下SKILL パッド）
// ========================================================
function toggleAutoBattle() {
    isAutoBattle = !isAutoBattle;
    const btn = document.getElementById('btn-auto-toggle');
    if (btn) {
        btn.innerText = isAutoBattle ? '🤖 AUTO対戦: ON' : '🎮 手動操作: ON';
        btn.classList.toggle('active', isAutoBattle);
    }
    showAnnouncement(
        isAutoBattle ? '🤖 AUTO対戦 ON (登録AIガンビットで自動戦闘)' : '🎮 手動アクションモード ON',
        isAutoBattle ? '#10b981' : '#ffd32a'
    );
}

function toggleCinematicSpectator() {
    isCinematicSpectator = !isCinematicSpectator;
    document.body.classList.toggle('cinematic-spectator', isCinematicSpectator);
    const btn = document.getElementById('btn-cinematic-mode');
    if (btn) {
        btn.innerText = isCinematicSpectator ? '🎬 観戦カメラ: ON (UI非表示)' : '🎬 観戦カメラ';
    }
}

function setupInputs() {
    window.addEventListener('keydown', e => {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) return;
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup') input.moveZ = 1;
        if (k === 's' || k === 'arrowdown') input.moveZ = -1;
        if (k === 'a' || k === 'arrowleft') input.moveX = -1;
        if (k === 'd' || k === 'arrowright') input.moveX = 1;

        if (k === 'j' || k === 'z') performPlayerAttack('rush');
        if (k === 'i' || k === 'c') performPlayerAttack('wide');
        if (k === 'u' || k === 'e') performPlayerAttack('launch');
        if (k === 'o' || k === 'f') performSkillArts();
        if (k === 'k' || k === 'x') performPlayerSpecial();
        if (k === 'l' || k === 'shift') performPlayerDodge();
        if (k === 'v') performPlayerJump();
        if (k === 'p') toggleAutoBattle();
        if (k === ' ') { input.guard = true; e.preventDefault(); }
        if (k === 'q') input.lockOn = !input.lockOn;
    });

    window.addEventListener('keyup', e => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 's' || k === 'arrowup' || k === 'arrowdown') input.moveZ = 0;
        if (k === 'a' || k === 'd' || k === 'arrowleft' || k === 'arrowright') input.moveX = 0;
        if (k === ' ') input.guard = false;
    });

    const bindPadBtn = (id, onDown, onUp) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', e => { e.preventDefault(); if (onDown) onDown(); });
        el.addEventListener('touchend', e => { e.preventDefault(); if (onUp) onUp(); });
        el.addEventListener('mousedown', () => { if (onDown) onDown(); });
        el.addEventListener('mouseup', () => { if (onUp) onUp(); });
    };

    // 左下 ATTACK 4ボタンパッド
    bindPadBtn('btn-atk-rush',   () => performPlayerAttack('rush'));
    bindPadBtn('btn-atk-wide',   () => performPlayerAttack('wide'));
    bindPadBtn('btn-atk-heavy',  () => performPlayerAttack('launch'));
    bindPadBtn('btn-atk-guard',  () => { input.guard = true; }, () => { input.guard = false; });

    // 右下 SKILL 4ボタンパッド
    bindPadBtn('btn-skl-ult',    performPlayerSpecial);
    bindPadBtn('btn-skl-arts',   performSkillArts);
    bindPadBtn('btn-skl-dodge',  performPlayerDodge);
    bindPadBtn('btn-skl-jump',   performPlayerJump);

    // 上部 監督・観戦コントロールバー
    document.getElementById('btn-auto-toggle')?.addEventListener('click', toggleAutoBattle);
    document.getElementById('btn-cinematic-mode')?.addEventListener('click', toggleCinematicSpectator);
    document.getElementById('btn-live-brag')?.addEventListener('click', () => shareOnX('survival'));

    // 5連勝ごとの生存報告モーダルボタン
    document.getElementById('btn-milestone-share')?.addEventListener('click', () => shareOnX('survival'));
    document.getElementById('btn-milestone-cert')?.addEventListener('click', () => openCertificateModal('SURVIVAL'));
    document.getElementById('btn-milestone-continue')?.addEventListener('click', () => {
        document.getElementById('milestone-modal').style.display = 'none';
        spawnNextCpu();
    });

    // 敗北・引退モーダルボタン
    document.getElementById('btn-share-x')?.addEventListener('click', () => shareOnX('retired'));
    document.getElementById('btn-open-cert')?.addEventListener('click', () => openCertificateModal('RETIRED'));
    document.getElementById('btn-copy-enemy')?.addEventListener('click', copyEnemyBuildAndOpenStudio);
    document.getElementById('btn-retry')?.addEventListener('click', () => {
        resetGame();
        document.getElementById('creator-modal').style.display = 'flex';
    });

    // 額縁認定証モーダルボタン
    document.getElementById('btn-download-cert')?.addEventListener('click', downloadCertificatePng);
    document.getElementById('btn-close-cert')?.addEventListener('click', () => {
        document.getElementById('cert-modal').style.display = 'none';
    });

    setupTouchJoystick();
}

function setupTouchJoystick() {
    const zone = document.getElementById('joystick-zone');
    const stick = document.getElementById('joystick-stick');
    if (!zone || !stick) return;

    let dragging = false;
    let startX = 0, startY = 0;

    const startDrag = (cx, cy) => {
        dragging = true;
        const rect = zone.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
        moveDrag(cx, cy);
    };

    const moveDrag = (cx, cy) => {
        if (!dragging) return;
        const dx = cx - startX;
        const dy = cy - startY;
        const dist = Math.hypot(dx, dy);
        const maxR = 32;
        const angle = Math.atan2(dy, dx);
        const clamped = Math.min(dist, maxR);
        stick.style.transform = `translate(${Math.cos(angle) * clamped}px, ${Math.sin(angle) * clamped}px)`;
        input.moveX = (Math.cos(angle) * clamped) / maxR;
        input.moveZ = -(Math.sin(angle) * clamped) / maxR;
    };

    const stopDrag = () => {
        dragging = false;
        stick.style.transform = `translate(0px, 0px)`;
        input.moveX = 0;
        input.moveZ = 0;
    };

    zone.addEventListener('touchstart', e => { e.preventDefault(); startDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
    zone.addEventListener('touchmove', e => { e.preventDefault(); moveDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
    zone.addEventListener('touchend', stopDrag);
    zone.addEventListener('mousedown', e => startDrag(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', stopDrag);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('high-score').innerText = highScore;
    setupInputs();
    setupCreatorStudio();
    initScene();
});

