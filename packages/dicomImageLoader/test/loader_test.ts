import { test as MultiframeUsTests } from '../testImages/us-multiframe-ybr-full-422';
import { loadImage } from '../src/imageLoader/wadouri/index';

const tests = [MultiframeUsTests];

fdescribe('DICOM Image Loader', () => {
  tests.forEach((test) => {
    it(test.description, async () => {
      const image = await loadImage(test.dicomUrl).promise;
      console.log(image);
      expect(image).toBeDefined();
    });
  });
});
