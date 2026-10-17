import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ========================================================
// 1. ゲーム設定 & マスターデータ (Blender 5.2 & アンリミ仕様)
// ========================================================
const CPU_STYLES = [
    { type: "近接型（武器ナシ）", suffix: "拳法家", detail: "高速コンボラッシュ & ステップ回避", category: "melee-bare" },
    { type: "近接型（武器アリ）", suffix: "重戦士", detail: "大剣豪快撃 & 鉄壁ガード", category: "melee-weapon" },
    { type: "狙撃型（武器ナシ）", suffix: "サイキッカー", detail: "念動ホーミング弾 & 広範囲衝撃波", category: "snipe-bare" },
    { type: "狙撃型（武器アリ）", suffix: "スナイパー", detail: "遠距離高速ライフル & バックステップ", category: "snipe-weapon" }
];

const ENEMY_NAMES = ["ドロイド", "シャドウ", "ギガント", "ハンター", "ヴァルキリー", "プロトタイプ", "ベルセルク", "ファントム"];

// ゲーム状態
let currentWins = 0;
let highScore = parseInt(localStorage.getItem("battle_high_score") || "0", 10);
let currentCpuInfo = {};
let isGameActive = true;
let isKoSlowMo = false;
let slowMoTimer = 0;
let cameraShakeIntensity = 0;

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

// ステージ要素
let arenaRadius = 10.2;
let torchFlames = [];
let seaWaterMesh = null;
let effectsList = [];

// プレイヤー管理オブジェクト
const player = {
    group: null,
    mesh: null,
    joints: {},
    vrm: null,
    isVrm: false,
    hp: 1000,
    maxHp: 1000,
    sp: 50,
    maxSp: 100,
    position: new THREE.Vector3(-4.2, 0, 0),
    rotationY: Math.PI / 2,
    velocity: new THREE.Vector3(),
    speed: 6.8,
    state: "idle",
    stateTimer: 0,
    comboStep: 0,
    isGuarding: false,
    isInvincible: false,
    guardBarrierMesh: null,
    animTime: 0
};

// CPU管理オブジェクト
const cpu = {
    group: null,
    mesh: null,
    joints: {},
    weaponMesh: null,
    orbs: [],
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
// 2. Three.js 初期化 & UnrealBloom ポストプロセス & Blenderアセット読込
// ========================================================
async function initScene() {
    const container = document.getElementById('three-canvas-container');
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e2f42);
    scene.fog = new THREE.FogExp2(0x2a3f54, 0.022);

    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 250);
    camera.position.set(0, 4.5, 9);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // UnrealBloomPass (ポストプロセス発光)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.55, // strength
        0.4,  // radius
        0.75  // threshold
    );
    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // ライティング（太陽のディレクショナルライト＋環境光＋半球光）
    const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x223344, 1.15);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.5);
    sunLight.position.set(14, 24, 12);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 60;
    const d = 15;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    // プレイヤーとCPUのグループ準備
    player.group = new THREE.Group();
    scene.add(player.group);
    player.guardBarrierMesh = createBarrierMesh(0x00d2d3);
    player.group.add(player.guardBarrierMesh);

    cpu.group = new THREE.Group();
    scene.add(cpu.group);
    cpu.guardBarrierMesh = createBarrierMesh(0xff4757);
    cpu.group.add(cpu.guardBarrierMesh);

    // 海と松明ライトを構築し、Blender 5.2 で生成した GLB モデル群をロード
    buildOceanAndTorchLights();
    await loadBlenderModels();

    // プレイヤー初期モデルの配置
    setupPlayerMeshFromBlender();

    // 初回CPUの生成
    spawnNextCpu();

    window.addEventListener('resize', onResize);
    animate();
}

// 大海原と4基の松明エフェクト＆ライト構築
function buildOceanAndTorchLights() {
    const oceanGeo = new THREE.PlaneGeometry(350, 350, 48, 48);
    const oceanMat = new THREE.MeshStandardMaterial({
        color: 0x0d2b45,
        roughness: 0.15,
        metalness: 0.85
    });
    seaWaterMesh = new THREE.Mesh(oceanGeo, oceanMat);
    seaWaterMesh.rotation.x = -Math.PI / 2;
    seaWaterMesh.position.y = -8.0;
    scene.add(seaWaterMesh);

    // Blenderのコロシアム上の4基の篝火位置に合わせて動的な炎パーティクル＆PointLightを配置
    const torchAngles = [30, 150, 210, 330];
    const r = 11.0 * 0.75;
    torchAngles.forEach(deg => {
        const rad = THREE.MathUtils.degToRad(deg);
        const x = Math.cos(rad) * r;
        const z = Math.sin(rad) * r;

        const fireLight = new THREE.PointLight(0xff6b22, 4.5, 9.5);
        fireLight.position.set(x, 2.35, z);
        scene.add(fireLight);

        const flameGeo = new THREE.OctahedronGeometry(0.26, 1);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const flameMesh = new THREE.Mesh(flameGeo, flameMat);
        flameMesh.position.set(x, 2.1, z);
        scene.add(flameMesh);

        torchFlames.push({ light: fireLight, mesh: flameMesh, baseX: x, baseY: 2.1, baseZ: z });
    });
}

// Blender 5.2 で生成された GLB モデル群の非同期ロード
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

// Blender製アーマーファイターをクローン＆カラーカスタマイズして関節を取得
function createFighterInstance(mainColorHex, glowColorHex) {
    if (!blenderCache.fighterScene) {
        // 万一のフォールバック
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: mainColorHex }));
        box.position.y = 0.75;
        g.add(box);
        return { root: g, joints: {} };
    }

    const root = blenderCache.fighterScene.clone(true);
    const joints = {};

    root.traverse(child => {
        if (child.name === "LeftArm") joints.leftArm = child;
        if (child.name === "RightArm") joints.rightArm = child;
        if (child.name === "LeftLeg") joints.leftLeg = child;
        if (child.name === "RightLeg") joints.rightLeg = child;
        if (child.name === "Torso") joints.torso = child;

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
                    child.material.emissiveIntensity = 3.5;
                }
            }
        }
    });

    return { root, joints };
}

function setupPlayerMeshFromBlender() {
    if (player.mesh) player.group.remove(player.mesh);
    const { root, joints } = createFighterInstance(0x1e90ff, 0x00ffff);
    player.mesh = root;
    player.joints = joints;
    player.mesh.visible = !player.isVrm;
    player.group.add(player.mesh);

    // プレイヤーにも右手用の光のブレイドを装備
    if (blenderCache.greatswordScene && joints.rightArm) {
        const pSword = blenderCache.greatswordScene.clone(true);
        pSword.scale.set(0.8, 0.8, 0.8);
        pSword.position.set(0.36, -0.35, 0.25);
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

// 防御バリアエフェクト
function createBarrierMesh(colorHex) {
    const geo = new THREE.IcosahedronGeometry(1.18, 2);
    const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        transparent: true,
        opacity: 0.0
    });
    const barrier = new THREE.Mesh(geo, mat);
    barrier.position.y = 1.0;
    return barrier;
}

// ========================================================
// 3. CPUの3Dモデル & Blender製専用武器の装備
// ========================================================
function setupCpuModel(styleInfo) {
    if (cpu.mesh) cpu.group.remove(cpu.mesh);
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

    const { root, joints } = createFighterInstance(mainColor, glowColor);
    cpu.mesh = root;
    cpu.joints = joints;
    cpu.group.add(cpu.mesh);

    const attachParent = joints.rightArm || cpu.group;

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

    // 制作した3体のアップロード用キャラクター (.vrm) のワンクリック召喚ボタン
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
                player.group.remove(player.vrm.scene);
                VRMUtils.deepDispose(player.vrm.scene);
                player.vrm = null;
            }
            if (player.customGlb) {
                player.group.remove(player.customGlb);
                player.customGlb = null;
            }
            if (player.mesh) player.mesh.visible = false;

            modelRoot.traverse(obj => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });

            // Blender出力の自作キャラか外部VRMかに応じて向きとボーンを設定
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
                player.group.add(vrm.scene);
            } else {
                player.customGlb = modelRoot;
                player.isVrm = true;
                player.group.add(modelRoot);
            }

            // カスタム関節ノードの抽出（歩行・攻撃スイング連動）
            const customJoints = {};
            modelRoot.traverse(c => {
                if (c.name === "leftUpperArm" || c.name === "LeftArm") customJoints.leftArm = c;
                if (c.name === "rightUpperArm" || c.name === "RightArm") customJoints.rightArm = c;
                if (c.name === "leftUpperLeg" || c.name === "LeftLeg") customJoints.leftLeg = c;
                if (c.name === "rightUpperLeg" || c.name === "RightLeg") customJoints.rightLeg = c;
            });
            player.customJoints = customJoints;

            // メタデータ＆固有必殺技名の反映
            const metaName = vrm?.meta?.name || vrm?.meta?.title || fileName.replace(/\.(vrm|glb)$/i, '');
            let iconSym = '🦸';
            let skillName = '🔥 覇皇烈空閃 (EX SPECIAL) 🔥';
            if (fileName.includes('valkyrie_seraph') || metaName.includes('セラフ')) {
                iconSym = '👼';
                skillName = '🌟 聖裁・セラフィック・ノヴァ 🌟';
            } else if (fileName.includes('crimson_samurai') || metaName.includes('クロガネ')) {
                iconSym = '👹';
                skillName = '⚡ 秘剣・紅蓮一閃 ⚡';
            } else if (fileName.includes('golden_brawler') || metaName.includes('レオ')) {
                iconSym = '🦁';
                skillName = '🔥 覇王・獅子奮迅撃 🔥';
            }
            player.skillName = skillName;

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

// Unity版 UserCharacterLoader と同様の PNG/JPG テクスチャ動的適用機能
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
        showAnnouncement("カスタム画像テクスチャ適用完了！", "#ffd32a");
    });
}

function restoreDefaultPlayer() {
    if (player.vrm) {
        player.group.remove(player.vrm.scene);
        VRMUtils.deepDispose(player.vrm.scene);
        player.vrm = null;
    }
    if (player.customGlb) {
        player.group.remove(player.customGlb);
        player.customGlb = null;
    }
    player.isVrm = false;
    player.customJoints = null;
    player.skillName = "🔥 覇皇烈空閃 (EX SPECIAL) 🔥";
    setupPlayerMeshFromBlender();

    document.getElementById('player-name').innerText = "Cyber Knight";
    document.getElementById('player-avatar-icon').innerText = '⚔️';
    document.getElementById('avatar-status-text').innerText = "現在: Blender 5.2 アーマーナイト (custom_characters/ 内の .vrm / .png をD&D可能)";
    document.getElementById('reset-avatar-btn').style.display = 'none';
    showAnnouncement("デフォルトアーマーに戻しました", "#ced6e0");
}

// ========================================================
// 5. バトルアクション & ブルーム発光エフェクト & コンボロジック
// ========================================================
function spawnDamageNumber(x, y, z, damage, type = "normal") {
    const layer = document.getElementById('damage-numbers-layer');
    if (!layer) return;

    const pos = new THREE.Vector3(x, y + 1.4, z);
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
    }, 800);
}

// 発光スラッシュエフェクト & ヒットスパーク
function createSlashEffect(origin, targetPos, color = 0xffd32a, size = 1.0) {
    const slashGeo = new THREE.RingGeometry(0.35, 1.15 * size, 24, 1, 0, Math.PI * 1.05);
    const slashMat = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95
    });
    const slash = new THREE.Mesh(slashGeo, slashMat);
    slash.position.copy(origin).add(new THREE.Vector3(0, 1.05, 0));
    slash.lookAt(targetPos.x, 1.05, targetPos.z);
    slash.rotation.z = (Math.random() - 0.5) * Math.PI;
    scene.add(slash);

    effectsList.push({
        mesh: slash,
        life: 0.22,
        maxLife: 0.22,
        update: (dt, item) => {
            item.mesh.scale.multiplyScalar(1.14);
            item.mesh.material.opacity = (item.life / item.maxLife) * 0.95;
        }
    });
}

// 必殺技の超巨大爆発/衝撃波
function createSpecialExplosion(pos) {
    const sphereGeo = new THREE.IcosahedronGeometry(2.2, 2);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xffd32a,
        wireframe: true,
        transparent: true,
        opacity: 1.0
    });
    const boom = new THREE.Mesh(sphereGeo, sphereMat);
    boom.position.copy(pos).add(new THREE.Vector3(0, 1.1, 0));
    scene.add(boom);

    const shockGeo = new THREE.RingGeometry(0.6, 4.2, 36);
    const shockMat = new THREE.MeshBasicMaterial({ color: 0xff4757, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const shock = new THREE.Mesh(shockGeo, shockMat);
    shock.rotation.x = -Math.PI / 2;
    shock.position.copy(pos).add(new THREE.Vector3(0, 0.08, 0));
    scene.add(shock);

    effectsList.push({
        mesh: boom,
        shock: shock,
        life: 0.65,
        maxLife: 0.65,
        update: (dt, item) => {
            item.mesh.scale.multiplyScalar(1.12);
            item.shock.scale.multiplyScalar(1.15);
            const ratio = item.life / item.maxLife;
            item.mesh.material.opacity = ratio;
            item.shock.material.opacity = ratio;
            if (item.life <= 0) {
                scene.remove(item.shock);
            }
        }
    });
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

// プレイヤー通常攻撃
function performPlayerAttack() {
    if (!isGameActive) return;
    if (player.state === "special" || player.state === "guard" || player.state === "dodge" || player.state === "down") return;

    player.comboStep = (player.comboStep % 3) + 1;
    player.state = "attack";
    player.stateTimer = 0.32;

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();

    player.rotationY = Math.atan2(toCpu.x, toCpu.z);
    player.velocity.copy(toCpu.normalize().multiplyScalar(4.8));

    const slashColor = player.comboStep === 3 ? 0xff4757 : 0x00ffff;
    createSlashEffect(player.position, cpu.position, slashColor, player.comboStep === 3 ? 1.55 : 1.05);

    if (dist < 2.7) {
        let baseDmg = player.comboStep === 1 ? 45 : (player.comboStep === 2 ? 65 : 125);
        let isCrit = player.comboStep === 3;

        cameraShakeIntensity = isCrit ? 0.35 : 0.14;

        if (cpu.isGuarding) {
            baseDmg = Math.floor(baseDmg * 0.15);
            spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, baseDmg, "guard");
        } else {
            spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, baseDmg, isCrit ? "crit" : "normal");
            const knockForce = isCrit ? 8.5 : 3.2;
            cpu.velocity.add(toCpu.normalize().multiplyScalar(knockForce));
            cpu.state = isCrit ? "down" : "damaged";
            cpu.stateTimer = isCrit ? 0.7 : 0.3;
        }

        applyDamage('cpu', baseDmg);
        addCombo(1, baseDmg);

        player.sp = Math.min(player.maxSp, player.sp + 10);
        updateGauges();
    }
}

// プレイヤー必殺技（SP50消費）
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
    player.stateTimer = 1.25;
    player.velocity.set(0, 0, 0);

    const cutin = document.getElementById('special-cutin');
    const cutinChar = document.getElementById('cutin-char');
    const cutinSkill = document.getElementById('cutin-skill');
    cutinChar.innerText = document.getElementById('player-name').innerText.toUpperCase();
    cutinSkill.innerText = player.skillName || "🔥 覇皇烈空閃 (EX SPECIAL) 🔥";
    cutin.classList.add('active');

    setTimeout(() => {
        cutin.classList.remove('active');

        const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
        player.rotationY = Math.atan2(toCpu.x, toCpu.z);

        createSpecialExplosion(cpu.position);
        cameraShakeIntensity = 0.65;

        const dmg = 380;
        applyDamage('cpu', dmg);
        spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, dmg, "crit");
        addCombo(5, dmg);

        cpu.velocity.add(toCpu.normalize().multiplyScalar(15.0));
        cpu.state = "down";
        cpu.stateTimer = 1.0;

        showAnnouncement("CRITICAL SPECIAL HIT! 💥", "#ffd32a");
    }, 520);
}

// プレイヤー回避
function performPlayerDodge() {
    if (!isGameActive) return;
    if (player.sp < 15) return;
    if (player.state === "dodge" || player.state === "special" || player.state === "down") return;

    player.sp -= 15;
    updateGauges();

    player.state = "dodge";
    player.stateTimer = 0.28;
    player.isInvincible = true;

    let dir = new THREE.Vector3(input.moveX, 0, input.moveZ);
    if (dir.lengthSq() < 0.01) {
        dir.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotationY);
    } else {
        dir.normalize();
    }
    player.velocity.copy(dir.multiplyScalar(12.5));

    setTimeout(() => {
        player.isInvincible = false;
    }, 280);
}

// ========================================================
// 6. ダメージ & HP/SP ゲージ反映 (Unity版と同等の難易度スケーリング)
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
            spawnDamageNumber(player.position.x, player.position.y, player.position.z, finalDmg, "guard");
        } else {
            cameraShakeIntensity = 0.22;
            spawnDamageNumber(player.position.x, player.position.y, player.position.z, finalDmg, "normal");
            player.state = "damaged";
            player.stateTimer = 0.3;
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
    slowMoTimer = 1.2;
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
    }, 2000);
}

function handleGameOver() {
    isGameActive = false;
    player.state = "down";
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

    // SurvivalGameManager と同等の段階的強化 (Scale Difficulty)
    cpu.styleInfo = style;
    cpu.maxHp = Math.round(1000 * Math.pow(1.08, currentWins));
    cpu.hp = cpu.maxHp;
    cpu.sp = 30;
    cpu.speed = Math.min(7.5, 4.8 + currentWins * 0.15);
    cpu.position.set(4.5, 0, 0);
    cpu.velocity.set(0, 0, 0);
    cpu.state = "idle";

    // プレイヤー体力引き継ぎ (PercentageBonusHeal: 35%ボーナス回復)
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
    updateGauges();
    isGameActive = true;
    showAnnouncement(`ROUND ${currentWins + 1} - FIGHT!`, "#00d2d3");
}

function resetGame() {
    currentWins = 0;
    document.getElementById('current-wins').innerText = currentWins;
    document.getElementById('result-modal').style.display = 'none';

    player.hp = player.maxHp;
    player.sp = 50;
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
// 7. CPU AI & Blenderモデルの関節アニメーション
// ========================================================
function updateCpuAI(dt) {
    if (!isGameActive || cpu.state === "down") return;

    cpu.aiTimer -= dt;
    const toPlayer = new THREE.Vector3().subVectors(player.position, cpu.position);
    const dist = toPlayer.length();

    cpu.rotationY = Math.atan2(toPlayer.x, toPlayer.z);

    // 連勝数に応じてAIの反応速度と攻撃倍率が強化
    const atkPowerScale = Math.pow(1.05, currentWins);
    const intervalCooldown = Math.max(0.22, 0.55 - currentWins * 0.02);

    if (cpu.aiTimer <= 0) {
        cpu.aiTimer = intervalCooldown + Math.random() * 0.3;

        if (cpu.sp >= 50 && dist < 5.2 && Math.random() < 0.38) {
            cpu.sp -= 50;
            cpu.state = "attack";
            cpu.stateTimer = 0.8;
            updateGauges();
            showAnnouncement("⚠️ CPU SPECIAL ATTACK! ⚠️", "#ff4757");
            createSpecialExplosion(player.position);
            applyDamage('player', 240 * atkPowerScale);
            return;
        }

        if (cpu.styleInfo.category.includes("melee")) {
            if (dist > 2.1) {
                cpu.aiAction = "chase";
            } else {
                const r = Math.random();
                if (r < 0.62) cpu.aiAction = "attack";
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
    } else if (cpu.aiAction === "attack" && cpu.state !== "attack") {
        cpu.state = "attack";
        cpu.stateTimer = 0.38;
        createSlashEffect(cpu.position, player.position, 0xff4757, 1.2);
        if (dist < 2.45) {
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
        cpu.stateTimer = 0.45;
        createSlashEffect(cpu.position, player.position, 0x9b59b6, 0.9);
        if (dist < 8.5) {
            applyDamage('player', 45 * atkPowerScale);
        }
    }

    if (cpu.guardBarrierMesh) {
        cpu.guardBarrierMesh.material.opacity = cpu.isGuarding ? 0.55 : 0.0;
    }
}

// Blender製ファイターの関節（腕・脚）のプロシージャルアニメーション
function animateFighterJoints(entity, dt, isMoving) {
    entity.animTime += dt * 11.0;
    const j = entity.customJoints || entity.joints;
    if (!j) return;

    if (j.leftLeg && j.rightLeg) {
        const legAngle = isMoving ? Math.sin(entity.animTime) * 0.55 : 0;
        j.leftLeg.rotation.x = legAngle;
        j.rightLeg.rotation.x = -legAngle;
    }

    if (j.leftArm && j.rightArm) {
        if (entity.state === "attack" || entity.state === "special") {
            const swing = Math.sin(entity.stateTimer * 22.0) * 1.35;
            j.rightArm.rotation.x = -1.1 - swing;
            j.leftArm.rotation.x = 0.4;
        } else if (entity.isGuarding) {
            j.leftArm.rotation.x = -0.9;
            j.rightArm.rotation.x = -0.9;
        } else {
            const armAngle = isMoving ? -Math.sin(entity.animTime) * 0.4 : Math.sin(entity.animTime * 0.25) * 0.08;
            j.leftArm.rotation.x = armAngle;
            j.rightArm.rotation.x = -armAngle;
        }
    }
}

// ========================================================
// 8. メイン更新 & ポストプロセスレンダーループ
// ========================================================
function animate() {
    requestAnimationFrame(animate);

    let dt = clock.getDelta();
    if (isKoSlowMo) {
        slowMoTimer -= dt;
        dt *= 0.25;
        if (slowMoTimer <= 0) isKoSlowMo = false;
    }
    const elapsedTime = clock.getElapsedTime();

    // 松明の炎のゆらぎ
    torchFlames.forEach((tf, i) => {
        const flicker = Math.sin(elapsedTime * 9.0 + i * 1.7) * 0.65;
        tf.light.intensity = 4.2 + flicker;
        tf.mesh.position.y = tf.baseY + Math.sin(elapsedTime * 7.0 + i) * 0.06;
        tf.mesh.rotation.y += dt * 3.0;
    });

    // 海面のさざ波
    if (seaWaterMesh) {
        seaWaterMesh.position.y = -8.0 + Math.sin(elapsedTime * 1.2) * 0.18;
    }

    // SP自然回復
    if (isGameActive) {
        player.sp = Math.min(player.maxSp, player.sp + 3.2 * dt);
        cpu.sp = Math.min(cpu.maxSp, cpu.sp + 2.6 * dt);
        updateGauges();
    }

    // --- プレイヤー操作・移動更新 ---
    let playerMoving = false;
    if (isGameActive && player.state !== "special" && player.state !== "down") {
        player.isGuarding = input.guard;
        if (player.guardBarrierMesh) {
            player.guardBarrierMesh.material.opacity = player.isGuarding ? 0.55 : 0.0;
        }

        if (!player.isGuarding && (Math.abs(input.moveX) > 0.05 || Math.abs(input.moveZ) > 0.05)) {
            player.state = "move";
            playerMoving = true;
            const camForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
            const camRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

            const moveVec = new THREE.Vector3()
                .addScaledVector(camRight, input.moveX)
                .addScaledVector(camForward, -input.moveZ)
                .normalize();

            player.velocity.add(moveVec.multiplyScalar(player.speed * dt * 7.0));

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

    updateCpuAI(dt);

    // 物理移動
    player.position.addScaledVector(player.velocity, dt);
    player.velocity.multiplyScalar(0.84);

    cpu.position.addScaledVector(cpu.velocity, dt);
    cpu.velocity.multiplyScalar(0.84);

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
    // Blenderモデルは前方が -Y -> Three.js変換時に +Z を向くようオフセット調整
    player.group.rotation.y = player.rotationY + (player.isVrm && !player.isCustomRig ? 0 : Math.PI);

    cpu.group.position.copy(cpu.position);
    cpu.group.rotation.y = cpu.rotationY + Math.PI;

    // 関節アニメーション更新
    if (player.vrm && !player.isCustomRig) {
        player.vrm.update(dt);
        if (player.vrm.humanoid && playerMoving) {
            player.animTime += dt * 10;
            const lLeg = player.vrm.humanoid.getNormalizedBoneNode('leftUpperLeg');
            const rLeg = player.vrm.humanoid.getNormalizedBoneNode('rightUpperLeg');
            if (lLeg) lLeg.rotation.x = Math.sin(player.animTime) * 0.45;
            if (rLeg) rLeg.rotation.x = -Math.sin(player.animTime) * 0.45;
        }
    } else {
        if (player.vrm) player.vrm.update(dt);
        animateFighterJoints(player, dt, playerMoving);
    }

    const cpuMoving = cpu.velocity.lengthSq() > 0.2;
    animateFighterJoints(cpu, dt, cpuMoving);

    // サイキッカーのBlender念動オーブ回転
    cpu.orbs.forEach(item => {
        const angle = elapsedTime * 2.6 + item.angleOffset;
        item.mesh.position.set(Math.cos(angle) * 0.95, 1.25 + Math.sin(elapsedTime * 3.2) * 0.15, Math.sin(angle) * 0.95);
        item.mesh.rotation.y += dt * 2.5;
        item.mesh.rotation.x += dt * 1.5;
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

    // TPSカメラ制御 + ヒット時のカメラシェイク
    const midPoint = new THREE.Vector3().addVectors(player.position, cpu.position).multiplyScalar(0.5);
    const toMid = new THREE.Vector3().subVectors(player.position, midPoint).normalize();
    const camTargetPos = player.position.clone()
        .addScaledVector(toMid, 4.2)
        .add(new THREE.Vector3(0, 2.9, 0));

    camera.position.lerp(camTargetPos, 0.09);
    if (cameraShakeIntensity > 0.01) {
        camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
        camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
        cameraShakeIntensity *= 0.85;
    } else {
        cameraShakeIntensity = 0;
    }
    camera.lookAt(midPoint.x, 1.15, midPoint.z);

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
// 9. 入力イベントバインド
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
// 10. 初期起動
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('high-score').innerText = highScore;
    setupInputs();
    setupVrmLoader();
    initScene();
});
