---
id: stackViewport
title: Stacks in a Planar Viewport
summary: Cornerstone3D 6.0 has no stack viewport class. A planar viewport shows a stack of 2D images in stack mode, with scrolling, pan, zoom and the appearance of each image
---

# Stacks in a Planar Viewport

Cornerstone3D 6.0 has no stack viewport class. A planar viewport
(`ViewportType.PLANAR`) shows a stack of images in stack mode: the mount asks
for `mode: 'stack'`, or leaves the mode to `'auto'` in the acquisition plane,
and `viewport.getCurrentMode()` says `'stack'`. See [Planar viewport](./viewports.md#planar-viewport).

For an upgrade from the stack viewport of 5.x, see the
[6.0 migration guide](../../migration-guides/6x/index.md).
