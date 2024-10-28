# Codecs

The cornnerstoneWADOImageLoader uses the following third party libraries to decode the
various ways DICOM images are compressed:

1. [OpenJPEG.js](https://github.com/cornerstonejs/openjpeg) for JPEG2000 images. Based on the [OpenJPEG](http://www.openjpeg.org/) library

2. [OHIF/image-JPEG2000](https://github.com/OHIF/image-JPEG2000) For JPEG2000 Images. Based on the [PDF.js](https://mozilla.github.io/pdf.js/) library

3. [CharLS.js]() for JPEG-LS images. Based on the [CharLS]() library

4. [JPEGLossless Decoder JS](https://github.com/rii-mango/JPEGLosslessDecoderJS) for JPEG Lossless images.

5. [JPEG Lossy]() for JPEG Lossy images. Based on notmasteryet with changes contributed by [gSquared](https://github.com/g-squared)

6. [pako.js]() for deflate based images.

## JPEG2000

The OpenJPEG based codec is the default codec for JPEG2000 images. This codec is the default because the OpenJPEG
library is in wide use, actively supported and believed to be able to decode most of if not all JPEG2000 images
found in medical imaging. The performance of the PDF.js library may be better on some browsers or with some types of
images, here are some benchmarks:

Images from ftp://medical.nema.org/MEDICAL/Dicom/DataSets/WG04/compsamples_j2k.tar

iMac Retina 5k Late 2014 4GHz Intel Core i7 Chrome 50.0.2661.102 (64 bit)

| Image    | OpenJPEG | PDF.js  |
| -------- | -------- | ------- |
| NM1_J2KR | 233 ms   | 103 ms  |
| CT1_J2KR | 424 ms   | 147 ms  |
| RG1_J2KR | 6058 ms  | 2311 ms |
| MG1_J2KR | 19312 ms | 7380 ms |

iMac Retina 5k Late 2014 4GHz Intel Core i7 FireFox 46.0.1

| Image    | OpenJPEG | PDF.js   |
| -------- | -------- | -------- |
| NM1_J2KR | 240 ms   | 102 ms   |
| CT1_J2KR | 185 ms   | 91 ms    |
| RG1_J2KR | 3445 ms  | 1594 ms  |
| MG1_J2KR | 10295 ms | 14207 ms |

iMac Retina 5k Late 2014 4GHz Intel Core i7 Safari 9.1.1

| Image    | OpenJPEG | PDF.js   |
| -------- | -------- | -------- |
| NM1_J2KR | 64 ms    | 56 ms    |
| CT1_J2KR | 115 ms   | 94 ms    |
| RG1_J2KR | 2367 ms  | 1567 ms  |
| MG1_J2KR | 6496 ms  | 18547 ms |
