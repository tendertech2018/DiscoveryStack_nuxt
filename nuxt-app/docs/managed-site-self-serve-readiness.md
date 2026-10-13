# 自助建站與客戶所選網域：驗收說明

## 2026-10-13：Claude 及正式部署準備

本次使用者已明確要求把工作室新版部署到既有正式站，並確認持有 Claude API 金鑰。工作室新增原生 Claude Messages 介面；不改既有 Qwen／GEO／訓練設定，不新增付費資源、資料表或 secret storage API。

金鑰由使用者親自在 Render 的 **discoverystack-api → Environment** 輸入，絕不貼進聊天或公開 Astro 環境。私有設定為 `NUXT_MANAGED_SITE_STUDIO_PROVIDER=anthropic`、`ANTHROPIC_API_KEY`；預設模型 `claude-sonnet-5-5`，可用 `ANTHROPIC_MODEL` 明確選擇支援的替代版本。未切換 provider 前維持既有生成器，切換後缺金鑰則停止 Claude 呼叫、不改用別家金鑰。

貼上與儲存不是金鑰有效或真實生成品質驗收。啟用後客戶按 AI 生成／修改會消耗 Claude API 額度；本次本機測試完全隔離，不授權額外付費驗收。詳細介面與保密界線見 `../LLM_PROVIDER_OPENAI_COMPATIBLE_V1.md` 的 Claude 區段。下方未部署記錄是上一輪交付快照；正式版本是否上線以 GitHub SHA、Render Live 及 HTTP 驗證為準。

## 2026-10-13：完整確認版本接入正式交付（最新，本機實作，未部署）

現在的新工作室路徑為：**真實 AI 介面或明確免 AI 模式 → 保存完整提案 → 客戶確認版本及版型 → 建置同一份內容 → 檢查正式預覽並結帳 → 經驗證付款／網域／DNS／TLS → 正式部署及交付**。正式 provider 仍需帳號設定與真實驗收；以下不是已上線的宣稱。

- 完整 blueprint、公開 brief、企劃及來源存於既有 funnel session 的 server-only JSON；不保存 HTML，不新增 migration。最近六份提案與已確認版本有數量／512 KB 總量限制。刷新透過 token-bound `GET studio-draft` 重繪，不重複呼叫模型；一般 session projection 不回傳內部歷史。
- `POST studio-confirm` 只接受伺服器已保存的 proposal ID 與三種版型之一。普通 answers PATCH 不能寫入 studio；不同申請的 ID、變造的修改基底、已開始建置的申請都拒絕。新修改建議不會自動取代既有確認。
- 提案寫入及建置取得使用資料庫 row lock 下的 canonical JSON revision 比對，避免慢速模型回覆、另一分頁儲存或同時建置覆蓋新資料。需求／風格修改會取消原確認；正式建置開始後僅重試同一版，不能偷偷換稿。
- 確認內容採用第一方 `first_party_confirmed_studio` 編譯路徑，**不再次呼叫模型**。request identity 綁定 session、proposal、確認與版型；全頁 copy 逐欄比對相等，再走既有 artifact admission、immutable vault、preview、安全及人工核准 gate。新表單 endpoint／模組 slot 是伺服器追加的功能，付款前在最終預覽檢查，不改原公開文案。
- 版型寫入受 SiteSpec 驗證的 optional blueprint 欄位，並納入 compiled bytes／content hash。部署 renderer 直接讀 immutable bundle，避免客戶選的 bloom／alignment 到正式站變回預設 atelier；舊的 v1 bundle 沒有新欄位時仍可重驗。
- 修正已設定真實聯絡表單會被通用 artifact guard 一律擋下的斷點：僅放行已核定 origin、精確 token endpoint、指定頁面、單一份第一方編譯器完整表單；任意表單、改 action／method／欄位、重複表單、formaction／script 仍拒絕。安全 gate 如實記錄 `EXACT_FIRST_PARTY_FORM_ONLY`，不再假稱沒有任何可送出表單。
- 原有付款、網域登記、DNS/TLS、部署、客戶管理入口及重試機制未繞過；商店付款、外部預約等 manual setup／placeholder 模組不因本次接線變成完整電商能力。

測試範圍：使用真實 AI client／validator／compiler／vault interface／funnel orchestrator 與交付服務，但模型 HTTP、付款、網域、DNS 與部署均為隔離 substitutes，資料庫測試為 injected repositories。已驗證一頁式／品牌六頁／商店五頁的逐欄文案一致，版型進 immutable bundle、修改確認、刷新恢復、版本衝突、拒絕變造、正式表單 admission，以及到 production receipt 的 exact content hash。這不是外部帳號或正式 TiDB 交易驗收。

本輪驗證結果：

- 完整 Vitest：**432 files passed／21 skipped，7,364 tests passed／84 skipped**。後續僅補正客戶頁的「完整版本已確認」標籤及對應測試，再完成 **13／13** 項工作室／採用流程補測；最後一次 Nuxt typecheck 及 fresh node-server production build 亦通過。
- 瀏覽器使用實際 customer start 頁及實際 server proposal service、隔離記憶體 repository 與固定 AI transport：確認俐落科技版 → 進入聯絡資料步驟 → 刷新 → 返回工作室，版型及內容完整保留；六頁網站的一句話修訂在明確套用、確認、刷新後仍保留新標題與六頁內容。只有相同 server proposal ID 及版型顯示已確認，變更或待套用修改不會沿用舊確認標籤。
- 桌面與 390 px 手機驗證；手機 document／body width 均為 390 px，無整頁橫向溢出；console errors 為空。隔離驗收畫面明示非真實 AI／付款／部署，見 `../../work/studio-delivery-qa/confirmed-studio-desktop.jpg`。
- `git diff --check` 通過；沒有新依賴、migration、正式 DB 寫入、付費 provider 呼叫、commit／push／部署。84 項 skipped 不是正式 provider／DB 驗收成功；本輪也沒有重新核對線上帳號設定或真人 AI 文案品質。

### 一次準備的外部啟用清單

不要把金鑰貼進對話。提供帳號／服務名稱及完成設定的確認即可；密鑰由帳號管理者填入部署平台 Secrets。

| 項目 | 要準備什麼 | 費用／待驗收界線 |
| --- | --- | --- |
| AI | 既有 Qwen／相容 provider 的有效 API key、模型與可用額度；沿用私有服務設定，不必為本次接線再新增模型服務 | 真實生成／修改用量；需重新授權一次小額品質驗收，本輪零呼叫 |
| 網站託管與版本保存 | 指定 Cloudflare 帳號、Pages／Zones／DNS 權限，以及私有 R2／S3 bucket 與限 bucket 憑證 | 帳號配額與可能的用量費由實際帳號確認；本輪未開資源 |
| 自動註冊客戶網域 | 可用 Porkbun API key／secret、採購權限與餘額；每種 TLD 採購上限 | 網域費／續費；最後才以指定驗收網域及預算測試 |
| 正式收款 | 可以正式收款的 Stripe 商家帳號、server API／webhook secret、正式 webhook 設定 | 現有程式支援 Stripe；若無法開通，須先決定可用金流並另做 adapter，不能宣稱只貼金鑰就可收款 |
| 通知信與詢問表單 | 可設定 DNS 的寄件網域、已驗證寄信服務；表單 ingest origin／獨立 pepper、客戶收信綁定 | Gmail 收件地址不是寄件網域；實際寄達與垃圾信分類待驗收 |
| 全天候執行 | 不休眠的私有 API／可靠排程，以及 production DB／備份可用性 | 若仍使用休眠主機，不能承諾全天候自動交付；升級或新增付費資源需另行同意 |
| 最後實測 | 一個同意使用的驗收網域、真實登記人自行輸入、AI／付款／網域的總預算 | 真實 HTTPS、付款 webhook、網域登記、寄信、背景續跑及重試不得重扣／重買，需要實際證據 |

既有設定的完整技術欄位見下方「真實啟用需要的設定與權限」及 `MANAGED_SITE_INTERNAL_BROKER_SETUP_V1.md`。本輪沒有讀取或重新核對線上 secrets，因此不將這份清單冒稱為目前帳號「全部缺少」或「全部已就緒」。

## 2026-10-13：AI 網站企劃與修改提案（上一輪紀錄，以下斷點由最新一輪補齊）

工作室由「選三種版型」擴充為「輸入需求 → 網站企劃與各頁文案 → 比較頁面與設計 → 一句話提出修改 → 看差異、確認套用／拒絕／復原」。

- AI 為明確選擇的按鈕，旁邊說明公開資料傳送與可能的用量費；免 AI 版型仍保留，不解析或呼叫 provider。失敗時的基本架構與 AI 企劃有不同來源標籤，不能冒稱理解了客戶的生意。
- 一次模型回覆包含受眾、品牌主張、主要行動、三段訪客動線、設計建議、1–3 個待確認問題，以及有固定欄位的完整文案。引用的已知資料必須逐字出現在客戶公開 brief 或本次補充內文中；推論與文案仍標記待確認，程式不能保證模型的事實正確性。
- 一頁式／品牌與內容／商店分別有 1／6／5 個頁面可逐頁預覽；每頁三種設計共用同一份內容。切頁、換風格及裝置尺寸都不再呼叫模型。保留 sandbox 與禁止資源／腳本／表單的 CSP。
- 修訂傳送的只有公開的既有文案與獨立修改指令，指令不再附加到品牌 brief 或網頁正文。模型與瀏覽器回傳的文案均以伺服器的 pageKey、sectionId、route 完整驗證，不能新增執行碼、未知欄位或修改付款／網域／權限。
- 差異由伺服器比較實際文案，非模型自報；新提案先顯示、不覆蓋舊稿。明確套用才換成本次草稿，可拒絕或回到前版；輸入改變、重複送出、卸載後回覆、無變更與 provider 故障都有保護。修改失敗回 503，絕不拿樣板覆蓋原稿。
- 沿用單一 token-bound funnel route、同來源檢查、64 KiB request 限制與每 session 每 10 分鐘 5 次生成額度。修改內容上限 600 字，copy context 上限 28,000 bytes；沒有新增資料表、套件、CORS 或付費服務。

**上一輪的交付界線（完整文案接線已由上方最新一輪補齊）：**當時採用後只將需求、版型與首頁摘要送入既有正式流程，完整企劃／各頁文案仍是本分頁內的提案，不是已核准、可精確發布的正式版本。不能用「草稿可看」代替建置交付證據。商品圖片／網址匯入、任意拖拉、正式購物與預約也沒有因此完成。

本機 QA 使用真實元件、真實 preview service 與明確標示的固定模型回覆，不呼叫付費模型、不碰正式資料。它可驗證互動與安全界線，不能證明真實 AI 理解／文案品質或營運交付。未部署、未進行真實模型驗收。

本輪最終驗證：Nuxt typecheck、fresh node-server build 通過；完整 Vitest **429 files passed／21 skipped、7,339 tests passed／84 skipped**，其中工作室有 34 項測試。Astro check（0 errors／0 warnings，19 個既有 hints）、build 與 **89 tests** 通過。瀏覽器驗證 1280 px 桌面、390 px 手機（document/body 均為 390，無橫向溢出）、各頁切換、策略追問帶入輸入框、修改前／後的真實標題、確認套用與復原，console errors 為空。另以真實頁面腳本測試確認採用後的完整提案只保留於父頁記憶體，返回時需求相符才恢復，不新增 provider 呼叫、browser storage 或資料庫 HTML。84 個 skipped tests 不是 provider／DB 驗證通過。

## 2026-10-12：預覽優先建站工作室（第一輪紀錄，本機改造，尚未部署）

新客戶進入 `/customer/managed-sites/start`，先填品牌、公開需求及網站用途，即可看三個真正由既有靜態 renderer 產生的首頁版型。既有申請維持續填流程；也可返回工作室。官網主入口改為連到這個工作室，舊的瀏覽器概念示範保留為次要入口，沒有擴大 Astro 的跨來源 API 權限。

- 預設套版模式不解析或呼叫 AI provider；AI 按鈕明示會把公開 brief 送給既有 OpenAI-compatible provider，三版共用一次模型文案。錯誤仍有明確的 template fallback，不冒稱 AI 成功。
- 新的 `POST /api/managed-sites/funnel/sessions/:id/studio-preview` 沿用 capability token、same-origin、no-store、64 KiB body 上限與既有每工作階段每 10 分鐘 5 次生成額度。超額回 429，不拿別的需求舊稿冒充新稿。只允許 active session。
- 預覽不寫資料庫、不建立假聯絡人、不建單、不購買網域或部署。只送這次明確輸入的品牌 brief 給模型，不送既有聯絡資料或工作階段內容。三版共用經過驗證的 blueprint，HTML 使用全 sandbox 及限制資源的 CSP，移除導覽連結。
- 明確按「用這個方向」才將選中版型、需求及草稿摘要帶入既有流程；仍須填真實聯絡資料與通過功能、報價、付款、網域委託、上線檢查。既有聯絡、網域、授權及參考網址不覆寫。完整 HTML 不進資料庫。
- 支援手機／桌面預覽、需求調整、最多五個前版的復原；需求與調整不符合目前畫面時禁止採用，失敗保留舊稿。

範圍：這是「先看到成果，再繼續填寫」的第一輪改造，不等於完整電商平台。尚未包含上傳商品圖片／商品網址匯入、任意拖拉編輯或保證 AI 成效。未新增 API 服務、依賴、資料庫 migration，也未呼叫付費 AI、付款、註冊商或部署 provider。真正 AI 文案品質與正式交易交付仍要依下方條件驗收。

本輪驗證：Nuxt typecheck 與 node-server production build 通過；完整 Vitest **428 files passed／21 skipped、7,322 tests passed／84 skipped**，其中新工作室有 17 項測試。Astro check 與 production build 通過，官網 **89 tests passed**。以真實 Vue 元件及真實 preview service、隔離記憶體資料在本機瀏覽器驗證三種版型、390 px 手機／桌面、修訂後鎖定採用、上一版復原、未設定 AI 的誠實 fallback 與選擇事件；手機 document/body width 都為 390 px，無橫向溢出。正式 DB、付費模型品質與真實交易交付未驗收；跳過測試不是通過。

基準：`feature/self-serve-funnel`，疊在 `3e1b62b064bf9b3e5e2e939a95684b18346dc8cb` 上的變更。這次從原 Fresh Review 1／2／4 擴充至客戶授權的「付款後自動註冊所選網域、設定 DNS／HTTPS、正式部署與交付」。這個變更沒有新增 migration，也沒有購買網域或呼叫真實購買／部署 provider。

## 現在的完整流程

1. 客戶在第 7 步選名稱與結尾；伺服器向 Porkbun 查詢真正的可註冊狀態、一年期資格及費用。這不是保留網域。
2. 伺服器保存供應商報價與 authority；瀏覽器只能取得網域、有效期限、fingerprint 及方案中的客戶價格。
3. 客戶填寫登記人資料，勾選網站同意書與這個網域的代註冊授權。更換網域會清掉原委託。
4. 建置與付款前重新查詢。原報價過期時，仍可在同一名稱、相同 provider authority、客戶價格不變、供應商價格不超過原上限的條件下繼續。
5. Stripe webhook 的真實付款證據及商業訂單綁定通過後，排程才會採購。Stripe 測試付款不會觸發真實網域或 DNS 費用。
6. 購買只送出一個穩定的 idempotency key；真正註冊 order identity 先保存，再設定並重新讀取客戶登記資料。結果不明時停止新購買，留下待核對狀態。
7. Cloudflare 使用指定帳號建立／重用精確 zone、CNAME 與 Pages custom domain，Porkbun 設成 Cloudflare 回傳的 nameservers。每次變更前重新檢查付款與客戶委託，既有衝突設定不覆寫。
8. 正常 DNS／TLS 等待每 5 分鐘重查，最多 48 小時；不消耗一般失敗重試次數。無法完成時顯示可處理的狀態。
9. 正式部署到同一個 Pages project。只有客戶所選網址的 HTTPS、正式 deployment identity 與首頁內容全部驗證，才回傳 `liveUrl`。
10. 成功頁交換受限的 editor session 後清除同一份漏斗 token；刷新後可透過 HttpOnly cookie 查看進度與管理入口。此工作階段依既有政策為 8 小時，跨裝置或到期後仍使用既有邀請機制；未新增自助帳號恢復寄信。

## 真實啟用需要的設定與權限

下列是程式要求，並非已完成的外部驗證。只有環境變數存在，也不能證明 provider authority、資料庫 schema 或權限已就緒。

| 項目 | 必要條件 |
| --- | --- |
| 平台擁有人 | `OWNER_OPEN_ID` 能由伺服器解析成受控的 database owner |
| 持久化 | 既有 funnel、order、release、receipt、attempt、domain claim、audit、membership/session 資料表可用；此次沒有新增或套用 migration |
| 網域採購上限 | `MANAGED_SITE_FUNNEL_DOMAIN_PROCUREMENT_POLICY_JSON`：每個開放 TLD 各設定 `{ "currency": "USD", "maxAmountMinor": 正整數美分 }`；沒有設定的 TLD 不開放採購，沒有隱含匯率換算 |
| 註冊商 | 已驗證 `domain_registration`，provider `porkbun`，identity `porkbun:production`；官方 endpoint、可解析 `{ apiKey, secretApiKey }` 的 credential reference、足夠餘額與帳號/API 註冊及網域管理權限 |
| Stripe | 預設僅允許測試金鑰。正式收費需明確 `MANAGED_SITE_FUNNEL_STRIPE_LIVE_MODE=true`，並完成 verified live provider／webhook／訂單綁定；只有設定旗標不會授權購買 |
| 網站生成與檔案 | 新工作室使用既有 AI client 生成提案，確認後由第一方編譯器保存同一稿；舊非工作室路徑仍需已驗證生成器。兩者皆需 `DISCOVERYSTACK_MANAGED_SITE_VAULT_JSON` 指定的 S3 相容 immutable vault 與存取權 |
| Cloudflare broker | `DISCOVERYSTACK_MANAGED_SITE_INTERNAL_BROKER_JSON` 的指定 accountId、projectPrefix 與 deployment／DNS／Cloudflare credential references；對應部署、DNS provider 必須 verified |
| Cloudflare token | 可讀指定帳號的 zone，建立新 zone、DNS record，以及 Pages project／custom domain。resource scope 必須涵蓋未來新增的 zone，不能只限既有單一 zone |
| 排程 | 部署平台實際執行 Nitro tasks；相同 cron 的工作現已累加，預設建站檢查為每 5 分鐘 |
| 公開預算 | `MANAGED_SITE_FUNNEL_DAILY_BUILD_LIMIT` 預設 20，0 暫停；過期專案重試使用持久化 audit 重新佔當日一格 |

新網域目前只開放非 premium、一年期、API 可註冊且不需要額外 registry 地址驗證的種類。持有人必須配合註冊商要求完成驗證信；系統不會自行宣稱已完成這個人工驗證。客戶已有的網域需要其所有權與 DNS 權限，因此維持既有驗證流程。

官方合約參照：[Porkbun API](https://porkbun.com/api/json/v3/spec)、[Porkbun domain API 說明](https://porkbun.com/llms/domain)、[Cloudflare Create Zone](https://developers.cloudflare.com/api/resources/zones/methods/create/)、[Cloudflare Pages domain](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/create/)、[Cloudflare DNS record](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)。

## 最後的真實驗收

需要明確選定的驗收網域、購買預算、客戶在網頁輸入的真實登記資料，以及允許配置的驗收環境。不要用合成測試的假付款證據購買真實網域，也不要把 preview 的 `.pages.dev` 網址當作網域交付證明。

真實驗收應保留以下可追溯證據（不包含原始 token、金鑰或完整個資）：

- 客戶選定網域與同意 fingerprint、Stripe webhook、paid order／release 對應。
- 唯一 Porkbun order、customer contacts readback、domain claim。
- Cloudflare zone/account/project/domain identity、nameservers readback、DNS／TLS receipt。
- 正式 deployment identity，以及客戶選定網址回傳預期首頁的 HTTPS 驗證。
- 關閉瀏覽器仍由排程完成，重試沒有第二筆採購；付款後的管理入口與 token 清除正常。

本機 `pnpm test:safe`（typecheck、node-server build、Vitest）與合成整合只能驗證程式和邊界；真實 provider、資料庫、付款與網域交付仍需上述流程的實際證據。

## 本次驗證結果（2026-09-08）

- `pnpm test:safe` 因 package manager registry 簽章無法驗證而拒絕執行，未略過這項安全檢查。依既定 fallback 使用 repository 的本機二進位：Nuxt typecheck 通過；Vitest 合計 **213 files passed／15 files skipped；4,480 tests passed／28 tests skipped**。其中需要綁定 `127.0.0.1` 的 3 個檔案在允許本機 socket 的環境重跑，5 個測試全部通過。
- 包含真實 wizard 程式的 4 個行為測試、完整已付款→網域註冊→DNS/TLS→正式部署合成整合，以及 owner 固定 H3 路由的既有完整旅程。
- 3 個子代理完成分工與交叉審查；可重現的配額、Stripe 重播、token 清除、排程覆蓋、報價到期、未確認採購重試、DNS 等待與付款後網域不可用問題已修正。
- 最終範圍為 `nuxt-app` 內的 managed-site 自助建站、網域、付款、部署、UX/UI、測試與這份文件；`git diff --check` 通過。
- 真實 Stripe／Porkbun／Cloudflare／S3／網域交付：**未執行**；資料庫僅完成下方唯讀設定與資料表存在性檢查，未執行真實交易整合。28 個 skipped tests 不能當作通過或外部上線證明。
## 外部啟用狀態

本機與合成測試不包含真實 Stripe 收費、Porkbun 採購、Cloudflare DNS／TLS 寫入或正式網站交付，因此不能標記正式自動交付已完成驗收。上線前仍須在受控環境依「真實啟用需要的設定與權限」配置 provider authority、credential references 與採購政策，再以明確同意的驗收網域完成端到端證據。
