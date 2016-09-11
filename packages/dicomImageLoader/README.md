cornerstone WADO Image Loader
=============================

A [cornerstone](https://github.com/chafey/cornerstone) Image Loader for DICOM P10 instances over
HTTP (WADO-URI) or DICOMWeb (WADO-RS).  This can be used to integrate cornerstone with WADO-URI
servers, DICOMWeb servers or any other HTTP based server that returns DICOM P10 instances
 (e.g. [Orthanc](http://www.orthanc-server.com/) or custom servers)

Troubleshooting
---------------

Having problems viewing your images with cornerstonWADOImageLoader?  Check out the
[troubleshooting guide](https://github.com/chafey/cornerstoneWADOImageLoader/wiki/troubleshooting).

Live Examples
---------------

[Click here for a live example of this library in use!](http://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html)

You can also see it in action with the
[cornerstoneDemo application](https://github.com/chafey/cornerstoneDemo).

Install
-------

Get the distributed unminimized files:

* [cornerstoneWADOImageLoader.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.js)
* [cornerstoneWADOImageLoaderCodecs.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoaderCodecs.js)
* [cornerstoneWADOImageLoaderWebWorker.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoaderWebWorker.js)

or the distributed minimized files:

* [cornerstoneWADOImageLoader.min.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.min.js)
* [cornerstoneWADOImageLoaderCodecs.min.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoaderCodecs.min.js)
* [cornerstoneWADOImageLoaderWebWorker.min.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoaderWebWorker.min.js)

Usage
-------

The cornerstoneWADOImageLoader depends on the following external libraries which should be loaded before cornerstoneWADOImageLoad.js:

1. [jQuery](https://github.com/jquery/jquery)
2. [dicomParser](https://github.com/chafey/dicomParser) 
3. [cornerstone](https://github.com/chafey/cornerStone)

Have your code configure the web worker framework with the paths to the web worker and the codecs:

``` javascript
   var config = {
        webWorkerPath : '../../dist/cornerstoneWADOImageLoaderWebWorker.js',
        taskConfiguration: {
            'decodeTask' : {
                codecsPath: '../dist/cornerstoneWADOImageLoaderCodecs.js'
            }
        }
    };
    cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
```

See the [web workers](docs/WebWorkers.md) documentation for more details on configuring.

Key Features
------------

* Implements a [cornerstone ImageLoader](https://github.com/chafey/cornerstone/wiki/ImageLoader) for DICOM P10 Instances via a HTTP get request.
  * Can be used with a WADO-URI server
  * Can be used with Orthanc's file endpoint
  * Can be used with any server that returns DICOM P10 instances via HTTP GET
* Implements a [cornerstone ImageLoader](https://github.com/chafey/cornerstone/wiki/ImageLoader) for WADO-RS (DICOMWeb)
* Supports many popular transfer syntaxes and photometric interpretations [see full list](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/docs/TransferSyntaxes.md) and [codec](docs/Codecs.md) for more information.
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
