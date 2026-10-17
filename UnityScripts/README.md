# Unity 6 向け「ユーザー自作キャラのインポート ＆ CPU連勝サバイバルシステム」

Unity 6 (Unity 2023 / 6000.x) に対応した、自作キャラクター画像インポートおよびCPUタイマン連勝サバイバルシステムのC#スクリプト集です。

---

## 📁 スクリプト一覧

| スクリプト名 | 役割 |
| :--- | :--- |
| `UserCharacterLoader.cs` | **① ユーザーキャラクター画像インポートマネージャー**。<br>外部画像（PNG/JPG/バイト列）を動的読み込み、URP/Built-inメッシュやスプライトに適用。`DontDestroyOnLoad` でシーン間保持。 |
| `UserCharacterData.cs` | キャラクターの名前、テーマカラー、Texture2D、Sprite、ファイルパスを保持するデータクラス。 |
| `UserCharacterDataSO.cs` | 上記キャラクターデータを `ScriptableObject` アセットとして保存・エディタ管理するためのラッパー。 |
| `SurvivalGameManager.cs` | **② CPU連勝サバイバル管理者**。<br>連勝カウンター（`CurrentWinStreak`）、TextMeshPro表示、体力引き継ぎオプション（全回復/割合ボーナス回復/そのまま）、CPU難易度スケーリング、`PlayerPrefs`ハイスコア保存。 |
| `CpuBattleStats.cs` | 連勝数に応じて強化されるCPU（ボス）のパラメータ計算クラス（HP、攻撃力、体幹、攻撃頻度）。 |
| `IBattleEntity.cs` | 既存の戦闘スクリプトと疎結合に連携するための体力・ステータス操作インターフェース。 |
| `SampleBattleEntity.cs` | `IBattleEntity` を実装した即座に動作テスト可能なプレイヤー/CPU用のサンプルHPコンポーネント。 |

---

## 🚀 使い方・セットアップ手順

### 1. Unityプロジェクトへの導入
本フォルダ（`UnityScripts`）を、お使いのUnityプロジェクトの `Assets/Scripts/` 等へコピー＆ペーストしてください。

### 2. キャラクター画像のインポート (`UserCharacterLoader`)
1. シーン内の空のGameObject（例: `[CharacterLoader]`）に `UserCharacterLoader.cs` をアタッチします。
2. スクリプトは自動的に `DontDestroyOnLoad` され、シーンを跨いでキャラクターテクスチャを保持します。
3. コードからの呼び出し例:

```csharp
using UnlimitedSurvival;

// 1. ローカルファイルパスから非同期ロード
await UserCharacterLoader.Instance.LoadCharacterFromPathAsync(
    "C:/MyArt/hero.png", 
    "スーパー勇者", 
    Color.yellow
);

// 2. プレイヤーオブジェクト（3Dメッシュやスプライト）に即時適用
GameObject playerObj = GameObject.FindWithTag("Player");
UserCharacterLoader.Instance.ApplyToPlayerObject(playerObj);

// ※ キャラメイク画面等で生成した Texture2D を直接渡すことも可能です
UserCharacterLoader.Instance.SetCharacterFromTexture(myTexture, "キャラメイク勇者");
```

### 3. サバイバルゲーム進行の管理 (`SurvivalGameManager`)
1. シーン内の空のGameObject（例: `[SurvivalGameManager]`）に `SurvivalGameManager.cs` をアタッチします。
2. **インスペクターで各項目を設定:**
   - **UI References**: 画面の `TextMeshProUGUI`（連勝数表示、リザルトパネル等）をドラッグ＆ドロップ。
   - **Health Carry-Over**:
     - `FullHeal`: 毎試合全回復
     - `PercentageBonusHeal`: 残り体力 + 最大体力の〇%（デフォルト35%）
     - `CarryOverAsIs`: 回復なしでそのまま引き継ぎ
   - **CPU Difficulty Scaling**:
     - 1勝ごとのHP乗算倍率（例: `1.08` = +8%）
     - 1勝ごとの攻撃力乗算倍率（例: `1.05` = +5%）
     - 攻撃間隔の短縮値（例: `0.05`秒ずつAIが素早く行動）
3. **既存の勝敗判定からイベント呼び出し:**

```csharp
using UnlimitedSurvival;

// 敵ボスを撃破した時
SurvivalGameManager.Instance.OnPlayerWin();

// プレイヤーが倒された時
SurvivalGameManager.Instance.OnPlayerLose();
```

---

## ⚙️ 既存システムとの連携設計 (`IBattleEntity`)

お手持ちの戦闘スクリプト（`PlayerHealth.cs` や `EnemyBoss.cs` など）に `IBattleEntity` インターフェースを実装するか、または付属の `SampleBattleEntity.cs` をアタッチすることで、体力引き継ぎやCPUステータス注入が完全に自動連携されます。

```csharp
public class MyPlayerHealth : MonoBehaviour, IBattleEntity
{
    public float CurrentHp => myCurrentHp;
    public float MaxHp => myMaxHp;

    public void Heal(float amount) { myCurrentHp = Mathf.Min(myMaxHp, myCurrentHp + amount); }
    public void FullHeal() { myCurrentHp = myMaxHp; }
    public void TakeDamage(float amount) { /* 既存の被弾処理 */ }
    public void ApplyStats(CpuBattleStats stats) { /* CPUステータス適用 */ }
}
```
