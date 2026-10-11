# DiscoveryStack 無新增外部費用開發交接

目標是先完成 DiscoveryStack 自家平台的程式整合與離線驗收，再集中處理正式帳號、付費資源與真實服務驗收。不要把本機或模擬測試成功說成已正式上線可營運。使用者希望節省 AI 開發額度；不要每一批都重新稽核整個專案。

2026 年 10 月 12 日更新：四批已進入實作交付，新增型別化唯讀建議、明確情境選擇、失敗路徑整合測試、任務關機等待、備份排程接點、安全設定預檢及離線驗收命令。以下「工作順序」保留為驗收範圍，不再是尚未開始的待辦；目前結果與正式開通清單見 [四批離線交付驗收](OFFLINE_DELIVERY_ACCEPTANCE_2026_10_12.md)。正式付費、供應商實測與部署仍未執行。

## 接手位置

- 專案：`/Users/emilyyy/Documents/GitHub/DiscoveryStack_nuxt`。
- 2026 年 10 月 11 日接手基準分支：`codex/qwen-nullable-response-20261010`，HEAD `ca6c81fbc8aba95b0a48152874a9dd73286f40e8`。接手前重新核對，不要切換或重設使用者工作。
- 正式部署的上一輪證據指向 main `3df4f922d8552a78d9712deae23a3c032fa910f1`，不是本次即時查詢結果。
- 正式 Git remote 是 `tendertech-backup`，不是 `origin` 或 `upstream`；本階段不 push、不部署。
- `work/` 是既有未追蹤驗收資料。不要提交、上傳或刪除；也不要接觸 Git 外正式資料備份與 Keychain。
- 先查看 `git status --short --branch`、`git diff` 和適用的 `AGENTS.md`。保留所有既有變更。

## 本階段限制

允許修改本機程式、用合成資料執行隔離測試、改善介面、編譯與型別檢查。這不新增外部服務費用，但仍會使用開發 AI 的額度與本機運算資源。

不新增付費資源，不呼叫真實 AI API，不寄信、不傳 LINE、不發布、不收款、不購買網域、不存取或修改正式資料庫、不執行 migration、不更改雲端環境或秘密，不 commit、push 或部署。不要讀取 `.env` 的秘密內容，測試不可因本機存在憑證而連出。

第一個 US$1 AI 測試授權已經使用：一次 UI 提交失敗，沒有草稿或用量回執，是否抵達供應商與實際費用不明。不得重用這次授權或為了偵錯自行重試。

使用者已同意模型用途為「先提供改善建議，由我決定是否修改」。不授權自動改網站、發文、客戶資料訓練或正式模型啟用。不得降低既有學習同意、資料品質、核准與撤回門檻。

保留而延後：一鍵客戶建站、網域經銷、站內收款與大量客戶自助開通。不要刪除其程式，也不要擅自擴大本階段範圍。

## 已知狀態

截至 2026 年 10 月 10 日晚間的驗收紀錄，Render API、本人登入與 58 筆 migration ledger 核對通過；main CI 有 7140 項 Nuxt 測試通過、84 項跳過。這些都是歷史證據，不是新修改的測試結果。

AI 草稿真實驗收失敗、原因與費用未明；Netlify 正式部署的 readiness 為 503、原因未明。寄信缺寄件網域。常駐付費 API 升級被使用者拒絕。已有正式加密備份及本機隔離還原，但未完成自動異地備援與正式故障復原驗收。

學習模型不是完全沒接線：已有 `draft-advice` 到 `predict` 的 owner-only consumer，但介面主要呈現 JSON；正式模型仍受 gate 保護。不能把大型語言模型產稿與自有成效模型訓練混為一談。

## 先前完成的本機小批次

- `utils/boundedPreviewFailure.ts`：將既有安全錯誤碼轉成固定繁中說明，正確讀取 ofetch 與 Nitro 的巢狀錯誤資料，未知資料顯示 UNKNOWN，不顯示任意原始訊息、秘密或費用推測。
- `pages/audit-lab/geo.vue`：限額模式採用安全診斷說明；保留一次送出鎖、`retry: 0`，不重試、不切換服務。
- `tests/geo-bounded-preview-failure-ui.test.ts`：錯誤碼、惡意欄位、未知回應、登入區別及實際頁面 handler 的一次提交測試。
- 與既有 bounded adapter、route 測試合跑，3 檔 155 項通過。沒有真實服務呼叫。這個修補不會回溯查明上次正式失敗，也尚未部署。
- 這個先前小批次只執行 `nuxt typecheck` 與 `git diff --check`；完整驗收結果以 10 月 12 日交付紀錄為準。

## 工作順序

### 第一批 完成唯讀模型建議產品流程

從既有 consumer 擴充，不要另造平行模型系統。

主要檔案：

- `server/learning-loop/model-advice.ts`
- `server/geo-outcome-model/service.ts`
- `server/geo-outcome-model/constants.ts`
- `server/geo-outcome-model/release-gate.ts`
- `server/intervention-loop/http-router.ts`
- `pages/audit-lab/learning-loop.vue`
- `tests/learning-loop-model.test.ts`

交付明確型別的唯讀結果和容易理解的建議卡，顯示草稿版本、模型與資料來源、適用脈絡、缺少的資料與限制。缺資料、未核准、同意撤回或版本變更時，顯示具體原因，不能假造分數或建議。

既有 `getDraftLearningAdvice` 用資料集第一筆 observation 的脈絡建立預測輸入；要核對這是否符合目前草稿的 engine、interface、language、region 等條件。明確呈現脈絡來源，禁止默默借用不相容脈絡。跨篇優先順序只有在有明確可比較條件時才呈現，不能直接比較不同模型或脈絡的原始分數。

不要把特徵貢獻寫成因果改善承諾，不把 synthetic、heuristic 或 shadow prediction 說成已驗證效果。citation 模型與 content effect／GSC 模型分開處理。

驗收：owner 隔離、缺少或撤回同意、缺模型、資料集失效、草稿與證據版本漂移、模型遭竄改、相容與不相容脈絡都要測；讀取建議不得寫文章、發文或觸發訓練。加入實際 Vue handler／render 測試，而不只是 source 字串比對。

### 第二批 完成離線端到端整合

用合成第一方文章與 fake transports，串起分析、產稿、人工核准、發布回執與成效回收。先讀 `tests/weekly-content-publication-measurement.e2e.test.ts`，補缺口，不另造只會成功的假流程。

驗收成功與拒絕路徑：模型格式不合、超時、用量缺失、未核准、核准過期、草稿改版、目標不符、撤回、重複提交、發布結果不確定、量測失敗。沒有獨立學習授權時，即使發布與量測成功也不能進資料集。

用量、模型、費用估算與 provenance 要可追溯；不允許為了讓畫面成功而關閉輸出安全檢查或偷偷切換 provider。現有 Qwen 串接先保留，不需使用者另買模型或改服務商。

### 第三批 補齊自動工作與故障處理的離線證據

優先重用既有 durable job、outbox、lease、idempotency 和 budget reservation，不要只是新增一套平行排程。

起點：`server/content-operations/service.ts`、`server/managed-sites/email-outbox/runtime.ts`、`server/learning-loop/runtime.ts`、`server/operations/task-heartbeats.ts`。

用隔離測試驗證重啟、租約到期、同時領工作、防重複外部副作用、預算耗盡與人工處理佇列。供應商結果不確定時應等待對帳或人工處理，不能盲目重送。必要的資料庫交易測試只用新建隔離資料庫，絕不借正式 DB。

準備告警、備份排程和 shutdown 的可測程式接點與操作說明，不啟用真正排程，不購買 worker、Redis 或其他資源。

### 第四批 完成設定預檢與統一驗收

預檢只回報設定是否存在、是否符合格式、固定錯誤碼與安全的階段／耗時；不要回傳金鑰、連線字串、SQL、來源內容或原始錯誤。Netlify readiness 原因尚未確定，不要猜測原因、放寬 TLS、重跑 migration 或輪替秘密。

建立只需最後填入正式帳號設定即可執行的驗收清單。缺外部條件的功能明確標示 NOT_RUN 或 BLOCKED_EXTERNAL_INPUT；不要以假資料宣稱正式通過。

各批先跑變更相關測試，整合交接時才跑完整型別、build 與離線套件。若執行環境限制測試，保留實際錯誤並標示未完成，不移除保護來取得綠燈。

## 本機測試起點

在 `nuxt-app` 執行現有工具，不要為解決套件管理器問題關閉簽章檢查或更新 dependencies。

```sh
./node_modules/.bin/vitest run tests/geo-bounded-preview-failure-ui.test.ts tests/geo-bounded-preview.test.ts tests/geo-bounded-preview-route.test.ts
./node_modules/.bin/nuxt typecheck
```

Node 與套件工具版本應以專案要求及實際可用版本核對。若要測 ML 或新整合，使用既有記憶體 repository 與合成 fixtures，禁止載入正式 credential 測試旗標。

## 最後才需要使用者提供的條件

1. 確認正式試營運網站與支援的發布方式，並在管理介面完成所需授權；不要在對話貼密碼或 API key。
2. 如果保留寄信功能，提供自有寄件網域與 DNS 管理授權；已有收測試信的地址，不需重新索取。
3. GSC／GA4 的 property 識別與授權；LINE Login／LIFF／Messaging 所需的帳號設定與本人測試操作。
4. 常駐主機與 AI 月費上限；若要再做真實 AI 測試，另取得精確的一次性費用授權。歷史 US$1 授權不得重用。
5. ML 真實資料的來源權利、獨立用途同意、去識別與保留規則。介面同意提供建議不等於取得客戶訓練授權。

以上條件未備齊，不阻止離線開發，但阻止對應的正式功能驗收。正式模型有效性需要合適的真實資料與評估，不能靠接通 API 或增加合成資料宣稱完成。

## 每批交付格式

用繁體中文簡短列出已改檔案、實際執行的測試、剩餘項目，以及是否有外部副作用。保留 IMPLEMENTED、PARTIAL、NOT_RUN、UNVERIFIED 和 BLOCKED_EXTERNAL_INPUT 的區別。

更新原有進度資料時，引用實際測試證據，不按改檔數提高分數。使用者已同意唯讀建議；10 月 12 日已完成該介面及離線測試，正式模型與資料授權仍須另外驗收。

本階段完成定義：上述程式整合與離線驗收通過，未完成的外部條件有明確清單。不是正式營運完成，也不是對搜尋排名、營收或機器學習效果的保證。
