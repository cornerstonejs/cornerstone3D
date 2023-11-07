---
id: stackProgressive
title: Stack Progressive Loading
---

Here, we will explore the progressive loading of stackViewports as an example use case for progressive loading and benchmark it compared to regular loading. We will discuss this in more detail, including scenarios
that involve multiple stages of progressive loading and different retrieval types.

:::tip
For stacked viewports, larger images can be decoded using a streaming method, where the HTJ2K RPCL image is received as a stream, and parts of it are decoded as they become available. This can significantly improve the viewing of stacked images, without requiring any special server requirements other than support for HTJ2K RPCL encoded data.
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

```js
const retrieveConfiguration = {
  stages: [
    {
      id: 'initialImages',
      retrieveType: 'singleFast',
    },
  ],
  retrieveOptions: {
    singleFast: {
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

```js
const retrieveConfiguration = {
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
    singleFinal: {
      range: 1,
    },
    singleFast: {
      range: 0,
      decodeLevel: 3,
    },
  },
};
```
