# Unity 6 & Blender 5.2 向け「アンリミテッド・タイマンコロシアム & サバイバルシステム」

**Blender 5.2.2 LTS** で生成した高精細3Dモデル群（`.fbx` / `.glb`）と、**Unity 6 (6000.2.14f1)** 向けの本格3Dアクション＆サバイバル連勝システム一式です。
メニューから**ワンクリックでシーン全体を自動構築**できるエディタ拡張スクリプトを搭載しています。

---

## 📁 収録スクリプト & 3Dモデル一覧

### 1. Unity 6 C# スクリプト (`UnityScripts/`)
| スクリプト名 | 役割 |
| :--- | :--- |
| [`Editor/UnlimitedColosseumSceneBuilder.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/Editor/UnlimitedColosseumSceneBuilder.cs) | **【ワンクリック自動構築】** メニュー `UnlimitedSurvival > Build Colosseum Survival Scene (One-Click)` から、Blender製コロシアム・ファイター・武器・照明・大海原・HUD・マネージャーを全自動配置します。 |
| [`UnityPlayerActionController.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/UnityPlayerActionController.cs) | **【3Dアクション操作】** WASD移動、ロックオンTPSカメラ、3段コンボ、SP必殺技（スロー演出）、ガード、ステップ回避、Blenderモデルの関節アニメーションを制御。 |
| [`UnityCpuAIController.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/UnityCpuAIController.cs) | **【CPU戦闘AI】** 4スタイル（拳法家・重戦士・サイキッカー・スナイパー）のAI行動とBlender武器モデルの切替、`SurvivalGameManager` の難易度スケーリングと連動。 |
| [`UserCharacterLoader.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/UserCharacterLoader.cs) | **【① 自作キャラ画像インポート】** 外部画像（PNG/JPG）を動的ロードし、URP (`_BaseMap`) / Built-in (`_MainTex`) / Sprite / UI Image へ適用。`DontDestroyOnLoad` でシーン間保持。 |
| [`SurvivalGameManager.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/SurvivalGameManager.cs) | **【② CPU連勝サバイバル管理者】** 連勝数カウント、TextMeshPro表示、体力引き継ぎオプション（全回復/割合ボーナス回復/そのまま）、CPU段階的強化、`PlayerPrefs` ハイスコア保存。 |
| [`CpuBattleStats.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/CpuBattleStats.cs) | 連勝数に応じたCPUパラメータ（最大HP、攻撃力、体幹、攻撃インターバル、移動速度）の指数・乗算計算モデル。 |
| [`UserCharacterData.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/UserCharacterData.cs) / [`UserCharacterDataSO.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/UserCharacterDataSO.cs) | キャラクター情報・テクスチャ保持モデル & `ScriptableObject` アセット定義。 |
| [`IBattleEntity.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/IBattleEntity.cs) / [`SampleBattleEntity.cs`](file:///C:/Users/souta/vrm-battle/UnityScripts/SampleBattleEntity.cs) | 既存のHP・戦闘スクリプトと疎結合に連携するためのインターフェースとサンプル実装。 |

### 2. Blender 5.2 生成 3Dモデル (`assets/models/`)
| モデルファイル (`.fbx` & `.glb`) | 内容 |
| :--- | :--- |
| `colosseum_arena.fbx` / `.glb` | 縦溝彫刻（フルーティング）入りの古代ギリシャ石柱、破断した柱と瓦礫、楔形縁石ブロック、黄金レリーフ紋章、北側アーチ門、4基の篝火台、断崖絶壁の岩盤ベース。 |
| `fighter_cyber_knight.fbx` / `.glb` | ベベル装甲・発光V字バイザー・胸部リアクターコア・肩アーマーを備え、`LeftArm`, `RightArm`, `LeftLeg`, `RightLeg` の関節ピボット階層を持つアーマーファイター。 |
| `weapon_greatsword.fbx` / `.glb` | 重戦士用の発光コア入り大剣（バスターブレード）。 |
| `weapon_sniper_rifle.fbx` / `.glb` | スナイパー用のプラズマレール・デュアルスコープ付きロングレンジライフル。 |
| `weapon_psy_orb.fbx` / `.glb` | サイキッカー用の二重ジャイロリング＆クリスタル念動ビット。 |

---

## 🚀 Unity 6 でのワンクリック導入手順

1. `assets/models/` 内の `.fbx` ファイルと、`UnityScripts/` フォルダ一式を、Unity 6 プロジェクトの `Assets/` 内にドラッグ＆ドロップします。
2. Unity 上部メニューバーから **`UnlimitedSurvival > Build Colosseum Survival Scene (One-Click)`** をクリックします。
3. 自動的にシーン内に古代遺跡コロシアム、大海原、篝火ライト、プレイヤー、CPU、HUDキャンバス、および `SurvivalGameManager` / `UserCharacterLoader` がセットアップされ、そのまま Play ボタンで遊べます！
