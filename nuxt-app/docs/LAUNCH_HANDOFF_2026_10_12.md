# DiscoveryStack 上線交接與一次性準備清單

## 目前能交付的範圍

本輪補上可執行的備份持久紀錄、加密檔異地複製、外部健康與排程監測、異常／恢復通知，以及預設關閉的部署範本。程式已完成本機完整驗收，進入既有正式服務的發版流程；是否正式部署須以 PR、Render Live 與 exact SHA 驗收記錄為準。沒有新增付費、修改正式資料庫、上傳正式備份、呼叫真實 AI、寄信、傳 LINE 或發布客戶文章。已登入的工作台與服務 readiness 僅作唯讀檢查。

2026 年 10 月 12 日追加範圍：使用者要求把營運、機器訓練、建站三塊補齊後部署到既有正式站。此授權不包含新增付費資源、域名採購、收款或使用客戶資料訓練。模型仍只給建議、由人決定修改；沒有真實合格資料時，不能宣稱已產出可用模型。

## 本次追加的機器學習與建站修正

- GEO 模型頁新增白話資料缺口表，可切換實驗訓練／影子驗證，直接顯示合格資料集數量與各項門檻，並連到既有建立資料集及 CPU 訓練入口。缺數字顯示未知，不以示範資料填補；資料天數只按納入該階段的資料集成員計算。
- 建站內部服務補上 Cloudflare 正式版本回退；來源及目標部署 ID 只由伺服器核對的同 owner／project／domain 回執取得。權限改變、外部另行部署、舊版本不存在或正式首頁不符，都不能回報成功。重播只核對已恢復的確切部署，不再次發布或建立資源。
- 建站部署 transport 的收據改為串流大小限制，timeout 保留到收據讀取完畢，不只限制收到 headers 之前的時間。

這些修正不會自動開始客戶資料蒐集、訓練、收款、買域名或替客戶發布。正式發版結果與本次全套驗收結果須分別記錄；不能沿用下方上一輪的測試數字冒充本輪結果。

## 本輪接好的程式

| 項目 | 現在的實作 | 驗收界線 |
| --- | --- | --- |
| 持久執行紀錄 | SQLite 唯一鍵與同來源單一執行權、FULL 同步、重啟保留、不確定結果鎖住、需人工核對後解除 | 單一 runner 的持久本機磁碟；不支援 NFS 或多台獨立 SQLite 協調 |
| 備份排程 | 預設關閉；到期才執行既有加密備份，成功後保存摘要；失敗不跨時段盲目重跑 | 需正式備份帳號、獨立加密金鑰與相容資料庫／MySQL 工具；未在正式宿主排程 |
| 異地副本 | 僅接受認證有效的加密檔；S3 條件建立、不覆寫；下載完整密文比對 SHA-256 與大小 | 每檔上限 1 GiB，無自動重試或刪除；真實 S3／R2 權限與相容性須驗收，沒有上傳正式資料 |
| 外部監測 | 健康、資料庫 readiness、指定部署 SHA、匿名 Owner 權限；另可檢查備份時效和已啟用背景排程 | runner 必須在應用主機之外；排程證據仍屬單程序，不代表每個副本 |
| 監測入口 | `/api/operations/monitor` 僅回固定狀態欄位，獨立 32-byte token、無快取、無寫入 | token 未設定時一律 401，不使用 Owner cookie，也不授予 Owner 權限 |
| 異常通知 | 每分鐘取樣，連續 3 次失敗通知、2 次健康恢復通知；同事件不重送，逾時需核對 | Resend 接受不等於信箱收到；寄件網域、收件人及真實收件尚未驗收 |
| 開通工具 | 預檢、人工核對命令、全關閉環境範本及 Linux systemd timers | 沒有安裝或啟用排程；本次 Mac 無法驗收 Linux systemd runtime |

S3 不覆寫及 checksum 欄位遵循 [AWS PutObject 契約](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)；寄件採用固定 Resend endpoint 與 [idempotency key 契約](https://resend.com/docs/dashboard/emails/idempotency-keys)。程式另外保留本機持久事件紀錄，不能把供應商去重期限當成無限防重送保證。

R2 使用其 [S3 相容契約](https://developers.cloudflare.com/r2/api/s3/api/) 的 `Content-MD5` 與條件寫入，不套用 AWS 的全物件 SHA-256 header；兩種路徑都再下載密文核對 SHA-256。checksum 只用於檔案完整性，加密認證仍為 AES-GCM。

## 你最後一次需要準備的東西

不必現在購買，也不用重買已有服務。已有設定最後在控制台確認即可。**密碼、API key、資料庫 URL 和加密金鑰不要貼到對話或 Git。** 下表為目前已知的開通依賴；部署程式不等於自動開啟所有外部功能。

| 類別 | 最後需要提供或確認 | 是否可能花錢 | 通過條件 |
| --- | --- | --- | --- |
| 主機與發版權限 | 現有 GitHub／Render／Netlify 管理權；確認哪一個入口作正式平台；不休眠 API 主機，以及應用主機以外、可持久存檔的 runner | 常駐主機可能需升級；本次沒有升級 | exact SHA、CI、主機 Live、真實頁面與 Owner 登入一致；查清歷史 Netlify 503，不讓兩個正式入口狀態互相矛盾 |
| 備份與復原 | 只讀備份帳號、獨立金鑰及安全保管人、異地 bucket 與最小權限憑證；明確同意把加密正式資料放到該位置；選保存天數、容許資料損失時間及復原時間 | 儲存與 runner 可能收費；可先確認已有資源 | 同一份快照加密驗證、異地下載比對、目標引擎隔離還原、金鑰恢復及磁碟／保留政策驗收 |
| 寄信與營運告警 | 自有寄件網域及 DNS 管理權、Resend 帳號；確認營運收件人和事件處理人。先前 `tendertech2018@gmail.com` 僅作既有測試收件地址，不自動當長期告警同意 | 已有網域可用；新網域／用量可能付費 | 驗證 sender、真實信箱收信、寄信失敗／退信處理與故障恢復通知。沒有寄件網域時這項不能算完成 |
| AI 與費用上限 | 現有模型帳號可用額度、公開測試網站及新的一次性費用上限；現有 Qwen 串接先用，不要求另外購買模型 | 真實呼叫按用量 | 草稿成功、用量與費用可核對；歷史 US$1 測試授權不可重用 |
| 發布與 LINE | 指定第一個網站、管理權及接收端設定；LINE 帳號管理權與本人手機操作；明確測試發布、撤下／回復授權 | 現有帳號可沿用；實際方案／用量另確認 | 收到稿件、核准／拒絕／過期、同一草稿發布回執、公開內容、撤下與不重複發布 |
| 成效量測 | 對應網站的 GSC／GA4 property 授權及觀測期間 | 不因本程式接線新增付費 | 真實 baseline 與發布後量測；不能以空資料宣稱 SEO／GEO 提升 |
| 正式模型與資料 | 若要啟用模型排序：合法觀測資料、用途／保留同意、核准模型和評估門檻；沒有資料就維持唯讀規則建議 | 實際訓練／推論可能付費，先不啟用 | 留出評估、影子驗證與回退；此項不能靠「接好 API」保證模型有效，也不是你已同意客戶資料訓練 |
| 客戶建站 | Cloudflare Pages／R2 帳號與最小權限設定、第一個隔離驗收網站、擁有權及 DNS；自助收款／買新網域另外需要 Stripe／Porkbun 與明確採購授權 | 依現有帳號及用量；不在本次自動採購 | 真實產生草稿、預覽、審核、發布、公開內容與回退。沒有帳號或驗收前維持阻擋，不把安全的空模組當完整電商或訂位服務 |
| 最後驗收授權 | 一次確認上述測試範圍、費用總上限、部署窗口、告警收件及回退版本 | 由上列項目決定，先取得核准 | 上線前端到端小規模試跑、跨備份週期觀察、重啟與故障演練；通過後才放大流量 |

## 操作入口與安全預設

在 `nuxt-app` 執行。預檢不讀 DB、不寄信、不開檔案、不列秘密，也不自動讀 `.env`：

```sh
node scripts/operations/operator.mjs preflight
```

`scripts/operations/operator.env.example` 是空值、全關閉範本。操作者應透過 runner 的秘密管理功能注入設定，而不是把真實值寫回範本。正式啟用前先完成本文件清單及驗收授權。

獲得授權並設定妥當後的實際命令如下。`--execute` 與對應 `DS_OPS_ENABLE_* = true` 缺一不可：

```sh
node scripts/operations/operator.mjs backup-tick --execute
node scripts/operations/operator.mjs monitor-tick --execute
node scripts/operations/operator.mjs status
```

備份排程建議每 15 分鐘檢查一次；預設每 24 小時建立一次。監測每分鐘執行。兩者共用同一 runner、同一私有 state 目錄，因此監測能讀取備份時效。`DS_OPS_ENABLE_BACKUP=true` 時，監測同時要求最後一次完成的備份在設定間隔加 1 小時內，且沒有超過 45 分鐘仍未完成的備份；啟用異地複製時也要求回讀比對成功。未啟用的備份檢查明示 `not_monitored`。

`DS_OPS_ENABLE_TASK_MONITOR=true` 才讀排程入口。應用主機及 runner 需分別在秘密管理處設定同一個獨立 `DS_OPS_MONITOR_TOKEN`，不得沿用 Owner 密碼、session、vault 或備份金鑰。排程剛啟動尚無執行證據時會維持 `FAIL`／等待觀測，而不是宣稱成功；需等待各排程實際執行。不同副本不能互相代替成功證據。

`DS_OPS_ENABLE_ALERTS=true` 才寄通知。網站故障、排程或備份異常共用一個服務事件：通知只有固定事件碼和參考鍵，詳情在 Owner 頁及 runner 紀錄核對。停用寄件期間出現的持續故障，在之後啟用寄件時會送一次；寄件不確定則鎖住監測工作，不自動重送。因此 runner 自身的服務失敗狀態也必須由宿主／值班人員監看。

## Linux 排程範本

`scripts/operations/systemd/` 包含一個模板 service 和兩個 timer，不會自行安裝。範本假設 Node 22 在 `/usr/bin/node`、專案與對應平台 dependencies 安裝於 `/opt/discoverystack/nuxt-app`，並存在專用的 `discoverystack-ops` 使用者。需安裝相容的 `mysql`／`mysqldump`。不要只部署 `.output`，operator 需要自己的腳本及 `better-sqlite3`／AWS SDK dependencies。

管理員核對路徑、私有 `/etc/discoverystack/operator.env`、專用使用者及 persistent disk 後，才可安裝 units、執行 `systemd-analyze verify` 並啟用 timers。`StateDirectory` 建立私有 `/var/lib/discoverystack-ops`；子目錄由程式建立。45 分鐘逾時會停止整組子程序，保留不確定 claim 供核對，不自動 Restart。不要把它安裝在會休眠或重建即消失的磁碟上，也不要在 macOS 執行 Linux 管理命令。

## 不確定結果與保留政策

`status` 只列工作鍵、狀態及時間，不列路徑、token 或 provider payload。`claimed` 且程序已不在運行，表示要人工核對；`acknowledged` 不等於寄送或備份成功。

先停止相應 timer、確認原程序已退出，再按工作鍵查加密檔／bucket／供應商事件。使用既有 `ops:backup verify` 認證檔案，核對 SHA-256／大小或寄件事件。S3 已有物件但回讀未完成時，不得刪除後重送或將工作改為完成。確認保留證據並接受不重播該次工作的處理結果後，才執行：

```sh
node scripts/operations/operator.mjs acknowledge --confirm-reviewed-no-replay JOB_KEY_64_HEX
```

這只解除後續新時段工作，不重播舊工作、不刪檔、不宣稱成功。若程序尚未退出就解除會有併發風險。原寄件是否已送達不確定時，以供應商事件核對；不能因終端逾時就重寄。下一個故障事件或恢復事件仍會依新的取樣決定。

程式刻意不自動刪除備份。正式開通時依選定天數設定 bucket lifecycle，確認最新可還原副本後才人工清理本機舊檔；本機容量不足會失敗並進入核對，不會刪掉可能唯一有效的備份。runner 的磁碟容量和自身停機也要納入宿主監控。未選定保留政策與目標引擎還原結果前，不算災難復原驗收完成。

## 本機驗收與上線門檻

本次最終追加驗收：型別檢查、全新 Node server production build、425 檔／7,305 項測試通過，21 檔／84 項 opt-in 測試跳過，零失敗；測試耗時 348.35 秒。測試程序沒有繼承正式憑證，外部連線受離線 guard 阻擋，只允許隔離 loopback。先前受 sandbox 本機 listener 權限限制而中斷的執行不計為成功；本數字來自修正執行權限後的完整重跑。另通過 MySQL identifier policy 與既有 dependency audit gate；node-forge、braces 仍各有一項既有 build/dev 精確例外，2026-11-09 到期，沒有新增例外。摘要在 `work/offline-acceptance/latest.json`（不提交正式資料或本機產物）；真實 AI／Cloudflare 回退／寄信／異地備份驗收仍為 `NOT_RUN`。

前一輪歷史驗收為 422 檔／7,275 項、308.98 秒；包含 runner、transports、監測入口及 Owner 頁共 4 檔 38 項，涵蓋真實 SQLite 檔案及獨立 Node 程序、合成加密檔、AWS／R2 fake provider、實際 H3 loopback handler。不得把這些隔離驗證當成正式 provider 成功證據。

互動進度表本機瀏覽器確認：全部 23 項、本次補強 9 項，備份詳情能展開，已移除「還缺持久 adapter」的過時說法。預檢以空白憑證環境實際執行，所有外部功能均維持關閉。`git diff --check` 通過。沒有為排除既有 Browserslist／baseline 及 BigInt target 編譯警告擅自升級依賴。

剩餘開通作業是：核准的帳號／主機與秘密設定、排程安裝、正式發版、異地資料存放及端到端驗收。真實平台仍可能暴露相容性問題，屆時應修正再驗收；不能承諾只填設定就必然上線。沒有通過上述門檻前，狀態是「程式備妥待正式開通驗收」，不是「全自動正式營運完成」。
