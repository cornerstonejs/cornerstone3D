cornerstone WADO Image Loader
=============================

A [cornerstone](https://github.com/chafey/cornerstone) Image Loader for DICOM P10 instances over
HTTP (e.g. WADO).

Project Status
---------------
Alpha but usable, see key features and backlog below.

Live Examples
---------------

[Click here for a live example of this library in use!](https://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html)

You can also see it in action with the
(cornerstoneDemo application)[https://github.com/chafey/cornerstoneDemo].

Install
-------

Get a packaged source file:

* [cornerstoneWADOImageLoader.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.js)
* [cornerstoneWADOImageLoader.min.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.min.js)

Usage
-------

```
TODO
```

Key Features
------------

* Implements a (cornerstoneImageLoader)[https://github.com/chafey/cornerstone/wiki/ImageLoader] for DICOM P10 Instances via a HTTP get request.  This will work
  with WADO.
* Supports multiframe
* Supported pixel formats:
    * 8 bit grayscale
    * 16 bit grayscale (unsigned and signed)
    * RGB Color
    * YBRFull Color
    * YBRFull422 Color (including encapsulated)
* Supported transfer syntaxes
    * Implicit Little Endian
    * Explicit Little Endian

NOTE: JPEG2000 is not supported!

Build System
============

This project uses grunt to build the software.

Pre-requisites:
---------------

NodeJs - [click to visit web site for installation instructions](http://nodejs.org).

grunt-cli

> npm install -g grunt-cli

bower

> npm install -g bower

Common Tasks
------------

Update dependencies (after each pull):
> npm install

> bower install

Running the build:
> grunt

Automatically running the build and unit tests after each source change:
> grunt watch

Backlog
------------

* Support images with Pixel Padding
* Mask out burned in overlays?
* Consider alternatives to jQuery for deferred (when.js?)
* Add error handling
* Add support for compressed transfer syntaxes
  * JPEG 2000
  * JPEG
  * RLE
* Add support for less common pixel formats

FAQ
===

_Why is this a separate library from cornerstone?_

Mainly to avoid adding a dependency to cornerstone for the DICOM parsing library.  While cornerstone is
intended to be used to display medical images that are stored in DICOM, cornerstone aims to simplify
the use of medical imaging and therefore tries to hide some of the complexity that exists within
DICOM.  It is also desirable to support display of non DICOM images so a DICOM independent image model
makes sense.


Copyright
============
Copyright 2014 Chris Hafey [chafey@gmail.com](mailto:chafey@gmail.com)