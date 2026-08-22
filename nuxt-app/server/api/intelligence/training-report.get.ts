import { getOwnerDatabaseUserId } from '../../audit/repository'
import { listOwnerTrainingRuns } from '../../public-intelligence/training'
import { buildOwnerTrainingReport } from '../../public-intelligence/training-report'
import { requireOwner } from '../../utils/auth'

export default defineEventHandler(async event => {
  const owner = await requireOwner(event)
  const ownerUserId = await getOwnerDatabaseUserId(owner.openId)
  const rows = await listOwnerTrainingRuns(ownerUserId)
  return buildOwnerTrainingReport(rows)
})
