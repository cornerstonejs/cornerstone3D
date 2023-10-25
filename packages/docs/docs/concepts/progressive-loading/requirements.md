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

```javascript
  retrieveConfiguration: {
    'default-lossy': {
      // Note initial request is lossy - could have alternatively used status here
      isLossy: true,
      // Streaming is true because this data isn't final.  Allows decode of streamed data
      streaming: true,
      // Path to use
      framesPath: '/htj2k/',
      // This SHOULD work, but fails due to HTJ2K errors
      // initialBytes: 16384,
      range: 0,
      // Sets the decode level to commplete - this is ok for CT images at 64k
      decodeLevel: 0,
    },
    'default-final': {
      framesPath: '/htj2k/',
      range: 1,
      streaming: false,
    },
```

## Decode Options

There are a number of decode options to control how the decoder generates
the output:

- decodeLevel is used for progressive decoding. 0 is full size, while larger
  values are smaller images/less data required. There is currently a bug in
  the HTJ2K decoder with decoding at level 0 when not all data is available.
- isLossy indicates that the resulting output is lossy/not final

## Queue Options

To control how the data is queued, it is possible to set some of the queing
options:

- priority can be set to control when the
