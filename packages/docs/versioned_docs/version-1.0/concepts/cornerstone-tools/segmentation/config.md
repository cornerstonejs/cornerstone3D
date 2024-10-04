---
id: config
title: Config
---

# Config

There are two types of configurations that can be applied to a segmentation representation.

- Global Configuration: A configuration for all segmentation representations in all toolGroups.
- ToolGroup-specific Configuration: A configuration for each toolGroup, which overrides the global configuration.

Regardless of the type of the configuration, it is object that include each representations configuration.

```js
{
  renderInactiveSegmentations: false,
  representations: {
    LABELMAP: {
      renderFill: true,
      renderOutline: true,
      // other related labelmap-specific
    },
    CONTOUR: {
      // contour-specific configuration
      // contours are not implemented yet, see our roadmap for more details
    },
  },
},

```

:::note Important
ToolGroup-specific configuration ALWAYS overrides the global configuration.
:::

For instance, if we have the following situation where only global configuration is set:

```js
const globalConfiguration = {
  renderInactiveSegmentations: false,
};

// Results: Cornerstone3DTools WILL NOT render inactive segmentations
```

But, if there is a toolGroup-specific configuration:

```js
const globalConfiguration = {
  renderInactiveSegmentations: false,
};

const toolGroupConfiguration = {
  renderInactiveSegmentations: true,
};

// Results: Cornerstone3DTools WILL render inactive segmentations
```

## Config State API

The api for the segmentation representation configurations are

```js
import {segmentation, Enums} from '@cornerstonejs/tools

// Get the global configuration
segmentation.config.getGlobalConfig()

// Set the global configuration
segmentation.config.setGlobalConfig(config)

// Get toolGroup-specific configuration
segmentation.config.getToolGroupSpecificConfig(toolGroupId)

// Set toolGroup-specific configuration
segmentation.config.setToolGroupSpecificConfig(toolGroupId, config)

// Get global representation configuration for a specific representation (e.g., labelmap)
const representationType = Enums.SegmentationRepresentations.Labelmap
segmentation.config.getGlobalRepresentationConfig(representationType)

// Set global representation configuration for a specific representation (e.g., labelmap)
segmentation.config.setGlobalRepresentationConfig(representationType, config)
```

:::note Tip
Read more about the [**Labelmap Configuration**](/api/tools/namespace/Types#LabelmapConfig) options `Cornerstone3DTools` provides.
:::

## Visibility API

`Segmentation` module provides API for setting/getting the visibility of each segmentation representation. You can use
`visibility` API to hide/show each representation.

```js
import { segmentation } from '@cornerstonejs/tools

// set the visibility of a segmentation representation for a toolGroup
segmentation.config.visibility.setSegmentationVisibility(toolGroupId, representationUID, visibility)

// get the visibility of a segmentation representation for a toolGroup
segmentation.config.visibility.getSegmentationVisibility(toolGroupId, representationUID)
```


## Color API

Provides API for adding a `colorLUT` (color Look Up Table (LUT)) that the segmentation representations will use to render their segments. The `colorLUT`
is an array of RGBA values that will be used to render each segment.
For instance, `segment index 0` (background) will use the first item in the `colorLUT` array (colorLUT[0]), the `segment index 1`
(first segment) will use the second item in the `colorLUT` array (colorLUT[1]), and so on. In order to use the `colorLUT`,
you need to add your LUT via the `color` API.

:::note Important
`Segmentation State` keeps track of all the `colorLUT`s that have been added in an array (this makes colorLUT entries in the segmentation state an array of arrays). So, to change the colorLUT you need to provide the index of the colorLUT you want to
use too.
:::

```js
import { segmentation } from '@cornerstonejs/tools

// add color LUT for use with a segmentation representation
segmentation.config.color.addColorLUT(colorLUT, colorLUTIndex)

// sets the colorLUT index to use for the segmentation representation
segmentation.config.color.setColorLUT(toolGroupId, representationUID, colorLUTIndex)

// get the color for the segment index
segmentation.config.color.getColorForSegmentIndex(toolGroupId, representationUID, segmentIndex)
```
