---
id: volumeProgressive
title: Volume Progressive Loading
---

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

//
//
//
//
//
//

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

//
//

1. Fetch images shown intiially at full resolution (first and last)
2. Fetch every 4th image first `initialByteRange` bytes

- Fetch byte range [0,64000]
- Display partial resolution version immediately
- Use partial resolution version to display nearby slices

3. Other steps

- There are other partial and full resolution views here to fill in data

4. Fetch remaining data for #2 (do not refetch original data)

- Replaces the low resolution data from #2 with full data

//
//
//
//

The volume progressive loading extends the basic stack loading with the ability
to interleave various images, interpolating them from a reduced resolution
version both intra and inter image. That is, individual images might be fetched
initially at 1/4 size (256x256 for a CT), and then only the initially displayed
image plus every 4th image, with other images being interpolated. In this case,
replicate interpolation is used to minimize interpolation overhead. Finally,
after the lossy initial versions are fetched, the remaining images are fetched.

The default retrieve ordering is below, where Decimate is described as the
interval between images included, and the offset in that set.

- Initial images, full resolution
- Decimate 4/3 partial resolution
  - Interpolate images -2...+1 (nearest neighbors)
- Decimate 4/1 partial resolution
- Decimate 4/2 full resolution
- Decimate 4/4 full resolution
- Decimate 4/3 full resolution
- Decimate 4/1 full resolution

The same ordering is done if partial resolution is not configured, except that
the last two stages are never run because the partial resolution has already
loaded those. This DOES allow the interpolation of results to appear very quickly.

# Types of Partial Resolution

There are a few types of partial resolution image:

- lossy images are original resolution/bit depth, but lossy encoded
- thumbnail images are reduced resolution images
- byte range images are a prefix of the full resolution, followed by
  retrieving the remaining data. This only works for images like HTJ2K encoded
  in resolution first ordering.

# Creating Partial Resolution Images

Static DICOMweb has been enhanced to add the ability to create partial resolution
images, as well as to serve up byte range requests. Some example commands
for a Ct dataset are below:

```bash
# Create HTJ2K as default and write HTJ2K lossy to .../lossy/
mkdicomweb create -t jhc --recompress true --alternate jhc --alternate-name lossy d:\src\viewer-testdata\dcm\Juno
# Create JLS and JLS thumbnail versions
mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jls /src/viewer-testdata/dcm/Juno
mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jlsThumbnail --alternate-thumbnail /src/viewer-testdata/dcm/Juno
# Create HTJ2K lossless and thumbnail versions (this is not required in general
# when the top item is already lossless)
mkdicomweb create -t jhc --recompress true --alternate jhcLossless --alternate-name htj2k  /src/viewer-testdata/dcm/Juno
mkdicomweb create -t jhc --recompress true --alternate jhc --alternate-name htj2kThumbnail --alternate-thumbnail /src/viewer-testdata/dcm/Juno
```

Any other tools creating multipart/related encapsulated data can be used, as
can using accept headers or parameters for a standard DICOMweb server.

Note the data path for these is, in general the normal DICOMweb path with
`/frames/` replaced by some other name.

# Configuration

See the volumeProgressive example for full details.

No special configuration is required for HTJ2K images streaming, but that isn't
particularly effective. The byte range request is preferably, but requires
additional server side support for byte ranges. Other types require custom
configuration.

## HTJ2K Byte Range Configuration

```javascript
cornerstoneDicomImageLoader.configure({
  retrieveOptions: {
    default: {
      '3.2.840.10008.1.2.4.96': {
        streamingDecode: true,
      },
      default: {},
    },
    multipleFinal: {
      default: {
        range: 1,
      },
    },
    multipleFast: {
      default: {
        // Note it is the decode that is streaming, but a range request to
        // get the data, not a streaming request.
        streamingDecode: true,
        range: 0,
        chunkSize: 64000,
        decodeLevel: 0,
      },
    },
  },
```

# Performance

The performance gains on this vary quite a bit depending on size of data
and capabilities of the DICOMweb server components.
In general, a 350% speed improvement to first volume render is seen because of
the interleaved images filling nearby images. That is independent of server
and is just because of the organization.
For straight JLS versus HTJ2K, that depends on the compression
size - JLS compresses a bit better than HTJ2K, resulting in faster downloads
on slow connections, but, HTJ2K is faster decoding, resulting in faster times
from the completion of retrieval until image rendering.

For reduced resolution images, both the JLS versions is slower
to final image data than the original version because of the additional
requests required to fetch all data. However, HTJ2K does not require
additional data as it re-uses the first range request data. That results
in identical timings between the final display of the HTJ2K data, but improved
timing for first render.

Note that none of the times include time to load the decoder, which can be
a second or more, but is only seen on first render. These times are similar for
both types.

| Type             | Size  | Network | First Render | Complete |
| ---------------- | ----- | ------- | ------------ | -------- |
| JLS              | 30 M  | 4g      | 2265 ms      | 8106 ms  |
| JLS Reduced      | 3.6 M | 4g      | 1028 ms      | 8455 ms  |
| HTJ2K            | 33 M  | 4g      | 2503 ms      | 8817 ms  |
| HTJ2K Byte Range | 11.1M | 4g      | 1002 ms      | 8813 ms  |
| JLS              | 30 M  | local   | 1322 ms      | 1487 ms  |
| JLS Reduced      | 3.6 M | local   | 1084 ms      | 1679 ms  |
| HTJ2K            | 33 M  | local   | 1253 ms      | 1736 ms  |
| HTJ2K Byte Range | 11.1M | local   | 1359 ms      | 1964 ms  |

The HTJ2K byte range is very slightly slower than straight JLS, but can be
done against any DICOMweb server supporting HTJ2K and byte range requests.

- 4g speed - 30 mbit/s down, 5 mbit/s up, 10 ms latency
- Complete time for the JLS and HTJ2K was essentially identical to
  baseline non-progressive
- Full size images are 512x512
- Reduce resolution images are 128x128 and lossy compressed
