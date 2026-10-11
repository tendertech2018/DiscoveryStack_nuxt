<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEVELOPMENT_GATE, SHADOW_GATE } from '../server/geo-outcome-model/constants'
import type { WorkspaceSummary, TrainingReadinessCounts } from '../server/geo-outcome-model/types'
const props = defineProps<{ workspace: WorkspaceSummary }>()
const stage = ref<'development' | 'shadow'>('development')
const labels: Array<[keyof TrainingReadinessCounts, keyof typeof DEVELOPMENT_GATE, string]> = [
  ['candidates', 'minCandidates', '合格觀測資料'], ['queryGroups', 'minQueryGroups', '不同問題觀測組'],
  ['websites', 'minWebsites', '不同網站'], ['engines', 'minEngines', 'AI 引擎／介面'],
  ['positives', 'minPositives', '確認被引用的例子'], ['hardNegatives', 'minHardNegatives', '確認已檢索但未引用的例子'],
  ['observationSpanDays', 'minObservationSpanDays', '資料實際跨越天數'],
]
const rows = computed(() => labels.map(([key, gateKey, label]) => {
  const raw = props.workspace.trainingReadiness?.[stage.value]?.[key]
  const current = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
  const minimum = (stage.value === 'development' ? DEVELOPMENT_GATE : SHADOW_GATE)[gateKey]
  return { key, label, current, minimum, missing: current === null ? null : Math.max(0, minimum - current) }
}))
</script>

<template>
  <section class="training-readiness" aria-labelledby="training-readiness-title">
    <h2 id="training-readiness-title">機器學習：現在做到哪裡？</h2>
    <p>這裡訓練的是「內容被引用的建議模型」，不是從零訓練 ChatGPT。只有寫好程式、或網站已上線，都不代表模型已經學會。</p>
    <label for="training-stage">查看階段</label>
    <select id="training-stage" v-model="stage">
      <option value="development">第一步：建立實驗模型</option>
      <option value="shadow">第二步：核准前的影子驗證</option>
    </select>
    <p>以下只計入{{ stage === 'development' ? '已建立且可審查或已核准' : '目前已核准' }}資料集，不是所有匯入紀錄。各資料集合計達標，仍不代表單一訓練資料集通過驗證。</p>
    <div class="table-scroll"><table>
      <caption>{{ stage === 'development' ? '實驗訓練' : '影子驗證' }}資料門檻</caption>
      <thead><tr><th scope="col">項目</th><th scope="col">目前</th><th scope="col">至少需要</th><th scope="col">還缺</th></tr></thead>
      <tbody><tr v-for="row in rows" :key="row.key"><th scope="row">{{ row.label }}</th><td>{{ row.current ?? '尚無可確認數字' }}</td><td>{{ row.minimum }}</td><td>{{ row.missing === null ? '待確認' : row.missing === 0 ? '數量已達標' : row.missing }}</td></tr></tbody>
    </table></div>
    <p><strong>數量達標後，還要核准資料、隔離訓練與測試資料、檢查模型成績及回退模型。</strong> 未通過前不提供假分數、不自動改稿或發文；本表不會啟動訓練或收費。</p>
    <ol>
      <li>先在本頁登錄有授權、可核對的真實 AI 引用觀測，完成證據、同意與個資審查。</li>
      <li>到學習閉環建立資料集；不足的資料會被擋下，不會拿示範資料補足。</li>
      <li>核准合格資料後執行 CPU 訓練，再審查影子模型；核准後只提供建議，由你決定是否修改。</li>
    </ol>
    <a href="/audit-lab/learning-loop#training">前往「建立資料集／訓練與驗證」 →</a>
  </section>
</template>

<style scoped>
.training-readiness{max-width:1180px;margin:0 auto 2rem;padding:1.25rem;border:1px solid #dce3eb;border-radius:18px;background:#fff;color:#17253d}.training-readiness h2{margin-top:0}.training-readiness p,.training-readiness li{line-height:1.7;color:#53657a}.training-readiness select{display:block;max-width:100%;margin:.5rem 0;padding:.6rem;border:1px solid #a5b5c8;border-radius:8px;background:#fff;color:#17253d;font:inherit}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;font-size:.9rem}caption{text-align:left;padding:.6rem 0;font-weight:700}th,td{padding:.7rem;border-bottom:1px solid #e3e9ef}a{color:#285687;font-weight:700}
</style>
