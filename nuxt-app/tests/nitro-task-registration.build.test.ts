import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { getOperationsTaskDefinitions } from '../server/operations/task-catalog'

// Inspect built code as syntax only. Importing the production server or a task
// could start a scheduler; this test never executes either one.
const configUrl = new URL('../nuxt.config.ts', import.meta.url)
const config = ts.createSourceFile('nuxt.config.ts', readFileSync(configUrl, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const productionArtifact = fileURLToPath(new URL('../.output/server/chunks/nitro/nitro.mjs', import.meta.url))
const taskDefinitions = getOperationsTaskDefinitions(process.env)
const bindings = Object.fromEntries(taskDefinitions.map(task => [task.name, task.handlerPath]))
const flatBindings = Object.fromEntries(Object.entries(bindings).filter(([, path]) => /^\.\/server\/tasks\/[^/]+\.ts$/u.test(path)))
type Schedule = { cron: string; tasks: string[] }
type BuiltMetadata = { schedules: Schedule[]; registry: Map<string, string> }
function findNode<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T {
  let result: T | undefined
  const visit = (node: ts.Node) => { if (result) return; if (guard(node)) result = node; else ts.forEachChild(node, visit) }
  visit(root)
  if (!result) throw new Error('Required task metadata was not found; rebuild the production artifact.')
  return result
}
function initializer(root: ts.Node, name: string): ts.Expression {
  const declaration = findNode(root, (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
  if (!declaration.initializer) throw new Error(`Task metadata ${name} has no initializer.`)
  return declaration.initializer
}
function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression) ? unwrap(expression.expression) : expression
}
function object(expression: ts.Expression): ts.ObjectLiteralExpression {
  const node = unwrap(expression)
  if (!ts.isObjectLiteralExpression(node)) throw new Error('Task metadata must be a literal object.')
  return node
}
function array(expression: ts.Expression): ts.ArrayLiteralExpression {
  const node = unwrap(expression)
  if (!ts.isArrayLiteralExpression(node)) throw new Error('Task metadata must be a literal array.')
  return node
}
function text(node: ts.Node): string {
  if (ts.isStringLiteral(node) || ts.isIdentifier(node)) return node.text
  throw new Error('Task metadata must have literal names.')
}
function property(expression: ts.Expression, name: string): ts.Expression {
  const entry = object(expression).properties.find((node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && text(node.name) === name)
  if (!entry) throw new Error(`Task metadata property ${name} is missing.`)
  return entry.initializer
}
function configuredSchedules(): Schedule[] {
  const grouped = new Map<string, string[]>()
  for (const task of taskDefinitions) grouped.set(task.cron, [...(grouped.get(task.cron) || []), task.name])
  return [...grouped].map(([cron, tasks]) => ({ cron, tasks }))
}
function readBuiltMetadata(): BuiltMetadata {
  if (!existsSync(productionArtifact)) throw new Error('Production task artifact is missing. Run the node-server build before this test.')
  const built = ts.createSourceFile('nitro.mjs', readFileSync(productionArtifact, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const schedules = array(initializer(built, 'scheduledTasks')).elements.map(row => ({ cron: text(property(row, 'cron')), tasks: array(property(row, 'tasks')).elements.map(text) }))
  const registry = new Map<string, string>()
  for (const entry of object(initializer(built, 'tasks')).properties) {
    if (!ts.isPropertyAssignment(entry)) throw new Error('Unexpected compiled task registry entry.')
    const resolver = property(entry.initializer, 'resolve')
    const dynamicImport = findNode(resolver, (node): node is ts.CallExpression => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
    if (dynamicImport.arguments.length !== 1 || !dynamicImport.arguments[0]) throw new Error('Task handler has no bounded import path.')
    registry.set(text(entry.name), text(dynamicImport.arguments[0]))
  }
  return { schedules, registry }
}
function assertScheduledRegistration(expected: Schedule[], built: BuiltMetadata): void {
  for (const row of expected) for (const task of row.tasks) {
    if (!built.registry.has(task)) throw new Error(`Configured task ${task} is not registered in the production artifact.`)
    const matching = built.schedules.filter(schedule => schedule.cron === row.cron && schedule.tasks.includes(task))
    if (matching.length !== 1) throw new Error(`Configured task ${task} was dropped or duplicated in its production cron.`)
    const occurrences = built.schedules.flatMap(schedule => schedule.tasks).filter(name => name === task).length
    if (occurrences !== 1) throw new Error(`Configured task ${task} has duplicate production schedules.`)
  }
  const expectedNames = expected.flatMap(row => row.tasks).sort()
  const actualNames = built.schedules.flatMap(row => row.tasks).sort()
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) throw new Error('The production scheduler differs from the complete configured task list.')
}

describe('production Nitro task registration', () => {
  it('binds the complete catalog through absolute URL-based paths with matching task metadata', () => {
    const exported = findNode(config, ts.isExportAssignment)
    if (!ts.isCallExpression(exported.expression) || !exported.expression.arguments[0]) throw new Error('Nuxt config must contain the task registration.')
    const registered = property(property(exported.expression.arguments[0], 'nitro'), 'tasks')
    expect(registered.getText(config)).toBe('nitroTasks')
    expect(readFileSync(configUrl, 'utf8')).toContain('fileURLToPath(new URL(task.handlerPath, import.meta.url))')
    expect(Object.keys(bindings)).toHaveLength(12)
    for (const [name, relativeFile] of Object.entries(bindings)) {
      const sourcePath = fileURLToPath(new URL(relativeFile, configUrl))
      expect(existsSync(sourcePath)).toBe(true)
      const source = ts.createSourceFile(sourcePath, readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      const meta = findNode(source, (node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && text(node.name) === 'meta')
      expect(text(property(meta.initializer, 'name'))).toBe(name)
    }
  })
  it('retains every configured scheduled job and its cron in the real production registry', () => {
    const expected = configuredSchedules()
    expect(expected.flatMap(row => row.tasks)).toHaveLength(12)
    const built = readBuiltMetadata()
    expect(() => assertScheduledRegistration(expected, built)).not.toThrow()
    const taskDirectory = resolve(dirname(productionArtifact), '../tasks')
    for (const row of expected) for (const task of row.tasks) {
      const modulePath = resolve(dirname(productionArtifact), built.registry.get(task)!)
      expect(modulePath.startsWith(`${taskDirectory}${sep}`)).toBe(true)
      expect(existsSync(modulePath)).toBe(true)
    }
    expect(built.schedules.find(row => row.cron === '*/5 * * * *')?.tasks).toContain('weekly-content:tick')
    expect(built.schedules.find(row => row.cron === '*/5 * * * *')?.tasks).toContain('learning-loop:tick')
  })
  it('resolves all six flat canonical names to the original built handler, without executing it', () => {
    const built = readBuiltMetadata()
    expect(Object.keys(flatBindings)).toHaveLength(6)
    for (const [name, relativeFile] of Object.entries(flatBindings)) {
      const scannedName = relativeFile.split('/').at(-1)!.replace(/\.ts$/, '')
      expect(built.registry.has(name), name).toBe(true)
      expect(built.registry.get(name)).toBe(built.registry.get(scannedName))
    }
  })
  it('fails if a scheduled canonical name is missing even when its hyphenated file was built', () => {
    const expected = [{ cron: '*/5 * * * *', tasks: ['weekly-content:tick'] }]
    const built = { schedules: expected, registry: new Map([['weekly-content-tick', '../tasks/weekly-content-tick.mjs']]) }
    expect(() => assertScheduledRegistration(expected, built)).toThrow('not registered')
  })
  it('fails if a registered task was silently dropped from cron or registered twice', () => {
    const expected = [{ cron: '*/5 * * * *', tasks: ['weekly-content:tick'] }]
    const registry = new Map([['weekly-content:tick', '../tasks/weekly-content-tick.mjs']])
    expect(() => assertScheduledRegistration(expected, { schedules: [], registry })).toThrow('dropped')
    expect(() => assertScheduledRegistration(expected, { schedules: [expected[0]!, expected[0]!], registry })).toThrow('duplicated')
  })
})
