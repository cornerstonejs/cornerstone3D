---
id: advance-retrieve-config
title: Advance Options
---

There are more advanced options for the retrieve configuration that can be used
to handle more use cases. Let's dive in


## Options


### urlArguments
- urlArguments - to add extra arguments to the URL


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
        status: ImageQualityStatus.SUBRESOLUTION,
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
