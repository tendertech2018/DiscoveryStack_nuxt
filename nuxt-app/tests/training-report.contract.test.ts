import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildOwnerTrainingReport } from '../server/public-intelligence/training-report'

const reportRoute = readFileSync(new URL('../server/api/intelligence/training-report.get.ts', import.meta.url), 'utf8')
const reportPage = readFileSync(new URL('../pages/audit-lab/training-report.vue', import.meta.url), 'utf8')

describe('Owner training report contract', () => {
  it('projects the completed 101-example v2 run without raw training fields or production-gate inflation', () => {
    const report = buildOwnerTrainingReport([{
      id: 150001,
      status: 'completed',
      provider: 'google_colab_local',
      modelFamily: 'transformers',
      modelVersion: 'seo-geo-multitask-colab-v2',
      featureContractVersion: 'public-intelligence-v1',
      labelTaxonomyVersion: 'seo-geo-journey-v1',
      splitVersion: 'deterministic-id-v1',
      exampleCount: 101,
      trainCount: 74,
      validationCount: 14,
      testCount: 13,
      labelCounts: { discovery: 22, understanding: 17, response: 25, progression: 16, conversion: 21, contentTypes: { guide: 23 } },
      metrics: { test: { loss: 0.5658, journeyStage: { macroF1: 0.2333, microF1: 0.2308 }, technicalSeoSignals: { macroF1: 0.7996, microF1: 0.8889 }, journeyStageConfusionMatrix: { labels: ['conversion', 'discovery'], matrix: [[1, 0], [4, 0]] } }, rawText: 'must not be exposed' },
      modelArtifact: { baseModel: 'distilbert-base-multilingual-cased', checkpointSha256: '6c0cbf4dc64eb875ce551f05cca8072c6a70ad9f9b2fa825a93edeedf8cfc1f6', checkpointAvailability: 'owner_browser_download', taskHeads: ['journeyStage', 'technicalSeoSignals'], providerToken: 'must not be exposed' },
      baseModelId: 'distilbert-base-multilingual-cased',
      datasetDigest: 'c0cd6029382b5c9aba6baa1d348efa807758821889ce8e7b1f023ac100794569',
      completedAt: '2026-08-22T00:00:00.000Z',
    }])

    expect(report.completedRun?.split).toEqual({ train: 74, validation: 14, test: 13 })
    expect(report.completedRun?.heldOutLoss).toBe(0.5658)
    expect(report.completedRun?.headMetrics).toEqual(expect.arrayContaining([expect.objectContaining({ head: 'journeyStage', macroF1: 0.2333, microF1: 0.2308 })]))
    expect(report.completedRun?.journeyConfusionMatrix).toEqual({ conversion: { conversion: 1, discovery: 0 }, discovery: { conversion: 4, discovery: 0 } })
    expect(report.completedRun?.artifact.checkpointSha256).toHaveLength(64)
    expect(report.completedRun?.artifact.seed).toBe(20260820)
    expect(report.completedRun?.trainingSettings).toMatchObject({ maxLength: 256, batchSize: 8, epochs: 3 })
    expect(report.completedRun?.productionGate.passed).toBe(false)
    expect(report.completedRun?.labelCounts).toMatchObject({ contentTypes: { guide: 23 } })
    expect(JSON.stringify(report)).not.toContain('must not be exposed')
  })

  it('keeps the route owner-gated and excludes direct training data return paths', () => {
    expect(reportRoute).toContain('requireOwner(event)')
    expect(reportRoute).toContain('buildOwnerTrainingReport(rows)')
    expect(reportRoute).not.toContain('artifactText')
    expect(reportRoute).not.toContain('featureVector')
    expect(reportRoute).not.toContain('remoteJobId')
  })

  it('renders an explicit offline-metrics boundary and does not promise ranking, traffic or conversion gains', () => {
    expect(reportPage).toContain('離線評估')
    expect(reportPage).toContain('不代表')
    expect(reportPage).toContain('搜尋排名、生成式可見度、流量或轉換')
    expect(reportPage).toContain('AutoGEO-framework / Bailian Qwen')
  })
})
