# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [2.1.1] - 2018-04-18
### Fixed
- Bugfix: Webworkers getting 'window undefined' but related to Webpack update

## [2.1.0] - 2018-04-11
### Changed
- Updated Webpack to version 4
- DIST folder is now removed from the repository
- Set W/L by default for color images

### Added
- Added useWebWorkers flag to decodeConfig
- Added JSDoc to the transfer-syntax extraction
- Handle signed data (thanks @jdnarvaez)
- Added a decache function in image load object (thanks @adreyfus)

### Fixed
- Bugfix: remove the promise regardless of success or failure


## [2.0.0] - 2017-12-08
### Changed

- *Breaking Change!!!* Switches image loader return values to support the breaking change in Cornerstone Master (https://github.com/cornerstonejs/cornerstone/commit/9448755397da10a6de6f694d83123274cbd4b38e) which requires image loaders to return an object of the form { promise, cancelFn }.
- *Breaking Change!!!* Removed jQuery events from triggerEvent, lower-cased all the event names.
- *Breaking Change!!!* Switched all Deferred usage to use Promises
- *Breaking Change!!!* Updated to depend on Cornerstone 2.0.0 or higher

## [1.0.5] - 2017-12-08
### Added
- beforeSend option now passes imageId as its second parameter. This is useful for writing beforeSend functions which have different actions depending on the image type.

### Changed
- Moved the repository from Chris Hafey's (@chafey) personal page to a new Organization (@cornerstonejs). Renamed all the relevant links. Join us at @cornerstonejs to start contributing!

## [1.0.4] - 2017-11-26
### Added
- Added support for DICOM Parametric Maps

Float pixel data is rescaled to Uint16 for display and new rescale slope and intercept values are calculated. The original float pixel data is available in the image object as image.floatPixelData.

- Added eslint-plugin-import to force paths to resolve

### Changed
- Improvements for special cases with Palette Color images (#42):

- Check that the number of entries for the palette color LUT descriptors matches the actual data length in the LUT data. If it doesn't, then the bits allocated for the LUT must be 16, regardless of whether or not the descriptor specifies it as 8.
- If the descriptor is wrong, update it so we can use the proper shift value.
- Preprocess the R/G/B LUT arrays, rather than shifting each pixel individually.

## [1.0.3] - 2017-11-21
### Changed
- Fix bug introduced in 1.0.2 in which WADO-URI rows/columns are undefined in the metaDataProvider (thanks @hardmaster92)

## [1.0.2] - 2017-11-21
### Added
- WADO URI and WADO RS metaData providers have been updated to provide all necessary information for drawing reference lines with Cornerstone Tools (thanks @dannyrb)
- Some basic decodeImageFrame tests have been written, though they are incomplete (feel free to send a PR!)

### Changed
- Switched this changelog to try to follow http://keepachangelog.com/en/1.0.0/
- README issue has been fixed (@nicomlas)

## Version 1.0.1

- Fix decodeLittleEndian to properly return pixelData for bitsAllocated = 1. This affected DICOM Segmentation files.
- Fix #98: incorrect number of LUT entries issue for Palette Color images.

## Version 1.0.0

- Updated to 1.0.0 because 0.15.0 introduced a breaking change with Cornerstone injection. This doesn't break usage if you are using HTML script tags, but if you are using a module system, Cornerstone WADO Image Loader may not properly find its dependencies.

The solution for this is to inject your Cornerstone instance into Cornerstone Tools as follows:

````javascript
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
````

An example commit doing this in the OHIF Viewer Meteor application is here: https://github.com/OHIF/Viewers/commit/012bba44806d0fb9bb60af329c4875e7f6b751e0#diff-d9ccd906dfc48b4589d720766fe14715R25

We apologize for any headaches that the breaking change in 0.15.0 may have caused for those using module systems.
- Note: the dependencies have been updated to require Cornerstone Core 1.0.0 or above

## Version 0.15.1 (deprecated due to breaking change)

- Added native CustomEvents that are triggered parallel to the jQuery events. This is part of a transition to drop the jQuery dependency entirely.
- *Note:* This version requires Cornerstone Core 0.13.2 or above, where cornerstone.events has the EventTarget interface!

e.g. CornerstoneImageLoadStart has a native CustomEvent name 'cornerstoneimageloadstart'

## Version 0.15.0 (deprecated due to breaking change)

- Further fixes for browser native ES6 module loading
- Fix Web Worker tasks being inserted incorrectly based on priority
- Migrate createImage, decodeJPEGBaseline8BitColor, loadFileRequest, getPixelData, and dataSetCacheManager from Deferred to Promises
- Add dependency injection for cornerstone

## Version 0.14.7

- Bumped up cornerstone version to 0.12.2
- Removed library `Loadash` and added `Lodash` as a DevDependency

## Version 0.14.5

- Rename loadDataSetFromPromise to loadImageFromPromise (https://github.com/cornerstonejs/cornerstoneWADOImageLoader/pull/94)
- Set web worker status ready after task is read (https://github.com/cornerstonejs/cornerstoneWADOImageLoader/pull/95)
- Fixes for dependencies after migration to Webpack (@lscoder)

## Version 0.14.4

- Migrate to new build process with Webpack and Babel. Remove grunt from WebWorker and Codec file construction. (@lscoder)
- Fixes for examples after inital migration steps (@kofifus, @lscoder)
- Typo in package.json (@JMiha)
- Bug fix for the inital draw of color images with WW/WC 255/128
- Bug fixes for JPEG Baseline 8 Bit decoding (https://github.com/cornerstonejs/cornerstoneWADOImageLoader/issues/46)