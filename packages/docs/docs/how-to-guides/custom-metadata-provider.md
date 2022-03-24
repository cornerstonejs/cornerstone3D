---
id: custom-metadata-provider
---

# Custom Metadata Provider

In this how-to guide we will show you how to create a custom metadata provider.

## Introduction

Cornerstone **DOES NOT** deal with fetching of the metadata. It uses the registered
metadata providers (in the order of priority) to call each providers passing the `imageId` and
`type` of the metadata to be fetched. It should be noted that each metadata provider
often implements a caching mechanism to avoid unnecessary calls to the providers. In addition,
usually, the metadata provider enables a method to add metadata to the cache.

> Some imageLoaders such as `CornerstoneWADOImageLoader` automatically fetch the metadata
> and adds it to the provider they register with Cornerstone (it should be noted that
> only `wado-uri` scheme does this automatically, and for `wado-rs` you should separately
> fetch the metadata).

One question you might ask is:

:::note How

How can I build a custom metadata provider?

:::

## Implementation

In this example we will implement a custom metadata provider that stores the metadata
for scaling factors of PT images.

### Step 1: Create an add method

We need to store the metadata in a cache, and we need a method to add the metadata.

```js
const scalingPerImageId = {}

function add(imageId, scalingMetaData) {
  scalingPerImageId[imageId] = scalingMetaData
}
```

### Step 2: Create a provider

Next, a provider function is needed, to get the metadata for a specific imageId given
the type of metadata. In this case, the provider only cares about the `scalingModule` type,
and it will return the metadata for the imageId if it exists in the cache.

```js
function get(type, imageId) {
  if (type === 'scalingModule') {
    return scalingPerImageId[imageId]
  }
}
```

### Step 3: Register the provider

Finally, we need to register the provider with cornerstone.

```js title="/src/myCustomProvider.js"
const scalingPerImageId = {}

function add(imageId, scalingMetaData) {
  scalingPerImageId[imageId] = scalingMetaData
}

function get(type, imageId) {
  if (type === 'scalingModule') {
    return scalingPerImageId[imageId]
  }
}

export { add, get }
```

```js title="src/registerProvider.js"
import myCustomProvider from './myCustomProvider'

cornerstone.metaData.addProvider(myCustomProvider.get.bind(myCustomProvider))
```


## Usage Example

Now that the provider is registered, we can use it to fetch the metadata for an image.
But first, let's assume during the image loading we fetch the metadata for the imageId
and store it in the cache of the provider. Later, we can use the provider to fetch the
metadata for the imageId and use it (e.g., to properly show SUV values for tools).

```js
// Retrieve this metaData
const imagePlaneModule = cornerstone.metaData.get('scalingModule', 'scheme://imageId')
```
