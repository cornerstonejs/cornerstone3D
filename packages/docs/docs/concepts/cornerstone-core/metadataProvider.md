---
id: metadataProvider
title: Metadata Providers
---

# Metadata Providers

Medical images typically come with lots of non-pixel-wise metadata such as the pixel spacing of the image, the patient ID, or the scan acquisition date. With some file types (e.g. DICOM), this information is stored within the file header and can be read and parsed and passed around your application. With others (e.g. JPEG, PNG), this information needs to be provided independently from the actual pixel data. Even for DICOM images, however, it is common for application developers to provide metadata independently from the transmission of pixel data from the server to the client since this can considerably improve performance.

A Metadata Provider is a JavaScript function that acts as an interface for accessing metadata related to Images in Cornerstone. Users can define their own provider functions in order to return any metadata they wish for each specific image. A Metadata Provider function has the following prototype:

```
function metadataProvider(type: string, ...queries: any): any
```

However, typically, providers implement the following, more simple prototype:

```
function metadataProvider(type: string, imageId: string): Record<string, any>
```

This is because most metadata is provided for [ImageIds](./imageId.md), but Cornerstone provides infrastructure
for the definition and usage of metadata providers for any information.

## Types of Metadata

The `type` parameter to a metadata provider can be any string. You can call `cornerstone.metaData.get()` with any type,
and if any metadata provider can provide that type for the given image ID, you get the response. You can use this, for
example, to easily provide application-specific information such as ground truth or patient information.

Cornerstone core and tools also automatically request various types of metadata for displayed images. A list of standard
metadata modules can be found in the [MetadataModules section](/docs/api/core/namespaces/enums/enumerations/metadatamodules/) of the API reference.
Many of these modules conform to the DICOM standard. If you want to implement them in a [custom metadata
provider](../../how-to-guides/custom-metadata-provider.md), it is easiest to look at how an existing metadata provider
implements them, such as the [WADOURI metadata
provider](https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/dicomImageLoader/src/imageLoader/wadouri/metaData/metaDataProvider.ts#L65).

## Priority of Metadata Providers

Since it is possible to register more than one metadata provider, upon adding a provider you can define a priority number for it. When there is a time to request metadata, Cornerstone requests the metadata for `imageId` by the priority order of providers (if provider returns `undefined` for the imageId, Cornerstone moves to the next provider).

For instance, if provider1 is registered with 10 priority and provider2 is registered
with 100 priority, provider2 is asked first for the metadata for the imageId.
