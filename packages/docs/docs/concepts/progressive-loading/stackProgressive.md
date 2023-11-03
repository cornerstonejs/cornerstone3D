---
id: stackProgressive
title: Stack Progressive Loading
---


## Stack Viewport Streaming Decode

For stacked viewports, larger images can be decoded using a streaming method, where the HTJ2K RPCL image is received as a stream, and parts of it are decoded as they become available. This can significantly improve the viewing of stacked images, without requiring any special server requirements other than support for HTJ2K RPCL encoded data.


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
      // Just retrieve using type singleFast, all images
      retrieveType: 'singleFast',
    },
    {
      id: 'finalSequential',
      // Finish off with the all images final version.
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

# Configuration

See the stackProgressive example for stack details.

Stack viewports need to be configured for progressive streaming by setting
the `option.progressiveRendering` either to true, or to a retrieve configuration
which renders progressively. Additionally, to render non-standard DICOMweb
configurations progressively, the global retrieve options need to be set for the
`retrieveType` and `transferSyntaxUID` values.

The retrieve options in the global configuration is an object with keys
being (arbitrary) `retrieveType` string values, and the values being
a Record from string transfer syntax UID's to `RetrieveOptions` instances.
This design allows settings values for both a retrieve type or phase, as
well as specific transfer syntaxes, allowing different retrieve options to be
set for differing encodings.

The two retrieve types used for the progressive rendering for stack (which
is defined in `sequentialRetrieveConfiguration`) are `singleFast` and `singleFinal`.
This allows differing requests to be made for a fast initial request and a final,
lossless request. The example `stackProgressive` shows several possible configurations
for this which demonstrate how to load different URL paths or different parts
of the image across repeated requests using byte range retrieves.

```javascript
cornerstoneDicomImageLoader.configure({
  retrieveOptions: {
      singleFast: {
        '3.2.840.10008.1.2.4.96': {
          // Both retrieve and decode streaming
          streamingDecode: true,
          streaming: true,
        },
        // Retrieve streaming, but don't try decoding that
        default: {
          streaming: true,
        }


renderingEngine.enableElement({
  ... normal stack configuration,
  // Just use the default progressive retrieve configuration
  progressiveRetrieveConfiguration: true,
};
```
