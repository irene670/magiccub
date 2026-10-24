# 名畫方塊解鎖

手機網頁 App：用相機逐面掃描圖案魔術方塊，自動把打亂的圖拼回去，再用 3D 動畫一步步教你還原。

- 線上版：https://irene670.github.io/magiccub/
- `index.html`：可直接部署的單一檔案（由 `src/` 建置）
- `src/engine.js`：方塊模型、自動拼圖、圖庫比對、解法（min2phase，MIT）
- `src/app.src.html`：介面；`python3 src/build.py` 會把 engine、min2phase、示範資料合成 `index.html`

兩種辨識方式（設定裡切換）：
1. **自動拼圖**（預設）：不用事先建檔，依指示掃 6 面（前→右→後→左→上→下），程式依接縫連續性推回每塊貼紙的位置。
2. **圖庫比對**：先用還原好的方塊校正一次，之後掃描順序不拘。

## 後台（admin.html）
- 網址：https://irene670.github.io/magiccub/admin.html （前台沒有連結）
- 預設帳號 admin / 密碼 0000（可在後台「設定」修改）
- 圖片與方塊資料存在 **gh-pages 分支** 的 `library/`：`library/images/<id>.jpg`、`library/cubes/<代碼>.json`、`library/index.json`
- 前台用 `?d=<代碼>` 載入該方塊
- 注意：後台直接寫入 gh-pages 分支，之後更新程式**不可再 force-push 到 gh-pages**，要用合併的方式更新。
