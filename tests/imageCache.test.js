// TODO -> Need to work out how to get tests to build.
// Need to be able to do these two (for example):

// 1)
// -- import {imageCache} from '@vtk-viewport' // This lib
// -- OR import imageCache from 'path/to/imageCache' and put the tests in with the source, but I feel that won't work.
// 2)
// -- import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';

describe('SanityCheck', () => {
  it('is truthy', () => {
    expect(true).toBeTruthy();
  });
});
