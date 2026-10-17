using UnityEngine;
using UnityEngine.Events;

namespace UnlimitedSurvival
{
    /// <summary>
    /// IBattleEntity を実装したサンプルコンポーネント。
    /// プレイヤーやCPUにアタッチして、HP管理やSurvivalGameManagerとの疎結合な連携を行います。
    /// </summary>
    public class SampleBattleEntity : MonoBehaviour, IBattleEntity
    {
        [Header("=== Health Status ===")]
        [SerializeField] private float maxHp = 1000f;
        [SerializeField] private float currentHp = 1000f;

        [Header("=== CPU Specific Parameters (CPU時のみ) ===")]
        [SerializeField] private bool isCpu = false;
        [SerializeField] private float attackPower = 50f;
        [SerializeField] private float postureGauge = 100f;
        [SerializeField] private float attackInterval = 2.0f;

        [Header("=== Events ===")]
        public UnityEvent<float, float> onHealthChanged; // (current, max)
        public UnityEvent onDied;

        public float CurrentHp => currentHp;
        public float MaxHp => maxHp;
        public float AttackPower => attackPower;
        public float AttackInterval => attackInterval;

        private void Awake()
        {
            currentHp = maxHp;
        }

        private void Start()
        {
            onHealthChanged?.Invoke(currentHp, maxHp);
        }

        public void Heal(float amount)
        {
            currentHp = Mathf.Min(maxHp, currentHp + amount);
            onHealthChanged?.Invoke(currentHp, maxHp);
        }

        public void TakeDamage(float amount)
        {
            currentHp = Mathf.Max(0, currentHp - amount);
            onHealthChanged?.Invoke(currentHp, maxHp);

            if (currentHp <= 0)
            {
                Die();
            }
        }

        public void FullHeal()
        {
            currentHp = maxHp;
            onHealthChanged?.Invoke(currentHp, maxHp);
        }

        public void ApplyStats(CpuBattleStats stats)
        {
            if (stats == null) return;

            maxHp = stats.maxHp;
            currentHp = stats.currentHp;
            attackPower = stats.attackPower;
            postureGauge = stats.maxPosture;
            attackInterval = stats.attackInterval;

            onHealthChanged?.Invoke(currentHp, maxHp);
            Debug.Log($"[SampleBattleEntity] {gameObject.name} applied stats: HP={maxHp}, Atk={attackPower}, Interval={attackInterval:F2}s");
        }

        private void Die()
        {
            onDied?.Invoke();

            if (isCpu)
            {
                // ボス撃破 -> SurvivalGameManagerのOnPlayerWinを呼出
                SurvivalGameManager.Instance?.OnPlayerWin();
            }
            else
            {
                // プレイヤー死亡 -> SurvivalGameManagerのOnPlayerLoseを呼出
                SurvivalGameManager.Instance?.OnPlayerLose();
            }
        }
    }
}
