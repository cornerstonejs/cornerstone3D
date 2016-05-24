cornerstone WADO Image Loader
=============================

A [cornerstone](https://github.com/chafey/cornerstone) Image Loader for DICOM P10 instances over
HTTP.  This can be used to integrate cornerstone with WADO-URI servers or any other HTTP based server
that returns DICOM P10 instances (e.g. [Orthanc](http://www.orthanc-server.com/) or custom servers)

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

Get a packaged source file:

* [cornerstoneWADOImageLoader.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.js)
* [cornerstoneWADOImageLoader.min.js](https://raw.githubusercontent.com/chafey/cornerstoneWADOImageLoader/master/dist/cornerstoneWADOImageLoader.min.js)

or from bower:

> bower install cornerstoneWADOImageLoader

Usage
-------

The cornerstoneWADOImageLoader depends on the following external libraries:

1. [jQuery](https://github.com/jquery/jquery)
2. [dicomParser](https://github.com/chafey/dicomParser) 
3. [cornerstone](https://github.com/chafey/cornerStone)

Additional libraries are required for JPEG2000 support, see below

All of these libraries should be loaded before the cornerstoneWADOImageLoader.js.  See the source code
for the [example](https://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html).

The image loader prefix is 'wadouri' (note that the prefix dicomweb is also supported but is deprecated and will eventually
be removed).  Here are some example imageId's:

absolute url:

```
wadouri:http://cornerstonetech.org/images/ClearCanvas/USEcho/IM00001
```

relative url:

```
wadouri:/images/ClearCanvas/USEcho/IM00001
```

WADO-URI url:

```
wadouri:http://localhost:3333/wado?requestType=WADO&studyUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.1&seriesUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.2&objectUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075557.1&contentType=application%2Fdicom&transferSyntax=1.2.840.10008.1.2.1
```

[Orthanc](http://www.orthanc-server.com/) file endpoint URL:

```
wadouri:http://localhost:8042/instances/8cce70aa-576ad738-b76cb63f-caedb3c7-2b213aae/file
```

Note that the web server must support [Cross origin resource sharing](http://en.wikipedia.org/wiki/Cross-origin_resource_sharing) 
or the image will fail to load.  If you are unable to get CORS enabled on the web server that you are loading DICOM P10
instances from, you can use a [reverse proxy](http://en.wikipedia.org/wiki/Reverse_proxy).  Here is a 
[simple Node.js based http-proxy](http://chafey.blogspot.com/2014/09/working-around-cors.html) that adds CORS headers
that you might find useful.

JPEG 2000 Support
-----------------

CornerstoneWADOImageLoader supports JPEG2000 via one of two codecs each of which have different levels of performance
and support for JPEG2000:

###### PDF.js based

[OHIF/image-JPEG2000](https://github.com/OHIF/image-JPEG2000)

This is the first JPEG2000 codec that cornerstone integrated.  It is based on the
[pdf.js](https://github.com/mozilla/pdf.js) project with fixes/enhancements made by @jpambrun.  It decodes many
JPEG2000 files but not all and is generally faster than OpenJPEG codec.

###### OpenJPEG

[OpenJPEG based JPEG2000 Codec](https://github.com/jpambrun/openjpeg)

This is a newer JPEG2000 codec (support added May 24, 2016).  It is based on the openJPEG project with fixes/enhancements
made by @jpambrun.  It should decode most (if not all) JPEG2000 files but is generally slower than the PDF.js codec.

Since these codecs are large (and have different licenses associated with them), they must be loaded separately from
cornerstoneWADOImageLoader.  Note that JPEG 2000 is complex and these codecs may have bugs or your file may have been
encoded with a buggy encoder.  If you are having problems displaying your JPEG2000 files, you can try posting
on the [cornerstone forum](https://groups.google.com/forum/#!forum/cornerstone-platform), but support may be limited.

Key Features
------------

* Implements a [cornerstone ImageLoader](https://github.com/chafey/cornerstone/wiki/ImageLoader) for DICOM P10 Instances via a HTTP get request. 
  * Can be used with a WADO server
  * Can be used with Orthanc's file endpoint
  * Can be used with any server that returns DICOM P10 instances via HTTP GET
* Supports many popular transfer syntaxes and photometric interpretations [see full list](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/docs/TransferSyntaxes.md)

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

* Support images with Pixel Padding?
* Mask out burned in overlays?
* Add support for additional transfer syntaxes
  * JPEG-LS 

Acknowledgements
----------------

* [rii-mango](https://github.com/rii-mango) for the [JPEGLossless decoder](https://github.com/rii-mango/JPEGLosslessDecoderJS)
* [gSquared](https://github.com/g-squared) for the JPEG lossy decoder, RLE and PALETTE_COLOR support
* [jpambrun](https://github.com/jpambrun) and [pdf.js](https://github.com/mozilla/pdf.js) for the JPEG 2000 decoder
* [jpambrun](https://github.com/jpambrun) and [OpenJPEG](http://www.openjpeg.org/) for another JPEG 2000 decoder

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
Copyright 2015 Chris Hafey [chafey@gmail.com](mailto:chafey@gmail.com)
