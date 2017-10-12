import metaDataManager from './metaDataManager.js';
import getPixelData from './getPixelData.js';
import createImage from '../createImage.js';

function getTransferSyntaxForContentType (/* contentType */) {
  return '1.2.840.10008.1.2'; // hard code to ILE for now
}

function loadImage (imageId, options) {
  const start = new Date().getTime();
  const uri = imageId.substring(7);

  const promise = new Promise((resolve, reject) => {
    // check to make sure we have metadata for this imageId
    const metaData = metaDataManager.get(imageId);

    if (metaData === undefined) {
      const error = new Error(`no metadata for imageId ${imageId}`);

      return reject(error);
    }

    // TODO: load bulk data items that we might need
    const mediaType = 'multipart/related; type="application/octet-stream"'; // 'image/dicom+jp2';

    // get the pixel data from the server
    getPixelData(uri, imageId, mediaType).then((result) => {
      const transferSyntax = getTransferSyntaxForContentType(result.contentType);
      const pixelData = result.imageFrame.pixelData;
      const imagePromise = createImage(imageId, pixelData, transferSyntax, options);

      imagePromise.then((image) => {
        // add the loadTimeInMS property
        const end = new Date().getTime();

        image.loadTimeInMS = end - start;
        resolve(image);
      }, reject);
    }, reject);
  });

  return {
    promise,
    cancelFn: undefined
  };
}

export default loadImage;

