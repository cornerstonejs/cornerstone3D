import { IImage } from 'core/src/types';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

export default function updatePixelData(
  image: IImage,
  imageData: vtkImageData
) {
  const pixelData = image.getPixelData();
  const scalars = imageData.getPointData().getScalars();
  const scalarData = scalars.getData() as
    | Uint8Array
    | Float32Array
    | Uint16Array
    | Int16Array;

  // if the color image is loaded with CPU previously, it loads it
  // with RGBA, and here we need to remove the A channel from the
  // pixel data.
  if (image.color && image.rgba) {
    const newPixelData = new Uint8Array(image.columns * image.rows * 3);
    for (let i = 0; i < image.columns * image.rows; i++) {
      newPixelData[i * 3] = pixelData[i * 4];
      newPixelData[i * 3 + 1] = pixelData[i * 4 + 1];
      newPixelData[i * 3 + 2] = pixelData[i * 4 + 2];
    }
    // modify the image object to have the correct pixel data for later
    // use.
    image.rgba = false;
    image.getPixelData = () => newPixelData;
    scalarData.set(newPixelData);
  } else {
    scalarData.set(pixelData);
  }

  // Trigger modified on the VTK Object so the texture is updated
  // TODO: evaluate directly changing things with texSubImage3D later
  imageData.modified();
}
