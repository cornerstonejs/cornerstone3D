// import * as cornerstone3D from '../src/index';
// import * as csTools3d from '../../tools/src/index';
// import * as testUtils from '../../../utils/test/testUtils';
// import { encodeImageIdInfo } from '../../../utils/test/testUtils';

// // nearest neighbor interpolation
// import * as imageURI_64_33_20_5_1_1_0_nearest from './groundTruth/imageURI_64_33_20_5_1_1_0_nearest.png';
// import * as imageURI_64_64_20_5_1_1_0_nearest from './groundTruth/imageURI_64_64_20_5_1_1_0_nearest.png';
// import * as imageURI_64_64_30_10_5_5_0_nearest from './groundTruth/imageURI_64_64_30_10_5_5_0_nearest.png';
// import * as imageURI_256_256_100_100_1_1_0_nearest from './groundTruth/imageURI_256_256_100_100_1_1_0_nearest.png';
// import * as imageURI_256_256_100_100_1_1_0_CT_nearest from './groundTruth/imageURI_256_256_100_100_1_1_0_CT_nearest.png';
// import * as imageURI_64_64_54_10_5_5_0_nearest from './groundTruth/imageURI_64_64_54_10_5_5_0_nearest.png';
// import * as imageURI_64_64_0_10_5_5_0_nearest from './groundTruth/imageURI_64_64_0_10_5_5_0_nearest.png';
// import * as imageURI_100_100_0_10_1_1_1_nearest_color from './groundTruth/imageURI_100_100_0_10_1_1_1_nearest_color.png';
// import * as imageURI_11_11_4_1_1_1_0_nearest_invert_90deg from './groundTruth/imageURI_11_11_4_1_1_1_0_nearest_invert_90deg.png';
// import * as imageURI_64_64_20_5_1_1_0_nearestFlipH from './groundTruth/imageURI_64_64_20_5_1_1_0_nearestFlipH.png';
// import * as imageURI_64_64_20_5_1_1_0_nearestFlipHRotate90 from './groundTruth/imageURI_64_64_20_5_1_1_0_nearestFlipHRotate90.png';

// // linear interpolation
// import * as imageURI_11_11_4_1_1_1_0 from './groundTruth/imageURI_11_11_4_1_1_1_0.png';
// import * as imageURI_256_256_50_10_1_1_0 from './groundTruth/imageURI_256_256_50_10_1_1_0.png';
// import * as imageURI_100_100_0_10_1_1_1_linear_color from './groundTruth/imageURI_100_100_0_10_1_1_1_linear_color.png';
// import * as calibrated_1_5_imageURI_11_11_4_1_1_1_0_1 from './groundTruth/calibrated_1_5_imageURI_11_11_4_1_1_1_0_1.png';

// const { cache, RenderingEngine, utilities, imageLoader, metaData, Enums } =
//   cornerstone3D;

// const { Events, ViewportType, InterpolationType } = Enums;
// const { calibratedPixelSpacingMetadataProvider } = utilities;

// const { fakeImageLoader, fakeMetaDataProvider, compareImages } = testUtils;

// const renderingEngineId = utilities.uuidv4();

// const viewportId = 'VIEWPORT';

// const AXIAL = 'AXIAL';
// const SAGITTAL = 'SAGITTAL';
// const CORONAL = 'CORONAL';

// describe('renderingCore -- Stack', () => {
//   let renderingEngine;

//   beforeEach(function () {
//     const testEnv = testUtils.setupTestEnvironment({
//       renderingEngineId,
//       toolGroupIds: ['default'],
//     });
//     renderingEngine = testEnv.renderingEngine;
//   });

//   afterEach(function () {
//     testUtils.cleanupTestEnvironment({
//       renderingEngineId,
//       toolGroupIds: ['default'],
//     });
//   });

//   describe('Stack Viewport Nearest Neighbor Interpolation --- ', function () {
//     it('Should render one stack viewport of square size properly: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 20,
//         barWidth: 5,
//         xSpacing: 1,
//         ySpacing: 1,
//       };
//       const imageId = encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);
//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');
//         compareImages(
//           image,
//           imageURI_64_64_20_5_1_1_0_nearest,
//           'imageURI_64_64_20_5_1_1_0_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render one stack viewport of rectangle size properly: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 33,
//         barStart: 20,
//         barWidth: 5,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId = encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);

//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');
//         compareImages(
//           image,
//           imageURI_64_33_20_5_1_1_0_nearest,
//           'imageURI_64_33_20_5_1_1_0_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render one stack viewport of square size and 5mm spacing properly: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 30,
//         barWidth: 10,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 0,
//       };
//       const imageId = encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);

//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');

//         compareImages(
//           image,
//           imageURI_64_64_30_10_5_5_0_nearest,
//           'imageURI_64_64_30_10_5_5_0_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should use enableElement API to render one stack viewport of square size and 5mm spacing properly: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 30,
//         barWidth: 10,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 0,
//       };
//       const imageId = encodeImageIdInfo(imageInfo);

//       renderingEngine.enableElement({
//         viewportId: viewportId,
//         type: ViewportType.STACK,
//         element: element,
//         defaultOptions: {
//           background: [1, 0, 1], // pinkish background
//         },
//       });

//       const vp = renderingEngine.getViewport(viewportId);

//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');

//         compareImages(
//           image,
//           imageURI_64_64_30_10_5_5_0_nearest,
//           'imageURI_64_64_30_10_5_5_0_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render one stack viewport, first slice correctly: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo1 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 0,
//         barWidth: 10,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 0,
//       };
//       const imageId1 = encodeImageIdInfo(imageInfo1);

//       const imageInfo2 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 10,
//         barWidth: 20,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 1,
//       };
//       const imageId2 = encodeImageIdInfo(imageInfo2);

//       const imageInfo3 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 20,
//         barWidth: 30,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 2,
//       };
//       const imageId3 = encodeImageIdInfo(imageInfo3);

//       const vp = renderingEngine.getViewport(viewportId);

//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');

//         compareImages(
//           image,
//           imageURI_64_64_0_10_5_5_0_nearest,
//           'imageURI_64_64_0_10_5_5_0_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId1, imageId2, imageId3], 0).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render one stack viewport, last slice correctly: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo1 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 0,
//         barWidth: 10,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 0,
//       };
//       const imageId1 = encodeImageIdInfo(imageInfo1);

//       const imageInfo2 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 10,
//         barWidth: 20,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 1,
//       };
//       const imageId2 = encodeImageIdInfo(imageInfo2);

//       const imageInfo3 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 54,
//         barWidth: 10,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 2,
//       };
//       const imageId3 = encodeImageIdInfo(imageInfo3);

//       const vp = renderingEngine.getViewport(viewportId);

//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');

//         compareImages(
//           image,
//           imageURI_64_64_54_10_5_5_0_nearest,
//           'imageURI_64_64_54_10_5_5_0_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId1, imageId2, imageId3], 2).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render one stack viewport with CT presets correctly: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 256,
//         columns: 256,
//         barStart: 100,
//         barWidth: 100,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId = encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);

//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');

//         compareImages(
//           image,
//           imageURI_256_256_100_100_1_1_0_CT_nearest,
//           'imageURI_256_256_100_100_1_1_0_CT_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({
//             voiRange: { lower: -160, upper: 240 },
//             interpolationType: InterpolationType.NEAREST,
//           });
//         });

//         vp.render();
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render one stack viewport with multiple imageIds of different size and different spacing: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo1 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 256,
//         columns: 256,
//         barStart: 100,
//         barWidth: 100,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId1 = encodeImageIdInfo(imageInfo1);

//       const imageInfo2 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 30,
//         barWidth: 10,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 1,
//       };
//       const imageId2 = encodeImageIdInfo(imageInfo2);

//       const vp = renderingEngine.getViewport(viewportId);

//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');

//         compareImages(
//           image,
//           imageURI_256_256_100_100_1_1_0_nearest,
//           'imageURI_256_256_100_100_1_1_0_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId1, imageId2], 0).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render one stack viewport with multiple imageIds of different size and different spacing, second slice: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo1 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 256,
//         columns: 256,
//         barStart: 100,
//         barWidth: 100,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId1 = encodeImageIdInfo(imageInfo1);

//       const imageInfo2 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 30,
//         barWidth: 10,
//         xSpacing: 5,
//         ySpacing: 5,
//         sliceIndex: 1,
//       };
//       const imageId2 = encodeImageIdInfo(imageInfo2);

//       const vp = renderingEngine.getViewport(viewportId);

//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');

//         compareImages(
//           image,
//           imageURI_64_64_30_10_5_5_0_nearest,
//           'imageURI_64_64_30_10_5_5_0_nearest'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId1, imageId2], 1).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });
//   });

//   describe('Stack Viewport Linear Interpolation --- ', () => {
//     it('Should render one stack viewport with linear interpolation correctly', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 11,
//         columns: 11,
//         barStart: 4,
//         barWidth: 1,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId = encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);
//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');
//         compareImages(
//           image,
//           imageURI_11_11_4_1_1_1_0,
//           'imageURI_11_11_4_1_1_1_0'
//         ).then(done, done.fail);
//       });
//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({ voiRange: { lower: -160, upper: 240 } });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render one stack viewport with multiple images with linear interpolation correctly', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo1 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 11,
//         columns: 11,
//         barStart: 4,
//         barWidth: 1,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId1 = encodeImageIdInfo(imageInfo1);

//       const imageInfo2 = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 256,
//         columns: 256,
//         barStart: 50,
//         barWidth: 10,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 1,
//       };
//       const imageId2 = encodeImageIdInfo(imageInfo2);

//       const vp = renderingEngine.getViewport(viewportId);
//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');
//         compareImages(
//           image,
//           imageURI_256_256_50_10_1_1_0,
//           'imageURI_256_256_50_10_1_1_0'
//         ).then(done, done.fail);
//       });
//       try {
//         vp.setStack([imageId1, imageId2], 1).then(() => {
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });
//   });

//   describe('Color Stack Images', () => {
//     it('Should render color images: linear', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.SAGITTAL,
//         width: 512,
//         height: 512,
//       });

//       // color image generation with 10 strips of different colors
//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 100,
//         columns: 100,
//         barStart: 0,
//         barWidth: 10,
//         xSpacing: 1,
//         ySpacing: 1,
//         rgb: 1,
//         pt: 0,
//         sliceIndex: 0,
//       };
//       const imageId = encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);
//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');
//         compareImages(
//           image,
//           imageURI_100_100_0_10_1_1_1_linear_color,
//           'imageURI_100_100_0_10_1_1_1_linear_color'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should render color images: nearest', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//         width: 512,
//         height: 512,
//       });

//       // color image generation with 10 strips of different colors
//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 100,
//         columns: 100,
//         barStart: 0,
//         barWidth: 10,
//         xSpacing: 1,
//         ySpacing: 1,
//         rgb: 1,
//         pt: 0,
//         sliceIndex: 0,
//       };
//       const imageId = encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);
//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');
//         compareImages(
//           image,
//           imageURI_100_100_0_10_1_1_1_nearest_color,
//           'imageURI_100_100_0_10_1_1_1_nearest_color'
//         ).then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });
//   });

//   describe('Stack Viewport Calibration and Scaling --- ', () => {
//     it('Should be able to render a stack viewport with PET modality scaling', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 11,
//         columns: 11,
//         barStart: 4,
//         barWidth: 1,
//         xSpacing: 1,
//         ySpacing: 1,
//         PT: 1,
//         sliceIndex: 0,
//       };
//       const imageId = testUtils.encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);
//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         expect(vp.scaling.PT).toEqual({
//           suvbwToSuvlbm: 1,
//           suvbwToSuvbsa: 1,
//         });
//         done();
//       });
//       try {
//         vp.setStack([imageId], 0);
//         vp.render();
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should be able to calibrate the pixel spacing', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 11,
//         columns: 11,
//         barStart: 4,
//         barWidth: 1,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId = testUtils.encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);

//       const imageRenderedCallback = () => {
//         calibratedPixelSpacingMetadataProvider.add(imageId, {
//           scale: 0.5,
//         });

//         vp.calibrateSpacing(imageId);
//         element.removeEventListener(
//           Events.IMAGE_RENDERED,
//           imageRenderedCallback
//         );
//         element.addEventListener(
//           Events.IMAGE_RENDERED,
//           secondImageRenderedCallbackAfterCalibration
//         );
//       };

//       const secondImageRenderedCallbackAfterCalibration = () => {
//         done();
//       };

//       element.addEventListener(Events.IMAGE_RENDERED, imageRenderedCallback);

//       element.addEventListener(Events.IMAGE_SPACING_CALIBRATED, (evt) => {
//         const { calibration } = evt.detail;
//         expect(calibration?.scale).toBe(0.5);
//       });

//       try {
//         vp.setStack([imageId], 0);
//         vp.render();
//       } catch (e) {
//         done.fail(e);
//       }
//     });
//   });

//   describe('Stack Viewport setProperties API --- ', () => {
//     it('Should be able to use setProperties API', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 11,
//         columns: 11,
//         barStart: 4,
//         barWidth: 1,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId = testUtils.encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);

//       const subscribeToImageRendered = () => {
//         element.addEventListener(Events.IMAGE_RENDERED, (evt) => {
//           const canvas = vp.getCanvas();
//           const image = canvas.toDataURL('image/png');

//           let props = vp.getProperties();
//           const rotation = vp.getViewPresentation().rotation;
//           expect(rotation).toBe(90);
//           expect(props.interpolationType).toBe(InterpolationType.NEAREST);
//           expect(props.invert).toBe(true);

//           testUtils
//             .compareImages(
//               image,
//               imageURI_11_11_4_1_1_1_0_nearest_invert_90deg,
//               'imageURI_11_11_4_1_1_1_0_nearest_invert_90deg'
//             )
//             .then(done, done.fail);
//         });
//       };

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           subscribeToImageRendered();
//           vp.setProperties({
//             interpolationType: InterpolationType.NEAREST,
//             voiRange: { lower: -260, upper: 140 },
//             invert: true,
//           });
//           vp.setViewPresentation({ rotation: 90 });

//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should be able to resetProperties API', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 11,
//         columns: 11,
//         barStart: 4,
//         barWidth: 1,
//         xSpacing: 1,
//         ySpacing: 1,
//         sliceIndex: 0,
//       };
//       const imageId = testUtils.encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);

//       const firstImageRenderedCallback = () => {
//         element.removeEventListener(
//           Events.IMAGE_RENDERED,
//           firstImageRenderedCallback
//         );

//         let props = vp.getProperties();
//         const rotation = vp.getViewPresentation().rotation;
//         expect(rotation).toBe(90);
//         expect(props.interpolationType).toBe(InterpolationType.NEAREST);
//         expect(props.invert).toBe(true);

//         setTimeout(() => {
//           console.log('reseting properties');
//           vp.resetProperties();
//         });

//         element.addEventListener(
//           Events.IMAGE_RENDERED,
//           secondImageRenderedCallback
//         );
//       };

//       const secondImageRenderedCallback = () => {
//         console.log('resetProperties callback');
//         const props = vp.getProperties();
//         expect(props.interpolationType).toBe(InterpolationType.LINEAR);
//         expect(props.invert).toBe(false);

//         done();
//         console.log('done');
//       };

//       element.addEventListener(
//         Events.IMAGE_RENDERED,
//         firstImageRenderedCallback
//       );

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({
//             interpolationType: InterpolationType.NEAREST,
//             voiRange: { lower: -260, upper: 140 },
//             invert: true,
//           });
//           vp.setRotation(90);
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });
//   });

//   describe('Flipping', function () {
//     it('Should be able to flip a stack viewport horizontally', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 20,
//         barWidth: 5,
//         xSpacing: 1,
//         ySpacing: 1,
//       };
//       const imageId = testUtils.encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);
//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');
//         testUtils
//           .compareImages(
//             image,
//             imageURI_64_64_20_5_1_1_0_nearestFlipH,
//             'imageURI_64_64_20_5_1_1_0_nearestFlipH'
//           )
//           .then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({
//             interpolationType: InterpolationType.NEAREST,
//           });

//           vp.setCamera({ flipHorizontal: true });

//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });

//     it('Should be able to flip a stack viewport vertically and rotate it', function (done) {
//       const element = testUtils.createViewports(renderingEngine, {
//         viewportId,
//         orientation: Enums.OrientationAxis.AXIAL,
//       });

//       const imageInfo = {
//         loader: 'fakeImageLoader',
//         name: 'imageURI',
//         rows: 64,
//         columns: 64,
//         barStart: 20,
//         barWidth: 5,
//         xSpacing: 1,
//         ySpacing: 1,
//       };
//       const imageId = testUtils.encodeImageIdInfo(imageInfo);

//       const vp = renderingEngine.getViewport(viewportId);
//       element.addEventListener(Events.IMAGE_RENDERED, () => {
//         const canvas = vp.getCanvas();
//         const image = canvas.toDataURL('image/png');
//         testUtils
//           .compareImages(
//             image,
//             imageURI_64_64_20_5_1_1_0_nearestFlipHRotate90,
//             'imageURI_64_64_20_5_1_1_0_nearestFlipHRotate90'
//           )
//           .then(done, done.fail);
//       });

//       try {
//         vp.setStack([imageId], 0).then(() => {
//           vp.setProperties({
//             interpolationType: InterpolationType.NEAREST,
//           });

//           vp.setRotation(90);
//           vp.setCamera({ flipVertical: true });
//           vp.render();
//         });
//       } catch (e) {
//         done.fail(e);
//       }
//     });
//   });
// });
