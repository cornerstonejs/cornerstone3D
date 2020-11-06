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
