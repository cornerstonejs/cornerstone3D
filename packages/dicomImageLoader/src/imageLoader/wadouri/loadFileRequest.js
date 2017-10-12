import parseImageId from './parseImageId.js';
import fileManager from './fileManager.js';

function loadFileRequest (uri) {
  const parsedImageId = parseImageId(uri);
  const fileIndex = parseInt(parsedImageId.url, 10);
  const file = fileManager.get(fileIndex);

  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      const dicomPart10AsArrayBuffer = e.target.result;

      resolve(dicomPart10AsArrayBuffer);
    };

    fileReader.onerror = (e) => {
      reject(e);
    };

    fileReader.readAsArrayBuffer(file);
  });
}

export default loadFileRequest;
