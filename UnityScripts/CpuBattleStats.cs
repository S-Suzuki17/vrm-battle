using System;
using UnityEngine;

namespace UnlimitedSurvival
{
    /// <summary>
    /// 連勝数に応じて強化されるCPU（ボス）の戦闘ステータス
    /// </summary>
    [Serializable]
    public class CpuBattleStats
    {
        [Header("Status")]
        [Tooltip("CPUのレベル（連勝数+1）")]
        public int level = 1;

        [Tooltip("CPUの名称")]
        public string cpuName = "Droid Warrior";

        [Tooltip("最大体力 (Max HP)")]
        public float maxHp = 1000f;

        [Tooltip("現在の体力")]
        public float currentHp = 1000f;

        [Tooltip("攻撃力倍率 / 基本ダメージ")]
        public float attackPower = 50f;

        [Tooltip("体幹・耐久ゲージ (Posture)")]
        public float maxPosture = 100f;

        [Tooltip("AIの攻撃頻度・クールダウン間隔 (秒 - 小さいほど素早い)")]
        public float attackInterval = 2.0f;

        [Tooltip("移動速度")]
        public float moveSpeed = 4.5f;

        /// <summary>
        /// 連勝数とベースパラメータからスケールされたステータスを生成
        /// </summary>
        public static CpuBattleStats CalculateScaledStats(
            int winStreak,
            string baseName,
            float baseHp,
            float hpMultiplierPerWin,
            float baseAttack,
            float attackMultiplierPerWin,
            float basePosture,
            float postureMultiplierPerWin,
            float baseInterval,
            float intervalReductionPerWin,
            float minIntervalLimit)
        {
            var stats = new CpuBattleStats();
            stats.level = winStreak + 1;
            stats.cpuName = $"Lv.{stats.level} {baseName}";

            // 指数関数または乗算によるスケーリング
            float hpMult = Mathf.Pow(hpMultiplierPerWin, winStreak);
            float atkMult = Mathf.Pow(attackMultiplierPerWin, winStreak);
            float postMult = Mathf.Pow(postureMultiplierPerWin, winStreak);

            stats.maxHp = Mathf.Round(baseHp * hpMult);
            stats.currentHp = stats.maxHp;

            stats.attackPower = Mathf.Round(baseAttack * atkMult);
            stats.maxPosture = Mathf.Round(basePosture * postMult);

            // 攻撃間隔は短縮（最小リミットあり）
            float reducedInterval = baseInterval - (winStreak * intervalReductionPerWin);
            stats.attackInterval = Mathf.Max(minIntervalLimit, reducedInterval);

            stats.moveSpeed = Mathf.Min(8.0f, 4.5f + (winStreak * 0.15f));

            return stats;
        }
    }
}
