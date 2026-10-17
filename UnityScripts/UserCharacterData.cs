using System;
using UnityEngine;

namespace UnlimitedSurvival
{
    /// <summary>
    /// ユーザーが作成・インポートしたオリジナルキャラクター（1人1体限定）の
    /// キャラデザ・武器・動き（モーション型）・技エフェクト・範囲制限パラメータを保持するデータクラス
    /// </summary>
    [Serializable]
    public class UserCharacterData
    {
        [Header("=== 1. Character Design & Appearance ===")]
        [Tooltip("キャラクターの名前")]
        public string characterName = "PLAYER (自作)";

        [Tooltip("外観スタイル (goggle_hero, ponytail_valkyrie, astral_mage, cyber_brawler, straw_adventurer)")]
        public string stylePreset = "goggle_hero";

        [Tooltip("武器タイプ (rune_greatsword, sword_shield, magic_staff, knuckle_gauntlet, crimson_katana)")]
        public string weaponType = "rune_greatsword";

        [Tooltip("髪・メインカラー")]
        public Color hairColor = new Color(0.12f, 0.56f, 1.0f);

        [Tooltip("衣装カラー")]
        public Color outfitColor = new Color(0.15f, 0.23f, 0.34f);

        [Tooltip("オーラ＆技エフェクトのテーマカラー")]
        public Color themeColor = Color.cyan;

        [Header("=== 2. Motion & VFX Preset ===")]
        [Tooltip("コンボの動き・モーション型 (heavy_buster, speed_rush, acrobat_martial, magic_shooter)")]
        public string motionPreset = "heavy_buster";

        [Tooltip("技エフェクト属性 (plasma_cyan, flame_crimson, holy_astral, void_gravity)")]
        public string vfxElement = "plasma_cyan";

        [Tooltip("必殺奥義のカットイン技名")]
        public string skillName = "⚡ 蒼雷・神速烈空閃 ⚡";

        [Header("=== 3. Bounded Combat Parameters (決められた範囲内パラメータ) ===")]
        [Tooltip("攻撃力倍率 [許容範囲: 0.85x 〜 1.40x]")]
        [Range(0.85f, 1.40f)]
        public float attackMultiplier = 1.05f;

        [Tooltip("通常技範囲・リーチ(m) [許容範囲: 2.4m 〜 4.5m]")]
        [Range(2.4f, 4.5f)]
        public float attackRange = 3.4f;

        [Tooltip("敵をひるませる力・体幹崩し倍率 [許容範囲: 0.80x 〜 1.50x]")]
        [Range(0.80f, 1.50f)]
        public float stunPower = 1.12f;

        [Tooltip("攻撃速度・コンボ連撃速度倍率 [許容範囲: 0.85x 〜 1.35x]")]
        [Range(0.85f, 1.35f)]
        public float attackSpeed = 1.08f;

        [Tooltip("フィールド移動速度 [許容範囲: 5.2 〜 8.0]")]
        [Range(5.2f, 8.0f)]
        public float moveSpeed = 6.3f;

        [Header("=== 4. Imported Assets ===")]
        [Tooltip("読み込んだ画像テクスチャ (Texture2D)")]
        public Texture2D characterTexture;

        [Tooltip("UIや2D表示用に生成したスプライト")]
        public Sprite characterSprite;

        [Tooltip("インポート元のファイルパス")]
        public string sourceFilePath;

        /// <summary>
        /// 有効なテクスチャまたはカスタム設定が存在するかどうか
        /// </summary>
        public bool IsValid => characterTexture != null || !string.IsNullOrEmpty(characterName);

        public UserCharacterData()
        {
        }

        public UserCharacterData(string name, Color color, Texture2D texture, Sprite sprite, string filePath = "")
        {
            characterName = name;
            themeColor = color;
            characterTexture = texture;
            characterSprite = sprite;
            sourceFilePath = filePath;
            ClampParametersToAllowedRange();
        }

        /// <summary>
        /// 各種パラメータをゲームの公平性を保つ「決められた範囲（Min〜Max）」に厳格クランプします。
        /// </summary>
        public void ClampParametersToAllowedRange()
        {
            attackMultiplier = Mathf.Clamp(attackMultiplier, 0.85f, 1.40f);
            attackRange = Mathf.Clamp(attackRange, 2.4f, 4.5f);
            stunPower = Mathf.Clamp(stunPower, 0.80f, 1.50f);
            attackSpeed = Mathf.Clamp(attackSpeed, 0.85f, 1.35f);
            moveSpeed = Mathf.Clamp(moveSpeed, 5.2f, 8.0f);
        }

        public void Dispose()
        {
            if (characterSprite != null)
            {
                UnityEngine.Object.Destroy(characterSprite);
                characterSprite = null;
            }

            if (characterTexture != null)
            {
                UnityEngine.Object.Destroy(characterTexture);
                characterTexture = null;
            }
        }
    }
}
