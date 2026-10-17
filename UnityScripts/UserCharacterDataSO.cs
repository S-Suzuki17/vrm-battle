using UnityEngine;

namespace UnlimitedSurvival
{
    /// <summary>
    /// ScriptableObjectとしてアセット保存可能なキャラクターデータ
    /// </summary>
    [CreateAssetMenu(fileName = "NewUserCharacterData", menuName = "SurvivalBattle/User Character Data")]
    public class UserCharacterDataSO : ScriptableObject
    {
        [Header("Character Data")]
        public UserCharacterData data = new UserCharacterData();

        public void SetData(UserCharacterData newData)
        {
            data = newData;
        }
    }
}
