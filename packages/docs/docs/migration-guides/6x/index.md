---
id: index
title: 6.0 Migration Guides
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# 6.0 Migration Guides

Here you can find the migration notes for moving from Cornerstone3D 5.x to 6.x.

6.0 is a breaking release about the viewports and how they render.

- **Only the Generic ("next") viewports remain.** The legacy viewport classes,
  the compatibility adapters, the legacy viewport API and
  `rendering.useGenericViewport` are removed. There is no setting that brings
  them back. An application that needs them stays on 5.x.
- **Rendering works without device settings.** A planar viewport cuts its slice
  on the CPU and draws a 2D image, and keeps a 3D texture only for slabs and 3D
  ("slice first"). A router picks the path for each layer and tells the reason.

:::note

6.0 is in development. Each section of these pages is marked **In the code** or
**Decided, not in the code yet**. A section moves to the first mark when its
change lands, and the marks are removed when 6.0 is released.

:::

## Breaking changes at a glance

| Change                                                                                    | Page                                              | State                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------- |
| Legacy viewport classes, adapters and `rendering.useGenericViewport` are removed          | [Next viewports only](./1-next-viewports-only.md) | Decided, not in the code yet |
| The legacy viewport API is removed (`setStack`, `setVolumes`, `setProperties`, cameras)   | [Next viewports only](./1-next-viewports-only.md) | Decided, not in the code yet |
| The viewport types get plain names (`PLANAR`, `VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE`, `ECG`) | [Next viewports only](./1-next-viewports-only.md) | Decided, not in the code yet |
| Slice first is on by default for planar viewports                                         | [Rendering changes](./2-rendering-changes.md)     | In the code                  |
| A viewport that draws on the CPU shows the GPU picture                                    | [Rendering changes](./2-rendering-changes.md)     | In the code                  |
| A labelmap fill is drawn with the configured alpha                                        | [Rendering changes](./2-rendering-changes.md)     | In the code                  |
| A volume slice sits on a slice centre                                                     | [Rendering changes](./2-rendering-changes.md)     | In the code                  |
| MONOCHROME1 images start inverted, images without a window start at their pixel range     | [Rendering changes](./2-rendering-changes.md)     | In the code                  |
| Whole slide world coordinates follow the slide                                            | [Rendering changes](./2-rendering-changes.md)     | In the code                  |
| 3D reset and `setViewReference`, video view references and frame events                   | [Rendering changes](./2-rendering-changes.md)     | In the code                  |
| A presentation replaces the properties. No default properties, no preset on a slice       | [Rendering changes](./2-rendering-changes.md)     | In the code                  |
| `ViewportType.PERSPECTIVE` becomes a 3D viewport with `parallelProjection: false`         | [Rendering changes](./2-rendering-changes.md)     | Decided, not in the code yet |

<DocCardList items={useCurrentSidebarCategory().items.filter(item => item.docId !== 'migration-guides/6x/index')}/>
