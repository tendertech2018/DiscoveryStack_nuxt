# DS 客戶網站核心

這是客戶自己的網站，不是 DS 內部後台或公開 Astro 官網。Node 22.23.1 以上，零新增套件；每個網站各自一個 process、SQLite 檔、媒體資料夾與管理者密碼。品牌資料是 JSON，不允許 AI 加入任意程式、script 或依賴。

## 本機預览與生成

`node scripts/preview.mjs atelier`、`bloom` 或 `alignment` 可看三種品牌版型。預览僅使用新臨時資料庫與合成商品／文章／預約時段，不寄信、不扣款。預設不提供管理者登入；需要測後台時由操作者以環境設定提供專用測試密碼，不得把正式密碼放進指令歷史或截圖。

在 DS 擁有人後台「客戶交易網站」以既存 project/version 產生 manifest。將 JSON 存為 manifest.json，再執行 `node scripts/generate.mjs manifest.json <全新輸出資料夾>`。輸出包含前台、後台、資料型設定、Dockerfile 與啟動入口；不複製 DS 內部資料庫、工作階段、客戶資料或密碼，也不覆寫既有資料夾。生成不是部署或付款證據。

## 已具備的流程

- 電商：搜尋、分類、商品詳情／規格、購物車、伺服器重新計價、庫存保留、訂單查询、人工付款確認、出貨、取消／人工退款紀錄。整數分單位價格，訂單明細不可被後續商品調價改寫。
- 預約＋部落格：服務與時段、會員登入、點數帳本、原子預約、取消／改期、訪客預約申請及人工確認、草稿、發布、固定網址與版本還原。每個 resource 時段容量為一，不是多人課程或醫療排班。
- 後台：商品、訂單、服務、時段、會員點數、文章、圖片上傳、品牌外觀設定、聯絡收件匣。
- Email：每站持久化 outbox，未設定寄信不呼叫供應商；Resend 設定後可重試／冪等，不把寄送失敗誤認為付款失敗。

## 正式設定與驗收（尚未代操）

將 `.env.example` 設定透過平台安全注入；伺服器不自動讀取 .env。必須設定 HTTPS `SITE_ORIGIN`、獨立資料庫／uploads 的持久磁碟、至少 14 字管理密碼與至少 32 字隨機 session secret。Docker 容器的 `/data` 要先由平台建立並給 node 使用者寫入權；禁止使用 ephemeral disk。單個資料庫只能由一個網站身份及 mode 開啟；preview 資料庫不能改標為 production。

正式預設付款 `disabled`。經商家確認後可選 `manual` 並填寫付款指示；它不會扣款，也不保證款項已入帳。`sandbox`、`stripe_test` 不可用在 production；`stripe_live` 不可用在 preview。

Stripe Checkout adapter 已實作、僅完成 mocked provider 驗證，尚未做真實 Stripe 驗收。`stripe_test` 必須安全注入客戶商家的 `SITE_STRIPE_SECRET_KEY=sk_test_…` 與此網站 webhook 的 `SITE_STRIPE_WEBHOOK_SECRET=whsec_…`；不能沿用 DS 訂閱金流金鑰。在 Stripe 測試環境設定 HTTPS `/api/payments/stripe/webhook`，訂閱 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.expired`、`charge.refunded`。只接受原始位元組簽章、五分鐘時間窗口、相同網站／訂單／金額／幣別／模式。簽章正確的其他事件會忽略，不會改訂單。相同事件不重複出貨或回補庫存。

結帳由伺服器商品與運費重新計價，保留庫存至少 40 分鐘；外部回傳只接受 Stripe Checkout 網址。瀏覽器返回成功網址不是付款證據，訂單必須等簽署通知。逾期釋出庫存後才到帳的款項標為待對帳並阻擋出貨。退款由商家在 Stripe 操作，這版沒有自動扣款／退款 API；全額退款以通知驗證後入帳，部分退款轉人工對帳。商家後台不能把 Stripe 訂單手動標成已付款或已退款。真實收款未經另外核准與端到端驗收，不可啟用。綠界／藍新、物流商 API 與電子發票仍未接入。

訪客預約送出後提供私人管理連結（256-bit token 放在 fragment，不放 query）。資料庫只存雜湊，不用 Email 或預約 ID 代替驗證；可查詢、取消、在截止時間前改期。改期要商家重新確認，不能藉反覆改期延長保留時間；取消不代表自動退款。重複提交保留舊連結效力。會員使用原點數帳本與會員權限，兩者不混用。

Resend 必須先有經驗證的寄件網域、有效 API key 與 `RESEND_FROM`，再把 `SITE_NOTIFICATIONS_ENABLED` 設 true。客戶資料、寄件身份与 DS 自己的金流必須分開。現在 outbox 含訂單建立、會員 Email 驗證、忘記密碼與訪客預約狀態異動通知。寄信未設定時，預約畫面明確要求保留私人查詢連結，不假裝已寄信。驗證／重設連結為 30 分鐘單次 token；內容在伺服器 outbox 以 session secret 衍生的 AES-GCM key 加密，寄送完成清除正文。輪換 secret 前需處理舊佇列，不能將正式 secret 換成臨時值。定時課前提醒尚未提供，不應宣稱已完成。

反向代理必須保留原始 Host，並使用配置的完整 canonical origin；本版本不信任任何 forwarded IP header。代理後的防濫用可在入口按真實 IP 做限制；應用內 remoteAddress 限流可能對同個 proxy 共用額度。勿直接公開 HTTP、管理預览或啟用真實付款。

正式部署之前還需驗證 HTTPS／網域、cookie、跨客戶隔離、備份與還原、寄信、實際付款／退款、人工營運流程、手機排版。Cloudflare Pages 靜態發布不能部署本 Node 核心。一般 owner manifest 仍回報 `runtime_deployment_adapter_required`；Studio 確認稿已有下方的簽署發布接線，但主機未配置就保持 `dedicated_runtime_host_required`。兩者都不偽造 live release。

## Studio 確認稿 → 真正交易頁 → 發布

客戶在 Studio 確認後，選擇內建購物或預約、幣別、時區，準備並下載 `confirmed-customer-site.json`。這條路保留確認稿的設計、圖片、文案，僅把功能槽連到 `/store`、`/book`、`/journal`、`/inquiry`。不重跑模型、不複製客戶資料、不開通外部 Shopify / Google 整合，也不履行既有付費訂單。已有下單或 release 的 session 不能走此新路。

`scripts/generate.mjs` 驗證完整指紋，將 `approved-delivery.json` 和 runtime 一起交付。預覽可在全新隔離資料庫看確認稿；正式啟動不會自動發布。操作者需先配置既有專用主機、持久磁碟、正式獨立資料庫與管理密碼，填好商品／時段／聯絡方式／政策／付款模式。`SITE_RUNTIME_MODE=production`、`SITE_PAYMENT_MODE=manual` 或經授權的 `stripe_live` 是明確的操作者選擇，不能讓 preview 資料庫變成 production。

在該主機安全注入至少 43 字 URL-safe 隨機 `SITE_DEPLOYMENT_KEY`，檢查真實持久磁碟後才設 `SITE_STORAGE_DURABLE_CONFIRMED=true`。DS 平台只由操作者配置 `MANAGED_SITE_RUNTIME_TARGETS_JSON`：每筆包含精確 `sessionId`、`origin`（目前只允許 HTTPS `*.onrender.com`）、`secretEnv`（如 `SITE_RUNTIME_DEPLOY_KEY_MERCHANT_A`）、`enabled: true`。對應環境秘密需與該站一致；不把秘密寫進 registry JSON、manifest 或瀏覽器。這個 registry 不買主機、不建立帳號、不接受客戶傳入目的網址。

客戶再次確認發布後，平台先凍結確認版本，再對完整內容簽署 HMAC 並傳到 `/api/deployment`。runtime 檢查身份、語言、幣別、版本、持久儲存和營運資料，原子保存版本歷史，再切換 active 版本。平台讀回 `/health` 核對內容雜湊才標示已發布；失敗或回應不明保持凍結，重試同一版本可安全對帳。沒有主機時不呼叫外部服務。正式已確認設計不能在商家後台被直接改寫；商品庫存、時段、政策與聯絡設定仍可管理。跨版本的設計修改審核 UI 尚未串接，不能承諾上線後聊天即自動改版。

## 語言、金額與安全測試金鑰

品牌文案保留確認稿語言；交易介面目前有繁中、英文、日文、法文、西班牙文、阿拉伯文（RTL）。其他語言可預覽，但正式發布必須先有對應交易語言包；不假裝英語回退已完成在地化。商家後台的額外操作詞彙可回退英文。通知模板依網站語言產生，但實際寄信仍需寄件網域與另外驗收。

支援 TWD、USD、EUR、GBP、JPY、KRW、VND、HKD、SGD、AUD、CAD、NZD、CHF、CNY、THB、MYR、PHP、INR、IDR、AED、SAR、BRL、MXN。每站單一訂價幣別、鎖定於資料庫，不按語言猜幣別、不提供即時換匯。JPY / KRW / VND 使用整數；其他使用兩位 charge minor units（TWD 的付款不是銀行撥款單位）。Stripe 商家所在地是否支援該幣別仍需實際核對。不能透過改設定重標已有商品或訂單的幣別。

預覽站管理後台提供兩個 password 欄位貼 `sk_test_…` 與 `whsec_…`。只接受測試金鑰、管理者及同源 CSRF；以固定的獨立 `SITE_SESSION_SECRET` 衍生 AES-256-GCM key，加密保存在該站資料庫，API 不讀回明文。送出後清空欄位，儲存成功仍標記付款未驗收。現有待付款測試訂單會阻止換鑰。正式模式不接受此測試欄位，沒有真實 Stripe 驗收前不要宣稱金流完成；目前不需要客戶在聊天中提供任何金鑰。

操作者可用 `node scripts/backup.mjs <site.sqlite> <uploads> <全新備份資料夾>` 做一致的 SQLite snapshot 與媒體副本。它不覆寫來源或既存備份；備份含客戶個資，必須限制權限並保留原加密 secret。還原必須在網站停機時，先保留回復點，再把副本配置到新獨立路徑並確認 siteId／mode；禁止直接覆寫正在交易的資料庫。

舊網站資料不由 crawler 或公開頁面擅自搬遷。先由商家匯出商品／文章，確認授權與欄位；密碼、金流 token、Cookie 不搬移。會員與歷史訂單需額外經核准的遷移方案、乾跑、對帳及回復點；本版本不聲稱全平台一鍵搬家。

## 免費美術調整

正式交付後 30 天，原功能內的排版、色彩、字體与圖片配置調整免費。DS 客戶工作區可提交、查詢進度；僅從有付款／部署／工作區權威證據的交付通知計時，重新部署不延長期限。新增功能、資料搬遷、新串接及第三方費用另行確認。

## 安全測試

`node --test tests/*.test.mjs`，僅本機／記憶體 SQLite、合成資料與 mocked Email。沒有真實供應商呼叫。測試不是 production 驗收。
