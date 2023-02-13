---
id: volumeId
title: VolumeId
---

# VolumeId

A `Cornerstone3D` `VolumeId` is an identifier for a volume which is composed of a
volumeLoader scheme and a volumeId. The volumeLoader scheme is used to identify the
volumeLoader that will be used to load the volume. The volumeId is used to identify
the pre-defined volume that will be used to fill in as the volumetric data
is loaded/read.

```
// an example of a volumeId
cornerstoneStreamingImageVolume:myVolumeId
```

which is composed of the volumeLoader scheme `cornerstoneStreamingImageVolume` and
the volumeId `myVolumeId`.

## Volume Metadata

For creating a volume, we need to know its dimension, dimension spacing, origin, etc. Therefore, those set of metadata should be previously fetched and ready to be used by the ImageVolume constructor.

In the next section we will discuss how to create a volumetric data from a set of images (imageIds).
