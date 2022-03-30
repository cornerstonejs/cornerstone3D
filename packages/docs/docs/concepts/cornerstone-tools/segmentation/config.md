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
}

// Results: Cornerstone3DTools WILL NOT render inactive segmentations
```

But, if there is a toolGroup-specific configuration:

```js
const globalConfiguration = {
  renderInactiveSegmentations: false,
}

const toolGroupConfiguration = {
  renderInactiveSegmentations: true,
}

// Results: Cornerstone3DTools WILL render inactive segmentations
```




## API

The api for the segmentation representation configurations are

```js
import {segmentations, Enums} from '@cornerstonejs/tools

// Get the global configuration
segmentations.config.getGlobalConfig()

// Set the global configuration
segmentations.config.setGlobalConfig(config)

// Get toolGroup-specific configuration
segmentations.config.getToolGroupSpecificConfig(toolGroupId)

// Set toolGroup-specific configuration
segmentations.config.setToolGroupSpecificConfig(toolGroupId, config)

// Get global representation configuration for a specific representation (e.g., labelmap)
const representationType = Enums.SegmentationRepresentations.Labelmap
segmentations.config.getGlobalRepresentationConfig(representationType)

// Set global representation configuration for a specific representation (e.g., labelmap)
segmentations.config.setGlobalRepresentationConfig(representationType, config)
```

:::note Tip
Read more about the [**Labelmap Configuration**](/api/tools/namespace/Types#LabelmapConfig) options `Cornerstone3DTools` provides.
:::
