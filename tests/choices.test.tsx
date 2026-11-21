import { expect, mock, test } from 'claude-code/testing'

import { CHOICE_HINT, CHOICE_REFUSED, choiceDraft, choiceOf, mergeDraft, toggleChoice } from '../hooks/choices'
import { parse } from '../hooks/markdown'
import { resolveStyle } from '../hooks/theme'
import { recordToasts, startSession } from './clipboard-env'

const reply = (text: string, requestId = 'r1') => ({
  plugin: 'prismantis',
  component: 'AssistantMessage' as const,
  requestId,
  props: { text, isFirstOfReply: true },
  viewport: { columns: 120, rows: 40 },
  surface: 'terminal' as const,
})

const ASK = 'Translate the README?\n\n- ( ) Both languages\n- ( ) Leave it\n\nWhich checks should run?\n\n- [ ] Tests\n- [ ] Snapshots\n- [x] Lint'

type Found = { key?: unknown; props: Record<string, unknown> }
const keyOf = (node: Found): string => String(node.key ?? node.props.key ?? '')
const picks = async (ui: { findAll: (q: { type: string }) => Promise<Found[]> }) =>
  (await ui.findAll({ type: 'Button' })).filter(b => keyOf(b).startsWith('pick.'))

const promptBox = (on: Parameters<typeof startSession>[1], typed = '', isFilled = true) => {
  const box = { text: typed }
  mock.env(on, {})
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  on('prompt.fill', (_, e) => {
    if (isFilled) box.text = e.text
    return { isFilled }
  })
  return box
}

const settle = () => new Promise(r => (globalThis as unknown as { setTimeout: (f: unknown, ms: number) => void }).setTimeout(r, 20))

test('choiceButtons is on unless turned off', () => {
  expect(resolveStyle({}).choiceButtons).toBe(true)
  expect(resolveStyle({ choiceButtons: false }).choiceButtons).toBe(false)
})

test('a list item that opens with ( ) is a choice, and one with [ ] stays a task', () => {
  const [list] = parse('- ( ) Yes\n- [ ] Maybe\n- (x) No', { numbers: false, paths: false })
  expect(list?.kind === 'list' && list.items.map(item => [item.choice, item.task])).toEqual([[true, undefined], [undefined, false], [undefined, undefined]])
})

test('a choice takes its question from the item above it, or from the text before the list', () => {
  const [list] = parse('1. Rename the branch?\n   - ( ) Yes\n   - ( ) No\n2. Keep going:', { numbers: false, paths: false })
  const items = list?.kind === 'list' ? list.items : []
  expect(choiceOf(items, 1, 's', 'lead')).toEqual({ id: 's.1', group: 's.q0', one: true, question: 'Rename the branch?', label: 'Yes' })
  expect(choiceOf(items, 2, 's', 'lead').group).toBe('s.q0')
  const [flat] = parse('- [ ] Tests', { numbers: false, paths: false })
  expect(choiceOf(flat?.kind === 'list' ? flat.items : [], 0, 's', 'Which checks:').question).toBe('Which checks')
})

test('picking one of a group drops the others, and several can be ticked', () => {
  const yes = { id: 's.1', group: 's.q0', one: true, question: 'Rename?', label: 'Yes' }
  const no = { ...yes, id: 's.2', label: 'No' }
  const tests = { id: 't.0', group: 't.q-1', one: false, question: 'Checks', label: 'Tests' }
  const snaps = { ...tests, id: 't.1', label: 'Snapshots' }
  expect(toggleChoice([yes], no)).toEqual([no])
  expect(toggleChoice([no], no)).toEqual([])
  expect(toggleChoice([yes, snaps], tests)).toEqual([yes, tests, snaps])
  expect(choiceDraft([yes, tests, snaps])).toBe('Rename? → Yes\nChecks → Tests, Snapshots')
  expect(choiceDraft([{ ...yes, question: '' }])).toBe('Yes')
})

test('the draft keeps what the person typed under the picked lines', () => {
  expect(mergeDraft('', '', 'Q → A')).toBe('Q → A')
  expect(mergeDraft('my note', '', 'Q → A')).toBe('Q → A\nmy note')
  expect(mergeDraft('Q → A\nmy note', 'Q → A', 'Q → B')).toBe('Q → B\nmy note')
  expect(mergeDraft('Q → A\nmy note', 'Q → A', '')).toBe('my note')
  expect(mergeDraft('edited by hand', 'Q → A', 'Q → B')).toBe('Q → B\nedited by hand')
})

test('pressing options writes the question and the answer into the prompt box', async ($, on) => {
  const box = promptBox(on, 'and bump the version')
  await startSession($, on)
  const ui = await $.ui.mount(reply(ASK))
  const buttons = await picks(ui)
  expect(buttons).toHaveLength(4)
  await ui.press({ key: keyOf(buttons[0]!) })
  await settle()
  expect(box.text).toBe('Translate the README? → Both languages\nand bump the version')
  await ui.press({ key: keyOf(buttons[1]!) })
  await settle()
  await ui.press({ key: keyOf(buttons[3]!) })
  await settle()
  await ui.press({ key: keyOf(buttons[2]!) })
  await settle()
  expect(box.text).toBe('Translate the README? → Leave it\nWhich checks should run? → Tests, Snapshots\nand bump the version')
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeDefined()
  await ui.press({ key: keyOf(buttons[1]!) })
  await settle()
  expect(box.text).toBe('Which checks should run? → Tests, Snapshots\nand bump the version')
  await ui.unmount()
})

test('a prompt box that refuses the text leaves the option unpicked and says so', async ($, on) => {
  const box = promptBox(on, '', false)
  const toasts = recordToasts(on)
  await startSession($, on)
  const ui = await $.ui.mount(reply(ASK))
  await ui.press({ key: keyOf((await picks(ui))[0]!) })
  await settle()
  expect(box.text).toBe('')
  expect(toasts).toEqual([CHOICE_REFUSED])
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
  await ui.unmount()
})

test('sending a prompt forgets the picked options', async ($, on) => {
  const box = promptBox(on)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  await startSession($, on)
  const ui = await $.ui.mount(reply(ASK))
  const first = keyOf((await picks(ui))[0]!)
  await ui.press({ key: first })
  await settle()
  await $.prompt.submit({ text: box.text, wait: false, origin: { kind: 'composer' } })
  box.text = ''
  await ui.press({ key: keyOf((await picks(ui))[1]!) })
  await settle()
  expect(box.text).toBe('Translate the README? → Leave it')
  await ui.unmount()
})

test('choiceButtons off draws no option buttons and sends no note', { options: { choiceButtons: false } }, async ($, on) => {
  const seen: unknown[] = []
  mock.env(on, {})
  on('prompt.submit', (_, e) => {
    seen.push(e.context)
    return { text: e.text, context: e.context }
  })
  await startSession($, on)
  const ui = await $.ui.mount(reply(ASK))
  expect(await picks(ui)).toHaveLength(0)
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  expect(JSON.stringify(seen)).not.toContain(CHOICE_HINT.slice(0, 40))
  await ui.unmount()
})

test('each prompt carries the note that asks for options as a list', async ($, on) => {
  const seen: unknown[] = []
  mock.env(on, {})
  on('prompt.submit', (_, e) => {
    seen.push(e.context)
    return { text: e.text, context: e.context }
  })
  await startSession($, on)
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  expect(JSON.stringify(seen)).toContain(CHOICE_HINT.slice(0, 40))
})
