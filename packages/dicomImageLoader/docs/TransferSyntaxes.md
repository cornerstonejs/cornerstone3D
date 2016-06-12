Transfer Syntaxes
=================

This image loader supports the following transfer syntaxes with the help of external codecs:

Uncompressed
------------
* 1.2.840.10008.1.2	Implicit VR Endian
* 1.2.840.10008.1.2.1 Explicit VR Little Endian
* 1.2.840.10008.1.2.2 Explicit VR Big Endian

Compressed (requires codec, see below)
--------------------------------------
* 1.2.840.10008.1.2.5 RLE Lossless
* 1.2.840.10008.1.2.4.50 JPEG Baseline (Process 1 - 8 bit)
* 1.2.840.10008.1.2.4.51 JPEG Baseline (Processes 2 & 4 - 12 bit)
* 1.2.840.10008.1.2.4.57 JPEG Lossless, Nonhierarchical (Processes 14)
* 1.2.840.10008.1.2.4.70 JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])
* 1.2.840.10008.1.2.4.80 JPEG-LS Lossless Image Compression
* 1.2.840.10008.1.2.4.81 JPEG-LS Lossy (Near-Lossless) Image Compression
* 1.2.840.10008.1.2.4.90 JPEG 2000 Image Compression (Lossless Only)
* 1.2.840.10008.1.2.4.91 JPEG 2000 Image Compression
* 1.2.840.10008.1.2.1.99 Deflate Transfer Syntax

Photometric Interpretations
---------------------------
* MONOCHROME1
* MONOCHROME2
* RGB (pixel and planar configurations)
* PALETTE COLOR
* YBR_FULL
* YBR_FULL_422
* YBR_RCT
* YBR_ICT 

Codecs
------

Each compressed transfer syntax requires a separate codec to be loaded to operate:

#### JPEG 2000 (.90, .91)

There are two codecs that support JPEG 2000 - one based on [OpenJPEG](http://www.openjpeg.org/) and
another based on [PDF.js](https://mozilla.github.io/pdf.js/)

###### OpenJPEG



For JPEG 2000 (.90, .91) support, you must load one of the following (see below for more information):

1. [OpenJPEG based codec](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/codecs/libopenjpeg.js)
2. [PDF.js based codec](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/codecs/jpx.min.js)

For JPEG-LS (.80, .81) support, you must load the following:

1. [CharLS Based codec](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/codecs/libCharLS.js)

For JPEG Lossless (.57) support, you must load the following:

1. [JPEG Lossless codec](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/codecs/jpeg.js)

For JPEG Baseline (.51) support, you must load the following:

1. [JPEG baseline codec](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/codecs/jpegLossless.js)

For Deflate (.99) support, you must load the following:

1. [Pako.js](https://github.com/chafey/cornerstoneWADOImageLoader/blob/master/codecs/pako.min.js)

All of these libraries should be loaded before the cornerstoneWADOImageLoader.js.  See the source code
for the [examples](https://rawgithub.com/chafey/cornerstoneWADOImageLoader/master/examples/index.html) for how
these codecs are loaded.
