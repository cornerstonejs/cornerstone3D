---
id: re-order
---

# Re-ordering Image Requests

As mentioned in the [`Streaming of Volume Data`](./streaming.md) section, creation and
caching of a volume is separated from the loading of the image data.

This gives us the flexibility of loading images in any order, and the ability to
re-order the image requests to load the images in the correct order.

## getImageLoadRequests

After you create the `StreamingImageVolume` instance, you can call `getImageLoadRequests` to get the image load requests.
You can then re-order (or interleave the serries request with
another series) the image requests to load the images in desired order.
