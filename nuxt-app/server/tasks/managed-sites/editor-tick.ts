import { runDrizzleEditorMaintenance } from '../../managed-sites/page-editor/scheduler-drizzle'
import { runOperationsTask } from '../../operations/task-heartbeats'
export default defineTask({ meta: { name: 'managed-sites:editor-tick', description: 'Bounded leased media, visibility, retention, upload-expiry, and governed first-party publication execution.' }, async run() { return runOperationsTask('managed-sites:editor-tick', async () => ({ result: await runDrizzleEditorMaintenance() })) } })
