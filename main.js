import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ========================================================
// 1. ゲーム状態 & CPUマスターデータ
// ========================================================
const cpuStyles = [
    { type: "近接型（武器ナシ）", suffix: "拳法家", detail: "出が早いコンボ格闘", category: "melee-bare" },
    { type: "近接型（武器アリ）", suffix: "重戦士", detail: "大剣による広範囲・大ダメージ攻撃", category: "melee-weapon" },
    { type: "狙撃型（武器ナシ）", suffix: "サイキッカー", detail: "弾速が速い念動波動の連射", category: "snipe-bare" },
    { type: "狙撃型（武器アリ）", suffix: "スナイパー", detail: "超遠距離からのライフル精密射撃", category: "snipe-weapon" }
];

const enemyNames = ["ドロイド", "シャドウ", "ギガント", "ハンター", "ヴァルキリー", "プロトタイプ"];

let currentWins = 0;
let highScore = parseInt(localStorage.getItem("battle_high_score") || "0", 10);
let currentCpu = {};
let isBattling = false;

// 3D関連オブジェクト
let scene, camera, renderer, controls;
let playerGroup, cpuGroup;
let currentVrm = null;
let defaultPlayerMesh = null;
let cpuMesh = null;
let cpuWeaponMesh = null;
let floatingOrbs = [];
let clock = new THREE.Clock();

// ========================================================
// 2. Three.js 初期化 & 3Dバトルステージ構築
// ========================================================
function initThree() {
    const container = document.getElementById('three-canvas-container');
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 380;

    // シーン
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0e17);
    scene.fog = new THREE.FogExp2(0x0c0e17, 0.08);

    // カメラ
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.8, 4.8);

    // レンダラー
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // 地面下に潜り込まない
    controls.minDistance = 2.0;
    controls.maxDistance = 8.0;
    controls.target.set(0, 0.9, 0);

    // ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(3, 6, 4);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // プレイヤー側アクセントライト（青） & CPU側（赤）
    const playerLight = new THREE.PointLight(0x1e90ff, 3.5, 6);
    playerLight.position.set(-1.8, 1.5, 0);
    scene.add(playerLight);

    const cpuLight = new THREE.PointLight(0xff4757, 3.5, 6);
    cpuLight.position.set(1.8, 1.5, 0);
    scene.add(cpuLight);

    // バトルリング（床・グリッド）
    buildBattleArena();

    // プレイヤー用グループ
    playerGroup = new THREE.Group();
    playerGroup.position.set(-1.2, 0, 0);
    playerGroup.rotation.y = Math.PI / 4; // CPUの方向を斜めに見る
    scene.add(playerGroup);

    // CPU用グループ
    cpuGroup = new THREE.Group();
    cpuGroup.position.set(1.2, 0, 0);
    cpuGroup.rotation.y = -Math.PI / 4; // プレイヤーの方向を斜めに見る
    scene.add(cpuGroup);

    // 初期プレイヤー（ダミーサイバーボット）を生成
    defaultPlayerMesh = createCyberBot(0x00d2d3, 0x1e90ff, false);
    playerGroup.add(defaultPlayerMesh);

    // リサイズ対応
    window.addEventListener('resize', onWindowResize);

    // アニメーションループ開始
    animate();
}

// バトルアリーナ（床・リング・背景パーティクル）
function buildBattleArena() {
    // 円形リングステージ
    const stageGeo = new THREE.CylinderGeometry(2.8, 3.0, 0.2, 32);
    const stageMat = new THREE.MeshStandardMaterial({
        color: 0x1a1e2e,
        roughness: 0.4,
        metalness: 0.6
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = -0.1;
    stage.receiveShadow = true;
    scene.add(stage);

    // リングの外周ネオンサークル
    const ringGeo = new THREE.RingGeometry(2.7, 2.78, 48);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00d2d3,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    // センターVSライン
    const centerLineGeo = new THREE.PlaneGeometry(0.04, 4.5);
    const centerLineMat = new THREE.MeshBasicMaterial({
        color: 0xff4757,
        side: THREE.DoubleSide
    });
    const centerLine = new THREE.Mesh(centerLineGeo, centerLineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.006;
    scene.add(centerLine);

    // グリッドヘルパー
    const grid = new THREE.GridHelper(6, 12, 0x3a4b7c, 0x1d243c);
    grid.position.y = 0.002;
    scene.add(grid);

    // 背景浮遊ダストパーティクル
    const particleCount = 80;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
        pPos[i] = (Math.random() - 0.5) * 8;
        pPos[i + 1] = Math.random() * 4;
        pPos[i + 2] = (Math.random() - 0.5) * 8;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
        color: 0x70a1ff,
        size: 0.05,
        transparent: true,
        opacity: 0.6
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);
}

// プレースホルダー用サイバーボット生成
function createCyberBot(mainColorHex, accentColorHex, isCpu = false) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: mainColorHex,
        roughness: 0.3,
        metalness: 0.7
    });
    const accentMat = new THREE.MeshBasicMaterial({
        color: accentColorHex
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: 0x22222a,
        roughness: 0.5
    });

    // 胴体
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.3), bodyMat);
    torso.position.y = 0.95;
    group.add(torso);

    // 胸のコア発光
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), accentMat);
    core.position.set(0, 1.0, 0.16);
    group.add(core);

    // 頭部
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), darkMat);
    head.position.y = 1.45;
    group.add(head);

    // バイザー（目）
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.05), accentMat);
    visor.position.set(0, 1.46, 0.16);
    group.add(visor);

    // 肩 & 腕
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
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, darkMat);
    rightLeg.position.set(0.16, 0.35, 0);
    group.add(rightLeg);

    group.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return group;
}

// ウィンドウリサイズ対応
function onWindowResize() {
    const container = document.getElementById('three-canvas-container');
    if (!container || !renderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// ========================================================
// 3. CPUのバリエーションと武器・アクセサリ生成
// ========================================================
function updateCpu3DModel(styleInfo, level) {
    // 既存のCPUモデルと武器・オーブをクリア
    while (cpuGroup.children.length > 0) {
        cpuGroup.remove(cpuGroup.children[0]);
    }
    floatingOrbs = [];
    cpuWeaponMesh = null;

    let mainColor = 0xff4757;
    let accentColor = 0xffa502;

    // スタイルに応じたカラー調整
    if (styleInfo.category.includes("snipe")) {
        mainColor = 0x9b59b6; // 狙撃型は紫/ダークマゼンタ
        accentColor = 0x00d2d3;
    } else {
        mainColor = 0xff4757; // 近接型はクリムゾンレッド
        accentColor = 0xffa502;
    }

    cpuMesh = createCyberBot(mainColor, accentColor, true);
    cpuGroup.add(cpuMesh);

    // スタイル別の専用装備を作成
    const rightArm = cpuMesh.getObjectByName("rightArm");

    if (styleInfo.category === "melee-weapon") {
        // 大剣（バスターソード）
        const bladeGeo = new THREE.BoxGeometry(0.1, 0.9, 0.25);
        const bladeMat = new THREE.MeshStandardMaterial({
            color: 0xff3838,
            emissive: 0x7f1d1d,
            roughness: 0.2,
            metalness: 0.8
        });
        const sword = new THREE.Mesh(bladeGeo, bladeMat);
        sword.position.set(0.42, 1.1, 0.2);
        sword.rotation.x = Math.PI / 6;
        cpuGroup.add(sword);
        cpuWeaponMesh = sword;

    } else if (styleInfo.category === "melee-bare") {
        // ナックルグローブ（光る拳）
        const fistGeo = new THREE.SphereGeometry(0.13, 16, 16);
        const fistMat = new THREE.MeshBasicMaterial({ color: 0xffa502 });
        const leftFist = new THREE.Mesh(fistGeo, fistMat);
        leftFist.position.set(-0.35, 0.72, 0.15);
        cpuGroup.add(leftFist);

        const rightFist = new THREE.Mesh(fistGeo, fistMat);
        rightFist.position.set(0.35, 0.72, 0.15);
        cpuGroup.add(rightFist);

    } else if (styleInfo.category === "snipe-weapon") {
        // スナイパーライフル
        const rifleGroup = new THREE.Group();
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 1.1),
            new THREE.MeshStandardMaterial({ color: 0x2f3542, metalness: 0.9 })
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0.35, 0.95, 0.4);
        rifleGroup.add(barrel);

        const scope = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.25),
            new THREE.MeshBasicMaterial({ color: 0x00d2d3 })
        );
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0.35, 1.03, 0.3);
        rifleGroup.add(scope);

        cpuGroup.add(rifleGroup);
        cpuWeaponMesh = rifleGroup;

    } else if (styleInfo.category === "snipe-bare") {
        // 浮遊する念動ビット・オーブ (3基)
        for (let i = 0; i < 3; i++) {
            const orb = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.09),
                new THREE.MeshStandardMaterial({
                    color: 0x9b59b6,
                    emissive: 0x6c5ce7,
                    roughness: 0.1
                })
            );
            cpuGroup.add(orb);
            floatingOrbs.push({ mesh: orb, angleOffset: (i * Math.PI * 2) / 3 });
        }
    }

    // CPU登場のアニメーション（上から降りてくる）
    cpuGroup.position.y = 1.5;
    cpuGroup.scale.set(0.1, 0.1, 0.1);
    let t = 0;
    const spawnAnim = () => {
        t += 0.08;
        cpuGroup.position.y = THREE.MathUtils.lerp(cpuGroup.position.y, 0, 0.2);
        const s = THREE.MathUtils.lerp(cpuGroup.scale.x, 1, 0.2);
        cpuGroup.scale.set(s, s, s);
        if (t < 1) requestAnimationFrame(spawnAnim);
        else {
            cpuGroup.position.y = 0;
            cpuGroup.scale.set(1, 1, 1);
        }
    };
    spawnAnim();
}

// ========================================================
// 4. VRMローカル読み込み (ドラッグ＆ドロップ & ファイル選択)
// ========================================================
function setupVrmLoader() {
    const dropArea = document.getElementById('drop-area');
    const dropHint = document.getElementById('drop-hint');
    const fileInput = document.getElementById('vrm-file-input');
    const loadingOverlay = document.getElementById('loading-overlay');
    const resetAvatarBtn = document.getElementById('reset-avatar-btn');

    // ドラッグ＆ドロップイベント
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropHint.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropHint.classList.remove('drag-over');
        });
    });

    dropArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleVrmFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleVrmFile(e.target.files[0]);
        }
    });

    // デフォルトに戻すボタン
    resetAvatarBtn.addEventListener('click', () => {
        restoreDefaultAvatar();
    });
}

function handleVrmFile(file) {
    if (!file.name.toLowerCase().endsWith('.vrm')) {
        alert('⚠️ .vrm 形式のファイルを選択してください。');
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = `VRM読み込み中: ${file.name}...`;
    loadingOverlay.style.display = 'flex';

    const blobUrl = URL.createObjectURL(file);
    loadVRMModel(blobUrl, file.name);
}

function loadVRMModel(url, fileName) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
        url,
        (gltf) => {
            const vrm = gltf.userData.vrm;
            if (!vrm) {
                alert('⚠️ VRMデータの解析に失敗しました。');
                document.getElementById('loading-overlay').style.display = 'none';
                return;
            }

            // 不要なポリゴン・ボーンのクリーンアップ
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.removeUnnecessaryJoints(gltf.scene);

            // 既存VRMまたはデフォルトアバターの破棄・非表示
            if (currentVrm) {
                playerGroup.remove(currentVrm.scene);
                VRMUtils.deepDispose(currentVrm.scene);
                currentVrm = null;
            }
            if (defaultPlayerMesh) {
                defaultPlayerMesh.visible = false;
            }

            // VRMの設定
            currentVrm = vrm;
            vrm.scene.rotation.y = Math.PI; // デフォルトで前を向かせる
            vrm.scene.traverse((obj) => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });

            // VRMの腕が下がった基本ポーズ（リラックスした構え）
            try {
                if (vrm.humanoid) {
                    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
                    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
                    if (leftUpperArm) leftUpperArm.rotation.z = Math.PI / 3;
                    if (rightUpperArm) rightUpperArm.rotation.z = -Math.PI / 3;
                }
            } catch (e) {
                console.warn("Pose initialization failed:", e);
            }

            playerGroup.add(vrm.scene);

            // UIの更新
            const metaTitle = vrm.meta?.title || fileName;
            const metaAuthor = vrm.meta?.authors ? ` (${vrm.meta.authors})` : '';
            document.getElementById('player-name').innerText = `${metaTitle}${metaAuthor}`;
            document.getElementById('avatar-status-text').innerText = `✅ 自作アバター読込中: ${metaTitle}`;
            document.getElementById('reset-avatar-btn').style.display = 'inline-block';
            document.getElementById('loading-overlay').style.display = 'none';

            showAnnouncement("VRM アバター召喚完了！", "#00d2d3");
        },
        (progress) => {
            // ロード進捗
        },
        (error) => {
            console.error(error);
            alert('⚠️ VRM読み込みエラー: ' + error.message);
            document.getElementById('loading-overlay').style.display = 'none';
        }
    );
}

function restoreDefaultAvatar() {
    if (currentVrm) {
        playerGroup.remove(currentVrm.scene);
        VRMUtils.deepDispose(currentVrm.scene);
        currentVrm = null;
    }
    if (defaultPlayerMesh) {
        defaultPlayerMesh.visible = true;
    }
    document.getElementById('player-name').innerText = "Cyber Bot (デフォルト)";
    document.getElementById('avatar-status-text').innerText = "現在：デフォルトアバター使用中（自作VRMをドロップで即座に召喚できます）";
    document.getElementById('reset-avatar-btn').style.display = 'none';
    showAnnouncement("デフォルトに戻しました", "#ced6e0");
}

// ========================================================
// 5. ゲームロジック & バトル演出
// ========================================================
function generateCpu() {
    const randomStyle = cpuStyles[Math.floor(Math.random() * cpuStyles.length)];
    const randomName = enemyNames[Math.floor(Math.random() * enemyNames.length)];

    currentCpu = {
        name: `Lv.${currentWins + 1} ${randomName}`,
        style: randomStyle.type,
        detail: randomStyle.detail,
        styleInfo: randomStyle
    };

    document.getElementById("cpu-name").innerText = currentCpu.name;
    document.getElementById("cpu-type").innerText = `${currentCpu.style} (${currentCpu.detail})`;

    // HPバーリセット
    setHp('player', 100);
    setHp('cpu', 100);

    // 3Dモデル更新
    updateCpu3DModel(randomStyle, currentWins + 1);
}

function setHp(target, percent) {
    const bar = document.getElementById(`${target}-hp-bar`);
    if (!bar) return;
    bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (percent <= 25) {
        bar.classList.add('danger');
    } else {
        bar.classList.remove('danger');
    }
}

function showAnnouncement(text, color = "#ffd32a") {
    const elem = document.getElementById('battle-announcement');
    elem.innerText = text;
    elem.style.color = color;
    elem.classList.remove('active');
    void elem.offsetWidth; // リフロー
    elem.classList.add('active');

    setTimeout(() => {
        elem.classList.remove('active');
    }, 1500);
}

// バトル実行（勝利 or 敗北）
function playTurn(isWin) {
    if (isBattling) return;
    isBattling = true;

    if (isWin) {
        // --- 勝利演出 ---
        // 1. プレイヤーが前進・アタック
        let t = 0;
        const initialPlayerX = -1.2;
        const initialCpuX = 1.2;

        showAnnouncement("CRITICAL HIT! 💥", "#ff4757");

        const attackAnim = () => {
            t += 0.08;
            if (t < 0.5) {
                // 突進
                playerGroup.position.x = THREE.MathUtils.lerp(initialPlayerX, 0.4, t * 2);
            } else if (t < 1.0) {
                // ヒット＆CPUノックバック
                setHp('cpu', 0);
                cpuGroup.position.x = THREE.MathUtils.lerp(initialCpuX, 2.5, (t - 0.5) * 2);
                cpuGroup.position.y = Math.sin((t - 0.5) * Math.PI * 2) * 0.8;
                cpuGroup.rotation.z = (t - 0.5) * 1.5;
            } else if (t < 1.5) {
                // プレイヤー帰還
                playerGroup.position.x = THREE.MathUtils.lerp(0.4, initialPlayerX, (t - 1.0) * 2);
            } else {
                // 演出完了
                playerGroup.position.x = initialPlayerX;
                cpuGroup.position.x = initialCpuX;
                cpuGroup.position.y = 0;
                cpuGroup.rotation.z = 0;

                currentWins++;
                document.getElementById("current-wins").innerText = currentWins;
                showAnnouncement(`🏆 ${currentWins} 連勝達成！`, "#ffd32a");

                setTimeout(() => {
                    generateCpu();
                    isBattling = false;
                }, 400);
                return;
            }
            requestAnimationFrame(attackAnim);
        };
        attackAnim();

    } else {
        // --- 敗北演出 ---
        let t = 0;
        const initialCpuX = 1.2;
        const initialPlayerX = -1.2;

        showAnnouncement("CPU COMBO ATTACK! ⚡", "#ff4757");

        const loseAnim = () => {
            t += 0.08;
            if (t < 0.5) {
                // CPUが突撃
                cpuGroup.position.x = THREE.MathUtils.lerp(initialCpuX, -0.4, t * 2);
            } else if (t < 1.0) {
                // プレイヤー被弾＆ダウン
                setHp('player', 0);
                playerGroup.position.x = THREE.MathUtils.lerp(initialPlayerX, -2.2, (t - 0.5) * 2);
                playerGroup.rotation.z = -(t - 0.5) * 1.5; // 倒れる
            } else {
                cpuGroup.position.x = initialCpuX;
                // ゲームオーバーUI表示
                document.getElementById("action-area").style.display = "none";
                document.getElementById("result-area").style.display = "block";
                document.getElementById("final-wins").innerText = currentWins;

                // 最高記録チェック
                if (currentWins > highScore) {
                    highScore = currentWins;
                    localStorage.setItem("battle_high_score", highScore);
                    document.getElementById("high-score").innerText = highScore;
                    showAnnouncement("🎉 自己ベスト更新！ 🎉", "#2ed573");
                }
                isBattling = false;
                return;
            }
            requestAnimationFrame(loseAnim);
        };
        loseAnim();
    }
}

// X（旧Twitter）への投稿機能
function shareOnX() {
    const text = `⚔️【3D自作キャラバトル】\n自作VRMアバターと共にCPUの猛攻を耐え抜き、🔥【 ${currentWins} 連勝 】🔥 を達成した！\n\n#自作キャラバトル #VRM #Threejs #インディーゲーム開発`;
    const gameUrl = window.location.href;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(gameUrl)}`;
    window.open(xUrl, '_blank');
}

// ゲームリセット
function resetGame() {
    currentWins = 0;
    document.getElementById("current-wins").innerText = currentWins;
    document.getElementById("action-area").style.display = "flex";
    document.getElementById("result-area").style.display = "none";

    // プレイヤーの倒れたポーズを戻す
    playerGroup.position.set(-1.2, 0, 0);
    playerGroup.rotation.set(0, Math.PI / 4, 0);

    generateCpu();
}

// ========================================================
// 6. メインレンダーループ (呼吸アニメーション & VRM更新)
// ========================================================
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // コントロール更新
    if (controls) controls.update();

    // VRMモデルのアニメーション（微小な呼吸）
    if (currentVrm) {
        currentVrm.update(delta);
        currentVrm.scene.position.y = Math.sin(elapsedTime * 2.0) * 0.015;
    } else if (defaultPlayerMesh && !isBattling) {
        // デフォルトボットの待機モーション
        defaultPlayerMesh.position.y = Math.sin(elapsedTime * 2.5) * 0.02;
    }

    // CPU待機モーション
    if (cpuMesh && !isBattling) {
        cpuMesh.position.y = Math.sin(elapsedTime * 2.5 + 1.0) * 0.02;
    }

    // サイキッカーの浮遊オーブの回転
    if (floatingOrbs.length > 0) {
        floatingOrbs.forEach(item => {
            const angle = elapsedTime * 2.0 + item.angleOffset;
            item.mesh.position.set(
                Math.cos(angle) * 0.65,
                1.1 + Math.sin(elapsedTime * 3.0 + item.angleOffset) * 0.15,
                Math.sin(angle) * 0.65
            );
            item.mesh.rotation.y += 0.04;
        });
    }

    // 武器の微動
    if (cpuWeaponMesh && !isBattling) {
        cpuWeaponMesh.rotation.z = Math.sin(elapsedTime * 2.0) * 0.05;
    }

    renderer.render(scene, camera);
}

// ========================================================
// 7. イベントバインド & 初期起動
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
    // ハイスコア表示
    document.getElementById("high-score").innerText = highScore;

    // ボタンイベント
    document.getElementById("btn-win").addEventListener('click', () => playTurn(true));
    document.getElementById("btn-lose").addEventListener('click', () => playTurn(false));
    document.getElementById("btn-share-x").addEventListener('click', shareOnX);
    document.getElementById("btn-retry").addEventListener('click', resetGame);

    // Three.js 初期化
    initThree();

    // VRMローダーイベント設定
    setupVrmLoader();

    // 初回CPU生成
    generateCpu();
});
