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

## Where to start

- **A person** reads [Next viewports only](./1-next-viewports-only.md) first,
  and then follows [The upgrade, step by step](./4-upgrade-step-by-step.md).
- **A coding agent** starts from
  [For a coding agent](./4-upgrade-step-by-step.md#for-a-coding-agent), and
  looks up each legacy name in
  [Every legacy call and what replaces it](./3-api-map.md).

| Page                                                     | What it holds                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Next viewports only](./1-next-viewports-only.md)        | What is removed, how a next viewport is made and filled, what comes over and what does not                |
| [Rendering changes](./2-rendering-changes.md)            | What a 6.0 viewport draws and answers differently from 5.x                                                |
| [Every legacy call and what replaces it](./3-api-map.md) | One row for each legacy member, property key, option, event, setting, type and helper, with its 6.0 call  |
| [The upgrade, step by step](./4-upgrade-step-by-step.md) | The ordered steps with their checks, the changes that need a decision by a person, the rules for an agent |

## Breaking changes at a glance

| Change                                                                                                                                         | Page                                                                                                             | State                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Legacy viewport classes, adapters and `rendering.useGenericViewport` are removed                                                               | [Next viewports only](./1-next-viewports-only.md)                                                                | Decided, not in the code yet                                  |
| The legacy viewport API is removed (`setStack`, `setVolumes`, `setProperties`, cameras)                                                        | [Next viewports only](./1-next-viewports-only.md)                                                                | Decided, not in the code yet                                  |
| The viewport types get plain names (`PLANAR`, `VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE`, `ECG`)                                                      | [Next viewports only](./1-next-viewports-only.md)                                                                | Decided, not in the code yet                                  |
| Each legacy call has one 6.0 call, which answers for a stack and for a volume                                                                  | [The map](./3-api-map.md)                                                                                        | In the code, except the rows that carry the mark              |
| A question about the data is a function that takes the viewport: bounds, the slice on display, the planes of the slices, the acquisition plane | [The map](./3-api-map.md#members-of-the-volume-viewport-only)                                                    | In the code                                                   |
| A stretch is the scale pair of the view state, and `isDestroyed` replaces `isDisabled`                                                         | [The map](./3-api-map.md#members-of-every-legacy-viewport)                                                       | In the code                                                   |
| `Types.IGenericViewport` is the interface of a next viewport, and it no longer extends `Types.IViewport`                                       | [The map](./3-api-map.md#classes-and-typescript-types)                                                           | In the code                                                   |
| Zoom and pan of a 3D viewport through `viewportProjection`, a surface as a display set, the frame range of a video as a view state key         | [Rendering changes](./2-rendering-changes.md#3d-viewports)                                                       | Decided, not in the code yet                                  |
| Scroll options, the orientation input and the legacy events of a planar viewport                                                               | [Rendering changes](./2-rendering-changes.md#slabs-and-scrolling)                                                | Decided, not in the code yet                                  |
| Slice first is on by default for planar viewports                                                                                              | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code                                                   |
| A viewport that draws on the CPU shows the GPU picture                                                                                         | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code                                                   |
| A labelmap fill is drawn with the configured alpha                                                                                             | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code                                                   |
| A volume slice sits on a slice centre                                                                                                          | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code                                                   |
| MONOCHROME1 images start inverted, images without a window start at their pixel range                                                          | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code                                                   |
| Whole slide world coordinates follow the slide                                                                                                 | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code                                                   |
| 3D reset and `setViewReference`, video view references and frame events                                                                        | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code                                                   |
| A presentation replaces the properties. No default properties, no preset on a slice                                                            | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code                                                   |
| `ViewportType.PERSPECTIVE` becomes a 3D viewport with `parallelProjection: false`                                                              | [Rendering changes](./2-rendering-changes.md#3d-viewports)                                                       | The option is in the code. The removal of the type is decided |
| Changes where the code compiles and the picture or the result differs                                                                          | [Changes that need a decision by a person](./4-upgrade-step-by-step.md#changes-that-need-a-decision-by-a-person) | In the code                                                   |

<DocCardList items={useCurrentSidebarCategory().items.filter(item => item.docId !== 'migration-guides/6x/index')}/>
