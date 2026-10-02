# 台北捷運路線圖排版

排版依據為 [台北捷運官方互動路線圖](https://web.metro.taipei/pages2026/WebRouteMap) 與其 [圖檔](https://web.metro.taipei/pages2026/images/routemap2026-TW.webp)，取得日期為 2026-10-02。

`trtc-official-layout.json` 記錄現有 119 個 canonical 車站的官網站碼、中文站名、圖上位置與必要轉彎。圖上位置參考官網車站標記，將共用水平／垂直主幹對齊並微調 45° 區間；座標僅供排版，不是實際地理位置。板橋的板南線與環狀線車站仍分開，以步行線段連接。

`scripts/trtc-layout.js` 會核對所有既有站名及站碼，對不符的資料拋出錯誤，再套用位置。同一對車站的全程、區間及分支營運模式使用相同的線形，以 `displayLineId` 共用實體路線顏色與圖例。`npm run migrate` 也會套用相同排版。

此次調整範圍為現有路網的排版。官網所列新增 R01 廣慈／奉天宮站另存於 `referenceOnlyStations`；尚未擴充路由、行車時間及票價資料。官網的機場捷運、淡海輕軌、安坑輕軌、三鶯線與貓空纜車，也未加入現有台北捷運路由資料。

`npm test` 核對站名、站碼、主要轉乘站相對位置、45° 線段及不同營運模式共用線形。`npm run verify` 另產生 `test-results/taipei-official-layout.png` 供視覺檢查。
