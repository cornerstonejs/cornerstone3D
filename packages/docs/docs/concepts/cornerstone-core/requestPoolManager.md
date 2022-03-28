---
id: requestPoolManager
---


# RequestPool Manager

The RequestPool Manager has been extensively reworked to provide two new features: 1) `asynchronous image retrieval and decoding` 2) `requests re-ordering` which we discuss next.

## ImageLoad and ImageRetrieval Queues

Previously, there was just one loading queue for fetching and decoding an image.
Once the image decoding was completed, a new request was initiated. This had a constraint
for when decoding required time; thus, no new retrieval (fetch) requests would be sent,
even if additional requests were permitted based on the configured maximum number of requests.

To overcome this limitation, two distinct queues have been created for this
purpose: "imageRetrieval" and "imageLoad" pools, each with their own configurable maximum concurrent
jobs. They are separated and executed asynchronously from one another, allowing
each retrieval request to be initiated instantly upon the availability of a request firing slot.

Splitting the image retrieval request and decoding is enabled by default in `Cornerstone` when using the `Cornerstone-wado-image-loader` version `v4.0.0-rc` or above.

```js
// Loading = Retrieval + Decoding
const imageLoadPoolManager = new RequestPoolManager()

imageLoadPoolManager.maxNumRequests = {
  interaction: 1000,
  thumbnail: 1000,
  prefetch: 1000,
}

// Retrieval (usually) === XHR requests
const imageRetrievalPoolManager = new RequestPoolManager()

imageRetrievalPoolManager.maxNumRequests = {
  interaction: 20,
  thumbnail: 20,
  prefetch: 20,
}
```

### Usage
You will need to define a *sendRequest* function to make an load image request.


```js
import {imageLoadPoolManager, loadAndCacheImage, RequestType} from '@cornerstone/core'

function sendRequest(imageId, imageIdIndex, options) {
  return loadAndCacheImage(imageId, options).then(
    (image) => {
      // render
      successCallback.call(this, image, imageIdIndex, imageId);
    },
    (error) => {
      errorCallback.call(this, error, imageIdIndex, imageId);
    }
  );
}

const imageId = "schema://image"
const imageIdIndex = 10


const requestType = RequestType.Interaction
const priority = -5
const additionalDetails = { imageId }
const options = {
  targetBuffer: {
    type: 'Float32Array',
  },
}


imageLoadPoolManager.addRequest(
  sendRequest.bind(this, imageId, imageIdIndex, options),
  requestType,
  additionalDetails,
  priority
)
```


## Requests re-ordering

You could have a certain sequence in mind for retrieving the images. For example,
suppose you want to load a volume from the middle slice to the top and bottom.
You may do this by [getting the image requests](/docs/cornerstone-image-loader-streaming-volume/classes/StreamingImageVolume#getimageloadrequests) from the constructed volume, re-ordering them,
and manually adding them to the imageLoadPoolManager.

You can take a look at the 'PriorityLoading' demo to see how to re-order the requests.
