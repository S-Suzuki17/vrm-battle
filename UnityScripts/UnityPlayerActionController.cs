using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace UnlimitedSurvival
{
    /// <summary>
    /// Unity 6 向け：アンリミテッドクルーズ風・リアルタイム3Dアクション プレイヤーコントローラー
    /// WASD移動、ロックオンTPSカメラ、3段コンボ、SP必殺技カットイン、ガード、ステップ回避、
    /// および Blender製モデルのプロシージャル関節アニメーションと IBattleEntity を統合します。
    /// </summary>
    [DisallowMultipleComponent]
    public class UnityPlayerActionController : MonoBehaviour, IBattleEntity
    {
        [Header("=== Health & SP Resource ===")]
        [SerializeField] private float maxHp = 1000f;
        [SerializeField] private float currentHp = 1000f;
        [SerializeField] private float maxSp = 100f;
        [SerializeField] private float currentSp = 50f;
        [SerializeField] private float spRegenPerSec = 4.0f;

        [Header("=== Movement & Combat Parameters ===")]
        [SerializeField] private float moveSpeed = 6.5f;
        [SerializeField] private float dodgeSpeed = 14.0f;
        [SerializeField] private float arenaRadiusLimit = 9.8f;
        [SerializeField] private Transform targetCpu;
        [SerializeField] private Camera mainCamera;

        [Header("=== HUD Bindings (Optional) ===")]
        [SerializeField] private Image hpBarFill;
        [SerializeField] private Image spBarFill;
        [SerializeField] private GameObject guardShieldVisual;

        // 内部ステート
        private Vector3 _velocity;
        private int _comboStep = 0;
        private float _stateTimer = 0f;
        private bool _isGuarding = false;
        private bool _isInvincible = false;
        private bool _lockOn = true;
        private float _animTime = 0f;

        // Blenderモデルの関節Transformキャッシュ
        private Transform _leftArm;
        private Transform _rightArm;
        private Transform _leftLeg;
        private Transform _rightLeg;

        public float CurrentHp => currentHp;
        public float MaxHp => maxHp;
        public float CurrentSp => currentSp;
        public float MaxSp => maxSp;

        private void Awake()
        {
            currentHp = maxHp;
            if (mainCamera == null) mainCamera = Camera.main;

            // Blender製モデル (fighter_cyber_knight) の関節ノードを自動検索
            _leftArm = FindDeepChild(transform, "LeftArm");
            _rightArm = FindDeepChild(transform, "RightArm");
            _leftLeg = FindDeepChild(transform, "LeftLeg");
            _rightLeg = FindDeepChild(transform, "RightLeg");
        }

        private void Update()
        {
            if (currentHp <= 0f) return;

            float dt = Time.deltaTime;

            // SP自然回復
            currentSp = Mathf.Min(maxSp, currentSp + spRegenPerSec * dt);

            if (_stateTimer > 0f)
            {
                _stateTimer -= dt;
            }

            HandleCombatInput();
            HandleMovement(dt);
            UpdateProceduralAnimation(dt);
            UpdateTpsCamera(dt);
            UpdateHud();
        }

        private void HandleCombatInput()
        {
            if (Input.GetKeyDown(KeyCode.Q))
            {
                _lockOn = !_lockOn;
            }

            // ガード (Space)
            _isGuarding = Input.GetKey(KeyCode.Space) && _stateTimer <= 0f;
            if (guardShieldVisual != null)
            {
                guardShieldVisual.SetActive(_isGuarding);
            }

            if (_isGuarding || _stateTimer > 0f) return;

            // ステップ回避 (L or LeftShift)
            if ((Input.GetKeyDown(KeyCode.L) || Input.GetKeyDown(KeyCode.LeftShift)) && currentSp >= 15f)
            {
                StartCoroutine(PerformDodgeRoutine());
                return;
            }

            // 必殺技 (K or Mouse1)
            if ((Input.GetKeyDown(KeyCode.K) || Input.GetMouseButtonDown(1)) && currentSp >= 50f)
            {
                StartCoroutine(PerformSpecialAttackRoutine());
                return;
            }

            // 通常攻撃3段コンボ (J or Z or Mouse0)
            if (Input.GetKeyDown(KeyCode.J) || Input.GetKeyDown(KeyCode.Z) || Input.GetMouseButtonDown(0))
            {
                PerformComboAttack();
            }
        }

        private void HandleMovement(float dt)
        {
            if (_isGuarding || _stateTimer > 0.1f)
            {
                transform.position += _velocity * dt;
                _velocity = Vector3.Lerp(_velocity, Vector3.zero, 10f * dt);
                ClampToArena();
                return;
            }

            float h = Input.GetAxisRaw("Horizontal");
            float v = Input.GetAxisRaw("Vertical");
            Vector3 inputDir = new Vector3(h, 0f, v).normalized;

            if (inputDir.sqrMagnitude > 0.01f)
            {
                Vector3 camForward = mainCamera != null ? Vector3.ProjectOnPlane(mainCamera.transform.forward, Vector3.up).normalized : Vector3.forward;
                Vector3 camRight = mainCamera != null ? Vector3.ProjectOnPlane(mainCamera.transform.right, Vector3.up).normalized : Vector3.right;
                Vector3 moveDir = (camRight * inputDir.x + camForward * inputDir.z).normalized;

                transform.position += moveDir * (moveSpeed * dt);

                if (_lockOn && targetCpu != null)
                {
                    Vector3 toTarget = targetCpu.position - transform.position;
                    toTarget.y = 0f;
                    if (toTarget.sqrMagnitude > 0.01f)
                        transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(toTarget), 12f * dt);
                }
                else
                {
                    transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(moveDir), 12f * dt);
                }
            }

            transform.position += _velocity * dt;
            _velocity = Vector3.Lerp(_velocity, Vector3.zero, 8f * dt);
            ClampToArena();
        }

        private void PerformComboAttack()
        {
            _comboStep = (_comboStep % 3) + 1;
            _stateTimer = 0.32f;

            if (targetCpu != null)
            {
                Vector3 toCpu = targetCpu.position - transform.position;
                toCpu.y = 0f;
                if (toCpu.sqrMagnitude > 0.01f)
                {
                    transform.rotation = Quaternion.LookRotation(toCpu);
                    _velocity = toCpu.normalized * 5.0f;
                }

                float dist = Vector3.Distance(transform.position, targetCpu.position);
                if (dist <= 2.6f)
                {
                    float dmg = _comboStep == 1 ? 45f : (_comboStep == 2 ? 65f : 120f);
                    IBattleEntity cpuEntity = targetCpu.GetComponent<IBattleEntity>();
                    cpuEntity?.TakeDamage(dmg);
                    currentSp = Mathf.Min(maxSp, currentSp + 10f);
                }
            }
        }

        private IEnumerator PerformSpecialAttackRoutine()
        {
            currentSp -= 50f;
            _stateTimer = 1.1f;
            _isInvincible = true;

            // アンリミ風ヒットストップ＆カメラズーム演出
            Time.timeScale = 0.2f;
            yield return new WaitForSecondsRealtime(0.45f);
            Time.timeScale = 1.0f;

            if (targetCpu != null)
            {
                Vector3 toCpu = targetCpu.position - transform.position;
                toCpu.y = 0f;
                if (toCpu.sqrMagnitude > 0.01f)
                    transform.rotation = Quaternion.LookRotation(toCpu);

                float dist = Vector3.Distance(transform.position, targetCpu.position);
                if (dist <= 6.5f)
                {
                    IBattleEntity cpuEntity = targetCpu.GetComponent<IBattleEntity>();
                    cpuEntity?.TakeDamage(380f);
                }
            }

            yield return new WaitForSeconds(0.5f);
            _isInvincible = false;
        }

        private IEnumerator PerformDodgeRoutine()
        {
            currentSp -= 15f;
            _stateTimer = 0.28f;
            _isInvincible = true;

            float h = Input.GetAxisRaw("Horizontal");
            float v = Input.GetAxisRaw("Vertical");
            Vector3 dodgeDir = new Vector3(h, 0f, v).normalized;
            if (dodgeDir.sqrMagnitude < 0.01f) dodgeDir = -transform.forward;

            _velocity = dodgeDir * dodgeSpeed;
            yield return new WaitForSeconds(0.28f);
            _isInvincible = false;
        }

        private void UpdateProceduralAnimation(float dt)
        {
            _animTime += dt * 10f;
            bool isMoving = Mathf.Abs(Input.GetAxisRaw("Horizontal")) > 0.05f || Mathf.Abs(Input.GetAxisRaw("Vertical")) > 0.05f;

            if (_leftLeg != null && _rightLeg != null)
            {
                float legSwing = isMoving ? Mathf.Sin(_animTime) * 32f : 0f;
                _leftLeg.localRotation = Quaternion.Euler(legSwing, 0f, 0f);
                _rightLeg.localRotation = Quaternion.Euler(-legSwing, 0f, 0f);
            }

            if (_leftArm != null && _rightArm != null)
            {
                if (_stateTimer > 0f)
                {
                    float atkSwing = Mathf.Sin(_stateTimer * 25f) * 75f;
                    _rightArm.localRotation = Quaternion.Euler(-60f - atkSwing, 0f, 0f);
                }
                else if (_isGuarding)
                {
                    _leftArm.localRotation = Quaternion.Euler(-55f, 35f, 0f);
                    _rightArm.localRotation = Quaternion.Euler(-55f, -35f, 0f);
                }
                else
                {
                    float armSwing = isMoving ? -Mathf.Sin(_animTime) * 24f : Mathf.Sin(_animTime * 0.25f) * 4f;
                    _leftArm.localRotation = Quaternion.Euler(armSwing, 0f, 0f);
                    _rightArm.localRotation = Quaternion.Euler(-armSwing, 0f, 0f);
                }
            }
        }

        private void UpdateTpsCamera(float dt)
        {
            if (mainCamera == null || targetCpu == null) return;

            Vector3 midPoint = (transform.position + targetCpu.position) * 0.5f;
            Vector3 dirFromTarget = (transform.position - targetCpu.position).normalized;
            if (dirFromTarget.sqrMagnitude < 0.01f) dirFromTarget = - Vector3.forward;

            Vector3 desiredCamPos = transform.position + dirFromTarget * 4.5f + Vector3.up * 2.8f;
            mainCamera.transform.position = Vector3.Lerp(mainCamera.transform.position, desiredCamPos, 8f * dt);
            mainCamera.transform.LookAt(midPoint + Vector3.up * 1.1f);
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
            if (hpBarFill != null) hpBarFill.fillAmount = currentHp / maxHp;
            if (spBarFill != null) spBarFill.fillAmount = currentSp / maxSp;
        }

        // ========================================================
        // IBattleEntity 実装
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
            if (_isInvincible || currentHp <= 0f) return;

            float finalDmg = _isGuarding ? amount * 0.15f : amount;
            currentHp = Mathf.Max(0f, currentHp - finalDmg);
            currentSp = Mathf.Min(maxSp, currentSp + 8f);
            UpdateHud();

            if (currentHp <= 0f)
            {
                SurvivalGameManager.Instance?.OnPlayerLose();
            }
        }

        public void ApplyStats(CpuBattleStats stats)
        {
            // プレイヤー側では未使用（インターフェース互換）
        }

        public void SetTargetCpu(Transform cpuTransform)
        {
            targetCpu = cpuTransform;
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
