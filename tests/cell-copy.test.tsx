import { expect, test } from 'claude-code/testing'

import { resolveStyle } from '../hooks/theme'
import { clipboardEnv, recordCopies, recordToasts, startSession } from './clipboard-env'

const reply = (text: string) => ({
  plugin: 'prismantis',
  component: 'AssistantMessage' as const,
  props: { text, isFirstOfReply: true },
  viewport: { columns: 120, rows: 40 },
  surface: 'terminal' as const,
})

const TABLE = '| Name | Value |\n|--|--|\n| alpha beta | **42** |\n| [site](https://example.com) | ok |'

type Found = { key?: unknown; props: Record<string, unknown> }
const keyOf = (node: Found): string => String(node.key ?? node.props.key ?? '')
const cellButtons = async (ui: { findAll: (q: { type: string }) => Promise<Found[]> }) =>
  (await ui.findAll({ type: 'Button' })).filter(b => keyOf(b).endsWith('.copy'))

test('cellCopy is off unless asked', () => {
  expect(resolveStyle({}).cellCopy).toBe(false)
  expect(resolveStyle({ cellCopy: true }).cellCopy).toBe(true)
  expect(resolveStyle({ cellCopy: 'yes' }).cellCopy).toBe(false)
})

test('cellCopy makes each body cell a button that copies its plain text', { options: { cellCopy: true } }, async ($, on) => {
  clipboardEnv(on, 'other')
  const copies = recordCopies(on)
  const toasts = recordToasts(on)
  await startSession($, on)
  const ui = await $.ui.mount(reply(TABLE))
  const buttons = await cellButtons(ui)
  expect(buttons).toHaveLength(3)
  await ui.press({ key: keyOf(buttons[0]!) })
  await ui.press({ key: keyOf(buttons[1]!) })
  expect(copies).toEqual(['alpha beta', '42'])
  expect(toasts).toEqual(['Copied', 'Copied'])
  await ui.unmount()
})

test('cellCopy leaves header cells and cells with links alone', { options: { cellCopy: true } }, async ($, on) => {
  clipboardEnv(on, 'other')
  await startSession($, on)
  const ui = await $.ui.mount(reply(TABLE))
  const texts = await Promise.all((await cellButtons(ui)).map(async b => JSON.stringify(b.props)))
  expect(texts.some(t => t.includes('Name') || t.includes('Value') || t.includes('site'))).toBe(false)
  await ui.unmount()
})

test('cellCopy reaches a table inside a quote', { options: { cellCopy: true } }, async ($, on) => {
  clipboardEnv(on, 'other')
  const copies = recordCopies(on)
  await startSession($, on)
  const ui = await $.ui.mount(reply('> | a |\n> |--|\n> | inner |'))
  const buttons = await cellButtons(ui)
  expect(buttons).toHaveLength(1)
  await ui.press({ key: keyOf(buttons[0]!) })
  expect(copies).toEqual(['inner'])
  await ui.unmount()
})

test('cellCopy draws no cell buttons with copy buttons off', { options: { cellCopy: true, copyButtons: false } }, async ($, on) => {
  clipboardEnv(on, 'other')
  await startSession($, on)
  const ui = await $.ui.mount(reply(TABLE))
  expect(await cellButtons(ui)).toHaveLength(0)
  await ui.unmount()
})

test('without cellCopy a table has no cell buttons', async ($, on) => {
  clipboardEnv(on, 'other')
  await startSession($, on)
  const ui = await $.ui.mount(reply(TABLE))
  expect(await cellButtons(ui)).toHaveLength(0)
  await ui.unmount()
})

test('cellCopy copies the whole cell from any line of a cell split with br', { options: { cellCopy: true } }, async ($, on) => {
  clipboardEnv(on, 'other')
  const copies = recordCopies(on)
  await startSession($, on)
  const ui = await $.ui.mount(reply('| a |\n|--|\n| one<br>two<br/>three |'))
  const buttons = await cellButtons(ui)
  expect(buttons).toHaveLength(3)
  for (const button of buttons) await ui.press({ key: keyOf(button) })
  expect(copies).toEqual(Array(3).fill('one\ntwo\nthree'))
  await ui.unmount()
})
