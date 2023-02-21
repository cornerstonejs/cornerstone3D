import parseImageId from './parseImageId';
import fileManager from './fileManager';

function loadFileRequest(uri: string): Promise<ArrayBuffer> {
  const parsedImageId = parseImageId(uri);
  const fileIndex = parseInt(parsedImageId.url, 10);
  const file = fileManager.get(fileIndex);

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      const dicomPart10AsArrayBuffer = e.target.result as ArrayBuffer;

      resolve(dicomPart10AsArrayBuffer);
    };

    fileReader.onerror = reject;

    fileReader.readAsArrayBuffer(file);
  });
}

export default loadFileRequest;
