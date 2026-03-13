---
id: index
title: Cornerstone Metadata
summary: Centralized module for DICOM metadata management, providing consistent API access to metadata modules and intelligent split/sort rules for display set organization
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# Metadata Introduction

The `Cornerstone Metadata` module (`@cornerstonejs/metadata`) provides a centralized approach to handling DICOM metadata in Cornerstone3D, OHIF and other DICOM accessing applications. This module is designed to standardize how metadata is accessed, processed, and utilized across both imaging and non-imaging pipelines.

This specifically excludes any image compression/decompression, which belongs to the dicom-image-loader library, as well
as any viewing/display components or tools, which belong to core and tools respectively.

## Overview

Managing DICOM metadata is a critical aspect of medical imaging applications. The Metadata module addresses this by providing:

- **Consistent API Entry**: A unified interface for accessing and managing metadata across different metadata modules and providers
- **DICOM Metadata Handling**: Specialized tools and utilities for parsing, storing, and retrieving DICOM metadata
- **Split/Sort Rules**: Intelligent algorithms for organizing images into display sets based on metadata criteria such as series, acquisition parameters, and image characteristics
- **Display Set Organization**: Automated grouping and sorting of images to create meaningful display sets for clinical review

## Background

The handling of metadata in OHIF and CS3D has repeated code causing different types of handling to work mostly, but have
different bugs. There are also parts of the system such as display set access which are logically part of CS3D, but which
also end up getting duplicates or being unavailable. This module centralizes that handling by building on top of the
`dcmjs` module `DicomMetadataListener`. This is a much earlier point of interception of the DICOM metadata than the
existing metadata handler, and in specific, is before all of the customization/special cases that were previously added
for each of the different paths. That means that a single code path can be tested for much of the metadata handling,
allowing bugs to be fixed once rather than repeatedly. It also means that choices that people have made around requirements
can be applied consistently and once. Both of these will result in significantly reduced bugs and lower maintenance.

The second part of this is that there is a fair bit of metadata stored in different parts of the system, each with custom
storage logic. For example, there are stores for:

- Display Sets
- dicom_parser results
- JSON metadata queries
- DICOM metadata results
- per frame "instance" results
- general "instance" results, not per frame

Making these stored and contain consistent results prevents a significant amount of duplicate of code, and allows
access to data across the system in a consistent fashion. There are literally dozens of repeated classes, almost the same,
yet needing testing for that part.

The third part of this is the interaction of OHIF and CS3D. OHIF is designed as a viewer. It SHOULD not have the building/library blocks for everything re-built into the OHIF side of things. Separating out sorting/split/display set handling logic,
but NOT the services for those allows OHIF to focus on what it is good at - building a VIEWER library, and skip handling of what it is bad at, implementing libraries for handling DICOM information.

Overall, making this handling consistent also allows a much better test dataset to be developped since it only needs one
test set rather than multiples.

## Design

The design of the metadata component is intended to be as a library of functionality which provides access to different
parts of the DICOM metadata. It is intended to be developped ongoing as a plugin to the existing CS3D metadata, with the
first use to replace some of the examples parse handling.

- Retrieval of part 10, metadata, JSON or other data
  - already deduplicated parse data for stream performance, as server filter
- Conversion to a standard "metadata listener" format EARLY on
- Sorting of instance data
- Provision of standardized getMetadata calls for:
  - existing dicom group functionality (eg `GeneralSeriesModule`)
  - per-frame data, eg `combineframeinstance` results
  - per-instance data - not currently available reliably
  - raw DICOM part 10/metadata/frame data/bulkdata
  - display set contents
- organization/split functions for DICOM data
- streaming parsing on retrieval of data
  - part 10 streaming parse already exists
  - add streaming parse for metadata, json etc
  - direct to naturalized format, NO intermediate storage required
- deduplicated patient/study/series records
- write/convert to various format direct from naturalized format
- various special purpose metadata updates, eg:
  - user calibration
  - computedSpacingModule to create consistent spacing information

## Expected Implementation

The expected implementation is to implement a basic plugin to the existing getMetadata
functionality, and then demonstrate viewing in a single examples plugin on a released
CS3D version. This will demonstrate viewing capabilities and allow testing of the
basic framework. The phases are expected to be:

- Basic parse of part 10 and metadata plugins
- Inject metadata into localAdvanced and local examples to show functionality
- Replace OHIF metadata handling with `@cornerstonejs/metadata` library
- Add basic display set storage to metadata, inject to existing examples in CS3D
- Add split/sort functionality and demonstrate usage in OHIF to centralize handling of split/sort
- Move remaining examples to new library and deprecate old functionality
- Remove old parse handling at the 1 year mark, including all usage of dicom-parser

## Components

## Key Features

### Metadata Module API

The metadata module provides a consistent API entry point that allows:

- Registration of custom metadata providers
- Retrieval of metadata using standardized queries
- Caching and performance optimization for metadata access
- Extension points for application-specific metadata handling

### Split and Sort Rules

The module includes sophisticated split/sort rules that enable:

- Automatic organization of images into logical display sets
- Customizable splitting criteria based on DICOM tags
- Sorting algorithms that respect clinical workflows
- Support for multi-modality and multi-series studies

## Use Cases

The Metadata module is essential for:

- Creating display sets from series data
- Implementing custom hanging protocols
- Organizing 4D datasets (time series)
- Handling dynamic and multi-phase studies
- Supporting advanced image routing and distribution

<DocCardList items={useCurrentSidebarCategory().items}/>
