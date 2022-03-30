---
id: custom-volume-loading
---

# Custom Volume Loading Order

In this how-to guide we will show you how to load a volume in a custom order.

## Introduction

`Volumes` can be made from a set of 2D images, one question you might ask is:

:::note How

How can I re-order the image requests (top-down, bottom-up, etc.) in a volume loading process?

:::

## Implementation

Let's re-order two volume loadings so that they load their slice together (instead of one volume after the other). To create a custom volume loading order, we need to get the `imageLoadRequests` from the volume objects and sort them in a custom order.

### Step 1: Create a Volume

We create a volume similar to previous tutorials out of set of `imageIds`

```js
const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
  imageIds: ptImageIds,
});
const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
  imageIds: ctVolumeImageIds,
});
```

### Step 2: Getting imageLoad requests

Next, we need to get the imageLoad requests

```js
const ctRequests = ctVolume.getImageLoadRequests();
const ptRequests = ptVolume.getImageLoadRequests();
```

### Step 3: Custom ordering of requests

We use lodash helpers to merge the requests together in one after the other fashion.

```js
import _ from 'lodash';

const ctPtRequests = _.flatten(_.zip(ctRequests, ptRequests)).filter(
  (el) => el
);
```

### Step 4: Add requests back to imageLoadPoolManager

We need to add back the requests to the `imageLoadPoolManager` (we need to take
care of the values to be bound to the `callLoadImage` too).

```js
ctPtRequests.forEach((request) => {
  const {
    callLoadImage,
    requestType,
    additionalDetails,
    priority,
    imageId,
    imageIdIndex,
    options,
  } = request;

  imageLoadPoolManager.addRequest(
    callLoadImage.bind(null, imageId, imageIdIndex, options),
    requestType,
    additionalDetails,
    priority
  );
});
```

:::note Tip

There is no need to call `volume.load` since this method basically does the
same process as our steps 3 and 4.

:::

## Results

![customLoading](../assets/custom-loading.gif)
