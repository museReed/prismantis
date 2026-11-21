import type { ListItem } from './markdown'
import { inlineText } from './markdown'

export type Choice = { id: string; group: string; one: boolean; question: string; label: string }
export type Choices = { list: Choice[]; filled: string }

export const NO_CHOICES: Choices = { list: [], filled: '' }

export const CHOICE_HINT = 'When a reply asks the user to choose, decide or approve something, put the options right under the question as a markdown list: `- ( ) option` when only one can be picked (a yes or no question gets `- ( ) Yes` and `- ( ) No`, in the user\'s language), `- [ ] option` when several can. Each option is drawn as a button that writes the question and the picked option into the user\'s prompt box, so keep each question on the line just above its options, one list per question, and each option short. Keep `- [ ]` for options the user picks or steps still open, and `- [x]` for what is done.'

export const CHOICE_REFUSED = 'The prompt box is busy, press the option again in a moment'

const TEXT_MAX = 80

const tidy = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim().replace(/[:：]$/, '')
  return flat.length > TEXT_MAX ? `${flat.slice(0, TEXT_MAX - 1)}…` : flat
}

export const isChoice = (item: ListItem): boolean => item.choice === true || item.task === false

export const choiceOf = (items: ListItem[], i: number, scope: string, lead: string): Choice => {
  const item = items[i]!
  let parent = i - 1
  while (parent >= 0 && (items[parent]!.depth >= item.depth || isChoice(items[parent]!))) parent--
  return {
    id: `${scope}.${i}`,
    group: `${scope}.q${parent}`,
    one: item.choice === true,
    question: tidy(parent >= 0 ? inlineText(items[parent]!.inline) : lead),
    label: tidy(inlineText(item.inline)),
  }
}

export const toggleChoice = (list: Choice[], choice: Choice): Choice[] => {
  if (list.some(c => c.id === choice.id)) return list.filter(c => c.id !== choice.id)
  const kept = choice.one ? list.filter(c => c.group !== choice.group) : list
  const groups = [...new Set([...list, choice].map(c => c.group))]
  return [...kept, choice].sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.id.localeCompare(b.id, 'en', { numeric: true }))
}

export const choiceDraft = (list: Choice[]): string =>
  [...new Set(list.map(c => c.group))]
    .map(group => {
      const picked = list.filter(c => c.group === group)
      const labels = picked.map(c => c.label).join(', ')
      return picked[0]!.question ? `${picked[0]!.question} → ${labels}` : labels
    })
    .join('\n')

export const mergeDraft = (box: string, before: string, now: string): string => {
  const rest = before && box.startsWith(before) ? box.slice(before.length).replace(/^\n/, '') : box
  return [now, rest].filter(Boolean).join('\n')
}
