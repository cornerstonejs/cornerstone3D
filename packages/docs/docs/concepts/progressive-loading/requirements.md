---
id: requirements
title: Server Requirements
---

# Server Requirements

Fast initial display of images requires a method to retrieve just a portion of an
image or volume that can be rendered as a complete but lossy image.
For instance, an image could be rendered using partial data (resolution), or images in a volume could be interpolated to generate an alternative image.
These images are initially retrieved for rapid display, followed by retrieving a full-resolution image, resulting in a progressively improved display as more data is loaded.

The DICOM Standards Committee just added support in DICOM for a new encoding
method called High Throughput JPEG 2000 (HTJ2K).
This encoding method enables progressive decoding of
images, meaning that if the first `N bytes` of the image encoding are available, they can be decoded into a lower resolution or lossy image.
The configuration that enables this feature is called `HTJ2K Progressive Resolution (HTJ2K RPCL)` or `High Throughput JPEG 2000 Resolution Position Component Layer`.

Finally, some servers can be configured to serve up reduced (partial) resolution
versions of images on other URL endpoints.

The progressive loading will improve the display of stacked images by supporting HTJ2K progressive resolution encoded data.
Meanwhile, volumetric data will be enhanced in terms of the time it takes to load the first volume
for all backends, unless they are specifically configured for custom load order.
However, the support for different types of reduced resolution and streaming responses varies significantly among DICOMweb implementations.
Therefore, this guide provides additional details on how to configure various configurations.

## Server Requirements

As HTJ2K is a new encoding (and still not merged into the DICOM standard, although approved for merging), it is not yet widely supported by DICOMweb servers. The various ways that servers support it might change in the future. However, we envision two main ways that this will be implemented in most servers but both require the server to support the DICOMWeb standard and HTJ2K RPCL encoding.

- **HTJ2K Support**: For HTJ2K encoded images, the server must support the streaming of image data
  in a way that respects the HTJ2K RPCL configuration, allowing the client to decode partial data into a displayable image.

### Respond with Streaming Data

XHR (XMLHttpRequest) streaming is an extension of the XHR browser-level API that
enables the client to retrieve pieces of data as it arrives, instead of waiting for the entire response.
XHR streaming works by keeping a persistent connection between the client and server and sending data incrementally as it becomes available.

### Respond with Byte Range Request

An XHR byte range request is a feature of the XMLHttpRequest object in JavaScript
that allows for retrieving only a specific range of bytes from a server. This feature is typically used for
downloading large files in chunks or resuming interrupted downloads. By specifying the starting and ending byte positions,
the server can send only the requested portion of the file, reducing bandwidth usage and improving download efficiency.

- **Partial Content Delivery**: The server must support HTTP Range requests, allowing the client to
  request and receive specific byte ranges of the image data. This is crucial for handling large images or volumes by fetching and rendering portions of the data progressively.

:::info
The existing JPEG 2000 encoding and the new [HTJ2K in the standard](https://dicom.nema.org/medical/dicom/Supps/LB/sup235_lb_HTJ2K.pdf) also have a format that specifies a partial resolution endpoint. The exact endpoint needs to be specified in the JPIP referenced data URL. The options data could be used to provide the exact URL required in a future revision.
:::
