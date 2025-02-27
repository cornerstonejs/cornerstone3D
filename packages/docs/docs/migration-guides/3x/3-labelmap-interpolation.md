---
id: general
title: 'General'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Not a composition but a utility

Previously, interpolation was a brush composition, restricting its use to tools inheriting from a brush. However, interpolation should really be a utility anyone can use, even without a tool.

Before, you had to use this workaround for interpolation:

```js
addButtonToToolbar({
  title: 'Run Overlapping Interpolation',
  onClick: () => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    const activeName = toolGroup.getActivePrimaryMouseButtonTool();
    const brush = toolGroup.getToolInstance(activeName);
    brush.interpolate?.(element1, { extendedConfig: false });
  },
});
```

Now it's as simple as this:

```js
import * as labelmapInterpolation from '@cornerstonejs/labelmap-interpolation';

labelmapInterpolation.interpolate({
  segmentationId,
  segmentIndex,
});
```

:::note
We once again had to implement a workaround for `itk-wasm` as a dynamic dependency to prevent bundler problems in cornerstone3D 2.0. However, this caused numerous issues. Now, it's a separate, standalone utility package that doesn't need to be bundled with cornerstone3D.
:::

## Migration

Remove the `labelmap` interpolation from your custom tools composition.

Before:

```javascript
const RECTANGLE_STRATEGY = new BrushStrategy(
  'Rectangle',
  compositions.regionFill,
  compositions.setValue,
  initializeRectangle,
  compositions.determineSegmentIndex,
  compositions.preview,
  compositions.labelmapInterpolation
);
```

After:

```javascript
const RECTANGLE_STRATEGY = new BrushStrategy(
  'Rectangle',
  compositions.regionFill,
  compositions.setValue,
  initializeRectangle,
  compositions.determineSegmentIndex,
  compositions.preview
);
```
