# JSON 路網格式 v2

每個地鐵系統是一份 `public/data/<conf>.json`。UTF-8、兩空白縮排，以命名欄位表示向量，避免依陣列位置推測單位。JSON 不含可執行 JavaScript。

## 主要欄位

| 欄位 | 意義 |
| --- | --- |
| `schemaVersion` | 固定為 `2` |
| `id` / `names` / `preview` | 系統識別、官方中英文名稱、預覽樣式 |
| `ui.enableDistance` / `ui.enableFare` | 各自控制 UI、複製文字是否顯示里程／價格；不移除 API 向量 |
| `options` | 支援選項、預設值、各查詢條件的 comparator |
| `aliases` | 車站代碼到 canonical station 的對應 |
| `stations` | 以車站 ID 為 key 的車站資料 |
| `lines` | 以路線 ID 為 key 的路線資料 |
| `edges` | 行車、步行與站內轉乘的連接 |
| `fares` | 免費、區間加總或官方起訖票價模型 |
| `editorHistory` | 可選的獨立復原／重做紀錄；最多 100 組操作 |

## 車站與路線

```json
{
  "stations": {
    "A": {
      "id": "A",
      "names": { "en": "Official name", "zh": "官方站名" },
      "aliases": ["Original station alias"],
      "codes": ["01-01"],
      "coordinates": { "x": 100, "y": 62, "z": 200 },
      "position": { "x": 120, "y": 180 },
      "symbol": "I-8"
    }
  },
  "lines": {
    "L1": {
      "id": "L1",
      "names": { "en": "Line 1", "zh": "1號線" },
      "color": "#176b76",
      "interior": false
    }
  }
}
```

`coordinates` 是公尺，可為 `null`。`position` 是 SVG 排版座標。日語名稱由英文 fallback；不得機械翻譯並取代官方中英文名稱。`detailsHtml` 是遷移後的樓層資料，顯示於 sandbox iframe。

`symbol` 為可選的 `L-1` 至 `M-8` 格式。字母 `L` 為 Limited service（小型車站）、`I` 為 Interchange（中型車站）、`M` 為 Mega station（大型車站）；數字 1～8 依序為左上、正上、右上、正左、正右、左下、正下、右下。車站大小與站名間距以畫面像素計算，縮放時維持相同視覺大小與間距；正左／右方向垂直置中，正上／下水平置中。

編輯器以「車站型態」與「標籤文字方向」調整 `symbol`；拖曳站名也會切換八個方向，保留抓取偏移並將方向寫回 `symbol`，不再儲存自由的標籤偏移量。舊 JSON 的 `labelOffset`／`labelAnchor` 仍可讀取；沒有 `symbol` 時，由偏移量推算方向、由實體路線的顏色數推算大小，指定 `symbol` 後優先使用它，修改型態／方向會移除舊標籤欄位。`labelOffset` 的舊驗證仍保留，供既有歷史紀錄還原使用。

編輯器放大上限為 128 倍；車站與路線節點可用方向鍵移動 1 個圖上單位，按住 Shift 移動 10 個。按下地圖車站、站名或使用車站方向鍵時即同步選取側欄的車站；無效草稿仍需修正或取消後才能離開該欄位。

## 邊與向量

```json
{
  "id": "e001",
  "kind": "ride",
  "from": "A",
  "to": "B",
  "lineId": "L1",
  "direction": "E",
  "directionLabel": { "en": "Eastbound", "zh": "往東" },
  "bidirectional": true,
  "reverseDirection": "W",
  "reverseDirectionLabel": { "en": "Westbound", "zh": "往西" },
  "metrics": { "timeSec": 35, "distanceKm": 0.125, "price": 0 },
  "reverseTimeSec": 40,
  "transferSlope": 0,
  "reverseTransferSlope": 0,
  "points": [{ "x": 160, "y": 180 }]
}
```

`timeSec` 包含原始建圖時計入的出發停站時間，反向若因停站差異不同，記在 `reverseTimeSec`。所有權重必須是非負、有限數。當 `bidirectional=false`，只有 from → to；不同時間或不同路線的單向回程可另建一條邊。

`kind=walk` 為站外步行連接；`kind=transfer` 的 `from` 與 `to` 相同，使用 `fromLine` / `toLine`，例如 `L1:E` → `L2:N`。未附方向的 `L1` 可匹配該路線各方向；有方向則只匹配特定方向。內部走道也有自己的路線 ID，以 `interior=true` 標示。

遊戲里程是 `round(sqrt(dx²+dy²+dz²)) / 1000`。缺少座標、站內轉乘與站外步行為 0。編輯 `position` 不會自動更動里程；里程欄位可以獨立維護。

## 行車、上車限制與顯示

`boardingAllowed=false` 表示此邊的出發站僅供下車。已乘坐相同路線／方向的乘客仍可通過；從起點或站內轉乘進入此路線不能搭乘。`reverseBoardingAllowed` 可獨立設定反向，未設定時沿用正向。站內轉乘會清除「已在車上」狀態，因此不能藉由轉乘繞過上車限制。

`arrivalDirection` 可在不換車的情況下變更抵達後的方向狀態，供北環折返後繼續南下使用；反向可設定 `reverseArrivalDirection`。`direction` 仍是出發時所需的方向。單一路線可包含多種走向與月台。

`countsAsTransfer=true` 用於同一路線需要實際換車的站內連接，例如起司狗旅館北上月台換搭往駱駝島的特殊礦車；不會因為合併路線 ID 而漏算轉乘次數。

`displayLineId` 與 `displayDirectionLabel` 可為直通區間指定對外呈現的路線與方向文字，路由仍以原本的 `lineId`／方向及時間判斷車輛能否接續。例如 B1 直通 L7 時顯示為 7 號線。

`points` 是可拖曳的折線錨點。SVG 在錨點之間補上水平、垂直或 45° 線段，並以圓角連接；共線區段會依路線平行偏移，快速路線跨過中間站的重疊也會拆段處理。偏移不改變車站位置或里程。`map.cornerRadius` 為圖上圓角半徑（預設 12），`map.parallelGap` 為相鄰路線的畫面間距（預設 5）。

每次「新增轉折點」只插入一個使用者錨點，不將 SVG 自動生成的轉角轉成額外的編輯節點。圖例與路線篩選依 `displayLineId` 顯示，例如台北捷運的全程／區間車共用同一條實體路線。

新增搭乘區間可參考同一路線已有區間推算方向代碼及方向文字，優先參考鄰近端點；新增轉乘依車站現有轉乘或出發方向推算帶方向的路線識別。新區間啟用自動更新，手動修改方向或里程後停用；既有區間只在按下推算按鈕或啟用自動更新時套用。里程使用遊戲 XYZ 的三維直線距離，缺座標及站內轉乘為 0，不將 SVG 排版座標當成實際公里數。

## 條件式時間與熟悉程度

```json
{
  "variants": [
    {
      "when": { "enableExpressCarts": [2, 3] },
      "timeSec": 50,
      "reverseTimeSec": 55,
      "transferSlope": 0,
      "reverseTransferSlope": 0
    }
  ]
}
```

存在 `variants` 時，找不到符合選項的項目代表此邊不可用；找到時該項目的時間覆蓋基本時間。可搭配 `horseSpeedClass` 的值陣列。`when` 省略某個選項代表任何該選項值都符合；多條同時符合時採第一條。

實際時間為 `timeSec + transferSlope × (transferCoef - 1)`。這精確保存原始轉乘時間函數；反向亦有獨立基礎時間與斜率。Editor 會保留所有 variants，在條件式時間 JSON 欄位修改；若要改成單一固定時間，先清除 variants。

## 編輯器復原紀錄

`editorHistory` 是獨立的可選根欄位；舊 JSON 未包含時視為沒有紀錄。編輯器匯出的 JSON 會包含此欄位，保留復原及重做的位置：

```json
{
  "editorHistory": {
    "version": 1,
    "cursor": 1,
    "entries": [
      {
        "kind": "move",
        "target": "station:A:position",
        "changes": [
          {
            "collection": "stations",
            "key": "A",
            "before": { "exists": true, "value": { "id": "A", "names": { "en": "A", "zh": "A" }, "position": { "x": 0, "y": 0 } } },
            "after": { "exists": true, "value": { "id": "A", "names": { "en": "A", "zh": "A" }, "position": { "x": 1, "y": 0 } } }
          }
        ]
      }
    ]
  }
}
```

`entries` 依時間排序，最多 100 組。`cursor` 前面的組別可復原，後面的組別可重做，兩者合計受同一個上限限制。新修改會刪除重做分支；超過上限時刪除最舊的組別。

`kind` 為 `move`、`edit`、`add` 或 `delete`。`target` 是分組識別，不會當成程式執行。連續以方向鍵、滑鼠或座標欄位移動同一站點／同一條連接的同一個節點時合併為一組，沒有時間間隔限制；改動另一個目標或其他屬性則開始另一組。站名位置與車站位置是不同目標。新增、刪除節點及提交屬性各自形成一組。縮放、平移和儲存不產生紀錄；載入 JSON、復原、重做、清除紀錄或重新開啟編輯器會結束正在合併的組別。

`changes` 保存變更前後的實體資料，避免每組複製整份路網。`collection` 可為 `stations`、`lines`、`edges`、`stationOrder`、`lineOrder`、`edgeOrder` 或 `root`。`root` 僅能指向編輯器支援的資料欄位，不能指向 `editorHistory`。不存在的資料以 `{ "exists": false }` 表示；存在的資料保存完整 `value`。新增／刪除／重排車站、路線或連接時，另以 `stationOrder`、`lineOrder` 或 `edgeOrder`、`key: "ids"` 保存前後的 ID 陣列，以便精確恢復清單與繪圖順序。刪除車站造成的連接、別名和票價修改會納入同一組，原子地還原。

每次復原／重做都先檢查紀錄格式、安全的 JSON 值、實體 ID、目前資料與預期來源狀態是否一致，再驗證操作結果的完整路網。任何一步失敗都保留目前資料及歷史位置，並顯示錯誤。這是資料可行性驗證；紀錄不含可執行程式。匯出時另外驗證整條復原／重做鏈。

載入 JSON 時也驗證完整歷史鏈。路網無效時直接拒絕；只有歷史損壞時，顯示警告及將捨棄／保留的組數，讓使用者選擇拒絕整份 JSON（保留目前資料與草稿），或載入路網並保留通過驗證的連續後段紀錄。損壞項目本身與之前的全部紀錄都會遺失；後續紀錄若依賴已捨棄的動作、無法從載入的路網安全回放，也必須捨棄。保留後段時重新計算 `cursor`，路網本身不作修改；版本、紀錄清單或 `cursor` 等外層結構不可信時，沒有可安全保留的紀錄。

若程式錯誤使紀錄在復原／重做時才變得無效，該次操作不改動路網或歷史位置。下一次有效且實際有變更的編輯仍可提交：先刪除舊重做分支，捨棄已執行紀錄中無法驗證的前段，保留可驗證的連續後段，再新增這次操作。復原／重做失敗也會結束移動分組，避免把新操作合併進損壞紀錄。無效草稿或沒有變更的提交不會清除分支或修復紀錄。

文字、數值及 JSON 欄位先保留草稿，離開欄位或在單行輸入框按 Enter 才提交。無效內容留在欄位並顯示錯誤，不進入路網或紀錄；可用 Escape 取消目前欄位，或「取消待提交的修改」取消全部草稿。有未通過驗證的草稿時，儲存、預覽及復原／重做會先要求修正或取消。草稿不寫入 JSON。

Ctrl/Cmd+Z 為復原、Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 為重做；在輸入框、文字區塊及選單內保留原生文字編輯快捷鍵。清除紀錄前必須確認，清除只移除復原／重做資料，不變更路網。

## 未下載修改提醒

每次開啟路線圖或下載 JSON 時記住完整文件（包含復原紀錄）。後續修改或尚未提交的欄位草稿會顯示「修改尚未下載」。儲存 JSON 至文字框、試算預覽或切換語言不會標記為已下載；只有啟動下載 JSON 後才記住新的基準。復原／重做及清除紀錄也會改變文件，必須再次下載才能保存這些紀錄。

切換系統選單時，以瀏覽器確認視窗提醒，取消後保留目前系統、文件與草稿；接受後載入新的路網。關閉視窗、重新整理或透過連結離開頁面時，使用瀏覽器原生 `beforeunload` 提示，提示文字由瀏覽器決定。尚未修改的路網不提示；有未下載修改時，試算預覽仍保留提醒狀態。瀏覽器無法回報使用者最後是否取消作業系統的「另存新檔」，因此基準以成功啟動下載為準。

## 查詢 comparator

```json
{
  "options": {
    "defaults": { "criteria": "time", "transferCoef": 1 },
    "criteria": ["time", "transfers", "transferTime", "stops", "mixed"],
    "transferCoefficients": [1, 4, 7],
    "comparators": {
      "time": [{ "timeSec": 1 }, { "transfers": 1 }, { "transferTimeSec": 1 }, { "stops": 1 }],
      "transfers": [{ "transfers": 1 }, { "transferTimeSec": 1 }, { "timeSec": 1 }, { "stops": 1 }],
      "transferTime": [{ "transferTimeSec": 1 }, { "transfers": 1 }, { "timeSec": 1 }, { "stops": 1 }],
      "stops": [{ "stops": 1 }, { "timeSec": 1 }, { "transfers": 1 }, { "transferTimeSec": 1 }],
      "mixed": [{ "transfers": 1, "timeSec": 0.05, "transferTimeSec": 0.1, "stops": 0.2 }, { "timeSec": 1 }]
    }
  }
}
```

每個物件表示一個比較維度，物件內權重相加，依陣列順序處理平手。所有權重為非負，保持 Dijkstra 的前提。FTMC 與其他系統的轉乘模式平手順序不同，已由遷移保存；TRTC 熟悉程度實際選項為 `[1, 1.6, 3.2]`。

## 票價

`free`：整趟價格為 0。`additive`：各邊價格相加，供未來真的按段計費的系統。`origin-destination`：`matrix[from][to]` 是整趟成人單程票價。

TRTC `edges[].metrics.price` 保存單獨搭乘區間的官方票價，用作資料維度；它與最終總價不同。矩陣涵蓋所有遷移站對。`externalTransfers` 保存板橋及新埔轉乘對應與 1200 秒再進站期限，超時會按付費旅程分段查表。`currency` 為 `TWD`；未知價格用 `null` 表示，不宣稱免費。`source`、`download`、`retrieved` 與 `transferSource` 保存來源與擷取日期。

目前里程與票價僅用於資料及結果顯示，不提供「最短里程」或「最低票價」搜尋。後續擴充須先處理缺少資料的 0 里程及非加總票價規則。
