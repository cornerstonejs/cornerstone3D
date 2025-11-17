---
id: metadataProvider
title: Metadata Providers
summary: Functions that retrieve and provide non-pixel metadata associated with medical images, supporting DICOM and custom metadata through a prioritized provider system
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

## Provided Computed Metadata

There are a few metadata providers which either store metadata information updated/modified while running,
or which transform the existing metadata into other formats, or provide static metadata.

### Transient Metadata

#### Calibrated Pixel Spacing

The `calibratedPixelSpacingMetadataProvider` allows storing of over-ride values for
the calibration metadata, allowing a user or system to add calibration of spacing
for an image independent of the original metadata.

### Computed Metadata

Some metadata can be computed based on other metadata available in the system.
For example, the adapters module can generate study module information in the
'Normalized' format from dcmjs based on the existing default metadata providers.

It is suggested that any metadata that is computed just from straight DICOM
data, but is modified in some way use a computed metadata provider. This pattern
allows creating standard computed changes to the existing metadata across
a variety of different types of underlying data such as multiframe instances, formatted data,
or data used for producing new instances

#### `referencedMetadataProvider`

The adapters module provides referenced metadata useful when creating new instances
based on an existing module. It also provides constants for the Part 10 prefix
header and referenced objects.

##### Study, Series, Instance Data

The data modules provide the study or series level information in the 'Normal'
format for dcmjs, without including the full instance header, and based on the
underlying standard modules defined for WADO-URI, RS and from OHIF.

##### Part 10 Constants

The part 10 \_meta field in dcmjs can be hard coded, but that prevents changes
to the generated object without modifying the object after creation or without modifying the creation code.
The part 10 constants metadata provides the standard `0002` header module for
dcmjs to use when encoding DICOM.

##### Referenced and Predecessor Data

The referenced data and predecessor sequence providers allow replacing the default
instance in an SR or SEQ type series with a new one that references the previously
used data.
