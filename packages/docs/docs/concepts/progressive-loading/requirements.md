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

## HTJ2K Progressive Resolution

The HTJ2K standard defines different organizations of imaging data. This
determines how the image encoding is organized in the response. The progressive
resolution encoding has the low resolution data encoded at the start, and the
higher frequency data encoded towards the back. That permits loading some
number of initial bytes and decoding it to produce a lossy version of the final
image. This encoding is required by the DICOM standard for one of the HTJ2K
formats. Other encodings may result in decoder exceptions or partial image
decoding when used with either byte range or streaming responses. However,
these are eventually replaced with full resolution data, so if an image comes
in that format it will still work, just not progressively.

## Separate Path or Argument Partial Resolution

One way of configuration for partial image resolution loading is to add
a separate path. This is done with the framesPath argument, which replaces
the /frames/ part of the path with an alternate path. Alternatively, or in
addition, the urlArguments can be added.

In the context of DICOMweb, the urlArguments can be used to add a custom
`accept` argument which will specify the desired transfer syntax, allowing
standards based access to lossy or format specific requests.
See [Part 18](https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_8.3.3.1)
for details on the accept parameter. Note that the accept header can be
used only with the accept parameter, as the URL being used keys to the
streaming data storage, which will not necessarily be the same type if the
header is used.

In addition to the accept parameter, the example below shows a resolution
parameter, a non DICOMweb standard parameter which could hypothetically
fetch a reduced resolution image.

```
retrieveConfiguration: {
  'default-lossy': {
    isLossy: true,
    urlArguments: "accept=image/jls;transferSyntax=1.2.4.10008.1.2.81&resolution=256,256",
    framesPath: '/jlsThumbnail/',
```

The image data being served up should then either be single part
encoded data on the given path for the given accept header, but in general either
multipart or single part is handled.
Note that it must include the transfer syntax information as a response
or multipart header.

## Byte Range Requests

If the server supports HTJ2K Progressive Resolution data fetched using byte ranges,
then CS3D can be configured using the `range` and `initialBytes` parameters to
progressively fetch image data.

The HTJ2K decoder currently has some bugs when decoding full resolution data
from a byte stream. To work around those, the decodeLevel may need to be specified
as an integer value larger than 0.

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

- priority can be set to control when the requests are performed. Higher priority
  values are fetched before lower priority ones.
- requestType determines which fetch queue is used

## Retrieve Stage

A retrieve stage is a configuration for matching up a list of image ids
with one or more retrieve configurations. The stage contains selection
rules for the image ID's to match up with, as well as information on how
to choose the appropriate retrieve options for the given stage.

The matching from stage to options is done via the `transferSyntaxUID` and
`retrieveType`, plus default values. The retrieve type is just a string key
that allows selecting different options based on the stage. In the
`dicom-image-loader` options, there is a

- retrieveType - this is a string value that is used to pair the retrieve
  request with the configuration value. The default values used are:
  - lossy - for reduced resolution or lossy retrieve configurations
  - final - for the volume retrieve final stage replacing lossy data
  - (empty) - for the stack retrieve full retrieve request
-
