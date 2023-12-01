---
id: stackProgressive
title: Stack Progressive Loading
---

Here, we will explore the progressive loading of stackViewports as an example use case for progressive loading and benchmark it compared to regular loading. We will discuss this in more detail, including scenarios that involve multiple stages of progressive loading and different retrieval types.

:::tip
For stacked viewports, larger images can be decoded using a streaming method, where the HTJ2K RPCL image is received as a stream, and parts of it are decoded as they become available. This can significantly improve the viewing of stacked images, without requiring any special server requirements other than support for the HTJ2K RPCL transfer syntax.
:::

# Benchmark

In general, about 1/16th to 1/10th of the image is retrieved for the lossy/first version of the image. This results in a significant speed improvement for the first images. It is fairly strongly affected by the overall image size, network performance, and compression ratios.

**The full size test image is 3036 x 3036 and 11.1 MB in size.
**

| Type                        | Network | Size   | First Render | Final Render (baseline) |
| --------------------------- | ------- | ------ | ------------ | ----------------------- |
| HTJ2K streaming (1 stage)   | 4g      | 11.1 M | 66 ms        | 5053 ms                 |
| HTJ2K Byte Range (2 stages) | 4g      | 128 K  | 45 ms        | 4610 ms                 |

The configuration for the above test is as follows

## HTJ2K Streaming (1 stage)

This configuration will retrieve an image using a single stage streaming response.
It is safe to use for both streaming and non-streaming transfer syntaxes, but
will only activate for the decoding portion when used with HTJ2K transfer syntaxes.
For HTJ2K decoding, if the image is NOT in RPCL format, then other decoding
progressions may occur, such as decoding by by region (eg top-left, top-right, bottom-left, bottom-right),
or decoding may fail until the full data is available.

:::tip
You can use `urlParameters: accept=image/jhc` to request HTJ2K in a standards
compliant fashion.
:::

```js
const retrieveConfiguration = {
  // stages defaults to singleRetrieveConfiguration
  retrieveOptions: {
    single: {
      streaming: true,
    },
  },
};
```

## HTJ2K Byte Range (2 stages)

This sequential retrieve configuration has two stages specified, each of
which applies to the entire stack of image ids. The first stage will
load every image using the `singleFast` retrieve type, followed by the
second stage retrieving using `singleFinal`.

Note that this retrieve configuration requires support for byte-range requests
on the server side. It MAY be safe for servers not supporting byte range requests,
but the requests may also fail when attempted. Read your DICOM Conformance Statement.

:::tip
You can add a third, error recovery stage removing any byte range requests.
This stage will only end up being run if the previous stages fail. This allows
dealing with unknown server support.
:::

```js
const retrieveConfiguration = {
  // This stages list is available as sequentialRetrieveStages
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
  retrieveOptions: {
    singleFast: {
      rangeIndex: 0,
      decodeLevel: 3,
    },
    singleFinal: {
      rangeIndex: -1,
    },
  },
};
```
