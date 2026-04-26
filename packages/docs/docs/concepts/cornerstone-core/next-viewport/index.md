---
id: index
title: Next Viewport
summary: Why the Next Viewport architecture separates data loading, render paths, bindings, and view state
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# Next Viewport

The Next Viewport architecture is a cleanup of the old split between
`StackViewport`, `VolumeViewport`, CPU rendering, VTK image rendering, VTK
volume rendering, and segmentation overlays.

The old model worked, but the ownership boundaries were not clear enough.
Stack and volume viewports each had their own loading path, camera path,
presentation path, actor path, and overlay path. CPU stack image rendering,
GPU image rendering, GPU volume rendering, and volume slice rendering solved
similar problems in different places. As features were added, behavior became
spread across viewport classes, mapper helpers, synchronizers, segmentation
display tools, and compatibility code.

That made common workflows harder than they needed to be:

- A stack image and a volume slice could represent the same plane but travel
  through different viewport APIs.
- Fusion overlays had to know whether the base viewport was stack-like,
  volume-like, CPU-backed, or VTK-backed.
- Segmentation labelmaps had separate paths for image actors, volume actors,
  and special overlay renderers.
- Camera fields were used both as user-facing navigation state and as renderer
  commands, which made ownership ambiguous.
- Adding a new render mode meant touching more viewport behavior than the
  renderer actually needed.

Next Viewport keeps the existing rendering power, but moves the ownership to a
smaller set of concepts.

## What Changed

The new shape is:

```text
logical data id
  -> DataProvider
  -> RenderPath
  -> ViewportDataBinding
  -> viewState + DataPresentation
  -> renderer command
```

The viewport owns navigation and binding order. The data provider owns logical
data lookup. A render path owns only the runtime implementation for one data
type and render mode. A binding owns one mounted dataset in the viewport.

For planar imaging, one `PlanarViewport` can now display stack-like data,
volume slice data, CPU image data, VTK image data, and VTK volume slice data
behind the same clean API. The render mode is selected per dataset instead of
being hardwired into a separate stack or volume viewport class.

## Source And Overlay Data

Every mounted dataset has a binding role:

- `source` is the active dataset that defines the view.
- `overlay` is drawn in the same view, aligned to the source.

`setDataList()` makes the first entry the source by default and later entries
overlays. `addData()` can explicitly add an overlay later. This replaces a lot
of the old "stack vs volume vs actor overlay" branching with one binding model.

## Render Paths

Render paths are the rendering implementations. Planar render paths include CPU
image, CPU volume slice, VTK image, and VTK volume slice paths. Video, ECG, WSI,
and 3D viewports use the same controller pattern but provide their own render
paths and state models.

The important rule is that render paths do not own viewport navigation. They
receive state from the viewport and project it into renderer-specific commands.

## Presentation Split

Next Viewport separates two kinds of presentation:

- View presentation: pan, zoom or scale, rotation, flips, and display area.
- Data presentation: VOI, opacity, colormap, blend mode, interpolation, and
  visibility for one mounted dataset.

This is what makes a CT source and PET overlay share the same view while still
having independent VOI, color, and opacity.

## Camera In Brief

Clean Next viewports prefer semantic state over durable VTK-style camera fields.
For planar, video, and ECG, the viewport state is the source of truth and the
runtime camera or canvas transform is derived from it. Legacy camera APIs remain
available through compatibility adapters. The full camera contract is covered
in the camera page.

<DocCardList items={useCurrentSidebarCategory().items}/>
