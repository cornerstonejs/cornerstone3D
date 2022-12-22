---
id: imageId
title: ImageId
---

# ImageId

A `Cornerstone3D` `ImageId` is a URL which identifies a single image for cornerstone to display.

The URL scheme in the `ImageId` is used by Cornerstone to determine which [Image Loader](./imageLoader.md) plugin to call to actually load the image.
It should be noted that `Cornerstone3D` delegates loading of the images to the registered image loaders.
This strategy allows Cornerstone to simultaneously display multiple images obtained with different protocols from different servers. For example, Cornerstone could display a DICOM CT image obtained via WADO alongside a JPEG dermatology image captured by a digital camera and stored on a file system.

The ImageId format

![image-id-format](./../../assets/image-id-format.png)

DICOM Persistent Objects (WADO) is a standard for storing and retrieving medical images using the DICOM protocol.
WADO allows for retrieval (and storage) of images from a WADO-compliant server. Here are some examples of what an
imageId would look like for different ImageLoader plugins:

[**WADO-URI**](https://dicom.nema.org/dicom/2013/output/chtml/part18/sect_6.2.html)

```
http://www.medical-webservice.st/RetrieveDocument?
requestType=WADO&studyUID=1.2.250.1.59.40211.12345678.678910
&seriesUID=1.2.250.1.59.40211.789001276.14556172.67789
&objectUID=1.2.250.1.59.40211.2678810.87991027.899772.2
&contentType=application%2Fdicom&transferSyntax=1.2.840.10008.1.2.4.50

```

[**WADO-RS**](https://dicom.nema.org/dicom/2013/output/chtml/part18/sect_6.5.html)

```
https://d1qmxk7r72ysft.cloudfront.net/dicomweb/
studies/1.3.6.1.4.1.25403.345050719074.3824.20170126083429.2/
series/1.3.6.1.4.1.25403.345050719074.3824.20170126083454.5/
instances/1.3.6.1.4.1.25403.345050719074.3824.20170126083455.3/frames/1
```

Cornerstone does not specify what the contents of the URL are - it is up to the Image Loader to define the contents and format of the URL so that it can locate the image. For example, a proprietary Image Loader plugin could be written to talk to a proprietary server and lookup images using a GUID, filename or database row id.

Here are some examples of what an ImageId could look like for different Image Loader plugins:

- example://1
- dicomweb://server/wado/{uid}/{uid}/{uid}
- http://server/image.jpeg
- custom://server/uuid
- wadors://server/{StudyInstanceUID}/{SeriesInstanceUID}/{SOPInstanceUID}
