using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace UnlimitedSurvival
{
    /// <summary>
    /// Unity 6 向け：アンリミテッドクルーズ風・リアルタイム3Dアクション プレイヤーコントローラー（強化版）
    /// - 全身フルボディ関節モーション（格闘構え、前傾ダッシュ、1段目袈裟斬り、2段目360度回転斬り、3段目空中サマーソルト兜割り）
    /// - 残像ステップ回避（ホログラム残像生成）
    /// - プロシージャル多層3Dエフェクト生成（クレセント斬撃波、物理飛散ヒットスパーク、地面クレーター衝撃波＆光柱）
    /// - ヒットストップ＆カメラシェイク演出
    /// </summary>
    [DisallowMultipleComponent]
    public class UnityPlayerActionController : MonoBehaviour, IBattleEntity
    {
        [Header("=== Health & SP Resource ===")]
        [SerializeField] private float maxHp = 1000f;
        [SerializeField] private float currentHp = 1000f;
        [SerializeField] private float maxSp = 100f;
        [SerializeField] private float currentSp = 50f;
        [SerializeField] private float spRegenPerSec = 5.5f;

        [Header("=== Movement & Combat Parameters ===")]
        [SerializeField] private float moveSpeed = 6.8f;
        [SerializeField] private float dodgeSpeed = 15.0f;
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
        private float _stateDuration = 0.4f;
        private string _actionState = "idle"; // idle, attack, special, dodge
        private bool _isGuarding = false;
        private bool _isInvincible = false;
        private bool _lockOn = true;
        private float _animTime = 0f;
        private float _cameraShake = 0f;

        // Blenderモデルの関節Transformキャッシュ
        private Transform _torso;
        private Transform _leftArm;
        private Transform _rightArm;
        private Transform _leftLeg;
        private Transform _rightLeg;
        private float _baseY;

        public float CurrentHp => currentHp;
        public float MaxHp => maxHp;
        public float CurrentSp => currentSp;
        public float MaxSp => maxSp;

        private void Awake()
        {
            currentHp = maxHp;
            _baseY = transform.position.y;
            if (mainCamera == null) mainCamera = Camera.main;

            // Blender製モデル (fighter_* / custom_characters) の関節ノードを自動検索
            _torso = FindDeepChild(transform, "Torso");
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
                if (_stateTimer <= 0f)
                {
                    _actionState = "idle";
                }
            }

            HandleCombatInput();
            HandleMovement(dt);
            UpdateFullBodyAnimation(dt);
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
                StartCoroutine(PerformComboAttackRoutine());
            }
        }

        private void HandleMovement(float dt)
        {
            if (_isGuarding || _stateTimer > 0.08f)
            {
                transform.position += _velocity * dt;
                _velocity = Vector3.Lerp(_velocity, Vector3.zero, 9f * dt);
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
                        transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(toTarget), 14f * dt);
                }
                else
                {
                    transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(moveDir), 14f * dt);
                }
            }

            transform.position += _velocity * dt;
            _velocity = Vector3.Lerp(_velocity, Vector3.zero, 8f * dt);
            ClampToArena();
        }

        /// <summary>
        /// 3段コンボ攻撃（1段目：踏み込み袈裟斬り、2段目：360度回転斬り、3段目：ジャンプ宙返り叩きつけスラム）
        /// </summary>
        private IEnumerator PerformComboAttackRoutine()
        {
            _comboStep = (_comboStep % 3) + 1;
            _actionState = "attack";
            _stateDuration = _comboStep == 3 ? 0.56f : (_comboStep == 2 ? 0.44f : 0.36f);
            _stateTimer = _stateDuration;

            if (targetCpu != null)
            {
                Vector3 toCpu = targetCpu.position - transform.position;
                toCpu.y = 0f;
                if (toCpu.sqrMagnitude > 0.01f)
                {
                    transform.rotation = Quaternion.LookRotation(toCpu);
                    float lungeSpeed = _comboStep == 3 ? 8.5f : (_comboStep == 2 ? 6.5f : 5.2f);
                    _velocity = toCpu.normalized * lungeSpeed;
                }
            }

            // クレセント斬撃エフェクト生成
            Color slashCol = _comboStep == 3 ? new Color(1f, 0.78f, 0f) : (_comboStep == 2 ? new Color(0f, 1f, 0.8f) : new Color(0f, 0.9f, 1f));
            float tiltZ = _comboStep == 1 ? -28f : (_comboStep == 2 ? 8f : 85f);
            SpawnCrescentSlashVFX(transform.position + Vector3.up * 1.15f + transform.forward * 1.1f, transform.rotation * Quaternion.Euler(0f, 0f, tiltZ), slashCol, _comboStep == 3 ? 1.8f : 1.25f);

            // インパクトタイミングまで少し待機
            yield return new WaitForSeconds(_comboStep == 3 ? 0.22f : 0.1f);

            if (_comboStep == 3)
            {
                SpawnGroundSlamVFX(transform.position + transform.forward * 1.6f, new Color(1f, 0.65f, 0f), 1.4f);
                _cameraShake = 0.35f;
            }

            if (targetCpu != null)
            {
                float dist = Vector3.Distance(transform.position, targetCpu.position);
                if (dist <= 3.1f)
                {
                    float dmg = _comboStep == 1 ? 50f : (_comboStep == 2 ? 75f : 140f);
                    IBattleEntity cpuEntity = targetCpu.GetComponent<IBattleEntity>();
                    cpuEntity?.TakeDamage(dmg);
                    currentSp = Mathf.Min(maxSp, currentSp + 12f);

                    // ヒットスパーク＆ヒットストップ
                    SpawnHitSparkBurstVFX(targetCpu.position + Vector3.up * 1.1f, slashCol, _comboStep == 3 ? 40 : 24);
                    _cameraShake = _comboStep == 3 ? 0.45f : 0.2f;
                    StartCoroutine(TriggerHitStopRoutine(_comboStep == 3 ? 0.075f : 0.035f));
                }
            }
        }

        private IEnumerator PerformSpecialAttackRoutine()
        {
            currentSp -= 50f;
            _actionState = "special";
            _stateDuration = 1.15f;
            _stateTimer = _stateDuration;
            _isInvincible = true;

            // アンリミ風ヒットストップ＆カメラズーム演出
            Time.timeScale = 0.18f;
            yield return new WaitForSecondsRealtime(0.45f);
            Time.timeScale = 1.0f;

            Vector3 targetPos = targetCpu != null ? targetCpu.position : (transform.position + transform.forward * 4f);
            if (targetCpu != null)
            {
                Vector3 toCpu = targetCpu.position - transform.position;
                toCpu.y = 0f;
                if (toCpu.sqrMagnitude > 0.01f)
                    transform.rotation = Quaternion.LookRotation(toCpu);
            }

            // 超ド派手必殺技エフェクト（光柱＋多層衝撃波＋スパークバースト）
            SpawnGroundSlamVFX(targetPos, new Color(0f, 0.95f, 1f), 2.5f);
            SpawnHitSparkBurstVFX(targetPos + Vector3.up * 1.2f, new Color(1f, 0.85f, 0.2f), 55);
            _cameraShake = 0.65f;

            if (targetCpu != null && Vector3.Distance(transform.position, targetCpu.position) <= 7.5f)
            {
                IBattleEntity cpuEntity = targetCpu.GetComponent<IBattleEntity>();
                cpuEntity?.TakeDamage(380f);
                StartCoroutine(TriggerHitStopRoutine(0.11f));
            }

            yield return new WaitForSeconds(0.55f);
            _isInvincible = false;
        }

        private IEnumerator PerformDodgeRoutine()
        {
            currentSp -= 15f;
            _actionState = "dodge";
            _stateDuration = 0.3f;
            _stateTimer = _stateDuration;
            _isInvincible = true;

            float h = Input.GetAxisRaw("Horizontal");
            float v = Input.GetAxisRaw("Vertical");
            Vector3 dodgeDir = new Vector3(h, 0f, v).normalized;
            if (dodgeDir.sqrMagnitude < 0.01f) dodgeDir = -transform.forward;

            _velocity = dodgeDir * dodgeSpeed;

            // 残像ホログラムを3体生成
            for (int i = 0; i < 3; i++)
            {
                SpawnAfterimageGhost();
                yield return new WaitForSeconds(0.08f);
            }

            _isInvincible = false;
        }

        private IEnumerator TriggerHitStopRoutine(float duration)
        {
            float prevScale = Time.timeScale;
            Time.timeScale = 0.05f;
            yield return new WaitForSecondsRealtime(duration);
            Time.timeScale = prevScale > 0.5f ? 1.0f : prevScale;
        }

        /// <summary>
        /// 全身多関節アニメーション（腰・胸・両腕・両脚＋空中回転・スピン補間）
        /// </summary>
        private void UpdateFullBodyAnimation(float dt)
        {
            _animTime += dt * 11f;
            bool isMoving = Mathf.Abs(Input.GetAxisRaw("Horizontal")) > 0.05f || Mathf.Abs(Input.GetAxisRaw("Vertical")) > 0.05f;
            float p = Mathf.Clamp01(1f - (_stateTimer / Mathf.Max(0.01f, _stateDuration)));

            float jumpOffset = 0f;

            if (_actionState == "attack")
            {
                if (_comboStep == 1)
                {
                    // 1段目：溜めから斜め袈裟斬り
                    float swing = p < 0.25f ? Mathf.Lerp(0f, -1f, p / 0.25f) : Mathf.Lerp(-1f, 1.2f, (p - 0.25f) / 0.75f);
                    if (_torso != null) _torso.localRotation = Quaternion.Euler(15f * swing, -42f * swing, 0f);
                    if (_rightArm != null) _rightArm.localRotation = Quaternion.Euler(-95f + 135f * swing, 0f, -25f);
                    if (_leftArm != null) _leftArm.localRotation = Quaternion.Euler(25f, 0f, 25f);
                }
                else if (_comboStep == 2)
                {
                    // 2段目：360度高速トルネード回転斬り
                    if (_torso != null) _torso.localRotation = Quaternion.Euler(18f, p * 360f, 0f);
                    if (_rightArm != null) _rightArm.localRotation = Quaternion.Euler(-85f, 0f, -70f);
                    if (_leftArm != null) _leftArm.localRotation = Quaternion.Euler(-70f, 0f, 65f);
                }
                else
                {
                    // 3段目：ジャンプ＋360度前方宙返りサマーソルト兜割り
                    jumpOffset = Mathf.Sin(p * Mathf.PI) * 2.1f;
                    if (_torso != null) _torso.localRotation = Quaternion.Euler(p * 360f, 0f, 0f);
                    if (_rightArm != null) _rightArm.localRotation = Quaternion.Euler(-160f + p * 230f, 0f, -10f);
                    if (_leftArm != null) _leftArm.localRotation = Quaternion.Euler(-140f + p * 200f, 0f, 10f);
                }
            }
            else if (_actionState == "dodge")
            {
                jumpOffset = Mathf.Sin(p * Mathf.PI) * 0.55f;
                if (_torso != null) _torso.localRotation = Quaternion.Euler(25f, p * 360f, 0f);
            }
            else if (_isGuarding)
            {
                if (_torso != null) _torso.localRotation = Quaternion.Euler(10f, 0f, 0f);
                if (_leftArm != null) _leftArm.localRotation = Quaternion.Euler(-65f, 38f, 0f);
                if (_rightArm != null) _rightArm.localRotation = Quaternion.Euler(-65f, -38f, 0f);
            }
            else
            {
                // 構えアイドル＆前傾ダッシュ
                if (_torso != null)
                {
                    float lean = isMoving ? 20f : 6f;
                    float twist = isMoving ? Mathf.Sin(_animTime) * 14f : -15f;
                    _torso.localRotation = Quaternion.Lerp(_torso.localRotation, Quaternion.Euler(lean, twist, 0f), 14f * dt);
                }

                if (_leftLeg != null && _rightLeg != null)
                {
                    float legSwing = isMoving ? Mathf.Sin(_animTime) * 42f : 12f;
                    _leftLeg.localRotation = Quaternion.Euler(legSwing, 0f, 0f);
                    _rightLeg.localRotation = Quaternion.Euler(-legSwing, 0f, 0f);
                }

                if (_leftArm != null && _rightArm != null)
                {
                    float armSwing = isMoving ? -Mathf.Sin(_animTime) * 36f : Mathf.Sin(_animTime * 0.35f) * 6f;
                    _leftArm.localRotation = Quaternion.Euler(-25f + armSwing, 0f, 16f);
                    _rightArm.localRotation = Quaternion.Euler(-30f - armSwing, 0f, -16f);
                }
            }

            Vector3 pos = transform.position;
            pos.y = _baseY + jumpOffset;
            transform.position = pos;
        }

        private void UpdateTpsCamera(float dt)
        {
            if (mainCamera == null || targetCpu == null) return;

            Vector3 midPoint = (transform.position + targetCpu.position) * 0.5f;
            Vector3 dirFromTarget = (transform.position - targetCpu.position).normalized;
            if (dirFromTarget.sqrMagnitude < 0.01f) dirFromTarget = -Vector3.forward;

            Vector3 desiredCamPos = transform.position + dirFromTarget * 4.6f + Vector3.up * 2.7f;
            if (_cameraShake > 0.005f)
            {
                desiredCamPos += Random.insideUnitSphere * _cameraShake;
                _cameraShake = Mathf.Lerp(_cameraShake, 0f, 10f * dt);
            }

            mainCamera.transform.position = Vector3.Lerp(mainCamera.transform.position, desiredCamPos, 9f * dt);
            mainCamera.transform.LookAt(midPoint + Vector3.up * 1.1f);
        }

        // ========================================================
        // プロシージャル 3D エフェクト生成（外部アセット不要で即動作）
        // ========================================================
        private void SpawnCrescentSlashVFX(Vector3 pos, Quaternion rot, Color col, float scale)
        {
            GameObject slashObj = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            slashObj.name = "CrescentSlashVFX";
            Destroy(slashObj.GetComponent<Collider>());
            slashObj.transform.position = pos;
            slashObj.transform.rotation = rot;
            slashObj.transform.localScale = new Vector3(scale * 2.2f, 0.03f, scale * 2.2f);

            Renderer rend = slashObj.GetComponent<Renderer>();
            rend.material = CreateEmissiveMaterial(col);
            StartCoroutine(ScaleAndDestroyRoutine(slashObj.transform, slashObj.transform.localScale * 1.65f, 0.24f));
        }

        private void SpawnHitSparkBurstVFX(Vector3 center, Color col, int count)
        {
            for (int i = 0; i < count; i++)
            {
                GameObject spark = GameObject.CreatePrimitive(PrimitiveType.Cube);
                spark.name = "HitSpark";
                Destroy(spark.GetComponent<Collider>());
                spark.transform.position = center;
                spark.transform.localScale = new Vector3(0.05f, 0.05f, 0.35f);
                Vector3 vel = Random.onUnitSphere * Random.Range(5f, 14f);
                vel.y = Mathf.Abs(vel.y) + 2f;
                spark.transform.rotation = Quaternion.LookRotation(vel);
                spark.GetComponent<Renderer>().material = CreateEmissiveMaterial(i % 3 == 0 ? Color.white : col);
                StartCoroutine(MoveSparkRoutine(spark.transform, vel, 0.32f));
            }
        }

        private void SpawnGroundSlamVFX(Vector3 pos, Color col, float scale)
        {
            // 光の柱
            GameObject pillar = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pillar.name = "SlamLightPillar";
            Destroy(pillar.GetComponent<Collider>());
            pillar.transform.position = new Vector3(pos.x, _baseY + 3.5f, pos.z);
            pillar.transform.localScale = new Vector3(scale * 1.2f, 3.5f, scale * 1.2f);
            pillar.GetComponent<Renderer>().material = CreateEmissiveMaterial(col);
            StartCoroutine(ScaleAndDestroyRoutine(pillar.transform, new Vector3(scale * 2.4f, 4.5f, scale * 2.4f), 0.42f));
        }

        private void SpawnAfterimageGhost()
        {
            GameObject ghost = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            ghost.name = "AfterimageGhost";
            Destroy(ghost.GetComponent<Collider>());
            ghost.transform.position = transform.position + Vector3.up * 0.9f;
            ghost.transform.rotation = transform.rotation;
            ghost.transform.localScale = new Vector3(0.65f, 0.9f, 0.65f);
            ghost.GetComponent<Renderer>().material = CreateEmissiveMaterial(new Color(0f, 0.9f, 1f, 0.5f));
            StartCoroutine(ScaleAndDestroyRoutine(ghost.transform, ghost.transform.localScale * 0.85f, 0.25f));
        }

        private static Material CreateEmissiveMaterial(Color col)
        {
            Shader s = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Material m = new Material(s);
            m.color = col;
            m.EnableKeyword("_EMISSION");
            m.SetColor("_EmissionColor", col * 2.5f);
            return m;
        }

        private IEnumerator ScaleAndDestroyRoutine(Transform tr, Vector3 targetScale, float duration)
        {
            Vector3 startScale = tr.localScale;
            float t = 0f;
            while (t < duration && tr != null)
            {
                t += Time.deltaTime;
                tr.localScale = Vector3.Lerp(startScale, targetScale, t / duration);
                yield return null;
            }
            if (tr != null) Destroy(tr.gameObject);
        }

        private IEnumerator MoveSparkRoutine(Transform tr, Vector3 vel, float duration)
        {
            float t = 0f;
            while (t < duration && tr != null)
            {
                float dt = Time.deltaTime;
                t += dt;
                vel.y -= 24f * dt;
                tr.position += vel * dt;
                tr.localScale = Vector3.Lerp(tr.localScale, Vector3.zero, t / duration);
                yield return null;
            }
            if (tr != null) Destroy(tr.gameObject);
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
            _cameraShake = _isGuarding ? 0.12f : 0.28f;
            UpdateHud();

            if (currentHp <= 0f)
            {
                SurvivalGameManager.Instance?.OnPlayerLose();
            }
        }

        public void ApplyStats(CpuBattleStats stats)
        {
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
