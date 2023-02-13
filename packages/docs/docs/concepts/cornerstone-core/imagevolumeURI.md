---
id: imagevolumeURI
title: Image or Volume URI
---

# URI vs Id

As learned previously in [imageId](./imageId.md), and [volumeId](./volumeId.md),
they are both identifiers for a particular image or volume. They are compose of a first part of loaderId (either image or volume) and a second part of the actual id.

For Caching optimizations (next topic) we have switched into using URIs instead of Ids (the
second part of the Id - the part without the loaderId). Here are
the reasons:

- Considering the nature of the data loading where the same image can be loaded
  from different sources (imageLoaderId), and volume can be loaded from different
  sources (volumeLoaderId), BUT still the data itself (either image or volume) is
  the same pixelData
- An image retrieved from imageLoaders (e.g., wadors) can be the same exact image
  which is retrieved through the volumeLoading process. For optimization purposes
  we should be able to check if the volume requested image is already in the image cache
  (more on volume and image cache later)
  and if so, we should be able to use the image from the image cache instead of
  loading it again through the network.
