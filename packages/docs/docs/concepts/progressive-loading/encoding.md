---
id: encoding
title: Encoding
---

## Types of Partial Resolution

There are a few types of partial resolution image:

- `lossy` images are original resolution/bit depth, but lossy encoded
- `thumbnail` images are reduced resolution images
- `byte range` images are a prefix of the full resolution, followed by
  retrieving the remaining data. This only works for images like HTJ2K encoded
  in resolution first ordering.

## Creating Partial Resolution Images

[Static DICOMweb](https://github.com/RadicalImaging/Static-DICOMWeb) repository has been enhanced to add the ability to create partial resolution
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
