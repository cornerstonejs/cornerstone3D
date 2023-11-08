---
id: usage
title: Usage
---

Now that we have learned about the retrieve configuration, let's see how we can use it in Cornerstone3D.

## `imageRetrieveMetadataProvider`

This is a new metadata provider that we have added to the Cornerstone3D library. It is responsible for retrieving the metadata for the image (or volume, as we will explore later). So, in order to perform progressive loading on a set of imageIds, you need to add your retrieve configuration to this provider.

### Stack Viewport

You can specify an imageId-specific retrieve configuration by including the imageIds as the key for your metadata. Considering our
one stage retrieve configuration from the previous section we have the following:

```js
import { utilities } from '@cornerstone3d/core';

const retrieveConfiguration = {
  stages: [
    {
      id: 'initialImages',
      retrieveType: 'single',
    },
  ],
  retrieveOptions: {
    single: {
      streaming: true,
    },
  },
};

utilities.imageRetrieveMetadataProvider.add('imageId1', retrieveConfiguration);
```

If you don't need to define an imageId-specific retrieve configuration, you can then scope your metadata to `stack` in order for it to be applied to all imageIds.

```js
utilities.imageRetrieveMetadataProvider.add('stack', retrieveConfiguration);
```

### Volume Viewport

For loading a volume as progressive loading, you can use the `volumeId` as the key for your metadata.

```js
import { utilities } from '@cornerstone3d/core';

const volumeId = ....get volume id....
utilities.imageRetrieveMetadataProvider.add(volumeId, retrieveConfiguration);
```

Or you can scope your metadata to `volume` in order for it to be applied to all volumeIds.

```js
utilities.imageRetrieveMetadataProvider.add('volume', retrieveConfiguration);
```

:::tip
That is all you need to do! Everything else for loading the image progressively is handled by the Cornerstone3D library.
:::
