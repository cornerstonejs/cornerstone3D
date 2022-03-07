---
id: metadataProvider
title: Metadata Providers
---


# Metadata Providers

A Metadata Provider is a JavaScript function that acts as an interface for accessing metadata related to Images in Cornerstone. Users can define their own provider functions in order to return any metadata they wish for each specific image.

Medical images typically come with lots of non-pixel-wise metadata such as for example, the pixel spacing of the image, the patient ID, or the scan acquisition date. With some file types (e.g. DICOM), this information is stored within the file header and can be read and parsed and passed around your application. With others (e.g. JPEG, PNG), this information needs to be provided independently from the actual pixel data. Even for DICOM images, however, it is common for application developers to provide metadata independently from the transmission of pixel data from the server to the client since this can considerably improve performance.

To handle these scenarios, Cornerstone provides infrastructure for the definition and usage of Metadata Providers. Metadata Providers are simply functions which take in an [ImageId](./imageId.md) and specified metadata type, and return the metadata itself.


In our `demo` apps we use a simple metadata provider `WADORSHeaderProvider` which enables querying metadata by instance and imageId.


## Priority of Metadata Providers
Since it is possible to register more than one metadata provider, upon adding a provider you can define a priority number for it. When there is a time to request metadata, Cornerstone requests the metadata for imageId by the priority order of providers (if provider returns `undefined` for the imageId, Cornerstone moves to the next provider).

For instance, if provider1 is registered with 10 priority and provider2 is registered
with 100 priority, provider2 is asked first for the metadata for the imageId.

## Registering Metadata Provider


```js
import { metadata } from '@ohif/cornerstone-core'

metaData.addProvider(
  WADORSHeaderProvider.get.bind(WADORSHeaderProvider),
  9999 // priority number, higher number => bigger priority
)
```

## Skeleton of Metadata Providers

- A provider should implement a `get` method, with `type` and `imageId` argument
- Additional argument can be added as necessary after imageId
- Often when requesting the instanceMetadata from the server, we add important metadata for each instance to the related provider, in case, in future, Cornerstone or consumer application needs to access it.

Example: PET Scaling factor metadata provider, which stores scaling metadata values and returns them when needed.


```js
const scalingPerImageId = {}

function addInstance(imageId, scalingMetaData) {
  scalingPerImageId[imageId] = scalingMetaData
}

function get(type, imageId) {
  if (type === 'scalingModule') {
    return scalingPerImageId[imageId]
  }
}

const ptScalingMetaDataProvider =  { addInstance, get }

export default ptScalingMetaDataProvider
```
