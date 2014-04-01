cornerstone WADO Image Loader
=============================

A [cornerstone](https://github.com/chafey/cornerstone) Image Loader for WADO images.


Live Examples
---------------

[Click here for a list of all live examples](https://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html)

Project Status
---------------
Alpha

Install
-------

Get a packaged source file:

* [cornerstoneWADOImageLoader.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.js)
* [cornerstoneWADOImageLoader.min.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.min.js)

Or install via [Bower](http://bower.io/):

> bower install cornerstoneWADOImageLoader

Usage
-------

```
TODO
```

[See the live examples for more in depth usage of the library](https://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html)

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

*


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