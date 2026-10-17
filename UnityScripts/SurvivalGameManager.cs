using System;
using TMPro;
using UnityEngine;
using UnityEngine.Events;

namespace UnlimitedSurvival
{
    /// <summary>
    /// 体力引き継ぎモード
    /// </summary>
    public enum HealthCarryOverMode
    {
        [Tooltip("毎試合、最大HPまで全回復します")]
        FullHeal,

        [Tooltip("前回の残り体力を引き継ぎつつ、一定割合のボーナス回復を行います")]
        PercentageBonusHeal,

        [Tooltip("回復なしで前回の残り体力をそのまま引き継ぎます")]
        CarryOverAsIs
    }

    /// <summary>
    /// ② CPU連勝サバイバル・ゲームフロー管理者
    /// タイマンバトルで連勝を目指すモードの全体進行、連勝数管理、
    /// CPUの段階的強化、体力引き継ぎ、PlayerPrefsハイスコア保存を統括します。
    /// </summary>
    [DisallowMultipleComponent]
    public class SurvivalGameManager : MonoBehaviour
    {
        public static SurvivalGameManager Instance { get; private set; }

        private const string HIGH_SCORE_KEY = "Survival_MaxWinStreak_HighScore";

        [Header("=== Win Streak State ===")]
        [Tooltip("現在の連勝数")]
        [SerializeField] private int currentWinStreak = 0;

        [Tooltip("過去最高連勝記録 (PlayerPrefs保存)")]
        [SerializeField] private int highScoreWinStreak = 0;

        [Header("=== Health Carry-Over Settings (体力引き継ぎ) ===")]
        [Tooltip("次試合への体力引き継ぎ方式")]
        [SerializeField] private HealthCarryOverMode healthCarryOverMode = HealthCarryOverMode.PercentageBonusHeal;

        [Tooltip("PercentageBonusHeal時の回復割合（例: 0.35 = 最大体力の35%回復）")]
        [Range(0.0f, 1.0f)]
        [SerializeField] private float bonusHealPercentage = 0.35f;

        [Header("=== CPU Difficulty Scaling (段階的強化) ===")]
        [Tooltip("CPUの基本最大体力")]
        [SerializeField] private float baseCpuMaxHp = 1000f;

        [Tooltip("1勝ごとのCPU体力乗算倍率 (例: 1.08 = 毎勝 +8%)")]
        [SerializeField] private float hpScalePerWin = 1.08f;

        [Tooltip("CPUの基本攻撃力")]
        [SerializeField] private float baseCpuAttack = 50f;

        [Tooltip("1勝ごとのCPU攻撃力乗算倍率 (例: 1.05 = 毎勝 +5%)")]
        [SerializeField] private float attackScalePerWin = 1.05f;

        [Tooltip("CPUの基本体幹・耐久ゲージ")]
        [SerializeField] private float baseCpuPosture = 100f;

        [Tooltip("1勝ごとの体幹乗算倍率")]
        [SerializeField] private float postureScalePerWin = 1.06f;

        [Tooltip("CPUの初期攻撃クールダウン・インターバル (秒)")]
        [SerializeField] private float baseCpuAttackInterval = 2.0f;

        [Tooltip("1勝ごとに短縮される攻撃インターバル (秒)")]
        [SerializeField] private float intervalReductionPerWin = 0.05f;

        [Tooltip("攻撃インターバルの最小限界値 (秒)")]
        [SerializeField] private float minAttackInterval = 0.6f;

        [Tooltip("CPUのベース名候補リスト")]
        [SerializeField] private string[] cpuNamePool = new string[]
        {
            "ドロイド", "シャドウ", "ギガント", "ハンター", "ヴァルキリー", "プロトタイプ", "バーサーカー", "アサシン"
        };

        [Header("=== UI References (TextMeshPro) ===")]
        [Tooltip("バトル中画面の連勝数表示テキスト")]
        [SerializeField] private TextMeshProUGUI winStreakText;

        [Tooltip("バトル中画面の最高記録テキスト（任意）")]
        [SerializeField] private TextMeshProUGUI highScoreText;

        [Tooltip("ゲームオーバー時に開くリザルトパネル")]
        [SerializeField] private GameObject resultPanel;

        [Tooltip("リザルト画面の最終連勝数テキスト")]
        [SerializeField] private TextMeshProUGUI resultFinalStreakText;

        [Tooltip("リザルト画面の最高連勝数テキスト")]
        [SerializeField] private TextMeshProUGUI resultHighScoreText;

        [Tooltip("自己ベスト更新時に点灯するバッジ/オブジェクト（任意）")]
        [SerializeField] private GameObject newRecordBadge;

        [Header("=== Target References ===")]
        [Tooltip("プレイヤーのIBattleEntityコンポーネントを持つGameObject（未指定時は自動検索）")]
        [SerializeField] private GameObject playerTargetObject;

        [Tooltip("現在対戦中のCPUのIBattleEntityコンポーネントを持つGameObject")]
        [SerializeField] private GameObject currentCpuTargetObject;

        [Header("=== Unity Events (外部スクリプト連携) ===")]
        public UnityEvent<int> onWinStreakUpdated;
        public UnityEvent<CpuBattleStats> onNextCpuPrepared;
        public UnityEvent<int, bool> onGameOverEvent; // (finalStreak, isNewRecord)

        // C# イベント
        public event Action<int> OnWinStreakChanged;
        public event Action<CpuBattleStats> OnCpuSpawned;
        public event Action<int, bool> OnGameOver;

        // 現在の対戦CPUステータス
        public CpuBattleStats CurrentCpuStats { get; private set; }

        public int CurrentWinStreak => currentWinStreak;
        public int HighScoreWinStreak => highScoreWinStreak;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            LoadHighScore();
        }

        private void Start()
        {
            UpdateWinStreakUI();

            if (resultPanel != null)
            {
                resultPanel.SetActive(false);
            }

            // 初回CPUステータス生成
            PrepareNextCpu();
        }

        // ========================================================
        // 1. バトル決着イベントAPI (外部の戦闘ロジックから呼出)
        // ========================================================

        /// <summary>
        /// プレイヤーがCPUに勝利（ボス死亡判定時など）した際に呼び出します。
        /// </summary>
        public void OnPlayerWin()
        {
            currentWinStreak++;
            Debug.Log($"[SurvivalGameManager] Player Won! Current Win Streak: {currentWinStreak}");

            // ハイスコア更新チェック
            bool isNewRecord = false;
            if (currentWinStreak > highScoreWinStreak)
            {
                highScoreWinStreak = currentWinStreak;
                SaveHighScore();
                isNewRecord = true;
                Debug.Log($"[SurvivalGameManager] 🎉 New High Score: {highScoreWinStreak} wins!");
            }

            // UI更新
            UpdateWinStreakUI();
            OnWinStreakChanged?.Invoke(currentWinStreak);
            onWinStreakUpdated?.Invoke(currentWinStreak);

            // プレイヤーの体力引き継ぎ・回復処理
            ProcessPlayerHealthCarryOver();

            // 次の強化CPUステータスを計算・準備
            PrepareNextCpu();
        }

        /// <summary>
        /// プレイヤーが敗北（プレイヤー死亡判定時など）した際に呼び出します。
        /// </summary>
        public void OnPlayerLose()
        {
            Debug.Log($"[SurvivalGameManager] Player Lost! Final Streak: {currentWinStreak}");

            bool isNewRecord = false;
            if (currentWinStreak > highScoreWinStreak)
            {
                highScoreWinStreak = currentWinStreak;
                SaveHighScore();
                isNewRecord = true;
            }

            // リザルト画面表示
            ShowGameOverResult(isNewRecord);

            OnGameOver?.Invoke(currentWinStreak, isNewRecord);
            onGameOverEvent?.Invoke(currentWinStreak, isNewRecord);
        }

        // ========================================================
        // 2. プレイヤー体力引き継ぎロジック
        // ========================================================

        private void ProcessPlayerHealthCarryOver()
        {
            IBattleEntity playerEntity = ResolveBattleEntity(playerTargetObject, "Player");
            if (playerEntity == null) return;

            switch (healthCarryOverMode)
            {
                case HealthCarryOverMode.FullHeal:
                    playerEntity.FullHeal();
                    Debug.Log("[SurvivalGameManager] Player HP completely restored (FullHeal).");
                    break;

                case HealthCarryOverMode.PercentageBonusHeal:
                    float healAmount = playerEntity.MaxHp * bonusHealPercentage;
                    playerEntity.Heal(healAmount);
                    Debug.Log($"[SurvivalGameManager] Player HP healed by bonus {healAmount} ({bonusHealPercentage * 100}%).");
                    break;

                case HealthCarryOverMode.CarryOverAsIs:
                    Debug.Log("[SurvivalGameManager] Player HP carried over as is.");
                    break;
            }
        }

        // ========================================================
        // 3. CPUの段階的強化 (Scale Difficulty)
        // ========================================================

        /// <summary>
        /// 連勝数に応じて次に登場するCPUのステータスを計算・発行します。
        /// </summary>
        public CpuBattleStats PrepareNextCpu()
        {
            string chosenName = "Cpu Enemy";
            if (cpuNamePool != null && cpuNamePool.Length > 0)
            {
                chosenName = cpuNamePool[UnityEngine.Random.Range(0, cpuNamePool.Length)];
            }

            CurrentCpuStats = CpuBattleStats.CalculateScaledStats(
                currentWinStreak,
                chosenName,
                baseCpuMaxHp,
                hpScalePerWin,
                baseCpuAttack,
                attackScalePerWin,
                baseCpuPosture,
                postureScalePerWin,
                baseCpuAttackInterval,
                intervalReductionPerWin,
                minAttackInterval
            );

            Debug.Log($"[SurvivalGameManager] Prepared CPU: {CurrentCpuStats.cpuName} | HP: {CurrentCpuStats.maxHp} | Atk: {CurrentCpuStats.attackPower} | Interval: {CurrentCpuStats.attackInterval:F2}s");

            // 対戦相手のGameObjectにステータスを直接注入
            if (currentCpuTargetObject != null)
            {
                IBattleEntity cpuEntity = currentCpuTargetObject.GetComponent<IBattleEntity>();
                cpuEntity?.ApplyStats(CurrentCpuStats);
            }

            OnCpuSpawned?.Invoke(CurrentCpuStats);
            onNextCpuPrepared?.Invoke(CurrentCpuStats);

            return CurrentCpuStats;
        }

        /// <summary>
        /// 現在対戦中のCPUオブジェクトを参照登録します（動的スポーン時に便利です）
        /// </summary>
        public void RegisterCurrentCpu(GameObject cpuObject)
        {
            currentCpuTargetObject = cpuObject;
            if (CurrentCpuStats != null && currentCpuTargetObject != null)
            {
                IBattleEntity cpuEntity = currentCpuTargetObject.GetComponent<IBattleEntity>();
                cpuEntity?.ApplyStats(CurrentCpuStats);
            }
        }

        // ========================================================
        // 4. UI更新 & ハイスコア保存
        // ========================================================

        private void UpdateWinStreakUI()
        {
            if (winStreakText != null)
            {
                winStreakText.text = $"{currentWinStreak} 連勝中！";
            }

            if (highScoreText != null)
            {
                highScoreText.text = $"BEST: {highScoreWinStreak} 連勝";
            }
        }

        private void ShowGameOverResult(bool isNewRecord)
        {
            if (resultPanel != null)
            {
                resultPanel.SetActive(true);
            }

            if (resultFinalStreakText != null)
            {
                resultFinalStreakText.text = $"{currentWinStreak} 連勝";
            }

            if (resultHighScoreText != null)
            {
                resultHighScoreText.text = $"{highScoreWinStreak} 連勝";
            }

            if (newRecordBadge != null)
            {
                newRecordBadge.SetActive(isNewRecord);
            }
        }

        /// <summary>
        /// サバイバルモードを最初からやり直す（リトライ）
        /// </summary>
        public void RestartSurvival()
        {
            currentWinStreak = 0;
            UpdateWinStreakUI();

            if (resultPanel != null)
            {
                resultPanel.SetActive(false);
            }

            // プレイヤー全回復
            IBattleEntity playerEntity = ResolveBattleEntity(playerTargetObject, "Player");
            playerEntity?.FullHeal();

            PrepareNextCpu();
            Debug.Log("[SurvivalGameManager] Survival Mode Restarted.");
        }

        private void LoadHighScore()
        {
            highScoreWinStreak = PlayerPrefs.GetInt(HIGH_SCORE_KEY, 0);
        }

        private void SaveHighScore()
        {
            PlayerPrefs.SetInt(HIGH_SCORE_KEY, highScoreWinStreak);
            PlayerPrefs.Save();
        }

        private IBattleEntity ResolveBattleEntity(GameObject explicitObj, string tag)
        {
            if (explicitObj != null)
            {
                return explicitObj.GetComponent<IBattleEntity>();
            }

            GameObject found = GameObject.FindWithTag(tag);
            return found != null ? found.GetComponent<IBattleEntity>() : null;
        }
    }
}
