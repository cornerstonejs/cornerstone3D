Transfer Syntaxes
=================

This image loader supports the following transfer syntaxes:

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
* 3.2.840.10008.1.2.4.96 HTJ2K (experimental TSUID)
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
