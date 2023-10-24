---
id: volumeProgressive
---

# Volume Progressive Loading

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

See the volumeProgressive example for stack details.

No special configuration is required for HTJ2K images streaming, but that isn't
particularly effective. The byte range request is preferably, but requires
additional server side support for byte ranges. Other types require custom
configuration.

## HTJ2K Byte Range Configuration

```javascript
cornerstoneDicomImageLoader.configure({
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    // Configures byte range 0, with decode level 0 on initial fetch, using
    // the /htj2k initial path.
    'default-lossy': {
      isLossy: true,
      streaming: true,
      framesPath: '/htj2k/',
      range: 0,
      decodeLevel: 0,
    },
    // Configures fetching the second range, and do not continue stream decoding
    // Note that the framesPath must match, otherwise a NEW request will be
    // started, assuming that the data in different paths is different.
    'default-final': {
      framesPath: '/htj2k/',
      range: 1,
      streaming: false,
    },
  },
});
```

## JLS Thumbnail (Mixed) Configuration

```javascript
cornerstoneDicomImageLoader.configure({
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    // Retrieve first the lossy /jlsThumbnail/ path
    // Could be replaced with generic DICOMweb lossy JLS retrieve options
    // using the urlArguments to update the retrieve request.
    'default-lossy': {
      isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
    // Then retrieve the /jls/ encoded data.  Note this path
    // allows for static-DICOMweb to have multiple encoding stored, but
    // could be replaced on a generic DICOMweb server with accept parameters.
    'default-final': {
      framesPath: '/jls/',
    },
  },
});
```

# Performance

The performance gains on this vary quite a bit depending on size of data
and capabilities of the DICOMweb server components. In general, a 400% speed improvement
to first volume render is seen because of the interleaved images filling
nearby images. For straight JLS versus HTJ2K, that depends on the compression
size - JLS compresses a bit better than HTJ2K, resulting in faster downloads.
However, HTJ2K is faster decoding, resulting in lower times from download
until image rendering.

For reduced resolution images, both the HTJ2K and JLS versions are slower
to final image data than the original versions because there are additional
requests required to fetch all data. HTJ2K decoding still has some decompression
issues on very small thumbnails resulting in some issues decoding small
reduced resolution versions. That results in higher time to first volume times.

Note that none of the times include time to load the decoder, which can be
a second or more, but is only seen on first render. These times are similar for
both types.

| Type             | Network | First Render | Final Render |
| ---------------- | ------- | ------------ | ------------ |
| JLS              | 4g      | 3816 ms      | 12940 ms     |
| JLS Reduced      | 4g      | 1040 ms      | 13245 ms     |
| HTJ2K            | 4g      | 3898 ms      | 13719 ms     |
| HTJ2K Byte Range | 4g      | 1522 ms      | 13182 ms     |

The HTJ2K byte range is very slightly slower than straight JLS, but can be
done against any DICOMweb server supporting HTJ2K and byte range requests.
