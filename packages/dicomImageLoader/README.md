[![NPM version][npm-version-image]][npm-url] [![NPM downloads][npm-downloads-image]][npm-url] [![MIT License][license-image]][license-url] [![Build Status][travis-image]][travis-url]
[![Coverage Status][coverage-image]][coverage-url]

cornerstone WADO Image Loader
=============================

A [cornerstone](https://github.com/cornerstonejs/cornerstone) Image Loader for DICOM P10 instances over
HTTP (WADO-URI) or DICOMWeb (WADO-RS).  This can be used to integrate cornerstone with WADO-URI
servers, DICOMWeb servers or any other HTTP based server that returns DICOM P10 instances
 (e.g. [Orthanc](http://www.orthanc-server.com/) or custom servers)

Troubleshooting
---------------

Having problems viewing your images with cornerstonWADOImageLoader?  Check out the
[troubleshooting guide](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/wiki/troubleshooting).

Live Examples
---------------

[Click here for a live example of this library in use!](http://rawgithub.com/cornerstonejs/cornerstoneWADOImageLoader/master/examples/index.html)

You can also see it in action with the
[cornerstoneDemo application](https://github.com/chafey/cornerstoneDemo).

Install
-------

Get the distributed unminimized file:

* [cornerstoneWADOImageLoader.js](https://unpkg.com/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoader.js)

or the distributed minimized file:

* [cornerstoneWADOImageLoader.min.js](https://unpkg.com/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoader.min.js)

Usage
-------

The cornerstoneWADOImageLoader depends on the following external libraries which should be loaded before cornerstoneWADOImageLoader.js:


1. [dicomParser](https://github.com/cornerstonejs/dicomParser) 
2. [cornerstone](https://github.com/cornerstonejs/cornerstone)

*New in 1.0.0*: Specify the cornerstone instance you want to register the loader with.

````javascript
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
````

Have your code configure the web worker framework:

```javascript
    var config = {
        maxWebWorkers: navigator.hardwareConcurrency || 1,
        startWebWorkersOnDemand : true,
    };
    cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
```

See the [web workers](docs/WebWorkers.md) documentation for more details on configuring.

Key Features
------------

* Implements a [cornerstone ImageLoader](https://github.com/cornerstonejs/cornerstone/wiki/ImageLoader) for DICOM P10 Instances via a HTTP get request.
  * Can be used with a WADO-URI server
  * Can be used with Orthanc's file endpoint
  * Can be used with any server that returns DICOM P10 instances via HTTP GET
* Implements a [cornerstone ImageLoader](https://github.com/cornerstonejs/cornerstone/wiki/ImageLoader) for WADO-RS (DICOMWeb)
* Supports many popular transfer syntaxes and photometric interpretations [see full list](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/master/docs/TransferSyntaxes.md) and [codec](docs/Codecs.md) for more information.
* Framework to execute CPU intensive tasks in [web workers](docs/WebWorkers.md)
  * Used for image decoding
  * Can be used for your own CPU intensive tasks (e.g. image processing)

Backlog
-------

* Support for images with pixel padding
* Support for high bit (e.g. mask out burned in overlays)
* Free up DICOM P10 instance after decoding to reduce memory consumption
* Add support for compressed images to WADO-RS loader
* Look at using EMSCRIPEN based build of IJG for JPEG
* Consolidate all EMSCRIPTEN codecs into one build to cut down on memory use and startup times
* Add support for bulk data items to WADO-RS Loader
* Add events to webWorkerManager so its activity can be monitored
* Add support for issuing progress events from web worker tasks

FAQ
===

_Why is this a separate library from cornerstone?_

Mainly to avoid adding a dependency to cornerstone for the DICOM parsing library.  While cornerstone is
intended to be used to display medical images that are stored in DICOM, cornerstone aims to simplify
the use of medical imaging and therefore tries to hide some of the complexity that exists within
DICOM.  It is also desirable to support display of non DICOM images so a DICOM independent image model
makes sense.

_How do I build this library myself?_

See the documentation [here](docs/Building.md)

_How do I add my own custom web worker tasks?_

See the documentation [here](docs/WebWorkers.md)

_How do I create imageIds that work with this image loader?_

See the documentation [here](docs/ImageIds.md)

Copyright
============
Copyright 2016 Chris Hafey [chafey@gmail.com](mailto:chafey@gmail.com)

<!--
  LINKS
-->

<!-- prettier-ignore-start -->

[license-image]: http://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE

[npm-url]: https://npmjs.org/package/cornerstone-wado-image-loader
[npm-version-image]: http://img.shields.io/npm/v/cornerstone-wado-image-loader.svg?style=flat
[npm-downloads-image]: http://img.shields.io/npm/dm/cornerstone-wado-image-loader.svg?style=flat

[travis-url]: http://travis-ci.org/cornerstonejs/cornerstoneWADOImageLoader
[travis-image]: https://travis-ci.org/cornerstonejs/cornerstoneWADOImageLoader.svg?branch=master

[coverage-url]: https://coveralls.io/github/cornerstonejs/cornerstoneWADOImageLoader?branch=master
[coverage-image]: https://coveralls.io/repos/github/cornerstonejs/cornerstoneWADOImageLoader/badge.svg?branch=master

<!-- prettier-ignore-end -->
