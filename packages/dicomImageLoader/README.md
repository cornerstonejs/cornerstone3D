cornerstone WADO Image Loader
=============================

A [cornerstone](https://github.com/chafey/cornerstone) Image Loader for WADO images.


Project Status
---------------
Alpha - don't even bother trying to use this right now but the live example works well enough to see where this is going

Live Examples
---------------

[Click here for a live example of this library in use!](https://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html)

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

* Provides a bridge between the cornerstone library and WADO servers


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
* Support color images
* Mask out burned in overlays?
* Consider alternatives to jQuery for deffered (when.js?)
* Add error handling
* Find a way to access the parsed dicom elements for updating the overlays
* Add example of creating a stack from multiple images
* Add support for multiframe
* Add support for compressed transfer syntaxes

Why is this a separate library from cornerstone?
================================================

Mainly to avoid adding a dependency to cornerstone for the DICOM parsing library.  While cornerstone is
intended to be used to display medical images that are stored in DICOM, cornerstone aims to simplify
the use of medical imaging and therefore tries to hide some of the complexity that exists within
DICOM.  It is also desirable to support display of non DICOM images so a DICOM independent image model
makes sense.


Copyright
============
Copyright 2014 Chris Hafey [chafey@gmail.com](mailto:chafey@gmail.com)