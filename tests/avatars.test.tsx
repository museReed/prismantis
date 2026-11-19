import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { width } from '../hooks/layout'
import { ROBOT_FRAMES } from '../hooks/robot'
import { labelName, resolveStyle } from '../hooks/theme'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABQAQAAAAC2JkOZAAAAFklEQVR42mNgGAWjYBSMglEwCgYeAAAGkAAB8Q2GVgAAAABJRU5ErkJggg=='
const KITTY = { TERM: 'xterm-kitty', HOME: '/home/me' }

const typed = (text: string, surface: 'terminal' | 'desktop' = 'terminal') =>
  ({ plugin: 'prismantis', component: 'UserMessage' as const, props: { text, origin: { kind: 'composer' } as never, isExpanded: true }, viewport: { columns: 80, rows: 20 }, surface })

const reply = (text: string, surface: 'terminal' | 'desktop' = 'terminal') =>
  ({ plugin: 'prismantis', component: 'AssistantMessage' as const, props: { text, isFirstOfReply: true }, viewport: { columns: 80, rows: 20 }, surface })

const avatarFile = (on: On, path: string) => {
  on('fs.stat', (_, e) => (e.path === path ? { value: { kind: 'file', size: (PNG.length * 3) / 4, mtimeMs: 0, isLink: false } } : { deny: 'no such file' }))
  on('fs.read', (_, e) => (e.path === path ? { value: { base64: PNG } } : { deny: 'no such file' }))
}

test('avatar options fall back to no picture and the dot', () => {
  const style = resolveStyle({})
  expect(style.youAvatar).toBe('')
  expect(style.claudeAvatar).toBe('dot')
  expect(resolveStyle({ claudeAvatar: 'rocket', youAvatar: 42 }).claudeAvatar).toBe('dot')
  expect(resolveStyle({ youAvatar: ' ~/me.png ' }).youAvatar).toBe('~/me.png')
})

test('youAvatar draws the picture beside the You label in kitty', { options: { youAvatar: '~/me.png' } }, async ($, on) => {
  mock.env(on, KITTY)
  avatarFile(on, '/home/me/me.png')
  const ui = await $.ui.mount(typed('hello'))
  const image = await ui.find({ type: 'Image' })
  expect(image?.props.source).toEqual({ png: PNG })
  expect([image?.props.columns, image?.props.rows]).toEqual([4, 2])
  await ui.unmount()
})

test('youAvatar keeps the plain label where pictures cannot draw or the file is missing', { options: { youAvatar: '~/me.png' } }, async ($, on) => {
  mock.env(on, { TERM: 'xterm-256color', HOME: '/home/me' })
  avatarFile(on, '/home/me/me.png')
  const plain = await $.ui.mount(typed('hello'))
  expect(await plain.find({ type: 'Image' })).toBeUndefined()
  expect(await plain.find({ type: 'Text', text: /You/ })).toBeDefined()
  await plain.unmount()
})

test('claudeAvatar robot puts the robot client beside the Claude label in the terminal', { options: { claudeAvatar: 'robot', replyStyle: 'bubble' } }, async $ => {
  const ui = await $.ui.mount(reply('Done.'))
  const robot = await ui.find({ type: 'Client' })
  expect(String(robot?.props.module)).toMatch(/robot\.tsx$/)
  expect(await ui.find({ type: 'Text', text: /^Claude$/ })).toBeDefined()
  await ui.unmount()
})

test('claudeAvatar dot draws no robot', { options: { replyStyle: 'bubble' } }, async $ => {
  const ui = await $.ui.mount(reply('Done.'))
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await ui.unmount()
})

test('every robot frame is two rows of the same width, so the label never shifts', () => {
  expect(ROBOT_FRAMES.length).toBeGreaterThan(1)
  for (const frame of ROBOT_FRAMES) {
    expect(frame).toHaveLength(2)
    for (const line of frame) expect(width(line)).toBe(width(ROBOT_FRAMES[0]![0]))
  }
})

test('youName names the prompt label, trimmed and capped, with You as the fallback', () => {
  expect(resolveStyle({}).youName).toBe('You')
  expect(resolveStyle({ youName: ' Reed ' }).youName).toBe('Reed')
  expect(labelName('\u001b[31mReed\u200e')).toBe('[31mReed')
  expect(labelName('x'.repeat(40))).toHaveLength(24)
  for (const blank of ['', '   ', 7, undefined]) expect(labelName(blank)).toBe('You')
})

test('youName replaces You beside the avatar', { options: { youAvatar: '~/me.png', youName: 'Reed' } }, async ($, on) => {
  mock.env(on, KITTY)
  avatarFile(on, '/home/me/me.png')
  const ui = await $.ui.mount(typed('hello'))
  expect(await ui.find({ type: 'Text', text: /^Reed$/ })).toBeDefined()
  expect((await ui.find({ type: 'Image' }))?.props.alt).toBe('Reed')
  await ui.unmount()
})
