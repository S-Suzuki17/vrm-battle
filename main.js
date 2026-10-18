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
        vfxElement: "fire_orange",
        aiStyle: "titan_bruiser",
        category: "melee-weapon",
        skinColor: 0xb33939,
        armorColor: 0x7d1111,
        accentColor: 0xffdd59,
        scale: 1.28,
        poiseMax: 110,
        presetSliders: { atk: 6, range: 5, spd: 1, stun: 2, atkspd: 1 },
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
        vfxElement: "thunder_cyan",
        aiStyle: "phantom_skirmisher",
        category: "melee-bare",
        skinColor: 0x8c6239,
        armorColor: 0x4a3525,
        accentColor: 0xff9f1a,
        scale: 1.35,
        poiseMax: 125,
        presetSliders: { atk: 3, range: 2, spd: 5, stun: 2, atkspd: 3 },
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
        vfxElement: "dark_purple",
        aiStyle: "stalwart_turtle",
        category: "snipe-bare",
        skinColor: 0x957d65,
        armorColor: 0x5c4d3c,
        accentColor: 0x00f2fe,
        scale: 1.38,
        poiseMax: 140,
        presetSliders: { atk: 3, range: 3, spd: 1, stun: 6, atkspd: 2 },
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
        vfxElement: "ice_blue",
        aiStyle: "stalwart_turtle",
        category: "melee-weapon",
        skinColor: 0xdcdde1,
        armorColor: 0x718093,
        accentColor: 0xfbc531,
        scale: 1.22,
        poiseMax: 115,
        presetSliders: { atk: 3, range: 3, spd: 2, stun: 5, atkspd: 2 },
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
        vfxElement: "fire_orange",
        aiStyle: "sorceress_zoner",
        category: "snipe-weapon",
        skinColor: 0x4cd137,
        armorColor: 0x218c74,
        accentColor: 0xff5e57,
        scale: 1.18,
        poiseMax: 95,
        presetSliders: { atk: 2, range: 2, spd: 6, stun: 1, atkspd: 4 },
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
let currentScore = 0; // プレイリスト#15: リアルタイムSCORE表示
let highScore = Number(localStorage.getItem("battle_high_score") || 0);
let roundTimer = 99;
let roundTimerAccum = 0;
let isGameActive = true;
let isAutoBattle = true;          // 3Dオート街バトル（監督・軍師モード）デフォルトON
let isCinematicSpectator = false; // UI非表示・シネマティック都市観戦モード
let comboHits = 0;
let comboDamage = 0;
let comboResetTimer = null;

// 敗北時アナリティクス＆グラフ/ループ計測用
const battleStats = {
    damageDealt: 0,
    damageTaken: 0,
    stunsInflicted: 0,
    maxCombo: 0,
    skillsUsed: 0,
    propsDestroyed: 0,
    totalBattles: Number(localStorage.getItem("city_total_battles") || 1),
    lastEnemyMove: "豪腕クラッシュ"
};

// Three.js シーン＆ポストプロセス管理（1 unit = 1 meter 実寸大 160m×160m 渋谷都市区画）
let scene, camera, renderer, composer, bloomPass, clock;
let toonGradientMap = null;
let cyclesEnvMap = null;
let arenaRadius = 75.0; // 実寸大 渋谷スクランブル交差点＆大通り都市フィールド半径 (直径150m / 160m×160m街区)
let cityBuildingsColliderList = []; // 実寸大高層ビルのAABBコリジョン＆K-09透過管理配列
let cityStreetProps = [];           // 街中の破壊可能オブジェクト配列 (#4 生成と削除 & The暴DX)
let cityTrialDropsList = [];        // N-06『カービィのエアライド』シティトライアル街中強化パッチ配列
let lockOnReticleMesh = null;       // プレイリスト#16: 3Dターゲットロックオンリング
let shibuyaBillboardTexture = null;  // 109大型街頭LEDビジョン動的CanvasTexture
let shibuyaBillboardCanvas = null;
let billboardUpdateTimer = 0;
let cityJumpPads = [];               // 渋谷地下鉄通気口ジャンプパッド配列
let effectsList = [];
let projectilesList = [];
let playerAuraParticles = [];
let ambientSparkles = [];
let dustTimer = 0;
let cameraShakeIntensity = 0;
let hitStopTimer = 0;
let hitStopVector = new THREE.Vector2(1, 0); // D-4「8つのヒットストップ仕様」＆ H-5「画面振動」方向ベクトル
let lastHitstopFrames = 0;                   // C-1/C-9 60fps換算ヒットストップフレーム数
let lastFrameDataText = "待機 (0F)";         // C-1/C-9 フレーム計測テキスト
let occludedBuildingsCount = 0;              // K-09 カメラ〜キャラ間透過ビル数
let isKoSlowMo = false;
let slowMoTimer = 0;
let cinematicCameraMode = null;
let studioSyncSlidersFn = null;

// ========================================================
// 2.2 『桜井政博のゲーム作るには』全39講 統合【パラメーター】＆ 悪魔の釜 ＆ シティトライアル管理
// ========================================================
const sakuraiParams = {
    cauldronIntensity: 2.0, // B-5「悪魔の釜」(パルテナの鏡 N-10): ホンキ度 [1.0 〜 9.0]
    hitstopScale: 1.0,      // D-4「8つのヒットストップ仕様」: 【ヒットストップ倍率】
    launchScale: 1.0,       // K-06「『スマブラ』のふっとばし」: 【ふっとばし初速倍率】
    cameraLeadDist: 1.8,    // D-5「注視点をくっつけない」: 【カメラ注視点先読み距離(m)】
    debugHitboxes: false    // K-08「デバッグモード」＆ F-2「判定のあるものを強調する」
};

// N-06『カービィのエアライド』シティトライアル：渋谷の街中で集めた強化パッチ数
const cityTrialPatches = {
    atk: 0,    // 🔴 コウゲキパッチ (+5% ATK/個)
    spd: 0,    // 🔵 ソクドパッチ (+0.35m/s 移動速度/個)
    launch: 0, // 🟡 フッ飛ばしパッチ (+8% ふっとばし力/個)
    def: 0     // 💚 ボウギョパッチ (+80 最大HP＆即時回復/個)
};

// ========================================================
// 2.5 I-2「重要度で効果音バランスを取る」＆ I-9「アタック強め、残響ほどほど」Web Audio シンセSE＆BGM
// ========================================================
const SoundEngine = {
    ctx: null,
    enabled: true,
    bgmTimer: null,
    bgmStep: 0,
    duckUntil: 0, // I-2 重要効果音再生時にBGM・環境音をダッキング（音量抑制）する時刻
    ambientNode: null,
    ambientGain: null,
    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (this.enabled && !this.bgmTimer) {
            this.startBgmLoop();
        }
        if (this.enabled && !this.ambientNode) {
            this.startAmbientLoop();
        }
    },
    play(type) {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            if (type === 'slash') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(560, now);
                osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
                osc.start(now);
                osc.stop(now + 0.10);
            } else if (type === 'hit') {
                // I-9 アタック強め、残響ほどほど
                this.duckUntil = now + 0.18;
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(240, now);
                osc.frequency.exponentialRampToValueAtTime(52, now + 0.12);
                gain.gain.setValueAtTime(0.26, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
                osc.start(now);
                osc.stop(now + 0.13);
            } else if (type === 'smash') {
                // D-11 はじきスマッシュ攻撃：強烈な打撃アタック音
                this.duckUntil = now + 0.40;
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(420, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.22);
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
                osc.start(now);
                osc.stop(now + 0.24);
            } else if (type === 'justguard') {
                // B-1/B-2 ジャストシールド成功時の高アタック金属パリィ音
                this.duckUntil = now + 0.35;
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1240, now);
                osc.frequency.setValueAtTime(1760, now + 0.04);
                gain.gain.setValueAtTime(0.30, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
                osc.start(now);
                osc.stop(now + 0.25);
            } else if (type === 'patch') {
                // N-06 シティトライアル強化パッチ獲得音
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(587.33, now);
                osc.frequency.setValueAtTime(880, now + 0.06);
                osc.frequency.setValueAtTime(1174.66, now + 0.12);
                gain.gain.setValueAtTime(0.20, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.start(now);
                osc.stop(now + 0.23);
            } else if (type === 'finishzoom') {
                // D-1「大事なところはストップ！」特大フィニッシュズーム雷鳴音
                this.duckUntil = now + 0.85;
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(620, now);
                osc.frequency.exponentialRampToValueAtTime(48, now + 0.48);
                gain.gain.setValueAtTime(0.34, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.50);
                osc.start(now);
                osc.stop(now + 0.50);
            } else if (type === 'explode') {
                this.duckUntil = now + 0.30;
                osc.type = 'square';
                osc.frequency.setValueAtTime(135, now);
                osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
                gain.gain.setValueAtTime(0.26, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
                osc.start(now);
                osc.stop(now + 0.30);
            } else if (type === 'alert') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(660, now);
                osc.frequency.setValueAtTime(880, now + 0.07);
                gain.gain.setValueAtTime(0.16, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.start(now);
                osc.stop(now + 0.22);
            } else if (type === 'lockon') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(980, now);
                osc.frequency.setValueAtTime(1320, now + 0.05);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
                osc.start(now);
                osc.stop(now + 0.14);
            } else if (type === 'pause') {
                // J-10 ポーズ音
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.setValueAtTime(1174.66, now + 0.08);
                gain.gain.setValueAtTime(0.20, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
                osc.start(now);
                osc.stop(now + 0.20);
            } else if (type === 'unpause') {
                // J-10 再開音
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1174.66, now);
                osc.frequency.setValueAtTime(880, now + 0.08);
                gain.gain.setValueAtTime(0.20, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
                osc.start(now);
                osc.stop(now + 0.20);
            } else if (type === 'ko') {
                this.duckUntil = now + 0.65;
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(88, now + 0.55);
                gain.gain.setValueAtTime(0.28, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
                osc.start(now);
                osc.stop(now + 0.58);
            } else if (type === 'cheer') {
                // C-24 ほめる！高コンボ・歓声ファンファーレ
                this.duckUntil = now + 0.55;
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, now);       // C5
                osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
                osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
                osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
                gain.gain.setValueAtTime(0.26, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.46);
            } else if (type === 'jumppad') {
                // 渋谷通気口ジェット気流発射音
                osc.type = 'sine';
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.exponentialRampToValueAtTime(780, now + 0.28);
                gain.gain.setValueAtTime(0.30, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
                osc.start(now);
                osc.stop(now + 0.32);
            } else if (type === 'techroll') {
                // 受身・起き上がりローリング音
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(160, now + 0.14);
                gain.gain.setValueAtTime(0.22, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
                osc.start(now);
                osc.stop(now + 0.16);
            }
        } catch (e) {
            // AudioContext autoplay restriction fallback
        }
    },
    startBgmLoop() {
        if (this.bgmTimer) clearInterval(this.bgmTimer);
        const standardNotes = [110, 130.81, 146.83, 164.81, 146.83, 130.81, 98.0, 110];
        const crisisNotes = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440];

        const tick = () => {
            if (!this.enabled || !this.ctx || this.ctx.state !== 'running' || !isGameActive) return;
            const now = this.ctx.currentTime;
            // B-18『ピンチで盛り上げる』: HP35%以下で高速かつ高音アルペジオの緊急クライシス曲へ変調
            const isCrisis = player && player.hp > 0 && player.hp <= player.maxHp * 0.35;
            const notes = isCrisis ? crisisNotes : standardNotes;

            // I-2 重要効果音が鳴っている最中はBGM音量を自動的に下げる（ダッキング）
            const bgmVol = now < this.duckUntil ? 0.008 : (isCrisis ? 0.042 : 0.032);
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = isCrisis ? 'sawtooth' : 'triangle';
            const freq = notes[this.bgmStep % notes.length];
            this.bgmStep++;

            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(bgmVol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + (isCrisis ? 0.16 : 0.22));
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + (isCrisis ? 0.17 : 0.23));
        };

        this.bgmTimer = setInterval(tick, 220);
    },
    startAmbientLoop() {
        if (this.ambientNode || !this.ctx) return;
        try {
            // I-11『環境音のバランス』: 渋谷実寸大都市空間の低周波アンビエント（ビル風・都市ノイズ）合成
            const bufferSize = this.ctx.sampleRate * 2;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                output[i] = (b0 + b1 + b2) * 0.08;
            }
            const whiteNoise = this.ctx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 260; // 低周波のみ通過させ都市の重厚な空気を醸成

            const gainNode = this.ctx.createGain();
            gainNode.gain.value = 0.015; // SFXやBGMを阻害しない繊細な音量バランス

            whiteNoise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            whiteNoise.start();
            this.ambientNode = whiteNoise;
            this.ambientGain = gainNode;
        } catch (e) {}
    },
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.init();
            this.play('lockon');
        }
        return this.enabled;
    }
};

function getCauldronMultipliers() {
    // B-5「悪魔の釜」：ホンキ度 (1.0〜9.0) に応じた敵強化リスク＆スコア報酬倍率
    const intensity = sakuraiParams.cauldronIntensity;
    const riskMult = Number((0.85 + (intensity - 1.0) * 0.14).toFixed(2));
    const rewardMult = Number((1.0 + (intensity - 1.0) * 0.35).toFixed(2));
    return { riskMult, rewardMult };
}

function addScore(points) {
    const { rewardMult } = getCauldronMultipliers();
    currentScore += Math.round(points * rewardMult);
    const el = document.getElementById('score-val');
    if (el) el.innerText = currentScore.toLocaleString();
}

function createStatusEffects() {
    return {
        burnTimer: 0,
        burnTickAccum: 0,
        shockTimer: 0,
        frostTimer: 0,
        vortexTimer: 0
    };
}

// プレイヤー管理オブジェクト（キャラデザ・コンボ・必殺技・5種トークン配分・AIガンビット統合）
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
    debugGroup: null, // K-08/F-2 3D当たり判定球グループ

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

    // ② 動き（モーション型） ＆ コンボ攻撃3段ルート ＆ 必殺技フレームワーク
    motionType: "heavy_buster",    // heavy_buster, speed_rush, acrobat_martial, magic_shooter
    vfxElement: "plasma_cyan",     // plasma_cyan, flame_crimson, holy_astral, void_gravity
    skillName: "⚡ 蒼雷・神速烈空閃 ⚡",
    themeColor: 0x00f2fe,
    comboRoute: {
        starter: "flash_step",     // flash_step, armor_impact, sonic_jab, mirage_kick
        linker: "spiral_slash",    // spiral_slash, multi_flurry, guard_crush, plasma_wave
        finisher: "sky_upper"      // sky_upper, meteor_smash, dimension_thrust, cyclone_burst
    },
    ultConfig: {
        form: "meteor_drop",       // meteor_drop, dimension_slash, orbital_laser, omniscience_rush
        trait: "vampire_heal"      // vampire_heal, guard_shatter, overdrive_buff, execute_bonus
    },

    // ④ 5種類のトークン配分システム（合計15トークン上限・各最大6）
    sliderPts: { atk: 3, range: 3, spd: 3, stun: 3, atkspd: 3 },
    atkScale: 1.18,       // 🔴 剛撃トークン: 攻撃力倍率 [0.85x 〜 1.51x]
    attackRange: 3.6,     // 🟡 覇道トークン: 技範囲 [2.4m 〜 4.8m]
    specialRange: 12.0,   // 必殺技範囲 [m]
    stunPower: 1.21,      // 🟡 覇道トークン: 崩し・ひるませ力 [0.85x 〜 1.57x]
    atkSpeed: 1.12,       // 🔵 蒼迅トークン: 攻撃速度倍率 [0.85x 〜 1.39x]
    speed: 6.65,          // 🔵 蒼迅トークン: 街中移動速度 [5.0 〜 8.3]
    hpRegen: 12,          // 🟢 堅守トークン: 秒間HPリジェネ [+0 〜 +24 HP/s]
    spRegenMult: 1.54,    // 🟣 魔導トークン: SP獲得速度倍率 [1.0x 〜 2.08x]
    comboBonus: 0.05,     // 🟣 魔導トークン: コンボ1HITあたりのダメージ加算率
    overdriveTimer: 0,    // 10秒覚醒バフ残り時間

    // ⑤ オート街バトル用 AI作戦ガンビット (IF条件 + THEN行動 × 3スロット)
    gambits: [
        { cond: "sp_50", act: "ult_ex" },
        { cond: "enemy_stun", act: "skill_arts" },
        { cond: "always", act: "atk_rush" }
    ],
    aiDecisionTimer: 0,

    // バトルリアルタイム状態
    hp: 1360,
    maxHp: 1360,
    sp: 60,
    maxSp: 100,
    launchPct: 0,         // K-06『スマブラ』のふっとばし蓄積ダメージ％
    guardHoldTime: 0,     // B-1/B-2 ジャストシールド判定用（ガード開始からの経過秒数）
    lastGuardPressTime: 0,// D-08 壁受身判定用
    lastWallHitTime: 0,   // D-08 壁バウンド判定用
    statusEffects: createStatusEffects(), // C-14 属性状態異常
    squashStretch: new THREE.Vector3(1, 1, 1), // G-9 扁平スケーリング
    position: new THREE.Vector3(-6.0, 0, 2.0),
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

// CPU管理オブジェクト（#8 追尾 ＆ #11 ウロウロ索敵パトロール ＆ K-06 ふっとび率％対応）
const cpu = {
    group: null,
    animPivot: null,
    mesh: null,
    joints: {},
    debugGroup: null,     // K-08/F-2 3D当たり判定球グループ
    bossInfo: CPU_BOSS_TYPES[0],
    archetype: "one_shot_buster",
    themeColor: 0xff4757,
    vfxElement: "fire_orange",
    aiStyle: "titan_bruiser",
    lastWallHitTime: 0,
    statusEffects: createStatusEffects(), // C-14 属性状態異常
    hp: 1000,
    maxHp: 1000,
    sp: 20,
    maxSp: 100,
    launchPct: 0,         // K-06『スマブラ』のふっとばし蓄積ダメージ％ (0%〜300%+)
    squashStretch: new THREE.Vector3(1, 1, 1), // G-9 扁平スケーリング
    poise: 110,           // 体幹値（0になると大ひるみブレイク）
    maxPoise: 110,
    stunTimer: 0,         // ひるみ（Hit-Stun）残り時間
    position: new THREE.Vector3(16.0, 0, -12.0),
    airY: 0,              // 打ち上げ高度
    airVelY: 0,
    rotationY: -Math.PI * 0.55,
    velocity: new THREE.Vector3(),
    speed: 5.4,
    state: "idle",        // idle, move, attack, special, guard, stunned, launched, down
    stateTimer: 0,
    stateDuration: 0.4,
    comboStep: 0,
    isGuarding: false,
    guardBarrierMesh: null,
    aiTimer: 0,
    aiAction: "idle",
    aiMode: "patrol",     // "patrol" (#11 敵をウロウロさせる) | "chase" (#8 敵に追尾させる) | "combat"
    patrolTarget: new THREE.Vector3(18, 0, 0),
    patrolTimer: 0,
    detectionRange: 26.0, // 実寸大都市での索敵範囲 26m
    alerted: false,
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
 * Blender 5.2 Cycles レンダリング画像（都市ショーケース・証明書カード・ポートレート用）をプリロード
 */
function preloadCyclesAssets() {
    const loadImg = (src, key) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { cyclesImages[key] = img; };
        img.src = src;
    };
    loadImg('./assets/renders/cycles_city_showcase.png', 'showcase');
    loadImg('./assets/renders/cycles_hero_portrait.png', 'heroPortrait');
    loadImg('./assets/renders/cycles_oni_portrait.png', 'oniPortrait');
}

// ========================================================
// 4. Three.js シーン初期化 ＆ 実寸大 (1 unit = 1m / 160m×160m) 東京・渋谷3D都市フィールド構築
// ========================================================
async function initScene() {
    preloadCyclesAssets();
    parseUrlGhostChallenger();

    const container = document.getElementById('three-canvas-container');
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x162238);
    // 実寸大 (160m×160m街区＋120m東京タワー) でも遠景の摩天楼が美しく見えるフォグ密度
    scene.fog = new THREE.FogExp2(0x1a2842, 0.0021);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 680);
    camera.position.set(-10.5, 4.2, 11.2);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    container.appendChild(renderer.domElement);

    // プレイリスト#17: ポストプロセス（UnrealBloomPass によるネオン看板・街灯・斬撃エフェクトの輝き強調）
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.42,  // strength: 渋谷のネオン看板とコンボ剣閃が美しく発光する強度
        0.58,  // radius
        0.76   // threshold
    );
    composer.addPass(bloomPass);

    clock = new THREE.Clock();

    // 夕暮れ〜トワイライトの東京都市ライティング ＋ ネオンリムライト
    const hemiLight = new THREE.HemisphereLight(0x9ec5fe, 0x2b3648, 1.48);
    hemiLight.position.set(0, 95, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffe5b4, 2.55);
    sunLight.position.set(55, 88, 60);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 260;
    const d = 75;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // 都会のネオン反射を演出するシアン＆マゼンタピンクのバックリムライト
    const rimLightCyan = new THREE.DirectionalLight(0x00f2fe, 1.05);
    rimLightCyan.position.set(-65, 38, -55);
    scene.add(rimLightCyan);

    const rimLightNeon = new THREE.DirectionalLight(0xff2a85, 0.85);
    rimLightNeon.position.set(65, 34, -50);
    scene.add(rimLightNeon);

    // 実寸大 (1 unit = 1 meter / 160m×160m街区) 東京・渋谷スクランブル交差点＆高層ビル街フィールド構築
    createDaylightAnimeColosseum();

    // プレイヤー＆CPU生成
    createCharacters();

    // 初期CPUボス（またはURL挑戦状ゴースト）配置
    spawnNextCpu();

    window.addEventListener('resize', onResize);
    animate();
}

/**
 * 1:1 実寸大 (1 unit = 1 meter, キャラクター身長 約1.65m基準) 東京・渋谷160m×160m都市区画
 * - プレイリスト #2 (`フィールドを用意してキャラを動かす`), #4 (`時間差でオブジェクトを生成と削除`), #13 (`地形をデザインする`), #16 (`敵をロックオン`), `The暴DX` 統合
 * - 中央 32m×32m 渋谷スクランブル交差点 ＋ 幅24mの4車線大通り（南北・東西 160m）＋ 斜めセンター街通り
 * - 28棟の実寸大高層ビル群（高さ38m〜95m・幅16m〜24m、AABB壁面コライダー付きで通りのみ移動可能）
 * - 高さ52m「SHIBUYA 109」シリンダータワー、高さ120m「東京タワー」、高さ8.5m街灯、高さ6.2m信号機、街中破壊オブジェクト16基
 */
function createDaylightAnimeColosseum() {
    const envGroup = new THREE.Group();
    const texLoader = new THREE.TextureLoader();
    cityBuildingsColliderList = [];

    // 0. Blender 5.2 Cycles 360° 東京トワイライト＆摩天楼環境マップ読み込み (半径420mスカイドーム)
    texLoader.load('./assets/renders/cycles_city_sky.png', skyTex => {
        skyTex.mapping = THREE.EquirectangularReflectionMapping;
        skyTex.colorSpace = THREE.SRGBColorSpace;
        cyclesEnvMap = skyTex;
        scene.environment = skyTex;

        const skyDomeGeo = new THREE.SphereGeometry(420, 48, 32);
        const skyDomeMat = new THREE.MeshBasicMaterial({
            map: skyTex,
            side: THREE.BackSide,
            fog: false
        });
        const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
        skyDome.position.y = -12.0;
        envGroup.add(skyDome);
    });

    // 1. 広域都市コンクリート＆歩道基盤 (380m × 380m)
    const outerCityGround = new THREE.Mesh(
        new THREE.PlaneGeometry(380, 380),
        new THREE.MeshStandardMaterial({ color: 0x222938, roughness: 0.55, metalness: 0.18 })
    );
    outerCityGround.rotation.x = -Math.PI / 2;
    outerCityGround.position.y = -0.02;
    outerCityGround.receiveShadow = true;
    envGroup.add(outerCityGround);

    // 2. 実寸大 幅24m×長さ160m 大通り（南北大通り・東西大通り・斜めセンター街）＆ 中央32m×32mスクランブル交差点
    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = 1024;
    roadCanvas.height = 1024;
    const rctx = roadCanvas.getContext('2d');
    rctx.fillStyle = '#171c26';
    rctx.fillRect(0, 0, 1024, 1024);

    // 車線ライン（中央オレンジ線＆白破線）
    rctx.fillStyle = '#f59e0b';
    rctx.fillRect(506, 0, 12, 1024);
    rctx.fillRect(0, 506, 1024, 12);
    rctx.fillStyle = '#cbd5e1';
    for (let i = 0; i < 32; i++) {
        rctx.fillRect(256, i * 32 + 6, 8, 18);
        rctx.fillRect(760, i * 32 + 6, 8, 18);
        rctx.fillRect(i * 32 + 6, 256, 18, 8);
        rctx.fillRect(i * 32 + 6, 760, 18, 8);
    }
    // スクランブル交差点の横断歩道ゼブラ（4方向＋斜め横断歩道）
    rctx.fillStyle = '#f1f5f9';
    for (let i = 0; i < 12; i++) {
        const offset = 330 + i * 30;
        rctx.fillRect(offset, 260, 18, 65);
        rctx.fillRect(offset, 700, 18, 65);
        rctx.fillRect(260, offset, 65, 18);
        rctx.fillRect(700, offset, 65, 18);
    }
    const roadTex = new THREE.CanvasTexture(roadCanvas);
    roadTex.colorSpace = THREE.SRGBColorSpace;

    const avenueMat = new THREE.MeshStandardMaterial({
        color: 0x181e29,
        roughness: 0.26,
        metalness: 0.30,
        envMapIntensity: 1.45
    });

    // 南北大通り (幅24m × 長さ160m)
    const nsAvenue = new THREE.Mesh(new THREE.PlaneGeometry(24, 160), avenueMat);
    nsAvenue.rotation.x = -Math.PI / 2;
    nsAvenue.position.y = 0.01;
    nsAvenue.receiveShadow = true;
    envGroup.add(nsAvenue);

    // 東西大通り (長さ160m × 幅24m)
    const ewAvenue = new THREE.Mesh(new THREE.PlaneGeometry(160, 24), avenueMat);
    ewAvenue.rotation.x = -Math.PI / 2;
    ewAvenue.position.y = 0.012;
    ewAvenue.receiveShadow = true;
    envGroup.add(ewAvenue);

    // 渋谷センター街 斜めストリート (幅16m × 長さ150m)
    const diagAvenue = new THREE.Mesh(new THREE.PlaneGeometry(16, 150), avenueMat);
    diagAvenue.rotation.x = -Math.PI / 2;
    diagAvenue.rotation.z = Math.PI / 4;
    diagAvenue.position.y = 0.008;
    diagAvenue.receiveShadow = true;
    envGroup.add(diagAvenue);

    // 中央 36m×36m 渋谷スクランブル交差点（Blender 5.2 Cycles アスファルトテクスチャ適用）
    const scrambleMat = new THREE.MeshStandardMaterial({
        map: roadTex,
        roughness: 0.22,
        metalness: 0.35,
        envMapIntensity: 1.6
    });
    texLoader.load('./assets/renders/cycles_city_ground.png', cyclesGroundTex => {
        cyclesGroundTex.colorSpace = THREE.SRGBColorSpace;
        cyclesGroundTex.anisotropy = 8;
        scrambleMat.map = cyclesGroundTex;
        scrambleMat.needsUpdate = true;
    });
    const scramblePlaza = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), scrambleMat);
    scramblePlaza.rotation.x = -Math.PI / 2;
    scramblePlaza.position.y = 0.02;
    scramblePlaza.receiveShadow = true;
    envGroup.add(scramblePlaza);

    // 大通り沿いの実寸大横断歩道ストライプ（北・南・東・西・遠方交差点）
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    [-55, -20, 20, 55].forEach(pos => {
        for (let s = -9; s <= 9; s += 2.2) {
            const zStripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.2), stripeMat);
            zStripe.rotation.x = -Math.PI / 2;
            zStripe.position.set(s, 0.025, pos);
            envGroup.add(zStripe);

            const xStripe = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), stripeMat);
            xStripe.rotation.x = -Math.PI / 2;
            xStripe.position.set(pos, 0.025, s);
            envGroup.add(xStripe);
        }
    });

    // 実寸大フィールド外周境界リング (半径75m = 直径150m)
    const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(arenaRadius - 0.35, arenaRadius + 0.35, 96),
        new THREE.MeshBasicMaterial({ color: 0x00f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.04;
    envGroup.add(glowRing);

    // 3. ビル窓発光テクスチャ（プロシージャル高層ビル窓グリッド）
    function createBuildingWindowTexture(accentColorHex) {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 512;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#141a26';
        ctx.fillRect(0, 0, 256, 512);

        const cols = 10;
        const rows = 26;
        const padX = 5, padY = 4;
        const w = (256 - padX * (cols + 1)) / cols;
        const h = (512 - padY * (rows + 1)) / rows;

        for (let r = 0; r < rows; r++) {
            const floorLitChance = 0.28 + (Math.sin(r * 1.7) * 0.5 + 0.5) * 0.55;
            for (let col = 0; col < cols; col++) {
                const rand = Math.random();
                if (rand < floorLitChance) {
                    if (rand < 0.14) ctx.fillStyle = accentColorHex;
                    else if (rand < 0.48) ctx.fillStyle = '#ffe8a3';
                    else ctx.fillStyle = '#d8f3ff';
                } else {
                    ctx.fillStyle = '#1e2738';
                }
                ctx.fillRect(padX + col * (w + padX), padY + r * (h + padY), w, h);
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    const winTexCyan = createBuildingWindowTexture('#00f2fe');
    const winTexPink = createBuildingWindowTexture('#ff2a85');
    const winTexGold = createBuildingWindowTexture('#ffdd59');

    // 4. 実寸大ランドマーク①：「SHIBUYA 109」シリンダータワー（北西角・高さ52m・大型街頭ビジョン）
    const tower109Group = new THREE.Group();
    tower109Group.position.set(-24.0, 0, -26.0);

    const podiumMat = new THREE.MeshStandardMaterial({ map: winTexPink, roughness: 0.35, metalness: 0.4 });
    const podium = createOutlinedPart(new THREE.BoxGeometry(20.0, 34.0, 16.0), podiumMat, 0.008);
    podium.position.set(0, 17.0, 0);
    tower109Group.add(podium);

    const cylMat = new THREE.MeshStandardMaterial({ color: 0xc8d6e5, roughness: 0.2, metalness: 0.75 });
    const cylTower = createOutlinedPart(new THREE.CylinderGeometry(6.2, 6.2, 52.0, 28), cylMat, 0.008);
    cylTower.position.set(5.5, 26.0, 5.5);
    tower109Group.add(cylTower);

    // 109クラウンネオンリング
    const crownRing1 = new THREE.Mesh(
        new THREE.CylinderGeometry(6.4, 6.4, 3.2, 28),
        new THREE.MeshBasicMaterial({ color: 0xff2a85 })
    );
    crownRing1.position.set(5.5, 46.5, 5.5);
    tower109Group.add(crownRing1);

    // 大型街頭LEDビジョン画面 (14m × 8.5m) — 109 リアルタイムバトル実況中継スクリーン
    const visionCanvas = document.createElement('canvas');
    visionCanvas.width = 512;
    visionCanvas.height = 256;
    const visionTexture = new THREE.CanvasTexture(visionCanvas);
    visionTexture.colorSpace = THREE.SRGBColorSpace;
    shibuyaBillboardTexture = visionTexture;
    shibuyaBillboardCanvas = visionCanvas;
    const visionMat = new THREE.MeshBasicMaterial({ map: visionTexture });
    const visionScreen = new THREE.Mesh(new THREE.PlaneGeometry(14.0, 8.5), visionMat);
    visionScreen.position.set(0, 21.0, 8.15);
    tower109Group.add(visionScreen);

    envGroup.add(tower109Group);
    // SHIBUYA 109 の実寸大壁面コライダー登録 (K-09 透過機能対応)
    cityBuildingsColliderList.push({
        x: -24.0,
        z: -26.0,
        hw: 11.2,
        hd: 9.5,
        name: "SHIBUYA 109",
        mesh: podium,
        mat: podiumMat
    });

    // 5. 4つの街区に立ち並ぶ実寸大 28棟の高層ビル群（高さ38m〜95m・幅16m〜24m）＋ AABB壁面コライダー
    const neonColors = [0xff2a85, 0x00f2fe, 0xffbe0b, 0x7bed9f, 0xa29bfe];
    // [x, z, width(m), height(m), depth(m)] — 幅24mの大通り(x: -12〜12, z: -12〜12)を避けて4街区に配置
    const buildingSpecs = [
        // 北東ブロック (Q1: x > 14, z < -14)
        [ 24.0, -24.0, 16.0, 54.0, 16.0],
        [ 44.0, -24.0, 18.0, 68.0, 16.0],
        [ 64.0, -24.0, 16.0, 48.0, 16.0],
        [ 24.0, -44.0, 16.0, 62.0, 18.0],
        [ 46.0, -46.0, 20.0, 86.0, 20.0],
        [ 24.0, -64.0, 16.0, 52.0, 16.0],
        [ 50.0, -68.0, 22.0, 92.0, 20.0],
        // 北西ブロック (Q2: x < -14, z < -14, 109の周囲)
        [-46.0, -24.0, 18.0, 58.0, 16.0],
        [-66.0, -24.0, 16.0, 46.0, 16.0],
        [-24.0, -48.0, 16.0, 64.0, 18.0],
        [-46.0, -48.0, 20.0, 78.0, 20.0],
        [-68.0, -48.0, 18.0, 55.0, 18.0],
        [-26.0, -68.0, 18.0, 72.0, 16.0],
        [-50.0, -70.0, 22.0, 88.0, 20.0],
        // 南西ブロック (Q3: x < -14, z > 14)
        [-24.0,  24.0, 16.0, 48.0, 16.0],
        [-44.0,  24.0, 18.0, 64.0, 16.0],
        [-64.0,  24.0, 16.0, 44.0, 16.0],
        [-24.0,  44.0, 16.0, 58.0, 18.0],
        [-46.0,  46.0, 20.0, 82.0, 20.0],
        [-24.0,  64.0, 16.0, 50.0, 16.0],
        [-48.0,  66.0, 20.0, 74.0, 18.0],
        // 南東ブロック (Q4: x > 14, z > 14)
        [ 24.0,  24.0, 16.0, 52.0, 16.0],
        [ 44.0,  24.0, 18.0, 66.0, 16.0],
        [ 64.0,  24.0, 16.0, 45.0, 16.0],
        [ 24.0,  44.0, 16.0, 60.0, 18.0],
        [ 46.0,  46.0, 22.0, 95.0, 22.0],
        [ 24.0,  64.0, 16.0, 48.0, 16.0],
        [ 48.0,  66.0, 20.0, 76.0, 18.0]
    ];

    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });
    buildingSpecs.forEach(([bx, bz, bw, bh, bd], idx) => {
        const wTex = idx % 3 === 0 ? winTexCyan : (idx % 3 === 1 ? winTexPink : winTexGold);
        const bMat = new THREE.MeshStandardMaterial({
            map: wTex,
            roughness: 0.32,
            metalness: 0.45,
            emissive: new THREE.Color(0x1a2639),
            emissiveIntensity: 0.38
        });
        const bldg = createOutlinedPart(new THREE.BoxGeometry(bw, bh, bd), bMat, 0.006);
        bldg.position.set(bx, bh / 2, bz);
        envGroup.add(bldg);

        // プレイリスト#2: ビル壁面のAABB障害物コライダー ＆ K-09 透過機能用メッシュ登録
        cityBuildingsColliderList.push({
            x: bx,
            z: bz,
            hw: bw * 0.5 + 0.75,
            hd: bd * 0.5 + 0.75,
            name: `Tower-${idx + 1}`,
            mesh: bldg,
            mat: bMat
        });

        // ビル側面の縦型大型ネオン看板（実寸大 高さ12m〜24m）
        const neonCol = neonColors[idx % neonColors.length];
        const signMat = new THREE.MeshBasicMaterial({ color: neonCol });
        const signMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, Math.min(22.0, bh * 0.38), 0.5), signMat);
        const faceDirX = bx > 0 ? -1 : 1;
        signMesh.position.set(
            bx + faceDirX * (bw * 0.5 + 0.35),
            bh * 0.48,
            bz
        );
        envGroup.add(signMesh);

        // 屋上の赤色航空障害灯
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), beaconMat);
        beacon.position.set(bx, bh + 0.5, bz);
        envGroup.add(beacon);
    });

    // 6. 実寸大ランドマーク②：高さ120m「東京タワー」電波塔（北西奥）
    const towerGroup = new THREE.Group();
    towerGroup.position.set(-72.0, 0, -96.0);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let seg = 0; seg < 6; seg++) {
        const rTop = 1.2 + (5 - seg) * 1.45;
        const rBot = 1.2 + (6 - seg) * 1.45;
        const segMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(rTop, rBot, 16.5, 8),
            seg % 2 === 0 ? redMat : whiteMat
        );
        segMesh.position.y = seg * 16.5 + 8.25;
        towerGroup.add(segMesh);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.1, 22.0, 8), redMat);
    spire.position.y = 110.0;
    towerGroup.add(spire);
    envGroup.add(towerGroup);

    // 7. 大通り沿いの実寸大街灯 (高さ8.5m)・信号機 (高さ6.2m)・ガードレール・街路樹 (高さ7.5mケヤキ並木)
    const poleMat = createToonMaterial(0x4b5563, 0x000000, 0, 0.6, 0.35);
    const trunkMat = createToonMaterial(0x5c4033, 0x000000, 0, 0.1, 0.8);
    const leafMat = createToonMaterial(0x2ecc71, 0x0b3b1e, 0.15, 0.05, 0.65);

    const avenueOffsets = [-62, -46, -30, -16, 16, 30, 46, 62];
    avenueOffsets.forEach((coord, idx) => {
        [-12.6, 12.6].forEach(side => {
            // 南北大通り沿いの実寸大街灯 (高さ8.5m)
            const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 8.5, 10), poleMat);
            lampPole.position.set(side, 4.25, coord);
            envGroup.add(lampPole);

            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.42, 12, 12),
                new THREE.MeshBasicMaterial({ color: idx % 2 === 0 ? 0x00f2fe : 0xffeaa7 })
            );
            bulb.position.set(side, 8.6, coord);
            envGroup.add(bulb);

            // 東西大通り沿いの街路樹（実寸大 高さ7.5m ケヤキ並木）
            if (Math.abs(coord) >= 28) {
                const trunk = createOutlinedPart(new THREE.CylinderGeometry(0.32, 0.46, 4.2, 8), trunkMat, 0.012);
                trunk.position.set(coord, 2.1, side);
                envGroup.add(trunk);

                const canopy = createOutlinedPart(new THREE.DodecahedronGeometry(2.6, 1), leafMat, 0.01);
                canopy.position.set(coord, 5.6, side);
                envGroup.add(canopy);
            }
        });
    });

    // スクランブル交差点4隅の実寸大信号機 (高さ6.2m + 3色LED)
    [[-13.5, -13.5], [13.5, -13.5], [-13.5, 13.5], [13.5, 13.5]].forEach(([sx, sz]) => {
        const sigPole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 6.2, 10), poleMat);
        sigPole.position.set(sx, 3.1, sz);
        envGroup.add(sigPole);

        const sigBox = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.55), poleMat);
        sigBox.position.set(sx * 0.88, 5.8, sz);
        envGroup.add(sigBox);

        const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00f2fe }));
        greenLight.position.set(sx * 0.85, 5.8, sz + (sz > 0 ? -0.3 : 0.3));
        envGroup.add(greenLight);
    });

    // 8. プレイリスト#4「時間差でオブジェクトを生成と削除」＆ The暴DX：街中の破壊可能ストリートオブジェクト 16基
    spawnCityStreetProps(envGroup);

    // 9. プレイリスト#16「敵をロックオン」：3Dターゲットロックオン・デュアルレティクルリング生成
    const reticleGroup = new THREE.Group();
    const outerRetGeo = new THREE.RingGeometry(1.05, 1.22, 32);
    const outerRetMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
    const outerRet = new THREE.Mesh(outerRetGeo, outerRetMat);
    outerRet.rotation.x = -Math.PI / 2;

    const innerRetGeo = new THREE.RingGeometry(0.58, 0.68, 4);
    const innerRetMat = new THREE.MeshBasicMaterial({ color: 0xffd32a, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    const innerRet = new THREE.Mesh(innerRetGeo, innerRetMat);
    innerRet.rotation.x = -Math.PI / 2;

    reticleGroup.add(outerRet, innerRet);
    reticleGroup.position.y = 0.08;
    scene.add(reticleGroup);
    lockOnReticleMesh = reticleGroup;

    // 10. 都会の空を舞うネオンホログラム粒子（60個・広域都市スケール）
    const moteGeo = new THREE.OctahedronGeometry(0.10, 0);
    for (let i = 0; i < 60; i++) {
        const mMat = new THREE.MeshBasicMaterial({
            color: i % 3 === 0 ? 0x00f2fe : (i % 3 === 1 ? 0xff2a85 : 0xffe66d),
            transparent: true,
            opacity: 0.8
        });
        const mote = new THREE.Mesh(moteGeo, mMat);
        const ang = Math.random() * Math.PI * 2;
        const rad = 4.0 + Math.random() * (arenaRadius - 5.0);
        const y = 0.8 + Math.random() * 8.5;
        mote.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
        envGroup.add(mote);
        ambientSparkles.push({
            mesh: mote,
            baseY: y,
            angle: ang,
            radius: rad,
            speed: 0.14 + Math.random() * 0.25,
            phase: Math.random() * Math.PI * 2
        });
    }

    spawnCityJumpPads(envGroup);
    scene.add(envGroup);
}

/**
 * プレイリスト#4「時間差でオブジェクトを生成と削除」＆ The暴DX：
 * 渋谷の大通り沿いに配置される16基の破壊可能ストリートオブジェクト（サイバー自販機・ネオン立て看板・バリケード）
 * 攻撃で吹き飛ばすと +250 SCORE ＆ SP +12% ＆ N-06『カービィのエアライド』シティトライアル強化パッチをドロップ！
 */
function spawnCityStreetProps(parentGroup) {
    cityStreetProps = [];
    const propCoords = [
        [-10.5, -18.0, "vending"], [ 10.5, -18.0, "neon_sign"],
        [-10.5, -34.0, "barricade"], [ 10.5, -34.0, "vending"],
        [-10.5,  18.0, "neon_sign"], [ 10.5,  18.0, "vending"],
        [-10.5,  34.0, "vending"], [ 10.5,  34.0, "barricade"],
        [-18.0, -10.5, "vending"], [-34.0,  10.5, "neon_sign"],
        [ 18.0, -10.5, "neon_sign"], [ 34.0,  10.5, "vending"],
        [-22.0, -22.0, "barricade"], [ 22.0,  22.0, "neon_sign"],
        [-48.0,   0.0, "barricade"], [ 48.0,   0.0, "barricade"]
    ];

    propCoords.forEach(([px, pz, type], idx) => {
        const g = new THREE.Group();
        g.position.set(px, 0, pz);

        if (type === "vending") {
            const body = createOutlinedPart(
                new THREE.BoxGeometry(1.15, 2.05, 0.85),
                createToonMaterial(idx % 2 === 0 ? 0x0984e3 : 0xe84393, 0x00f2fe, 0.25),
                0.015
            );
            body.position.y = 1.025;
            const panel = new THREE.Mesh(
                new THREE.PlaneGeometry(0.88, 1.15),
                new THREE.MeshBasicMaterial({ color: 0xffeaa7 })
            );
            panel.position.set(0, 1.25, 0.44);
            g.add(body, panel);
        } else if (type === "neon_sign") {
            const frame = createOutlinedPart(
                new THREE.BoxGeometry(0.95, 1.75, 0.35),
                createToonMaterial(0x1e272e, 0xff2a85, 0.55),
                0.015
            );
            frame.position.y = 0.95;
            g.add(frame);
        } else {
            const bar = createOutlinedPart(
                new THREE.BoxGeometry(2.1, 1.05, 0.55),
                createToonMaterial(0xfbc531, 0x000000, 0),
                0.015
            );
            bar.position.y = 0.55;
            g.add(bar);
        }

        parentGroup.add(g);
        cityStreetProps.push({
            mesh: g,
            x: px,
            z: pz,
            type,
            alive: true,
            respawnTimer: 0
        });
    });
}

/**
 * プレイリスト#2「障害物コライダー」：実寸大高層ビル（AABB）との衝突押し戻し判定
 */
function resolveCityBuildingCollisions(entity) {
    const px = entity.position.x;
    const pz = entity.position.z;
    const isLaunched = (entity.state === "launched" || entity.state === "stunned");
    const speed = entity.velocity ? entity.velocity.length() : 0;

    for (let i = 0; i < cityBuildingsColliderList.length; i++) {
        const b = cityBuildingsColliderList[i];
        const dx = px - b.x;
        const dz = pz - b.z;
        if (Math.abs(dx) < b.hw && Math.abs(dz) < b.hd) {
            const overlapX = b.hw - Math.abs(dx);
            const overlapZ = b.hd - Math.abs(dz);
            let normalX = 0, normalZ = 0;

            if (overlapX < overlapZ) {
                entity.position.x += dx >= 0 ? overlapX : -overlapX;
                normalX = dx >= 0 ? 1 : -1;
            } else {
                entity.position.z += dz >= 0 ? overlapZ : -overlapZ;
                normalZ = dz >= 0 ? 1 : -1;
            }

            // D-08『壁バウンド（Wall Bounce）＆ 壁受身（Wall Tech）』
            if (isLaunched && speed > 5.5 && (performance.now() - (entity.lastWallHitTime || 0)) > 420) {
                entity.lastWallHitTime = performance.now();
                const isPlayer = (entity === player);

                // 受身判定:
                // プレイヤー: ガードキー押下中、または直前0.22s以内の入力
                // CPU: ボスAIおよび悪魔の釜ホンキ度に応じた確率 (25%〜50%)
                const isTeched = isPlayer
                    ? (input.guard || (performance.now() - (player.lastGuardPressTime || 0) < 240))
                    : (Math.random() < (0.28 + (sakuraiParams.cauldronIntensity - 1.0) * 0.03));

                if (isTeched) {
                    // ⚡ 壁受身成功（Wall Tech）
                    SoundEngine.play('justguard');
                    spawnHitSparks(entity.position, 0x00f2fe, 32);
                    spawnDamageNumber(entity.position.x, entity.position.y + 1.2, entity.position.z, "TECH!", "buff", "⚡受身成功！");
                    showAnnouncement(isPlayer ? "⚡ 壁受身（WALL TECH）成功！即座に復帰！" : "⚡ 敵が壁受身で体勢を立て直した！", "#00f2fe");
                    entity.state = "idle";
                    entity.airVelY = 5.5; // 壁キックで跳ね上がる
                    entity.velocity.set(normalX * 6.5, 0, normalZ * 6.5);
                    entity.isInvincible = true;
                    setTimeout(() => { if (entity.state !== "special") entity.isInvincible = false; }, 320);
                } else {
                    // 💥 壁激突バウンド（Wall Bounce）
                    const wallDmg = Math.round(speed * 3.6);
                    SoundEngine.play('explode');
                    cameraShakeIntensity = 0.42;
                    spawnHitSparks(entity.position, 0xdfe6e9, 36);
                    spawnGroundSlamVFX(entity.position, 0xff4757, 1.15);
                    triggerDefenderFlashing(entity);
                    spawnDamageNumber(entity.position.x, entity.position.y + 1.2, entity.position.z, wallDmg, "crit", "💥壁激突！");
                    applyDamage(isPlayer ? 'player' : 'cpu', wallDmg);

                    // 跳ね返り物理反発
                    if (normalX !== 0) entity.velocity.x = normalX * Math.abs(entity.velocity.x) * 0.65;
                    if (normalZ !== 0) entity.velocity.z = normalZ * Math.abs(entity.velocity.z) * 0.65;
                    entity.airVelY = Math.max(entity.airVelY, 4.2);
                    hitStopTimer = 0.075 * sakuraiParams.hitStopScale;
                }
            }
        }
    }
}

/**
 * K-09『透過機能』：カメラとプレイヤー/CPUの視線(Line of Sight)を遮る高層ビルを自動検知して半透明化(opacity 0.22)する
 */
function updateBuildingOcclusionTransparency() {
    if (!camera || !player.group) return;
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const targetX = (player.position.x * 0.65 + cpu.position.x * 0.35);
    const targetZ = (player.position.z * 0.65 + cpu.position.z * 0.35);

    const segDX = targetX - camX;
    const segDZ = targetZ - camZ;
    const segLenSq = Math.max(0.01, segDX * segDX + segDZ * segDZ);

    for (let i = 0; i < cityBuildingsColliderList.length; i++) {
        const b = cityBuildingsColliderList[i];
        if (!b.mat) continue;

        let occluded = false;
        if (sakuraiParams.enableBuildingOcclusion) {
            // カメラ〜注視点の線分とビル中心の最短距離を計算
            const t = Math.max(0, Math.min(1, ((b.x - camX) * segDX + (b.z - camZ) * segDZ) / segLenSq));
            const nearX = camX + t * segDX;
            const nearZ = camZ + t * segDZ;
            if (Math.abs(nearX - b.x) < b.hw + 1.5 && Math.abs(nearZ - b.z) < b.hd + 1.5) {
                occluded = true;
            }
        }

        if (occluded) {
            b.mat.transparent = true;
            b.mat.opacity = 0.22;
        } else if (b.mat.opacity < 1.0) {
            b.mat.opacity = 1.0;
            b.mat.transparent = false;
        }
    }
}

/**
 * N-06『カービィのエアライド（シティトライアル）』：街オブジェクト破壊時に3D強化パッチ（コウゲキ・ソクド・フッ飛ばし・ボウギョ）をドロップ
 */
function spawnCityTrialPatch(x, z) {
    const patchTypes = [
        { key: "atk",    label: "🔴コウゲキ+1",   color: 0xff4757 },
        { key: "spd",    label: "🔵ソクド+1",     color: 0x00f2fe },
        { key: "launch", label: "🟡フッ飛ばし+1", color: 0xffd32a },
        { key: "def",    label: "💚ボウギョ+1",   color: 0x2ed573 }
    ];
    const pType = patchTypes[Math.floor(Math.random() * patchTypes.length)];
    const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.58, 0),
        new THREE.MeshBasicMaterial({ color: pType.color, wireframe: false })
    );
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.65, 0.85, 16),
        new THREE.MeshBasicMaterial({ color: pType.color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = -Math.PI / 2;
    mesh.add(ring);
    mesh.position.set(x, 0.9, z);
    scene.add(mesh);

    cityTrialDropsList.push({
        mesh,
        x,
        z,
        key: pType.key,
        label: pType.label,
        color: pType.color,
        life: 16.0
    });
}

/**
 * N-06 シティトライアル強化パッチの回転＆プレイヤー回収判定
 */
function updateCityTrialPatches(dt) {
    for (let i = cityTrialDropsList.length - 1; i >= 0; i--) {
        const drop = cityTrialDropsList[i];
        drop.life -= dt;
        drop.mesh.rotation.y += dt * 3.8;
        drop.mesh.position.y = 0.85 + Math.sin(clock.elapsedTime * 5.0 + i) * 0.22;

        // プレイヤーまたは近距離で自動吸引回収
        const dist = Math.hypot(player.position.x - drop.x, player.position.z - drop.z);
        if (dist < 4.5) {
            // 吸引移動
            drop.x += (player.position.x - drop.x) * Math.min(1, dt * 9.5);
            drop.z += (player.position.z - drop.z) * Math.min(1, dt * 9.5);
            drop.mesh.position.x = drop.x;
            drop.mesh.position.z = drop.z;
        }

        if (dist < 1.65) {
            cityTrialPatches[drop.key] = (cityTrialPatches[drop.key] || 0) + 1;
            SoundEngine.play('patch');
            addScore(180);
            spawnHitSparks(new THREE.Vector3(player.position.x, 1.0, player.position.z), drop.color, 18);
            spawnDamageNumber(player.position.x, 1.55, player.position.z, drop.label, "crit", "✨CITY TRIAL PATCH!");
            scene.remove(drop.mesh);
            cityTrialDropsList.splice(i, 1);
            continue;
        }

        if (drop.life <= 0) {
            scene.remove(drop.mesh);
            cityTrialDropsList.splice(i, 1);
        }
    }
}

/**
 * プレイリスト#4 ＆ The暴DX ＆ N-06 シティトライアル：攻撃時の街中オブジェクト（自販機・看板・バリケード）破壊判定
 */
function checkStreetPropHits(attackerPos, reach) {
    for (let i = 0; i < cityStreetProps.length; i++) {
        const prop = cityStreetProps[i];
        if (!prop.alive) continue;
        const d = Math.hypot(attackerPos.x - prop.x, attackerPos.z - prop.z);
        if (d <= reach + 1.2) {
            prop.alive = false;
            prop.respawnTimer = 12.0; // 12秒後に再生成 (#4 時間差でオブジェクトを生成と削除)
            prop.mesh.visible = false;
            battleStats.propsDestroyed++;
            SoundEngine.play('explode');
            const cauldron = getCauldronMultipliers();
            const pts = Math.round(250 * cauldron.rewardMult);
            addScore(pts);
            player.sp = Math.min(player.maxSp, player.sp + 14);
            const propPos = new THREE.Vector3(prop.x, 0.5, prop.z);
            spawnHitSparks(propPos, 0x00f2fe, 36);
            spawnGroundSlamVFX(propPos, 0xffdd59, 1.15);
            spawnDamageNumber(prop.x, 1.2, prop.z, `+${pts} PTS`, "crit", "💥街破壊!");
            // N-06 シティトライアル強化パッチをドロップ！
            spawnCityTrialPatch(prop.x, prop.z);
        }
    }
}

// ========================================================
// 5. 細密アニメ調 3D プレイヤーモデル生成 ＆ K-08/F-2 3D当たり判定球生成
// ========================================================
function createEntityDebugSpheres(entity, isBoss = false) {
    const dbg = new THREE.Group();
    dbg.visible = sakuraiParams.showHitboxes;

    const rScale = isBoss ? 1.35 : 1.0;
    // 青球＝食らい判定（Hurtbox）
    const hurtbox = new THREE.Mesh(
        new THREE.SphereGeometry(0.68 * rScale, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0x00d2ff, wireframe: true, transparent: true, opacity: 0.72 })
    );
    hurtbox.position.y = 1.05 * rScale;

    // 赤球＝攻撃判定（Hitbox: 攻撃中のみ前方に拡大表示 — F-2 判定のあるものを強調する）
    const hitbox = new THREE.Mesh(
        new THREE.SphereGeometry(1.15 * rScale, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff2e4c, wireframe: true, transparent: true, opacity: 0.88 })
    );
    hitbox.position.set(0, 1.1 * rScale, -1.45 * rScale);
    hitbox.visible = false;

    // 黄球＝無敵・ジャストシールド判定（Invincible / Shield）
    const invbox = new THREE.Mesh(
        new THREE.SphereGeometry(0.95 * rScale, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd32a, wireframe: true, transparent: true, opacity: 0.85 })
    );
    invbox.position.y = 1.05 * rScale;
    invbox.visible = false;

    dbg.add(hurtbox, hitbox, invbox);
    entity.debugGroup = dbg;
    entity.debugSpheres = { hurtbox, hitbox, invbox };
    entity.group.add(dbg);
}

function updateDebugHitboxes() {
    [player, cpu].forEach(ent => {
        if (!ent.debugGroup || !ent.debugSpheres) return;
        ent.debugGroup.visible = sakuraiParams.showHitboxes;
        if (!sakuraiParams.showHitboxes) return;

        const isAtk = ent.state === "attack" || ent.state === "skill" || ent.state === "special";
        ent.debugSpheres.hitbox.visible = isAtk;
        if (isAtk && ent === player) {
            const reachScale = Math.max(0.8, (player.attackRange || 3.1) / 3.1);
            ent.debugSpheres.hitbox.scale.setScalar(reachScale);
        }
        ent.debugSpheres.invbox.visible = Boolean(ent.isInvincible || ent.isGuarding);
    });
}

function createCharacters() {
    player.group = new THREE.Group();
    player.animPivot = new THREE.Group();
    player.group.add(player.animPivot);

    player.guardBarrierMesh = createGuardShield(0x00f2fe);
    player.group.add(player.guardBarrierMesh);
    createEntityDebugSpheres(player, false);

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
    createEntityDebugSpheres(cpu, true);
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

function determinePlayerArchetype(tAtk, tRange, tSpd, tStun, tAtkSpd, motionType) {
    if (motionType === "speed_rush" || (tSpd + tAtkSpd >= 7)) {
        return "speed_assassin";
    }
    if (motionType === "heavy_buster" || (tAtk + tRange >= 8)) {
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
        combo: player.comboRoute,
        ult: player.ultConfig,
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
        atk: document.getElementById('sl-atk'),       // 🔴 剛撃トークン (Crimson Offense)
        range: document.getElementById('sl-range'),   // 🟡 覇道トークン (Golden Impact)
        spd: document.getElementById('sl-spd'),       // 🔵 蒼迅トークン (Azure Velocity)
        stun: document.getElementById('sl-stun'),     // 🟢 堅守トークン (Emerald Aegis)
        atkspd: document.getElementById('sl-atkspd')  // 🟣 魔導トークン (Astral Mind)
    };

    const MAX_TOTAL_TOKENS = 15;
    const MAX_PER_TOKEN = 6;

    function renderTokenPips(containerId, count) {
        const el = document.getElementById(containerId);
        if (!el) return;
        let html = '';
        for (let i = 0; i < MAX_PER_TOKEN; i++) {
            html += `<span class="token-pip ${i < count ? 'filled' : ''}"></span>`;
        }
        el.innerHTML = html;
    }

    function syncSlidersAndCalculateStats(changedKey) {
        // 0〜6の範囲にクランプ（レガシーな大きい値が入っていた場合も自動変換）
        Object.keys(sliders).forEach(k => {
            let v = Number(sliders[k].value);
            if (v > MAX_PER_TOKEN) v = Math.min(MAX_PER_TOKEN, Math.round(v / 6));
            if (v < 0) v = 0;
            sliders[k].value = v;
        });

        let total = Object.values(sliders).reduce((acc, el) => acc + Number(el.value), 0);
        if (total > MAX_TOTAL_TOKENS && changedKey) {
            const overflow = total - MAX_TOTAL_TOKENS;
            sliders[changedKey].value = Math.max(0, Number(sliders[changedKey].value) - overflow);
            total = Object.values(sliders).reduce((acc, el) => acc + Number(el.value), 0);
        }

        const tAtk = Number(sliders.atk.value);       // 🔴 剛撃トークン
        const tRange = Number(sliders.range.value);   // 🟡 覇道トークン
        const tSpd = Number(sliders.spd.value);       // 🔵 蒼迅トークン
        const tStun = Number(sliders.stun.value);     // 🟢 堅守トークン
        const tAtkSpd = Number(sliders.atkspd.value); // 🟣 魔導トークン

        // 5種トークンから全パラメータを算出
        const calcAtk = Number((0.85 + tAtk * 0.11).toFixed(2));           // 0.85x 〜 1.51x
        const calcRange = Number((2.4 + tRange * 0.40).toFixed(1));        // 2.4m 〜 4.8m
        const calcStun = Number((0.85 + tRange * 0.12).toFixed(2));        // 0.85x 〜 1.57x
        const calcSpd = Number((5.0 + tSpd * 0.55).toFixed(2));            // 5.0 〜 8.3
        const calcAtkSpd = Number((0.85 + tSpd * 0.09).toFixed(2));        // 0.85x 〜 1.39x
        const calcMaxHp = 1000 + tStun * 120;                              // 1000 〜 1720
        const calcHpRegen = tStun * 4;                                     // +0 〜 +24 HP/秒
        const calcSpRegenMult = Number((1.0 + tAtkSpd * 0.18).toFixed(2)); // 1.0x 〜 2.08x
        const calcComboBonus = Number((0.02 + tAtkSpd * 0.01).toFixed(3)); // +2% 〜 +8%/HIT

        // ビジュアルトークンピップ更新
        renderTokenPips('pips-atk', tAtk);
        renderTokenPips('pips-range', tRange);
        renderTokenPips('pips-spd', tSpd);
        renderTokenPips('pips-stun', tStun);
        renderTokenPips('pips-atkspd', tAtkSpd);

        // ラベル表示更新
        document.getElementById('val-atk').innerText = `${calcAtk.toFixed(2)}x (${tAtk}個)`;
        document.getElementById('val-range').innerText = `${calcRange.toFixed(1)}m / 崩し${calcStun.toFixed(2)}x (${tRange}個)`;
        document.getElementById('val-spd').innerText = `移動${calcSpd.toFixed(1)} / 攻速${calcAtkSpd.toFixed(2)}x (${tSpd}個)`;
        document.getElementById('val-stun').innerText = `HP ${calcMaxHp} / 回復+${calcHpRegen} (${tStun}個)`;
        document.getElementById('val-atkspd').innerText = `SP+${Math.round((calcSpRegenMult - 1) * 100)}% (${tAtkSpd}個)`;

        const rem = MAX_TOTAL_TOKENS - total;
        const badge = document.getElementById('cr-pt-badge');
        if (badge) {
            badge.innerText = `残り: ${rem} / ${MAX_TOTAL_TOKENS} トークン`;
            badge.style.background = rem === 0 ? '#10b981' : '#0284c7';
        }

        return {
            ptAtk: tAtk, ptRange: tRange, ptSpd: tSpd, ptStun: tStun, ptAtkSpd: tAtkSpd,
            calcAtk, calcRange, calcStun, calcAtkSpd, calcSpd,
            calcMaxHp, calcHpRegen, calcSpRegenMult, calcComboBonus
        };
    }

    studioSyncSlidersFn = syncSlidersAndCalculateStats;

    Object.entries(sliders).forEach(([key, el]) => {
        if (el) el.addEventListener('input', () => syncSlidersAndCalculateStats(key));
    });

    // トークン [+] / [-] ボタンのクリックハンドラ
    document.querySelectorAll('.tok-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (player.is_active || player.isCustomCharLocked) {
                showAnnouncement('🔒 出撃ロック中！敗北（引退）するまでトークン再配分はできません！', '#ff4757');
                return;
            }
            const key = btn.getAttribute('data-tok');
            const delta = Number(btn.getAttribute('data-delta') || 0);
            const sl = sliders[key];
            if (!sl) return;
            const nextVal = Math.max(0, Math.min(MAX_PER_TOKEN, Number(sl.value) + delta));
            sl.value = nextVal;
            syncSlidersAndCalculateStats(key);
        });
    });

    // ワンクリック5種トークン配分プリセット（3すくみ＆コンボ・必殺技連動）
    document.querySelectorAll('.alloc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (player.is_active || player.isCustomCharLocked) {
                showAnnouncement('🔒 出撃ロック中！敗北（引退）するまでキャラ変更はできません！', '#ff4757');
                return;
            }
            const preset = btn.getAttribute('data-preset');
            if (preset === 'balance') {
                // ⚡ 蒼迅スピード連撃型 (計15トークン)
                sliders.atk.value = 3; sliders.range.value = 2; sliders.spd.value = 5; sliders.stun.value = 2; sliders.atkspd.value = 3;
                document.getElementById('cr-motion').value = 'speed_rush';
                if (document.getElementById('cmb-starter')) document.getElementById('cmb-starter').value = 'flash_step';
                if (document.getElementById('cmb-linker')) document.getElementById('cmb-linker').value = 'multi_flurry';
                if (document.getElementById('cmb-finisher')) document.getElementById('cmb-finisher').value = 'sky_upper';
                if (document.getElementById('ult-form')) document.getElementById('ult-form').value = 'omniscience_rush';
                if (document.getElementById('ult-trait')) document.getElementById('ult-trait').value = 'overdrive_buff';
                document.getElementById('ai-cond-1').value = 'sp_50'; document.getElementById('ai-act-1').value = 'ult_ex';
                document.getElementById('ai-cond-2').value = 'enemy_stun'; document.getElementById('ai-act-2').value = 'skill_arts';
                document.getElementById('ai-cond-3').value = 'always'; document.getElementById('ai-act-3').value = 'atk_rush';
            } else if (preset === 'power_range') {
                // 💥 剛撃・覇道一撃必殺型 (計15トークン)
                sliders.atk.value = 6; sliders.range.value = 5; sliders.spd.value = 1; sliders.stun.value = 2; sliders.atkspd.value = 1;
                document.getElementById('cr-motion').value = 'heavy_buster';
                if (document.getElementById('cmb-starter')) document.getElementById('cmb-starter').value = 'armor_impact';
                if (document.getElementById('cmb-linker')) document.getElementById('cmb-linker').value = 'guard_crush';
                if (document.getElementById('cmb-finisher')) document.getElementById('cmb-finisher').value = 'meteor_smash';
                if (document.getElementById('ult-form')) document.getElementById('ult-form').value = 'meteor_drop';
                if (document.getElementById('ult-trait')) document.getElementById('ult-trait').value = 'execute_bonus';
                document.getElementById('ai-cond-1').value = 'sp_50'; document.getElementById('ai-act-1').value = 'ult_ex';
                document.getElementById('ai-cond-2').value = 'enemy_guard'; document.getElementById('ai-act-2').value = 'atk_launch';
                document.getElementById('ai-cond-3').value = 'always'; document.getElementById('ai-act-3').value = 'atk_wide';
            } else if (preset === 'combo_stun') {
                // 🛡️ 堅守・魔導カウンター要塞型 (計15トークン)
                sliders.atk.value = 2; sliders.range.value = 2; sliders.spd.value = 2; sliders.stun.value = 5; sliders.atkspd.value = 4;
                document.getElementById('cr-motion').value = 'acrobat_martial';
                if (document.getElementById('cmb-starter')) document.getElementById('cmb-starter').value = 'mirage_kick';
                if (document.getElementById('cmb-linker')) document.getElementById('cmb-linker').value = 'spiral_slash';
                if (document.getElementById('cmb-finisher')) document.getElementById('cmb-finisher').value = 'cyclone_burst';
                if (document.getElementById('ult-form')) document.getElementById('ult-form').value = 'orbital_laser';
                if (document.getElementById('ult-trait')) document.getElementById('ult-trait').value = 'vampire_heal';
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
            spd: stats.ptSpd,
            stun: stats.ptStun,
            atkspd: stats.ptAtkSpd
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

        // コンボ攻撃3段ルート ＆ 必殺技フレームワーク設定を反映
        player.comboRoute = {
            starter: document.getElementById('cmb-starter')?.value || 'flash_step',
            linker: document.getElementById('cmb-linker')?.value || 'spiral_slash',
            finisher: document.getElementById('cmb-finisher')?.value || 'sky_upper'
        };
        player.ultConfig = {
            form: document.getElementById('ult-form')?.value || 'meteor_drop',
            trait: document.getElementById('ult-trait')?.value || 'vampire_heal'
        };

        // 5種トークンによる全パラメータ反映
        player.atkScale = stats.calcAtk;
        player.attackRange = stats.calcRange;
        player.stunPower = stats.calcStun;
        player.atkSpeed = stats.calcAtkSpd;
        player.speed = stats.calcSpd;
        player.maxHp = stats.calcMaxHp;
        player.hp = player.maxHp;
        player.hpRegen = stats.calcHpRegen;
        player.spRegenMult = stats.calcSpRegenMult;
        player.comboBonus = stats.calcComboBonus;
        player.specialRange = Number((player.attackRange * 3.1).toFixed(1));
        player.gambits = readGambitsFromUI();

        player.archetype = determinePlayerArchetype(
            stats.ptAtk, stats.ptRange, stats.ptSpd, stats.ptStun, stats.ptAtkSpd, player.motionType
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
        updateGauges();

        document.getElementById('player-name').innerText = player.design.name;
        spawnGroundSlamVFX(player.position, player.themeColor, 1.1);

        if (lockRegistration) {
            lockCustomCharacterSlot(player.design.name);
            modal.style.display = 'none';
            showAnnouncement(`🚀 ${player.design.name} 渋谷ストリートへ出撃ロック完了！`, "#00f2fe");
        } else {
            modal.style.display = 'none';
            showAnnouncement(`✨ トークン配分＆コンボ・必殺技構成を反映しました！`, "#ffd32a");
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
 * 自分を倒した敵（CPU/ゴースト）のAIガンビット＆トークン配分を1タップでコピーしてスタジオを開く
 */
function copyEnemyBuildAndOpenStudio() {
    unlockCharacterOnDefeat();
    const boss = cpu.bossInfo || CPU_BOSS_TYPES[0];
    const presetSliders = boss.presetSliders || { atk: 4, range: 4, spd: 2, stun: 3, atkspd: 2 };
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
    showAnnouncement(`⚡ 強敵「${boss.name}」のAI＆トークン構成をコピーしました！`, "#00f2fe");
}

function updatePlayerSpecHud() {
    const specEl = document.getElementById('player-spec-tag');
    if (specEl) {
        const t = player.sliderPts || { atk: 3, range: 3, spd: 3, stun: 3, atkspd: 3 };
        specEl.innerText = `🔴剛${t.atk} 🟡覇${t.range} 🔵迅${t.spd} 🟢堅${t.stun} 🟣魔${t.atkspd} | ATK:${player.atkScale.toFixed(2)}x 範囲:${player.attackRange.toFixed(1)}m`;
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
 * H-1『モヤッとさせるな』 / H-3『閃光、爆発、残煙』 / H-6『ヒットマーク』：
 * 攻撃ヒット時の3段階エフェクト（①鋭い白閃光 ➔ ②斜めクロスヘア・ヒットマーク＆幾何学爆発リング ➔ ③黒っぽい残煙リング）
 */
function spawnHitSparks(hitPos, colorHex = 0xffbe0b, count = 36) {
    const container = new THREE.Group();
    container.position.copy(hitPos).add(new THREE.Vector3(0, 1.15 + cpu.airY, 0));
    scene.add(container);

    // ① 閃光 (Flash)
    const flashMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.68, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 })
    );
    // ② 爆発リング (Explosion Ring)
    const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.98, 18),
        new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1.0 })
    );
    ringMesh.lookAt(camera.position);

    // H-6 ヒットマーク（攻撃角度に沿った鋭いX字クロスヘア閃光）
    const crossGroup = new THREE.Group();
    const barGeo = new THREE.PlaneGeometry(2.15, 0.14);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 1.0 });
    const bar1 = new THREE.Mesh(barGeo, barMat);
    bar1.rotation.z = Math.PI * 0.22;
    const bar2 = new THREE.Mesh(barGeo, barMat);
    bar2.rotation.z = -Math.PI * 0.28;
    crossGroup.add(bar1, bar2);
    crossGroup.lookAt(camera.position);

    // ③ 残煙 (Dark Lingering Smoke Ring — H-3)
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide, transparent: true, opacity: 0.72 });
    const smokeRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.78, 14), smokeMat);
    smokeRing.lookAt(camera.position);

    container.add(flashMesh, ringMesh, crossGroup, smokeRing);

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
        life: 0.42,
        maxLife: 0.42,
        update: (dt, item) => {
            const ratio = item.life / item.maxLife;
            flashMesh.scale.multiplyScalar(1.0 + dt * 7.0);
            flashMesh.material.opacity = Math.max(0, (ratio - 0.55) * 2.2);
            ringMesh.scale.multiplyScalar(1.0 + dt * 11.5);
            ringMesh.material.opacity = Math.max(0, (ratio - 0.2) * 1.25);
            crossGroup.scale.multiplyScalar(1.0 + dt * 8.5);
            barMat.opacity = Math.max(0, (ratio - 0.45) * 1.8);
            // H-3: 残煙は後からじわっと広がって残る
            smokeRing.scale.multiplyScalar(1.0 + dt * 5.2);
            smokeMat.opacity = ratio * 0.65;
            sparks.forEach(s => {
                s.vel.y -= 24.0 * dt;
                s.mesh.position.addScaledVector(s.vel, dt);
                s.mat.opacity = ratio;
            });
        }
    });
}

/**
 * K-06『スマブラのふっとばし』：強ふっとび時に軌跡を描く飛行機雲（Launch Smoke Trail）
 */
function spawnLaunchSmokeTrail(pos, airY = 0) {
    const puffMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.68 });
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), puffMat);
    puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.25,
        0.9 + airY + (Math.random() - 0.5) * 0.25,
        pos.z + (Math.random() - 0.5) * 0.25
    );
    scene.add(puff);
    effectsList.push({
        mesh: puff,
        life: 0.46,
        maxLife: 0.46,
        update: (dt, item) => {
            item.mesh.scale.addScalar(dt * 2.4);
            puffMat.opacity = (item.life / item.maxLife) * 0.62;
        }
    });
}

/**
 * H-10『フラッシング』：ダメージを受けた対象キャラクターを一瞬白〜赤に明滅させる
 */
function triggerDefenderFlashing(entity) {
    const root = entity.mesh || entity.vrm?.scene || entity.customGlb;
    if (!root) return;
    root.traverse(obj => {
        if (obj.isMesh && obj.name !== "AnimeOutline" && obj.material && obj.material.emissive) {
            if (!obj.userData.origEmissive) {
                obj.userData.origEmissive = obj.material.emissive.clone();
                obj.userData.origEmissiveInt = obj.material.emissiveIntensity || 0;
            }
            obj.material.emissive.setHex(0xffffff);
            obj.material.emissiveIntensity = 0.85;
        }
    });
    setTimeout(() => {
        root.traverse(obj => {
            if (obj.isMesh && obj.userData.origEmissive && obj.material?.emissive) {
                obj.material.emissive.copy(obj.userData.origEmissive);
                obj.material.emissiveIntensity = obj.userData.origEmissiveInt || 0;
            }
        });
    }, 110);
}

/**
 * D-1『大事なところはストップ！』 / N-12『スマブラSP フィニッシュズーム』：
 * 致死の一撃が決まった瞬間に特大電撃バナー＆カメラズーム＆ヒットストップを発動！
 */
function triggerFinishZoom() {
    SoundEngine.play('finishzoom');
    hitStopTimer = 0.26 * sakuraiParams.hitStopScale;
    cameraShakeIntensity = 0.85;
    cinematicCameraMode = "finish_zoom";
    const banner = document.getElementById('finish-zoom-banner');
    if (banner) {
        banner.style.display = 'flex';
        setTimeout(() => { banner.style.display = 'none'; }, 1150);
    }
    setTimeout(() => {
        if (cinematicCameraMode === "finish_zoom") cinematicCameraMode = null;
    }, 950);
}

/**
 * L-5『参戦ムービー』：ボス登場時にスマブラ風の「参戦!! JOINS THE BATTLE!」スプラッシュを表示
 */
function triggerChallengerSplash(boss) {
    const banner = document.getElementById('challenger-splash-banner');
    const nameEl = document.getElementById('challenger-splash-name');
    const subEl = document.getElementById('challenger-splash-sub');
    if (!banner || !nameEl || !subEl) return;
    nameEl.innerText = boss.name.split('・')[0];
    subEl.innerText = `Lv.${currentWins + 1} ${boss.name} (${boss.style}) — 渋谷実寸大ストリートに参戦!!`;
    banner.style.display = 'flex';
    setTimeout(() => { banner.style.display = 'none'; }, 1450);
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

    // C-24『ほめる！』コンボスタイルランク算出 (COOL / GREAT / EXCELLENT / SSS SAKURAI SICK)
    const styleEl = document.getElementById('combo-style-rank');
    if (styleEl) {
        styleEl.className = 'combo-style-rank';
        if (comboHits >= 7) {
            styleEl.innerText = '🔥 SSS SAKURAI SICK! 🔥';
            styleEl.classList.add('rank-sick');
            if (comboHits === 7) SoundEngine.play('cheer');
        } else if (comboHits >= 5) {
            styleEl.innerText = '⚡ EXCELLENT!!';
            styleEl.classList.add('rank-excellent');
            if (comboHits === 5) SoundEngine.play('cheer');
        } else if (comboHits >= 3) {
            styleEl.innerText = '✨ GREAT!';
            styleEl.classList.add('rank-great');
        } else {
            styleEl.innerText = '💨 COOL';
            styleEl.classList.add('rank-cool');
        }
    }

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

const COMBO_MOVE_EFFECTS = {
    // 1段目 Starter
    flash_step:       { label: "⚡閃光ステップ", lunge: 8.8, dmgMult: 1.0, rangeMult: 1.15, poiseMult: 1.0, launchY: 0 },
    armor_impact:     { label: "🛡️重装インパクト", lunge: 5.5, dmgMult: 1.22, rangeMult: 1.05, poiseMult: 1.35, launchY: 0 },
    sonic_jab:        { label: "👊音速ジャブ", lunge: 6.2, dmgMult: 0.95, rangeMult: 1.0, poiseMult: 1.15, launchY: 0 },
    mirage_kick:      { label: "👟幻影ローキック", lunge: 7.4, dmgMult: 1.05, rangeMult: 1.10, poiseMult: 1.25, launchY: 0 },
    // 2段目 Linker
    spiral_slash:     { label: "🌪️旋風連斬", lunge: 6.5, dmgMult: 1.15, rangeMult: 1.28, poiseMult: 1.15, launchY: 0 },
    multi_flurry:     { label: "⚡百裂ラッシュ", lunge: 6.0, dmgMult: 1.25, rangeMult: 1.05, poiseMult: 1.20, launchY: 0 },
    guard_crush:      { label: "🔨ガードクラッシュ", lunge: 5.8, dmgMult: 1.18, rangeMult: 1.10, poiseMult: 1.85, launchY: 0 },
    plasma_wave:      { label: "🌊衝撃波ウェイブ", lunge: 5.0, dmgMult: 1.12, rangeMult: 1.40, poiseMult: 1.10, launchY: 0 },
    // 3段目 Finisher
    sky_upper:        { label: "🚀昇龍アッパー", lunge: 8.0, dmgMult: 1.35, rangeMult: 1.12, poiseMult: 1.45, launchY: 8.4 },
    meteor_smash:     { label: "☄️メテオスマッシュ", lunge: 7.5, dmgMult: 1.55, rangeMult: 1.25, poiseMult: 1.60, launchY: 5.2 },
    dimension_thrust: { label: "🗡️次元貫通突き", lunge: 10.5, dmgMult: 1.42, rangeMult: 1.35, poiseMult: 1.40, launchY: 4.5 },
    cyclone_burst:    { label: "🌀暴風ハリケーン", lunge: 6.8, dmgMult: 1.38, rangeMult: 1.45, poiseMult: 1.50, launchY: 7.2 }
};

// ========================================================
// D-6『遅さは罪』入力先行バッファ ＆ D-11『はじき入力』スマッシュ判定
// ========================================================
let inputBuffer = {
    action: null,
    subType: null,
    expiresAt: 0
};

let lastFlickKey = null;
let lastFlickTime = 0;
let smashFlickWindow = 0; // timestamp until when smash input is valid

function checkFlick(key) {
    const now = performance.now();
    if (lastFlickKey === key && (now - lastFlickTime) < 250) {
        // D-11 急激な方向入力（ダブルタップ・はじき）：はじきスマッシュ受付ウィンドウ開始
        smashFlickWindow = now + 260; // 60fpsで約15F
        player.isSprinting = true;
        spawnFootstepDust(player.position, 1.3);
    } else {
        lastFlickKey = key;
    }
    lastFlickTime = now;
}

function handlePlayerActionInput(action, subType = null) {
    if (!isGameActive || isPaused) return;

    const overdriveMult = player.overdriveTimer > 0 ? 1.28 : 1.0;
    const patchSpdBonus = 1.0 + (cityTrialPatches.spd || 0) * 0.04;
    const cancelWindow = 0.16 / (player.atkSpeed * overdriveMult * patchSpdBonus);
    const isFree = (player.state === "idle" || player.state === "walk") ||
                   ((player.state === "attack" || player.state === "skill") && player.stateTimer <= cancelWindow);

    if (isFree) {
        executePlayerAction(action, subType);
    } else {
        // D-6『遅さは罪』: 行動硬直中の4〜6F（約150ms）先行入力をバッファキューに格納し取りこぼしを撲滅
        inputBuffer.action = action;
        inputBuffer.subType = subType;
        inputBuffer.expiresAt = performance.now() + 150;
    }
}

function executePlayerAction(action, subType) {
    if (player.state === "down") {
        if (action === 'attack') {
            performPlayerGetupAttack();
            return;
        } else if (action === 'dodge' || action === 'jump') {
            performPlayerTechRoll();
            return;
        }
        return;
    }
    if (action === 'attack') performPlayerAttack(subType || 'rush');
    else if (action === 'arts') performSkillArts();
    else if (action === 'special') performPlayerSpecial();
    else if (action === 'dodge') performPlayerDodge();
    else if (action === 'jump') performPlayerJump();
}

/**
 * プレイヤーの通常攻撃 ＆ カスタム3段コンボルート（Starter ➔ Linker ➔ Finisher）
 * ＋ 桜井政博仕様：C-1 フレームデータ算出 / D-4 8つのヒットストップ仕様 / D-11 はじきスマッシュ / K-06 スマブラ式ふっとび率％ / B-29 ハンデブースト
 */
function performPlayerAttack(subType = "rush") {
    if (!isGameActive) return;
    if (player.state === "special" || player.state === "down") return;

    const overdriveMult = player.overdriveTimer > 0 ? 1.28 : 1.0;
    const patchSpdBonus = 1.0 + (cityTrialPatches.spd || 0) * 0.04;
    const cancelWindow = 0.16 / (player.atkSpeed * overdriveMult * patchSpdBonus);
    if ((player.state === "attack" || player.state === "skill") && player.stateTimer > cancelWindow) return;

    // D-11『はじき入力』スマッシュ判定
    const isSmash = (performance.now() < smashFlickWindow) || (subType === "smash");
    if (isSmash) {
        smashFlickWindow = 0;
        subType = "smash";
    }

    player.attackSubType = subType;
    player.comboStep = (player.comboStep % 3) + 1;
    player.state = "attack";
    SoundEngine.play(isSmash ? 'smash' : 'slash');

    // コンボ段数に応じたユーザー選択技を取得
    const route = player.comboRoute || { starter: 'flash_step', linker: 'spiral_slash', finisher: 'sky_upper' };
    const moveKey = player.comboStep === 1 ? route.starter : (player.comboStep === 2 ? route.linker : route.finisher);
    const moveSpec = COMBO_MOVE_EFFECTS[moveKey] || COMBO_MOVE_EFFECTS.flash_step;

    const baseDur = (player.comboStep === 3 || subType === "launch" || isSmash) ? 0.44 : (subType === "wide" ? 0.36 : 0.27);
    player.stateDuration = baseDur / (player.atkSpeed * overdriveMult * patchSpdBonus);
    player.stateTimer = player.stateDuration;

    // C-1『フレームはコマ数』 / C-9『フレームを計れるようになれ』：60fps換算フレームデータ算出
    const totalFrames = Math.max(12, Math.round(player.stateDuration * 60));
    const startupFrames = (player.comboStep === 3 || isSmash) ? 6 : 3;
    const activeFrames = 4;
    const advFrames = (player.comboStep === 3 || isSmash) ? "+8F (打上有利)" : "+4F (連撃有利)";
    const labelPrefix = isSmash ? "⚡はじきスマッシュ " : "";
    lastFrameDataText = `${labelPrefix}${moveSpec.label} [発生 ${startupFrames}F / 持続 ${activeFrames}F / 全体 ${totalFrames}F / 硬直差 ${advFrames}]`;

    // 1段目が armor_impact の場合は攻撃中スーパーアーマー（無敵）付与
    if (player.comboStep === 1 && moveKey === "armor_impact") {
        player.isInvincible = true;
        setTimeout(() => { if (player.state !== "special") player.isInvincible = false; }, 260);
    }

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();
    if (input.lockOn) {
        player.rotationY = Math.atan2(toCpu.x, toCpu.z);
    }

    const lungeDir = input.lockOn
        ? toCpu.clone().normalize()
        : new THREE.Vector3(Math.sin(player.rotationY), 0, Math.cos(player.rotationY));
    const lunge = moveSpec.lunge * ((subType === "launch" || isSmash) ? 1.15 : 1.0);
    player.velocity.copy(lungeDir.multiplyScalar(lunge));
    spawnFootstepDust(player.position, 1.5);

    const pal = getVfxPalette();
    const rangeRatio = (player.attackRange / 3.1) * moveSpec.rangeMult;

    if (player.motionType === "magic_shooter" || moveKey === "plasma_wave") {
        spawnMagicProjectile(player.position, toCpu.clone().normalize(), pal.main, subType);
    }

    spawnCrescentSlash(player.position, cpu.position, (player.comboStep === 3 || isSmash) ? pal.sub : pal.main, player.comboStep, rangeRatio);

    const effectiveRange = player.attackRange * moveSpec.rangeMult * (subType === "wide" ? 1.12 : 1.0);
    checkStreetPropHits(player.position, effectiveRange);

    if (dist <= effectiveRange) {
        SoundEngine.play(isSmash ? 'smash' : 'hit');
        const rawBase = (subType === "launch" ? 86 : (subType === "wide" ? 66 : 50)) * (isSmash ? 1.38 : 1.0);
        const rawDmg = rawBase * moveSpec.dmgMult;
        const isFinisher = player.comboStep === 3 || subType === "launch" || isSmash;
        const archMult = getArchetypeMultiplier(player.archetype, cpu.archetype);
        const comboScale = 1 + comboHits * (player.comboBonus || 0.04);
        // B-29 / D-14 ハンデブースト（ピンチ時逆転怒り補正 1.20x）＋ N-06 シティトライアル強化パッチ補正
        const underdogMult = player.hp <= player.maxHp * 0.35 ? 1.20 : 1.0;
        const patchAtkMult = 1.0 + (cityTrialPatches.atk || 0) * 0.06;
        let finalDmg = Math.round(rawDmg * player.atkScale * overdriveMult * archMult * comboScale * underdogMult * patchAtkMult);

        const poiseDamage = (subType === "launch" ? 45 : 26) * moveSpec.poiseMult * player.stunPower * archMult * (isSmash ? 1.4 : 1.0);
        cpu.poise = Math.max(0, cpu.poise - poiseDamage);

        // C-12『ノーリアクションを排除せよ』：ガード時も必ず火花・振動・フラッシュを発生
        triggerDefenderFlashing(cpu);

        if (isSmash) {
            showAnnouncement("⚡ はじきスマッシュ！ (SMASH FLICK)", "#ffd32a");
        }

        if (cpu.isGuarding && subType !== "launch" && !isSmash && moveKey !== "guard_crush" && cpu.poise > 0) {
            finalDmg = Math.floor(finalDmg * 0.2);
            cpu.launchPct = Math.min(999, cpu.launchPct + Math.max(1, Math.round(finalDmg * 0.06)));
            spawnHitSparks(cpu.position, 0x70a1ff, 18);
            spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, finalDmg, "guard", "GUARD");
        } else {
            cpu.isGuarding = false;
            const stunDuration = (isFinisher ? 0.85 : 0.52) * player.stunPower;
            cpu.stunTimer = stunDuration;
            cpu.aiTimer = Math.max(cpu.aiTimer, stunDuration + 0.15);
            battleStats.stunsInflicted++;

            // K-06『スマブラのふっとばし』：蓄積ダメージ％を加算し、ふっとび速度を非線形に加速！
            const pctGain = Math.round(finalDmg * 0.18);
            cpu.launchPct = Math.min(999, cpu.launchPct + pctGain);
            const patchLaunchMult = 1.0 + (cityTrialPatches.launch || 0) * 0.08;
            const smashKnockbackScale = (1.0 + (cpu.launchPct / 95.0)) * sakuraiParams.launchBaseScale * patchLaunchMult;
            const knockDir = toCpu.clone().normalize();
            hitStopVector.copy(knockDir);

            if (isFinisher || moveSpec.launchY > 0 || isSmash) {
                cpu.state = "launched";
                cpu.stateDuration = stunDuration;
                cpu.stateTimer = stunDuration;
                const smashAirMult = isSmash ? 1.35 : 1.0;
                cpu.airVelY = (moveSpec.launchY || 7.6) * Math.min(2.1, 0.85 + smashKnockbackScale * 0.35) * smashAirMult;
                cpu.velocity.add(knockDir.multiplyScalar(4.2 * smashKnockbackScale * (isSmash ? 1.35 : 1.0)));
                spawnGroundSlamVFX(cpu.position, isSmash ? 0xffd32a : pal.sub, 1.25);
                spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, `${finalDmg} (${cpu.launchPct}%)`, "crit", isSmash ? "SMASH!" : `${moveSpec.label}!`);
                addScore(Math.round(finalDmg * 2 * getCauldronMultipliers().rewardMult));
            } else {
                cpu.state = "stunned";
                cpu.stateDuration = stunDuration;
                cpu.stateTimer = stunDuration;
                if (cpu.airY > 0.1) {
                    cpu.airVelY = Math.max(cpu.airVelY, 2.8);
                }
                cpu.velocity.add(knockDir.multiplyScalar(2.4 * Math.min(1.8, smashKnockbackScale * 0.65)));
                spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, finalDmg, "stun", moveSpec.label);
                addScore(Math.round(finalDmg * getCauldronMultipliers().rewardMult));
            }

            // D-4『8つのヒットストップ仕様』：威力比例 ＋ 電気属性(thunder_cyan)1.35倍 ＋ 【パラメーター】倍率
            const elecBonus = player.vfxElement === "thunder_cyan" ? 1.35 : 1.0;
            const smashHitstopMult = isSmash ? 1.4 : 1.0;
            cameraShakeIntensity = (isFinisher || isSmash) ? 0.45 : 0.18;
            hitStopTimer = (isFinisher ? 0.075 : 0.035) * elecBonus * sakuraiParams.hitStopScale * smashHitstopMult;
            spawnHitSparks(cpu.position, isSmash ? 0xffd32a : pal.sub, isFinisher ? 48 : 30);
        }

        applyDamage('cpu', finalDmg);
        applyElementalStatus(player, cpu, finalDmg);
        addCombo(1, finalDmg);
        player.sp = Math.min(player.maxSp, player.sp + Math.round(10 * (player.spRegenMult || 1.0)));
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
        vel: dir.clone().multiplyScalar(18.5),
        life: 0.78,
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
    lastFrameDataText = `🔥固有スキルArts [発生 4F / 持続 12F / 全体 ${Math.round(player.stateDuration * 60)}F / 硬直差 +6F]`;
    SoundEngine.play('slash');

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();
    player.rotationY = Math.atan2(toCpu.x, toCpu.z);
    player.velocity.copy(toCpu.clone().normalize().multiplyScalar(10.5));

    const pal = getVfxPalette();
    spawnGroundSlamVFX(player.position, pal.main, 1.2);
    spawnCrescentSlash(player.position, cpu.position, pal.main, 2, (player.attackRange / 3.1) * 1.35);
    checkStreetPropHits(player.position, player.attackRange * 1.5);

    const archMult = getArchetypeMultiplier(player.archetype, cpu.archetype);
    const overdriveMult = player.overdriveTimer > 0 ? 1.28 : 1.0;
    const patchAtkMult = 1.0 + (cityTrialPatches.atk || 0) * 0.06;
    if (dist <= player.attackRange * 1.45) {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (!isGameActive) return;
                SoundEngine.play('hit');
                const hitDmg = Math.round(54 * player.atkScale * overdriveMult * archMult * patchAtkMult);
                cpu.state = "stunned";
                cpu.stunTimer = 0.65 * player.stunPower;
                cpu.stateTimer = cpu.stunTimer;
                cpu.launchPct = Math.min(999, cpu.launchPct + Math.round(hitDmg * 0.16));
                battleStats.stunsInflicted++;
                if (i === 2) cpu.airVelY = 5.5 * sakuraiParams.launchBaseScale;
                triggerDefenderFlashing(cpu);
                spawnHitSparks(cpu.position, i % 2 === 0 ? pal.main : pal.sub, 32);
                spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, hitDmg, "crit", "SKILL!");
                applyDamage('cpu', hitDmg);
                applyElementalStatus(player, cpu, hitDmg);
                addCombo(1, hitDmg);
                addScore(Math.round(hitDmg * 2 * getCauldronMultipliers().rewardMult));
                cameraShakeIntensity = 0.28;
            }, i * 110);
        }
    }
    updateGauges();
}

/**
 * 🌟 必殺奥義 EX (SP 50消費 — 奥義の型 Form × 固有特殊能力 Trait 対応)
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
    lastFrameDataText = `🌟必殺奥義EX [発生 1F(暗転無敵) / 持続 28F / 全体 75F / 硬直差 +18F]`;
    SoundEngine.play('explode');

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    player.rotationY = Math.atan2(toCpu.x, toCpu.z);

    const pal = getVfxPalette();
    spawnGroundSlamVFX(player.position, pal.main, 1.4);
    cinematicCameraMode = "zoom_player";

    const ultForm = player.ultConfig?.form || "meteor_drop";
    const ultTrait = player.ultConfig?.trait || "vampire_heal";

    const cutin = document.getElementById('special-cutin');
    document.getElementById('cutin-char').innerText = player.design.name;
    document.getElementById('cutin-skill').innerText = player.skillName;
    cutin.classList.add('active');
    triggerUltimateCutin();

    const archMult = getArchetypeMultiplier(player.archetype, cpu.archetype);
    const executeMult = (ultTrait === "execute_bonus" && cpu.hp <= cpu.maxHp * 0.5) ? 1.50 : 1.0;
    const tokenUltBonus = 1.0 + ((player.sliderPts?.atk || 3) * 0.08);
    const patchAtkMult = 1.0 + (cityTrialPatches.atk || 0) * 0.06;
    const hitCount = ultForm === "omniscience_rush" ? 8 : (ultForm === "orbital_laser" ? 6 : 5);
    const basePerHit = ultForm === "omniscience_rush" ? 52 : (ultForm === "orbital_laser" ? 68 : 80);

    setTimeout(() => {
        cutin.classList.remove('active');
        cinematicCameraMode = "action_wide";
        SoundEngine.play('explode');

        spawnGroundSlamVFX(cpu.position, pal.main, 2.3);
        spawnGroundSlamVFX(cpu.position, pal.sub, 1.7);
        checkStreetPropHits(cpu.position, 8.0);

        if (ultTrait === "guard_shatter") {
            cpu.isGuarding = false;
            cpu.poise = 0;
            cpu.stunTimer = 2.0;
            spawnDamageNumber(cpu.position.x, cpu.position.y + 1.8, cpu.position.z, "BREAK!", "crit", "🔨装甲破壊");
        }

        if (ultTrait === "overdrive_buff") {
            player.overdriveTimer = 10.0;
            showAnnouncement("⚡ 10秒間 覚醒オーバークロック発動！(ATK・速度UP)", "#ffd32a");
        }

        let totalDealt = 0;
        for (let i = 0; i < hitCount; i++) {
            setTimeout(() => {
                if (!isGameActive) return;
                SoundEngine.play('hit');
                const partDmg = Math.round(basePerHit * player.atkScale * tokenUltBonus * archMult * executeMult * patchAtkMult);
                totalDealt += partDmg;
                cpu.launchPct = Math.min(999, cpu.launchPct + Math.round(partDmg * 0.2));
                triggerDefenderFlashing(cpu);
                spawnHitSparks(cpu.position, i % 2 === 0 ? pal.main : pal.sub, 45);
                const prefix = executeMult > 1 ? "💀処刑1.5x!" : (i === hitCount - 1 ? "FINISH!!" : "EX!");
                spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, partDmg, "crit", prefix);
                applyDamage('cpu', partDmg);
                applyElementalStatus(player, cpu, partDmg);
                addCombo(1, partDmg);
                addScore(Math.round(partDmg * 3 * getCauldronMultipliers().rewardMult));

                if (i === hitCount - 1 && ultTrait === "vampire_heal" && player.hp > 0) {
                    const healAmt = Math.round(totalDealt * 0.35);
                    player.hp = Math.min(player.maxHp, player.hp + healAmt);
                    updateGauges();
                    spawnDamageNumber(player.position.x, player.position.y + 1.5, player.position.z, `+${healAmt} HP`, "stun", "🩸吸収");
                }
            }, i * 75);
        }

        cameraShakeIntensity = 0.78;
        hitStopTimer = 0.11 * sakuraiParams.hitStopScale;
        hitStopVector.copy(toCpu.clone().normalize());
        cpu.velocity.add(toCpu.normalize().multiplyScalar(14.0 * sakuraiParams.launchBaseScale));
        cpu.airVelY = 6.8 * sakuraiParams.launchBaseScale;
        cpu.state = "down";
        cpu.stateDuration = 1.3;
        cpu.stateTimer = 1.3;

        setTimeout(() => {
            cinematicCameraMode = null;
            player.isInvincible = false;
        }, 650);
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
    lastFrameDataText = `💨無敵ステップ [無敵 1F〜16F / 全体 17F]`;

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
    // D-3『ジャンプのしくみ』：踏切の瞬間扁平スケーリング＋鋭い初速上昇
    player.squashStretch.set(1.22, 0.76, 1.22);
    player.airVelY = 8.2;
    player.state = "jump";
    player.stateDuration = 0.55;
    player.stateTimer = 0.55;
    lastFrameDataText = `🦘ジャンプ飛躍 [踏切 3F / 初速上昇 8.2m/s]`;
    spawnFootstepDust(player.position, 1.6);
}

// ========================================================
// C-14 属性リアクション・状態異常システム (Elemental Status Effects)
// ========================================================
function applyElementalStatus(attacker, target, baseDmg) {
    if (!attacker || !target || !target.statusEffects) return;
    const elem = attacker.vfxElement || "plasma_cyan";

    if (elem === "flame_crimson" || elem === "fire_orange") {
        target.statusEffects.burnTimer = 3.2;
        target.statusEffects.burnTickAccum = 0;
        showAnnouncement("🔥 炎上 (BURNING) 付与！", "#ff6b6b");
    } else if (elem === "plasma_cyan" || elem === "thunder_cyan") {
        target.statusEffects.shockTimer = 2.4;
        showAnnouncement("⚡ 感電 (SHOCK) 付与！", "#00f2fe");
    } else if (elem === "holy_astral" || elem === "ice_blue") {
        target.statusEffects.frostTimer = 3.0;
        showAnnouncement("❄️ 凍結 (FROST SLOW) 付与！", "#70a1ff");
    } else if (elem === "void_gravity" || elem === "dark_purple") {
        target.statusEffects.vortexTimer = 2.0;
        showAnnouncement("🌀 重力渦 (GRAVITY VORTEX) 付与！", "#a29bfe");
    }
}

function updateStatusEffects(entity, targetEntity, dt, isPlayer) {
    if (!entity || !entity.statusEffects || !isGameActive) return;
    const eff = entity.statusEffects;

    // 🔥 炎上 (DoTスリップダメージ)
    if (eff.burnTimer > 0) {
        eff.burnTimer = Math.max(0, eff.burnTimer - dt);
        eff.burnTickAccum += dt;
        if (eff.burnTickAccum >= 0.8) {
            eff.burnTickAccum = 0;
            const burnDmg = 14;
            entity.hp = Math.max(0, entity.hp - burnDmg);
            spawnHitSparks(entity.position, 0xff4757, 10);
            spawnDamageNumber(entity.position.x, entity.position.y + 1.2, entity.position.z, burnDmg, "crit", "🔥炎上");
            updateGauges();
            if (entity.hp <= 0 && isGameActive) {
                if (isPlayer) handleGameOver();
                else { triggerFinishZoom(); handleVictory(); }
            }
        }
    }

    // ⚡ 感電 (マイクロ硬直)
    if (eff.shockTimer > 0) {
        eff.shockTimer = Math.max(0, eff.shockTimer - dt);
        if (Math.random() < 0.25) {
            spawnHitSparks(entity.position, 0x00f2fe, 6);
        }
    }

    // ❄️ 凍結 (移動・行動速度40%低下)
    if (eff.frostTimer > 0) {
        eff.frostTimer = Math.max(0, eff.frostTimer - dt);
        if (Math.random() < 0.20) {
            spawnHitSparks(entity.position, 0x70a1ff, 5);
        }
    }

    // 🌀 重力渦 (攻撃者へ吸い寄せ)
    if (eff.vortexTimer > 0) {
        eff.vortexTimer = Math.max(0, eff.vortexTimer - dt);
        if (targetEntity) {
            const pullDir = new THREE.Vector3().subVectors(targetEntity.position, entity.position).normalize();
            entity.velocity.add(pullDir.multiplyScalar(4.2 * dt));
            if (Math.random() < 0.25) spawnHitSparks(entity.position, 0xa29bfe, 8);
        }
    }
}

function updateStatusEffectsHUD() {
    renderStatusPills('player-status-bar', player.statusEffects);
    renderStatusPills('cpu-status-bar', cpu.statusEffects);
    renderStatusPills('ew-status-bar', cpu.statusEffects);
}

function renderStatusPills(containerId, eff) {
    const el = document.getElementById(containerId);
    if (!el || !eff) return;
    let html = '';
    if (eff.burnTimer > 0) html += `<span class="status-pill burn">🔥 炎上 ${eff.burnTimer.toFixed(1)}s</span>`;
    if (eff.shockTimer > 0) html += `<span class="status-pill shock">⚡ 感電 ${eff.shockTimer.toFixed(1)}s</span>`;
    if (eff.frostTimer > 0) html += `<span class="status-pill frost">❄️ 凍結 ${eff.frostTimer.toFixed(1)}s</span>`;
    if (eff.vortexTimer > 0) html += `<span class="status-pill vortex">🌀 重力 ${eff.vortexTimer.toFixed(1)}s</span>`;
    el.innerHTML = html;
}

// ========================================================
// K-02『画面外ルーペ＆レーダーバブル』(Off-screen Magnifier)
// ========================================================
function updateOffscreenLoupe() {
    if (!camera || !isGameActive) return;

    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const margin = 52;
    const maxX = halfW - margin;
    const maxY = halfH - margin;

    const updateEntityLoupe = (entity, bubbleId, arrowId, pctId) => {
        const bubbleEl = document.getElementById(bubbleId);
        if (!bubbleEl || !entity || !entity.position) return;

        const pos3d = entity.position.clone().add(new THREE.Vector3(0, 1.2 + (entity.airY || 0), 0));
        const ndc = pos3d.project(camera);

        const isOffscreen = (ndc.z > 1.0) || (Math.abs(ndc.x) > 0.88) || (Math.abs(ndc.y) > 0.82);

        if (!isOffscreen || entity.hp <= 0) {
            bubbleEl.style.display = 'none';
            return;
        }

        bubbleEl.style.display = 'flex';

        let dirX = ndc.x;
        let dirY = -ndc.y;
        if (ndc.z > 1.0) {
            dirX = -dirX;
            dirY = -dirY;
        }
        const len = Math.hypot(dirX, dirY) || 0.001;
        const normX = dirX / len;
        const normY = dirY / len;

        const scaleX = maxX / (Math.abs(normX) || 0.001);
        const scaleY = maxY / (Math.abs(normY) || 0.001);
        const scale = Math.min(scaleX, scaleY);

        const screenX = halfW + normX * scale;
        const screenY = halfH + normY * scale;

        bubbleEl.style.left = `${screenX}px`;
        bubbleEl.style.top = `${screenY}px`;

        const arrowEl = document.getElementById(arrowId);
        if (arrowEl) {
            const angleDeg = Math.atan2(normY, normX) * (180 / Math.PI) - 90;
            arrowEl.style.transform = `rotate(${angleDeg}deg)`;
        }

        const pctEl = document.getElementById(pctId);
        if (pctEl) pctEl.innerText = `${entity.launchPct || 0}%`;
    };

    updateEntityLoupe(player, 'loupe-player', 'loupe-arrow-player', 'loupe-pct-player');
    updateEntityLoupe(cpu, 'loupe-cpu', 'loupe-arrow-cpu', 'loupe-pct-cpu');
}

// ========================================================
// 3D必殺奥義シネマティック・カットイン演出
// ========================================================
function triggerUltimateCutin() {
    const cutinLayer = document.getElementById('ultimate-cutin-layer');
    if (!cutinLayer) return;

    const subEl = document.getElementById('cutin-sub');
    const titleEl = document.getElementById('cutin-title');
    const userEl = document.getElementById('cutin-user');
    if (subEl) subEl.innerText = `💥 ULTIMATE BURST EX (${ARCHETYPE_INFO[player.archetype]?.label || '武芸伝承'}) 💥`;
    if (titleEl) titleEl.innerText = player.skillName || "滅・次元絶影撃";
    if (userEl) userEl.innerText = player.design.name || "PLAYER";

    const portraitCanvas = document.getElementById('cutin-avatar-canvas');
    if (portraitCanvas) {
        const ctx = portraitCanvas.getContext('2d');
        ctx.clearRect(0, 0, 220, 220);
        ctx.fillStyle = player.design.outfitColor || '#020617';
        ctx.fillRect(0, 0, 220, 220);

        ctx.strokeStyle = '#ffd32a';
        ctx.lineWidth = 2.5;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
            ctx.beginPath();
            ctx.moveTo(110, 110);
            ctx.lineTo(110 + Math.cos(a) * 120, 110 + Math.sin(a) * 120);
            ctx.stroke();
        }

        ctx.fillStyle = player.design.hairColor || '#00f2fe';
        ctx.beginPath();
        ctx.arc(110, 105, 52, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 10;
        ctx.fillRect(84, 100, 20, 6);
        ctx.fillRect(116, 100, 20, 6);
    }

    cutinLayer.style.display = 'flex';
    setTimeout(() => {
        cutinLayer.style.display = 'none';
    }, 650);
}

// ========================================================
// D-14『ダウン追撃＆起き上がり攻防』(Tech Roll & Getup Attack)
// ========================================================
function performPlayerTechRoll() {
    if (player.state !== "down") return;
    player.state = "dodge";
    player.stateDuration = 0.42;
    player.stateTimer = 0.42;
    player.isInvincible = true;

    // 入力方向または敵から遠ざかる方向へローリング
    let rollDir = new THREE.Vector3(input.x, 0, input.z);
    if (rollDir.lengthSq() < 0.1) {
        rollDir.subVectors(player.position, cpu.position).setY(0).normalize();
        if (rollDir.lengthSq() < 0.01) rollDir.set(0, 0, 1);
    } else {
        rollDir.normalize();
    }
    player.velocity.copy(rollDir.multiplyScalar(9.5));
    player.rotationY = Math.atan2(rollDir.x, rollDir.z);

    SoundEngine.play('techroll');
    spawnFootstepDust(player.position, 2.2);
    spawnDamageNumber(player.position.x, player.position.y + 0.6, player.position.z, "TECH ROLL!", "crit", "🌀受身転がり");
    setTimeout(() => { player.isInvincible = false; }, 420);
}

function performPlayerGetupAttack() {
    if (player.state !== "down") return;
    player.state = "attack";
    player.stateDuration = 0.45;
    player.stateTimer = 0.45;
    player.isInvincible = true;

    SoundEngine.play('smash');
    spawnGroundSlamVFX(player.position, 0x00f2fe, 1.25);
    spawnFootstepDust(player.position, 2.0);
    spawnDamageNumber(player.position.x, player.position.y + 0.6, player.position.z, "GETUP ATTACK!", "crit", "⚔️起き上がり回転");

    const toCpu = new THREE.Vector3().subVectors(cpu.position, player.position);
    const dist = toCpu.length();
    if (dist < 3.2) {
        SoundEngine.play('hit');
        const dmg = Math.round(42 * player.atkScale);
        cpu.launchPct = Math.min(999, cpu.launchPct + 8);
        cpu.velocity.add(toCpu.normalize().multiplyScalar(10.0));
        cpu.airVelY = 3.8;
        cpu.state = "stunned";
        cpu.stateDuration = 0.55;
        cpu.stateTimer = 0.55;
        triggerDefenderFlashing(cpu);
        spawnHitSparks(cpu.position, 0x00f2fe, 30);
        spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, dmg, "stun", "SWEEP!");
        applyDamage('cpu', dmg);
        applyElementalStatus(player, cpu, dmg);
        addCombo(1, dmg);
    }
    setTimeout(() => { player.isInvincible = false; }, 450);
}

// ========================================================
// 渋谷 109 大型街頭LEDビジョン ＆ 地下鉄通気口ジャンプパッド
// ========================================================
function spawnCityJumpPads(parentGroup) {
    cityJumpPads = [];
    const padLocations = [
        { x:  9.5, z:  9.5, label: "南東交差点" },
        { x: -9.5, z:  9.5, label: "南西交差点" },
        { x: -9.5, z: -9.5, label: "北西交差点 (109前)" },
        { x:  9.5, z: -9.5, label: "北東交差点" }
    ];

    const grateMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.5,
        metalness: 0.8
    });
    const hazardMat = new THREE.MeshBasicMaterial({ color: 0xffbe0b });
    const steamGlowMat = new THREE.MeshBasicMaterial({
        color: 0x00f2fe,
        transparent: true,
        opacity: 0.45
    });

    padLocations.forEach(loc => {
        const padGroup = new THREE.Group();
        padGroup.position.set(loc.x, 0.04, loc.z);

        // 地下鉄通気口格子メッシュ (2.8m × 2.8m)
        const grateMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 2.8), grateMat);
        padGroup.add(grateMesh);

        // 四方の黄色警告ライン
        const hazardBorder = new THREE.Mesh(
            new THREE.RingGeometry(1.4, 1.55, 4),
            hazardMat
        );
        hazardBorder.rotation.x = -Math.PI / 2;
        hazardBorder.rotation.z = Math.PI / 4;
        hazardBorder.position.y = 0.05;
        padGroup.add(hazardBorder);

        // 上昇気流グロー平面
        const steamPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), steamGlowMat);
        steamPlane.rotation.x = -Math.PI / 2;
        steamPlane.position.y = 0.06;
        padGroup.add(steamPlane);

        parentGroup.add(padGroup);

        cityJumpPads.push({
            x: loc.x,
            z: loc.z,
            radius: 1.55,
            group: padGroup,
            steamPlane: steamPlane
        });
    });
}

function updateCityJumpPads(dt) {
    if (!cityJumpPads.length) return;

    // 気流グローの明滅アニメーション
    const pulseOpacity = 0.35 + Math.sin(elapsedTime * 4.5) * 0.18;
    cityJumpPads.forEach(pad => {
        if (pad.steamPlane) pad.steamPlane.material.opacity = pulseOpacity;
    });

    // プレイヤーおよびCPUが乗った時のハイジャンプ気流噴射判定
    [player, cpu].forEach(ent => {
        if (ent.airY > 0.45) return; // 既に上空にいる場合は重複踏み防止
        const now = performance.now();
        if (ent.lastJumpPadTime && now - ent.lastJumpPadTime < 950) return;

        for (let i = 0; i < cityJumpPads.length; i++) {
            const pad = cityJumpPads[i];
            const dist = Math.hypot(ent.position.x - pad.x, ent.position.z - pad.z);
            if (dist < pad.radius) {
                ent.lastJumpPadTime = now;
                ent.airVelY = 16.8 * sakuraiParams.launchBaseScale;
                ent.airY = 0.25;
                if (ent.state !== "attack" && ent.state !== "special") {
                    ent.state = "jump";
                    ent.stateDuration = 0.65;
                    ent.stateTimer = 0.65;
                }
                SoundEngine.play('jumppad');
                cameraShakeIntensity = 0.22;
                spawnDamageNumber(ent.position.x, ent.position.y + 1.2, ent.position.z, "HIGH JUMP!!", "crit", "💨地下鉄通気口");

                // 上昇蒸気パーティクル噴射
                for (let p = 0; p < 18; p++) {
                    const sparkGeo = new THREE.SphereGeometry(0.12 + Math.random() * 0.15, 6, 6);
                    const sparkMat = new THREE.MeshBasicMaterial({ color: 0x81ecec, transparent: true, opacity: 0.85 });
                    const spMesh = new THREE.Mesh(sparkGeo, sparkMat);
                    spMesh.position.set(
                        pad.x + (Math.random() - 0.5) * 2.2,
                        0.2 + Math.random() * 0.5,
                        pad.z + (Math.random() - 0.5) * 2.2
                    );
                    scene.add(spMesh);
                    effectsList.push({
                        mesh: spMesh,
                        life: 0.55,
                        maxLife: 0.55,
                        vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 9.5 + Math.random() * 7.0, (Math.random() - 0.5) * 1.5),
                        update(subDt, self) {
                            self.mesh.position.addScaledVector(self.vel, subDt);
                            self.mesh.material.opacity = Math.max(0, self.life / self.maxLife * 0.8);
                        }
                    });
                }
                break;
            }
        }
    });
}

function update109Billboard(dt) {
    if (!shibuyaBillboardCanvas || !shibuyaBillboardTexture) return;
    billboardUpdateTimer += dt;
    if (billboardUpdateTimer < 0.08) return; // 12-15 FPS で更新（十分滑らかで軽量）
    billboardUpdateTimer = 0;

    const canvas = shibuyaBillboardCanvas;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // 背景：ダークサイバーブルー ＆ グリッドスキャンライン
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0, 242, 254, 0.06)';
    for (let y = 0; y < H; y += 8) {
        ctx.fillRect(0, y, W, 1);
    }

    // ネオンヘッダー枠
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    // ヘッダーテキスト
    ctx.fillStyle = '#ff2a85';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('🔴 LIVE 渋谷スクランブル交差点 バトル速報', 20, 36);

    // プレイヤー側
    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(player.design.name || 'PLAYER', 20, 72);
    // プレイヤーHPバー
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 80, 200, 16);
    const pRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
    ctx.fillStyle = pRatio < 0.3 ? '#ff4757' : '#00f2fe';
    ctx.fillRect(20, 80, 200 * pRatio, 16);

    // CPUボス側
    ctx.fillStyle = '#ffbe0b';
    ctx.font = 'bold 18px sans-serif';
    const bossName = cpu.bossInfo?.name || 'BOSS';
    ctx.fillText(bossName, 280, 72);
    // CPU HPバー
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(280, 80, 200, 16);
    const cRatio = Math.max(0, Math.min(1, cpu.hp / cpu.maxHp));
    ctx.fillStyle = '#ff4757';
    ctx.fillRect(280, 80, 200 * cRatio, 16);

    // 中央ダイナミックステータス・実況
    ctx.textAlign = 'center';
    if (comboHits >= 3) {
        ctx.fillStyle = '#ffd32a';
        ctx.font = 'italic 900 32px sans-serif';
        const rankText = comboHits >= 7 ? 'SSS SAKURAI SICK!' : (comboHits >= 5 ? 'EXCELLENT!!' : 'GREAT!');
        ctx.fillText(`🔥 ${comboHits} HITS! [${rankText}]`, W * 0.5, 145);
    } else if (cpu.state === "down") {
        ctx.fillStyle = '#ff5e57';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('💥 DOWN! 起き上がり攻防中!', W * 0.5, 145);
    } else if (player.hp <= player.maxHp * 0.35) {
        ctx.fillStyle = '#ff3838';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('⚠️ DANGER! ピンチ怒りブースト発動!', W * 0.5, 145);
    } else {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(`ROUND ${currentWins + 1} | ホンキ度 ${sakuraiParams.cauldronIntensity.toFixed(1)}`, W * 0.5, 145);
    }
    ctx.textAlign = 'left';

    // 画面下部：周波数イコライザー波形（戦闘の激しさに連動）
    const barCount = 28;
    const barWidth = 14;
    const startX = 40;
    const baseY = 230;
    for (let i = 0; i < barCount; i++) {
        const freqH = Math.sin(elapsedTime * 8 + i * 0.5) * 14 + 18;
        ctx.fillStyle = (i % 2 === 0) ? '#ff2a85' : '#00f2fe';
        ctx.fillRect(startX + i * 16, baseY - freqH, barWidth, freqH);
    }

    // テクスチャ更新フラグ
    shibuyaBillboardTexture.needsUpdate = true;
}

// ========================================================
// 🕸️ グラフエンジニアリング × 🔄 ループエンジニアリング 自律進化ラボ
// ========================================================
function runAutonomousMetaSimulation() {
    const canvas = document.getElementById('graph-dag-canvas');
    const adviceEl = document.getElementById('sim-meta-advice');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    SoundEngine.play('patch');
    if (adviceEl) adviceEl.innerText = "⚡ 100戦自律対戦シミュレーション演算中... (モンテカルロ評価中)";

    const builds = [
        { name: "🔴剛撃重装", id: "power", x: 120, y: 70, color: "#ff4757", wins: 0, total: 0 },
        { name: "🔵蒼迅神速", id: "speed", x: 260, y: 160, color: "#00f2fe", wins: 0, total: 0 },
        { name: "💚堅守要塞", id: "def",   x: 440, y: 160, color: "#2ed573", wins: 0, total: 0 },
        { name: "🟣魔導牽制", id: "magic", x: 580, y: 70, color: "#9b59b6", wins: 0, total: 0 },
        { name: "🟡覇道連撃", id: "combo", x: 350, y: 50, color: "#ffa502", wins: 0, total: 0 }
    ];

    const matchMatrix = {
        power: { speed: 0.65, def: 0.35, magic: 0.40, combo: 0.60 },
        speed: { power: 0.35, def: 0.70, magic: 0.65, combo: 0.45 },
        def:   { power: 0.65, speed: 0.30, magic: 0.35, combo: 0.70 },
        magic: { power: 0.60, speed: 0.35, def: 0.65, combo: 0.40 },
        combo: { power: 0.40, speed: 0.55, def: 0.30, magic: 0.60 }
    };

    for (let i = 0; i < 100; i++) {
        const bA = builds[Math.floor(Math.random() * builds.length)];
        let bB = builds[Math.floor(Math.random() * builds.length)];
        while (bA === bB) bB = builds[Math.floor(Math.random() * builds.length)];

        const pA = matchMatrix[bA.id][bB.id] || 0.5;
        const winA = Math.random() < pA;
        bA.total++;
        bB.total++;
        if (winA) bA.wins++;
        else bB.wins++;
    }

    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const edges = [
        ["power", "speed"], ["speed", "def"], ["def", "power"],
        ["speed", "magic"], ["magic", "def"], ["magic", "power"],
        ["def", "combo"], ["combo", "magic"], ["power", "combo"]
    ];

    edges.forEach(([fromId, toId]) => {
        const fromNode = builds.find(b => b.id === fromId);
        const toNode = builds.find(b => b.id === toId);
        if (!fromNode || !toNode) return;

        ctx.strokeStyle = "rgba(0, 242, 254, 0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.stroke();

        const mx = (fromNode.x + toNode.x) / 2;
        const my = (fromNode.y + toNode.y) / 2;
        const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
        ctx.fillStyle = "#ffd32a";
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(angle) * 8, my + Math.sin(angle) * 8);
        ctx.lineTo(mx + Math.cos(angle + 2.5) * 6, my + Math.sin(angle + 2.5) * 6);
        ctx.lineTo(mx + Math.cos(angle - 2.5) * 6, my + Math.sin(angle - 2.5) * 6);
        ctx.fill();
    });

    let bestBuild = builds[0];
    builds.forEach(b => {
        const winRate = b.total > 0 ? Math.round((b.wins / b.total) * 100) : 50;
        if (winRate > (bestBuild.total > 0 ? Math.round((bestBuild.wins / bestBuild.total) * 100) : 0)) {
            bestBuild = b;
        }

        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(b.name, b.x, b.y - 28);
        ctx.fillText(`${winRate}%`, b.x, b.y + 4);
    });

    const bestRate = Math.round((bestBuild.wins / bestBuild.total) * 100);
    const currBoss = cpu.bossInfo ? cpu.bossInfo.name : "現ボス";
    if (adviceEl) {
        adviceEl.innerHTML = `💡 【100戦自律進化解析結果】: 現在のメタ勝率Topは <strong>${bestBuild.name} (${bestRate}%)</strong> です！<br>対「${currBoss}」には【${bestBuild.name}＋剛撃3】の特化構成が最適解として学習されました。`;
    }
}

// ========================================================
// 11. ダメージ ＆ ラウンド進行管理（B-1/B-2 ジャストシールド ＆ D-1 フィニッシュズーム）
// ========================================================
function applyDamage(target, amount) {
    if (target === 'cpu') {
        const dealt = Math.min(cpu.hp, Math.round(amount));
        battleStats.damageDealt += dealt;
        cpu.hp = Math.max(0, cpu.hp - dealt);
        updateGauges();
        if (cpu.hp <= 0 && isGameActive) {
            // D-1『大事なところはストップ！』/ N-12『スマブラSP フィニッシュズーム』発動！
            triggerFinishZoom();
            handleVictory();
        }
    } else {
        if (player.isInvincible) return;
        const cauldron = getCauldronMultipliers();
        const defPatchMult = Math.max(0.55, 1.0 - (cityTrialPatches.def || 0) * 0.05);
        let finalDmg = Math.round(amount * cauldron.enemyAtkMult * defPatchMult);

        if (player.isGuarding) {
            // B-1『リスクとリターン』 / B-2『ギュッとしてパッと解消』：ガード開始から0.24秒(14F)以内ならジャストシールド成立！
            if (player.guardHoldTime <= 0.24) {
                finalDmg = 0;
                player.sp = Math.min(player.maxSp, player.sp + 28);
                SoundEngine.play('justguard');
                hitStopTimer = 0.11 * sakuraiParams.hitStopScale;
                cameraShakeIntensity = 0.36;
                cpu.stunTimer = 1.05;
                cpu.state = "stunned";
                cpu.stateTimer = 1.05;
                lastFrameDataText = `🛡️ジャストシールド成立!! [被ダメ 0 / SP +28% / 敵硬直 +63F]`;
                spawnHitSparks(player.position, 0xffd32a, 42);
                spawnGroundSlamVFX(player.position, 0x00f2fe, 1.25);
                spawnDamageNumber(player.position.x, player.position.y + 0.6, player.position.z, "0 DMG (+28 SP)", "crit", "⚡JUST SHIELD!!");
            } else {
                finalDmg = Math.floor(finalDmg * 0.15);
                player.sp = Math.min(player.maxSp, player.sp + 14);
                spawnHitSparks(player.position, 0x00f2fe, 20);
                spawnDamageNumber(player.position.x, player.position.y, player.position.z, finalDmg, "guard", "GUARD");
            }
        } else {
            SoundEngine.play('hit');
            cameraShakeIntensity = 0.32;
            player.launchPct = Math.min(999, player.launchPct + Math.round(finalDmg * 0.16));
            triggerDefenderFlashing(player);
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
            triggerFinishZoom();
            handleGameOver();
        }
    }
}

function updateLaunchBadgeStyle(el, pct) {
    if (!el) return;
    el.innerText = `💥 ${pct}%`;
    if (pct >= 150) {
        el.style.color = '#ff2e4c';
        el.style.borderColor = '#ff2e4c';
    } else if (pct >= 80) {
        el.style.color = '#ff9f1a';
        el.style.borderColor = '#ff9f1a';
    } else if (pct >= 35) {
        el.style.color = '#ffd32a';
        el.style.borderColor = '#ffd32a';
    } else {
        el.style.color = '#ffffff';
        el.style.borderColor = 'rgba(255,211,42,0.55)';
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

    // J-8『大事なものをより大きく』 / K-06『スマブラのふっとばし』：蓄積ふっとび率％表示更新
    updateLaunchBadgeStyle(document.getElementById('player-launch-pct'), player.launchPct || 0);
    updateLaunchBadgeStyle(document.getElementById('cpu-launch-pct'), cpu.launchPct || 0);
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
    SoundEngine.play('ko');
    const cauldron = getCauldronMultipliers();
    addScore(Math.round((1500 + currentWins * 500 + roundTimer * 25) * cauldron.rewardMult));
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
    SoundEngine.play('ko');
    showAnnouncement("DEFEATED... 💀 名誉の引退", "#ff4757");

    if (currentWins > highScore) {
        highScore = currentWins;
        localStorage.setItem("battle_high_score", highScore);
        document.getElementById('high-score').innerText = highScore;
    }

    // 【重要】敗北した瞬間のみ is_active = false となり、キャラ変更ロックが解除される！
    unlockCharacterOnDefeat();

    const boss = cpu.bossInfo || CPU_BOSS_TYPES[0];
    const epitaph = `【引退】「${player.design.name}」、強敵「${boss.name}」の前に散る。通算 ${currentWins} 連勝 (SCORE: ${currentScore.toLocaleString()})。我が戦いに悔いなし！`;

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

    const cauldron = getCauldronMultipliers();
    cpu.bossInfo = boss;
    cpu.archetype = boss.archetype || "one_shot_buster";
    cpu.vfxElement = boss.vfxElement || "fire_orange";
    cpu.aiStyle = boss.aiStyle || "titan_bruiser";
    cpu.statusEffects = createStatusEffects();
    player.statusEffects = createStatusEffects();
    cpu.maxHp = Math.round(1000 * Math.pow(1.08, currentWins) * cauldron.enemyHpMult);
    cpu.hp = cpu.maxHp;
    cpu.maxPoise = Math.round(boss.poiseMax * Math.pow(1.04, currentWins));
    cpu.poise = cpu.maxPoise;
    cpu.launchPct = 0;
    cpu.stunTimer = 0;
    cpu.airY = 0;
    cpu.airVelY = 0;
    cpu.speed = Math.min(8.4, (5.2 + currentWins * 0.14) * (0.92 + sakuraiParams.cauldronIntensity * 0.04));

    // A-6 / C-28『最初にクライマックスを』：初戦は交差点中央付近で即座に激突できるよう距離を最適化
    const streetSpawns = [
        new THREE.Vector3( 14.0, 0,   0.0), // 東大通り交差点手前
        new THREE.Vector3(  0.0, 0, -18.0), // 北大通り (109前)
        new THREE.Vector3(-18.0, 0,   0.0), // 西大通り
        new THREE.Vector3(  0.0, 0,  18.0), // 南大通り
        new THREE.Vector3( 14.0, 0, -14.0)  // センター街斜め通り
    ];
    const spawnPt = streetSpawns[currentWins % streetSpawns.length];
    cpu.position.copy(spawnPt);
    cpu.velocity.set(0, 0, 0);
    cpu.state = "idle";
    cpu.aiMode = "patrol";
    cpu.alerted = false;
    cpu.patrolTarget.set(spawnPt.x * 0.5, 0, spawnPt.z * 0.5);
    cpu.patrolTimer = 1.8;

    roundTimer = 99;
    document.getElementById('round-timer-val').innerText = roundTimer;
    document.getElementById('round-num-val').innerText = currentWins + 1;

    if (currentWins > 0) {
        player.hp = Math.min(player.maxHp, Math.round(player.hp + player.maxHp * 0.35));
        player.launchPct = Math.max(0, Math.round(player.launchPct * 0.4));
    } else {
        player.hp = player.maxHp;
        player.launchPct = 0;
        battleStats.damageDealt = 0;
        battleStats.damageTaken = 0;
        battleStats.stunsInflicted = 0;
        battleStats.maxCombo = 0;
        battleStats.skillsUsed = 0;
    }
    player.sp = Math.min(player.maxSp, player.sp + 30);
    player.position.set(-4.5, 0, 2.5);
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
    updateStatusEffectsHUD();
    isGameActive = true;

    // L-5『参戦ムービー』スプラッシュ表示
    triggerChallengerSplash(boss);

    showAnnouncement(
        challengedGhostData && currentWins === 0
            ? `🔥 SNS挑戦状ゴースト「${challengedGhostData.name}」乱入！`
            : `ROUND ${currentWins + 1} (🏺ホンキ度 ${sakuraiParams.cauldronIntensity.toFixed(1)}) FIGHT!`,
        "#00f2fe"
    );
}

function resetGame() {
    if (isPaused) togglePause();
    const pauseModal = document.getElementById('pause-modal');
    if (pauseModal) pauseModal.style.display = 'none';
    currentWins = 0;
    currentScore = 0;
    cityTrialPatches.atk = 0;
    cityTrialPatches.spd = 0;
    cityTrialPatches.launch = 0;
    cityTrialPatches.def = 0;
    addScore(0);
    document.getElementById('current-wins').innerText = currentWins;
    document.getElementById('result-modal').style.display = 'none';
    document.getElementById('milestone-modal').style.display = 'none';
    player.hp = player.maxHp;
    player.sp = 60;
    player.launchPct = 0;
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

/**
 * プレイリスト#8「敵に追尾させる」＆ #11「敵をウロウロさせる」：
 * 索敵範囲(26m)外では渋谷の大通りをウロウロとパトロールし、索敵範囲に入ると「❗発見!」ポップアップ＆効果音とともに追尾・戦闘へ遷移！
 */
function updateCpuAI(dt) {
    if (!isGameActive) return;

    // D-14『ダウン追撃＆起き上がり攻防』：CPUダウン時の受身転がり or 起き上がり回転攻撃
    if (cpu.state === "down") {
        cpu.isGuarding = false;
        if (cpu.stateTimer > 0 && cpu.stateTimer < 0.52) {
            const dist = cpu.position.distanceTo(player.position);
            if (dist < 3.2 && Math.random() < 0.45) {
                // CPU起き上がり足払い攻撃
                cpu.state = "attack";
                cpu.stateDuration = 0.42;
                cpu.stateTimer = 0.42;
                SoundEngine.play('smash');
                spawnGroundSlamVFX(cpu.position, 0xff4757, 1.2);
                spawnDamageNumber(cpu.position.x, 0.8, cpu.position.z, "GETUP ATTACK!", "crit", "⚔️CPU起き上がり");
                if (dist < 3.0 && !player.isInvincible) {
                    const dmg = Math.round(36 * (cpu.atkScale || 1.0));
                    applyDamage('player', dmg);
                    spawnDamageNumber(player.position.x, player.position.y + 1.2, player.position.z, dmg, "stun", "SWEEP!");
                }
            } else {
                // CPU起き上がり受身転がり
                const backDir = new THREE.Vector3().subVectors(cpu.position, player.position).setY(0).normalize();
                if (backDir.lengthSq() < 0.1) backDir.set(0, 0, 1);
                cpu.velocity.copy(backDir.multiplyScalar(7.5));
                cpu.state = "dodge";
                cpu.stateDuration = 0.36;
                cpu.stateTimer = 0.36;
                SoundEngine.play('techroll');
                spawnFootstepDust(cpu.position, 2.0);
                spawnDamageNumber(cpu.position.x, 0.8, cpu.position.z, "TECH ROLL!", "crit", "🌀受身転がり");
            }
        }
        return;
    }

    // 体幹自然回復
    cpu.poise = Math.min(cpu.maxPoise, cpu.poise + 8.0 * dt);

    // 😵 ひるみ中（Hit-Stun）や空中打ち上げ中は攻撃・移動できない！
    if (cpu.stunTimer > 0 || cpu.airY > 0.05) {
        cpu.stunTimer = Math.max(0, cpu.stunTimer - dt);
        cpu.isGuarding = false;
        return;
    }

    const toPlayer = new THREE.Vector3().subVectors(player.position, cpu.position);
    const dist = toPlayer.length();

    // プレイリスト#11: 索敵範囲外 (dist > 26m) かつ未交戦なら渋谷の大通りをウロウロとパトロール
    if (dist > cpu.detectionRange && cpu.hp === cpu.maxHp) {
        cpu.aiMode = "patrol";
        cpu.alerted = false;
        cpu.isGuarding = false;
        cpu.patrolTimer -= dt;

        const toPatrol = new THREE.Vector3().subVectors(cpu.patrolTarget, cpu.position);
        if (cpu.patrolTimer <= 0 || toPatrol.length() < 2.0) {
            // 大通り上のランダムなウェイポイントを次の目的地に設定
            const streetWaypoints = [
                new THREE.Vector3( 24, 0,   0),
                new THREE.Vector3(-24, 0,   0),
                new THREE.Vector3(  0, 0,  24),
                new THREE.Vector3(  0, 0, -24),
                new THREE.Vector3( 14, 0, -14),
                new THREE.Vector3(-14, 0,  14)
            ];
            cpu.patrolTarget.copy(streetWaypoints[Math.floor(Math.random() * streetWaypoints.length)]);
            cpu.patrolTimer = 3.2 + Math.random() * 2.0;
        }
        const dirPatrol = toPatrol.normalize();
        cpu.rotationY = Math.atan2(dirPatrol.x, dirPatrol.z);
        cpu.velocity.add(dirPatrol.multiplyScalar(cpu.speed * 0.62 * dt * 4.5));
        return;
    }

    // プレイリスト#8: 索敵範囲内に入った瞬間、「❗索敵発見!」アラート発動 ➔ 追尾開始
    if (!cpu.alerted) {
        cpu.alerted = true;
        SoundEngine.play('alert');
        spawnDamageNumber(cpu.position.x, cpu.position.y + 2.0, cpu.position.z, "❗ 索敵発見!", "crit", "ALERT");
    }

    cpu.aiTimer -= dt;
    cpu.rotationY = Math.atan2(toPlayer.x, toPlayer.z);

    const atkScale = Math.pow(1.05, currentWins) * getArchetypeMultiplier(cpu.archetype, player.archetype);

    if (cpu.aiTimer <= 0) {
        cpu.aiTimer = Math.max(0.25, 0.55 - currentWins * 0.02) + Math.random() * 0.22;
        const style = cpu.aiStyle || "titan_bruiser";

        if (style === "sorceress_zoner") {
            // 魔導のセラフィナ: 距離7m以下なら後退・離脱、7〜16mなら魔弾、それ以上なら接近
            if (dist < 7.0) {
                cpu.aiAction = "retreat";
                cpu.aiMode = "combat";
            } else if (dist > 16.0) {
                cpu.aiAction = "chase";
                cpu.aiMode = "chase";
            } else {
                cpu.aiAction = "magic";
                cpu.aiMode = "combat";
            }
        } else if (style === "phantom_skirmisher") {
            // 影走のシルフ: 3連撃後に素早く横ステップ離脱
            if (dist > 3.6) {
                cpu.aiAction = "chase";
                cpu.aiMode = "chase";
            } else if (cpu.comboStep === 3) {
                cpu.aiAction = "retreat";
                cpu.aiMode = "combat";
            } else {
                cpu.aiAction = "attack";
                cpu.aiMode = "combat";
            }
        } else if (style === "stalwart_turtle") {
            // 鉄壁のアイギス: プレイヤーが攻撃中なら高確率でジャストシールド防御
            if (player.state === "attack") {
                cpu.aiAction = "guard";
                cpu.aiMode = "combat";
            } else if (dist > 3.0) {
                cpu.aiAction = "chase";
                cpu.aiMode = "chase";
            } else {
                cpu.aiAction = Math.random() < 0.5 ? "attack" : "guard";
                cpu.aiMode = "combat";
            }
        } else {
            // 剛腕のヴォルカン: 猛突進＆豪快なヘビー攻撃主体
            if (dist > 3.2) {
                cpu.aiAction = "chase";
                cpu.aiMode = "chase";
            } else {
                cpu.aiMode = "combat";
                cpu.aiAction = Math.random() < 0.82 ? "attack" : "guard";
            }
        }
    }

    cpu.isGuarding = false;
    if (cpu.aiAction === "chase") {
        cpu.velocity.add(toPlayer.clone().normalize().multiplyScalar(cpu.speed * dt * 5.5));
    } else if (cpu.aiAction === "retreat") {
        // 後退または横ステップ
        const sideDir = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
        const backDir = toPlayer.clone().normalize().negate();
        cpu.velocity.add(backDir.add(sideDir.multiplyScalar(0.7)).normalize().multiplyScalar(cpu.speed * dt * 4.8));
    } else if (cpu.aiAction === "magic" && cpu.state !== "attack") {
        cpu.state = "attack";
        cpu.stateDuration = 0.52;
        cpu.stateTimer = 0.52;
        SoundEngine.play('slash');
        const projDir = toPlayer.clone().normalize();
        spawnMagicProjectile(cpu.position, projDir, 0xa29bfe, "rush");
    } else if (cpu.aiAction === "attack" && cpu.state !== "attack") {
        cpu.comboStep = (cpu.comboStep % 3) + 1;
        cpu.state = "attack";
        cpu.stateDuration = 0.46;
        cpu.stateTimer = 0.46;
        SoundEngine.play('slash');
        cpu.velocity.add(toPlayer.clone().normalize().multiplyScalar(4.0));
        spawnCrescentSlash(cpu.position, player.position, 0xff3838, cpu.comboStep, 1.15);
        if (dist < 3.2 && cpu.stunTimer <= 0) {
            const cpuDmg = Math.round(58 * atkScale);
            applyDamage('player', cpuDmg);
            applyElementalStatus(cpu, player, cpuDmg);
        }
    } else if (cpu.aiAction === "guard") {
        cpu.isGuarding = true;
    }
}

/**
 * プレイリスト#9「敵のHPバーを作成」：
 * 敵キャラクターの頭上3Dワールド座標を2Dスクリーン座標に投影して追従HPバー＆AI状態バッジを描画
 */
function updateEnemyWorldHud() {
    const hud = document.getElementById('enemy-world-hud');
    if (!hud || !cpu.group || !camera) return;

    const headWorldPos = new THREE.Vector3(cpu.position.x, cpu.position.y + 2.45 + cpu.airY, cpu.position.z);
    headWorldPos.project(camera);

    // カメラの背後にある場合は非表示
    if (headWorldPos.z > 1.0) {
        hud.style.display = 'none';
        return;
    }

    const screenX = (headWorldPos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-(headWorldPos.y * 0.5) + 0.5) * window.innerHeight;

    hud.style.display = 'block';
    hud.style.left = `${screenX}px`;
    hud.style.top = `${screenY}px`;

    const nameEl = document.getElementById('ew-name');
    if (nameEl) nameEl.innerText = cpu.bossInfo?.name || 'ENEMY';

    const stateEl = document.getElementById('ew-ai-state');
    if (stateEl) {
        if (cpu.stunTimer > 0 || cpu.airY > 0.1) {
            stateEl.innerText = '😵 ひるみ中!';
            stateEl.style.background = '#e11d48';
        } else if (cpu.aiMode === 'patrol') {
            stateEl.innerText = '🐾 パトロール中';
            stateEl.style.background = '#0284c7';
        } else if (cpu.aiMode === 'chase') {
            stateEl.innerText = '🏃 追尾中!';
            stateEl.style.background = '#d97706';
        } else {
            stateEl.innerText = '⚔️ 交戦中!';
            stateEl.style.background = '#dc2626';
        }
    }

    const hpFill = document.getElementById('ew-hp-fill');
    if (hpFill) hpFill.style.width = `${Math.max(0, (cpu.hp / cpu.maxHp) * 100)}%`;

    const poiseFill = document.getElementById('ew-poise-fill');
    if (poiseFill) poiseFill.style.width = `${Math.max(0, (cpu.poise / cpu.maxPoise) * 100)}%`;
}

/**
 * プレイリスト#3「アニメーションを切り替え」：
 * Animator State Machine の現在ステートを左下ピルにリアルタイム表示
 */
function updateAnimatorStatePill(isMoving) {
    const pill = document.getElementById('animator-state-pill');
    if (!pill) return;
    const stateMap = {
        idle: isMoving ? "Animator: Run [街路移動]" : "Animator: Idle [待機]",
        attack: `Animator: Attack-${player.comboStep} [コンボ斬撃]`,
        skill: "Animator: SkillArts [固有スキル]",
        special: "Animator: UltimateEX [必殺奥義]",
        dodge: "Animator: DodgeStep [無敵回避]",
        jump: "Animator: Jump [空中飛躍]",
        damaged: "Animator: Damaged [被弾ひるみ]",
        down: "Animator: Down [戦闘不能]"
    };
    pill.innerText = `🎬 ${stateMap[player.state] || "Animator: Idle"} | LockOn: ${input.lockOn ? 'ON' : 'OFF'}`;
}

/**
 * 1:1 実寸大 160m×160m 渋谷都市区画 2Dレーダーミニマップ描画
 * 高層ビル28棟のフットプリント・大通り・破壊可能プロップ・敵位置・プレイヤー視線コーンをリアルタイム描画
 */
function renderCityMinimap() {
    const canvas = document.getElementById('city-minimap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const scale = (W * 0.5) / 80.0; // ±80m (160m×160m) をマップ全域に投影
    const toMapX = x => W * 0.5 + x * scale;
    const toMapY = z => H * 0.5 + z * scale;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, W, H);

    // 1. 南北大通り・東西大通り・斜めセンター街・中央スクランブル交差点
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(toMapX(-12), 0, 24 * scale, H);
    ctx.fillRect(0, toMapY(-12), W, 24 * scale);

    // 2. 実寸大高層ビル群 (AABBコライダー)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1;
    cityBuildingsColliderList.forEach(b => {
        const bx = toMapX(b.x - b.hw);
        const by = toMapY(b.z - b.hd);
        const bw = b.hw * 2 * scale;
        const bh = b.hd * 2 * scale;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
    });

    // 3. フィールド境界リング (半径75m)
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.45)';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, arenaRadius * scale, 0, Math.PI * 2);
    ctx.stroke();

    // 4. 街中の破壊可能オブジェクト（自販機・ネオン看板・バリケード）
    ctx.fillStyle = '#fde047';
    cityStreetProps.forEach(p => {
        if (!p.alive) return;
        ctx.fillRect(toMapX(p.x) - 1.5, toMapY(p.z) - 1.5, 3, 3);
    });

    // 5. 敵（CPU）の位置＆索敵範囲リング
    const cx = toMapX(cpu.position.x);
    const cy = toMapY(cpu.position.z);
    if (cpu.aiMode === 'patrol') {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
        ctx.beginPath();
        ctx.arc(cx, cy, cpu.detectionRange * scale, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
    ctx.fill();

    // 6. プレイヤーの位置＆向き
    const px = toMapX(player.position.x);
    const py = toMapY(player.position.z);
    ctx.fillStyle = '#00f2fe';
    ctx.beginPath();
    ctx.arc(px, py, 4.2, 0, Math.PI * 2);
    ctx.fill();

    const coordEl = document.getElementById('minimap-coords');
    if (coordEl) {
        const distToEnemy = Math.hypot(cpu.position.x - player.position.x, cpu.position.z - player.position.z);
        coordEl.innerText = `X: ${player.position.x.toFixed(1)}m | Z: ${player.position.z.toFixed(1)}m | 敵距離: ${distToEnemy.toFixed(1)}m`;
    }
}

function updateFullBodyMotion(entity, dt, isMoving) {
    entity.animTime += dt * (isMoving ? 14.0 : 4.2);
    const t = entity.animTime;
    const pivot = entity.animPivot;
    const j = entity.customJoints || entity.joints || {};
    const dur = Math.max(0.01, entity.stateDuration || 0.35);
    const rawP = THREE.MathUtils.clamp(1.0 - (entity.stateTimer / dur), 0.0, 1.0);

    // G-9『扁平スケーリング (Squash & Stretch)』: 通常スケール(1,1,1)へ滑らかに復帰
    if (entity.squashStretch) {
        entity.squashStretch.lerp(new THREE.Vector3(1, 1, 1), dt * 9.5);
    }

    let py = entity.airY || 0;
    let rx = 0, ry = 0, rz = 0;
    let torsoY = 0;
    let lArmX = 0, lArmZ = 0.18, rArmX = 0, rArmZ = -0.18;
    let lLegX = 0, rLegX = 0;

    if (entity.state === "attack" || entity.state === "skill") {
        // G-4『かまえは瞬時に極端に』 / G-6『フォロースルーで印象が決まる』 / G-11『モーション補間のワナ』:
        // 均等補間を排し、予備動作(0〜0.15)は一瞬で極端に溜め、0.15〜0.38で一気に振り抜き、0.38〜1.0で長いフォロースルー余韻を付与
        let p;
        if (rawP < 0.15) {
            p = Math.pow(rawP / 0.15, 2.2) * 0.20; // 一瞬で極端に振りかぶる溜め
            if (entity.squashStretch) entity.squashStretch.set(1.18, 0.82, 1.18); // 溜めの縮み
        } else if (rawP < 0.38) {
            const rel = (rawP - 0.15) / 0.23;
            p = 0.20 + Math.pow(rel, 0.45) * 0.65; // 最速でインパクトまで振り抜く
            if (entity.squashStretch) entity.squashStretch.set(0.86, 1.28, 0.86); // 振り抜きの伸び
        } else {
            const rel = (rawP - 0.38) / 0.62;
            p = 0.85 + rel * 0.15; // 長いフォロースルー残心
        }

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
        rx = -0.55 * Math.sin(rawP * Math.PI);
        rz = Math.sin(t * 8.0) * 0.18;
        rArmX = -0.9; lArmX = -0.9;
        if (entity.squashStretch) entity.squashStretch.set(1.15, 0.88, 1.15);
    } else if (entity.state === "launched") {
        rx = rawP * Math.PI * 2.0;
        rArmX = -1.4; lArmX = -1.4;
        if (entity.squashStretch) entity.squashStretch.set(0.82, 1.35, 0.82);
    } else if (entity.state === "down") {
        rx = -Math.PI * 0.46;
        if (entity.squashStretch) entity.squashStretch.set(1.3, 0.7, 1.3);
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
        if (entity.squashStretch) {
            pivot.scale.copy(entity.squashStretch);
        }
    }
    if (j.torso) j.torso.rotation.y = torsoY;
    if (j.leftArm) { j.leftArm.rotation.x = lArmX; j.leftArm.rotation.z = lArmZ; }
    if (j.rightArm) { j.rightArm.rotation.x = rArmX; j.rightArm.rotation.z = rArmZ; }
    if (j.leftLeg) j.leftLeg.rotation.x = lLegX;
    if (j.rightLeg) j.rightLeg.rotation.x = rLegX;
}

/**
 * 🛠️ K-08 桜井式仕様モニター / 60fpsフレーム＆【パラメーター】HUD更新
 */
function updateSakuraiInspectorHud() {
    const frameVal = document.getElementById('si-frame-val');
    if (frameVal) frameVal.innerText = lastFrameDataText;

    const hitstopVal = document.getElementById('si-hitstop-val');
    if (hitstopVal) hitstopVal.innerText = `${Math.round(hitStopTimer * 60)}F (方向: ${hitStopVector.x.toFixed(2)}, ${hitStopVector.y.toFixed(2)})`;

    const physVal = document.getElementById('si-physics-val');
    if (physVal) physVal.innerText = `敵ふっとび ${cpu.launchPct}% | 自機ふっとび ${player.launchPct}% | ホンキ度 ${sakuraiParams.cauldronIntensity.toFixed(1)}`;

    const patchVal = document.getElementById('si-patches-val');
    if (patchVal) patchVal.innerText = `🔴攻+${cityTrialPatches.atk || 0} 🔵速+${cityTrialPatches.spd || 0} 🟡撃+${cityTrialPatches.launch || 0} 💚防+${cityTrialPatches.def || 0}`;
}

// ========================================================
// 13. メインアニメーションループ（Bloom合成 ＆ 桜井式スマート観戦カメラ ＆ 実寸大都市コリジョン）
// ========================================================
function animate() {
    requestAnimationFrame(animate);

    let rawDt = Math.min(clock.getDelta(), 0.05);
    const elapsedTime = clock.getElapsedTime();

    // J-10『必ず止められるように』: ポーズ中は描画のみ維持し物理・タイマー進行を静止
    if (isPaused) {
        if (composer) composer.render();
        else renderer.render(scene, camera);
        return;
    }

    if (hitStopTimer > 0) {
        hitStopTimer -= rawDt;
        // D-4『8つのヒットストップ仕様』: 防御側(defender)がふっとびベクトル(hitStopVector)に沿って高速振動
        const defender = (cpu.state === "stunned" || cpu.state === "launched") ? cpu : (player.state === "damaged" ? player : null);
        if (defender && defender.animPivot) {
            const vib = Math.sin(elapsedTime * 85.0) * 0.14;
            defender.animPivot.position.x = hitStopVector.x * vib;
            defender.animPivot.position.z = hitStopVector.y * vib;
        }
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
            // 🟢 堅守トークンによる秒間HPリジェネ回復
            if (player.hpRegen > 0 && player.hp > 0 && player.hp < player.maxHp) {
                player.hp = Math.min(player.maxHp, player.hp + player.hpRegen);
            }
            // プレイリスト#14: 制限時間0秒到達時の判定
            if (roundTimer === 0 && isGameActive) {
                if (player.hp >= cpu.hp) handleVictory();
                else handleGameOver();
            }
        }
        if (player.overdriveTimer > 0) {
            player.overdriveTimer = Math.max(0, player.overdriveTimer - dt);
        }
        // 🟣 魔導トークンによるSP獲得速度倍率
        player.sp = Math.min(player.maxSp, player.sp + 4.8 * (player.spRegenMult || 1.0) * dt);
        updateGauges();
    }

    // プレイリスト#4: 破壊された街中ストリートプロップの時間差リスポーン更新
    for (let i = 0; i < cityStreetProps.length; i++) {
        const prop = cityStreetProps[i];
        if (!prop.alive) {
            prop.respawnTimer -= dt;
            if (prop.respawnTimer <= 0) {
                prop.alive = true;
                prop.mesh.visible = true;
                spawnGroundSlamVFX(new THREE.Vector3(prop.x, 0, prop.z), 0x00f2fe, 0.75);
            }
        }
    }

    // N-06 シティトライアル強化パッチの更新
    updateCityTrialPatches(dt);

    // K-09 カメラ視線を遮る高層ビルの半透明化更新
    updateBuildingOcclusionTransparency();

    // K-08 / F-2 3D当たり判定球更新
    updateDebugHitboxes();

    // プレイヤー周囲のキラキラオーラ更新
    playerAuraParticles.forEach(p => {
        p.angle += dt * p.speed;
        const y = ((p.heightOffset + elapsedTime * 0.9) % 1.65) + 0.15;
        p.mesh.position.set(Math.cos(p.angle) * p.radius, y + player.airY, Math.sin(p.angle) * p.radius);
        p.mesh.rotation.y += dt * 4;
    });

    // 都市全体の浮遊ネオン粒子アニメーション
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
            const prevVelY = ent.airVelY;
            ent.airVelY -= 19.5 * dt;
            if (ent.airY <= 0) {
                ent.airY = 0;
                ent.airVelY = 0;
                // D-3 着地時の扁平スケーリング (Squash)
                if (ent.squashStretch) ent.squashStretch.set(1.22, 0.78, 1.22);
                spawnFootstepDust(ent.position, 1.5);

                // D-14『ダウン追撃＆床激突』：強打落下時（落下速度 > 7.5 または launched状態）は床激突ダウンへ
                if ((prevVelY < -7.5 || ent.state === "launched") && ent.state !== "down") {
                    ent.state = "down";
                    ent.stateDuration = 0.85;
                    ent.stateTimer = 0.85;
                    cameraShakeIntensity = Math.min(0.38, Math.abs(prevVelY) * 0.025);
                    SoundEngine.play('hit');
                    spawnDamageNumber(ent.position.x, ent.position.y + 0.4, ent.position.z, "CRASH!", "stun", "💥床激突");
                    spawnGroundSlamVFX(ent.position, 0xffbe0b, 0.9);
                }
            }
        }
    });

    // プレイヤーのダウン時受身キー入力検知 (ガード・ダッシュ・移動キー入力で受身転がり)
    if (player.state === "down") {
        if (input.guard || input.dash || Math.hypot(input.x, input.z) > 0.35) {
            performPlayerTechRoll();
        }
    }

    // K-06 強ふっとび飛行機雲の生成
    if (cpu.state === "launched" && Math.random() < 0.45) {
        spawnLaunchSmokeTrail(cpu.position, cpu.airY);
    }

    // プレイヤー移動 ＆ オートバトルAIガンビット駆動
    let playerMoving = false;
    if (isGameActive && player.state !== "special" && player.state !== "down") {
        const autoMoved = updatePlayerAutoAI(dt);
        if (autoMoved) playerMoving = true;

        player.isGuarding = input.guard && player.state !== "attack";
        player.guardBarrierMesh.material.opacity = player.isGuarding ? 0.38 : 0.0;

        // B-1 / B-2 ジャストシールド判定用ガード継続時間の計測
        if (player.isGuarding) {
            player.guardHoldTime += dt;
        } else {
            player.guardHoldTime = 0;
        }

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

    // D-6『遅さは罪』: 入力バッファの先行入力をチェックし、硬直終了フレームで即時発動
    if (inputBuffer.expiresAt > performance.now()) {
        const overdriveMult = player.overdriveTimer > 0 ? 1.28 : 1.0;
        const patchSpdBonus = 1.0 + (cityTrialPatches.spd || 0) * 0.04;
        const cancelWindow = 0.16 / (player.atkSpeed * overdriveMult * patchSpdBonus);
        const canExecute = (player.state === "idle" || player.state === "walk") ||
            ((player.state === "attack" || player.state === "skill") && player.stateTimer <= cancelWindow);
        if (canExecute) {
            const nextAction = inputBuffer.action;
            const nextSub = inputBuffer.subType;
            inputBuffer.expiresAt = 0;
            executePlayerAction(nextAction, nextSub);
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
            SoundEngine.play('hit');
            const dmg = Math.round(54 * player.atkScale * getArchetypeMultiplier(player.archetype, cpu.archetype));
            cpu.stunTimer = 0.48 * player.stunPower;
            cpu.state = "stunned";
            cpu.stateTimer = cpu.stunTimer;
            cpu.launchPct = Math.min(999, cpu.launchPct + Math.round(dmg * 0.14));
            battleStats.stunsInflicted++;
            triggerDefenderFlashing(cpu);
            spawnHitSparks(cpu.position, pr.colorHex, 28);
            spawnDamageNumber(cpu.position.x, cpu.position.y + cpu.airY, cpu.position.z, dmg, "stun", "MAGIC!");
            applyDamage('cpu', dmg);
            applyElementalStatus(player, cpu, dmg);
            addCombo(1, dmg);
            addScore(dmg);
            scene.remove(pr.mesh);
            projectilesList.splice(i, 1);
            continue;
        }
        if (pr.life <= 0) {
            scene.remove(pr.mesh);
            projectilesList.splice(i, 1);
        }
    }

    // 位置更新 ＆ 実寸大高層ビルAABBコリジョン (#2) ＆ 半径75m都市境界
    player.position.addScaledVector(player.velocity, dt);
    player.velocity.multiplyScalar(0.82);
    cpu.position.addScaledVector(cpu.velocity, dt);
    cpu.velocity.multiplyScalar(0.82);

    [player, cpu].forEach(ent => {
        resolveCityBuildingCollisions(ent);
        const d = Math.hypot(ent.position.x, ent.position.z);
        if (d > arenaRadius - 0.8) ent.position.multiplyScalar((arenaRadius - 0.8) / d);
    });

    player.group.position.copy(player.position);
    player.group.rotation.y = player.rotationY + (player.isVrm && !player.isCustomRig ? 0 : Math.PI);
    cpu.group.position.copy(cpu.position);
    cpu.group.rotation.y = cpu.rotationY + Math.PI;

    // プレイリスト#16: 3Dターゲットロックオン・デュアルレティクル更新
    if (lockOnReticleMesh) {
        lockOnReticleMesh.visible = input.lockOn && isGameActive;
        if (lockOnReticleMesh.visible) {
            lockOnReticleMesh.position.set(cpu.position.x, 0.08 + cpu.airY * 0.2, cpu.position.z);
            lockOnReticleMesh.rotation.y += dt * 2.8;
        }
    }

    if (player.vrm) player.vrm.update(dt);
    updateFullBodyMotion(player, dt, playerMoving);
    updateFullBodyMotion(cpu, dt, cpu.velocity.lengthSq() > 0.25);

    // プレイリスト#9: 3Dワールド追従 敵頭上HPバー ＆ #3 Animator State Pill ＆ 160m都市ミニマップ ＆ 桜井インスペクターHUD更新
    updateEnemyWorldHud();
    updateAnimatorStatePill(playerMoving);
    renderCityMinimap();
    updateSakuraiInspectorHud();

    // C-14 属性状態異常 (炎上DoT, 感電微ヒットストップ, 氷結スロー, 虚無吸引) 更新
    updateStatusEffects(player, cpu, dt, true);
    updateStatusEffects(cpu, player, dt, false);
    updateStatusEffectsHUD();

    // K-02 画面外ルーペ (Off-screen Magnifier Bubbles) 更新
    updateOffscreenLoupe();

    // 109 大型街頭LEDビジョン リアルタイム中継 ＆ 地下鉄通気口ジャンプパッド更新
    update109Billboard(dt);
    updateCityJumpPads(dt);

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

    // ダイナミックTPS＆スマート観戦カメラワーク（D-5 注視点をくっつけない＋プレイリスト#16 ロックオン追従）
    const midPoint = new THREE.Vector3().addVectors(player.position, cpu.position).multiplyScalar(0.5);
    const toPlayerFromCpu = new THREE.Vector3().subVectors(player.position, cpu.position).normalize();
    const rightVec = new THREE.Vector3(-toPlayerFromCpu.z, 0, toPlayerFromCpu.x);

    let camTargetPos;
    let lookTarget = input.lockOn
        ? new THREE.Vector3(midPoint.x, 1.35 + (player.airY + cpu.airY) * 0.35, midPoint.z)
        : player.position.clone().add(new THREE.Vector3(0, 1.45 + player.airY * 0.5, 0));

    // D-5『注視点をくっつけない』：カメラ注視点をターゲットへ固定せず、戦闘状況に応じて先読みオフセット
    lookTarget.addScaledVector(toPlayerFromCpu, -sakuraiParams.cameraLeadDist * 0.4);

    if (cinematicCameraMode === "zoom_player") {
        const frontDir = new THREE.Vector3(Math.sin(player.rotationY), 0, Math.cos(player.rotationY));
        camTargetPos = player.position.clone().addScaledVector(frontDir, 2.3).add(new THREE.Vector3(0.7, 1.4, 0));
        lookTarget.copy(player.position).add(new THREE.Vector3(0, 1.3, 0));
        camera.position.lerp(camTargetPos, 0.22);
    } else if (cinematicCameraMode === "finish_zoom") {
        // D-1 / N-12 フィニッシュズーム：敵とプレイヤーの中央へ急激にズームイン
        camTargetPos = cpu.position.clone().add(new THREE.Vector3(1.8, 1.2 + cpu.airY * 0.6, 2.2));
        lookTarget.copy(cpu.position).add(new THREE.Vector3(0, 1.1 + cpu.airY, 0));
        camera.position.lerp(camTargetPos, 0.35);
    } else if (isCinematicSpectator) {
        // 🎬 観戦カメラモード時はゆっくり周回しながらコンボ時にダイナミックズーム
        const orbitAng = elapsedTime * 0.35;
        const zoomDist = comboHits >= 3 || cpu.airY > 0.2 ? 5.6 : 7.8;
        camTargetPos = new THREE.Vector3(
            midPoint.x + Math.cos(orbitAng) * zoomDist,
            2.6 + Math.sin(elapsedTime * 0.7) * 0.65,
            midPoint.z + Math.sin(orbitAng) * zoomDist
        );
        camera.position.lerp(camTargetPos, 0.08);
    } else {
        const dynamicZoom = comboHits >= 3 || cpu.airY > 0.25 ? 4.2 : 5.2;
        camTargetPos = player.position.clone()
            .addScaledVector(toPlayerFromCpu, dynamicZoom)
            .addScaledVector(rightVec, -1.35)
            .add(new THREE.Vector3(0, 3.1, 0));
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
// 14. 入力バインド（桜井式インスペクター ＆ 悪魔の釜 ＆ AI 3Dモデリングプロンプト ＆ 迅速リトライ）
// ========================================================
function openGraphLoopModal() {
    const modal = document.getElementById('graph-loop-modal');
    const body = document.getElementById('graph-loop-telemetry-body');
    if (!modal) return;
    if (body) {
        const t = player.sliderPts || { atk: 3, range: 3, spd: 3, stun: 3, atkspd: 3 };
        const cmb = player.comboRoute || { starter: 'flash_step', linker: 'spiral_slash', finisher: 'sky_upper' };
        const ult = player.ultConfig || { form: 'meteor_drop', trait: 'vampire_heal' };
        body.innerHTML =
            `<div>🕸️ <strong>Graph Engineering (1:1実寸大都市＆状態遷移グラフ)</strong>: 現在フィールド <code>東京・渋谷 160m×160m 実寸大都市区画 (半径${arenaRadius}m / ビル28棟コライダー稼働中)</code> | プレイヤー相性: <strong>${ARCHETYPE_INFO[player.archetype]?.label}</strong> vs 敵ノード: <strong>${ARCHETYPE_INFO[cpu.archetype]?.label}</strong></div>` +
            `<div>🪙 <strong>Token Graph (15トークン配分エッジ)</strong>: 🔴剛撃:${t.atk} 🟡覇道:${t.range} 🔵蒼迅:${t.spd} 🟢堅守:${t.stun} 🟣魔導:${t.atkspd} ➔ ATK <strong>${player.atkScale.toFixed(2)}x</strong> / 範囲 <strong>${player.attackRange.toFixed(1)}m</strong> / HP <strong>${player.maxHp} (+${player.hpRegen}/s)</strong></div>` +
            `<div>⚔️ <strong>Combo & Ultimate DAG</strong>: [${COMBO_MOVE_EFFECTS[cmb.starter]?.label || cmb.starter}] ➔ [${COMBO_MOVE_EFFECTS[cmb.linker]?.label || cmb.linker}] ➔ [${COMBO_MOVE_EFFECTS[cmb.finisher]?.label || cmb.finisher}] | 奥義特性: <code>${ult.form} × ${ult.trait}</code></div>` +
            `<div>🔄 <strong>Loop Engineering (全39本桜井講義統合テレメトリ)</strong>: 現在連勝 <strong>${currentWins} WIN</strong> | SCORE <strong>${currentScore.toLocaleString()}</strong> | 悪魔の釜ホンキ度 <strong>${sakuraiParams.cauldronIntensity.toFixed(1)}</strong> | シティトライアルパッチ <strong>攻+${cityTrialPatches.atk} 速+${cityTrialPatches.spd} 撃+${cityTrialPatches.launch} 防+${cityTrialPatches.def}</strong></div>`;
    }
    modal.style.display = 'flex';
    runAutonomousMetaSimulation();
}

function toggleAutoBattle() {
    isAutoBattle = !isAutoBattle;
    const btn = document.getElementById('btn-auto-toggle');
    if (btn) {
        btn.innerText = isAutoBattle ? '🤖 AUTO街バトル: ON' : '🎮 手動操作: ON';
        btn.classList.toggle('active', isAutoBattle);
    }
    showAnnouncement(
        isAutoBattle ? '🤖 AUTO街バトル ON (登録AIガンビットで渋谷ストリート自動戦闘)' : '🎮 手動アクションモード ON',
        isAutoBattle ? '#10b981' : '#ffd32a'
    );
}

/**
 * プレイリスト#16「敵をロックオン」トグル (Qキー / 上部🎯ロックオンボタン)
 */
function toggleLockOn() {
    input.lockOn = !input.lockOn;
    SoundEngine.play('lockon');
    const btn = document.getElementById('btn-lockon-toggle');
    if (btn) {
        btn.innerText = input.lockOn ? '🎯 ロックオン: ON' : '🎯 ロックオン: OFF';
        btn.classList.toggle('active', input.lockOn);
    }
    showAnnouncement(
        input.lockOn ? '🎯 ターゲットロックオン ON (敵を自動補足)' : '🔓 ロックオン解除 (自由視点移動)',
        '#00f2fe'
    );
}

/**
 * プレイリスト#7「効果音で世界を彩る」サウンド＆BGMトグル
 */
function toggleSoundEngine() {
    const enabled = SoundEngine.toggle();
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) {
        btn.innerText = enabled ? '🔊 効果音/BGM: ON' : '🔇 効果音/BGM: OFF';
        btn.classList.toggle('active', enabled);
    }
    showAnnouncement(
        enabled ? '🔊 Web Audio シンセ効果音＆都市BGM ON' : '🔇 サウンドミュート',
        enabled ? '#10b981' : '#94a3b8'
    );
}

/**
 * プレイリスト#18「ゲームを書き出す」：
 * 現在のオリキャラデザイン・5種トークン配分・3段コンボルート・必殺奥義・AIガンビット・戦績をJSONファイルとして書き出し
 */
function exportCharacterBuildJson() {
    const exportData = {
        platform: "Unlimited Shibuya 1:1 City Colosseum (Sakurai Complete Edition)",
        exportedAt: new Date().toISOString(),
        score: currentScore,
        winStreak: currentWins,
        highScore: highScore,
        sakuraiSettings: sakuraiParams,
        cityTrialPatches: cityTrialPatches,
        character: {
            name: player.design.name,
            archetype: player.archetype,
            design: player.design,
            motionType: player.motionType,
            vfxElement: player.vfxElement,
            skillName: player.skillName,
            tokens: player.sliderPts,
            stats: {
                atkScale: player.atkScale,
                attackRange: player.attackRange,
                stunPower: player.stunPower,
                atkSpeed: player.atkSpeed,
                speed: player.speed,
                maxHp: player.maxHp,
                hpRegen: player.hpRegen,
                spRegenMult: player.spRegenMult
            },
            comboRoute: player.comboRoute,
            ultConfig: player.ultConfig,
            gambits: player.gambits
        },
        challengeUrl: buildChallengeUrl()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `${player.design.name.replace(/\s+/g, '_')}_build_export.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    SoundEngine.play('lockon');
    showAnnouncement('📦 オリキャラ＆AIビルドデータ (.json) を書き出しました！', '#ffd32a');
}

/**
 * 🤖 バトルゲーム向け AI 3Dモデリング プロンプト生成 (Tripo AI / Meshy AI / Luma AI 最適化)
 * - 構成: Subject + Style + Material + Topology/Technical + Engine + Negative Prompt
 * - ユーザーが作成したキャラ・武器・属性・カラー設定を完全反映したゲームレディ3Dアセット生成プロンプト
 */
function generateAi3dModelingPrompt() {
    const d = player.design;
    const styleMap = {
        goggle_hero: "young futuristic male anime hero warrior with spiked vibrant hair wearing pilot goggles and high-collared combat vest",
        ponytail_valkyrie: "female valkyrie knight warrior with high ponytail, armored chestplate, and reinforced battle skirt",
        astral_mage: "astral sorcerer in flowing battle robes with wide-brim pointed hat and gold filigree collar",
        cyber_brawler: "cyberpunk martial artist brawler with sleek full-face glowing neon visor and reinforced combat suit",
        straw_adventurer: "spirited anime adventurer with broad straw hat, open vest, and lightweight agile traveler garments"
    };

    const weaponMap = {
        rune_greatsword: "massive two-handed mechanical rune greatsword with glowing energy conduits along the blade core",
        sword_shield: "one-handed tempered steel arming sword paired with round reinforced buckler shield with metallic boss",
        magic_staff: "ornate mystical battle staff topped with floating celestial ring and glowing power crystal",
        knuckle_gauntlet: "pair of heavy mechanical armored knuckle gauntlets with impact piston details",
        crimson_katana: "curved samurai nodachi katana with glowing crimson edge and ornate gold tsuba guard"
    };

    const subjectStr = `Full body 3D character asset of a ${styleMap[d.style] || styleMap.goggle_hero}, wielding a ${weaponMap[d.weapon] || weaponMap.rune_greatsword}. Symmetrical A-pose for rigging.`;
    const styleStr = "Stylized 3D anime action fighting game aesthetic, clean readable silhouette, crisp sharp contours, dynamic hero proportions, vivid Japanese arcade game art style.";
    const matStr = `PBR materials with 2K resolution, ${d.outfitColor} armored fabric with battle-worn scratches and edge wear, ${d.hairColor} hair, glowing ${d.auraColor} emissive accents, calibrated roughness and metallic maps.`;
    const topoStr = "Game-ready low-poly asset under 12,000 triangles, clean quad-dominant topology, watertight manifold geometry, centered pivot at ground level, normalized scale.";
    const engineStr = "Optimized for Three.js, Unity URP, and Unreal Engine 5, GLB and FBX export ready, compatible with real-time mobile and web graphics.";
    const negativeStr = "blurry textures, non-manifold geometry, floating parts, duplicate limbs, asymmetrical pose, noisy mesh, bad hands, distorted weapons.";

    return `=== [AI 3D MODELING PROMPT (Tripo / Meshy / Luma)] ===\n` +
           `PROMPT:\n` +
           `${subjectStr} ${styleStr} ${matStr} ${topoStr} ${engineStr}\n\n` +
           `NEGATIVE PROMPT:\n` +
           `${negativeStr}\n` +
           `======================================================`;
}

function copyAi3dPromptToClipboard() {
    const promptText = generateAi3dModelingPrompt();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(promptText).then(() => {
            SoundEngine.play('patch');
            showAnnouncement("📋 AI 3Dモデリング用プロンプト (Tripo/Meshy仕様) をコピーしました！", "#00f2fe");
        }).catch(() => {
            promptFallback(promptText);
        });
    } else {
        promptFallback(promptText);
    }
}

function promptFallback(text) {
    prompt("以下のプロンプトをコピーしてTripo AI / Meshy AIに貼り付けてください:", text);
}

function toggleCinematicSpectator() {
    isCinematicSpectator = !isCinematicSpectator;
    document.body.classList.toggle('cinematic-spectator', isCinematicSpectator);
    const btn = document.getElementById('btn-cinematic-mode');
    if (btn) {
        btn.innerText = isCinematicSpectator ? '🎬 都市観戦カメラ: ON (UI非表示)' : '🎬 都市観戦カメラ';
    }
}

// ========================================================
// J-10『必ず飛ばせるように、止められるように』ポーズ機能 ＆ 演出スキップ
// ========================================================
let isPaused = false;

function togglePause() {
    if (!isGameActive) return;
    isPaused = !isPaused;
    const pauseModal = document.getElementById('pause-modal');
    if (pauseModal) {
        pauseModal.style.display = isPaused ? 'flex' : 'none';
    }
    const btn = document.getElementById('btn-pause-toggle');
    if (btn) {
        btn.innerText = isPaused ? '▶️ 再開' : '⏸️ ポーズ';
        btn.classList.toggle('active', isPaused);
    }
    SoundEngine.play(isPaused ? 'pause' : 'unpause');
}

function skipCinematic() {
    // J-10 演出スキップ：長引くKOスローモーションを即座にスキップして試合テンポを最大化
    if (isKoSlowMo) {
        isKoSlowMo = false;
        slowMoTimer = 0;
    }
}

/**
 * B-14『リトライは迅速に』：ノーローディング即座リトライ
 */
function performQuickRetry() {
    SoundEngine.play('patch');
    showAnnouncement("🔄 迅速リトライ！即座に再戦開始", "#ffd32a");
    resetGame();
}

function setupInputs() {
    window.addEventListener('keydown', e => {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) return;
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup') { input.moveZ = 1; checkFlick('up'); }
        if (k === 's' || k === 'arrowdown') { input.moveZ = -1; checkFlick('down'); }
        if (k === 'a' || k === 'arrowleft') { input.moveX = -1; checkFlick('left'); }
        if (k === 'd' || k === 'arrowright') { input.moveX = 1; checkFlick('right'); }

        // D-6『遅さは罪』: 4F〜6F先行入力バッファ経由で攻撃・アクションを発動
        if (k === 'j' || k === 'z') handlePlayerActionInput('attack', 'rush');
        if (k === 'i' || k === 'c') handlePlayerActionInput('attack', 'wide');
        if (k === 'u' || k === 'e') handlePlayerActionInput('attack', 'launch');
        if (k === 'o' || k === 'f') handlePlayerActionInput('arts');
        if (k === 'k' || k === 'x') handlePlayerActionInput('special');
        if (k === 'l' || k === 'shift') handlePlayerActionInput('dodge');
        if (k === 'v') handlePlayerActionInput('jump');

        if (k === 'p') toggleAutoBattle();
        if (k === 'r') performQuickRetry(); // B-14 迅速リトライキー
        if (e.key === 'Escape' || k === 'escape') {
            togglePause();
            e.preventDefault();
        }
        if (k === ' ') {
            skipCinematic();
            input.guard = true;
            player.lastGuardPressTime = performance.now();
            e.preventDefault();
        }
        if (k === 'q') toggleLockOn();
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

    // 左下 ATTACK 4ボタンパッド (先行入力バッファ対応)
    bindPadBtn('btn-atk-rush',   () => handlePlayerActionInput('attack', 'rush'));
    bindPadBtn('btn-atk-wide',   () => handlePlayerActionInput('attack', 'wide'));
    bindPadBtn('btn-atk-heavy',  () => handlePlayerActionInput('attack', 'launch'));
    bindPadBtn('btn-atk-guard',  () => { input.guard = true; player.lastGuardPressTime = performance.now(); }, () => { input.guard = false; });

    // 右下 SKILL 4ボタンパッド (先行入力バッファ対応)
    bindPadBtn('btn-skl-ult',    () => handlePlayerActionInput('special'));
    bindPadBtn('btn-skl-arts',   () => handlePlayerActionInput('arts'));
    bindPadBtn('btn-skl-dodge',  () => handlePlayerActionInput('dodge'));
    bindPadBtn('btn-skl-jump',   () => handlePlayerActionInput('jump'));

    // J-10『必ず飛ばせるように、止められるように』ポーズ関連ボタン
    document.getElementById('btn-pause-toggle')?.addEventListener('click', togglePause);
    document.getElementById('btn-resume-battle')?.addEventListener('click', () => { if (isPaused) togglePause(); });
    document.getElementById('btn-pause-retry')?.addEventListener('click', () => {
        if (isPaused) togglePause();
        performQuickRetry();
    });

    // 上部 監督・観戦コントロールバー ＆ 桜井式デバッグボタン
    document.getElementById('open-cert-btn')?.addEventListener('click', () => openCertificateModal('SURVIVAL'));
    document.getElementById('btn-open-graph-loop')?.addEventListener('click', openGraphLoopModal);
    document.getElementById('btn-close-graph-loop')?.addEventListener('click', () => {
        document.getElementById('graph-loop-modal').style.display = 'none';
    });
    document.getElementById('btn-run-sim-loop')?.addEventListener('click', () => {
        runAutonomousMetaSimulation();
        SoundEngine.play('patch');
    });
    document.getElementById('btn-auto-toggle')?.addEventListener('click', toggleAutoBattle);
    document.getElementById('btn-lockon-toggle')?.addEventListener('click', toggleLockOn);
    document.getElementById('btn-sound-toggle')?.addEventListener('click', toggleSoundEngine);
    document.getElementById('btn-export-build')?.addEventListener('click', exportCharacterBuildJson);
    document.getElementById('btn-cinematic-mode')?.addEventListener('click', toggleCinematicSpectator);
    document.getElementById('btn-live-brag')?.addEventListener('click', () => shareOnX('survival'));

    // B-14『リトライは迅速に』ボタン
    document.getElementById('btn-quick-retry')?.addEventListener('click', performQuickRetry);

    // B-5『悪魔の釜』ホンキ度スライダー操作
    const cauldronValEl = document.getElementById('cauldron-val');
    document.getElementById('cauldron-down')?.addEventListener('click', () => {
        sakuraiParams.cauldronIntensity = Math.max(1.0, Number((sakuraiParams.cauldronIntensity - 0.5).toFixed(1)));
        if (cauldronValEl) cauldronValEl.innerText = sakuraiParams.cauldronIntensity.toFixed(1);
        SoundEngine.play('patch');
    });
    document.getElementById('cauldron-up')?.addEventListener('click', () => {
        sakuraiParams.cauldronIntensity = Math.min(9.0, Number((sakuraiParams.cauldronIntensity + 0.5).toFixed(1)));
        if (cauldronValEl) cauldronValEl.innerText = sakuraiParams.cauldronIntensity.toFixed(1);
        SoundEngine.play('patch');
    });

    // K-08 桜井式仕様モニター開閉
    document.getElementById('btn-sakurai-debug')?.addEventListener('click', () => {
        const panel = document.getElementById('sakurai-inspector-panel');
        if (panel) {
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'block' : 'none';
            sakuraiParams.showHitboxes = isHidden;
            updateDebugHitboxes();
        }
    });
    document.getElementById('btn-close-sakurai-debug')?.addEventListener('click', () => {
        const panel = document.getElementById('sakurai-inspector-panel');
        if (panel) panel.style.display = 'none';
        sakuraiParams.showHitboxes = false;
        updateDebugHitboxes();
    });

    // 桜井式ライブ【パラメーター】スライダー
    const slHitstop = document.getElementById('prm-hitstop');
    const lblHitstop = document.getElementById('lbl-prm-hitstop');
    if (slHitstop) {
        slHitstop.addEventListener('input', () => {
            sakuraiParams.hitStopScale = parseFloat(slHitstop.value);
            if (lblHitstop) lblHitstop.innerText = `${sakuraiParams.hitStopScale.toFixed(1)}x`;
        });
    }

    const slLaunch = document.getElementById('prm-launch');
    const lblLaunch = document.getElementById('lbl-prm-launch');
    if (slLaunch) {
        slLaunch.addEventListener('input', () => {
            sakuraiParams.launchBaseScale = parseFloat(slLaunch.value);
            if (lblLaunch) lblLaunch.innerText = `${sakuraiParams.launchBaseScale.toFixed(1)}x`;
        });
    }

    const slCamLead = document.getElementById('prm-camlead');
    const lblCamLead = document.getElementById('lbl-prm-camlead');
    if (slCamLead) {
        slCamLead.addEventListener('input', () => {
            sakuraiParams.cameraLeadDist = parseFloat(slCamLead.value);
            if (lblCamLead) lblCamLead.innerText = `${sakuraiParams.cameraLeadDist.toFixed(1)}m`;
        });
    }

    // 🤖 AI 3Dモデリング プロンプトコピーボタン
    document.getElementById('btn-copy-ai-3d-prompt')?.addEventListener('click', copyAi3dPromptToClipboard);

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
    let dragStartTime = 0;

    const startDrag = (cx, cy) => {
        dragging = true;
        dragStartTime = performance.now();
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

        // D-11 スティックの急速なはじき入力（フリック）を検知
        if (clamped >= 26 && (performance.now() - dragStartTime) < 140) {
            smashFlickWindow = performance.now() + 260;
        }
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



