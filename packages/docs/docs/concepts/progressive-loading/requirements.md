---
id: requirements
---

# Requirements and Configuration for Progressive Loading

The progressive loading will improve stack image display just given support
of HTJ2K progressive resolution encoded data, while volumetric data is improved
in time to first volume for all back ends not using customized streaming loaders.
However, the support of different types of reduced resolution and streaming
responses is quite varied between DICOMweb implementations. Thus, this
guide provides some additional details on how to configure various options,
as well as how to modify the default load order for different requirements.

## Separate Path or Argument Partial Resolution

One way of configuration for partial image resolution loading is to add
a separate path. This is done with the framesPath argument, which replaces
the /frames/ part of the path with an alternate path.

Alternatively, or in addition, the urlArguments can be added.

```
retrieveConfiguration: {
    'default-lossy': {
      isLossy: true,
      urlArguments: "accept=image/jls&resolution=256,256",
      framesPath: '/jlsThumbnail/',
    },
```

The image data being served up should then either be multipart or single part
encoded data on the given path. Note that it must include the transfer syntax
information on the response if that isn't the default for the image.

## Byte Range Requests

If the server supports HTJ2K in resolution first order using byte ranges, then
it can be configured using the `range` and `initialBytes` parameters to control
the range request and the initial bytes. It may also be required to use the
decodeLevel configuration. For example:
