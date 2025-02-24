---
id: general
title: 'General'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Externalized PolySeg

PolySeg has been moved from the `cornerstoneTools` package and is now a standalone package called @cornerstonejs/polymorphic-segmentation.

## Usage

Now, it's not included in the `cornerstoneTools` package anymore. If you need to enable polymorphic conversions, you'll have to install it and initialize `cornerstoneTools` with it.

```js
import * as polyseg from '@cornerstonejs/polymorphic-segmentation';
import { init } from '@cornerstonejs/tools';

init({
  addons: {
    polyseg,
  },
});
```

:::note
This change was made because we weren't shipping the cornerstone tools with our `polyseg-wasm` dependencies. There were a few issues with bundlers complaining about the static assets included. Now, those who don't want to use it are fine, and those who do will need to install it and initialize `cornerstoneTools` themselves.
:::

## Exports

We weren't exposing any functions from the `tools` directory. If you need something, import it from `@cornerstonejs/polymorphic-segmentation`.
It exports the following:

```js
import {
  canComputeRequestedRepresentation,
  // computes
  computeContourData,
  computeLabelmapData,
  computeSurfaceData,
  // updates
  updateSurfaceData,
  // init
  init,
} from '@cornerstonejs/polymorphic-segmentation';
```

### computeAndAddContourRepresentation, computeAndAddLabelmapRepresentation, computeAndAddSurfaceRepresentation

have been removed from the `tools` directory. If you happen to need them (unlikely), you'll have to build them yourself.

```js
import { utilities } from '@cornerstonejs/tools';
import { computeLabelmapData } from '@cornerstonejs/polymorphic-segmentation';

const { computeAndAddRepresentation } = utilities.segmentation;

// for labelmap
const labelmapData = await computeAndAddRepresentation(
  segmentationId,
  Representations.Labelmap,
  () => computeLabelmapData(segmentationId, { viewport }),
  () => null
);

// for surface
import {
  computeSurfaceData,
  updateSurfaceData,
} from '@cornerstonejs/polymorphic-segmentation';

const SurfaceData = await computeAndAddRepresentation(
  segmentationId,
  Representations.Surface,
  () => computeSurfaceData(segmentationId, { viewport }),
  () => updateSurfaceData(segmentationId, { viewport })
);

// same for contour
import { computeContourData } from '@cornerstonejs/polymorphic-segmentation';

const contourData = await computeAndAddRepresentation(
  segmentationId,
  Representations.Contour,
  () => computeContourData(segmentationId, { viewport }),
  () => undefined
);
```
