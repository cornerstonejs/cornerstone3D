---
id: index
title: 6.0 Migration Guides
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# 6.0 Migration Guides

Here you can find the migration notes for moving from Cornerstone3D 5.x to 6.x.

6.0 is a breaking release about the viewports and how they render.

- **Only the next viewports remain** (the Generic viewports that 5.x had as an
  opt-in). The legacy viewport classes,
  the compatibility adapters, the legacy viewport API and
  `rendering.useGenericViewport` are removed. There is no setting that brings
  them back. An application that needs them stays on 5.x.
- **Rendering works without device settings.** A planar viewport cuts its slice
  on the CPU and draws a 2D image, and keeps a 3D texture only for slabs and 3D
  ("slice first"). A router picks the path for each layer and tells the reason.

:::note

6.0 is in development. Every change on these pages is in the code: the
legacy classes, the adapters, the legacy types and the legacy settings are
deleted, and the viewport types and classes have their plain names. The
marks **In the code** are removed when 6.0 is released.

:::

## Where to start

- **A person** reads [Next viewports only](./1-next-viewports-only.md) first,
  and then follows [The upgrade, step by step](./4-upgrade-step-by-step.md).
- **A coding agent** starts from
  [For a coding agent](./4-upgrade-step-by-step.md#for-a-coding-agent), and
  looks up each legacy name in
  [Every legacy call and what replaces it](./3-api-map.md).
- **Both** can first run the codemod `@cornerstonejs/cornerstone3d-6`, which
  does the mechanical renames and rewrites and lists what it leaves. See
  [The codemod](./4-upgrade-step-by-step.md#the-codemod).
- **An application on a 6.0 beta** reads
  [From a 6.0 beta to 6.0](./5-from-a-6-beta.md): every change since
  6.0.0-beta.2, and the one codemod step that it needs.

| Page                                                     | What it holds                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Next viewports only](./1-next-viewports-only.md)        | What is removed, how a next viewport is made and filled, what comes over and what does not                |
| [Rendering changes](./2-rendering-changes.md)            | What a 6.0 viewport draws and answers differently from 5.x                                                |
| [Every legacy call and what replaces it](./3-api-map.md) | One row for each legacy member, property key, option, event, setting, type and helper, with its 6.0 call  |
| [The upgrade, step by step](./4-upgrade-step-by-step.md) | The ordered steps with their checks, the changes that need a decision by a person, the rules for an agent |
| [From a 6.0 beta to 6.0](./5-from-a-6-beta.md)           | Every change since 6.0.0-beta.2, the codemod step for code on a beta, and what that step cannot do        |

## Breaking changes at a glance

| Change                                                                                                                                                                                                         | Page                                                                                                             | State       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| Legacy viewport classes, adapters and `rendering.useGenericViewport` are removed                                                                                                                               | [Next viewports only](./1-next-viewports-only.md)                                                                | In the code |
| The legacy viewport API is removed (`setStack`, `setVolumes`, `setProperties`, cameras)                                                                                                                        | [Next viewports only](./1-next-viewports-only.md)                                                                | In the code |
| The viewport types get plain names (`PLANAR`, `VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE`, `ECG`)                                                                                                                      | [Next viewports only](./1-next-viewports-only.md)                                                                | In the code |
| Each legacy call has one 6.0 call, which answers for a stack and for a volume                                                                                                                                  | [The map](./3-api-map.md)                                                                                        | In the code |
| A question about the data is a function that takes the viewport: bounds, the slice on display, the planes of the slices, the acquisition plane                                                                 | [The map](./3-api-map.md#members-of-the-volume-viewport-only)                                                    | In the code |
| A stretch is the scale pair of the view state, and `isDestroyed` replaces `isDisabled`                                                                                                                         | [The map](./3-api-map.md#members-of-every-legacy-viewport)                                                       | In the code |
| `Types.IViewport` is the interface of a viewport of any family, `enabledElement.viewport` is typed with it, and `BaseViewport` is the base class of every family                                               | [The map](./3-api-map.md#classes-and-typescript-types)                                                           | In the code |
| Zoom and pan of a 3D viewport through `viewportProjection`, a surface as a display set, the frame range of a video as a view state key                                                                         | [Rendering changes](./2-rendering-changes.md#3d-viewports)                                                       | In the code |
| Scroll options (`loop` wraps a volume), the orientation input, and no `PRE_STACK_NEW_IMAGE`, `STACK_VIEWPORT_SCROLL` and `IMAGE_LOAD_ERROR` from a planar viewport                                             | [Rendering changes](./2-rendering-changes.md#slabs-and-scrolling)                                                | In the code |
| Members that left the 3D, the video, the whole slide and the ECG viewport: zoom and pan members, actor members, `setFrameRange`, `scroll` of a slide, `getNumberOfSlices` of an ECG                            | [The map](./3-api-map.md#the-3d-viewport)                                                                        | In the code |
| Slice first is on by default for planar viewports                                                                                                                                                              | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code |
| A viewport that draws on the CPU shows the GPU picture                                                                                                                                                         | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code |
| A labelmap fill is drawn with the configured alpha                                                                                                                                                             | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code |
| A volume slice sits on a slice centre                                                                                                                                                                          | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code |
| MONOCHROME1 images start inverted, images without a window start at their pixel range                                                                                                                          | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code |
| Whole slide world coordinates follow the slide                                                                                                                                                                 | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code |
| 3D reset and `setViewReference`, video view references and frame events                                                                                                                                        | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code |
| An appearance replaces the properties. No default properties, no preset on a slice                                                                                                                             | [Rendering changes](./2-rendering-changes.md)                                                                    | In the code |
| `ViewportType.STACK`, `ORTHOGRAPHIC` and `PERSPECTIVE` throw at `enableElement`. `PERSPECTIVE` becomes a 3D viewport with `parallelProjection: false`                                                          | [Viewport types](./3-api-map.md#viewport-types)                                                                  | In the code |
| The classes have plain names (`VolumeViewport3D`, `VideoViewport`, `WSIViewport`, `ECGViewport`, the base class `BaseViewport`), and the 5.x next names are gone                                               | [Next viewports only](./1-next-viewports-only.md#the-viewport-types)                                             | In the code |
| `NEW_IMAGE` replaces `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE`. The events that no viewport fires are gone from `Enums.Events`                                                                                  | [The map](./3-api-map.md#events)                                                                                 | In the code |
| The CPU switch is removed: `rendering.useCPURendering`, `setUseCPURendering`, `resetUseCPURendering` and `getShouldUseCPURendering`                                                                            | [Next viewports only](./1-next-viewports-only.md#what-is-removed)                                                | In the code |
| The helpers of the legacy API are removed: `setVolumesForViewports`, `addVolumesToViewports`, `convertStackToVolumeViewport` and others                                                                        | [Next viewports only](./1-next-viewports-only.md#what-is-removed)                                                | In the code |
| Changes where the code compiles and the picture or the result differs                                                                                                                                          | [Changes that need a decision by a person](./4-upgrade-step-by-step.md#changes-that-need-a-decision-by-a-person) | In the code |
| A display set is registered once in `displaySetRegistry`; what one viewport wants (`mode`, `initialImageIdIndex`, `appearance`) is said on its mount, and a `volumeId` only names a volume                     | [Next viewports only](./1-next-viewports-only.md#a-display-set-is-registered-once)                               | In the code |
| One appearance event, `DISPLAY_SET_APPEARANCE_CHANGED`, in place of `VOI_MODIFIED` and `COLORMAP_MODIFIED`; `getDisplaySetAppearance` gives the overrides and `getEffectiveDisplaySetAppearance` what is drawn | [Rendering changes](./2-rendering-changes.md#the-appearance-event-and-the-two-getters)                           | In the code |
| One opacity: `colormap.opacity` is gone, and every render path draws `opacity * ramp(value)`                                                                                                                   | [Rendering changes](./2-rendering-changes.md#one-opacity)                                                        | In the code |
| `DISPLAY_SETS_CHANGED` for every viewport family, `NEW_IMAGE` with `displaySetId` and `sliceIndex`, and one scroll event, `SCROLL_OUT_OF_BOUNDS`                                                               | [Rendering changes](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport)                      | In the code |
| The display area lives only in the view state, and a framing comes back as it was read                                                                                                                         | [Rendering changes](./2-rendering-changes.md#display-area-and-stretch)                                           | In the code |
| The render modes are private; the render plan (`getRenderPlan()`, `RENDER_PLAN_CHANGED`) is stable                                                                                                             | [Rendering changes](./2-rendering-changes.md#the-render-plan)                                                    | In the code |
| Names that changed after 6.0.0-beta.2                                                                                                                                                                          | [From a 6.0 beta to 6.0](./5-from-a-6-beta.md)                                                                   | In the code |

<DocCardList items={useCurrentSidebarCategory().items.filter(item => item.docId !== 'migration-guides/6x/index')}/>
