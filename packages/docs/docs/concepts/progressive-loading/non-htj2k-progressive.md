---
id: non-htj2k-progressive
title: Progressive Loading for non-HTJ2K
---

# Progressive Loading for non-HTJ2K Progressive Encoded Data

## JLS Thumbnails

JLS thumbnails can be created using the static-dicomweb toolkit, for example,
by doing:

```
# Create a JLS directory containing JLS encoded data in the /jls sub-path
mkdicomweb create -t jhc --recompress true --alternate jlsLossless --alternate-name jls "/dicom/DE Images for Rad"
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
        imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
        framesPath: '/jlsThumbnail/',
```
