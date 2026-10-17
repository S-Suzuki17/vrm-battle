import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ========================================================
// 1. ゲーム設定 & マスターデータ (アンリミテッド・タイマン)
// ========================================================
const CPU_STYLES = [
    { type: "近接型（武器ナシ）", suffix: "拳法家", detail: "高速コンボラッシュ & ステップ回避", category: "melee-bare" },
    { type: "近接型（武器アリ）", suffix: "重戦士", detail: "大剣豪快撃 & 鉄壁ガード", category: "melee-weapon" },
    { type: "狙撃型（武器ナシ）", suffix: "サイキッカー", detail: "念動ホーミング弾 & 広範囲衝撃波", category: "snipe-bare" },
    { type: "狙撃型（武器アリ）", suffix: "スナイパー", detail: "遠距離高速ライフル & バックステップ", category: "snipe-weapon" }
];

const ENEMY_NAMES = ["ドロイド", "シャドウ", "ギガント", "ハンター", "ヴァルキリー", "プロトタイプ"];

// ゲーム状態
let currentWins = 0;
let highScore = parseInt(localStorage.getItem("battle_high_score") || "0", 10);
let currentCpuInfo = {};
let isGameActive = true;
let isKoSlowMo = false;
let slowMoTimer = 0;

// コンボ管理
let comboHits = 0;
let comboDamage = 0;
let comboTimer = null;

// 3D環境
let scene, camera, renderer;
let clock = new THREE.Clock();

// ステージ要素
let arenaRadius = 11.0;
let torchFlames = [];
let seaWaterMesh = null;
let effectsList = []; // 衝撃波・スパーク・弾丸など

// プレイヤー管理オブジェクト
const player = {
    group: null,
    mesh: null,
    vrm: null,
    isVrm: false,
    hp: 1000,
    maxHp: 1000,
    sp: 50,
    maxSp: 100,
    position: new THREE.Vector3(-4, 0, 0),
    rotationY: Math.PI / 2,
    velocity: new THREE.Vector3(),
    speed: 6.5,
    state: "idle", // idle, move, attack, special, guard, dodge, damaged, down
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
    weaponMesh: null,
    orbs: [],
    hp: 1000,
    maxHp: 1000,
    sp: 20,
    maxSp: 100,
    position: new THREE.Vector3(4, 0, 0),
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
    styleInfo: null,
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
// 2. Three.js 初期化 & アンリミ風古代遺跡コロシアム生成
// ========================================================
function initScene() {
    const container = document.getElementById('three-canvas-container');
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3a506b); // 海と空の境界カラー
    scene.fog = new THREE.FogExp2(0x4a6572, 0.025);

    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    camera.position.set(0, 4.5, 9);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // ライティング（地中海・遺跡の力強い太陽光）
    const ambientLight = new THREE.AmbientLight(0xfff5e6, 1.1);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunLight.position.set(12, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    const d = 14;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    // アンリミテッドクルーズ風のフィールド構築
    buildUnlimitedField();

    // プレイヤーとCPUのグループ作成
    player.group = new THREE.Group();
    scene.add(player.group);
    player.mesh = createCyberBot(0x00d2d3, 0x1e90ff);
    player.group.add(player.mesh);
    player.guardBarrierMesh = createBarrierMesh(0x00d2d3);
    player.group.add(player.guardBarrierMesh);

    cpu.group = new THREE.Group();
    scene.add(cpu.group);
    cpu.guardBarrierMesh = createBarrierMesh(0xff4757);
    cpu.group.add(cpu.guardBarrierMesh);

    // リサイズ
    window.addEventListener('resize', onResize);

    // メインループ
    animate();
}

// アンリミテッドクルーズの怠慢バトルステージ（古代遺跡コロシアム＆大海原）
function buildUnlimitedField() {
    // 1. 大海原 (海面)
    const oceanGeo = new THREE.PlaneGeometry(300, 300, 32, 32);
    const oceanMat = new THREE.MeshStandardMaterial({
        color: 0x133852,
        roughness: 0.1,
        metalness: 0.8
    });
    seaWaterMesh = new THREE.Mesh(oceanGeo, oceanMat);
    seaWaterMesh.rotation.x = -Math.PI / 2;
    seaWaterMesh.position.y = -8.0;
    scene.add(seaWaterMesh);

    // 2. 絶壁の台座島 (コロシアムの下の巨大な岩山)
    const rockGeo = new THREE.CylinderGeometry(arenaRadius + 0.5, arenaRadius + 4.0, 9.0, 24);
    const rockMat = new THREE.MeshStandardMaterial({
        color: 0x474747,
        roughness: 0.9,
        metalness: 0.1
    });
    const rockBase = new THREE.Mesh(rockGeo, rockMat);
    rockBase.position.y = -4.5;
    rockBase.receiveShadow = true;
    scene.add(rockBase);

    // 3. 古代石造りコロシアムの石畳床
    const floorGeo = new THREE.CylinderGeometry(arenaRadius, arenaRadius, 0.4, 36);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0xc8b88a, // 古代の砂岩・石畳
        roughness: 0.65,
        metalness: 0.15
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 4. 床面のレリーフ装飾サークル
    const ringGeo1 = new THREE.RingGeometry(arenaRadius * 0.88, arenaRadius * 0.92, 48);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x8a795d, roughness: 0.5, side: THREE.DoubleSide });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat);
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = 0.01;
    scene.add(ring1);

    const ringGeo2 = new THREE.RingGeometry(arenaRadius * 0.4, arenaRadius * 0.43, 40);
    const ring2 = new THREE.Mesh(ringGeo2, ringMat);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.01;
    scene.add(ring2);

    // 5. 古代石柱群 (8本、神殿風の円柱、破損した柱も配置)
    const pillarGeo = new THREE.CylinderGeometry(0.55, 0.65, 5.5, 16);
    const brokenPillarGeo = new THREE.CylinderGeometry(0.55, 0.65, 2.6, 16);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xb5a788, roughness: 0.7 });

    const pillarAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    pillarAngles.forEach((deg, idx) => {
        const rad = THREE.MathUtils.degToRad(deg);
        const r = arenaRadius - 0.7;
        const x = Math.cos(rad) * r;
        const z = Math.sin(rad) * r;

        const isBroken = idx === 1 || idx === 5;
        const pMesh = new THREE.Mesh(isBroken ? brokenPillarGeo : pillarGeo, pillarMat);
        pMesh.position.set(x, isBroken ? 1.3 : 2.75, z);
        pMesh.castShadow = true;
        pMesh.receiveShadow = true;

        if (isBroken) {
            pMesh.rotation.z = (Math.random() - 0.5) * 0.2;
            pMesh.rotation.x = (Math.random() - 0.5) * 0.2;
        }

        // 柱の頭部装飾 (Capital)
        if (!isBroken) {
            const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 1.4), pillarMat);
            cap.position.set(x, 5.4, z);
            cap.castShadow = true;
            scene.add(cap);
        }
        scene.add(pMesh);
    });

    // 6. 燃え盛る古代トーチ・松明 (4基)
    const torchAngles = [30, 150, 210, 330];
    torchAngles.forEach(deg => {
        const rad = THREE.MathUtils.degToRad(deg);
        const r = arenaRadius * 0.75;
        const x = Math.cos(rad) * r;
        const z = Math.sin(rad) * r;

        // 石の台座
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 1.8, 12), pillarMat);
        stand.position.set(x, 0.9, z);
        stand.castShadow = true;
        scene.add(stand);

        // 松明の鉢
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.15, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        bowl.position.set(x, 1.85, z);
        scene.add(bowl);

        // 炎の光（PointLight）
        const fireLight = new THREE.PointLight(0xff6b35, 2.5, 7.0);
        fireLight.position.set(x, 2.1, z);
        scene.add(fireLight);

        // 炎パーティクル
        const flameGeo = new THREE.DodecahedronGeometry(0.25);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa502 });
        const flameMesh = new THREE.Mesh(flameGeo, flameMat);
        flameMesh.position.set(x, 2.1, z);
        scene.add(flameMesh);

        torchFlames.push({ light: fireLight, mesh: flameMesh, baseX: x, baseY: 2.1, baseZ: z });
    });
}

// 防御バリアエフェクト
function createBarrierMesh(colorHex) {
    const geo = new THREE.SphereGeometry(1.2, 16, 16);
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

// プレースホルダー用サイバーボット
function createCyberBot(mainColorHex, accentColorHex) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: mainColorHex, roughness: 0.3, metalness: 0.6 });
    const accentMat = new THREE.MeshBasicMaterial({ color: accentColorHex });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.5 });

    // 胴体
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.3), bodyMat);
    torso.position.y = 0.95;
    group.add(torso);

    // コア発光
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), accentMat);
    core.position.set(0, 1.0, 0.16);
    group.add(core);

    // 頭部
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), darkMat);
    head.position.y = 1.45;
    group.add(head);

    // バイザー
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.05), accentMat);
    visor.position.set(0, 1.46, 0.16);
    group.add(visor);

    // 腕
    const armGeo = new THREE.BoxGeometry(0.12, 0.45, 0.12);
    const leftArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.set(-0.35, 0.95, 0);
    leftArm.name = "leftArm";
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, bodyMat);
    rightArm.position.set(0.35, 0.95, 0);
    rightArm.name = "rightArm";
    group.add(rightArm);

    // 脚
    const legGeo = new THREE.BoxGeometry(0.14, 0.65, 0.14);
    const leftLeg = new THREE.Mesh(legGeo, darkMat);
    leftLeg.position.set(-0.16, 0.35, 0);
    leftLeg.name = "leftLeg";
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, darkMat);
    rightLeg.position.set(0.16, 0.35, 0);
    rightLeg.name = "rightLeg";
    group.add(rightLeg);

    group.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return group;
}

// ========================================================
// 3. CPUの3D外見 & 武器セットアップ
// ========================================================
function setupCpuModel(styleInfo, level) {
    if (cpu.mesh) cpu.group.remove(cpu.mesh);
    if (cpu.weaponMesh) cpu.group.remove(cpu.weaponMesh);
    cpu.orbs.forEach(o => cpu.group.remove(o.mesh));
    cpu.orbs = [];
    cpu.weaponMesh = null;

    let mainColor = 0xff4757;
    let accentColor = 0xffa502;
    if (styleInfo.category.includes("snipe")) {
        mainColor = 0x8e44ad;
        accentColor = 0x00d2d3;
    }

    cpu.mesh = createCyberBot(mainColor, accentColor);
    cpu.group.add(cpu.mesh);

    // スタイル別装備
    if (styleInfo.category === "melee-weapon") {
        // 大剣
        const bladeGeo = new THREE.BoxGeometry(0.1, 1.2, 0.3);
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0x7f1d1d, metalness: 0.8 });
        const sword = new THREE.Mesh(bladeGeo, bladeMat);
        sword.position.set(0.45, 1.05, 0.2);
        sword.rotation.x = Math.PI / 5;
        cpu.group.add(sword);
        cpu.weaponMesh = sword;
    } else if (styleInfo.category === "snipe-weapon") {
        // ライフル
        const rifle = new THREE.Group();
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2), new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.9 }));
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0.38, 0.95, 0.4);
        rifle.add(barrel);
        cpu.group.add(rifle);
        cpu.weaponMesh = rifle;
    } else if (styleInfo.category === "snipe-bare") {
        // 浮遊オーブ
        for (let i = 0; i < 3; i++) {
            const orb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), new THREE.MeshStandardMaterial({ color: 0x9b59b6, emissive: 0x8e44ad }));
            cpu.group.add(orb);
            cpu.orbs.push({ mesh: orb, angleOffset: (i * Math.PI * 2) / 3 });
        }
    }
}

// ========================================================
// 4. VRMローカル読み込み機能
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
        if (files && files.length > 0) loadVrmFile(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) loadVrmFile(e.target.files[0]);
    });

    resetBtn.addEventListener('click', restoreDefaultPlayer);
}

function loadVrmFile(file) {
    if (!file.name.toLowerCase().endsWith('.vrm')) {
        alert('⚠️ .vrm 形式のファイルを選択してください。');
        return;
    }

    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = `VRM召喚中: ${file.name}...`;
    overlay.style.display = 'flex';

    const blobUrl = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    loader.load(
        blobUrl,
        gltf => {
            const vrm = gltf.userData.vrm;
            if (!vrm) {
                alert('VRM解析エラー');
                overlay.style.display = 'none';
                return;
            }

            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.removeUnnecessaryJoints(gltf.scene);

            // 既存プレースホルダー非表示 & 前のVRM破棄
            if (player.vrm) {
                player.group.remove(player.vrm.scene);
                VRMUtils.deepDispose(player.vrm.scene);
            }
            if (player.mesh) player.mesh.visible = false;

            player.vrm = vrm;
            player.isVrm = true;
            vrm.scene.rotation.y = Math.PI; // 前向き
            vrm.scene.traverse(obj => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });

            // ポーズ初期化
            try {
                if (vrm.humanoid) {
                    const lArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
                    const rArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
                    if (lArm) lArm.rotation.z = Math.PI / 3.2;
                    if (rArm) rArm.rotation.z = -Math.PI / 3.2;
                }
            } catch (err) {}

            player.group.add(vrm.scene);

            // UI更新
            const title = vrm.meta?.title || file.name.replace('.vrm', '');
            document.getElementById('player-name').innerText = title;
            document.getElementById('player-avatar-icon').innerText = '🦸';
            document.getElementById('avatar-status-text').innerText = `✅ 自作VRM読込中: ${title}`;
            document.getElementById('reset-avatar-btn').style.display = 'inline-block';
            overlay.style.display = 'none';

            showAnnouncement("VRM アバター召喚完了！", "#00d2d3");
        },
        null,
        err => {
            console.error(err);
            alert('VRM読み込みエラー: ' + err.message);
            overlay.style.display = 'none';
        }
    );
}

function restoreDefaultPlayer() {
    if (player.vrm) {
        player.group.remove(player.vrm.scene);
        VRMUtils.deepDispose(player.vrm.scene);
        player.vrm = null;
        player.isVrm = false;
    }
    if (player.mesh) player.mesh.visible = true;

    document.getElementById('player-name').innerText = "Cyber Bot";
    document.getElementById('player-avatar-icon').innerText = '👤';
    document.getElementById('avatar-status-text').innerText = "現在: デフォルトアバター (Cyber Bot)";
    document.getElementById('reset-avatar-btn').style.display = 'none';
    showAnnouncement("デフォルトに戻しました", "#ced6e0");
}

// ========================================================
// 5. バトルアクション & エフェクト & コンボロジック
// ========================================================
function spawnDamageNumber(x, y, z, damage, type = "normal") {
    const layer = document.getElementById('damage-numbers-layer');
    if (!layer) return;

    // 3D座標から2Dスクリーン座標へ投影
    const pos = new THREE.Vector3(x, y + 1.2, z);
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

// スラッシュ/斬撃エフェクト生成
function createSlashEffect(origin, targetPos, color = 0xffd32a, size = 1.0) {
    const slashGeo = new THREE.RingGeometry(0.2, 0.9 * size, 16, 1, 0, Math.PI * 0.9);
    const slashMat = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
    });
    const slash = new THREE.Mesh(slashGeo, slashMat);
    slash.position.copy(origin).add(new THREE.Vector3(0, 1.0, 0));
    slash.lookAt(targetPos);
    slash.rotation.z = (Math.random() - 0.5) * Math.PI;
    scene.add(slash);

    effectsList.push({
        mesh: slash,
        life: 0.2,
        maxLife: 0.2,
        update: (dt, item) => {
            item.mesh.scale.multiplyScalar(1.15);
            item.mesh.material.opacity = (item.life / item.maxLife) * 0.9;
        }
    });
}

// 必殺技の超巨大爆発/衝撃波
function createSpecialExplosion(pos) {
    // 巨大な光球
    const sphereGeo = new THREE.SphereGeometry(2.4, 24, 24);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xffd32a,
        wireframe: true,
        transparent: true,
        opacity: 1.0
    });
    const boom = new THREE.Mesh(sphereGeo, sphereMat);
    boom.position.copy(pos).add(new THREE.Vector3(0, 1.0, 0));
    scene.add(boom);

    // 地面の衝撃波リング
    const shockGeo = new THREE.RingGeometry(0.5, 4.0, 32);
    const shockMat = new THREE.MeshBasicMaterial({ color: 0xff4757, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const shock = new THREE.Mesh(shockGeo, shockMat);
    shock.rotation.x = -Math.PI / 2;
    shock.position.copy(pos).add(new THREE.Vector3(0, 0.05, 0));
    scene.add(shock);

    effectsList.push({
        mesh: boom,
        shock: shock,
        life: 0.6,
        maxLife: 0.6,
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

// コンボ加算処理
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

// プレイヤー通常攻撃のトリガー
function performPlayerAttack() {
    if (!isGameActive) return;
    if (player.state === "special" || player.state === "guard" || player.state === "dodge" || player.state === "down") return;

    // 次のコンボステップ
    player.comboStep = (player.comboStep % 3) + 1;
    player.state = "attack";
    player.stateTimer = 0.35; // 攻撃持続

    // 相手への距離・角度
    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();

    // 攻撃モーション時に相手の方向を向く
    player.rotationY = Math.atan2(toCpu.x, toCpu.z);

    // 攻撃前進ステップ
    player.velocity.copy(toCpu.normalize().multiplyScalar(4.0));

    // スラッシュ演出
    const slashColor = player.comboStep === 3 ? 0xff4757 : 0xffd32a;
    createSlashEffect(player.position, cpu.position, slashColor, player.comboStep === 3 ? 1.5 : 1.0);

    // ヒット判定
    if (dist < 2.5) {
        let baseDmg = player.comboStep === 1 ? 45 : (player.comboStep === 2 ? 65 : 120);
        let isCrit = player.comboStep === 3;

        // CPUのガード判定
        if (cpu.isGuarding) {
            baseDmg = Math.floor(baseDmg * 0.15);
            spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, baseDmg, "guard");
        } else {
            spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, baseDmg, isCrit ? "crit" : "normal");
            // ノックバック
            const knockForce = isCrit ? 8.0 : 3.0;
            cpu.velocity.add(toCpu.normalize().multiplyScalar(knockForce));
            cpu.state = isCrit ? "down" : "damaged";
            cpu.stateTimer = isCrit ? 0.7 : 0.3;
        }

        applyDamage('cpu', baseDmg);
        addCombo(1, baseDmg);

        // SPチャージ
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
    player.stateTimer = 1.3;
    player.velocity.set(0, 0, 0);

    // カットイン演出
    const cutin = document.getElementById('special-cutin');
    const cutinChar = document.getElementById('cutin-char');
    const cutinSkill = document.getElementById('cutin-skill');
    cutinChar.innerText = document.getElementById('player-name').innerText.toUpperCase();
    cutinSkill.innerText = "🔥 覇皇烈空閃 (EX SPECIAL) 🔥";
    cutin.classList.add('active');

    // 技発動
    setTimeout(() => {
        cutin.classList.remove('active');

        // 相手に向かって超突進
        const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
        player.rotationY = Math.atan2(toCpu.x, toCpu.z);

        createSpecialExplosion(cpu.position);

        const dmg = 380;
        applyDamage('cpu', dmg);
        spawnDamageNumber(cpu.position.x, cpu.position.y, cpu.position.z, dmg, "crit");
        addCombo(5, dmg);

        // CPUをアリーナ端まで吹き飛ばす
        cpu.velocity.add(toCpu.normalize().multiplyScalar(15.0));
        cpu.state = "down";
        cpu.stateTimer = 1.0;

        showAnnouncement("CRITICAL SPECIAL HIT! 💥", "#ffd32a");
    }, 550);
}

// プレイヤー回避（ステップ）
function performPlayerDodge() {
    if (!isGameActive) return;
    if (player.sp < 15) return;
    if (player.state === "dodge" || player.state === "special" || player.state === "down") return;

    player.sp -= 15;
    updateGauges();

    player.state = "dodge";
    player.stateTimer = 0.28;
    player.isInvincible = true;

    // 入力方向、なければ後方
    let dir = new THREE.Vector3(input.moveX, 0, input.moveZ);
    if (dir.lengthSq() < 0.01) {
        dir.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotationY);
    } else {
        dir.normalize();
    }
    player.velocity.copy(dir.multiplyScalar(12.0));

    setTimeout(() => {
        player.isInvincible = false;
    }, 280);
}

// ========================================================
// 6. ダメージ & HP/SP ゲージ反映
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

        let finalDmg = amount;
        if (player.isGuarding) {
            finalDmg = Math.floor(amount * 0.15);
            spawnDamageNumber(player.position.x, player.position.y, player.position.z, finalDmg, "guard");
        } else {
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
    // プレイヤーHP & SP
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

    // CPU HP & SP
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

// 勝利処理
function handleVictory() {
    isGameActive = false;
    isKoSlowMo = true;
    slowMoTimer = 1.2;
    showAnnouncement("K.O. !! 🏆 VICTORY!", "#ffd32a");

    currentWins++;
    document.getElementById('current-wins').innerText = currentWins;

    setTimeout(() => {
        // 次のCPUを生成
        spawnNextCpu();
    }, 2000);
}

// 敗北処理
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

    cpu.styleInfo = style;
    cpu.maxHp = 1000 + (currentWins * 200);
    cpu.hp = cpu.maxHp;
    cpu.sp = 30;
    cpu.position.set(4.5, 0, 0);
    cpu.velocity.set(0, 0, 0);
    cpu.state = "idle";

    // プレイヤー回復 (連勝ボーナス)
    player.hp = Math.min(player.maxHp, player.hp + 400);
    player.sp = Math.min(player.maxSp, player.sp + 30);
    player.position.set(-4.5, 0, 0);
    player.velocity.set(0, 0, 0);
    player.state = "idle";

    document.getElementById('cpu-name').innerText = currentCpuInfo.name;
    document.getElementById('cpu-type').innerText = `${currentCpuInfo.style}`;

    setupCpuModel(style, currentWins + 1);
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
    const text = `⚔️【3D自作キャラバトル】\n古代遺跡コロシアムの死闘を制し、🔥【 ${currentWins} 連勝 】🔥 を達成！\n\n#自作キャラバトル #アンリミテッドクルーズ #VRM #Threejs`;
    const gameUrl = window.location.href;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(gameUrl)}`;
    window.open(xUrl, '_blank');
}

// ========================================================
// 7. CPU AI (アンリミ風バトルAI)
// ========================================================
function updateCpuAI(dt) {
    if (!isGameActive || cpu.state === "down") return;

    cpu.aiTimer -= dt;
    const toPlayer = new THREE.Vector3().subVectors(player.position, cpu.position);
    const dist = toPlayer.length();

    // プレイヤーの方向を向く
    cpu.rotationY = Math.atan2(toPlayer.x, toPlayer.z);

    if (cpu.aiTimer <= 0) {
        cpu.aiTimer = 0.4 + Math.random() * 0.4;

        // 必殺技判定 (SP50以上で一定確率)
        if (cpu.sp >= 50 && dist < 5.0 && Math.random() < 0.35) {
            cpu.sp -= 50;
            cpu.state = "attack";
            cpu.stateTimer = 0.8;
            updateGauges();
            showAnnouncement("⚠️ CPU SPECIAL ATTACK! ⚠️", "#ff4757");
            createSpecialExplosion(player.position);
            applyDamage('player', 260);
            return;
        }

        // 近接型
        if (cpu.styleInfo.category.includes("melee")) {
            if (dist > 2.0) {
                cpu.aiAction = "chase";
            } else {
                // 近距離
                const r = Math.random();
                if (r < 0.6) {
                    cpu.aiAction = "attack";
                } else if (r < 0.85) {
                    cpu.aiAction = "guard";
                } else {
                    cpu.aiAction = "circle";
                }
            }
        } else {
            // 狙撃型
            if (dist < 3.5) {
                cpu.aiAction = "retreat";
            } else {
                cpu.aiAction = "shoot";
            }
        }
    }

    // 行動実行
    cpu.isGuarding = false;
    if (cpu.aiAction === "chase") {
        const moveDir = toPlayer.clone().normalize();
        cpu.velocity.add(moveDir.multiplyScalar(cpu.speed * dt * 5.0));
    } else if (cpu.aiAction === "attack" && cpu.state !== "attack") {
        cpu.state = "attack";
        cpu.stateTimer = 0.4;
        createSlashEffect(cpu.position, player.position, 0xff4757, 1.1);
        if (dist < 2.3) {
            applyDamage('player', 65);
            cpu.sp = Math.min(cpu.maxSp, cpu.sp + 12);
        }
    } else if (cpu.aiAction === "guard") {
        cpu.isGuarding = true;
    } else if (cpu.aiAction === "retreat") {
        const moveDir = toPlayer.clone().negate().normalize();
        cpu.velocity.add(moveDir.multiplyScalar(cpu.speed * dt * 6.0));
    } else if (cpu.aiAction === "shoot" && cpu.state !== "attack") {
        cpu.state = "attack";
        cpu.stateTimer = 0.5;
        // 狙撃弾
        createSlashEffect(cpu.position, player.position, 0x8e44ad, 0.8);
        if (dist < 8.0) {
            applyDamage('player', 45);
        }
    }

    // ガードバリア表示切替
    if (cpu.guardBarrierMesh) {
        cpu.guardBarrierMesh.material.opacity = cpu.isGuarding ? 0.6 : 0.0;
    }
}

// ========================================================
// 8. メイン更新 & アニメーションループ
// ========================================================
function animate() {
    requestAnimationFrame(animate);

    let dt = clock.getDelta();
    if (isKoSlowMo) {
        slowMoTimer -= dt;
        dt *= 0.25; // スローモーション
        if (slowMoTimer <= 0) isKoSlowMo = false;
    }
    const elapsedTime = clock.getElapsedTime();

    // 松明の炎のゆらぎ
    torchFlames.forEach((tf, i) => {
        const flicker = Math.sin(elapsedTime * 8.0 + i) * 0.4;
        tf.light.intensity = 2.4 + flicker;
        tf.mesh.position.y = tf.baseY + Math.sin(elapsedTime * 6.0 + i) * 0.05;
    });

    // 海面のさざ波
    if (seaWaterMesh) {
        seaWaterMesh.position.y = -8.0 + Math.sin(elapsedTime * 1.2) * 0.15;
    }

    // SP自然回復
    if (isGameActive) {
        player.sp = Math.min(player.maxSp, player.sp + 3.0 * dt);
        cpu.sp = Math.min(cpu.maxSp, cpu.sp + 2.5 * dt);
        updateGauges();
    }

    // --- プレイヤー操作・移動更新 ---
    if (isGameActive && player.state !== "special" && player.state !== "down") {
        player.isGuarding = input.guard;
        if (player.guardBarrierMesh) {
            player.guardBarrierMesh.material.opacity = player.isGuarding ? 0.6 : 0.0;
        }

        if (!player.isGuarding && (Math.abs(input.moveX) > 0.05 || Math.abs(input.moveZ) > 0.05)) {
            player.state = "move";
            // カメラ基準の移動ベクトル
            const camForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
            const camRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

            const moveVec = new THREE.Vector3()
                .addScaledVector(camRight, input.moveX)
                .addScaledVector(camForward, -input.moveZ)
                .normalize();

            player.velocity.add(moveVec.multiplyScalar(player.speed * dt * 7.0));

            // 移動方向を向く（ロックオン時はCPUを注視）
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

    // プレイヤー状態タイマー
    if (player.stateTimer > 0) {
        player.stateTimer -= dt;
        if (player.stateTimer <= 0) {
            player.state = "idle";
            player.comboStep = 0;
        }
    }

    // CPU状態タイマー
    if (cpu.stateTimer > 0) {
        cpu.stateTimer -= dt;
        if (cpu.stateTimer <= 0) cpu.state = "idle";
    }

    // CPU AI更新
    updateCpuAI(dt);

    // 物理移動（摩擦・速度減衰）
    player.position.addScaledVector(player.velocity, dt);
    player.velocity.multiplyScalar(0.85);

    cpu.position.addScaledVector(cpu.velocity, dt);
    cpu.velocity.multiplyScalar(0.85);

    // アリーナ境界制限 (円形ステージの外に出ない)
    const pDist = Math.sqrt(player.position.x ** 2 + player.position.z ** 2);
    if (pDist > arenaRadius - 1.2) {
        player.position.normalize().multiplyScalar(arenaRadius - 1.2);
    }
    const cDist = Math.sqrt(cpu.position.x ** 2 + cpu.position.z ** 2);
    if (cDist > arenaRadius - 1.2) {
        cpu.position.normalize().multiplyScalar(arenaRadius - 1.2);
    }

    // 位置・回転適用
    player.group.position.copy(player.position);
    player.group.rotation.y = player.rotationY;

    cpu.group.position.copy(cpu.position);
    cpu.group.rotation.y = cpu.rotationY;

    // VRMモデル更新
    if (player.vrm) {
        player.vrm.update(dt);
        // 移動時の簡易歩行ボーンアニメーション
        if (player.vrm.humanoid && player.state === "move") {
            player.animTime += dt * 10;
            const lLeg = player.vrm.humanoid.getNormalizedBoneNode('leftUpperLeg');
            const rLeg = player.vrm.humanoid.getNormalizedBoneNode('rightUpperLeg');
            if (lLeg) lLeg.rotation.x = Math.sin(player.animTime) * 0.45;
            if (rLeg) rLeg.rotation.x = -Math.sin(player.animTime) * 0.45;
        }
    }

    // サイキッカーオーブ回転
    cpu.orbs.forEach(item => {
        const angle = elapsedTime * 2.5 + item.angleOffset;
        item.mesh.position.set(Math.cos(angle) * 0.8, 1.2 + Math.sin(elapsedTime * 3.0) * 0.15, Math.sin(angle) * 0.8);
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

    // --- TPSカメラ制御（アンリミテッドクルーズ風対戦アングル） ---
    // プレイヤーの背後やや上方に構え、常にプレイヤーとCPUを画角に収める
    const midPoint = new THREE.Vector3().addVectors(player.position, cpu.position).multiplyScalar(0.5);
    const toMid = new THREE.Vector3().subVectors(player.position, midPoint).normalize();
    const camTargetPos = player.position.clone()
        .addScaledVector(toMid, 4.0)
        .add(new THREE.Vector3(0, 2.8, 0));

    camera.position.lerp(camTargetPos, 0.08);
    camera.lookAt(midPoint.x, 1.2, midPoint.z);

    renderer.render(scene, camera);
}

function onResize() {
    const container = document.getElementById('three-canvas-container');
    if (!container || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

// ========================================================
// 9. 入力イベントバインド (キーボード & タッチコントローラー)
// ========================================================
function setupInputs() {
    // キーボード
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

    // スマホ用バーチャルスティック
    setupTouchJoystick();

    // アクションボタン
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

    // リザルトボタン
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

    const resetStick = e => {
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
    initScene();
    setupInputs();
    setupVrmLoader();
    spawnNextCpu();
});
