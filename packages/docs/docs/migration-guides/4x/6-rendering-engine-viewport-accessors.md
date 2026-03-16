---
id: rendering-engine-viewport-accessors
title: Rendering Engine Viewport Accessors
---

# Rendering Engine Viewport Accessors

## Overview

`RenderingEngine.getStackViewport()`, `RenderingEngine.getStackViewports()`, and `RenderingEngine.getVolumeViewports()` have been removed.

Use `getViewport()` or `getViewports()` and then filter by the behavior you need.

This change matters for ViewportV2 because a `PlanarViewportV2` can expose stack-style or volume-style compatibility methods without being a `StackViewport` or `VolumeViewport`.

## Why This Changed

The old accessors classified viewports by legacy concrete classes.

That breaks down for V2 viewports, where the same viewport may support:

- image-slice workflows such as `setStack()`
- volume workflows such as `setVolumes()`
- shared image queries such as `getCurrentImageId()` or `hasImageURI()`

without actually being a legacy stack or volume viewport type.

## Migration

### `getStackViewport(viewportId)`

Before:

```ts
const viewport = renderingEngine.getStackViewport(viewportId);
await viewport.setStack(imageIds);
```

After:

```ts
import { utilities } from '@cornerstonejs/core';

const viewport = renderingEngine.getViewport(viewportId);

if (!utilities.viewportSupportsStackCompatibility(viewport)) {
  throw new Error(`Viewport ${viewportId} does not implement setStack`);
}

await viewport.setStack(imageIds);
```

### `getStackViewports()`

Before:

```ts
const stackViewports = renderingEngine.getStackViewports();
```

After:

```ts
import { utilities } from '@cornerstonejs/core';

const stackViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsStackCompatibility);
```

If you only need image-slice queries, use the narrower guard instead:

```ts
const sliceViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsImageSlices);
```

### `getVolumeViewports()`

Before:

```ts
const volumeViewports = renderingEngine.getVolumeViewports();
```

After:

Choose the guard that matches the operation you need:

```ts
import { utilities } from '@cornerstonejs/core';

const volumeInputViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsVolumeCompatibility);

const volumeActorViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsVolumeActors);

const volumeURIViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsVolumeURI);
```

## New Capability Guards

Cornerstone3D now exposes capability-based helpers under `utilities`:

- `viewportSupportsStackCompatibility`
- `viewportSupportsImageSlices`
- `viewportSupportsStackCalibration`
- `viewportSupportsVolumeCompatibility`
- `viewportSupportsVolumeActors`
- `viewportSupportsVolumeId`
- `viewportSupportsVolumeURI`

These guards let your code depend on supported behavior instead of legacy viewport classes.
