# Sinya Loyalty Dashboard v7 — Optimized (Static Front‑End)

純前端版本，可直接部署 GitHub Pages。包含：
- 年度 KPI 即時計算（Sales, GP, 回饋, 刷卡費, 活動成本, Net）
- 會員等級 × 年均消費（回饋依現金/刷卡占比加權）
- 欣幣 + 生日 + UGC + 推薦回饋
- 活動歸因（uplift% + 成本）
- 逐月 KPI 係數模板（均衡 / 電競旺季 / 雙11），自動分配目標
- 逐月實際填報，紅/黃/綠達成率膠囊
- 匯出逐月 KPI CSV、情境 JSON；LocalStorage 存檔/載入
- 簡單最佳化建議（補足毛利缺口：提升 ASP 或增加會員數）

## 使用
1. 本地打開 `index.html` 即可離線操作。
2. **存檔**：保存在瀏覽器 LocalStorage。
3. **下載逐月 KPI CSV**：生成 `monthly_kpi.csv`。
4. **情境 JSON 匯出/匯入**：跨裝置複製情境。
5. **部署**：整個資料夾上傳到 GitHub Pages。

> 註：此為純前端快速方案，若需與 ERP/DB 串接，建議新增 API 層。
