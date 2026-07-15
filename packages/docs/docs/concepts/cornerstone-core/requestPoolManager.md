---
id: requestPoolManager
title: Request Pool Manager
summary: System for managing asynchronous image retrieval and decoding with separate queues for different operations, supporting request prioritization and reordering
---

# RequestPool Manager

The RequestPool Manager has been extensively reworked to provide two new features: 1) `asynchronous image retrieval and decoding` 2) `requests re-ordering`.

## ImageLoad and ImageRetrieval Queues

Previously, there was just one loading queue for fetching and decoding an image.
Once the image decoding was completed, a new request was initiated. This had a constraint
for when decoding required time; thus, no new retrieval (fetch) requests would be sent,
even if additional requests were permitted based on the configured maximum number of requests.

To overcome this limitation, two distinct queues have been created for this
purpose: `imageRetrievalPoolManager` and `imageLoadPoolManager`, each with their own configurable maximum concurrent
jobs. They are separated and executed asynchronously from one another, allowing
each retrieval request to be initiated instantly upon the availability of a request firing slot.

Splitting the image retrieval request and decoding is enabled by default `Cornerstone-wado-image-loader` version `v4.0.0-rc` or above.

```js
// Loading = Retrieval + Decoding
imageLoadPoolManager.maxNumRequests = {
  interaction: 1000,
  thumbnail: 1000,
  prefetch: 1000,
};

// Retrieval (usually) === XHR requests
imageRetrievalPoolManager.maxNumRequests = {
  interaction: 20,
  thumbnail: 20,
  prefetch: 20,
};
```

### Usage

In your custom `imageLoader` or `volumeLoader`, to properly use the
poolManagers inside cornerstone, you need to define a `sendRequest` function to make an load image request.

```js
import {
  imageLoadPoolManager,
  loadAndCacheImage,
  RequestType,
} from '@cornerstonejs/core';

function sendRequest(imageId, imageIdIndex, options) {
  return loadAndCacheImage(imageId, options).then(
    (image) => {
      // render
      successCallback.call(this, image, imageIdIndex, imageId);
    },
    (error) => {
      errorCallback.call(this, error, imageIdIndex, imageId);
    }
  );
}

const imageId = 'schema://image';
const imageIdIndex = 10;

const requestType = RequestType.INTERACTION;
const priority = -5;
const additionalDetails = { imageId };
const options = {
  targetBuffer: {
    type: 'Float32Array',
  },
};

imageLoadPoolManager.addRequest(
  sendRequest.bind(this, imageId, imageIdIndex, options),
  requestType,
  additionalDetails,
  priority
);
```

## Combined concurrent request limit

In addition to the per-type maximums above, each pool enforces a **combined
cap** on the total number of concurrent HTTP requests across all types
(`metadata`, `interaction`, `thumbnail`, and `prefetch`). This prevents
lower-priority work (such as a large prefetch backlog) from saturating the
browser's connection pool and starving interaction fetches.

The combined cap defaults to `50` and can be changed with
`setMaxConcurrentRequests`:

```js
import { imageLoadPoolManager } from '@cornerstonejs/core';

// Total concurrent HTTP requests across all types for this pool.
imageLoadPoolManager.setMaxConcurrentRequests(100);
```

The number of requests actually dispatched for a given type is the smaller of
its per-type maximum (`setMaxSimultaneousRequests`) and the remaining combined
budget. Even when the combined pool is full, at least one `Interaction` request
is always allowed through so background fetches can never fully block
interaction.

The request types, in priority order, are:

| Type          | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `Metadata`    | Metadata that must resolve before images can render (highest). |
| `Interaction` | Images needed for the current interaction.                     |
| `Thumbnail`   | Thumbnail images.                                              |
| `Prefetch`    | Background image loading.                                      |
| `Compute`     | Non-HTTP compute work; runs on a separate, un-throttled queue. |

## Requests re-ordering

You could have a certain sequence in mind for retrieving the images. For example,
suppose you want to load a volume from the middle slice to the top and bottom.
We have implemented such option in the `cornerstoneStreamingImageVolumeLoader`.
You can read more about it in the [re-ordering requests](../streaming-image-volume/re-order) section.
