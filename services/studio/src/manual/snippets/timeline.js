const y = 300
const x0 = 80
const step = 260
const events = [
  ['boot', 'firmware runs'],
  ['kernel', 'kernel loads'],
  ['init', 'init starts services'],
  ['login', 'login prompt'],
]

helpers.line('axis', x0 - 20, y, x0 + step * (events.length - 1) + 60, y, { head: 'end' })

events.forEach(([key, label], i) => {
  const x = x0 + step * i
  helpers.stub(`tick-${key}`, x, y - 12, 0, 24)
  // Each event is a box above its tick, centred on it: x is the tick minus
  // half the box width. One height for all of them, tall enough for a label
  // that wraps to two lines, because `h` is only a minimum and a wrapped label
  // would otherwise make one box taller than its neighbours.
  helpers.box(key, label, { x: x - 100, y: y - 150, w: 200, h: 96 })
  helpers.text(`t-${key}`, `t${i}`, { centerOn: `tick-${key}`, y: y + 24, size: 's' })
})

helpers.text('title', 'What happens between power on and login', {
  above: events.map(([key]) => key),
  gap: 40,
  size: 'l',
})

return helpers.getLints()
