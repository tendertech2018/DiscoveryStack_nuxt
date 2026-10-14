# GEO 完整版：實作範圍與驗收證據

更新：2026-10-14。這是工程交付記錄，不是新的互動進度表，也不是正式上線公告。

基準為 `codex/claude-studio-production-20261013` / `97572a6fbdaa47e6a04ee075ad729c4ba183057e` 上既有未提交工作。保留所有原有 studio 修改及 `work/`；本輪沒有 commit、push、部署、migration、正式 DB 查詢、寄信、付費模型呼叫或新增付費資源。

## 本輪接通的三條實際流程

### 1. 發布的網站與給 AI 閱讀的資料同步

`server/managed-sites/public-knowledge.ts` 由正式 renderer 的最終 HTML 主內容產生：

- `llms.txt`：網站與頁面導覽。
- `llms-full.txt`：目前可索引頁面的可見主內容。
- `site-entity-map.json`：共用的 Organization / WebPage 身分、語言與來源 URL。
- `site-knowledge-manifest.json`：每個檔案與每頁內容的 SHA-256，以及整組版本識別。

初次建站接在 `live-connectors/internal-broker/static-renderer.ts`；後續頁面修改與已核准文章發布，接在 `page-editor/static-renderer.ts` 最後一步，必須等覆寫頁面及文章都完成才重新產生。因此不會使用舊 blueprint 內容冒充目前已發布內容。renderer fingerprint 納入知識輸出版本。

JSON-LD 共用 Organization 產生函式，正式 HTML 提供 `rel="describedby"` 連到 `llms.txt`。格式參考 [llms.txt 官方提案](https://llmstxt.org/)，不聲稱該檔案能控制所有爬蟲或保證引用。

不輸出私有來源 ID、原始 blueprint、模型溯源欄位、表單端點、隱藏輸入值、未顯示 FAQ 或 noindex 頁面。不自行創造商品價格、評價、規格或事實證明。所有文字均逸出，主內容解析只適用於我們自己的受控 renderer，不是任意網站爬蟲。輸入 HTML 總量上限 16 MiB，輸出資料總量上限 8 MiB，超限拒絕而非悄悄截斷。

**界線：**這是同一次發布的內容投影與版本識別，不是獨立查證後的完整品牌實體資料庫，也尚不是持久保存每一版 `llms.txt` 的歷史瀏覽器。頁面前後對照見下一節。

### 2. 編輯器的發布前檢查與儲存版本比較

客戶在既有網站編輯器可按「檢查這個版本」。新端點：

`POST /api/managed-sites/editor/pages/:pageId/preflight`

- 身分及網站範圍只取自客戶登入；同來源、2048-byte 請求限制、欄位白名單、private/no-store/noindex。
- 請求只接受目前版本號與可選的前一版號，不接受 owner、完整文件、任意網址或發布指令。
- 從同一網站讀取真實已存草稿，以 publish-mode compiler 檢查圖片版本、公開權利、響應式定義與文件完整性；此步不發布。
- 比較前一儲存版（或指定更早版本）的文字、區塊、圖片綁定、設計與 SEO 設定。圖片換同一 asset 的新版本也會列為修改。
- 檢查期間及 UI 草稿版本變動時，過期檢查結果失效，不會繼續呈現舊的通過狀態。
- 聯絡表單缺姓名、Email 或留言欄位，會在 `createPagePublicationIntent` 入列前以及 publication worker 呼叫外部服務前再次擋下。
- 預約詢問不是時段確認／付款；無可見內容、noindex、缺少主要行動與排程均列為提示。

新檢查介面提供英、繁中、簡中、日、韓、法、德、西、葡、阿拉伯與印地文固定文案。舊編輯器其他面板尚未因此全面翻譯。

**界線：**通過的是明確列出的程式檢查，不是手機／桌面實景、美感、外部連結、表單真實收件、商業事實或 AI 引用機率認證。比較基準是「儲存版本」，不是未經發布回條證實的「目前正式版本」。既有復原草稿、核准與發布回條機制不被取代。

### 3. 客戶可用的月份成效報告

入口：`/customer/managed-sites/report`，既有「我的網站」已加入導覽。

`GET /api/managed-sites/customer/monthly-report?month=YYYY-MM`

- 依伺服器確認的付費專案、有效訂閱／功能權限、所屬 Content Operations client，以及唯一且相同網域的 active visibility project 取得資料。
- 新的資料庫讀取實作使用 repeatable-read / read-only 交易。所有關聯皆限定 owner / project，不接受客戶傳入其他租戶 ID 或網域。
- 按客戶時區的真正月份統計，涵蓋 DST 與月份長度；不以最近 20 筆或固定 30 天假裝月報。
- 只計入 completed、manual_verified 且目前仍 approved 的觀測；任一撤回會排除。Provider API 測試不是人工核實的真實搜尋觀測。
- 問題文字從該觀測綁定的不可變版本取得，不用後來改過的問題冒名替換。沒有歷史快照時明列未知。
- 提供提及率、網站引用率、95% Wilson 區間、模型／語言分組、觀測覆蓋及下一步。樣本不足顯示未知，單一樣本不得當作趨勢。
- 網域引用只認精確的目標網站；引用其他網站不能算自己的成功。
- 畫面及列印摘要顯示前 25 個問題版本；CSV 包含全部，且對所有儲存格做公式注入防護。
- 讀取失敗即移除舊報告、停用下載；改月份或離開頁面後，較慢的舊回應不能覆蓋新結果。
- 新頁面提供上述 11 種固定介面語言；阿拉伯文採 RTL，分數／時間等數字序列隔離方向。

**界線：**這是客戶主動開啟的月份報告，不是排程寄信或永久凍結的月結帳冊。使用目前 active 問題集與目前審核狀態，歷史月份可能因撤回／停用而改變；API limitations 列出完整範圍，畫面標示只計目前核准的觀測。品牌事實正確率、AI 進站流量與歸因訂單尚未量測，以 `null` 表示未知，不能當作 0 或成長成效。保留每份報告的產生時間與識別碼，不把不同時間的動態查詢冒充同一凍結快照。

## 十三項完整版的剩餘工作，不混寫成只差 API

| 原建議 | 本輪範圍與剩餘程式 |
| --- | --- |
| 品牌 Entity 知識庫 | 接通公開網站資料投影及共用 Organization。仍需把現有受控 claim/source 系統完整綁到各生成流程、事實查核及 entity accuracy。 |
| llms 自動版本與差異 | 已隨初次／後續發布重建並綁定內容版本；仍缺 llms 檔案專屬的持久版本庫、歷史差異與復原 UI。 |
| GEO 發布前檢查 | 已接程式預檢、儲存版比較與表單阻擋；不是引用預測模型，事實／成效評估仍需獨立證據。 |
| 自動調整渲染策略 | 未新增依 GEO 資料切換 SSR／ISR／SSG；需適用頁面政策、效能／爬取證據、部署支援及回復機制。 |
| Answer Page | 沿用既有已核准 FAQ 文章發布路徑，並納入知識檔同步測試；未新增自動選題到審核的完整 Answer Page 商品流程。 |
| Git PR 與原始碼交付 | 保留現有 first-party Git 發布；PR 建立／檢查／核准／合併回條及客戶 source entitlement 尚未在本輪補齊。 |
| 高價值 Intent Query | 月報列出已追蹤問題的觀測缺口；不是新問題挖掘、搜尋量或商業價值排序。 |
| AI 流量到轉換歸因 | 未啟用任何新追蹤；同意、來源分類、事件去重、訂單／名單串接及歸因限制仍需實作。 |
| 失敗標籤與學習 | 月報由核准證據區分有引用／有提及未引用／未提及；未自動寫入訓練集，也沒有虛構 entity mismatch 判定。 |
| 自動月報 | 可按月份讀取、列印摘要及下載 CSV；排程、凍結快照、伺服器 PDF 與通知投遞尚未補齊。 |
| 代理商白標 | 仍需代理商租戶／子客戶權限、品牌設定、帳務、網域與資料隔離，不是只換 Logo。 |
| 行業模型提示庫 | 不在未授權時使用客戶資料訓練；仍需有來源、用途同意、撤回及評估的行業資料／規則。 |
| 多語言完整支援 | 新月報／預檢 UI 有 11 語，發布 HTML 正確保留語言與方向；既有 visibility DB 和部分內容／審核路徑仍有限定語言，尚非全市場全流程。 |

另：真正的購物車、商品／訂單／付款／物流及預約庫存仍有程式缺口，不能因前台顯示漂亮就算完成。保留原有正式交付阻擋，不以手動勾選或假資料解除。

## 驗收紀錄

- 新增及延伸的隔離測試涵蓋：同版本知識輸出、noindex／私有資料排除、原生頁面／文章更新、月份／DST、撤回、來源與問題歷史、跨租戶拒絕、超限拒絕、CSV 公式保護、實際 H3 路由、UI 競態、發布前阻擋與版本差異。
- Nuxt typecheck、server TypeScript 與 fresh node-server production build 已通過。保留既有瀏覽器資料過期與 `server/knowledge/ulid.ts` ES2019 BigInt 建置警告，未暗改依賴。
- 完整 Vitest 第一輪因 sandbox `listen EPERM` 導致 6 個測試檔失敗，其餘 440 個通過；沒有把此輪當作全綠。以允許本機測試伺服器的相同指令重跑後，exit 0：**446 files passed／21 skipped；7,568 tests passed／84 skipped；0 failed**。沒有啟用任何真實 provider／正式 DB 測試；skipped 不算成功。
- 實際 Vue 元件 + 隔離固定資料的瀏覽器驗收：法文 1365×900、阿拉伯文 390×844、RTL 數字順序、document/body 無整頁溢出、版本比較、版本更新清除舊結果、讀取失敗禁止匯出、CSV 含 31 筆問題（加標頭共 32 行）、列印 CSS 隱藏按鈕。沒有使用正式登入或正式 DB。
- 圖片與測試 CSV 保存於本次 Codex 視覺成果資料夾：`monthly-report-desktop-20261014.jpg`、`monthly-report-arabic-mobile-20261014.jpg`、`page-preflight-desktop-20261014.jpg`、`monthly-report-print-layout-20261014.jpg`、`monthly-report-fixture-2026-09.csv`。列印檢查是瀏覽器 print CSS 驗收，未聲稱已驗證伺服器 PDF 產生或真實列印裝置。
- 臨時本機服務與本輪測試分頁已關閉，viewport override 已還原。CSV 已從下載資料夾移到驗收資料夾，未刪除。`git diff --check` 通過。

## 需要外部配合的統一界線

本輪沒有需要新增 API key 或付費的步驟。後续正式驗收仍需既有帳號的有效權限、可用 AI 額度、正式資料庫權限與隔離／還原安排，以及實際寄件網域、金流、部署／網域服務的核准設定。應先盤點既有設定，再一次列出缺項；不要請使用者把秘密貼在對話。

**本輪不是十三項完整版全部完成，亦未部署正式站。** 正式環境的狀態、可用性、DB 查詢、付費 provider、付款／寄信與客戶上線均仍需對相同來源版本獨立驗收。
