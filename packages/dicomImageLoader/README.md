cornerstone WADO Image Loader
=============================

A [cornerstone](https://github.com/chafey/cornerstone) Image Loader for DICOM P10 instances over
HTTP.  This can be used to integrate cornerstone with WADO servers or any other HTTP based server
that returns DICOM P10 instances (e.g. [Orthanc](http://www.orthanc-server.com/) or custom built)

Project Status
---------------
Alpha but usable, see key features and backlog below.

Live Examples
---------------

[Click here for a live example of this library in use!](http://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html)

You can also see it in action with the
[cornerstoneDemo application](https://github.com/chafey/cornerstoneDemo).

Install
-------

Get a packaged source file:

* [cornerstoneWADOImageLoader.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.js)
* [cornerstoneWADOImageLoader.min.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.min.js)

Usage
-------

The cornerstoneWADOImageLoader depends on the following libraries:

1. [jQuery](https://github.com/jquery/jquery)
2. [dicomParser](https://github.com/chafey/dicomParser) 
3. [cornerestone](https://github.com/chafey/cornerStone)

All three of these libraries should be loaded before the cornerstoneWADOImageLoader.js.  See the source code 
for the [example](https://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html).

The image loader prefix is 'dicomweb'.  Here are some example imageId's:

absolute url:

```
dicomweb:http://cornerstonetech.org/images/ClearCanvas/USEcho/IM00001
```

relative url:

```
dicomweb:/images/ClearCanvas/USEcho/IM00001
```

WADO url:

```
dicomweb:http://localhost:3333/wado?requestType=WADO&studyUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.1&seriesUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.2&objectUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075557.1&contentType=application%2Fdicom&transferSyntax=1.2.840.10008.1.2.1
```

[Orthanc](http://www.orthanc-server.com/) file endpoint URL:

```
dicomweb:http://localhost:8042/instances/8cce70aa-576ad738-b76cb63f-caedb3c7-2b213aae/file
```

Note that the web server must support [Cross origin resource sharing](http://en.wikipedia.org/wiki/Cross-origin_resource_sharing) 
or the image will fail to load.  If you are unable to get CORS enabled on the web server that you are loading DICOM P10
instances from, you can use a [reverse proxy](http://en.wikipedia.org/wiki/Reverse_proxy).  Here is a 
[simple Node.js based http-proxy](http://chafey.blogspot.com/2014/09/working-around-cors.html) that adds CORS headers
that you might find useful.

Key Features
------------

* Implements a [cornerstone ImageLoader](https://github.com/chafey/cornerstone/wiki/ImageLoader) for DICOM P10 Instances via a HTTP get request. 
  * Can be used with a WADO server
  * Can be used with Orthanc's file endpoint
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
