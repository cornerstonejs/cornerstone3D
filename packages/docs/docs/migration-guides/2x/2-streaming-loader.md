---
id: streaming-loader
title: '@cornerstonejs/streaming-image-volume-loader'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';


# @cornerstonejs/streaming-image-volume-loader

After years of development on Cornerstone3D, we recognized that volume loading should be treated as a first-class feature rather than a separate library. As a result, we have merged all functionality related to streaming image loading into the core library.

1. **Removal of Separate Library**: The `@cornerstonejs/streaming-image-volume-loader` package has been removed.
2. **Integration into Core**: All streaming image volume loading functionality is now part of the `@cornerstonejs/core` package.

## How to Migrate:

If you were previously using `@cornerstonejs/streaming-image-volume-loader`, you'll need to update your imports and potentially adjust your code to use the new integrated volume loading API in `@cornerstonejs/core`.

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

```js
import {
  cornerstoneStreamingImageVolumeLoader,
  cornerstoneStreamingDynamicImageVolumeLoader,
  StreamingImageVolume,
  StreamingDynamicImageVolume,
  helpers,
  Enums,
} from '@cornerstonejs/streaming-image-volume-loader';

Enums.Events.DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED;
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

```js
import {
  cornerstoneStreamingImageVolumeLoader,
  cornerstoneStreamingDynamicImageVolumeLoader,
  StreamingImageVolume,
  StreamingDynamicImageVolume,
} from '@cornerstonejs/core';

import { getDynamicVolumeInfo } from '@cornerstonejs/core/utilities';
import { Enums } from '@cornerstonejs/core/enums';

Enums.Events.DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED;
```

  </TabItem>
</Tabs>
