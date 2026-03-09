# @cornerstonejs/metadata Package

## Overview

The `@cornerstonejs/metadata` package is the foundational metadata management layer
for the Cornerstone3D ecosystem. It provides metadata information for other
modules and applications including OHIF and other cornerstone modules. The
architecture is based on the dcmjs async dicom parser listener method, using a
listener/iterator pattern to parse DICOM data from multiple sources (DICOMweb
metadata, Part 10 datasets, naturalized objects) into a standardized module
format.

The package also contains supporting code for series splitting into display
sets, sorting, and other metadata-driven operations needed for organizing and
presenting medical imaging data.

## Architecture

- **Provider Chain**: Priority-based singleton where providers are queried
  highest-to-lowest until one returns a value. The typed provider system adds
  module-specific handlers that run at priority -1000 using a chained middleware
  pattern (next-based, like Express.js).

- **DicomStream / Listener Pattern**: Based on the dcmjs async dicom parser
  listener method. Iterators (`DataSetIterator` for dicom-parser datasets,
  `MetaDataIterator` for DICOMweb JSON) push tag events to listeners
  (`NaturalTagListener`, `MetadataTagListener`) that build up naturalized or
  raw metadata objects. This enables converting different DICOM data formats
  to a shared standardized format without tightly coupling to any one parser.

- **Tag Modules**: The `Tags` registry maps DICOM tags (by hex code, xTag, and
  name) to metadata modules. `tagModules` auto-generates typed providers for
  each registered module, so any module defined in `mapModuleTags` is
  automatically available via `metaData.get(moduleName, imageId)`.

- **Series Splitting**: `splitImageIdsBy4DTags` splits image sets by temporal,
  diffusion, cardiac, and other parameters for 4D display set creation.
  Supports multiframe NM gated SPECT/PET (TimeSlotVector/SliceVector),
  cardiac gating (TriggerTime), and single-frame 4D tags (DiffusionBValue,
  EchoTime, TemporalPositionIdentifier, vendor-private B-value tags).

## Differences to Earlier Metadata Providers

The earlier metadata providers encapsulated the volatility of different types of
metadata handling at a higher level than the low level parsing.  As well, each
provider added different higher level support for things like calibrated images.
As a result, there were numerous bugs in the different uses of these in the examples
and in OHIF and other viewers.  Using a standardized listener interface at an earlier
point and then providing standard implementations of code like the calibration
data on top of that allows for much more consistent behaviour between different uses and parts
of the system.  It also allows for a single set of test code to cover many more
types of data.

Additionally, there was quite a bit of data that wasn't accessible via the standard
get metadata functionality.  Examples of this include display sets (splits of instances
into sets of images to display together), access to parsed but not split metadata,
multiframe standardization, sorting and other areas.  Combining these allows a single
implementation to be created and tested, resulting in much more consistency between
different applications based on CS3D.

## What belongs in metadata, core, dicom-image-loader and adapters

The metadata package should have the metadata provider and organization/utility
functions dealing with metadata such as display set and series split.  As well,
functionality dealing with enhanced metadata such as calibration and ERMF handling
belong in metadata.

The core package is designed around html viewer ports and rendering for DICOM.  The
core package should NOT have metadata handling or utilities, and should not have
image loading/managing utilities except for the front end caching utilities dealing
with teh direct browser cache for images.

The dicom-image-loader deals with actually retrieving instance data, injecting it into the
metadata framework and then decompressing images.  It also has image decompression specific
utilities for dealing with metadata such as pixel range clipping/determination where the
knowledge about that pixel data is part of the decompression logic.

The adapters deals with converting already parsed metadata into tools and segmentation
representations, and converting the data back into naturalized formats.  This can then
be provided to the dicom-image-loader library for transmission back to a DICOM PACS, or
registered with the metadata library for immediate viewing.

## Key Exports

- `metaData` namespace: `addProvider`, `addTypedProvider`, `get`, `getMetaData`,
  `getNormalized`, `typedProviderProvider`, `clearQuery`, `clear`,
  `toUpperCamelTag`, `toLowerCamelTag`
- `Enums.MetadataModules`: Standard module name enum (imagePlaneModule,
  imagePixelModule, generalSeriesModule, instanceOrig, etc.)
- `Enums.CalibrationTypes`: Calibration type enum (ERMF, Projection, User, etc.)
- `utilities.DicomStream`: `DataSetIterator`, `MetaDataIterator`,
  `NaturalTagListener`, `DicomStreamListener`, `MetadataTagListener`,
  `SkipListener`,
- `utilities.Tags`: Tag definitions, `mapTagInfo`/`mapModuleTags` registries,
  `addTag` for extending the registry
- `utilities.splitImageIdsBy4DTags`: 4D series splitting
- `utilities.calibratedPixelSpacingMetadataProvider`: Calibrated pixel spacing
- `utilities.getPixelSpacingInformation`: Pixel spacing with ERMF handling
- Type exports: `IImageCalibration`, `ImagePlaneModuleMetadata`,
  `ImagePixelModuleMetadata`, `GeneralSeriesModuleMetadata`, etc.

## Dependencies

- `gl-matrix` (direct) -- used for vec3 operations in combineFrameInstance
- No peer dependencies -- this is the foundational package

## Consumed By

- `@cornerstonejs/core` (peerDependency, re-exports for backward compatibility)
- `@cornerstonejs/dicom-image-loader` (peerDependency)
- OHIF viewer (transitively via core)
- Other cornerstone modules that need metadata access

## Location

`packages/metadata/`
