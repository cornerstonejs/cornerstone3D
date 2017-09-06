import parseImageId from './parseImageId.js';
import fileManager from './fileManager.js';

function loadFileRequest (uri) {
  const parsedImageId = parseImageId(uri);
  const fileIndex = parseInt(parsedImageId.url, 10);
  const file = fileManager.get(fileIndex);

  // create a deferred object
  const deferred = $.Deferred();

  const fileReader = new FileReader();

  fileReader.onload = function (e) {
    const dicomPart10AsArrayBuffer = e.target.result;

    deferred.resolve(dicomPart10AsArrayBuffer);
  };
  fileReader.readAsArrayBuffer(file);

  return deferred.promise();
}

export default loadFileRequest;
