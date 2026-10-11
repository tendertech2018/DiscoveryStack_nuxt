# DiscoveryStack 四批離線交付驗收

本次完成範圍是自家平台的程式接線、唯讀模型建議、故障防護及離線驗收準備；不是正式營運驗收。沒有啟動付費服務、呼叫真實 AI、寄信、傳 LINE、發布文章、讀寫正式資料庫或部署。既有未提交變更保留，新增修改亦尚未提交。

後續同日已補上持久備份 adapter、加密檔 S3 複製／回讀、外部監測及告警寄件程式。最新交付與唯一開通清單請讀 [上線交接](LAUNCH_HANDOFF_2026_10_12.md)；本文件的四批測試數字保留為較早一輪證據，不代表最後重跑的測試數。

## 四批交付內容

| 批次 | 本機交付 | 正式使用的限制 |
| --- | --- | --- |
| 一 唯讀模型建議 | `OwnerDraftAdvice.vue` 與 v2 型別契約；人工檢查卡、草稿版本及模型資料雜湊；多個相容語言情境須明選；資料或授權變動即拒絕舊結果 | 模型影子分數不是引用機率或排名；檢查卡是結構規則，不是因果效果。沒有自動修改、發布或訓練；正式模型仍受保護 |
| 二 完整離線流程 | 沿用實際服務，合成證據與 fake transports 串接產稿、簽章核准、發布回執、公開狀態及量測；12 個整合情境 | 起點為合成且已核准的證據與計畫，不是真實爬站；不代替 AI、LINE、網站或 GSC 驗收 |
| 三 自動工作與恢復 | 重用原任務、回執、租約與預算；關機停止接新工作並等待進行中任務；部分失敗不再記為全成功；隔離 MySQL 驗證 20 項；同日後續補上可執行 operator | 沒有新增平行業務佇列。operator 的本機持久紀錄僅管理備份與監測；正式宿主、寄件／異地設定及驗收仍待開通 |
| 四 設定預檢與驗收 | Owner 營運頁顯示固定診斷碼、設定狀態、待處理告警及關機狀態；新增清除憑證繼承的離線型別、build、測試命令 | 設定存在不等於服務成功；正式 Netlify 503 與先前 AI 失敗仍須真實環境確認 |

## 測試證據

2026 年 10 月 12 日（台灣）完整離線驗收通過：typecheck、Node server production build 均通過；Vitest 419 檔、7,239 項通過，21 檔、84 項 opt-in 測試跳過，零失敗。測試耗時 308.45 秒。機器可讀摘要位於 `work/offline-acceptance/latest.json`；正式驗收仍為 `NOT_RUN`。

- 唯讀建議服務與頁面：2 檔 25 項通過；實際 Vue setup handler 與 render 測試 14 項通過。
- 產稿核准發布量測：1 檔 12 項通過。包含核准過期、同意撤回、草稿或目標變更、無效簽章、模型格式錯誤／401／超時、發布結果不確定與量測失敗。重啟後不盲目重送，量測不授予學習權限。
- 隔離 MySQL 9.5：email outbox 7 項、weekly cursor 8 項、live action 5 項，共 20 項通過，耗時 1.82 秒。這三組在一般套件中保持 opt-in 跳過，另行執行。新建資料目錄、僅 loopback、臨時限庫使用者；測試後實例已關閉，192 MB 合成資料及失敗初始化暫存已清除，可重新生成。不是正式 TiDB 相容性或災難復原驗收。
- 新增備份排程接點 8 項、離線網路界線 4 項通過。既有 AES GCM 加密、防覆寫、認證失敗、解壓大小限制與隔離還原限制的測試保留。
- 首輪全套因 sandbox 禁止 loopback listen 出現 EPERM；不算成功。取得本機權限後重跑，沒有關閉對外連線保護。
- 進度表本機瀏覽器確認：全部 23 項可讀，「本次補強」篩選為 9 項，模型詳情可展開；未將正式服務重新驗收當成已通過。產品建議卡另有實際 Vue handler 與 SSR render 測試，沒有替代正式登入後的 browser acceptance。
- `git diff --check` 通過。編譯保留既有 Browserslist／baseline 資料過舊及 `ulid.ts` BigInt target 警告，沒有為消除警告擅自升級依賴；本次 Node 22 production build 與本機 SSR runtime 測試通過。

以上為本次本機證據。10 月 10 日部署狀態及正式驗收只作歷史紀錄，本次未即時重驗雲端環境。

## 重跑離線驗收

在 `nuxt-app` 執行：

```sh
node scripts/operations/offline-acceptance.mjs --full
```

命令以 allowlist 建立子程序環境，不繼承應用秘密、`DATABASE_URL` 或正式測試旗標；Nuxt 使用 `--dotenv /dev/null`。順序為 typecheck、Node server production build、全部 Vitest。失敗即停止，安全摘要寫入 Git 未追蹤的 `work/offline-acceptance/latest.json`。`--tests-only` 只重跑測試，不能取代 build 證據；也不會合併舊的 typecheck 結果冒充本次通過。

本機 Node socket guard 允許 loopback 測試伺服器，拒絕外部 TCP 與 Unix socket。它是測試防誤連措施，不是對任意不可信程式的安全沙箱。若執行器禁止 listen，需由執行器批准本機測試，不可刪除測試或把失敗略過。

資料庫 opt-in 測試不在一般離線命令中啟用。另建空的隔離 MySQL、確認實際 data directory、使用隨機密碼與限庫使用者，再僅向該測試子程序傳遞以下變數。不要使用正式 URL 或在 shell argv／對話貼密碼。

| 測試 | opt-in 旗標 | 隔離連線變數及庫名限制 |
| --- | --- | --- |
| `managed-site-email-outbox-mysql.integration.test.ts` | `DS_RUN_PLATFORM_EMAIL_OUTBOX_MYSQL_INTEGRATION=1` | `DS_PLATFORM_EMAIL_OUTBOX_MYSQL_TEST_URL`；`ds_email_outbox_*` |
| `weekly-content-scheduler-mysql.integration.test.ts` | `DS_RUN_WEEKLY_SCHEDULER_MYSQL_INTEGRATION=1` | `DS_WEEKLY_SCHEDULER_MYSQL_URL`；`ds_weekly_cursor_*` |
| `learning-live-action-mysql.integration.test.ts` | `DS_RUN_LEARNING_LIVE_ACTION_MYSQL_INTEGRATION=1` | `DS_LEARNING_LIVE_ACTION_MYSQL_TEST_URL`；`ds_live_action_*`、port 20000 以上 |

測試只安裝隔離 fixture schema；不能將此做法當成執行正式 migration 的授權。

## 關機與不確定結果處理

`operations-shutdown.ts` 使用 Nitro close hook：停止接收新的受包裝排程，最多等待 20 秒，不自動釋放 durable lease，也不補發 provider 請求。超時只記錄固定 `OPERATIONS_DRAIN_TIMEOUT`。新程序依原有持久回執與租約恢復；需要對帳的工作維持人工處理。此保護是每個程序的任務生命週期，不是跨機器鎖，也不涵蓋所有一般 HTTP 請求。

`alert-plan.ts` 只對已知任務和 DB 產生固定代碼、嚴重度及去重鍵，不帶客戶內容或原始錯誤。Owner 頁本身不寄信，輸出保留 `externalNotificationSent=false`。獨立 operator 已有外部監測及通知實作；其設定與收件證據由 runner 另行記錄，不從 Owner 清單推定已送達。

## 備份排程接點

`scripts/operations/backup-maintenance.mjs` 不自行設定 cron 或讀取秘密。`planBackupMaintenance` 檢查明確啟用、來源指紋、1 至 168 小時間隔、上次成功時間及到期條件。`runBackupMaintenance` 需要宿主明確注入環境、Git 外唯一輸出路徑與持久 ledger adapter，才沿用 `runBackupCommand` 建立及認證加密快照。

同日新增的 `durable-ledger.mjs` 已提供 SQLite 唯一鍵、同 scope 單一工作與持久回執；`operator.mjs` 已接到此介面。記憶體 Set 僅保留為單元測試替身。未知結果不釋放 claim、不自動重送、不刪可能有效的檔案，先人工核對加密檔與回執，再明確解除後續工作。

此工具尚未在正式宿主註冊，沒有取得正式憑證，也不宣稱備份已異地保存或完成還原。開通前需設定私有持久目錄、獨立金鑰、安全儲存與保留規則，實測快照、異地副本和隔離還原。不要在應用主機短暫磁碟上假設資料可永久保存。

## 最後正式開通清單（已集中）

請以 [上線交接的「你最後一次需要準備的東西」](LAUNCH_HANDOFF_2026_10_12.md#你最後一次需要準備的東西) 為唯一整理清單，包含帳號、費用、異地資料存放授權、收件人及正式驗收門檻。

客戶一鍵建站、網域經銷、付款與大量自助開通仍依原定優先序保留而延後，沒有刪除或宣稱完成。即使四批離線通過，真實服務仍可能暴露必須修正的串接問題；正式試營運前需保留處理時間。
