---
id: non-htj2k-progressive
title: Progressive Loading for non-HTJ2K
---

# Progressive Loading for non-HTJ2K Progressive Encoded Data

## JLS Thumbnails

JLS thumbnails can be created using the static-dicomweb toolkit, for example,
by doing:

```
# Create a JLS directory containing JLS encoded data in the /jls sub-path
mkdicomweb create -t jhc --recompress true --alternate jlsLossless --alternate-name jls "/dicom/DE Images for Rad"
# Create a jlsThumbnail sub-directory containing reduce resolution data
mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jlsThumbnail --alternate-thumbnail "/dicom/DE Images for Rad"
```

This can then be used by configuring:

```javascript
cornerstoneDicomImageLoader.configure({
  retrieveOptions: {
    default: {
      default: {
        framesPath: '/jls/',
      },
    },
    singleFast: {
      default: {
        imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
        framesPath: '/jlsThumbnail/',
```

## Sequential Retrieve Configuration

The sequential retrieve configuration has two stages specified, each of
which applies to the entire stack of image ids. The first stage will
load every image using the `singleFast` retrieve type, followed by the
second stage retrieving using `singleFinal`. If the first stage
results in lossless images, the second stage never gets run, and thus the
behaviour is identical to previous behaviour for stack images.

This configuration can also be used for volumes, producing the old/previous
behaviour for streaming volume loading.

The configuration is:

```javascript
stages: [
    {
      id: 'lossySequential',
      retrieveType: 'singleFast',
    },
    {
      id: 'finalSequential',
      retrieveType: 'singleFinal',
    },
  ],
```

Images for the stack viewport can be loaded with a lower resolution/lossy
version first, followed by increasingly higher resolutions, and finally
the final version being a lossless representation.

For HTJ2K, this is done automatically when the image is encoded in progressive
resolution order by using a streaming reader that returns lower resolution versions
of the image as they are available.

For other image types, a separate lower resolution/lossy version is required.
The Static DICOMweb toolkit includes some options to create such images.

# Performance

In general, about 1/16-1/10th of the image is retrieved for the lossy/first
version of the image. This results in a significant speed improvement to first
images. It is affected fairly strongly by overall image size, network performance
and compression ratios.

The full size images are 3036 x 3036, while the JLS reduced images are 759 x 759

| Type             | Network | Size   | First Render | Final Render |
| ---------------- | ------- | ------ | ------------ | ------------ |
| JLS              | 4g      | 10.6 M |              | 4586 ms      |
| JLS Reduced      | 4g      | 766 K  | 359 ms       | 4903 ms      |
| HTJ2K            | 4g      | 11.1 M | 66 ms        | 5053 ms      |
| HTJ2K Byte Range | 4g      | 128 K  | 45 ms        | 4610 ms      |

- JLS Reduced uses 1/16 size JLS 'thumbnails'
- HTJ2K uses streaming data
- HTJ2K Byte Range uses 64k initial retrieve, followed by remaining data

# Interleave performance

that none of the times include time to load the decoder, which can be
a second or more, but is only seen on first render. These times are similar for
both types.

| Type             | Size  | Network | First Render | Complete |
| ---------------- | ----- | ------- | ------------ | -------- |
| JLS              | 30 M  | 4g      | 2265 ms      | 8106 ms  |
| JLS Reduced      | 3.6 M | 4g      | 1028 ms      | 8455 ms  |
| HTJ2K            | 33 M  | 4g      | 2503 ms      | 8817 ms  |
| HTJ2K Byte Range | 11.1M | 4g      | 1002 ms      | 8813 ms  |
| JLS              | 30 M  | local   | 1322 ms      | 1487 ms  |
| JLS Reduced      | 3.6 M | local   | 1084 ms      | 1679 ms  |
| HTJ2K            | 33 M  | local   | 1253 ms      | 1736 ms  |
| HTJ2K Byte Range | 11.1M | local   | 1359 ms      | 1964 ms  |

The HTJ2K byte range is very slightly slower than straight JLS, but can be
done against any DICOMweb server supporting HTJ2K and byte range requests.

- 4g speed - 30 mbit/s down, 5 mbit/s up, 10 ms latency
- Complete time for the JLS and HTJ2K was essentially identical to
  baseline non-progressive
- Full size images are 512x512
- Reduce resolution images are 128x128 and lossy compressed

# Configuration

See the stackProgressive example for stack details.

Stack viewports need to be configured for progressive streaming by registering
metadata for the imageId or the default `stack` metadata as an `IRetrieveConfiguration`
value. This value contains the stages to run, as well as the retrieve configuration
for each stage. In specific, the `streaming` value needs to be set on the
retrieve configuration for the value `single` retrieveType.

The retrieve configuration has two pieces, the stages and the retrieve options
(additionally, it can completely replace the retriever with a custom one).
The stages are used to select the image ID's to retrieve, and provide the
retrieve type to use. Then, the retrieve options map the retrieve type to
the actual options to use. That allows multiple stages to use the same
retrieve type for different purposes.

The two retrieve types used for the progressive rendering for stack (which
is defined in `sequentialRetrieveConfiguration`) are `singleFast` and `singleFinal`.
This allows differing requests to be made for a fast initial request and a final,
lossless request. The example `stackProgressive` shows several possible configurations
for this which demonstrate how to load different URL paths or different parts
of the image across repeated requests using byte range retrieves.
