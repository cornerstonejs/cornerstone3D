---
id: volumeProgressive
title: Volume Progressive Loading
---

## Volume Viewport Interleaved Decode

Since, for volume viewports, we mostly deal with rendering the reconstructed views (MPR) of the actual volume, the ideal scenario would be to have the initial images of the volume (even if lossy) as quickly as possible to avoid rendering a gray volume. We can achieve this by interleaving the requests.

Interleaving the images applies to any encoding for a volume.
That is, fetching every Nth image first allows a 1/Nth frequency image to be
displayed.
The interleave code then simply replicates the images to the missing
positions to produce a low resolution in the longitudinal direction.

This interleaving can then be combined with any discrete fetch for a lossy
version of an image - that is, a non-streamed decoding version of an image
that returns an entire request at once.

# Performance

The performance gains on using progressive loading on volume viewports vary quite a bit depending on size of data
and capabilities of the DICOMweb server components.

Note that none of the times include time to load the decoder, but is only seen on first render. These times are similar for
both types.

| Type             | Size | Network | First Render | Complete |
| ---------------- | ---- | ------- | ------------ | -------- |
| HTJ2K Stream     | 33 M | 4g      | 2503 ms      | 8817 ms  |
| HTJ2K Byte Range | 33 M | 4g      | 1002 ms      | 8813 ms  |

The HTJ2K byte range is very slightly slower than straight JLS, but can be
done against any DICOMweb server supporting HTJ2K and byte range requests.

- 4g speed - 30 mbit/s down, 5 mbit/s up, 10 ms latency
- Full size images are 512x512x174
- Reduce resolution images are 128x128 and lossy compressed

## HTJ2K Streaming

Note that this stage model will interleave requests across different viewports
for the various stages, by the selection of the queue and the priority of the
requests. The interleaving isn't perfect, as it interleaves stages rather than
individual requests, but the appearance works reasonably well without complex
logic being needed to work between volumes.

As learned in the [advanced retrieve configuration](./advance-retrieve-config), we saw that
we can make use of `decimate`, `offset` and different priorities to achieve the interleaving.

Decimation is a selection of every `N`th' image at the `F` offset, described as `N/F`,
eg `4/3` is positions `3,7,11,...`
This is done by retrieving, in order, the following stages:

- Initial images - images at position 0, 50%, 100%
- Decimated 4/3 image using multipleFast retrieve type
  - Displays a full volume at low resolution once this is complete
- Decimated 4/1 image using multipleFast retrieve type
  - Updates the initial volume with twice the resolution
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

1. Fetch images shown initially at full resolution (first and last)
2. Fetch every 4th image first `initialByteRange` bytes

- Fetch byte range [0,64000]
- Display partial resolution version immediately
- Use partial resolution version to display nearby slices

3. Other steps

- There are other partial and full resolution views here to fill in data

4. Fetch remaining data for #2 (do not refetch original data)

- Replaces the low resolution data from #2 with full data

## HTJ2K Byte Range

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
