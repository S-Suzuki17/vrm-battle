#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace UnlimitedSurvival.Editor
{
    /// <summary>
    /// Unity 6 エディタ拡張：
    /// メニュー「UnlimitedSurvival > Build Colosseum Survival Scene (One-Click)」から
    /// Blender製3Dモデル（コロシアム・ファイター・武器）、ライティング、大海原、
    /// アンリミ風HUD、SurvivalGameManager、UserCharacterLoaderを全自動でシーンにセットアップします。
    /// </summary>
    public static class UnlimitedColosseumSceneBuilder
    {
        [MenuItem("UnlimitedSurvival/Build Colosseum Survival Scene (One-Click)", false, 1)]
        public static void BuildColosseumScene()
        {
            // 1. 環境・フォグ・大海原・照明の構築
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = new Color(0.29f, 0.40f, 0.48f);
            RenderSettings.fogDensity = 0.018f;

            // 大海原
            GameObject ocean = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ocean.name = "Unlimited_Ocean";
            ocean.transform.position = new Vector3(0f, -8.0f, 0f);
            ocean.transform.localScale = new Vector3(35f, 1f, 35f);
            Renderer oceanRend = ocean.GetComponent<Renderer>();
            if (oceanRend != null)
            {
                Material oceanMat = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"));
                oceanMat.color = new Color(0.07f, 0.22f, 0.34f);
                oceanRend.sharedMaterial = oceanMat;
            }

            // 2. Blender製コロシアムステージの配置
            GameObject arenaPrefab = FindAssetModel("colosseum_arena");
            GameObject arenaInstance;
            if (arenaPrefab != null)
            {
                arenaInstance = (GameObject)PrefabUtility.InstantiatePrefab(arenaPrefab);
                arenaInstance.name = "Colosseum_Arena_Blender";
            }
            else
            {
                arenaInstance = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                arenaInstance.name = "Colosseum_Arena_Fallback";
                arenaInstance.transform.localScale = new Vector3(22f, 0.4f, 22f);
                arenaInstance.transform.position = new Vector3(0f, -0.2f, 0f);
            }

            // 4基の篝火ポイントライト配置
            float[] torchAngles = { 30f, 150f, 210f, 330f };
            GameObject lightsRoot = new GameObject("Torch_Lights");
            foreach (float deg in torchAngles)
            {
                float rad = deg * Mathf.Deg2Rad;
                float r = 11.0f * 0.75f;
                GameObject tLightObj = new GameObject($"TorchPointLight_{deg}");
                tLightObj.transform.SetParent(lightsRoot.transform);
                tLightObj.transform.position = new Vector3(Mathf.Cos(rad) * r, 2.2f, Mathf.Sin(rad) * r);
                Light pt = tLightObj.AddComponent<Light>();
                pt.type = LightType.Point;
                pt.color = new Color(1.0f, 0.45f, 0.1f);
                pt.intensity = 3.5f;
                pt.range = 9.0f;
            }

            // 3. プレイヤー & CPU キャラクターの生成 (Blender fighter_cyber_knight)
            GameObject fighterPrefab = FindAssetModel("fighter_cyber_knight");

            GameObject playerObj = fighterPrefab != null
                ? (GameObject)PrefabUtility.InstantiatePrefab(fighterPrefab)
                : GameObject.CreatePrimitive(PrimitiveType.Capsule);
            playerObj.name = "Player_Fighter";
            playerObj.tag = "Player";
            playerObj.transform.position = new Vector3(-4.2f, 0f, 0f);
            playerObj.transform.rotation = Quaternion.Euler(0f, 90f, 0f);
            var playerCtrl = playerObj.AddComponent<UnityPlayerActionController>();

            GameObject cpuObj = fighterPrefab != null
                ? (GameObject)PrefabUtility.InstantiatePrefab(fighterPrefab)
                : GameObject.CreatePrimitive(PrimitiveType.Capsule);
            cpuObj.name = "CPU_Boss_Fighter";
            cpuObj.transform.position = new Vector3(4.2f, 0f, 0f);
            cpuObj.transform.rotation = Quaternion.Euler(0f, -90f, 0f);
            var cpuCtrl = cpuObj.AddComponent<UnityCpuAIController>();

            // Blender製武器をCPUにアタッチ
            AttachWeaponIfFound(cpuObj.transform, "weapon_greatsword", new Vector3(0.45f, 1.05f, 0.25f));
            AttachWeaponIfFound(cpuObj.transform, "weapon_sniper_rifle", new Vector3(0.40f, 1.00f, 0.35f));
            AttachWeaponIfFound(cpuObj.transform, "weapon_psy_orb", new Vector3(0.0f, 1.45f, 0.55f));

            playerCtrl.SetTargetCpu(cpuObj.transform);
            cpuCtrl.SetTargetPlayer(playerObj.transform);

            // 4. アンリミ風 HUD Canvas & SurvivalGameManager & UserCharacterLoader の構築
            GameObject managersObj = new GameObject("[UnlimitedSurvival_Managers]");
            managersObj.AddComponent<UserCharacterLoader>();
            var survivalMgr = managersObj.AddComponent<SurvivalGameManager>();

            CreateHudCanvas(survivalMgr, playerObj, cpuObj);

            Selection.activeGameObject = managersObj;
            Debug.Log("🎉 [UnlimitedColosseumSceneBuilder] 古代遺跡コロシアム・サバイバルシーンの自動構築が完了しました！");
        }

        private static GameObject FindAssetModel(string modelName)
        {
            string[] guids = AssetDatabase.FindAssets($"{modelName} t:Model");
            if (guids != null && guids.Length > 0)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[0]);
                return AssetDatabase.LoadAssetAtPath<GameObject>(path);
            }
            return null;
        }

        private static GameObject AttachWeaponIfFound(Transform parent, string modelName, Vector3 localOffset)
        {
            GameObject prefab = FindAssetModel(modelName);
            if (prefab == null) return null;

            GameObject weapon = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            weapon.name = modelName;
            weapon.transform.SetParent(parent, false);
            weapon.transform.localPosition = localOffset;
            return weapon;
        }

        private static void CreateHudCanvas(SurvivalGameManager mgr, GameObject playerObj, GameObject cpuObj)
        {
            GameObject canvasObj = new GameObject("Unlimited_HUD_Canvas");
            Canvas canvas = canvasObj.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            CanvasScaler scaler = canvasObj.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            canvasObj.AddComponent<GraphicRaycaster>();

            // 連勝数テキスト (画面上部中央)
            GameObject streakObj = new GameObject("WinStreak_TMP");
            streakObj.transform.SetParent(canvasObj.transform, false);
            RectTransform rt = streakObj.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(0.5f, 1f);
            rt.anchorMax = new Vector2(0.5f, 1f);
            rt.anchoredPosition = new Vector2(0f, -45f);
            rt.sizeDelta = new Vector2(450f, 70f);

            TextMeshProUGUI tmp = streakObj.AddComponent<TextMeshProUGUI>();
            tmp.text = "0 連勝中！";
            tmp.fontSize = 42;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.color = new Color(1f, 0.83f, 0.16f);

            // SerializedObject経由でプライベートSerializeFieldにも自動バインド
            SerializedObject so = new SerializedObject(mgr);
            so.FindProperty("winStreakText").objectReferenceValue = tmp;
            so.FindProperty("playerTargetObject").objectReferenceValue = playerObj;
            so.FindProperty("currentCpuTargetObject").objectReferenceValue = cpuObj;
            so.ApplyModifiedProperties();
        }
    }
}
#endif
