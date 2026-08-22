# 完整 AutoGEO 路線：官方基線研究

> 狀態：唯讀研究中。此文件只記錄官方來源可直接支持的事實；尚未批准下載權重、呼叫付費 API、fine-tuning、資料庫整合或 production deployment。

## 已確認的官方架構

AutoGEO 官方 README 將模型類型區分為：

| 官方模型類型 | 官方定義 | 對 Workbench V1 的意義 |
|---|---|---|
| `autogeo_api` | 由 **prompt-based GEO model** 產生的改寫文件 | 這是完整 AutoGEO 的主要評估／改寫路線，不代表官方已提供一個單一、可直接下載的「完整 AutoGEO checkpoint」。需要繼續確認其 API provider、成本、使用條款與實際請求介面。 |
| `autogeo_mini` | 由 cost-effective GEO model 產生的改寫文件 | 使用者已明確排除 Mini；不可將其 checkpoint、授權或執行假設套用到完整 AutoGEO 路線。 |

官方 README 同時說明，其 cost-effective 模型的訓練會由 LLaMA-Factory 開始，並把 checkpoint 寫到本地 `outputs/E-commerce/cold_start` 與 `outputs/E-commerce/grpo`。這表示公開 repo 的完整 AutoGEO 路線包含評估、prompt rewrite 與可自行訓練的 Mini 軌道；目前尚未從 README 證實有一個可直接下載、作為完整 AutoGEO 的統一自包含 checkpoint。

GitHub REST API 對官方 repository 的 license metadata 回傳 SPDX `MIT`；此結論只涵蓋 AutoGEO 程式碼本身，**不會自動授權**任何被呼叫的 Gemini、OpenAI 或 Anthropic 服務。另以官方 tree 核對後，並不存在獨立的 `autogeo_api/` 目錄；README 所稱的 `autogeo_api` 是模型類型／流程名稱，實作預期位於 `autogeo/rewriters/`，仍須逐檔確認。

逐行檢視 `autogeo/rewriters/core.py` 與 `autogeo/utils/gemini.py` 後，完整 API 改寫路線的實際機制已可確認：`rewrite_document(...)` 在未提供 `model_path` 時固定呼叫 `call_gemini(user_prompt, model_name="gemini-2.5-pro")`；後者以 `google.generativeai` SDK 執行 `genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))` 與 `model.generate_content(...)`。`engine_llm` 會選擇／載入對應的規則集，但在該 core path 中**不會把改寫器切換成 OpenAI 或 Anthropic**。因此，若要忠實採用目前公開的完整 AutoGEO API rewrite path，首個實際 provider 必須是使用者授權的 Google Gemini API，而非將現有不相關 token 或公開模型悄悄替代。

## Gemini API：商業與資料處理前提

Google 官方 Gemini API Additional Terms（生效日 2026-03-23）明示此 API 供開發者以專業／商業目的建置使用；因此 AutoGEO 的 MIT code **不排除**以 Gemini API 實作 Workbench，但必須分別遵守 Google API Terms、Gemini Additional Terms、適用的 Prohibited Use Policy 與所在地要求。此為來源／合規前提整理，不構成法律意見；正式對外商業化前應由適格法律或隱私人員覆核。

| 必要條件 | 官方來源所述 | Workbench 的設計決策 |
|---|---|---|
| Provider 身分與付款 | Gemini API key 對應 Google Cloud project；付費服務須有 active billing account。 | 不會使用匿名、借用或現有無關 token；需由 owner 明確選定並授權 provider／project。 |
| 不付費層資料風險 | Unpaid Services 的提交內容與輸出可被用於改善 Google 產品；可能有人員審閱，Google 明示勿提交 sensitive、confidential 或 personal information。 | owner-only 文本仍可能屬機密；因此不應把 Free／Unpaid tier 設成 Workbench 的預設 live path。 |
| 付費層資料處理 | 付費 Gemini API 不以 prompts／responses 改善 Google 產品；但為安全／政策執行會有限期保留 logs。濫用監控頁另列出 prompts、context 與 outputs 留存 55 天。 | 即使付費，也要在 UI 提示資料會送往 Google，並且禁止提交個資、客戶機密、合約或未獲授權的第三方文本。 |
| 對外可用性 | 條款提到向使用者提供 API Clients；EEA、瑞士與英國的 user-facing API Client 只能使用 Paid Services。 | 本階段維持 owner-only，暫不開放 SaaS；未來地區擴張前必須設地域與 billing gate。 |
| Key 安全 | 官方建議使用環境變數／安全 secret store，並要求不要 client-side 暴露或提交到版本控制。 | 只允許 server-side secret；絕不寫入 Nuxt public runtime config、前端、Git、log 或回覆。 |

## 可行性判定（截至本次唯讀研究）

**技術上可行，但尚未獲得實際付費執行授權。**完整 AutoGEO 已被忠實封裝為「server-side Gemini prompt rewrite + AutoGEO rules provenance」adapter；不過在 owner 選定 Google Cloud project／Gemini paid tier、明確授權可能產生成本的 API 呼叫，並提供 server-side secret 前，adapter 必須保持 `unavailable`，不可假裝產生 AutoGEO 結果。當 provider 不可用時，現有 deterministic rules 可僅以清楚標示的 fallback／baseline 形式運作。

官方 `keys.env.example` 列出 `GOOGLE_API_KEY`（Gemini）與 `OPENAI_API_KEY`（GPT）；official requirements 亦包含 `google-generativeai`、`openai`、`anthropic`、`python-dotenv`、`datasets`、`transformers` 與 `nltk` 等套件。這些是**研究 Python 環境**的上游依賴，不是 Nuxt production 依賴清單。由於完整改寫的官方 core path 已確認固定使用 `GOOGLE_API_KEY` 與 Gemini，本 V1 adapter 的最小合法 runtime 需求只應為 server-side Gemini credential 與 HTTP client；不得為此把 Python、PyTorch、Transformers、datasets、NLTK、任何訓練套件或 model weight 納入 Netlify／Nuxt deployment。

## 官方 source-map

| 官方檔案／模組 | 角色 |
|---|---|
| `autogeo/rewriters/api.py` | `autogeo_api` 的批次 wrapper；傳入 `engine_llm` 與文件後呼叫 `rewrite_document(...)`。 |
| `autogeo/rewriters/core.py` | 組合規則與 prompt；未提供 `model_path` 時固定走 Gemini `gemini-2.5-pro`。 |
| `autogeo/utils/gemini.py` | 以 `GOOGLE_API_KEY` 初始化 `google.generativeai`，並以 `generate_content(...)` 發出實際外部請求。 |
| `autogeo/utils/openai.py`、`autogeo/utils/anthropic.py` | 有對應 client／key helper，但不是目前 `rewrite_document(...)` 的預設實際改寫分派。 |
| `autogeo/rewriters/mini.py` | local Mini 改寫器；不納入本次完整路線。 |
| `autogeo/evaluate.py` 與 `autogeo/evaluation/*` | 統一評估框架與 GEO／GEU metrics。 |
| `autogeo/utils/hf_model.py` | Hugging Face 模型載入支援。 |
| `LLaMA-Factory/*`、`open-r1/*` | 上游訓練與 RL 相關子專案；不會直接作為網站 runtime 依賴。 |

## 目前的架構結論

完整 AutoGEO 的安全整合不應假設「下載某個 full checkpoint 即可完成」。Workbench 現在以 provider-neutral `AutoGeoApiAdapter` 封裝官方 prompt-based 改寫，並固定 upstream revision `49456df236774ea24087c44f45e9e52005b8e6a4`、官方 `Researchy-GEO / Gemini` default rules、`autogeo_api` provenance 與 `gemini-2.5-pro`。只有設定 `NUXT_AUTOGEO_GEMINI_API_KEY` 後才會優先呼叫該 adapter；未設定或 provider 失敗時，UI 和 API response 均會明確標註 `reference-fallback` 及原因。現有 rules 僅作本地、無網路 fallback／baseline。

這個 adapter 使用 Google `models/{model}:generateContent` REST endpoint，在 server-side 以 `x-goog-api-key` 傳遞 credential；該 key 沒有被加入 public runtime config，也不會寫入 Git、資料庫或 UI response。這一次只以 mock response 執行契約測試，沒有設定 secret 或發出任何付費 API request。

## 來源

1. AutoGEO 官方 README：<https://github.com/cxcscmu/AutoGEO/blob/main/README.md>
2. AutoGEO 官方程式庫：<https://github.com/cxcscmu/AutoGEO>
3. AutoGEO `api.py`（待逐行核實）：<https://github.com/cxcscmu/AutoGEO/blob/main/autogeo/rewriters/api.py>
4. AutoGEO `core.py`：<https://github.com/cxcscmu/AutoGEO/blob/main/autogeo/rewriters/core.py>
5. Gemini API Additional Terms of Service：<https://ai.google.dev/gemini-api/terms>
6. Gemini API Abuse monitoring：<https://ai.google.dev/gemini-api/docs/usage-policies>
7. Gemini API Billing：<https://ai.google.dev/gemini-api/docs/billing>
8. Gemini API key security：<https://ai.google.dev/gemini-api/docs/api-key>
