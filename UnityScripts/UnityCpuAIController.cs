using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace UnlimitedSurvival
{
    public enum CpuCombatStyle
    {
        MeleeMartialArtist,
        MeleeHeavyWarrior,
        SniperPsychic,
        SniperRifleman
    }

    /// <summary>
    /// Unity 6 向け：アンリミテッドクルーズ風 CPU 戦闘 AI コントローラー
    /// SurvivalGameManager から渡される CpuBattleStats と連動し、
    /// 4つの戦闘スタイル（拳法家・重戦士・サイキッカー・スナイパー）と装備モデルを切り替えて自律戦闘を行います。
    /// </summary>
    [DisallowMultipleComponent]
    public class UnityCpuAIController : MonoBehaviour, IBattleEntity
    {
        [Header("=== Current Scaled Stats ===")]
        [SerializeField] private CpuCombatStyle combatStyle = CpuCombatStyle.MeleeHeavyWarrior;
        [SerializeField] private float maxHp = 1000f;
        [SerializeField] private float currentHp = 1000f;
        [SerializeField] private float attackPower = 50f;
        [SerializeField] private float maxPosture = 100f;
        [SerializeField] private float attackInterval = 1.8f;
        [SerializeField] private float moveSpeed = 4.6f;

        [Header("=== References ===")]
        [SerializeField] private Transform targetPlayer;
        [SerializeField] private float arenaRadiusLimit = 9.8f;
        [SerializeField] private Image cpuHpBarFill;
        [SerializeField] private TextMeshProUGUI cpuNameLabel;

        [Header("=== Weapon Models (Blender Assets) ===")]
        [SerializeField] private GameObject greatswordObject;
        [SerializeField] private GameObject sniperRifleObject;
        [SerializeField] private GameObject psyOrbObject;

        private float _aiTimer = 0f;
        private float _attackCooldown = 0f;
        private bool _isGuarding = false;
        private float _animTime = 0f;
        private Vector3 _velocity;

        private Transform _leftArm;
        private Transform _rightArm;
        private Transform _leftLeg;
        private Transform _rightLeg;

        public float CurrentHp => currentHp;
        public float MaxHp => maxHp;

        private void Awake()
        {
            _leftArm = FindDeepChild(transform, "LeftArm");
            _rightArm = FindDeepChild(transform, "RightArm");
            _leftLeg = FindDeepChild(transform, "LeftLeg");
            _rightLeg = FindDeepChild(transform, "RightLeg");
        }

        private void Start()
        {
            if (SurvivalGameManager.Instance != null)
            {
                SurvivalGameManager.Instance.RegisterCurrentCpu(gameObject);
            }
            RefreshWeaponVisibility();
            UpdateHud();
        }

        private void Update()
        {
            if (currentHp <= 0f || targetPlayer == null) return;

            float dt = Time.deltaTime;
            _aiTimer -= dt;
            _attackCooldown -= dt;

            Vector3 toPlayer = targetPlayer.position - transform.position;
            toPlayer.y = 0f;
            float dist = toPlayer.magnitude;

            if (toPlayer.sqrMagnitude > 0.01f)
            {
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(toPlayer), 10f * dt);
            }

            bool isMoving = false;
            bool isMelee = combatStyle == CpuCombatStyle.MeleeMartialArtist || combatStyle == CpuCombatStyle.MeleeHeavyWarrior;

            if (isMelee)
            {
                if (dist > 2.1f)
                {
                    transform.position += toPlayer.normalized * (moveSpeed * dt);
                    isMoving = true;
                    _isGuarding = false;
                }
                else
                {
                    if (_attackCooldown <= 0f)
                    {
                        ExecuteAttack(dist, 2.5f, attackPower);
                        _attackCooldown = attackInterval;
                    }
                    else
                    {
                        _isGuarding = (combatStyle == CpuCombatStyle.MeleeHeavyWarrior) && Random.value < 0.4f;
                    }
                }
            }
            else
            {
                // 狙撃型：近すぎたら後退、遠距離から射撃
                if (dist < 3.5f)
                {
                    transform.position -= toPlayer.normalized * (moveSpeed * 0.9f * dt);
                    isMoving = true;
                }
                else if (_attackCooldown <= 0f)
                {
                    ExecuteAttack(dist, 9.0f, attackPower * 0.85f);
                    _attackCooldown = attackInterval;
                }
            }

            transform.position += _velocity * dt;
            _velocity = Vector3.Lerp(_velocity, Vector3.zero, 8f * dt);
            ClampToArena();
            UpdateProceduralAnimation(dt, isMoving);
        }

        private void ExecuteAttack(float currentDist, float maxRange, float dmg)
        {
            if (currentDist <= maxRange && targetPlayer != null)
            {
                IBattleEntity playerEntity = targetPlayer.GetComponent<IBattleEntity>();
                playerEntity?.TakeDamage(dmg);
            }
        }

        private void UpdateProceduralAnimation(float dt, bool isMoving)
        {
            _animTime += dt * 9f;
            if (_leftLeg != null && _rightLeg != null)
            {
                float swing = isMoving ? Mathf.Sin(_animTime) * 28f : 0f;
                _leftLeg.localRotation = Quaternion.Euler(swing, 0f, 0f);
                _rightLeg.localRotation = Quaternion.Euler(-swing, 0f, 0f);
            }
            if (psyOrbObject != null && psyOrbObject.activeSelf)
            {
                psyOrbObject.transform.Rotate(Vector3.up, 120f * dt, Space.Self);
            }
        }

        private void RefreshWeaponVisibility()
        {
            if (greatswordObject != null) greatswordObject.SetActive(combatStyle == CpuCombatStyle.MeleeHeavyWarrior);
            if (sniperRifleObject != null) sniperRifleObject.SetActive(combatStyle == CpuCombatStyle.SniperRifleman);
            if (psyOrbObject != null) psyOrbObject.SetActive(combatStyle == CpuCombatStyle.SniperPsychic);
        }

        private void ClampToArena()
        {
            Vector3 flat = new Vector3(transform.position.x, 0f, transform.position.z);
            if (flat.magnitude > arenaRadiusLimit)
            {
                flat = flat.normalized * arenaRadiusLimit;
                transform.position = new Vector3(flat.x, transform.position.y, flat.z);
            }
        }

        private void UpdateHud()
        {
            if (cpuHpBarFill != null) cpuHpBarFill.fillAmount = currentHp / maxHp;
        }

        // ========================================================
        // IBattleEntity 実装 (SurvivalGameManager から呼出)
        // ========================================================
        public void Heal(float amount)
        {
            currentHp = Mathf.Min(maxHp, currentHp + amount);
            UpdateHud();
        }

        public void FullHeal()
        {
            currentHp = maxHp;
            UpdateHud();
        }

        public void TakeDamage(float amount)
        {
            if (currentHp <= 0f) return;

            float finalDmg = _isGuarding ? amount * 0.25f : amount;
            currentHp = Mathf.Max(0f, currentHp - finalDmg);
            UpdateHud();

            // ノックバック
            if (targetPlayer != null)
            {
                Vector3 knockDir = (transform.position - targetPlayer.position).normalized;
                knockDir.y = 0f;
                _velocity = knockDir * 4.5f;
            }

            if (currentHp <= 0f)
            {
                // ボス撃破 -> SurvivalGameManager の OnPlayerWin() によって次ラウンドへ＆自身に新ステータスが注入される
                SurvivalGameManager.Instance?.OnPlayerWin();
            }
        }

        public void ApplyStats(CpuBattleStats stats)
        {
            if (stats == null) return;

            maxHp = stats.maxHp;
            currentHp = stats.currentHp;
            attackPower = stats.attackPower;
            maxPosture = stats.maxPosture;
            attackInterval = stats.attackInterval;
            moveSpeed = stats.moveSpeed;

            // ランダムな戦闘スタイルに切り替え
            combatStyle = (CpuCombatStyle)Random.Range(0, 4);
            RefreshWeaponVisibility();

            // リスポーン位置へ移動
            transform.position = new Vector3(4.2f, 0f, 0f);
            _velocity = Vector3.zero;

            if (cpuNameLabel != null)
            {
                cpuNameLabel.text = $"{stats.cpuName} [{combatStyle}]";
            }

            UpdateHud();
        }

        public void SetTargetPlayer(Transform playerTransform)
        {
            targetPlayer = playerTransform;
        }

        private static Transform FindDeepChild(Transform parent, string targetName)
        {
            foreach (Transform child in parent)
            {
                if (child.name == targetName) return child;
                Transform found = FindDeepChild(child, targetName);
                if (found != null) return found;
            }
            return null;
        }
    }
}
