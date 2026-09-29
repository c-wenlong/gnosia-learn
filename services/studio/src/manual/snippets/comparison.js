helpers.box('tcp-open', 'three-way handshake', { x: 100, y: 120, w: 220 })
helpers.box('tcp-send', 'ordered bytes', { below: 'tcp-open', gap: 120, w: 220 })
helpers.box('tcp-ack', 'resend on loss', { below: 'tcp-send', gap: 120, w: 220 })
helpers.connect('tcp-open', 'tcp-send', { label: 'then' })
helpers.connect('tcp-send', 'tcp-ack', { label: 'if lost' })

// The second panel's first box sits far enough right that the containers,
// each 40 units outside its members, do not touch.
helpers.box('udp-send', 'datagrams', { x: 520, y: 120, w: 220 })
helpers.box('udp-drop', 'no resend', { below: 'udp-send', gap: 120, w: 220 })
helpers.connect('udp-send', 'udp-drop', { label: 'if lost' })

// Containers go on after their members exist, and are then made one size, so
// the three-box panel and the two-box panel do not read as different sizes.
helpers.boxShapes(['tcp-open', 'tcp-send', 'tcp-ack'], { label: 'TCP', shapeId: 'panel-tcp' })
helpers.boxShapes(['udp-send', 'udp-drop'], { label: 'UDP', shapeId: 'panel-udp' })
helpers.alignContainers(['panel-tcp', 'panel-udp'])

helpers.text('caption', 'Same network, two promises about delivery', {
  below: ['panel-tcp', 'panel-udp'],
  gap: 40,
})

return helpers.getLints()
