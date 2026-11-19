import type { ClientModule } from 'claude-code'

type Props = { color?: string }
type State = { tick: number }

const HEAD = ' █▜▛█ '
const BLINK = ' ████ '
const BODY = '▄████▄'
const FEET = ' ▛▛▜▜ '
const STEP = ' ▜▜▛▛ '
const WAVE_HEAD = '▖█▜▛█ '
const WAVE_BODY = '▝████▄'

export const ROBOT_FRAMES: readonly (readonly [string, string, string])[] = [
  [HEAD, BODY, FEET],
  [HEAD, BODY, STEP],
  [HEAD, BODY, FEET],
  [HEAD, BODY, STEP],
  [BLINK, BODY, FEET],
  [HEAD, BODY, FEET],
  [WAVE_HEAD, WAVE_BODY, FEET],
  [HEAD, BODY, FEET],
  [WAVE_HEAD, WAVE_BODY, FEET],
  [HEAD, BODY, FEET],
]

export const ROBOT_TICK_MS = 400

const Robot: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ tick: 0 })
    surface.every(ROBOT_TICK_MS, () => surface.setState({ tick: ((surface.state?.tick ?? 0) + 1) % ROBOT_FRAMES.length }))
  }
  const frame = ROBOT_FRAMES[surface.state?.tick ?? 0] ?? ROBOT_FRAMES[0]!
  return <Text color={props.color}>{frame.join('\n')}</Text>
}

export default Robot
