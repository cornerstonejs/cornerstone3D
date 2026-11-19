---
id: volumeViewport
title: Volumes in a Planar Viewport
summary: Cornerstone3D 6.0 has no volume viewport class. A planar viewport shows a slice of a volume in volume mode, with MPR in any orientation, oblique reformatting and slabs
---

# Volumes in a Planar Viewport

Cornerstone3D 6.0 has no volume viewport class. A planar viewport
(`ViewportType.PLANAR`) shows a slice of a volume in volume mode: the display
set is registered with a `volumeId`, and `viewport.getCurrentMode()` says
`'volume'`. Pass the orientation in the options of the display set or in
`defaultOptions`. A volume in 3D is shown by a 3D viewport
(`ViewportType.VOLUME_3D`). See [Planar viewport](./viewports.md#planar-viewport)
and [3D Viewport](./viewports.md#3d-viewport).

For an upgrade from the volume viewport of 5.x, see the
[6.0 migration guide](../../migration-guides/6x/index.md).
