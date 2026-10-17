using System;
using System.IO;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace UnlimitedSurvival
{
    /// <summary>
    /// ① ユーザーキャラクター画像インポートマネージャー
    /// 外部画像（PNG/JPG）やキャラメイク出力を読み込み、
    /// プレイヤーのMesh (3D) や Sprite (2D/UI) に動的適用し、シーン間で保持します。
    /// </summary>
    [DisallowMultipleComponent]
    public class UserCharacterLoader : MonoBehaviour
    {
        public static UserCharacterLoader Instance { get; private set; }

        [Header("=== Active Character Data (シーン跨ぎ保持) ===")]
        [SerializeField] private UserCharacterData currentCharacterData = new UserCharacterData();

        [Header("=== Auto Apply Settings ===")]
        [Tooltip("シーン遷移時に自動的にプレイヤーオブジェクトを探してテクスチャを適用するか")]
        [SerializeField] private bool autoApplyOnSceneLoad = true;

        [Tooltip("自動適用時に探すプレイヤーのGameObjectタグ")]
        [SerializeField] private string playerTag = "Player";

        [Header("=== Shader Texture Properties ===")]
        [Tooltip("URPの標準メインテクスチャプロパティ名")]
        [SerializeField] private string urpBaseMapProp = "_BaseMap";

        [Tooltip("Built-in standardシェーダーのメインテクスチャプロパティ名")]
        [SerializeField] private string builtinMainTexProp = "_MainTex";

        // シェーダープロパティIDのキャッシュ
        private int _baseMapId;
        private int _mainTexId;

        // イベント
        public event Action<UserCharacterData> OnCharacterLoaded;
        public event Action<GameObject> OnCharacterAppliedToPlayer;

        public UserCharacterData CurrentData => currentCharacterData;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            // プロパティIDの初期化
            _baseMapId = Shader.PropertyToID(urpBaseMapProp);
            _mainTexId = Shader.PropertyToID(builtinMainTexProp);
        }

        private void OnEnable()
        {
            SceneManager.sceneLoaded += OnSceneLoaded;
        }

        private void OnDisable()
        {
            SceneManager.sceneLoaded -= OnSceneLoaded;
        }

        private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
        {
            if (!autoApplyOnSceneLoad || !currentCharacterData.IsValid) return;

            GameObject playerObj = GameObject.FindWithTag(playerTag);
            if (playerObj != null)
            {
                ApplyToPlayerObject(playerObj);
            }
        }

        // ========================================================
        // 1. 外部ファイルからの非同期 / 同期インポート
        // ========================================================

        /// <summary>
        /// ローカルファイルパス（PNG/JPG）から非同期に画像を読み込み、キャラクターデータを構築します。
        /// </summary>
        public async Task<bool> LoadCharacterFromPathAsync(string filePath, string characterName = "Custom Hero", Color? themeColor = null)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                Debug.LogError($"[UserCharacterLoader] File not found: {filePath}");
                return false;
            }

            try
            {
                byte[] fileData = await File.ReadAllBytesAsync(filePath);
                return CreateAndStoreCharacterData(fileData, characterName, themeColor ?? Color.cyan, filePath);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[UserCharacterLoader] Error loading file: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// バイト配列（PNG/JPGデータ）からキャラクターデータを構築します（ゲーム内キャラメイク画面のTexture2D.EncodeToPNG出力等に便利です）。
        /// </summary>
        public bool LoadCharacterFromBytes(byte[] imageData, string characterName = "Custom Hero", Color? themeColor = null)
        {
            if (imageData == null || imageData.Length == 0)
            {
                Debug.LogError("[UserCharacterLoader] Image data is null or empty.");
                return false;
            }

            return CreateAndStoreCharacterData(imageData, characterName, themeColor ?? Color.cyan, "In-Memory Bytes");
        }

        /// <summary>
        /// 既存のTexture2Dインスタンスを直接指定してキャラクターデータとして保持します。
        /// </summary>
        public void SetCharacterFromTexture(Texture2D texture, string characterName = "Custom Hero", Color? themeColor = null)
        {
            if (texture == null)
            {
                Debug.LogError("[UserCharacterLoader] Provided texture is null.");
                return;
            }

            // 既存データの解放
            currentCharacterData.Dispose();

            Sprite sprite = Sprite.Create(
                texture,
                new Rect(0, 0, texture.width, texture.height),
                new Vector2(0.5f, 0.5f),
                100f
            );

            currentCharacterData = new UserCharacterData(characterName, themeColor ?? Color.cyan, texture, sprite, "Direct Texture");
            OnCharacterLoaded?.Invoke(currentCharacterData);
            Debug.Log($"[UserCharacterLoader] Successfully set character from texture: {characterName}");
        }

        private bool CreateAndStoreCharacterData(byte[] fileData, string characterName, Color color, string sourcePath)
        {
            // Unity 6 推奨の動的テクスチャ生成
            Texture2D texture = new Texture2D(2, 2, TextureFormat.RGBA32, true);
            texture.name = $"Tex_{characterName}";

            // ImageConversion による高速デコード
            bool success = ImageConversion.LoadImage(texture, fileData);
            if (!success)
            {
                Debug.LogError("[UserCharacterLoader] Failed to decode image bytes into Texture2D.");
                Destroy(texture);
                return false;
            }

            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            texture.Apply(true, false);

            Sprite sprite = Sprite.Create(
                texture,
                new Rect(0, 0, texture.width, texture.height),
                new Vector2(0.5f, 0.5f),
                100f
            );
            sprite.name = $"Sprite_{characterName}";

            // 既存の古いテクスチャ・スプライトをクリーンアップ
            currentCharacterData.Dispose();

            currentCharacterData = new UserCharacterData(characterName, color, texture, sprite, sourcePath);
            OnCharacterLoaded?.Invoke(currentCharacterData);
            Debug.Log($"[UserCharacterLoader] Successfully loaded character '{characterName}' ({texture.width}x{texture.height})");

            return true;
        }

        // ========================================================
        // 2. プレイヤーモデル / メッシュ / スプライトへの動的適用
        // ========================================================

        /// <summary>
        /// 指定したGameObject（プレイヤー）配下のRenderer/SpriteRenderer/UI Imageを走査し、テクスチャを自動上書きします。
        /// </summary>
        public void ApplyToPlayerObject(GameObject playerRoot)
        {
            if (playerRoot == null || !currentCharacterData.IsValid) return;

            int appliedCount = 0;

            // 1. 3Dメッシュレンダラーへの適用 (MeshRenderer & SkinnedMeshRenderer)
            Renderer[] renderers = playerRoot.GetComponentsInChildren<Renderer>(true);
            foreach (Renderer rend in renderers)
            {
                if (rend is SpriteRenderer spriteRend)
                {
                    ApplyToSpriteRenderer(spriteRend);
                    appliedCount++;
                }
                else
                {
                    ApplyTo3DRenderer(rend);
                    appliedCount++;
                }
            }

            // 2. UI Imageへの適用（ステータス顔アイコンなど）
            Image[] uiImages = playerRoot.GetComponentsInChildren<Image>(true);
            foreach (Image img in uiImages)
            {
                ApplyToUIImage(img);
                appliedCount++;
            }

            OnCharacterAppliedToPlayer?.Invoke(playerRoot);
            Debug.Log($"[UserCharacterLoader] Applied custom character to '{playerRoot.name}' ({appliedCount} components updated).");
        }

        /// <summary>
        /// 3D Renderer (URP/Built-in 両対応) のマテリアルテクスチャを上書きします。
        /// </summary>
        public void ApplyTo3DRenderer(Renderer targetRenderer)
        {
            if (targetRenderer == null || !currentCharacterData.IsValid) return;

            Material mat = targetRenderer.material; // インスタンス化されたマテリアルを取得
            if (mat == null) return;

            bool applied = false;

            // URPシェーダー (_BaseMap)
            if (mat.HasProperty(_baseMapId))
            {
                mat.SetTexture(_baseMapId, currentCharacterData.characterTexture);
                applied = true;
            }

            // Built-in Standardシェーダー (_MainTex)
            if (mat.HasProperty(_mainTexId))
            {
                mat.SetTexture(_mainTexId, currentCharacterData.characterTexture);
                applied = true;
            }

            // カラーも適用可能な場合はテーマカラーを反映
            if (mat.HasProperty("_Color"))
            {
                mat.SetColor("_Color", currentCharacterData.themeColor);
            }
            else if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", currentCharacterData.themeColor);
            }

            if (!applied)
            {
                // フォールバック: mainTexture
                mat.mainTexture = currentCharacterData.characterTexture;
            }
        }

        /// <summary>
        /// 2D SpriteRenderer にスプライトを上書きします。
        /// </summary>
        public void ApplyToSpriteRenderer(SpriteRenderer spriteRenderer)
        {
            if (spriteRenderer == null || !currentCharacterData.IsValid) return;

            spriteRenderer.sprite = currentCharacterData.characterSprite;
            spriteRenderer.color = currentCharacterData.themeColor;
        }

        /// <summary>
        /// uGUI Image にスプライトを上書きします。
        /// </summary>
        public void ApplyToUIImage(Image targetImage)
        {
            if (targetImage == null || !currentCharacterData.IsValid) return;

            targetImage.sprite = currentCharacterData.characterSprite;
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                currentCharacterData?.Dispose();
            }
        }
    }
}
