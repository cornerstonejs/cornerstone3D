---
id: advance-retrieve-config
title: Advance Options
---

There are more advanced options both for `retrieve stages` and also for
`retrieve options` that can be used to customize the behavior of the
progressive loading.

:::tip
You can skip this section if you are not interested in the advanced options (yet) and still move to the [`usage` section](./usage). Basically, some of these options (position, decimate, offset, priority, and nearbyFrames) are used in the "volume progressive" example,
which you can revisit later.
:::

## Advanced Retrieve Stages Options

### positions?: number[];

Used for volume-progressive loading, where we need to specify the exact image index we want to retrieve. This is generally true in general hanging protocols, as the initial image is usually in the middle, top, or bottom of the stack.

You can use absolution positions, or relative positions between [0, 1].
Positions less than 0 are relative to the end, so you can use -1 to indicate the last image in the stack.

Example

```js
stages: [
  {
    id: 'initialImages',
    positions: [0.5, 0, -1],
    retrieveType: 'initial', // arbitrary naming as discussed
  },
];
```

in the above example, we are requesting the middle image, the first image, and the last image in the stack.

:::tip
To retrieve another initial image automatically based on initial display positions,
copy the stages, and add a new stage with your desired position, putting that stage
first.
This can be used to ensure the initial image is fetched.
:::

### decimate?: number & offset?: number;

By utilizing the decimate and offset features, we can enhance the flexibility of specifying the desired images for retrieval. For example, if a volume comprises 100 images, applying a decimate value of 2 and an offset of 0 will retrieve images 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, and so on. Similarly, employing a decimate value of 2 and an offset of 1 will retrieve images 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, and so forth. This demonstrates how we can effectively interleave the images by leveraging different offsets and decimate values.

It is safe to repeat image fetches, as the fetches will be discarded when the
image quality status is already better than that of the specified fetch.

```js
stages: [
  {
    id: 'initialImages',
    positions: [0.5, 0, -1],
    retrieveType: 'initial', // arbitrary naming as discussed
  },
  {
    id: 'initialPass',
    decimate: 2,
    offset: 0,
    retrieveType: 'fast', // arbitrary naming as discussed
  },
  {
    id: 'secondPass',
    decimate: 2,
    offset: 1,
    retrieveType: 'fast', // arbitrary naming as discussed
  },
];
```

Above we have three stages where we first retrieve the initial images, then we retrieve the rest of the images in two passes. The first pass will retrieve images 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, and so on. The second pass will retrieve images 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, and so forth.

### priority?: number & requestType

Using combination of requestType (thumbnail, prefetch, interaction) and priority (the lower the higher) you can effectively prioritize the requests.
For example, you can set the priority of the initial images to be higher (lower number) than the rest of the images.
This will ensure that the initial images are retrieved first in the queue.

```js
stages: [
  {
    id: 'initialImages',
    positions: [0.5, 0, -1],
    retrieveType: 'initial',
    requestType: RequestType.INTERACTION,
    priority: -1,
  },
  {
    id: 'initialPass',
    decimate: 2,
    offset: 0,
    retrieveType: 'fast',
    priority: 2,
    requestType: RequestType.PREFETCH,
  },
  {
    id: 'secondPass',
    decimate: 2,
    offset: 1,
    retrieveType: 'fast',
    priority: 3,
    requestType: RequestType.PREFETCH,
  },
];
```

:::tip
Set the maximum number of requests to run to a lower value to ensure that
your required requests are performed first. For example:

```javascript
imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.INTERACTION, 6);
```

:::

### nearbyFrames?: NearbyFrames[];

Using nearby frames, you have the option to fill in the nearby frames to instantaneously fill and render the empty spaces in the volume.

Example

```js
stages: [
  {
    id: 'initialPass',
    decimate: 2,
    offset: 0,
    retrieveType: 'fast',
    priority: 2,
    requestType: RequestType.PREFETCH,
    nearbyFrames: [
      {
        offset: +1,
        imageQualityStatus: ImageQualityStatus.ADJACENT_REPLICATE,
      },
    ],
  },
  {
    id: 'secondPass',
    decimate: 2,
    offset: 1,
    retrieveType: 'fast',
    priority: 3,
    requestType: RequestType.PREFETCH,
  },
];
```

In the above, we are specifying that we would like to replicate the adjacent frames to the current frame (+1). This way, until the next stage (secondPass) arrives, we will have the adjacent frames ready to be rendered and displayed. The secondPass will overwrite them with actual data.

## Advanced Retrieve Options

### urlArguments

- urlArguments - is a set of arguments to add to the URL
  - This distinguishes this request from other requests which cannot be combined with this one
  - The DICOMweb standard allows for the `accept` parameter to specify a content type
  - The HTJ2K content type is `image/jhc`

The configuration for this is (assuming standards based DICOMweb support):

```js
retrieveOptions: {
  default: {
    urlArguments: 'accept=image/jhc',
    rangeIndex: -1,
  },
  multipleFast: {
    urlArguments: 'accept=image/jhc',
    rangeIndex: 0,
    decodeLevel: 0,
  },
},
```

:::warning
You MUST repeat the same framesPath and urlArguments for each stage in a range
request, otherwise the assumption is that the data retrieved in the first range
is NOT the same data retrieved in the second range, and the second range
request will just retrieve the entire request.
:::

### framePath

- framesPath - to update the URL path portion

This is useful for fetching another available path such as the thumbnail, JPIP or
rendered endpoints for lossy encoded retrieves as they are located
on different paths than the lossless encoded images.

This is also useful for integration with fixed path alternate encoding servers
which choose the response to return based on the URL path, storing various lossy
renderings on alternate paths.

### imageQualityStatus

- imageQualityStatus - used to set the retrieve status to lossy or sub-resolution

This is typically used when the URL or retrieve parameters specify a lossy final
rendering of the given path such as for a lossy encoded HTJ2K image.

## Separate URL For Sub-Resolution Images

An alternative to a byte range request is to make an different request for
a complete, but lossy/low resolution image. This can be standards based
assuming the DICOMweb supports `JPIP`, or more likely is non-standards based using
a separate path for the low resolution fetch.

For the `JPIP` approach shown here, the `JPIP` server must expose an endpoint
identical in path to the normal pixel data endpoint, except ending in `/jpip?target=<FRAMENO>`,
and supporting the `fsiz` parameter. See
[Part 5](https://dicom.nema.org/medical/dicom/current/output/html/part05.html#sect_8.4.1)
and
[Part 18](https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_8.3.3.1)
of the DICOM standard.

For the non-standard path approach, the assumption is that there are other
endpoints related to the normal `/frames` endpoint, except that the `/frames/`
part of the URL is replaced by another value. For example, this could be used
to fetch a `/jlsThumbnail/` data as used in the `stackProgressive` example.

An example configuration for `JPIP`:

```js
  retrieveOptions: {
    default: {
      // Need to note this is a lossy encoding, as it isn't possible to
      // detect based on the general configuration here.
      imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
      // Hypothetical JPIP server using a path that is the normal DICOMweb
      // path but with /jpip?target= replacing the /frames path
      // This uses the standards based target JPIP parameter, and assigns
      // the frame number as the value here.
      framesPath: '/jpip?target=',
      // Standards based fsiz parameter retrieves a sub-resolution image
      urlArguments: 'fsiz=128,128',
    },
  },
```
