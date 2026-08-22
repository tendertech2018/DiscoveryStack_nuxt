type UnknownRecord = Record<string, unknown>

type TrainingRunLedgerRow = {
  id: number
  status: string
  provider: string | null
  modelFamily: string | null
  modelVersion: string | null
  featureContractVersion: string | null
  labelTaxonomyVersion: string | null
  splitVersion: string | null
  exampleCount: number | null
  trainCount: number | null
  validationCount: number | null
  testCount: number | null
  labelCounts: unknown
  metrics: unknown
  modelArtifact: unknown
  baseModelId: string | null
  datasetDigest: string | null
  completedAt: Date | string | null
}

type NumericTree = number | NumericTree[] | { [key: string]: NumericTree }
type JourneyConfusionMatrix = Record<string, Record<string, number>>

const TASK_HEADS = ['journeyStage', 'searchIntents', 'contentTypes', 'audienceRoles', 'geoSignals', 'citationReadiness', 'technicalSeoSignals', 'frictionSignals', 'actionPriority'] as const
const JOURNEY_STAGES = ['discovery', 'understanding', 'response', 'progression', 'conversion'] as const
const BLOCKED_NUMERIC_KEYS = /^(?:text|rawText|trainingText|prompt|input|example|featureVector|token|secret|email|message|url|remote|weight)$/i
const V2_VERIFIED_RECEIPT = {
  runId: 150001,
  modelVersion: 'seo-geo-multitask-colab-v2',
  datasetDigest: 'c0cd6029382b5c9aba6baa1d348efa807758821889ce8e7b1f023ac100794569',
  checkpointSha256: '6c0cbf4dc64eb875ce551f05cca8072c6a70ad9f9b2fa825a93edeedf8cfc1f6',
  seed: 20260820,
  settings: { maxLength: 256, batchSize: 8, epochs: 3, learningRate: '2e-5', weightDecay: 0.01, multiLabelThreshold: 0.5 },
} as const

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown, maxLength = 256) {
  return typeof value === 'string' && value.length <= maxLength ? value : null
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function firstText(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = textValue(record[key])
    if (candidate) return candidate
  }
  return null
}

function firstNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = numberValue(record[key])
    if (candidate !== null) return candidate
  }
  return null
}

function numericTree(value: unknown, depth = 0): NumericTree | null {
  if (depth > 5) return null
  const number = numberValue(value)
  if (number !== null) return number
  if (Array.isArray(value)) {
    const values = value.map(item => numericTree(item, depth + 1)).filter((item): item is NumericTree => item !== null)
    return values.length === value.length ? values : null
  }
  if (!isRecord(value)) return null
  const output: Record<string, NumericTree> = {}
  for (const [key, item] of Object.entries(value)) {
    if (BLOCKED_NUMERIC_KEYS.test(key)) continue
    const safe = numericTree(item, depth + 1)
    if (safe !== null) output[key] = safe
  }
  return Object.keys(output).length ? output : null
}

function findHeadMetrics(metrics: UnknownRecord) {
  const candidates = [
    metrics,
    isRecord(metrics.perHead) ? metrics.perHead : null,
    isRecord(metrics.headMetrics) ? metrics.headMetrics : null,
    isRecord(metrics.taskMetrics) ? metrics.taskMetrics : null,
    isRecord(metrics.heldOut) ? metrics.heldOut : null,
    isRecord(metrics.test) ? metrics.test : null,
    isRecord(metrics.evaluation) && isRecord(metrics.evaluation.perHead) ? metrics.evaluation.perHead : null,
  ].filter((item): item is UnknownRecord => item !== null)

  return TASK_HEADS.flatMap(head => {
    const row = candidates.map(candidate => candidate[head]).find(isRecord)
    if (!row) return []
    const macroF1 = firstNumber(row, ['macroF1', 'macro_f1', 'f1Macro', 'f1_macro'])
    const microF1 = firstNumber(row, ['microF1', 'micro_f1', 'f1Micro', 'f1_micro'])
    const loss = firstNumber(row, ['loss', 'heldOutLoss', 'held_out_loss'])
    if (macroF1 === null && microF1 === null && loss === null) return []
    return [{ head, macroF1, microF1, loss }]
  })
}

function findJourneyConfusion(metrics: UnknownRecord): JourneyConfusionMatrix | null {
  const journey = isRecord(metrics.journeyStage) ? metrics.journeyStage : null
  const test = isRecord(metrics.test) ? metrics.test : null
  const candidate = metrics.journeyStageConfusionMatrix ?? metrics.journey_confusion_matrix ?? test?.journeyStageConfusionMatrix ?? test?.journey_confusion_matrix ?? journey?.confusionMatrix ?? journey?.confusion_matrix
  if (!isRecord(candidate) || !Array.isArray(candidate.labels) || !Array.isArray(candidate.matrix)) return null
  const labels = candidate.labels
  if (!labels.length || labels.some(label => typeof label !== 'string' || !(JOURNEY_STAGES as readonly string[]).includes(label))) return null
  if (candidate.matrix.length !== labels.length || candidate.matrix.some(row => !Array.isArray(row) || row.length !== labels.length)) return null
  const output: JourneyConfusionMatrix = {}
  for (let rowIndex = 0; rowIndex < labels.length; rowIndex += 1) {
    const rowLabel = labels[rowIndex] as string
    output[rowLabel] = {}
    for (let columnIndex = 0; columnIndex < labels.length; columnIndex += 1) {
      const value = numberValue((candidate.matrix[rowIndex] as unknown[])[columnIndex])
      if (value === null) return null
      output[rowLabel][labels[columnIndex] as string] = value
    }
  }
  return output
}

function safeArtifact(modelArtifact: unknown, baseModelId: string | null) {
  const artifact = isRecord(modelArtifact) ? modelArtifact : {}
  const taskHeads = Array.isArray(artifact.taskHeads)
    ? artifact.taskHeads.filter((value): value is typeof TASK_HEADS[number] => typeof value === 'string' && (TASK_HEADS as readonly string[]).includes(value))
    : []
  return {
    provider: firstText(artifact, ['provider']),
    engine: firstText(artifact, ['engine']),
    baseModel: baseModelId || firstText(artifact, ['baseModel', 'base_model']),
    checkpointSha256: firstText(artifact, ['checkpointSha256', 'checkpoint_sha256', 'checkpointHash', 'checkpoint_hash']),
    checkpointAvailability: firstText(artifact, ['checkpointAvailability', 'checkpoint_availability', 'storage', 'storageType']),
    seed: firstNumber(artifact, ['seed', 'randomSeed', 'random_seed']),
    taskHeads,
  }
}

function verifiedReceipt(row: TrainingRunLedgerRow, artifact: ReturnType<typeof safeArtifact>) {
  if (row.id !== V2_VERIFIED_RECEIPT.runId || row.modelVersion !== V2_VERIFIED_RECEIPT.modelVersion) return null
  if (row.datasetDigest !== V2_VERIFIED_RECEIPT.datasetDigest || artifact.checkpointSha256 !== V2_VERIFIED_RECEIPT.checkpointSha256) return null
  return { seed: V2_VERIFIED_RECEIPT.seed, settings: V2_VERIFIED_RECEIPT.settings }
}

function safeCompletedAt(value: Date | string | null) {
  if (value instanceof Date) return value.toISOString()
  return textValue(value, 64)
}

/**
 * Projects a completed 101-example v2 ledger row to an owner-only read model.
 * It deliberately excludes training text, feature vectors, credentials, remote IDs,
 * provider URLs, model bytes and any non-numeric metric payload.
 */
export function buildOwnerTrainingReport(rows: readonly TrainingRunLedgerRow[]) {
  const completedV2 = rows.find(row => row.status === 'completed' && row.exampleCount === 101 && (row.modelVersion || '').toLowerCase().includes('v2'))
  if (!completedV2) return { reportVersion: 'owner-training-report-v1', completedRun: null }

  const metrics = isRecord(completedV2.metrics) ? completedV2.metrics : {}
  const labelCounts = numericTree(completedV2.labelCounts)
  const artifact = safeArtifact(completedV2.modelArtifact, completedV2.baseModelId)
  const receipt = verifiedReceipt(completedV2, artifact)
  const totalExamples = completedV2.exampleCount || 0
  const productionMinimumExamples = 150
  const productionMinimumPerStage = 20
  const productionGate = totalExamples >= productionMinimumExamples && isRecord(completedV2.labelCounts)
    && Object.values(completedV2.labelCounts).every(value => {
      const count = numberValue(value)
      return count !== null && count >= productionMinimumPerStage
    })

  return {
    reportVersion: 'owner-training-report-v1',
    completedRun: {
      id: completedV2.id,
      provider: completedV2.provider,
      modelFamily: completedV2.modelFamily,
      modelVersion: completedV2.modelVersion,
      featureContractVersion: completedV2.featureContractVersion,
      labelTaxonomyVersion: completedV2.labelTaxonomyVersion,
      splitVersion: completedV2.splitVersion,
      datasetDigest: completedV2.datasetDigest,
      completedAt: safeCompletedAt(completedV2.completedAt),
      split: { train: completedV2.trainCount, validation: completedV2.validationCount, test: completedV2.testCount },
      labelCounts,
      heldOutLoss: firstNumber(metrics, ['heldOutLoss', 'held_out_loss', 'testLoss', 'test_loss', 'loss']) ?? (isRecord(metrics.test) ? firstNumber(metrics.test, ['loss', 'heldOutLoss', 'held_out_loss']) : null),
      headMetrics: findHeadMetrics(metrics),
      journeyConfusionMatrix: findJourneyConfusion(metrics),
      artifact: { ...artifact, seed: artifact.seed ?? receipt?.seed ?? null },
      trainingSettings: receipt?.settings ?? null,
      productionGate: {
        passed: productionGate,
        minimumExamples: productionMinimumExamples,
        minimumPerStage: productionMinimumPerStage,
        reason: productionGate ? null : `Development evidence only: ${totalExamples} governed examples do not satisfy the production gate of ${productionMinimumExamples} examples and ${productionMinimumPerStage} per journey stage.`,
      },
    },
  }
}
