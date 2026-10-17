using System;
using UnityEngine;

namespace UnlimitedSurvival
{
    /// <summary>
    /// ユーザーがインポートしたキャラクターのメタデータとテクスチャ情報を保持するデータクラス
    /// </summary>
    [Serializable]
    public class UserCharacterData
    {
        [Header("Character Identity")]
        [Tooltip("キャラクターの名前")]
        public string characterName = "Custom Hero";

        [Tooltip("キャラクターのテーマカラー")]
        public Color themeColor = Color.cyan;

        [Header("Imported Assets")]
        [Tooltip("読み込んだ画像テクスチャ (Texture2D)")]
        public Texture2D characterTexture;

        [Tooltip("UIや2D表示用に生成したスプライト")]
        public Sprite characterSprite;

        [Tooltip("インポート元のファイルパス")]
        public string sourceFilePath;

        /// <summary>
        /// 有効なテクスチャデータが存在するかどうか
        /// </summary>
        public bool IsValid => characterTexture != null;

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
        }

        /// <summary>
        /// メモリ解放（シーン遷移時や破棄時）
        /// </summary>
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
