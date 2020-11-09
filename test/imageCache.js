import everything from '../src/index.js';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';

// import { User } from ... doesn't work right now since we don't have named exports set up
const { User } = everything;

describe('Some tests', () => {
  it('is truthy', () => {
    expect(true).toBeTruthy();
  });

  it('is not truthy', () => {
    console.log(User);
    console.log(vtkConeSource);
    expect(vtkConeSource).toBeTruthy();
    expect(User).toBeTruthy();
  });
});

// imageCache =>
// Make mock images
// -- Create image
// -- Create derived images
// -- Create derived image with existing Uint8 data
// -- Create derived image with exising Float32 data
// -- Cache size behaving correctly with decacheVolume and purgeCache.
//

// Load image
// -- Load image called twice and not sending requests twice.
// -- Object being decached during load image?

/*
    // cornerstone
    //   .loadImage(ctImageIds[0], {
    //     targetBuffer: {
    //       arrayBuffer: ctVolume.scalarData.buffer,
    //       offset: 0,
    //       length: 512 * 512,
    //       type: 'Float32Array',
    //     },
    //     preScale: {
    //       scalingParameters: {
    //         rescaleSlope: -1024,
    //         rescaleIntercept: 1,
    //         modality: 'CT',
    //       },
    //     },
    //   })
    //   .then(image => {
    //     console.log(performance.now() - t0);
    //     console.log(image);
    //   });

    // Seg example
    // const ctDimensions = ctVolume.dimensions;
    // const existingSegPixelArray = createUint8SharedArray(
    //   ctDimensions[0] * ctDimensions[1] * ctDimensions[2]
    // );

    // const segVolumeExistingData = imageCache.makeAndCacheDerivedVolume(
    //   ctVolumeUID,
    //   {
    //     volumeScalarData: existingSegPixelArray,
    //   }
    // );




    // const segVolumeBlank = imageCache.makeAndCacheDerivedVolume(ctVolumeUID);

    // imageCache.decacheVolume(segVolumeBlank.uid);

    // imageCache.decacheVolume(segVolumeExistingData.uid);

    // imageCache.purgeCache();
*/
