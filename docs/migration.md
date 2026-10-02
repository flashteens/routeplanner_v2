# 舊版引用關係與遷移範圍

稽核由正式 `index.php` 出發，追蹤 PHP include/require、設定指定的資料檔、script/link/image、前端 AJAX 及 URL 設定。程式存在或有人可在 console 手動呼叫，不代表它仍由入口使用。

## 仍在使用

```text
index.php
├─ https_redir.php（條件式 HTTPS 轉址）
├─ preview_header.php
│  └─ config_init.php
│     └─ config.ftmc.json / config.trtc.json / config.newisle.json
├─ subwaycal.js.php
│  ├─ auto-complete.min.js
│  ├─ utils.js
│  ├─ mapGUI.js
│  └─ config_init.php
├─ config.map_defs
│  └─ ft_mcsubway.js / trtc_routes.js / newisle_mcsubway.js
├─ ft_hashevents.js
├─ auto-complete.css / ftstar.ico
└─ mapGUI.loadStationDetails（前端 AJAX）
   └─ stationInfo.php / stationInfo_zh.php
```

設定中的目前圖片為 FTMC `Cropped Map 20220328.png`、TRTC `trtc_map_2020.png`、Newisle `newisle_map.jpg`。新 UI 以可編輯 SVG 取代靜態圖及 Canvas 結果，因此不複製舊圖和舊 autocomplete 實作。

車站資訊仍有被呼叫，故保留它的有效站別 HTML 並整合到路網 JSON。`stationInfo_zh.php` 在 require 英文資料與輸出尚未提供中文版的訊息後即 `die`；其後測試程式不會執行，不遷移。樓層資料維持英文原文，三語介面名稱獨立。HTML 在隔離的 sandbox iframe 顯示，不執行原有 inline JavaScript。

## 排除

| 檔案或功能 | 原因 |
| --- | --- |
| `nr_routes.js` | 沒有 `config.nr.json`，無法由入口設定載入；使用者確認排除 NR |
| `betamap.php` | 無入口或有效頁面引用 |
| `debugHeap.php` | 無入口或有效頁面引用 |
| `reso_test.php` | 無入口或有效頁面引用 |
| `fetch_pastebin.php` | 無 PHP / 前端引用 |
| `map.png`、`map_zh.png`、`70_ZOOMED_MAP.png`、`trtc_map_2017.jpg` | 目前設定與可達程式未使用的歷史圖檔 |
| `getStationPlotsAsBenoFormat` 與 Beno 輸出 helper | 只供 console 手動呼叫，不是入口功能；替換為共用 SVG editor |
| 舊式 preview 密碼／session／signout | 新需求明確取消驗證限制；正式 RELEASE 入口不顯示 signout 連結 |
| 舊 GA / Facebook 外部嵌入 | 替換介面不加入舊版追蹤與留言服務 |

Preview 資料夾未從正式入口連入，但使用者明確要求遷移，因此是授權的例外。只取 Preview 的 FTMC 資料及有效車站資訊，作為 `ftmc_preview`；不再複製 Preview 目錄裡的 TRTC、Newisle 或 NR 重複檔案。

## 遷移方法與校驗

`scripts/legacy.js` 在隔離 VM 中讀取 PHP 產生的 JavaScript 部分及其有效相依程式。舊檔只讀，不載入第三方網站或執行 PHP 後端。`scripts/migrate.js` 執行原始建圖邏輯，枚舉 UI 支援的馬匹與快車選項，擷取最終邊權重與方向；重複定義採原本最終覆寫結果。使用轉乘熟悉程度的原始線性變化，保存為資料化斜率，並合併雙向邊。

方向限定的平台、站內走道及站外步行全部保留。原有車站別名會映射到單一 canonical station，官方中英文名稱與代碼保存在站別資料，日語顯示英文。

新路由使用 heap 的 Dijkstra，節點包含站別、路線方向與是否已行經路段。查詢 comparator 為 JSON 中的非負權重及依序比較規則，不使用 eval。各系統保留自己的平手排序規則。

`tests/routing.test.js` 檢查所有 UI 支援選項下展開的邊集合與舊版相同，再用明確案例及固定抽樣站對，比對所有查詢模式的可達性與總時間。`docs/legacy-hashes.json` 保存首次實作前全部舊檔 SHA-256；`npm run verify` 逐檔檢查舊專案保持唯讀。
