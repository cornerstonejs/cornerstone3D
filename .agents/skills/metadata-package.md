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

## Key Exports

- `metaData` namespace: `addProvider`, `addTypedProvider`, `get`, `getMetaData`,
  `getNormalized`, `typedProviderProvider`, `clearQuery`, `clear`,
  `toUpperCamelTag`, `toLowerCamelTag`
- `Enums.MetadataModules`: Standard module name enum (imagePlaneModule,
  imagePixelModule, generalSeriesModule, DICOMSource, instanceOrig, etc.)
- `Enums.CalibrationTypes`: Calibration type enum (ERMF, Projection, User, etc.)
- `utilities.DicomStream`: `DataSetIterator`, `MetaDataIterator`,
  `NaturalTagListener`, `DicomStreamListener`, `MetadataTagListener`,
  `SkipListener`, `BulkdataCreator`
- `utilities.Tag`: Tag definitions, `mapTagInfo`/`mapModuleTags` registries,
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
