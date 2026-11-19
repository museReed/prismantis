import { expect, test } from 'claude-code/testing'

import { joinCellLines } from '../hooks/render'
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

test('cellCopy copies the pressed line, and the 📋 at the end of a multi-line cell copies the whole cell on one line', { options: { cellCopy: true } }, async ($, on) => {
  clipboardEnv(on, 'other')
  const copies = recordCopies(on)
  await startSession($, on)
  const ui = await $.ui.mount(reply('| a | b |\n|--|--|\n| one<br>two<br/>three | solo |'))
  const keys = (await cellButtons(ui)).map(keyOf)
  const whole = keys.filter(k => k.endsWith('.whole.copy'))
  expect(whole).toHaveLength(1)
  expect(keys).toHaveLength(5)
  const line = (n: number, c: number) => keys.find(k => k.endsWith(`.${n}.${c}.copy`))!
  await ui.press({ key: line(1, 0) })
  await ui.press({ key: whole[0]! })
  await ui.press({ key: line(0, 1) })
  expect(copies).toEqual(['two', 'one two three', 'solo'])
  const marks = await ui.findAll({ type: 'Text', text: /📋/ })
  expect(marks.length).toBeGreaterThan(0)
  await ui.unmount()
})

test('cellCopy adds no 📋 to a single-line cell', { options: { cellCopy: true } }, async ($, on) => {
  clipboardEnv(on, 'other')
  await startSession($, on)
  const ui = await $.ui.mount(reply('| a |\n|--|\n| solo |'))
  expect(await ui.find({ type: 'Text', text: /📋/ })).toBeUndefined()
  await ui.unmount()
})

test('without cellCopy a multi-line cell has no 📋', async ($, on) => {
  clipboardEnv(on, 'other')
  await startSession($, on)
  const ui = await $.ui.mount(reply('| a |\n|--|\n| one<br>two |'))
  expect(await ui.find({ type: 'Text', text: /📋/ })).toBeUndefined()
  await ui.unmount()
})

test('joinCellLines puts a space between lines except where two CJK letters meet', () => {
  expect(joinCellLines('9 欄 × 3 行\naccent 色\n400ms 換一格動畫')).toBe('9 欄 × 3 行 accent 色 400ms 換一格動畫')
  expect(joinCellLines('第一行\n第二行。\n第三行')).toBe('第一行第二行。第三行')
  expect(joinCellLines(' one \n\n two ')).toBe('one two')
})
