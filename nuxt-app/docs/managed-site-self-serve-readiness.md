# 自助建站與客戶所選網域：驗收說明

## 2026-10-14（品牌版面落地）：J.SELECT／ÉCLAT 設計語彙接進真正生成器（本機，未部署）

本輪直接閱讀既有 ÉCLAT 與 J.SELECT 專案的首頁結構，將人像編輯版、寬幅品牌敘事、細節特寫、錯落故事區、章節索引與大字品牌落款，實作為第一方可重複生成的設計系統。不把兩個範例的商品、客戶資料、付款或圖片偷渡成新客戶的資料，也不宣稱 99.9% 相似度。

### 已接入的實際路徑

- `studio-brand-renderer.ts`／`studio-brand-styles.ts`：三種不同構圖使用同一品牌的色調與文案，不只換顏色。首頁有品牌主圖、細節圖、品牌敘事及下一步；介紹／商品服務頁保留自己的內容結構；聯絡、問答與文章索引不重複塞滿整頁主圖。FAQ、手機選單與章節跳轉不需要 JavaScript；動態有 reduced-motion 與完全靜態模式。文字、表單表面與按鈕分別計算可讀顏色，保留 RTL、鍵盤焦點與跳至內容。
- 新生成提案寫入 `studioPresentation.renderer = brand-studio-v2`，其值與文案／圖片／版型一起進入提案及不可變交付內容。舊提案沒有此欄位時繼續使用 `studio-renderer-legacy.ts`，不在部署時悄悄換版。預覽和正式靜態輸出使用同一個新版 renderer；確認後的建置測試保留選定構圖與內容，不再呼叫模型改稿。
- 參考解析能處理受限 CSS 變數、三位色碼、RGB、rem 留白及 hero 結構，先看主視覺布局，再考慮圖片數量；保留 DNS／robots／同來源 CSS／位元組與時間限制。這仍不是執行第三方 JavaScript、下載付費字體或像素級重建。
- `StudioGuidedIntake.vue`：參考網址改為直接可見的選填欄位。一次建立會先儲存新答案，再用最新 revision 分析參考，最後生成；不用多按「分析」。參考失敗會保留已存答案、不繼續付費生成；重試不重問、不重複抓已分析的網址，卸載／重複點擊不觸發額外生成。
- 品牌圖片繼續由客戶提供及確認使用權、不送文字模型、不引用對方商品圖。單張安全 WebP 上限由先前 36 KB 提高為 56 KB，仍最多兩張、1400px，仍去除 metadata，並受既有提案／會話大小限制。這不是完整商品媒體庫或自動圖片生成服務。
- 聯絡表單維持第一方端點、必填同意與防垃圾欄位；送出後的 thanks 頁也沿用同一品牌設計，且不索引。購物、預約等未啟用模組仍阻擋正式交付，不以設計完成替代功能串接。

### 驗收證據與範圍

- Nuxt typecheck、server TypeScript、node-server production build 通過。完整回歸為 **448 files passed／21 skipped；7,587 tests passed／84 skipped；0 failed**。新 renderer／一步建立／參考分析／交付／媒體等 10 檔定向回歸另為 **130 passed**。最後 RTL 圖說數字方向與手機章節編號修正另作 4 檔定向回歸，**68 passed**，並重新完成 production build。套件版本切換因離線 registry 驗證失敗，改直接執行既有已安裝的測試與建置工具；沒有停用簽章或安裝新套件。
- 真實瀏覽器：兩種品牌首頁於 **320、390、768、1440px** 均沒有整頁橫向溢出；品牌介紹、商品服務、FAQ、聯絡與 thanks 於 **390、1440px** 都有正確內容及正常寬度。主圖成功載入；另檢查阿拉伯文 RTL、無圖片版面、reduced-motion 關閉動態與平滑捲動。
- 真正工作室 Vue 元件 + 既有 intake/proposal/design/confirm 服務 + 記憶體 repository：只補兩個缺漏、貼參考、一次建立、切換構圖及手機預覽、確認完整版本、開啟同一份確認產物，皆實際操作。模型及參考抓取採固定替身，**不是 Claude 真實品質或任意參考網址驗收**。一次失敗來自測試替身 endpoint 不符合既有安全設定，修正測試設定後跑通，未放寬產品安全規則。
- 手機選單展開後可進入聯絡頁。空表單被瀏覽器必填驗證擋住；使用純測試資料向 loopback 假端點送出並轉到品牌 thanks 頁。**沒有寄出郵件，沒有寫入正式名單；這不是正式表單端點／通知送達驗收。**
- 另外檢視完整電腦／手機首頁，涵蓋故事、步驟、CTA 與頁尾，並點開手機 FAQ 查看答案。發現長章節標題會擠壓索引的兩位數編號，已固定編號寬度、禁止折行並在瀏覽器重驗；390px 編號均維持一行。
- 截圖與 responsive 檢查存於本機 Codex 驗收資料夾：`brand-studio-eclat-desktop-20261014.jpg`、`brand-studio-eclat-mobile-20261014.jpg`、`brand-studio-jselect-desktop-20261014.jpg`、`brand-studio-jselect-mobile-20261014.jpg`、`brand-studio-arabic-mobile-20261014.jpg`、`brand-studio-contact-thanks-mobile-20261014.jpg`、`brand-studio-confirmation-journey-20261014.jpg`、`brand-studio-responsive-20261014.json`。品牌範例使用原專案既有照片與固定文案，只供隔離 QA，並非新客戶的自動生成成效。
- 完整頁面截圖：`brand-studio-eclat-full-desktop-20261014.jpg`、`brand-studio-jselect-full-mobile-20261014.jpg`。

沒有更新互動進度表、動用正式 DB、遷移資料、commit／push／部署或新增費用。**這輪已把品牌設計做成可生成且接入交付的程式能力，但尚未更新正式站**。正式 Claude 生成、正式部署／網域、真實表單及通知、完整商務／預約功能仍要分別驗收。若客戶不提供照片而要求自動產生品牌圖片，另需合法圖片來源或圖片生成服務；精確字體、影片或複雜捲動場景也沒有假稱已完成。

本輪臨時本機服務及測試分頁已停止，瀏覽器尺寸與動態偏好模擬已還原；僅保留原始程式變更、截圖與驗收紀錄。

## 2026-10-14：GEO 完整版第一批實作（本機，未部署）

本輪新增三條實際路徑：初次／後續發布同步產生 `llms.txt`、`llms-full.txt`、公開 Entity map 與版本清單；客戶編輯器的發布前檢查及儲存版本比較；客戶可按月份讀取並下載的成效報告。功能、安全範圍、十三項建議的剩餘程式與瀏覽器證據記錄於 [GEO 完整版實作說明](geo-native-full-product-implementation.md)。

沒有修改互動進度表、正式資料、API 金鑰、付費方案或部署。新月報／預檢固定介面有 11 種語言，但不代表既有全站及資料庫所有流程皆已多語化。品牌事實正確率、AI 流量與歸因訂單仍為未知，不用假數字補齊。

Nuxt typecheck、server TypeScript 與 fresh node-server production build 已通過。完整 Vitest 第一輪因 sandbox 禁止 localhost listen 失敗；沒有修改或略過失敗測試，改於允許本機測試伺服器的環境執行同一套完整測試後，exit 0：**446 files passed／21 files skipped；7,568 tests passed／84 skipped；0 failed**。所有真實 provider／正式 DB 驗收仍未啟用，skipped 不列為成功。

瀏覽器實測新月報／預檢元件、版本對照、版本改變後清除舊檢查、法文桌面／阿拉伯文手機、失敗狀態、完整 CSV 與列印 CSS；固定資料並非客戶真實成效。`git diff --check` 通過，臨時服務與測試分頁已關閉，瀏覽器尺寸已還原；CSV 已從下載資料夾移到本次驗收成果資料夾。**十三項完整版仍未全部完成，正式站未更新。**

## 2026-10-14（續）：三階段旅程、精準外觀調整與實際聯絡功能（本機，未部署）

本節是下方同日記錄之後的增量，不把既有測試或原本已上線版本當成新版本已部署的證明。沒有修改互動進度表、新增付費服務、讀取正式資料、執行 migration、commit、push 或部署。

### 客戶現在怎麼操作

1. **說需求**：第一次只要說清楚品牌、服務、客群與主要目標；按「幫我建立網站」後，資料足夠便直接產生提案，缺資料才補問。已知資料預設收起，不重填。參考網站與自己的圖片放在選填區，免費手動填寫仍可使用。刷新、離題、重複點擊及失效回覆不得偷偷觸發生成。
2. **看網站與修改**：保留完整多頁預覽、手機／桌面切換、局部文字修改的比較與復原；另可直接調整品牌色、背景色、字體類型與進場效果，不呼叫 AI。外觀修改保存為新的伺服器提案，不動文案、圖片、連結，也不切換客戶選好的版型。舊的已確認版本仍保留，必須再次明確確認新版才能用於建置。
3. **確認上線資料**：工作室確認後直接進入同一頁的聯絡資料、網域、方案與授權，不再繞回九步表單。姓名與 Email 帶入網域登記欄位，但不覆蓋客戶自己改過的值；國家由客戶選，不由語言猜。送出後以原有伺服器權威取得報價，再由客戶明確建立預覽、審閱預覽與費用、前往付款。不會自動扣款、註冊網域或發布。

### 真正的功能與設計連接

- 目標為「聯絡／洽詢」時，提案與確認資料會帶入既有第一方 `contact_lead_capture`，正式編譯時接回伺服器產生的表單端點，不只換 CTA 文字。一頁式 CTA 連到同頁實際表單位置。既有隔離交付測試檢查表單端點及確認文案一致，未以真實客戶資料投稿。
- 聯絡表單的通知 Email 為選填：預填既有聯絡信箱，客戶主動寄碼、輸入六位驗證碼後才標示已綁定。沿用原有 inbox-binding 端點、寄碼間隔及伺服器驗證；未啟用寄信服務時明確告知，表單名單仍保存於後台。這次未寄送真實郵件。
- 「購物」或「預約」目標會選入實際對應模組，不能因網站類型不一致而繞過功能檢查。尚未啟用的功能在精簡頁明列，先不要求客戶填完整登記資料，也不開放付款；伺服器原有正式交付檢查保留。
- 參考風格增加受限的留白密度、圖片比例、圓角、字重、固定導覽及按鈕樣式辨識，第一方 renderer 實際採用；手機及減少動態偏好有相應規則。仍是有界 HTML/CSS 訊號，不是任意 DOM 重建、複雜動畫複製、付費字體取得或 99.9% 相似度保證。
- 新的一頁上線表單、重要費用標籤、授權提示與通知信箱操作有中／英／日／韓／法／德／西／葡／阿拉伯／印地文固定文案。對話語言與網站發布語言分開保存。**這不等於整個工作室或所有舊頁面都已翻成十種語言**；原工作室不少介面仍為中／英文，其他語言介面仍有缺口。

### 驗收與界線

- 以真實 start 頁面、Vue 元件、需求／提案／確認／儲存／報價程式在本機瀏覽器走通上述三階段。模型及資料庫使用固定回覆／記憶體資料；網域、預覽發布與付款交接使用明確標示的隔離替身，**不是外部 provider 整合成功證據**。
- 實際檢查了：一次描述直接產生、改字體不換版型、復原、聯絡表單出現在網站提案、免重填的聯絡欄位、授權需讀完才可勾選、完整 TWD 費用、重新整理保留確認網站／報價／預覽、未勾選「已檢查預覽與費用」時付款按鈕禁用、主動確認後才交接測試付款頁。桌面寬 1280、手機寬 390 的 document/body 都未超出視窗。
- 手機與桌面驗收截圖：`studio-launch-mobile-20261014.jpg`、`studio-launch-desktop-20261014.jpg`，位於本次 Codex 視覺成果資料夾，畫面明列隔離測試。這些截圖不是正式上線證明或真實 Claude 品牌文案品質認證。
- 同一真實 start 頁面的隔離語言投影，也檢查法文與阿拉伯文手機上線表單：兩者 document/body/viewport 均為 390；法文 `lang=fr`／`dir=ltr`，阿拉伯文 `lang=ar`／`dir=rtl`。這兩個驗收模式禁止任何 POST／PATCH，只檢查翻譯與排版；截圖為 `studio-launch-fr-mobile-20261014.jpg`、`studio-launch-ar-mobile-20261014.jpg`。
- 已保存的提案／確認版本可讀回；未送出的聯絡與登記欄位不寫入瀏覽器儲存。瀏覽器內的逐步復原歷史不是獨立永久版本管理介面，重新整理以伺服器已保存及確認資料為準。
- **完整購物／預約仍有程式實作缺口**：商品庫、購物車、訂單、預約庫存及對應 provider 全流程未因此完成；不能說只差 API key。真實 Claude 品質、寄信、Stripe、註冊商、Cloudflare、正式 DB 及付款後域名交付仍需另行驗收；既有主機不升級的決定未更動。

### 本輪最後的完整檢查

最後語言修正後，依序重跑 Nuxt typecheck、server TypeScript、fresh node-server production build、完整 Vitest，exit 0：**439 files passed／21 files skipped；7,495 tests passed／84 skipped；0 failed**。外部服務與正式 DB 的 skipped 測試仍是未執行，不列為 provider 驗收成功。保留原有瀏覽器資料過期與 `server/knowledge/ulid.ts` ES2019 BigInt 建置警告，沒有在本輪暗改依賴或其他引擎。

`git diff --check` 通過。已關閉本輪的臨時驗收服務及分頁、還原視窗尺寸，保留截圖與驗收紀錄；原有 `work/` 資料未動。尚未部署到 Render／Netlify，不應拿本機通過代替正式站已更新。

## 2026-10-14：記住需求、多語建站、參考網址與品牌圖片（本機實作，未部署）

本輪修改以 `codex/claude-studio-production-20261013`、`97572a6fbdaa47e6a04ee075ad729c4ba183057e` 為基準。以下是本機程式與隔離驗收證據，**不是正式站已更新、真實 Claude 品質通過或已能營運完整電商的宣稱**。沒有更新互動進度表。

### 新客戶的實際流程

1. 先用自己的語言描述生意。伺服器從本次申請已存的品牌、服務、目的與語言開始，不要求重新填寫已知資料。第一次提案的必要資訊為品牌、提供什麼、服務誰與主要目標；每次最多補問兩項缺漏。可直接填欄位，不必消耗 AI 額度；修正已存事實使用「修正這些資料」。
2. 可貼上喜歡的公開 HTTPS 網站。伺服器讀取受限的 HTML／同來源 CSS，整理色調、字體名稱、版面與動畫訊號，轉為有界的第一方設計設定。這一步不呼叫付費 AI；AI 生成器接收整理後的特徵，不接收對方的原始程式或網頁文案。
3. 可上傳自己的主圖及細節圖。客戶需確認使用權；瀏覽器先壓縮，伺服器再解碼、限制尺寸、重編成 WebP 並移除 EXIF／GPS 等資訊。圖片不送給文字模型，會綁定到提案與正式建置內容，不能在確認後由遠端圖片網址悄悄換圖。未提供照片時使用第一方品牌字母構圖，工作室提醒補圖，不在正式網頁顯示「請上傳圖片」假內容。
4. 產生完整提案，再比較三種不同結構：品牌主提案、大圖敘事、置中主視覺與資訊卡片。色調與字體類型依品牌需求或參考特徵決定，不強迫換成原本三組固定顏色。明確標示免 AI 排版與真正取得模型文案的提案；新引導路徑不能把免 AI 排版當成已完成文案直接確認交付。
5. 預設一句話只改目前頁面。伺服器逐欄比較其他頁、導航及共用內容；超出範圍則拒絕，不靠模型自稱「只改了一頁」。先看差異、確認套用，可復原。離題不更動既有資料；明顯離題連模型都不呼叫，其他由受限模型分類。不在輸入參考網址按 Enter 時偷偷產生網站。
6. 確認的是伺服器保存的完整版本。文字、設計、語言、圖片走既有正式編譯、不可變內容保存、預覽核准與部署路徑，不再次叫 AI 重寫；正式付款、網域、HTTPS 與發布驗證仍不可跳過。尚未啟用的購物／預約示意模組，在付款連結建立或重播前、正式部署前都會被擋下，付費或人工完成勾選不能把示意功能變成可用功能。

### 多語與設計的實際界線

- 模型需求整理及網站文案使用客戶語言；如果客戶另外指定網站語言，後續以另一種語言討論修改也不應把網站整站翻成別種語言。語言以 BCP-47 保存，傳到正式 SiteSpec、HTML `lang`、右至左方向、SEO、表單及感謝頁；沒有把語言等同收費市場或幣別。
- 免費／直接輸入的基本追問有中、英、日、韓、法、德、西、葡、阿拉伯及印地文文案；其他語言保存模型給出的原文追問，刷新不偷偷追加英文問題。**整個平台介面尚非全語言翻譯**：工作室主要按鈕有中／英文，部分比較標籤與後續舊訂購流程仍需國際化，不能宣稱整條購買旅程已支援每一種語言。
- 參考分析目前是「公開 HTML／CSS 特徵」，不是截圖視覺模型、瀏覽器計算後的完整樣式樹或像素比較。CSS 動態轉成受限的一次進場動效；沒有複製複雜 JavaScript、捲動時間軸、互動邏輯、商標、商品圖片、付費字體或來源程式。三種布局也不是任意網頁 DOM 重建器。**沒有 99.9% 相似度證據，也不能保證任意參考站達到這個比例。**
- 精確字體仍需合法可用字體及後續接入；目前用系統字體類型。每份提案最多兩張壓縮圖片，每張輸出最多 36 KB、邊長最多 1400，並非完整商品媒體庫或無損原圖託管。J. SELECT、ÉCLAT 是設計品質目標，不是完成全功能電商或品牌品質驗收的證明。
- **購物與預約仍有實作缺口，不只是貼 API key**。新檢查能阻擋假交付，但不會自動補出商品庫、購物車、訂單、實際預約庫存與第三方完整串接。一般品牌／內容網站沿用既有正式交付路徑；承諾商店或預約前仍需把對應模組真正做完並逐項驗收。

### 安全與保存

- 新端點仍在既有 token-bound、same-origin、no-store 的 funnel 路徑；普通 answers PATCH 不接受 `studioIntake`、設計、媒體或模型歷史。AI 額度沿用每申請每 10 分鐘 5 次，參考分析另有既有讀取額度，不新增公開跨來源權限。
- 參考網址禁私有地址、登入憑證、查詢參數及非 HTTPS；實際連線 DNS pin 到已檢查的公開地址，轉址逐跳重新驗證。頁面與樣式遵守 robots（含 `*`／結尾規則）；讀取過程不附 cookie／authorization、不執行 JS、不跟 CSS imports、不下載外部圖片或字體。超時、過大、不安全、禁止讀取時保留原需求並回報失敗。
- 需求／參考／圖片的版本與生成操作使用既有 session revision 比對；慢模型回覆不得覆蓋另一分頁的新資料。不新建 migration、不另存 secret、不改付費 provider 或部署設定。圖片端點單獨有 240 KB body 上限，其餘維持原 64 KiB；伺服器拒絕 SVG、壞圖片、動畫及非授權使用。
- 保存於既有 server-only session JSON；提案數量與總量有界，必要時移除最舊未確認版本，永遠保留最新及已確認版本。移除需求頁圖片不是刪除所有已確認／歷史版本的圖片。

### 本輪驗收證據

- 使用真實元件、服務、驗證器及編譯／交付程式，模型、付款、部署、資料庫皆用隔離 substitutes 或既有測試資料；禁止外部連線。未使用真實 Claude、未讀正式 TiDB、未讀取新 secrets，未新增付費資源、commit、push、migration 或部署。
- 最後的介面補強後，依序完成 Nuxt 型別檢查、server TypeScript、fresh node-server build、完整 Vitest：436 files／7,451 tests passed，另 21 files／84 tests skipped。Skipped 是未執行，不是 provider／DB 驗收成功。
- 瀏覽器實際操作：讀回法文已知需求、不重問；參考欄顯示特徵（固定參考資料，非真實 Shoplazza 抓取）；照片選取、壓縮、儲存、移除；離題提示後仍可用原需求；六頁提案、單頁修改的 1 項差異、套用、復原、完整版本確認。客戶的真實帳號及正式資料未參與。
- 渲染後的法文與阿拉伯文在 390 px 手機寬均為 document/body 390，無整頁橫向溢出，圖片載入成功；阿拉伯文 `dir=rtl`。網站亦於 1440 px 檢查；工作室確認畫面為 1280 px。測試採固定文案及自製插圖，不是實際 Claude 品質或 J. SELECT／ÉCLAT 視覺等級認證。
- 外站真實讀取、真實模型的語言／文案／品牌設計品質、正式資料庫競爭交易及付款→註冊網域→HTTPS→寄信→部署，**本輪均 NOT_RUN**。實際上線仍需 GitHub 版本、平台 Live、HTTP、手機／桌面互動與真實帳號證據。

### API／帳號／費用一次核對（正式驗收前）

不需要再次把已保存的 Claude 金鑰貼進聊天，也不需要為這次需求整理另買 AI 服務。正式驗收前一次核對：既有 Claude 可用額度及允許的測試預算；Cloudflare 與私有 R2／S3 託管權限；若代買網域則需 Porkbun 權限及明確網域預算；正式 Stripe 商家／webhook；寄件網域及寄信服務；不休眠的 API 與排程。下方舊清單有具體技術項目，但本輪未重新讀取線上設定，不能說它們全部缺少或全部已完成。使用者先前不升級主機的決定未被變更。另需真實品牌素材與合法字體；不能用參考站的圖片／字型授權代替。

### 最後執行結果

最後一輪完整序列 exit 0：Nuxt typecheck、server TypeScript、fresh node-server production build、**436 test files passed／21 skipped，7,451 tests passed／84 skipped，0 failed**。其中工作室相關 9 個測試檔共 131 項通過，涵蓋 Claude 介面、需求／多語、DNS pin／robots／轉址、圖片、修改、確認及交付保護。`git diff --check` 通過。Build 保留既有瀏覽器資料過期及 `server/knowledge/ulid.ts` 的 ES2019 BigInt 警告，本輪沒有把它們算成新功能修復。已關閉臨時測試服務與分頁並還原瀏覽器尺寸；原有 `work/` 資料未動。

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
| AI | 沿用使用者已保存的 Claude 金鑰與私有 provider 設定；確認可用額度即可，不需重貼金鑰 | 真實生成／修改有用量費；最後依同意的預算驗收，不另買新模型服務 |
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
