---
id: custom-metadata-provider
---

# Custom Metadata Provider

In this how-to guide we will show you how to create a custom metadata provider.

## Introduction

Cornerstone **DOES NOT** deal with fetching of the metadata. It uses the registered
metadata providers (in the order of priority) to call each providers passing the `imageId` and
`type` of the metadata to be fetched. Usually, the metadata provider has a method to add parsed metadata to its cache.

One question you might ask is:

:::note How

How can I build a custom metadata provider?

:::

## Implementation

Through the following steps, we implement a custom metadata provider that stores the metadata
for scaling factors of PT images.

### Step 1: Create an add method

We need to store the metadata in a cache, and we need a method to add the metadata.

```js
const scalingPerImageId = {};

function add(imageId, scalingMetaData) {
  const imageURI = csUtils.imageIdToImageURI(imageId);
  scalingPerImageId[imageURI] = scalingMetaData;
}
```

<details>

<summary>imageId vs imageURI</summary>

With the addition of `Volumes` in `Cornerstone3D`, and the caching optimizations
that happen internally between `Volumes` and `Images` ([`imageLoader`](../concepts/streaming-image-volume/streaming.md#imageloader))
we should store the imageURI (instead of the `imageId`) inside the provider's cache, since
the imageURI is unique for each image but can be retrieved with different loading schemes.

</details>

### Step 2: Create a provider

Next, a provider function is needed, to get the metadata for a specific imageId given
the type of metadata. In this case, the provider only cares about the `scalingModule` type,
and it will return the metadata for the `imageId` if it exists in the cache.

```js
function get(type, imageId) {
  if (type === 'scalingModule') {
    const imageURI = csUtils.imageIdToImageURI(imageId);
    return scalingPerImageId[imageURI];
  }
}
```

### Step 3: Register the provider

Finally, we need to register the provider with cornerstone.

```js title="/src/myCustomProvider.js"
const scalingPerImageId = {};

function add(imageId, scalingMetaData) {
  const imageURI = csUtils.imageIdToImageURI(imageId);
  scalingPerImageId[imageURI] = scalingMetaData;
}

function get(type, imageId) {
  if (type === 'scalingModule') {
    const imageURI = csUtils.imageIdToImageURI(imageId);
    return scalingPerImageId[imageURI];
  }
}

export { add, get };
```

```js title="src/registerProvider.js"
import myCustomProvider from './myCustomProvider';

const priority = 100;
cornerstone.metaData.addProvider(
  myCustomProvider.get.bind(myCustomProvider),
  priority
);
```

## Usage Example

Now that the provider is registered, we can use it to fetch the metadata for an image.
But first, let's assume during the image loading we fetch the metadata for the imageId
and store it in the cache of the provider. Later, we can use the provider to fetch the
metadata for the imageId and use it (e.g., to properly show SUV values for tools).

```js
// Retrieve this metaData
const imagePlaneModule = cornerstone.metaData.get(
  'scalingModule',
  'scheme://imageId'
);
```
