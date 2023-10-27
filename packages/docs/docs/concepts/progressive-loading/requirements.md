---
id: requirements
---

# Requirements and Configuration for Progressive Loading

Fast initial display of images requires some method of being able to retrieve
just part of an image or volume that can be rendered as a complete but lossy image.
For example, a thumbnail image could be rendered full size, or images in a volume
could be interpolated to produce an alternate image. These images are retrieved
first for fast initial display, followed by retrieving a full resolution image,
thus producing a progressively better display as more data is loaded.

The DICOM standards committee is currently adding support in DICOM for
a new encoding method, High Throughput JPEG 2000 `htj2k`. This encoding
method can be configured to allow for progressive decoding of images.
That is, if the first N bytes of the image encoding are available they can be
decoded to a lower resolution or lossy image. The configuration that allows this
is the HTJ2K Progressive Resolution (HTJ2K RPCL).

The existing JPEG 2000 encoding and the new HTJ2K in the standard also have a
format specifying a partial resolution endpoint.
The exact endpoint needs to be specified in the
JPIP referenced data URL, but is configured statically below as an example only.
The options data could be used to provide the exact URL required in a future revision.

Finally, some servers can be configured to serve up reduced (partial) resolution
versions of images on other URL endpoints.

The progressive loading will improve stack image display just given support
of HTJ2K progressive resolution encoded data, while volumetric data is improved
in time to first volume for all back ends when not otherwise configured for
custom load order. However, the support of different types of reduced
resolution and streaming responses is quite varied between DICOMweb
implementations. Thus, this guide provides some additional details on how to
configure various standard and non-standard based options, as well as details
on how to set that up in the
[Static DICOMweb](https://github.com/RadicalImaging/Static-DICOMWeb), mostly
as an example of how it could be done.

## Stack Viewport Streaming Decode

For stack viewports, larger images can be decoding using a streaming method,
where the HTJ2K RPCL image is received as a stream, and parts of it decoded
as it is available. This can improve the stack viewing of images quite considerably,
without any special server requirements other than the support of HTJ2K RPCL
encoded data.

## Volume Viewport Interleaved Decode

For volumes, the streaming decode of HTJ2K is typically slower than non-streaming
decoding because the image retrieval of the low resolution data is immediately
succeeded by the high resolution data, so it consumes the total bandwidth for
retrieval regardless of handling, and extra decodes require additional time.

There is an alternative low resolution data first retrieval that can be used.
Interleaving the images applies to any encoding for a volume.
That is, fetching every Nth image first allows a 1/Nth frequency image to be
displayed.
The interleave code then simply replicates the images to the missing
positions to produce a low resolution in the longitudinal direction.

This interleaving can then be combined with any discrete fetch for a lossy
version of an image - that is, a non-streamed decoding version of an image
that returns an entire request at once. Typically the options are to use
byte range requests or complete requests for reduced resolution versions.
These options are described below, and provide enhanced performance beyond
the basic interleaved performance gains.

### Byte Range Requests

HTTP byte range requests are an optional part of the DICOMweb standard, but
when combined with HTJ2K RPCL encoding, allow for fetching a prefix of an
image encoding followed by fetching the remaining data, with the prefix of the
image being loaded and decoded quite quickly to improve the time to low resolution
volume render. The sequence is basically:

1. Fetch images shown intiially at full resolution (first and last)
2. Fetch every 4th image first `initialByteRange` bytes

- Fetch byte range [0,64000]
- Display partial resolution version immediately
- Use partial resolution version to display nearby slices

3. Other steps

- There are other partial and full resolution views here to fill in data

4. Fetch remaining data for #2 (do not refetch original data)

- Replaces the low resolution data from #2 with full data

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

The arguments for the byte range request are:

- range - this is a number between 0 and the totalRangesToFetch
  - Fetches data starting at the last fetch end point, or 0
  - Fetches data ending with the total length or (range+1)\*initialBytesToFetch
  - Ranges do NOT need to be all fetched, but do need to be increasing
- totalRangesToFetch - how many pieces of size initialBytesToFetch are retrieved
- initialBytesToFetch - the number of bytes in each fetch chunk
  - last chunk is always the remaining data, regardless of size
- streaming - a flag to indicate that a partial range can be decoded
- decodeLevel is the resolution level to decode to. This can sometimes be
  determined from the stream, but for CORS requests, the header is not available,
  and so a value specified based on the type of images retrieved.
- urlArguments - is a set of arguments to add to the URL
  - This distinguishes this request from other requests which cannot be combined with this one
  - The DICOMweb standard allows for the `accept` parameter to specify a content type
  - The HTJ2K content type is image/jhc

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
        status: ImageStatus.SUBRESOLUTION,
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

Arguments are:

- isLossy - to indicate that this is a lossy retrieve
- framesPath - to update the URL path portion
- urlArguments - to add extra arguments to the URL

# General Description of RetrieveOptions

## Decode Options

There are a number of decode options to control how the decoder generates
the output:

- decodeLevel - used for progressive decoding. 0 is full size, while larger
  values are smaller images/less data required. There is currently a bug in
  the HTJ2K decoder with decoding at level 0 when not all data is available.
- isLossy indicates that the resulting output is lossy/not final

## Queue Options

To control how the data is queued, it is possible to set some of the queing
options:

- priority can be set to control when the requests are performed. Higher priority
  values are fetched before lower priority ones.
- requestType determines which fetch queue is used

# Retrieve Stage

Both stack and volume viewports can be configured with a list of methods used
to retrieve images, specified during the setup of the stack viewport or streaming
image volume. The default stack load is `sequentialRetrieveConfiguration.ts`,
while the volumes use `interleavedRetrieveConfiguration.ts`.

The configuration contains a list of stages, which are applied in turn to the
set of `imageIds` to display, and can select or interleave image ids, as well
as specifying the `retrieveType` to allow choosing the retrieve options for that
image.

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

## Interleaved Retrieve Configuration

For volume viewports, the priorities are to show images currently on screen
as fast as possible, and to load a low resolution volume as soon as possible.

Note that this stage model will interleave requests across different viewports
for the various stages, by the selection of the queue and the priority of the
requests. The interleaving isn't perfect, as it interleaves stages rather than
individual requests, but the appearance works reasonably well without complex
logic being needed to work between volumes.

Decimation is a selection of every Nth' image at the F offset, described as N/F,
eg `4/3` is positions `3,7,11,...`
This is done by retrieving, in order, the following stages:

- Initial images - images at position 0, 50%, 100%
- Decimated 4/3 image using multipleFast retrieve type
  - Displays a full volume at low resolution once this is complete
- Decimated 4/1 image using multipleFast retrieve type
  - Updates the intiial volume with twice the resolution
- Decimated 4/2 and 4/0 images using multipleFinal
  - Replaces the replicated images with full resolution images
- Decimated 4/3 and 4/1 using multipleFinal
  - Replices the low resolution images with full resolution

The configuration looks like:

```javascript
  stages: [
    {
      id: 'initialImages',
      // positions selects specific positions - middle image, first and last
      positions: [0.5, 0, -1],
      // Use teh default render type for these, which should retrieve full resolution
      retrieveType: 'default',
      // Use the Interaction queue
      requestType: RequestType.Interaction,
      // Priority 10, do first
      priority: 10,
      // Fill nearby frames from this data
      nearbyFrames: {....},
    },
    {
      id: 'quarterThumb',
      decimate: 4,
      offset: 3,
      retrieveType: 'multipleFast',
      priority: 9,
      nearbyFrames,
    },
    ... other versions
    // Replace the first data with final data
    {
      id: 'finalFull',
      decimate: 4,
      offset: 3,
      priority: 4,
      retrieveType: 'multipleFinal',
    },
  ],
```
