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

test('cellCopy is on unless turned off', () => {
  expect(resolveStyle({}).cellCopy).toBe(true)
  expect(resolveStyle({ cellCopy: false }).cellCopy).toBe(false)
  expect(resolveStyle({ cellCopy: 'yes' }).cellCopy).toBe(true)
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

test('with cellCopy off a table has no cell buttons', { options: { cellCopy: false } }, async ($, on) => {
  clipboardEnv(on, 'other')
  await startSession($, on)
  const ui = await $.ui.mount(reply(TABLE))
  expect(await cellButtons(ui)).toHaveLength(0)
  await ui.unmount()
})

test('cellCopy copies the whole cell on one line from a press on any of its lines', { options: { cellCopy: true } }, async ($, on) => {
  clipboardEnv(on, 'other')
  const copies = recordCopies(on)
  await startSession($, on)
  const ui = await $.ui.mount(reply('| a | b |\n|--|--|\n| one<br>two<br/>three | solo |'))
  const keys = (await cellButtons(ui)).map(keyOf)
  expect(keys).toHaveLength(4)
  const line = (n: number, c: number) => keys.find(k => k.endsWith(`.${n}.${c}.copy`))!
  for (const n of [0, 1, 2]) await ui.press({ key: line(n, 0) })
  await ui.press({ key: line(0, 1) })
  expect(copies).toEqual([...Array(3).fill('one two three'), 'solo'])
  expect(await ui.find({ type: 'Text', text: /📋/ })).toBeUndefined()
  await ui.unmount()
})

test('joinCellLines joins lines with one space, CJK included, and drops blank lines', () => {
  expect(joinCellLines('9 欄 × 3 行\naccent 色\n400ms 換一格動畫')).toBe('9 欄 × 3 行 accent 色 400ms 換一格動畫')
  expect(joinCellLines('第一行\n第二行')).toBe('第一行 第二行')
  expect(joinCellLines(' one \n\n two ')).toBe('one two')
})
