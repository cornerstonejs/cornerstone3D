// import * as cornerstone3D from '../src/index';
// import * as csTools3d from '../../tools/src/index';
// import * as testUtils from '../../../utils/test/testUtils';
// import { encodeImageIdInfo } from '../../../utils/test/testUtils';

// // nearest neighbor interpolation
// import * as calibrated_1_5_imageURI_11_11_4_1_1_1_0_1 from './groundTruth/calibrated_1_5_imageURI_11_11_4_1_1_1_0_1.png';

// import {
//   Enums,
//   utilities,
//   init,
//   cache,
//   metaData,
//   RenderingEngine,
//   imageLoader,
//   volumeLoader,
//   eventTarget,
//   getRenderingEngine,
//   init as initCore,
// } from '@cornerstonejs/core';
// import {
//   init as initTools,
//   addTool,
//   ToolGroupManager,
//   SynchronizerManager,
//   utilities as toolsUtilities,
// } from '@cornerstonejs/tools';

// const { calibrateImageSpacing } = toolsUtilities;
// const { Events } = Enums;

// describe('Calibration ', () => {
//   const scale = 3.5;

//   let renderingEngine;
//   let viewportId = 'viewport1';
//   beforeEach(() => {
//     const testEnvironment = testUtils.setupTestEnvironment({});
//     renderingEngine = testEnvironment.renderingEngine;
//   });

//   afterEach(() => {
//     testUtils.cleanupTestEnvironment();
//   });

//   it('Should be able to calibrate an image', function (done) {
//     const element = testUtils.createViewports(renderingEngine, {
//       viewportId,
//       orientation: Enums.OrientationAxis.AXIAL,
//     });

//     const imageInfo = {
//       loader: 'fakeImageLoader',
//       name: 'imageURI',
//       rows: 11,
//       columns: 11,
//       barStart: 4,
//       barWidth: 1,
//       xSpacing: 1,
//       ySpacing: 1,
//       sliceIndex: 1,
//     };
//     const imageId = testUtils.encodeImageIdInfo(imageInfo);

//     const vp = renderingEngine.getViewport(viewportId);

//     const firstCallback = () => {
//       element.removeEventListener(Events.IMAGE_RENDERED, firstCallback);
//       element.addEventListener(Events.IMAGE_RENDERED, secondCallback);
//       const imageId = renderingEngine
//         .getViewport(viewportId)
//         .getCurrentImageId();

//       calibrateImageSpacing(imageId, renderingEngine, scale);
//       // setTimeout(() => {
//       //   vp.render();
//       // }, 2000);
//     };

//     const secondCallback = () => {
//       const canvas = vp.getCanvas();
//       const image = canvas.toDataURL('image/png');
//       testUtils
//         .compareImages(
//           image,
//           calibrated_1_5_imageURI_11_11_4_1_1_1_0_1,
//           'calibrated_1_5_imageURI_11_11_4_1_1_1_0_1'
//         )
//         .then(done, done.fail);
//     };

//     element.addEventListener(Events.IMAGE_RENDERED, firstCallback);

//     try {
//       vp.setStack([imageId], 0);
//       vp.render();
//     } catch (e) {
//       done.fail(e);
//     }
//   });

//   // it('Should be able to fire imageCalibrated event with expected data', function (done) {
//   //   const element = testUtils.createViewports(renderingEngine, {
//   //     viewportId,
//   //     orientation: Enums.OrientationAxis.AXIAL,
//   //   });

//   //   // Note: this should be a unique image in our tests, since we
//   //   // are basically modifying the metadata of the image to be calibrated
//   //   const imageInfo = {
//   //     loader: 'fakeImageLoader',
//   //     name: 'imageURI',
//   //     rows: 64,
//   //     columns: 46,
//   //     barStart: 0,
//   //     barWidth: 46,
//   //     xSpacing: 1,
//   //     ySpacing: 1,
//   //     sliceIndex: 0,
//   //   };
//   //   const imageId = testUtils.encodeImageIdInfo(imageInfo);

//   //   const vp = renderingEngine.getViewport(viewportId);

//   //   const imageRenderedCallback = () => {
//   //     element.removeEventListener(Events.IMAGE_RENDERED, imageRenderedCallback);

//   //     const imageId = renderingEngine
//   //       .getViewport(viewportId)
//   //       .getCurrentImageId();

//   //     testUtils.calibrateImageSpacing(imageId, renderingEngine, scale);

//   //     element.addEventListener(
//   //       Events.IMAGE_RENDERED,
//   //       secondImageRenderedCallback
//   //     );
//   //   };

//   //   const secondImageRenderedCallback = () => {
//   //     done();
//   //   };

//   //   element.addEventListener(Events.IMAGE_RENDERED, imageRenderedCallback);

//   //   element.addEventListener(Events.IMAGE_SPACING_CALIBRATED, (evt) => {
//   //     expect(evt.detail).toBeDefined();
//   //     expect(evt.detail.scale).toBe(scale);
//   //     expect(evt.detail.viewportId).toBe(viewportId);
//   //   });

//   //   try {
//   //     vp.setStack([imageId], 0);
//   //     vp.render();
//   //   } catch (e) {
//   //     done.fail(e);
//   //   }
//   // });
// });
