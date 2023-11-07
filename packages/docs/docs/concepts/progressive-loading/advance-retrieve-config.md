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

### decimate?: number;

### offset?: number;

### priority?: number;

### nearbyFrames?: NearbyFrames[];

## Advanced Retrieve Options

### urlArguments

- urlArguments - is a set of arguments to add to the URL
  - This distinguishes this request from other requests which cannot be combined with this one
  - The DICOMweb standard allows for the `accept` parameter to specify a content type
  - The HTJ2K content type is image/jhc

The configuration for this is (assuming standards based DICOMweb support):

```javascript
  retrieveOptions: {
    multipleFinal: {
      default: {
        range: 1,
        urlArguments: 'accept=image/jhc',
      },
    },
    multipleFast: {
      default: {
        range: 0,
        urlArguments: 'accept=image/jhc',
        streaming: true,
        decodeLevel: 0,
      },
    },
  },
```

### framePath

- framesPath - to update the URL path portion

### imageQualityStatus

### partialImageQualityStatus

### Separate URL For Sub-Resolution Images

An alternative to a byte range request is to make an different request for
a complete, but lossy/low resolution image. This can be standards based
assuming the DICOMweb supports JPIP, or more likely is non-standards based using
a separate path for the low resolution fetch.

For the JPIP approach shown here, the JPIP server must expose an endpoint
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

An example configuration for JPIP:

```
  retrieveOptions: {
    multipleFast: {
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
  },
```
