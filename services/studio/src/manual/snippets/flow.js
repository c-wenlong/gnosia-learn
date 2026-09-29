// A flow of boxes and bound arrows, left to right, with one branch below.
// Place the first box by coordinates and every other by `after` or `below`.
helpers.box('request', 'HTTP request', { x: 60, y: 60 })
// A labelled arrow needs about 120 units plus ten per character of its label:
// 'matches path' is twelve characters, so the gap is 240.
helpers.box('router', 'router', { after: 'request', gap: 240 })
helpers.box('handler', 'route handler', { after: 'router', gap: 240 })
helpers.box('cache', 'response cache', { below: 'router', gap: 140 })

// Every arrow that means something is `connect`: bound at both ends, so it
// follows its boxes when they move and the gate can see what it joins.
helpers.connect('request', 'router', { label: 'matches path' })
helpers.connect('router', 'handler', { label: 'dispatches' })
helpers.connect('router', 'cache', { label: 'checks first', dash: 'dashed' })

helpers.text('title', 'How a request finds its handler', {
  above: ['request', 'router', 'handler'],
  gap: 40,
  size: 'l',
})

return helpers.getLints()
