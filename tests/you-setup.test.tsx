import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { helpText, parseYouArgs, YOU_HINT, youSetupText } from '../hooks/help'
import { clipboardEnv, recordToasts } from './clipboard-env'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABQAQAAAAC2JkOZAAAAFklEQVR42mNgGAWjYBSMglEwCgYeAAAGkAAB8Q2GVgAAAABJRU5ErkJggg=='

const run = (args: string) => ({ command: 'prismantis', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } })

const writesOf = (on: On) => {
  const writes: { key: string; value: unknown }[] = []
  on('config.set', (_, e) => {
    writes.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  return writes
}

const picture = (on: On, path: string) => {
  on('fs.stat', (_, e) => (e.path === path ? { value: { kind: 'file', size: (PNG.length * 3) / 4, mtimeMs: 0, isLink: false } } : { deny: 'no such file' }))
  on('fs.read', (_, e) => (e.path === path ? { value: { base64: PNG } } : { deny: 'no such file' }))
}

const starts = (on: On) => {
  clipboardEnv(on, 'other')
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/tmp' }))
  return ($: { session: { start: (e: { cwd: string; surface: 'terminal'; isInteractive: boolean }) => Promise<unknown> } }) => $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

test('parseYouArgs tells a picture path from a name, keeps quoted paths with spaces, and knows reset', () => {
  expect(parseYouArgs('')).toBeUndefined()
  expect(parseYouArgs('reset')).toEqual({ reset: true })
  expect(parseYouArgs('Ada Lovelace')).toEqual({ reset: false, name: 'Ada Lovelace' })
  expect(parseYouArgs('~/me.png')).toEqual({ reset: false, avatar: '~/me.png' })
  expect(parseYouArgs('~/me.png Ada')).toEqual({ reset: false, avatar: '~/me.png', name: 'Ada' })
  expect(parseYouArgs('me.PNG Ada')).toEqual({ reset: false, avatar: 'me.PNG', name: 'Ada' })
  expect(parseYouArgs('"~/My Pictures/me.png" Ada')).toEqual({ reset: false, avatar: '~/My Pictures/me.png', name: 'Ada' })
})

test('/prismantis setup you alone explains itself with what is set now', async $ => {
  expect((await $.command.run(run('setup you'))).text).toBe(youSetupText('', 'You'))
  expect(youSetupText('~/me.png', 'Ada')).toContain('Now: picture `~/me.png`, name Ada.')
})

test('/prismantis setup you <png> <name> saves both after the picture loads', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  picture(on, '/home/me/me.png')
  const writes = writesOf(on)
  const text = (await $.command.run(run('setup you ~/me.png Ada'))).text
  expect(writes).toEqual([{ key: 'prismantis.youAvatar', value: '~/me.png' }, { key: 'prismantis.youName', value: 'Ada' }])
  expect(text).toBe('Picture set to ~/me.png. Name set to Ada. Your next prompt shows it.')
})

test('/prismantis setup you <name> saves the name alone', async ($, on) => {
  const writes = writesOf(on)
  await $.command.run(run('setup you Ada'))
  expect(writes).toEqual([{ key: 'prismantis.youName', value: 'Ada' }])
})

test('/prismantis setup you refuses a photo that is not a PNG and says how to turn it into one, saving nothing', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  picture(on, '/home/me/me.png')
  const writes = writesOf(on)
  const jpeg = (await $.command.run(run('setup you ~/me.jpg Ada'))).text ?? ''
  expect(jpeg).toContain('it is not a PNG')
  expect(jpeg).toContain('sips -s format png ~/me.jpg')
  expect((await $.command.run(run('setup you ~/gone.png'))).text).toContain('no PNG under 2 MB is there')
  expect(writes).toEqual([])
})

test('/prismantis setup you reset clears the picture and the name', { options: { youAvatar: '~/me.png', youName: 'Ada' } }, async ($, on) => {
  const writes = writesOf(on)
  expect((await $.command.run(run('setup you reset'))).text).toBe('Your picture is gone and your label says You again.')
  expect(writes).toEqual([{ key: 'prismantis.youAvatar', value: '' }, { key: 'prismantis.youName', value: '' }])
})

test('the setup you hint shows once, on the first session with no picture or name', async ($, on) => {
  const toasts = recordToasts(on)
  const start = starts(on)
  await start($)
  await start($)
  expect(toasts.filter(t => t === YOU_HINT)).toHaveLength(1)
})

test('the setup you hint stays quiet once a name or picture is set', { options: { youName: 'Ada' } }, async ($, on) => {
  const toasts = recordToasts(on)
  await starts(on)($)
  expect(toasts).not.toContain(YOU_HINT)
})

test('the one-screen help lists /prismantis setup you', () => {
  expect(helpText([])).toContain('/prismantis setup you <png> <name>')
})
