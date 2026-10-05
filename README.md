# FTMC Route Planner v2

以 React、Vite 與 Node.js / Express 重寫的地鐵路線小幫手。所有執行時路網資料都是可移植的純 JSON；瀏覽器與 API 使用同一份 Dijkstra 實作。

## 執行

需要 Node.js 22.12 或更新版本。

```sh
npm ci
npm run dev
```

開啟 `http://localhost:3000`。開發模式使用同一個 Express 入口及 Vite middleware。Service Worker 僅在正式 build 啟用。

```sh
npm run build
npm start
```

正式模式亦使用 `http://localhost:3000`。可設定 `PORT`、`HOST`，以及供 sitemap 使用的 `PUBLIC_ORIGIN`。例如部署時設定 `HOST=0.0.0.0`，並由反向代理提供 HTTPS；本機 localhost 也能測試離線功能。

## 系統與網址

| 系統 | 網址 | 顯示里程 | 顯示票價 |
| --- | --- | --- | --- |
| FTMC（預設） | `/?conf=ftmc` | 是 | 否 |
| FTMC Preview | `/?conf=ftmc_preview` | 是 | 否 |
| TRTC | `/?conf=trtc` | 否 | 是 |
| Newisle | `/?conf=newisle` | 是 | 否 |

語言：`lang=en`、`lang=zh`、`lang=ja`，也接受 `zh-TW`。未指定語言時，互動介面依瀏覽器語言選擇。日語介面的車站與路線名稱使用原有英文名稱。

範例：`/?conf=ftmc&lang=zh&from=NV&to=FH`。其他選項為 `criteria`、`transferCoef`、`horseSpeedClass`、`enableExpressCarts`；各系統實際可用值記錄於 JSON 的 `options`。Preview 免密碼，並有獨立標題及紫色主題。

## 查詢與離線

輸入框支援車站名稱、搜尋別名、站碼及 Minecraft 座標，例如 `123 45 678`、`x=123 z=678 y=45`；兩個數字表示 X、Z，Y 預設為 62。結果依符合程度排序，座標搜尋則依三維距離排序。名稱、代碼及距離均在瀏覽器處理。

路線圖支援點選起訖車站、路線篩選、縮放、平移、顯示全圖／旅程、站名開關及途經路段 highlight。可由結果查看車站資訊或複製文字、旅程連結。未勾選顯示站名時，大型站、中型站、小型站分別在 3、6、12 倍縮放後顯示；選中的起訖站、指向或編輯中的車站仍顯示站名。站名的八方向使用一致的距離。

完成首次正式版載入與離線快取後，可斷網重新開啟查詢頁或 editor。快取保留網站資源、三種語言、輕量系統目錄，以及**目前系統的一份路網 JSON**；切換系統會淘汰上一份 JSON，也會釋放頁面中上一套的資料。尚未快取的系統必須先連線載入。多分頁共享同一個 browser cache，最新選擇的系統會成為唯一的路網快取。

## Editor

開啟 `/editor?conf=ftmc&lang=zh`：

也可以開啟 `/editor?conf=_blank&lang=zh`，或從編輯器右上角選擇「(空白地圖)」，從零建立路網。先新增至少兩座車站及一條路線，再新增路段；空白地圖只出現在編輯器選單。可使用相同的 Undo／Redo、JSON 下載與重新開啟、路線預覽流程。離開前請下載 JSON 保存。

1. 用「開啟 JSON 檔案」載入本機檔案；載入前會驗證路網與操作歷史。
2. 新增、修改、刪除車站、路線、連接及站內轉乘，並設定名稱、搜尋代碼、單雙向、方向、向量、選項、票價及顯示開關。
3. 拖曳車站位置與站名標籤。選取線段後可直接拖曳圓形轉折點；按「新增轉折點」後點選線段，或 Shift 點選線段新增。右鍵／Delete 刪除，方向鍵微調；側欄也可新增、刪除及修改轉折點座標。
4. 新增區間預設啟用「自動更新方向與里程預設值」，更換車站或路線會參考既有方向設定與遊戲 XYZ 座標；手動修改方向或里程會關閉自動更新。既有區間可按「推算方向與里程」套用建議。站內轉乘與缺少 XYZ 座標的里程為 0。
5. 用「下載 JSON」保存路網與操作歷史，用「試算此路網」在瀏覽器預覽。開檔與編輯不會改動網站的預設路線圖。

Editor 的變更保留在目前頁面的記憶體；重新整理前請匯出。Editor 不會寫入伺服器、資料庫或舊專案。要發布新的內容，請將匯出的 JSON 放到 `public/data/<conf>.json`，新增系統時亦更新 `public/data/systems.json`，再重新 build。圖上 `position` / `labelOffset` 與遊戲 `coordinates` 分開保存，拖曳不改變遊戲座標或里程。RoFT 正式版與預覽版的站位及可對應的路線折點參照 `docs/roft-beno-20260920.txt`（2026-09-20 Beno 原稿）；未對應區間使用水平、垂直或 45° 折線。畫面使用圓角，重疊路段會自動平行偏移，包含跨過中間站的快速路線；可用 editor 持續調整。車站標記會依畫出的圓角與停靠線位置自動校正；中型站延展成長圓形／圓角矩形，大型站維持圓形並擴大，未停靠的路線在標記旁避讓。總覽時依鄰站距離限制標記最小尺寸。這些只影響畫面，不寫回 JSON 位置或新增欄位。

RoFT 的 L6／L6N 已合併為 L6，北環預設依甘蔗北鎮 → 駱駝島 → 起司狗旅館順序繼續南下。在起司狗旅館北上月台可換搭先到駱駝島的特殊礦車；換車會計入轉乘次數。YYL／YYL2 亦合併為 YYL。B1 在青石斷崖至甘蔗北鎮僅供下車，已上車乘客可以繼續直通，與 L7 共用區間顯示為 7 號線；不再以額外時間避開 B1。

## API 與 SEO

`/api` 是文件頁，`/api/openapi.json` 是 OpenAPI 3.1 規格。API 為唯讀，允許跨來源 GET，無須 API key。

| Endpoint | 用途 |
| --- | --- |
| `/api/systems` | 可用地鐵系統與站數 |
| `/api/networks/ftmc` | 完整純 JSON 路網 |
| `/api/route?conf=ftmc&from=NV&to=FH` | 雲端路由與向量結果 |
| `/route?conf=ftmc&from=NV&to=FH&lang=zh` | 伺服器產生的可讀 HTML 路線結果 |

查詢頁若提供 `from` / `to` 也會在初始 HTML 中帶入路線文字及 JSON-LD，爬蟲無需先執行 JavaScript。互動 UI 的搜尋及路由不呼叫上述計算 API。提供 sitemap 與 robots.txt；不列舉所有站對，以免產生大量重複頁面。

## 資料與維護

- 路網：`public/data/*.json`。格式說明及範例見 [資料格式](docs/data-format.md)。
- UI 翻譯：`public/i18n/en.json`、`zh.json`、`ja.json`。車站及路線名稱在路網中保存，沿用舊版中英文名稱。
- 路由：`shared/router.js`；驗證及搜尋：`shared/network.js`；文字輸出：`shared/format.js`。
- 舊版引用關係及棄用判定：[遷移紀錄](docs/migration.md)。

時間包含舊版設定的出發站停站時間、方向限定轉乘及交通選項；沒有加入即時候車資料。里程為遊戲座標三維直線距離，以一方塊等於一公尺換算，四捨五入至 0.001 km；缺少有效 XYZ、站內轉乘及站外步行為 0。它是估算值，並非實際軌道長度。

Minecraft 票價為 0。TRTC 的區間價格為單獨搭乘相鄰兩站的票價，**不可加總當成整趟票價**；整趟使用北捷提供的官方起訖站表。板橋／新埔站外轉乘在 20 分鐘內合併計價，預估轉乘超時則分段計價。官方票價 CSV 與來源資訊保存在專案內，可離線使用；資料擷取日期為 2026-09-30。路網仍保持舊版涵蓋範圍，並未自行加入後續新站。

來源：[北捷提供的政府開放資料](https://data.gov.tw/dataset/128418)、[官方站外轉乘規則](https://www.metro.taipei/News_Content.aspx?n=566DA580861CEE77&s=C2DB2D09B73A31AA)。票價來源以政府資料開放授權條款第 1 版提供。原始 CSV 為 Big5；遷移腳本會轉為 UTF-8 JSON。

## 驗證

目前的執行結果、瀏覽器版本與容量見 [驗證紀錄](docs/verification.md)。

```sh
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" npx playwright install chromium --only-shell
npm run verify
```

`npm test` 比對所有支援選項下未修改的舊版路段、時間、方向與抽樣查詢條件；RoFT 已修正路線則驗證北環順序、同月台換車、YYL 合併、B1 下車限制、線形及編輯預設值；另驗證座標搜尋、站名、票價及參數。`npm run verify` 啟動獨立的本機服務，驗證 API / HTML 與瀏覽器互動、離線功能、單一系統快取及 JSON 編輯。瀏覽器截圖寫入 `test-results/`，最後比對所有舊版檔案 SHA-256。只驗證 API 可用 `npm run verify -- --api-only`。

部署或 CI 請先 build。瀏覽器截圖需要測試環境提供中日文字型；WSL 的驗證腳本會自動以唯讀方式使用主機既有的微軟正黑體與 Meiryo，不複製或發布字型。Playwright 與 browser cache 只供開發驗證，不是正式執行需求。

資料遷移腳本需要同層唯讀的 `routeplanner_old/`：

```sh
npm run migrate
node scripts/locales.js
```

遷移會重新產生四套 JSON；**會覆寫已在新專案手動編輯的 JSON**，請先保存編輯結果。網站執行本身不依賴 PHP 或舊資料夾。

## 公開測試與搬機驗證

公開測試站為 https://routeplanner-v2.onrender.com/。Render 使用 Node runtime，追蹤 GitHub 的 `main` 分支；push 後自動部署，Build Command 為 `npm ci && npm run build`，Start Command 為 `npm run start`。程式維持 Node.js 22.12+ 相容性，Dockerfile 亦保留供自行建置。

舊專案不在預設的 `../routeplanner_old/` 時，可用 `LEGACY_ROOT` 指定唯讀舊站根目錄；相對路徑以新版專案根目錄為準。例如此電腦：

```sh
LEGACY_ROOT=../routeplanner_old_copy/htdocs/mcsubwaymap npm test
LEGACY_ROOT=../routeplanner_old_copy/htdocs/mcsubwaymap npm run verify
```

不要把 `npm run migrate` 當作啟動步驟。它會覆寫四套路網 JSON；`LEGACY_ROOT` 亦適用於遷移。
