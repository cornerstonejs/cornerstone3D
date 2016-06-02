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

For JPEG 2000 support, you must load one of the following codecs (see below for more information):

1. [OpenJPEG based codec](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/examples/libopenjpeg.js)
2. [PDF.js based codec](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/examples/jpx.min.js)

For JPEG-LS support, you must load the following codec:

1. [CharLS Based codec](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/examples/libCharLS.js)

All of these libraries should be loaded before the cornerstoneWADOImageLoader.js.  See the source code
for the [examples](https://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html) for how
these codecs are loaded.

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

###### OpenJPEG

[OpenJPEG based JPEG2000 Codec](https://github.com/chafey/openjpeg)

This is the recommended codec as it is based on the [OpenJPEG](https://github.com/uclouvain/openjpeg)
project which is fairly complete and actively maintained.  If you have problems decoding a JPEG2000 file, you should
seek out support from the OpenJPEG community.  Special thanks to @jpambrun for creating the EMSCRIPTEN build.

###### PDF.js based

[OHIF/image-JPEG2000](https://github.com/OHIF/image-JPEG2000)

This codec is based on the [pdf.js](https://github.com/mozilla/pdf.js) project with fixes/enhancements
made by @jpambrun specific to medical imaging.  It generally runs faster than the OpenJPEG codec, but
there are several [known issues](https://github.com/OHIF/image-JPEG2000/issues) that may never be fixed.

###### Performance Comparison

Images from [here](ftp://medical.nema.org/MEDICAL/Dicom/DataSets/WG04/compsamples_j2k.tar)

iMac Retina 5k Late 2014 4GHz Intel Core i7 Chrome 50.0.2661.102 (64 bit)

| Image         | OpenJPEG      | PDF.js   |
| --------------| ------------- | -------- |
| NM1_J2KR      | 233 ms        | 103 ms   |
| CT1_J2KR      | 424 ms        | 147 ms   |
| RG1_J2KR      | 6058 ms       | 2311 ms  |
| MG1_J2KR      | 19312 ms      | 7380 ms  |


iMac Retina 5k Late 2014 4GHz Intel Core i7 FireFox 46.0.1

| Image         | OpenJPEG      | PDF.js   |
| --------------| ------------- | -------- |
| NM1_J2KR      | 240 ms        | 102 ms   |
| CT1_J2KR      | 185 ms        | 91 ms    |
| RG1_J2KR      | 3445 ms       | 1594 ms  |
| MG1_J2KR      | 10295 ms      | 14207 ms |

iMac Retina 5k Late 2014 4GHz Intel Core i7 Safari 9.1.1

| Image         | OpenJPEG      | PDF.js   |
| --------------| ------------- | -------- |
| NM1_J2KR      | 64 ms         | 56 ms    |
| CT1_J2KR      | 115 ms        | 94 ms    |
| RG1_J2KR      | 2367 ms       | 1567 ms  |
| MG1_J2KR      | 6496 ms       | 18547 ms |


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

Acknowledgements
----------------

* [rii-mango](https://github.com/rii-mango) for the [JPEGLossless decoder](https://github.com/rii-mango/JPEGLosslessDecoderJS)
* [gSquared](https://github.com/g-squared) for the JPEG lossy decoder, RLE and PALETTE_COLOR support
* [jpambrun](https://github.com/jpambrun) and [pdf.js](https://github.com/mozilla/pdf.js) for the JPEG 2000 decoder
* [jpambrun](https://github.com/jpambrun) and [OpenJPEG](http://www.openjpeg.org/) for another JPEG 2000 decoder
* [CharLS](https://github.com/team-charls/charls) for JPEG-LS

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
Copyright 2016 Chris Hafey [chafey@gmail.com](mailto:chafey@gmail.com)
