# 3D自作キャラバトル（VRM対応版）開発計画

## 概要
ユーザー提供のバトルロジック・UIプロトタイプをベースに、Three.jsによる3Dバトルアリーナ空間をドッキングし、ローカルVRMキャラクターのドラッグ＆ドロップ読み込み機能、およびGitHubリポジトリへの自動プッシュと確認環境の提供を行う。

## アーキテクチャ & 状態遷移（Mermaid図）

```mermaid
flowchart TD
    subgraph UI ["ユーザーインターフェース (UI)"]
        Title["タイトル・連勝・ハイスコア表示"]
        BattleCanvas["3D Battle Screen (Three.js WebGLRenderer)"]
        DropZone["VRM ドロップゾーン (ファイル選択/D&D)"]
        ActionArea["アクションボタン (勝つ / 負ける)"]
        ResultArea["ゲームオーバー & X共有 & リトライ"]
        Disclaimer["免責事項"]
    end

    subgraph Logic ["ゲームロジック & データ"]
        State["状態管理 (currentWins, highScore)"]
        CPUGen["CPU自動生成 (4タイプ × 武器有無)"]
        Storage["localStorage (最高記録)"]
        Share["X Web Intent 連携"]
    end

    subgraph ThreeJS ["3Dグラフィックス (Three.js & three-vrm)"]
        Scene["Scene, Camera, Light, Stage/Grid"]
        PlayerObj["プレイヤー (初期: ダミーロボ -> VRMロード時差し替え)"]
        CPUObj["CPU (スタイルに応じたカラー・武器・シルエット)"]
        BattleAnim["勝敗・アクション演出 (ノックバック, エフェクト)"]
    end

    DropZone -->|VRMファイル (ローカル読込)| PlayerObj
    ActionArea -->|勝つ/負ける| State
    State --> CPUGen
    State --> Storage
    State --> ResultArea
    CPUGen --> CPUObj
    State --> BattleAnim
    BattleAnim --> BattleCanvas
```

## タスク進捗

- [ ] 1. プロジェクト構造の設計と基本ファイル配置 (`index.html`, `main.js`, `style.css`)
- [ ] 2. Three.js 3D空間の構築（ステージ、カメラ、ライティング、アニメーションループ）
- [ ] 3. プレイヤーとCPUの3Dモデル表現（スタイリッシュなプレースホルダーモデル、CPUスタイルごとの武器・カラー反映）
- [ ] 4. VRMのドラッグ＆ドロップおよびファイル選択によるローカル読み込み機能の実装 (`@pixiv/three-vrm`)
- [ ] 5. 勝敗アクション＆リアクション演出（アタック、ノックバック、リスポーン演出、XシェアURLバグ修正）
- [ ] 6. ローカルテストサーバーの起動と動作検証
- [ ] 7. Git初期化およびGitHubリモートリポジトリ (`S-Suzuki17/vrm-battle`) 作成・プッシュ
