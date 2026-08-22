# AutoGEO Framework × 百煉 Qwen Provider Foundation

**狀態：** 實作依據；尚未設定 credential，尚未向百煉發送 request。

## 產品定位

DiscoveryStack 保留 AutoGEO 官方 repository `cxcscmu/AutoGEO` 的 MIT-licensed rewrite prompt 與 ruleset provenance。當以百煉 Qwen 執行時，產品名稱與 API provenance 必須如實寫為 **AutoGEO-framework / Bailian Qwen**；不得宣稱執行了 upstream 預設的 Gemini API provider，也不得宣稱使用 AutoGEO Mini。

## 官方介面與安全設定

百煉公開提供 OpenAI-compatible Chat Completions 介面，需以 `Authorization: Bearer <API key>` 帶入同地域的 API key。其 endpoint 由 region 與 Workspace ID 組成，例為：

```text
https://{WorkspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1/chat/completions
```

北京、香港、新加坡、東京、法蘭克福與美國（維吉尼亞）各自具有不同 endpoint；對具 Workspace ID 的 regional endpoint，API key 必須與 endpoint 所屬地域一致，否則會被拒絕。正式應用不得把 key、Workspace ID 以外的認證資料、或原文內容寫入 Git、client bundle、資料庫或 log。

本 provider 只接受 server-side runtime config。設計上使用明確的 endpoint allowlist，接受官方 Workspace-specific regional Model Studio domains 與文件列出的 legacy DashScope domains，但拒絕非 HTTPS、錯誤路徑、非阿里雲官方 host、query、fragment、username 或 password，以降低錯置 URL 與 SSRF 風險。每個 request 設定 hard timeout，回應僅處理 `choices[0].message.content` 與非敏感 usage metadata；不紀錄原文或 Authorization header。

## 初始模型策略

模型不硬編碼在前端。透過 server-side `NUXT_AUTOGEO_BAILIAN_MODEL` 設定，缺省值保持保守，並在每次結果的 provenance 回傳實際 model ID。百煉目前列出 Qwen 的 OpenAI-compatible text-generation models；最終商用模型、地域與 workspace 由 owner 在控制台確認其可用性、價目與資料處理條款後設定。

## 商用 operating policy

1. API adapter 僅能由現有 `requireOwner` 保護的 endpoint 呼叫。
2. 無 credential、endpoint 無效、timeout、HTTP failure 或回應結構不符時，必須 fail closed 至標示清楚的 `reference-rules-v1` fallback，絕不把 fallback 偽裝為 Qwen 或 AutoGEO 官方 Gemini 輸出。
3. 每個結果攜帶 request correlation ID、provider ID、model、usage metadata（若 provider 回傳）與非敏感錯誤分類；不輸出 key、原文、response headers 或 raw provider payload。
4. 所有產出均維持 draft 身分，仍由 owner 進行事實、引用、時效、商標、法律與品牌主張審查；heuristic comparison 不代表生成式搜尋排名、曝光、流量或轉換。
5. 任何資料庫型 telemetry、用量持久化、客戶多租戶流程、background retry、公開 SaaS、訓練或部署均不屬於目前階段。

## 官方來源

1. [阿里雲百煉：OpenAI Chat 接口兼容](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)，查閱於 2026-08-23。文件列出 regional OpenAI-compatible Chat Completions endpoint、API key 地域綁定與 `DASHSCOPE_API_KEY` 的環境變數建議。
2. [阿里雲百煉：文本生成模型 API 參考](https://help.aliyun.com/zh/model-studio/qwen-api-reference/)，查閱於 2026-08-23。文件列出 OpenAI-compatible Chat、Responses、Anthropic-compatible Messages 與 DashScope 原生介面。
3. [Alibaba Cloud Model Studio：Recommended models](https://www.alibabacloud.com/help/en/model-studio/models)，查閱於 2026-08-23。文件列出 Qwen OpenAI-compatible model IDs 與 regional base URLs。
4. [Alibaba Cloud Model Studio：First API call to Qwen](https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen)，查閱於 2026-08-23。文件要求啟用服務、接受服務條款、建立 API key、以及在相應地域取得 Workspace ID。
