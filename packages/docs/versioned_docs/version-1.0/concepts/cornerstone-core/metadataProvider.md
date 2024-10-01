---
id: metadataProvider
title: Metadata Providers
---

# Metadata Providers

Medical images typically come with lots of non-pixel-wise metadata such as the pixel spacing of the image, the patient ID, or the scan acquisition date. With some file types (e.g. DICOM), this information is stored within the file header and can be read and parsed and passed around your application. With others (e.g. JPEG, PNG), this information needs to be provided independently from the actual pixel data. Even for DICOM images, however, it is common for application developers to provide metadata independently from the transmission of pixel data from the server to the client since this can considerably improve performance.

A Metadata Provider is a JavaScript function that acts as an interface for accessing metadata related to Images in Cornerstone. Users can define their own provider functions in order to return any metadata they wish for each specific image.

Cornerstone provides infrastructure for the definition and usage of metadata providers. Metadata providers are simply functions which take in an [ImageId](./imageId.md) and a specified metadata type, and return the metadata itself.

## Priority of Metadata Providers

Since it is possible to register more than one metadata provider, upon adding a provider you can define a priority number for it. When there is a time to request metadata, Cornerstone requests the metadata for `imageId` by the priority order of providers (if provider returns `undefined` for the imageId, Cornerstone moves to the next provider).

For instance, if provider1 is registered with 10 priority and provider2 is registered
with 100 priority, provider2 is asked first for the metadata for the imageId.

## Skeleton of Metadata Providers

- A provider should implement a function with `type` and `imageId` arguments
- Additional argument can be added as necessary after imageId
