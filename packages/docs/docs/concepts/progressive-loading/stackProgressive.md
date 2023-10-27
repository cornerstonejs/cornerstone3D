---
id: stackProgressive
---

# Stack Progressive Loading

Images for the stack viewport can be loaded with a lower resolution/lossy
version first, followed by increasingly higher resolutions, and finally
the final version being a lossless representation.

For HTJ2K, this is done automatically when the image is encoded in progressive
resolution order by using a streaming reader that returns lower resolution versions
of the image as they are available.

For other image types, a separate lower resolution/lossy version is required.
The Static DICOMweb toolkit includes some options to create such images.

# Performance

In general, about 1/16-1/10th of the image is retrieved for the lossy/first
version of the image. This results in about a 10x speed improvement to first
images. It is affected fairly strongly by overall image size, network performance
and compression ratios.

The full size images are 3036 x 3036, while the JLS reduced images are 759 x 759

| Type             | Network | Size   | First Render | Final Render |
| ---------------- | ------- | ------ | ------------ | ------------ |
| JLS              | 4g      | 10.6 M |              | 4586 ms      |
| JLS Reduced      | 4g      | 766 K  | 359 ms       | 4903 ms      |
| HTJ2K            | 4g      | 11.1 M | 897 ms       | 5213 ms      |
| HTJ2K Byte Range | 4g      | 128 K  | 780 ms       | 5431 ms      |

- JLS Reduced uses 1/16 size JLS 'thumbnails'
- HTJ2K uses streaming data
- HTJ2K Byte Range uses 64k initial retrieve, followed by remaining data

# Configuration

See the stackProgressive example for stack details.

No special configuration is required for HTJ2K images, however they can be
disabled by setting the streaming values to false, for example:

```javascript
cornerstoneDicomImageLoader.configure({
  retrieveOptions: {
      default: {
        '3.2.840.10008.1.2.4.96': {
        // Need a specific streaming to false to disable streaming support
        streaming: false,
```

## JLS Thumbnails

JLS thumbnails can be created using the static-dicomweb toolkit, for example,
by doing:

```
# Create a JLS directory containing JLS encoded data in the /jls sub-path
mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jls "/dicom/DE Images for Rad"
# Create a jlsThumbnail sub-directory containing reduce resolution data
mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jlsThumbnail --alternate-thumbnail "/dicom/DE Images for Rad"
```

This can then be used by configuring:

```javascript
cornerstoneDicomImageLoader.configure({
  retrieveOptions: {
    default: {
      default: {
        framesPath: '/jls/',
      },
    },
    singleFast: {
      default: {
        status: ImageStatus.SUBRESOLUTION,
        framesPath: '/jlsThumbnail/',
```
