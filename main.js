import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ========================================================
// 1. ゲーム設定 & マスターデータ
// ========================================================
const CPU_STYLES = [
    { type: "近接型（武器ナシ）", suffix: "拳法家", detail: "高速コンボラッシュ & 旋風脚", category: "melee-bare" },
    { type: "近接型（武器アリ）", suffix: "重戦士", detail: "大剣回転斬り & 鉄壁ガード", category: "melee-weapon" },
    { type: "狙撃型（武器ナシ）", suffix: "サイキッカー", detail: "念動レーザー弾 & 重力衝撃波", category: "snipe-bare" },
    { type: "狙撃型（武器アリ）", suffix: "スナイパー", detail: "超高速プラズマ狙撃 & バックステップ", category: "snipe-weapon" }
];

const ENEMY_NAMES = ["ドロイド", "シャドウ", "ギガント", "ハンター", "ヴァルキリー", "プロトタイプ", "ベルセルク", "ファントム"];

// ゲーム状態
let currentWins = 0;
let highScore = parseInt(localStorage.getItem("battle_high_score") || "0", 10);
let currentCpuInfo = {};
let isGameActive = true;
let isKoSlowMo = false;
let slowMoTimer = 0;
let hitStopTimer = 0;
let cameraShakeIntensity = 0;
let cinematicCameraMode = null; // 必殺技中のシネマティックカメラ演出

// コンボ管理
let comboHits = 0;
let comboDamage = 0;
let comboTimer = null;

// 3D環境 & ポストプロセス
let scene, camera, renderer, composer;
let clock = new THREE.Clock();

// Blender 5.2 生成アセットのキャッシュ
const blenderCache = {
    fighterScene: null,
    greatswordScene: null,
    sniperRifleScene: null,
    psyOrbScene: null,
    loaded: false
};

// ステージ要素 & VFX管理リスト
let arenaRadius = 10.2;
let torchFlames = [];
let seaWaterMesh = null;
let effectsList = [];
let dustTimer = 0;

// プレイヤー管理オブジェクト
const player = {
    group: null,
    animPivot: null, // ジャンプ・前傾・360度スピン・宙返り用の内部ピボット
    mesh: null,
    joints: {},
    customJoints: null,
    vrm: null,
    customGlb: null,
    isVrm: false,
    isCustomRig: false,
    charType: "knight", // "knight", "seraph", "kuro", "leo"
    skillName: "🔥 覇皇烈空閃 (EX SPECIAL) 🔥",
    themeColor: 0x00ffff,
    hp: 1000,
    maxHp: 1000,
    sp: 60,
    maxSp: 100,
    position: new THREE.Vector3(-4.2, 0, 0),
    rotationY: Math.PI / 2,
    velocity: new THREE.Vector3(),
    speed: 7.2,
    state: "idle", // idle, move, attack, special, guard, dodge, damaged, down
    stateTimer: 0,
    stateDuration: 0.35,
    comboStep: 0,
    isGuarding: false,
    isInvincible: false,
    guardBarrierMesh: null,
    animTime: 0
};

// CPU管理オブジェクト
const cpu = {
    group: null,
    animPivot: null,
    mesh: null,
    joints: {},
    weaponMesh: null,
    orbs: [],
    themeColor: 0xff4757,
    hp: 1000,
    maxHp: 1000,
    sp: 20,
    maxSp: 100,
    position: new THREE.Vector3(4.2, 0, 0),
    rotationY: -Math.PI / 2,
    velocity: new THREE.Vector3(),
    speed: 4.8,
    state: "idle",
    stateTimer: 0,
    stateDuration: 0.4,
    comboStep: 0,
    isGuarding: false,
    guardBarrierMesh: null,
    aiTimer: 0,
    aiAction: "idle",
    styleInfo: CPU_STYLES[1],
    animTime: 0
};

// 入力状態
const input = {
    moveX: 0,
    moveZ: 0,
    attack: false,
    special: false,
    guard: false,
    dodge: false,
    lockOn: true
};

// ========================================================
// 2. Three.js 初期化 & UnrealBloom ポストプロセス
// ========================================================
async function initScene() {
    const container = document.getElementById('three-canvas-container');
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x162436);
    scene.fog = new THREE.FogExp2(0x203348, 0.02);

    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 250);
    camera.position.set(0, 4.5, 9);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // UnrealBloomPass (発光エフェクトをより鮮烈に)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.72, // strength
        0.45, // radius
        0.68  // threshold
    );
    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // ライティング
    const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x223344, 1.2);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sunLight.position.set(14, 24, 12);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const d = 15;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    // プレイヤーとCPUのグループ & アクション回転用ピボットの準備
    player.group = new THREE.Group();
    player.animPivot = new THREE.Group();
    player.group.add(player.animPivot);
    scene.add(player.group);
    player.guardBarrierMesh = createBarrierMesh(0x00d2d3);
    player.group.add(player.guardBarrierMesh);

    cpu.group = new THREE.Group();
    cpu.animPivot = new THREE.Group();
    cpu.group.add(cpu.animPivot);
    scene.add(cpu.group);
    cpu.guardBarrierMesh = createBarrierMesh(0xff4757);
    cpu.group.add(cpu.guardBarrierMesh);

    buildOceanAndTorchLights();
    await loadBlenderModels();

    setupPlayerMeshFromBlender();
    spawnNextCpu();

    window.addEventListener('resize', onResize);
    animate();
}

function buildOceanAndTorchLights() {
    const oceanGeo = new THREE.PlaneGeometry(350, 350, 48, 48);
    const oceanMat = new THREE.MeshStandardMaterial({
        color: 0x0b253c,
        roughness: 0.15,
        metalness: 0.85
    });
    seaWaterMesh = new THREE.Mesh(oceanGeo, oceanMat);
    seaWaterMesh.rotation.x = -Math.PI / 2;
    seaWaterMesh.position.y = -8.0;
    scene.add(seaWaterMesh);

    const torchAngles = [30, 150, 210, 330];
    const r = 11.0 * 0.75;
    torchAngles.forEach(deg => {
        const rad = THREE.MathUtils.degToRad(deg);
        const x = Math.cos(rad) * r;
        const z = Math.sin(rad) * r;

        const fireLight = new THREE.PointLight(0xff6b22, 4.8, 10.0);
        fireLight.position.set(x, 2.35, z);
        scene.add(fireLight);

        const flameGeo = new THREE.OctahedronGeometry(0.28, 1);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const flameMesh = new THREE.Mesh(flameGeo, flameMat);
        flameMesh.position.set(x, 2.1, z);
        scene.add(flameMesh);

        torchFlames.push({ light: fireLight, mesh: flameMesh, baseX: x, baseY: 2.1, baseZ: z });
    });
}

async function loadBlenderModels() {
    const loader = new GLTFLoader();
    const loadGlb = (path) => new Promise((resolve) => {
        loader.load(path, gltf => resolve(gltf.scene), undefined, () => resolve(null));
    });

    const [arenaScene, fighterScene, swordScene, rifleScene, orbScene] = await Promise.all([
        loadGlb('assets/models/colosseum_arena.glb'),
        loadGlb('assets/models/fighter_cyber_knight.glb'),
        loadGlb('assets/models/weapon_greatsword.glb'),
        loadGlb('assets/models/weapon_sniper_rifle.glb'),
        loadGlb('assets/models/weapon_psy_orb.glb')
    ]);

    if (arenaScene) {
        arenaScene.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(arenaScene);
    }

    blenderCache.fighterScene = fighterScene;
    blenderCache.greatswordScene = swordScene;
    blenderCache.sniperRifleScene = rifleScene;
    blenderCache.psyOrbScene = orbScene;
    blenderCache.loaded = true;
}

function extractJointsFromHierarchy(root) {
    const joints = {};
    root.traverse(c => {
        if (c.name === "LeftArm" || c.name === "leftUpperArm") joints.leftArm = c;
        if (c.name === "RightArm" || c.name === "rightUpperArm") joints.rightArm = c;
        if (c.name === "LeftLeg" || c.name === "leftUpperLeg") joints.leftLeg = c;
        if (c.name === "RightLeg" || c.name === "rightUpperLeg") joints.rightLeg = c;
        if (c.name === "Torso" || c.name === "chest" || c.name === "spine") joints.torso = c;
        if (c.name === "Head" || c.name === "head") joints.head = c;
        if (c.name === "hips") joints.hips = c;
    });
    return joints;
}

function createFighterInstance(mainColorHex, glowColorHex) {
    if (!blenderCache.fighterScene) {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: mainColorHex }));
        box.position.y = 0.75;
        g.add(box);
        return { root: g, joints: {} };
    }

    const root = blenderCache.fighterScene.clone(true);
    const joints = extractJointsFromHierarchy(root);

    root.traverse(child => {
        if (child.isMesh && child.material) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material = child.material.clone();
            if (child.material.name.includes("ArmorMain")) {
                child.material.color.setHex(mainColorHex);
            } else if (child.material.name.includes("VisorGlow")) {
                child.material.color.setHex(glowColorHex);
                if (child.material.emissive) {
                    child.material.emissive.setHex(glowColorHex);
                    child.material.emissiveIntensity = 4.0;
                }
            }
        }
    });

    return { root, joints };
}

function setupPlayerMeshFromBlender() {
    if (player.mesh) player.animPivot.remove(player.mesh);
    const { root, joints } = createFighterInstance(0x1e90ff, 0x00ffff);
    player.mesh = root;
    player.joints = joints;
    player.mesh.visible = !player.isVrm;
    player.animPivot.add(player.mesh);

    if (blenderCache.greatswordScene && joints.rightArm) {
        const pSword = blenderCache.greatswordScene.clone(true);
        pSword.scale.set(0.85, 0.85, 0.85);
        pSword.position.set(-0.36, -0.35, 0.25);
        pSword.rotation.x = Math.PI / 2.2;
        pSword.traverse(c => {
            if (c.isMesh && c.material) {
                c.material = c.material.clone();
                if (c.material.name.includes("CrimsonCore")) {
                    c.material.color.setHex(0x00ffff);
                    if (c.material.emissive) c.material.emissive.setHex(0x00ffff);
                }
            }
        });
        joints.rightArm.add(pSword);
    }
}

function createBarrierMesh(colorHex) {
    const group = new THREE.Group();
    const outer = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.18, 2),
        new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true, transparent: true, opacity: 0.0 })
    );
    const inner = new THREE.Mesh(
        new THREE.SphereGeometry(1.12, 24, 24),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
    );
    group.add(outer);
    group.add(inner);
    group.position.y = 1.0;
    group.userData = { outer, inner };
    return group;
}

function setBarrierOpacity(barrierGroup, active, elapsedTime) {
    if (!barrierGroup || !barrierGroup.userData.outer) return;
    if (active) {
        barrierGroup.userData.outer.material.opacity = 0.65 + Math.sin(elapsedTime * 15) * 0.15;
        barrierGroup.userData.inner.material.opacity = 0.18;
        barrierGroup.rotation.y += 0.04;
    } else {
        barrierGroup.userData.outer.material.opacity = 0.0;
        barrierGroup.userData.inner.material.opacity = 0.0;
    }
}

// ========================================================
// 3. CPUの3Dモデル & Blender製専用武器の装備
// ========================================================
function setupCpuModel(styleInfo) {
    if (cpu.mesh) cpu.animPivot.remove(cpu.mesh);
    if (cpu.weaponMesh && cpu.weaponMesh.parent) cpu.weaponMesh.parent.remove(cpu.weaponMesh);
    cpu.orbs.forEach(o => cpu.group.remove(o.mesh));
    cpu.orbs = [];
    cpu.weaponMesh = null;

    let mainColor = 0xd63031;
    let glowColor = 0xffa502;
    if (styleInfo.category.includes("snipe")) {
        mainColor = 0x6c5ce7;
        glowColor = 0x00d2d3;
    } else if (styleInfo.category === "melee-bare") {
        mainColor = 0xe17055;
        glowColor = 0xffdd59;
    }
    cpu.themeColor = glowColor;

    const { root, joints } = createFighterInstance(mainColor, glowColor);
    cpu.mesh = root;
    cpu.joints = joints;
    cpu.animPivot.add(cpu.mesh);

    const attachParent = joints.rightArm || cpu.animPivot;

    if (styleInfo.category === "melee-weapon" && blenderCache.greatswordScene) {
        const sword = blenderCache.greatswordScene.clone(true);
        sword.position.set(-0.36, -0.35, 0.25);
        sword.rotation.x = Math.PI / 2.2;
        attachParent.add(sword);
        cpu.weaponMesh = sword;
    } else if (styleInfo.category === "snipe-weapon" && blenderCache.sniperRifleScene) {
        const rifle = blenderCache.sniperRifleScene.clone(true);
        rifle.position.set(-0.36, -0.30, 0.20);
        attachParent.add(rifle);
        cpu.weaponMesh = rifle;
    } else if (styleInfo.category === "snipe-bare" && blenderCache.psyOrbScene) {
        for (let i = 0; i < 3; i++) {
            const orb = blenderCache.psyOrbScene.clone(true);
            cpu.group.add(orb);
            cpu.orbs.push({ mesh: orb, angleOffset: (i * Math.PI * 2) / 3 });
        }
    }
}

// ========================================================
// 4. 自作キャラマルチローダー (.vrm / .glb / .png / .jpg & プリセット対応)
// ========================================================
function setupVrmLoader() {
    const dropArea = document.getElementById('drop-area');
    const dropHint = document.getElementById('drop-hint');
    const fileInput = document.getElementById('vrm-file-input');
    const resetBtn = document.getElementById('reset-avatar-btn');

    ['dragenter', 'dragover'].forEach(name => {
        dropArea.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropHint.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        dropArea.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropHint.classList.remove('drag-over');
        });
    });

    dropArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) handleUploadedFile(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) handleUploadedFile(e.target.files[0]);
    });

    document.querySelectorAll('.dock-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const vrmPath = btn.getAttribute('data-vrm');
            if (vrmPath) loadCharacterFromUrl(vrmPath, vrmPath.split('/').pop());
        });
    });

    resetBtn.addEventListener('click', restoreDefaultPlayer);
}

function handleUploadedFile(file) {
    const lower = file.name.toLowerCase();
    const blobUrl = URL.createObjectURL(file);

    if (lower.endsWith('.vrm') || lower.endsWith('.glb')) {
        loadCharacterFromUrl(blobUrl, file.name);
    } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        applyCustomSkinTexture(blobUrl, file.name);
    } else {
        alert('⚠️ .vrm / .glb / .png / .jpg 形式のファイルを選択してください。');
    }
}

function loadCharacterFromUrl(url, fileName) {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = `自作キャラ召喚中: ${fileName}...`;
    overlay.style.display = 'flex';

    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    loader.load(
        url,
        gltf => {
            const vrm = gltf.userData.vrm;
            const modelRoot = vrm ? vrm.scene : gltf.scene;

            if (vrm) {
                VRMUtils.removeUnnecessaryVertices(gltf.scene);
                VRMUtils.removeUnnecessaryJoints(gltf.scene);
            }

            if (player.vrm) {
                player.animPivot.remove(player.vrm.scene);
                VRMUtils.deepDispose(player.vrm.scene);
                player.vrm = null;
            }
            if (player.customGlb) {
                player.animPivot.remove(player.customGlb);
                player.customGlb = null;
            }
            if (player.mesh) player.mesh.visible = false;

            modelRoot.traverse(obj => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });

            const isOurCustomChar = fileName.includes('valkyrie_seraph') || fileName.includes('crimson_samurai') || fileName.includes('golden_brawler');
            player.isCustomRig = isOurCustomChar;

            if (vrm) {
                player.vrm = vrm;
                player.isVrm = true;
                vrm.scene.rotation.y = isOurCustomChar ? 0 : Math.PI;
                if (!isOurCustomChar && vrm.humanoid) {
                    try {
                        const lArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
                        const rArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
                        if (lArm) lArm.rotation.z = Math.PI / 3.2;
                        if (rArm) rArm.rotation.z = -Math.PI / 3.2;
                    } catch (err) {}
                }
                player.animPivot.add(vrm.scene);
            } else {
                player.customGlb = modelRoot;
                player.isVrm = true;
                player.animPivot.add(modelRoot);
            }

            player.customJoints = extractJointsFromHierarchy(modelRoot);

            const metaName = vrm?.meta?.name || vrm?.meta?.title || fileName.replace(/\.(vrm|glb)$/i, '');
            let iconSym = '🦸';
            let skillName = '🔥 覇皇烈空閃 (EX SPECIAL) 🔥';
            let charType = 'knight';
            let themeColor = 0x00ffff;

            if (fileName.includes('valkyrie_seraph') || metaName.includes('セラフ')) {
                iconSym = '👼';
                skillName = '🌟 聖裁・セラフィック・ノヴァ 🌟';
                charType = 'seraph';
                themeColor = 0x00f2fe;
            } else if (fileName.includes('crimson_samurai') || metaName.includes('クロガネ')) {
                iconSym = '👹';
                skillName = '⚡ 秘剣・紅蓮一閃 ⚡';
                charType = 'kuro';
                themeColor = 0xff1e42;
            } else if (fileName.includes('golden_brawler') || metaName.includes('レオ')) {
                iconSym = '🦁';
                skillName = '🔥 覇王・獅子奮迅撃 🔥';
                charType = 'leo';
                themeColor = 0xffb800;
            }
            player.charType = charType;
            player.skillName = skillName;
            player.themeColor = themeColor;

            // 召喚時の光柱演出
            spawnGroundSlamVFX(player.position, themeColor, 0.8);

            document.getElementById('player-name').innerText = metaName;
            document.getElementById('player-avatar-icon').innerText = iconSym;
            document.getElementById('avatar-status-text').innerText = `✅ 自作キャラ召喚中: ${metaName} (必殺技: ${skillName})`;
            document.getElementById('reset-avatar-btn').style.display = 'inline-block';
            overlay.style.display = 'none';

            showAnnouncement(`${metaName} 参戦！`, "#00d2d3");
        },
        null,
        err => {
            console.error(err);
            alert('モデル読み込みエラー: ' + err.message);
            overlay.style.display = 'none';
        }
    );
}

function applyCustomSkinTexture(blobUrl, fileName) {
    const texLoader = new THREE.TextureLoader();
    texLoader.load(blobUrl, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        restoreDefaultPlayer();
        if (player.mesh) {
            player.mesh.traverse(child => {
                if (child.isMesh && child.material && child.material.name.includes("ArmorMain")) {
                    child.material = child.material.clone();
                    child.material.map = texture;
                    child.material.color.setHex(0xffffff);
                    child.material.needsUpdate = true;
                }
            });
        }
        const skinTitle = fileName.replace(/\.(png|jpg|jpeg)$/i, '');
        document.getElementById('player-name').innerText = `Custom: ${skinTitle}`;
        document.getElementById('player-avatar-icon').innerText = '🎨';
        document.getElementById('avatar-status-text').innerText = `✅ カスタム画像スキン適用中: ${fileName}`;
        document.getElementById('reset-avatar-btn').style.display = 'inline-block';
        spawnGroundSlamVFX(player.position, 0xffd32a, 0.8);
        showAnnouncement("カスタム画像テクスチャ適用完了！", "#ffd32a");
    });
}

function restoreDefaultPlayer() {
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
    player.isCustomRig = false;
    player.customJoints = null;
    player.charType = "knight";
    player.themeColor = 0x00ffff;
    player.skillName = "🔥 覇皇烈空閃 (EX SPECIAL) 🔥";
    setupPlayerMeshFromBlender();

    document.getElementById('player-name').innerText = "Cyber Knight";
    document.getElementById('player-avatar-icon').innerText = '⚔️';
    document.getElementById('avatar-status-text').innerText = "現在: Blender 5.2 アーマーナイト (custom_characters/ 内の .vrm / .png をD&D可能)";
    document.getElementById('reset-avatar-btn').style.display = 'none';
    showAnnouncement("デフォルトアーマーに戻しました", "#ced6e0");
}

// ========================================================
// 5. 超ド派手 3D エフェクト (VFX) エンジン
// ========================================================
function spawnDamageNumber(x, y, z, damage, type = "normal") {
    const layer = document.getElementById('damage-numbers-layer');
    if (!layer) return;

    const pos = new THREE.Vector3(x + (Math.random() - 0.5) * 0.5, y + 1.45, z + (Math.random() - 0.5) * 0.5);
    pos.project(camera);
    const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

    const elem = document.createElement('div');
    elem.className = `floating-dmg ${type}`;
    elem.innerText = damage;
    elem.style.left = `${screenX}px`;
    elem.style.top = `${screenY}px`;
    layer.appendChild(elem);

    setTimeout(() => {
        if (elem.parentNode) elem.parentNode.removeChild(elem);
    }, 850);
}

// ① 多層クレセント斬撃ブレード波 (3層発光弧 + トレイル粒子)
function spawnCrescentSlash(origin, targetPos, colorHex = 0x00ffff, comboStep = 1) {
    const vfxGroup = new THREE.Group();
    vfxGroup.position.copy(origin).add(new THREE.Vector3(0, 1.08, 0));
    vfxGroup.lookAt(targetPos.x, 1.08, targetPos.z);

    // コンボ段数に応じた斬撃角度 (1段目: 斜め袈裟斬り, 2段目: 水平大回転斬り, 3段目: 垂直大兜割り)
    if (comboStep === 1) {
        vfxGroup.rotateZ(Math.PI * 0.22);
    } else if (comboStep === 2) {
        vfxGroup.rotateX(Math.PI * 0.48);
    } else {
        vfxGroup.rotateY(Math.PI * 0.5);
        vfxGroup.rotateZ(-Math.PI * 0.1);
    }

    const arcRadius = comboStep === 3 ? 1.55 : (comboStep === 2 ? 1.45 : 1.15);
    const arcSpan = comboStep === 2 ? Math.PI * 1.75 : Math.PI * 1.15;

    // 外側オーラブレード
    const outerGeo = new THREE.RingGeometry(arcRadius * 0.55, arcRadius, 32, 2, 0, arcSpan);
    const outerMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    vfxGroup.add(outerMesh);

    // 内側白熱コアブレード (Bloomで強く輝く)
    const coreGeo = new THREE.RingGeometry(arcRadius * 0.78, arcRadius * 0.96, 32, 1, 0, arcSpan * 0.9);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 1.0 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.z = 0.01;
    vfxGroup.add(coreMesh);

    // 立体感のための直交チューブリング
    const torusGeo = new THREE.TorusGeometry(arcRadius * 0.88, 0.045, 8, 28, arcSpan);
    const torusMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.88 });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    vfxGroup.add(torusMesh);

    scene.add(vfxGroup);

    const forwardDir = new THREE.Vector3().subVectors(targetPos, origin).setY(0).normalize();
    const maxLife = comboStep === 3 ? 0.34 : 0.24;

    effectsList.push({
        mesh: vfxGroup,
        life: maxLife,
        maxLife: maxLife,
        update: (dt, item) => {
            const ratio = item.life / item.maxLife;
            item.mesh.position.addScaledVector(forwardDir, dt * (comboStep === 2 ? 2.5 : 6.5));
            item.mesh.scale.multiplyScalar(1.0 + dt * 3.8);
            outerMesh.rotation.z += dt * 14.0;
            coreMesh.rotation.z += dt * 14.0;
            torusMesh.rotation.z += dt * 14.0;
            outerMat.opacity = ratio * 0.92;
            coreMat.opacity = ratio;
            torusMat.opacity = ratio * 0.85;
        }
    });
}

// ② 物理飛散ヒットスパーク＆インパクトフラッシュ (45個の伸びる火花粒子)
function spawnHitSparks(hitPos, colorHex = 0xffd32a, count = 42) {
    const container = new THREE.Group();
    container.position.copy(hitPos).add(new THREE.Vector3(0, 1.05, 0));
    scene.add(container);

    // 中心インパクトフラッシュ球 + ショックリング
    const flashMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 })
    );
    const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.55, 24),
        new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0 })
    );
    ringMesh.lookAt(camera.position);
    container.add(flashMesh);
    container.add(ringMesh);

    // 飛び散る火花ストリーク
    const sparks = [];
    const sparkGeo = new THREE.ConeGeometry(0.035, 0.38, 6);
    sparkGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < count; i++) {
        const isWhite = i % 3 === 0;
        const mat = new THREE.MeshBasicMaterial({ color: isWhite ? 0xffffff : colorHex, transparent: true, opacity: 1.0 });
        const sp = new THREE.Mesh(sparkGeo, mat);

        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.3) * Math.PI;
        const speed = 5.5 + Math.random() * 10.5;
        const vel = new THREE.Vector3(
            Math.cos(phi) * Math.cos(theta) * speed,
            Math.sin(phi) * speed + 3.0,
            Math.cos(phi) * Math.sin(theta) * speed
        );
        sp.lookAt(vel);
        container.add(sp);
        sparks.push({ mesh: sp, vel, mat });
    }

    effectsList.push({
        mesh: container,
        life: 0.42,
        maxLife: 0.42,
        update: (dt, item) => {
            const ratio = item.life / item.maxLife;
            flashMesh.scale.multiplyScalar(1.18);
            flashMesh.material.opacity = Math.max(0, (ratio - 0.6) * 2.5);

            ringMesh.scale.multiplyScalar(1.22);
            ringMesh.material.opacity = ratio;
            ringMesh.lookAt(camera.position);

            sparks.forEach(s => {
                s.vel.y -= 22.0 * dt; // 重力
                s.mesh.position.addScaledVector(s.vel, dt);
                // 地面でバウンド
                if (s.mesh.position.y < -1.0) {
                    s.mesh.position.y = -1.0;
                    s.vel.y *= -0.5;
                }
                s.mesh.lookAt(s.mesh.position.clone().add(s.vel));
                s.mat.opacity = ratio;
            });
        }
    });
}

// ③ 地面叩きつけクレーター衝撃波 ＆ 飛散岩石デブリ ＆ 昇天光柱
function spawnGroundSlamVFX(pos, colorHex = 0xff4757, scale = 1.0) {
    const group = new THREE.Group();
    group.position.set(pos.x, 0.04, pos.z);
    scene.add(group);

    // 地面を走る2重の衝撃波リング
    const shockMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.4 * scale, 1.2 * scale, 36), shockMat);
    shockRing.rotation.x = -Math.PI / 2;
    group.add(shockRing);

    // 立ち昇る光の柱 (Light Pillar)
    const pillarMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.65 * scale, 0.95 * scale, 4.5 * scale, 24, 1, true), pillarMat);
    pillar.position.y = 2.25 * scale;
    group.add(pillar);

    // 飛び散る岩石デブリ (12個)
    const rocks = [];
    const rockGeo = new THREE.DodecahedronGeometry(0.14 * scale, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a795d, roughness: 0.8 });
    for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
        const rMesh = new THREE.Mesh(rockGeo, rockMat);
        rMesh.position.set(Math.cos(ang) * 0.6, 0.1, Math.sin(ang) * 0.6);
        group.add(rMesh);
        rocks.push({
            mesh: rMesh,
            vel: new THREE.Vector3(Math.cos(ang) * (4 + Math.random() * 4), 5 + Math.random() * 5, Math.sin(ang) * (4 + Math.random() * 4)),
            rotVel: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8)
        });
    }

    effectsList.push({
        mesh: group,
        life: 0.65,
        maxLife: 0.65,
        update: (dt, item) => {
            const ratio = item.life / item.maxLife;
            shockRing.scale.addScalar(dt * 9.5 * scale);
            shockMat.opacity = ratio;

            pillar.scale.x = 1.0 + (1.0 - ratio) * 1.2;
            pillar.scale.z = 1.0 + (1.0 - ratio) * 1.2;
            pillar.scale.y = 1.0 + (1.0 - ratio) * 0.6;
            pillarMat.opacity = ratio * 0.65;

            rocks.forEach(rk => {
                rk.vel.y -= 20.0 * dt;
                rk.mesh.position.addScaledVector(rk.vel, dt);
                if (rk.mesh.position.y < 0.05) {
                    rk.mesh.position.y = 0.05;
                    rk.vel.y *= -0.4;
                }
                rk.mesh.rotation.x += rk.rotVel.x * dt;
                rk.mesh.rotation.y += rk.rotVel.y * dt;
                rk.mesh.scale.setScalar(ratio);
            });
        }
    });
}

// ④ ステップ回避＆神速移動用のホログラム残像 (Afterimage Ghost)
function spawnAfterimageGhost(entity, colorHex = 0x00ffff) {
    const ghostGroup = new THREE.Group();
    ghostGroup.position.copy(entity.position);
    ghostGroup.rotation.y = entity.group.rotation.y;

    const ghostMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        transparent: true,
        opacity: 0.65
    });

    const bodyClone = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 6, 12), ghostMat);
    bodyClone.position.y = 0.95;
    ghostGroup.add(bodyClone);
    scene.add(ghostGroup);

    effectsList.push({
        mesh: ghostGroup,
        life: 0.35,
        maxLife: 0.35,
        update: (dt, item) => {
            ghostMat.opacity = (item.life / item.maxLife) * 0.65;
            item.mesh.scale.multiplyScalar(1.0 + dt * 0.5);
        }
    });
}

// ⑤ 走行時の足元砂煙ダスト (Footstep Dust Puff)
function spawnFootstepDust(pos) {
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xd2c49e, transparent: true, opacity: 0.5 });
    const dust = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), dustMat);
    dust.position.set(pos.x + (Math.random() - 0.5) * 0.3, 0.1, pos.z + (Math.random() - 0.5) * 0.3);
    scene.add(dust);

    effectsList.push({
        mesh: dust,
        life: 0.35,
        maxLife: 0.35,
        update: (dt, item) => {
            item.mesh.position.y += dt * 0.9;
            item.mesh.scale.addScalar(dt * 2.5);
            dustMat.opacity = (item.life / item.maxLife) * 0.45;
        }
    });
}

// ⑥ キャラクター別の固有必殺技 (EX Special) 3D VFX!
function spawnCharacterUltimateVFX(charType, attackerPos, targetPos, colorHex) {
    if (charType === "seraph") {
        // 👼 セラフ: 上空から18本の「蒼き聖光の槍 (Rain of Holy Spears)」が豪雨のように降り注ぎ、巨大聖光クロス柱が昇る！
        const group = new THREE.Group();
        scene.add(group);
        const spears = [];
        const spearGeo = new THREE.ConeGeometry(0.12, 2.6, 8);
        spearGeo.rotateX(Math.PI); // 下向き

        for (let i = 0; i < 18; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x00ffff : 0xffffff, transparent: true, opacity: 0.95 });
            const sp = new THREE.Mesh(spearGeo, mat);
            const offsetR = Math.random() * 2.8;
            const offsetAng = Math.random() * Math.PI * 2;
            sp.position.set(
                targetPos.x + Math.cos(offsetAng) * offsetR,
                6.0 + i * 0.45,
                targetPos.z + Math.sin(offsetAng) * offsetR
            );
            group.add(sp);
            spears.push({ mesh: sp, mat, impacted: false });
        }

        effectsList.push({
            mesh: group,
            life: 1.1,
            maxLife: 1.1,
            update: (dt, item) => {
                const ratio = item.life / item.maxLife;
                spears.forEach(s => {
                    if (s.mesh.position.y > 0.8) {
                        s.mesh.position.y -= dt * 28.0;
                    } else if (!s.impacted) {
                        s.impacted = true;
                        spawnHitSparks(new THREE.Vector3(s.mesh.position.x, 0, s.mesh.position.z), 0x00ffff, 12);
                    }
                    s.mat.opacity = ratio;
                });
            }
        });
        spawnGroundSlamVFX(targetPos, 0x00ffff, 1.8);

    } else if (charType === "kuro") {
        // 👹 クロガネ: 空間を切り裂く14本の「真紅の次元斬レーザードーム (Dimensional Crimson Slashes)」！
        const group = new THREE.Group();
        group.position.copy(targetPos).add(new THREE.Vector3(0, 1.2, 0));
        scene.add(group);

        const lines = [];
        const slashBeamGeo = new THREE.CylinderGeometry(0.04, 0.04, 5.2, 8);
        for (let i = 0; i < 14; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffffff : 0xff1e42, transparent: true, opacity: 1.0 });
            const beam = new THREE.Mesh(slashBeamGeo, mat);
            beam.position.set((Math.random() - 0.5) * 1.8, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.8);
            beam.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            group.add(beam);
            lines.push({ mesh: beam, mat });
        }

        const domeMat = new THREE.MeshBasicMaterial({ color: 0xff0033, wireframe: true, transparent: true, opacity: 0.9 });
        const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 2), domeMat);
        group.add(dome);

        effectsList.push({
            mesh: group,
            life: 0.85,
            maxLife: 0.85,
            update: (dt, item) => {
                const ratio = item.life / item.maxLife;
                dome.rotation.y += dt * 8.0;
                dome.scale.multiplyScalar(1.0 + dt * 1.8);
                domeMat.opacity = ratio;
                lines.forEach(l => {
                    l.mesh.scale.x = ratio * 1.5;
                    l.mesh.scale.z = ratio * 1.5;
                    l.mat.opacity = ratio;
                });
            }
        });
        spawnGroundSlamVFX(targetPos, 0xff1e42, 1.6);

    } else if (charType === "leo") {
        // 🦁 レオ: 覇王の赤黒落雷8連 + 超巨大「黄金メテオ拳塊」落下クラッシュ！
        const group = new THREE.Group();
        scene.add(group);

        // 巨大黄金メテオ球
        const meteorMat = new THREE.MeshBasicMaterial({ color: 0xffb800, wireframe: true, transparent: true, opacity: 1.0 });
        const meteor = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 1), meteorMat);
        meteor.position.set(targetPos.x, 5.5, targetPos.z);
        group.add(meteor);

        // 赤黒い覇王の稲妻柱 (8本)
        const bolts = [];
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const bMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff1133 : 0xffcc00, transparent: true, opacity: 1.0 });
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.18, 9.0, 6), bMat);
            bolt.position.set(targetPos.x + Math.cos(ang) * 1.8, 4.5, targetPos.z + Math.sin(ang) * 1.8);
            bolt.rotation.z = (Math.random() - 0.5) * 0.25;
            group.add(bolt);
            bolts.push({ mesh: bolt, mat: bMat });
        }

        effectsList.push({
            mesh: group,
            life: 0.9,
            maxLife: 0.9,
            update: (dt, item) => {
                const ratio = item.life / item.maxLife;
                if (meteor.position.y > 1.2) {
                    meteor.position.y -= dt * 18.0;
                } else {
                    meteor.scale.multiplyScalar(1.0 + dt * 3.5);
                }
                meteor.rotation.x += dt * 10;
                meteor.rotation.y += dt * 10;
                meteorMat.opacity = ratio;
                bolts.forEach(b => {
                    b.mat.opacity = (Math.random() > 0.2 ? ratio : 0.2);
                });
            }
        });
        spawnGroundSlamVFX(targetPos, 0xffaa00, 2.0);

    } else {
        // ⚔️ サイバーナイト: 極太プラズマ・バスターレーザー照射 & 5連スパイラルリング！
        const group = new THREE.Group();
        group.position.copy(attackerPos).add(new THREE.Vector3(0, 1.15, 0));
        group.lookAt(targetPos.x, 1.15, targetPos.z);
        scene.add(group);

        const beamLen = 14.0;
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.95 });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, beamLen, 16), beamMat);
        beam.rotation.x = Math.PI / 2;
        beam.position.z = beamLen / 2;
        group.add(beam);

        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, beamLen, 12), coreMat);
        core.rotation.x = Math.PI / 2;
        core.position.z = beamLen / 2;
        group.add(core);

        const rings = [];
        for (let i = 0; i < 6; i++) {
            const rMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
            const rMesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.1, 24), rMat);
            rMesh.position.z = 1.0 + i * 2.0;
            group.add(rMesh);
            rings.push({ mesh: rMesh, mat: rMat });
        }

        effectsList.push({
            mesh: group,
            life: 0.75,
            maxLife: 0.75,
            update: (dt, item) => {
                const ratio = item.life / item.maxLife;
                beam.scale.x = ratio * 1.4;
                beam.scale.z = ratio * 1.4;
                beamMat.opacity = ratio;
                coreMat.opacity = ratio;
                rings.forEach(r => {
                    r.mesh.scale.addScalar(dt * 4.5);
                    r.mesh.rotation.z += dt * 12.0;
                    r.mat.opacity = ratio;
                });
            }
        });
        spawnGroundSlamVFX(targetPos, 0x00ffff, 1.6);
    }
}

function addCombo(hits, damage) {
    comboHits += hits;
    comboDamage += damage;
    const disp = document.getElementById('combo-display');
    document.getElementById('combo-hits-num').innerText = comboHits;
    document.getElementById('combo-damage-num').innerText = comboDamage;
    disp.classList.add('active');

    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
        disp.classList.remove('active');
        comboHits = 0;
        comboDamage = 0;
    }, 2200);
}

// ========================================================
// 6. プレイヤー戦闘アクション (3段固有モーション + 必殺技 + 回避残像)
// ========================================================
function performPlayerAttack() {
    if (!isGameActive) return;
    if (player.state === "special" || player.state === "guard" || player.state === "dodge" || player.state === "down") return;

    // 攻撃中の連打でスムーズに次のコンボへチェイン可能
    if (player.state === "attack" && player.stateTimer > 0.14) return;

    player.comboStep = (player.comboStep % 3) + 1;
    player.state = "attack";
    player.stateDuration = player.comboStep === 3 ? 0.52 : (player.comboStep === 2 ? 0.40 : 0.32);
    player.stateTimer = player.stateDuration;

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();

    player.rotationY = Math.atan2(toCpu.x, toCpu.z);
    const lungeSpeed = player.comboStep === 3 ? 7.5 : 5.5;
    player.velocity.copy(toCpu.clone().normalize().multiplyScalar(lungeSpeed));

    // 多層クレセント斬撃波の生成
    const slashColor = player.comboStep === 3 ? 0xffd32a : player.themeColor;
    spawnCrescentSlash(player.position, cpu.position, slashColor, player.comboStep);

    // 3段目（ジャンピング兜割り）は着地タイミングで地面クラッシュ衝撃波も発生！
    if (player.comboStep === 3) {
        setTimeout(() => {
            const slamPos = player.position.clone().add(new THREE.Vector3(Math.sin(player.rotationY) * 1.4, 0, Math.cos(player.rotationY) * 1.4));
            spawnGroundSlamVFX(slamPos, player.themeColor, 1.15);
        }, 240);
    }

    // ヒット判定
    if (dist < 3.1) {
        let baseDmg = player.comboStep === 1 ? 48 : (player.comboStep === 2 ? 72 : 140);
        let isCrit = player.comboStep === 3;

        cameraShakeIntensity = isCrit ? 0.45 : 0.18;
        hitStopTimer = isCrit ? 0.08 : 0.035; // 気持ちいいヒットストップ！

        // 火花スパーク飛散
        spawnHitSparks(cpu.position, isCrit ? 0xffd32a : player.themeColor, isCrit ? 55 : 32);

        if (cpu.isGuarding) {
            baseDmg = Math.floor(baseDmg * 0.15);
            spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, baseDmg, "guard");
        } else {
            spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, baseDmg, isCrit ? "crit" : "normal");
            const knockForce = isCrit ? 10.5 : 3.8;
            cpu.velocity.add(toCpu.normalize().multiplyScalar(knockForce));
            cpu.state = isCrit ? "down" : "damaged";
            cpu.stateDuration = isCrit ? 0.85 : 0.32;
            cpu.stateTimer = cpu.stateDuration;
        }

        applyDamage('cpu', baseDmg);
        addCombo(1, baseDmg);

        player.sp = Math.min(player.maxSp, player.sp + 12);
        updateGauges();
    }
}

// プレイヤー必殺技（キャラ固有シネマティック演出 + 超ド派手VFX）
function performPlayerSpecial() {
    if (!isGameActive) return;
    if (player.sp < 50) {
        showAnnouncement("SP 不足！ (必要SP: 50)", "#ff4757");
        return;
    }
    if (player.state === "special" || player.state === "down") return;

    player.sp -= 50;
    updateGauges();

    player.state = "special";
    player.stateDuration = 1.35;
    player.stateTimer = 1.35;
    player.isInvincible = true;
    player.velocity.set(0, 0, 0);

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    player.rotationY = Math.atan2(toCpu.x, toCpu.z);

    // 発動オーラバースト
    spawnGroundSlamVFX(player.position, player.themeColor, 1.1);
    cinematicCameraMode = "zoom_player";

    const cutin = document.getElementById('special-cutin');
    const cutinChar = document.getElementById('cutin-char');
    const cutinSkill = document.getElementById('cutin-skill');
    cutinChar.innerText = document.getElementById('player-name').innerText.toUpperCase();
    cutinSkill.innerText = player.skillName || "🔥 覇皇烈空閃 (EX SPECIAL) 🔥";
    cutin.classList.add('active');

    setTimeout(() => {
        cutin.classList.remove('active');
        cinematicCameraMode = "action_wide";

        // クロガネ（居合い）の場合は敵の背後へ神速残像移動！
        if (player.charType === "kuro") {
            for (let i = 1; i <= 4; i++) {
                setTimeout(() => spawnAfterimageGhost(player, 0xff1e42), i * 35);
            }
            const behindCpu = cpu.position.clone().add(toCpu.clone().normalize().multiplyScalar(1.8));
            player.position.copy(behindCpu);
        }

        // キャラ固有の超ド派手VFX発動！
        spawnCharacterUltimateVFX(player.charType, player.position, cpu.position, player.themeColor);
        spawnHitSparks(cpu.position, 0xffd32a, 70);

        cameraShakeIntensity = 0.78;
        hitStopTimer = 0.11;

        const dmg = 390;
        applyDamage('cpu', dmg);
        spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, dmg, "crit");
        addCombo(6, dmg);

        cpu.velocity.add(toCpu.normalize().multiplyScalar(16.0));
        cpu.state = "down";
        cpu.stateDuration = 1.15;
        cpu.stateTimer = 1.15;

        showAnnouncement("ULTIMATE FINISH!! 💥", "#ffd32a");

        setTimeout(() => {
            cinematicCameraMode = null;
            player.isInvincible = false;
        }, 650);
    }, 520);
}

// プレイヤー回避（残像ステップ）
function performPlayerDodge() {
    if (!isGameActive) return;
    if (player.sp < 15) return;
    if (player.state === "dodge" || player.state === "special" || player.state === "down") return;

    player.sp -= 15;
    updateGauges();

    player.state = "dodge";
    player.stateDuration = 0.30;
    player.stateTimer = 0.30;
    player.isInvincible = true;

    let dir = new THREE.Vector3(input.moveX, 0, input.moveZ);
    if (dir.lengthSq() < 0.01) {
        dir.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotationY);
    } else {
        dir.normalize();
    }
    player.velocity.copy(dir.multiplyScalar(13.5));

    // 3連ホログラム残像を生成
    spawnAfterimageGhost(player, player.themeColor);
    setTimeout(() => spawnAfterimageGhost(player, player.themeColor), 75);
    setTimeout(() => spawnAfterimageGhost(player, player.themeColor), 150);

    setTimeout(() => {
        player.isInvincible = false;
    }, 300);
}

// ========================================================
// 7. ダメージ & HP/SP ゲージ反映
// ========================================================
function applyDamage(target, amount) {
    if (target === 'cpu') {
        cpu.hp = Math.max(0, cpu.hp - amount);
        updateGauges();
        if (cpu.hp <= 0 && isGameActive) {
            handleVictory();
        }
    } else {
        if (player.isInvincible) return;

        let finalDmg = Math.round(amount);
        if (player.isGuarding) {
            finalDmg = Math.floor(amount * 0.15);
            spawnHitSparks(player.position, 0x00d2d3, 20);
            spawnDamageNumber(player.position.x, player.position.y, player.position.z, finalDmg, "guard");
        } else {
            cameraShakeIntensity = 0.28;
            spawnHitSparks(player.position, 0xff4757, 35);
            spawnDamageNumber(player.position.x, player.position.y, player.position.z, finalDmg, "normal");
            player.state = "damaged";
            player.stateDuration = 0.32;
            player.stateTimer = 0.32;
        }

        player.hp = Math.max(0, player.hp - finalDmg);
        player.sp = Math.min(player.maxSp, player.sp + 8);
        updateGauges();

        if (player.hp <= 0 && isGameActive) {
            handleGameOver();
        }
    }
}

function updateGauges() {
    const playerHpPct = (player.hp / player.maxHp) * 100;
    const playerBar = document.getElementById('player-hp-bar');
    const playerDelay = document.getElementById('player-hp-delay');
    if (playerBar) playerBar.style.width = `${playerHpPct}%`;
    if (playerDelay) playerDelay.style.width = `${playerHpPct}%`;
    document.getElementById('player-hp-text').innerText = `${player.hp} / ${player.maxHp}`;

    const playerSpPct = (player.sp / player.maxSp) * 100;
    const playerSpBar = document.getElementById('player-sp-bar');
    if (playerSpBar) playerSpBar.style.width = `${playerSpPct}%`;
    document.getElementById('player-sp-text').innerText = `SP ${Math.floor(player.sp)} / ${player.maxSp}`;

    const cpuHpPct = (cpu.hp / cpu.maxHp) * 100;
    const cpuBar = document.getElementById('cpu-hp-bar');
    const cpuDelay = document.getElementById('cpu-hp-delay');
    if (cpuBar) cpuBar.style.width = `${cpuHpPct}%`;
    if (cpuDelay) cpuDelay.style.width = `${cpuHpPct}%`;
    document.getElementById('cpu-hp-text').innerText = `${cpu.hp} / ${cpu.maxHp}`;

    const cpuSpPct = (cpu.sp / cpu.maxSp) * 100;
    const cpuSpBar = document.getElementById('cpu-sp-bar');
    if (cpuSpBar) cpuSpBar.style.width = `${cpuSpPct}%`;
}

function showAnnouncement(text, color = "#ffd32a") {
    const elem = document.getElementById('battle-announcement');
    elem.innerText = text;
    elem.style.color = color;
    elem.classList.remove('active');
    void elem.offsetWidth;
    elem.classList.add('active');

    setTimeout(() => {
        elem.classList.remove('active');
    }, 1800);
}

function handleVictory() {
    isGameActive = false;
    isKoSlowMo = true;
    slowMoTimer = 1.3;
    spawnGroundSlamVFX(cpu.position, 0xffd32a, 1.8);
    showAnnouncement("K.O. !! 🏆 VICTORY!", "#ffd32a");

    currentWins++;
    document.getElementById('current-wins').innerText = currentWins;

    if (currentWins > highScore) {
        highScore = currentWins;
        localStorage.setItem("battle_high_score", highScore);
        document.getElementById('high-score').innerText = highScore;
    }

    setTimeout(() => {
        spawnNextCpu();
    }, 2100);
}

function handleGameOver() {
    isGameActive = false;
    player.state = "down";
    player.stateDuration = 2.0;
    player.stateTimer = 2.0;
    showAnnouncement("YOU LOSE... 💀", "#ff4757");

    if (currentWins > highScore) {
        highScore = currentWins;
        localStorage.setItem("battle_high_score", highScore);
        document.getElementById('high-score').innerText = highScore;
    }

    setTimeout(() => {
        document.getElementById('modal-wins').innerText = currentWins;
        document.getElementById('modal-high-score').innerText = highScore;
        document.getElementById('result-modal').style.display = 'flex';
    }, 1500);
}

function spawnNextCpu() {
    const style = CPU_STYLES[Math.floor(Math.random() * CPU_STYLES.length)];
    const name = ENEMY_NAMES[Math.floor(Math.random() * ENEMY_NAMES.length)];
    currentCpuInfo = {
        name: `Lv.${currentWins + 1} ${name}`,
        style: style.type,
        detail: style.detail,
        styleInfo: style
    };

    cpu.styleInfo = style;
    cpu.maxHp = Math.round(1000 * Math.pow(1.08, currentWins));
    cpu.hp = cpu.maxHp;
    cpu.sp = 30;
    cpu.speed = Math.min(7.5, 4.8 + currentWins * 0.15);
    cpu.position.set(4.5, 0, 0);
    cpu.velocity.set(0, 0, 0);
    cpu.state = "idle";

    if (currentWins > 0) {
        player.hp = Math.min(player.maxHp, Math.round(player.hp + player.maxHp * 0.35));
    } else {
        player.hp = player.maxHp;
    }
    player.sp = Math.min(player.maxSp, player.sp + 30);
    player.position.set(-4.5, 0, 0);
    player.velocity.set(0, 0, 0);
    player.state = "idle";

    document.getElementById('cpu-name').innerText = currentCpuInfo.name;
    document.getElementById('cpu-type').innerText = `${currentCpuInfo.style}`;

    setupCpuModel(style);
    spawnGroundSlamVFX(cpu.position, cpu.themeColor, 1.0);
    updateGauges();
    isGameActive = true;
    showAnnouncement(`ROUND ${currentWins + 1} - FIGHT!`, "#00d2d3");
}

function resetGame() {
    currentWins = 0;
    document.getElementById('current-wins').innerText = currentWins;
    document.getElementById('result-modal').style.display = 'none';

    player.hp = player.maxHp;
    player.sp = 60;
    player.position.set(-4.5, 0, 0);
    player.state = "idle";

    spawnNextCpu();
}

function shareOnX() {
    const text = `⚔️【3D自作キャラバトル】\nBlender×Three.js 古代遺跡コロシアムの死闘を制し、🔥【 ${currentWins} 連勝 】🔥 を達成！\n\n#自作キャラバトル #アンリミテッドクルーズ #VRM #Blender #Unity6`;
    const gameUrl = window.location.href;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(gameUrl)}`;
    window.open(xUrl, '_blank');
}

// ========================================================
// 8. CPU AI & 全身フルボディ・アクションモーションエンジン
// ========================================================
function updateCpuAI(dt, elapsedTime) {
    if (!isGameActive || cpu.state === "down") return;

    cpu.aiTimer -= dt;
    const toPlayer = new THREE.Vector3().subVectors(player.position, cpu.position);
    const dist = toPlayer.length();

    cpu.rotationY = Math.atan2(toPlayer.x, toPlayer.z);

    const atkPowerScale = Math.pow(1.05, currentWins);
    const intervalCooldown = Math.max(0.24, 0.58 - currentWins * 0.02);

    if (cpu.aiTimer <= 0) {
        cpu.aiTimer = intervalCooldown + Math.random() * 0.3;

        if (cpu.sp >= 50 && dist < 5.5 && Math.random() < 0.38) {
            cpu.sp -= 50;
            cpu.state = "special";
            cpu.stateDuration = 0.85;
            cpu.stateTimer = 0.85;
            updateGauges();
            showAnnouncement("⚠️ CPU SPECIAL ATTACK! ⚠️", "#ff4757");
            spawnCharacterUltimateVFX("kuro", cpu.position, player.position, 0xff4757);
            applyDamage('player', 230 * atkPowerScale);
            return;
        }

        if (cpu.styleInfo.category.includes("melee")) {
            if (dist > 2.2) {
                cpu.aiAction = "chase";
            } else {
                const r = Math.random();
                if (r < 0.64) cpu.aiAction = "attack";
                else if (r < 0.86) cpu.aiAction = "guard";
                else cpu.aiAction = "circle";
            }
        } else {
            if (dist < 3.5) cpu.aiAction = "retreat";
            else cpu.aiAction = "shoot";
        }
    }

    cpu.isGuarding = false;
    if (cpu.aiAction === "chase") {
        const moveDir = toPlayer.clone().normalize();
        cpu.velocity.add(moveDir.multiplyScalar(cpu.speed * dt * 5.2));
    } else if (cpu.aiAction === "attack" && cpu.state !== "attack" && cpu.state !== "special") {
        cpu.comboStep = (cpu.comboStep % 3) + 1;
        cpu.state = "attack";
        cpu.stateDuration = 0.42;
        cpu.stateTimer = 0.42;
        cpu.velocity.add(toPlayer.clone().normalize().multiplyScalar(3.5));
        spawnCrescentSlash(cpu.position, player.position, 0xff4757, cpu.comboStep);
        if (dist < 2.6) {
            applyDamage('player', 60 * atkPowerScale);
            cpu.sp = Math.min(cpu.maxSp, cpu.sp + 12);
        }
    } else if (cpu.aiAction === "guard") {
        cpu.isGuarding = true;
    } else if (cpu.aiAction === "retreat") {
        const moveDir = toPlayer.clone().negate().normalize();
        cpu.velocity.add(moveDir.multiplyScalar(cpu.speed * dt * 6.0));
    } else if (cpu.aiAction === "shoot" && cpu.state !== "attack") {
        cpu.state = "attack";
        cpu.stateDuration = 0.45;
        cpu.stateTimer = 0.45;
        spawnCrescentSlash(cpu.position, player.position, 0x9b59b6, 1);
        if (dist < 8.5) {
            applyDamage('player', 45 * atkPowerScale);
        }
    }

    setBarrierOpacity(cpu.guardBarrierMesh, cpu.isGuarding, elapsedTime);
}

/**
 * 全身フルボディ・アクションモーションエンジン
 * (animPivot によるジャンプ・前傾・360度スピン・空中宙返り + 胸・腕・脚の多関節連動)
 */
function updateFullBodyMotion(entity, dt, isMoving) {
    entity.animTime += dt * (isMoving ? 14.0 : 4.0);
    const t = entity.animTime;
    const pivot = entity.animPivot;
    const j = entity.customJoints || entity.joints || {};

    // 進行度 p (0.0 -> 1.0)
    const dur = Math.max(0.01, entity.stateDuration || 0.35);
    const p = THREE.MathUtils.clamp(1.0 - (entity.stateTimer / dur), 0.0, 1.0);

    // ピボットのリセット目標値
    let targetPivotY = 0;
    let targetPivotRotX = 0;
    let targetPivotRotY = 0;
    let targetPivotRotZ = 0;

    let torsoRotX = 0, torsoRotY = 0;
    let lArmX = 0, lArmZ = 0.18;
    let rArmX = 0, rArmZ = -0.18;
    let lLegX = 0, rLegX = 0;

    if (entity.state === "attack") {
        if (entity.comboStep === 1) {
            // 【1段目：踏み込み斜め袈裟斬り】溜め -> 腰を鋭く捻って一閃！
            const swingPhase = p < 0.25 ? -p * 2.0 : (p - 0.25) * 1.33;
            targetPivotRotX = 0.25; // 前傾踏み込み
            targetPivotY = -0.08 * Math.sin(p * Math.PI); // 重心沈み込み
            torsoRotY = THREE.MathUtils.lerp(-0.65, 0.85, Math.max(0, swingPhase));
            rArmX = THREE.MathUtils.lerp(-2.3, 0.75, Math.max(0, swingPhase));
            rArmZ = -0.35;
            lArmX = 0.55;
            lLegX = -0.5;
            rLegX = 0.5;

        } else if (entity.comboStep === 2) {
            // 【2段目：360度トルネード回転薙ぎ払い】全身が独楽のように1回転スピン！
            targetPivotRotY = p * Math.PI * 2.0;
            targetPivotRotX = 0.18;
            targetPivotY = Math.sin(p * Math.PI) * 0.22;
            rArmX = -1.35;
            rArmZ = -1.1; // 腕を水平に大きく広げる
            lArmX = -1.2;
            lArmZ = 1.1;
            lLegX = -0.35;
            rLegX = 0.35;

        } else {
            // 【3段目：空中フロントフリップ・メテオ兜割り】高く跳躍して空中で縦1回転スラム！
            targetPivotY = Math.sin(p * Math.PI) * 1.55;
            targetPivotRotX = p * Math.PI * 2.0; // 前方宙返り (サマーソルト/フロントフリップ)
            rArmX = -2.5 + p * 3.2;
            lArmX = -2.2 + p * 2.8;
            lLegX = 0.65;
            rLegX = -0.45;
        }

    } else if (entity.state === "special") {
        // 【必殺技モーション】キャラクタータイプに応じた劇的ポーズ
        if (entity.charType === "seraph") {
            // セラフ: 空中に神々しく浮遊し、両腕を大きく天に掲げる
            targetPivotY = Math.sin(p * Math.PI) * 1.85;
            rArmX = -2.4;
            rArmZ = -0.6;
            lArmX = -2.4;
            lArmZ = 0.6;
        } else if (entity.charType === "leo") {
            // レオ: 大跳躍から渾身のメテオスマッシュ
            targetPivotY = Math.sin(p * Math.PI) * 1.6;
            targetPivotRotX = 0.45;
            rArmX = -1.8 + p * 2.6;
            lArmX = -1.8 + p * 2.6;
        } else {
            // 居合い・抜刀突撃ポーズ
            targetPivotRotX = 0.38;
            torsoRotY = Math.sin(p * Math.PI * 4) * 0.9;
            rArmX = -1.5;
            lArmX = 0.6;
        }

    } else if (entity.state === "dodge") {
        // 【ステップ回避】低い姿勢でアクロバティックなスピン回避
        targetPivotY = 0.25;
        targetPivotRotZ = p * Math.PI * 2.0;
        targetPivotRotX = 0.35;

    } else if (entity.state === "damaged") {
        // 【被弾仰け反り】
        targetPivotRotX = -0.48 * Math.sin(p * Math.PI);
        rArmX = -0.6;
        lArmX = -0.6;

    } else if (entity.state === "down") {
        // 【吹き飛び＆ダウン】空中でバク転しながら倒れ込む
        targetPivotY = Math.max(0, Math.sin(p * Math.PI) * 1.1);
        targetPivotRotX = -Math.min(Math.PI * 0.48, p * Math.PI * 1.2);
        rArmX = -1.2;
        lArmX = -1.2;

    } else if (entity.isGuarding) {
        // 【ガード構え】重心を落とし、両腕を胸の前でクロス
        targetPivotY = -0.10;
        targetPivotRotX = 0.12;
        lArmX = -1.15;
        lArmZ = -0.35;
        rArmX = -1.15;
        rArmZ = 0.35;
        lLegX = -0.3;
        rLegX = 0.3;

    } else if (isMoving) {
        // 【前傾スプリント走行】腰バウンス + 胸ツイスト + 腕脚の力強い振り
        targetPivotRotX = 0.26;
        targetPivotY = Math.abs(Math.sin(t)) * 0.11;
        torsoRotY = Math.sin(t) * 0.28;
        lLegX = Math.sin(t) * 0.85;
        rLegX = -Math.sin(t) * 0.85;
        lArmX = -Math.sin(t) * 0.78 - 0.2;
        rArmX = Math.sin(t) * 0.78 - 0.3;

    } else {
        // 【ファイティングスタンス（格闘待機構え）】呼吸バウンス + 半身構え
        targetPivotY = Math.sin(t * 0.8) * 0.04;
        torsoRotY = -0.25;
        rArmX = -0.55 + Math.sin(t * 0.8) * 0.08;
        lArmX = -0.40 - Math.sin(t * 0.8) * 0.08;
        lLegX = -0.18;
        rLegX = 0.18;
    }

    // ピボットへ適用
    if (pivot) {
        pivot.position.y = targetPivotY;
        pivot.rotation.set(targetPivotRotX, targetPivotRotY, targetPivotRotZ);
    }

    // 関節へ適用
    if (j.torso) {
        j.torso.rotation.x = torsoRotX;
        j.torso.rotation.y = torsoRotY;
    }
    if (j.leftArm) {
        j.leftArm.rotation.x = lArmX;
        j.leftArm.rotation.z = lArmZ;
    }
    if (j.rightArm) {
        j.rightArm.rotation.x = rArmX;
        j.rightArm.rotation.z = rArmZ;
    }
    if (j.leftLeg) j.leftLeg.rotation.x = lLegX;
    if (j.rightLeg) j.rightLeg.rotation.x = rLegX;
}

// ========================================================
// 9. メイン更新 & ポストプロセスレンダーループ
// ========================================================
function animate() {
    requestAnimationFrame(animate);

    let rawDt = Math.min(clock.getDelta(), 0.05);
    const elapsedTime = clock.getElapsedTime();

    // ヒットストップ処理 (打撃の瞬間に画面がピタッと止まり、カメラだけが震える！)
    if (hitStopTimer > 0) {
        hitStopTimer -= rawDt;
        if (cameraShakeIntensity > 0.01) {
            camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity * 0.6;
            camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity * 0.6;
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

    // 松明の炎のゆらぎ
    torchFlames.forEach((tf, i) => {
        const flicker = Math.sin(elapsedTime * 9.0 + i * 1.7) * 0.65;
        tf.light.intensity = 4.5 + flicker;
        tf.mesh.position.y = tf.baseY + Math.sin(elapsedTime * 7.0 + i) * 0.06;
        tf.mesh.rotation.y += dt * 3.5;
    });

    // 海面のさざ波
    if (seaWaterMesh) {
        seaWaterMesh.position.y = -8.0 + Math.sin(elapsedTime * 1.2) * 0.18;
    }

    // SP自然回復
    if (isGameActive) {
        player.sp = Math.min(player.maxSp, player.sp + 3.5 * dt);
        cpu.sp = Math.min(cpu.maxSp, cpu.sp + 2.6 * dt);
        updateGauges();
    }

    // --- プレイヤー操作・移動更新 ---
    let playerMoving = false;
    if (isGameActive && player.state !== "special" && player.state !== "down") {
        player.isGuarding = input.guard && player.state !== "attack";
        setBarrierOpacity(player.guardBarrierMesh, player.isGuarding, elapsedTime);

        if (!player.isGuarding && player.state !== "attack" && (Math.abs(input.moveX) > 0.05 || Math.abs(input.moveZ) > 0.05)) {
            player.state = "move";
            playerMoving = true;
            const camForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
            const camRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

            const moveVec = new THREE.Vector3()
                .addScaledVector(camRight, input.moveX)
                .addScaledVector(camForward, -input.moveZ)
                .normalize();

            player.velocity.add(moveVec.multiplyScalar(player.speed * dt * 7.2));

            // 走行時の砂煙ダスト
            dustTimer -= dt;
            if (dustTimer <= 0) {
                spawnFootstepDust(player.position);
                dustTimer = 0.12;
            }

            if (input.lockOn) {
                const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
                player.rotationY = Math.atan2(toCpu.x, toCpu.z);
            } else {
                player.rotationY = Math.atan2(moveVec.x, moveVec.z);
            }
        } else if (player.state === "move") {
            player.state = "idle";
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
        if (cpu.stateTimer <= 0) cpu.state = "idle";
    }

    updateCpuAI(dt, elapsedTime);

    // 物理移動
    player.position.addScaledVector(player.velocity, dt);
    player.velocity.multiplyScalar(0.83);

    cpu.position.addScaledVector(cpu.velocity, dt);
    cpu.velocity.multiplyScalar(0.83);

    // アリーナ境界制限
    const pDist = Math.hypot(player.position.x, player.position.z);
    if (pDist > arenaRadius - 0.8) {
        player.position.multiplyScalar((arenaRadius - 0.8) / pDist);
    }
    const cDist = Math.hypot(cpu.position.x, cpu.position.z);
    if (cDist > arenaRadius - 0.8) {
        cpu.position.multiplyScalar((arenaRadius - 0.8) / cDist);
    }

    player.group.position.copy(player.position);
    player.group.rotation.y = player.rotationY + (player.isVrm && !player.isCustomRig ? 0 : Math.PI);

    cpu.group.position.copy(cpu.position);
    cpu.group.rotation.y = cpu.rotationY + Math.PI;

    // 全身フルボディモーションの適用
    if (player.vrm) player.vrm.update(dt);
    updateFullBodyMotion(player, dt, playerMoving);

    const cpuMoving = cpu.velocity.lengthSq() > 0.25;
    updateFullBodyMotion(cpu, dt, cpuMoving);

    // サイキッカーのBlender念動オーブ回転
    cpu.orbs.forEach(item => {
        const angle = elapsedTime * 3.0 + item.angleOffset;
        item.mesh.position.set(Math.cos(angle) * 1.0, 1.25 + Math.sin(elapsedTime * 3.5) * 0.18, Math.sin(angle) * 1.0);
        item.mesh.rotation.y += dt * 3.5;
        item.mesh.rotation.x += dt * 2.0;
    });

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

    // --- TPSカメラ制御 + 必殺技シネマティックカメラ + カメラシェイク ---
    const midPoint = new THREE.Vector3().addVectors(player.position, cpu.position).multiplyScalar(0.5);
    const toMid = new THREE.Vector3().subVectors(player.position, midPoint).normalize();
    let camTargetPos;
    let lookTarget = new THREE.Vector3(midPoint.x, 1.15, midPoint.z);

    if (cinematicCameraMode === "zoom_player") {
        // 必殺技カットイン時：プレイヤーの斜め正面へ急接近クローズアップ！
        const frontDir = new THREE.Vector3(Math.sin(player.rotationY), 0, Math.cos(player.rotationY));
        camTargetPos = player.position.clone().addScaledVector(frontDir, 2.2).add(new THREE.Vector3(0.8, 1.45, 0));
        lookTarget.copy(player.position).add(new THREE.Vector3(0, 1.35, 0));
        camera.position.lerp(camTargetPos, 0.22);
    } else if (cinematicCameraMode === "action_wide") {
        // 必殺技炸裂時：戦場全体をドラマチックな斜め俯瞰から捉える！
        camTargetPos = midPoint.clone().addScaledVector(toMid, 5.8).add(new THREE.Vector3(1.5, 4.2, 1.5));
        camera.position.lerp(camTargetPos, 0.14);
    } else {
        camTargetPos = player.position.clone()
            .addScaledVector(toMid, 4.2)
            .add(new THREE.Vector3(0, 2.85, 0));
        camera.position.lerp(camTargetPos, 0.10);
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
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
}

// ========================================================
// 10. 入力イベントバインド
// ========================================================
function setupInputs() {
    window.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup') input.moveZ = 1;
        if (k === 's' || k === 'arrowdown') input.moveZ = -1;
        if (k === 'a' || k === 'arrowleft') input.moveX = -1;
        if (k === 'd' || k === 'arrowright') input.moveX = 1;

        if (k === 'j' || k === 'z') performPlayerAttack();
        if (k === 'k' || k === 'x') performPlayerSpecial();
        if (k === ' ') { input.guard = true; e.preventDefault(); }
        if (k === 'l' || k === 'shift') performPlayerDodge();
        if (k === 'q') input.lockOn = !input.lockOn;
    });

    window.addEventListener('keyup', e => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 's' || k === 'arrowup' || k === 'arrowdown') input.moveZ = 0;
        if (k === 'a' || k === 'd' || k === 'arrowleft' || k === 'arrowright') input.moveX = 0;
        if (k === ' ') input.guard = false;
    });

    setupTouchJoystick();

    const bindBtn = (id, onDown, onUp) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', e => { e.preventDefault(); if (onDown) onDown(); });
        el.addEventListener('touchend', e => { e.preventDefault(); if (onUp) onUp(); });
        el.addEventListener('mousedown', e => { if (onDown) onDown(); });
        el.addEventListener('mouseup', e => { if (onUp) onUp(); });
    };

    bindBtn('t-btn-attack', performPlayerAttack);
    bindBtn('t-btn-special', performPlayerSpecial);
    bindBtn('t-btn-dodge', performPlayerDodge);
    bindBtn('t-btn-guard', () => { input.guard = true; }, () => { input.guard = false; });

    document.getElementById('btn-share-x').addEventListener('click', shareOnX);
    document.getElementById('btn-retry').addEventListener('click', resetGame);
}

function setupTouchJoystick() {
    const zone = document.getElementById('joystick-zone');
    const stick = document.getElementById('joystick-stick');
    if (!zone || !stick) return;

    let touchId = null;
    let startX = 0, startY = 0;

    zone.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        const rect = zone.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
    });

    zone.addEventListener('touchmove', e => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === touchId) {
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                const dist = Math.hypot(dx, dy);
                const maxR = 40;
                const angle = Math.atan2(dy, dx);
                const clamped = Math.min(dist, maxR);

                stick.style.transform = `translate(${Math.cos(angle) * clamped}px, ${Math.sin(angle) * clamped}px)`;

                input.moveX = (Math.cos(angle) * clamped) / maxR;
                input.moveZ = -(Math.sin(angle) * clamped) / maxR;
                break;
            }
        }
    });

    const resetStick = () => {
        stick.style.transform = `translate(0px, 0px)`;
        input.moveX = 0;
        input.moveZ = 0;
        touchId = null;
    };

    zone.addEventListener('touchend', resetStick);
    zone.addEventListener('touchcancel', resetStick);
}

// ========================================================
// 11. 初期起動
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('high-score').innerText = highScore;
    setupInputs();
    setupVrmLoader();
    initScene();
});
