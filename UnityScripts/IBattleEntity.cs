namespace UnlimitedSurvival
{
    /// <summary>
    /// バトルキャラクターの体力・ステータス操作用インターフェース
    /// </summary>
    public interface IBattleEntity
    {
        float CurrentHp { get; }
        float MaxHp { get; }

        /// <summary>
        /// 体力を回復する
        /// </summary>
        void Heal(float amount);

        /// <summary>
        /// ダメージを受ける
        /// </summary>
        void TakeDamage(float amount);

        /// <summary>
        /// 全回復する
        /// </summary>
        void FullHeal();

        /// <summary>
        /// ステータス（CPU用）を適用する
        /// </summary>
        void ApplyStats(CpuBattleStats stats);
    }
}
