# AutoGEO V1 基線研究（唯讀）

研究日期：2026-08-23。此文件只記錄公開來源與架構決策依據；不含 API key、模型權重、客戶資料或原始訓練資料。

## 官方來源與授權

| 來源 | 已確認事實 | V1 採用方式 |
|---|---|---|
| [AutoGEO 官方 GitHub](https://github.com/cxcscmu/AutoGEO) | 程式庫標示為 MIT license，提供 `autogeo` 模組、規則萃取、rewriter、evaluation 與 AutoGEO Mini 訓練腳本。 | 可借鑑或相容性整合；不直接複製 upstream 大型子模組或下載權重。 |
| [ICLR 2026 論文頁](https://proceedings.iclr.cc/paper_files/paper/2026/hash/dd5dfba659a7ec010414de1c1debdeb4-Abstract-Conference.html) | 方法為從生成式引擎偏好萃取規則，以規則驅動 prompt-based rewrite，並以 rule-based reward 訓練較低成本模型。 | V1 採用「可版本化規則 + rewrite adapter + baseline/optimized 對照」三層。 |
| [AutoGEO Mini GEO-Bench 模型卡](https://huggingface.co/cx-cmu/AutoGEO_mini_Qwen1.7B_GEOBench) | 模型卡標示 MIT，基礎模型為 Qwen3-1.7B，模型針對 `gemini-2.5-flash-lite` 與 GEO-Bench 訓練。模型卡要求在切換引擎或資料域時 post-train。 | 不把此 checkpoint 當作對 DiscoveryStack 網站成效的保證；僅以可替換 external-model adapter 支援未來經批准的 provider。 |

## AutoGEO 公開介面與限制

官方 README 描述三個核心元件：規則萃取、以規則作 context engineering 的 AutoGEO API，以及以強化學習訓練的 AutoGEO Mini。其公開評估用 GEO score 衡量可見度，GEU score 衡量 utility。官方同時明確說明：引擎、資料集或領域改變時，規則萃取與 Mini 模型需要重新適配。[1][2]

官方 repository 的 `requirements.txt` 列出 Google Generative AI、OpenAI、Anthropic、Transformers、datasets、NLTK 等依賴；其完整 Mini 訓練流程使用 SFT 與 GRPO，README 建議雙 A100 40GB 以上 GPU。V1 不安裝、執行或部署這些訓練流程，也不呼叫任何付費模型；只定義 provider-neutral adapter 與合成 smoke fixture。[1]

唯讀 source-map 亦確認，upstream 將核心能力分為 `autogeo.rewriters`（core / API / Mini）、`extract_rules` 與 `evaluation`（evaluator / generative engine / metrics / aggregate results）。`rewrite_document` 的核心抽象是「輸入 document、選擇 dataset 與 engine 或 rule path、回傳 rewritten text」；evaluation 則區分 vanilla、prompt-driven 與 Mini 模型。V1 將保留同樣的概念分層，但不耦合 upstream 的資料夾、API key、模型下載、訓練腳本或評分器實作。[1]

## V1 架構結論

V1 的成功定義不是聲稱實際提升第三方生成式搜尋的排名，而是對同一份輸入建立可重複的比較證據：保留語意與事實的檢查、規則覆蓋的變化、可讀性與結構訊號的變化，以及外部模型／評估器日後可插拔的接點。真實引擎曝光與轉換成效必須在資料治理、實驗設計、合法資料來源與 production integration 都完成後才能衡量。

> V1 不會把「規則分數變高」誤稱為 Google、ChatGPT 或其他第三方生成式引擎的真實排名提升；它只表示在已明確記錄的 heuristic 或經批准的 evaluator 下，優化前後的比較指標有所變化。

## References

[1]: https://github.com/cxcscmu/AutoGEO "cxcscmu/AutoGEO"
[2]: https://proceedings.iclr.cc/paper_files/paper/2026/hash/dd5dfba659a7ec010414de1c1debdeb4-Abstract-Conference.html "What Generative Search Engines Like and How to Optimize Web Content Cooperatively — ICLR 2026"
[3]: https://huggingface.co/cx-cmu/AutoGEO_mini_Qwen1.7B_GEOBench "AutoGEO Mini Qwen1.7B GEO-Bench model card"
