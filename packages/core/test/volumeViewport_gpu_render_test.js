import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

// poly data
import * as sphere_default_sagittal from './groundTruth/sphere_default_sagittal.png';

// nearest neighbor interpolation
import * as volumeURI_100_100_10_1_1_1_0_sagittal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_0_sagittal_nearest.png';
import * as volumeURI_100_100_10_1_1_1_0_coronal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_0_coronal_nearest.png';
import * as volumeURI_100_100_10_1_1_1_1_color_coronal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_1_color_coronal_nearest.png';

// linear interpolation
import * as volumeURI_100_100_10_1_1_1_0_sagittal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_0_sagittal_linear.png';
import * as volumeURI_100_100_10_1_1_1_0_coronal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_0_coronal_linear.png';
import * as volumeURI_100_100_10_1_1_1_1_color_coronal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_1_color_coronal_linear.png';

const { imageLoader, Enums, volumeLoader, utilities, CONSTANTS } =
  cornerstone3D;

const { ViewportType, Events, InterpolationType } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'VIEWPORT';

/** The value of the voxels of the bar of a slice of the bar volume. */
const BAR_VALUE = 255;

/**
 * The grey levels by which a pixel of a linear picture may differ from the
 * interpolation of the voxels: the GPU rounds its weights and the grey to
 * bytes.
 */
const LINEAR_ROUNDING_LEVELS = 1;

/**
 * The middle slice of an axial view of the bar volume: the slice that the
 * view of a volume of 10 or 11 slices shows.
 */
const MIDDLE_SLICE = 5;

/** The frame of reference of the fake volumes. */
const VOLUME_FRAME_OF_REFERENCE = 'Volume_Frame_Of_Reference';

/**
 * The value of a voxel column of a slice of the bar volume of 100 columns:
 * slice k has its bar on the columns k * w to (k + 1) * w - 1, where w is
 * floor(100 / slices).
 */
function barVolumeValue(column, slice, slices) {
  const barWidth = Math.floor(100 / slices);
  const start = slice * barWidth;

  return column >= start && column < start + barWidth ? BAR_VALUE : 0;
}

/**
 * The value of a row of the bar volume with linear interpolation, at a
 * place given in voxels: voxel i has its centre at i.
 */
function linearBarVolumeValue(place, slice, slices) {
  const left = Math.floor(place);
  const weight = place - left;

  return (
    (1 - weight) * barVolumeValue(left, slice, slices) +
    weight * barVolumeValue(left + 1, slice, slices)
  );
}

/**
 * The colour of a pixel of an axial view of the bar volume on a square
 * canvas, by its column. The 100 voxels of a row fill the width of the
 * canvas and the view shows the middle slice. With nearest interpolation a
 * pixel takes the voxel that its centre lies in, with linear interpolation
 * the two voxels on either side of its centre, by distance.
 */
function axialBarColorOf(width, slices, interpolationType) {
  const pixelsPerVoxel = width / 100;

  return (x) => {
    const place = (x + 0.5) / pixelsPerVoxel - 0.5;
    const grey =
      interpolationType === InterpolationType.NEAREST
        ? barVolumeValue(Math.round(place), MIDDLE_SLICE, slices)
        : linearBarVolumeValue(place, MIDDLE_SLICE, slices);

    return [grey, grey, grey];
  };
}

/**
 * The pixels of a picture whose colour differs from the colour that
 * `colorOf(x, y)` gives by more than `levels` in a channel, or that are not
 * opaque, each with its place, its colour and the expected colour. It lists
 * at most ten.
 */
function pixelsOff(picture, colorOf, levels = 0) {
  const { data, width, height } = picture;
  const off = [];

  for (let y = 0; y < height && off.length < 10; y++) {
    for (let x = 0; x < width && off.length < 10; x++) {
      const index = (y * width + x) * 4;
      const color = Array.from(data.slice(index, index + 4));
      const expected = colorOf(x, y);

      if (
        color[3] !== 255 ||
        expected.some(
          (value, channel) => Math.abs(color[channel] - value) > levels
        )
      ) {
        off.push({ x, y, color, expected });
      }
    }
  }

  return off;
}

/** The pixels of the canvas of a viewport, as RGBA bytes. */
function readPicture(viewport) {
  const canvas = viewport.getCanvas();

  return canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * The picture of a viewport on the offscreen canvas of the rendering engine,
 * as a data URL. The engine draws the viewport at the bottom left of that
 * canvas and copies it from there to the canvas of the viewport.
 */
function offscreenPicture(renderingEngine, viewport) {
  const offscreenCanvas = renderingEngine
    .getOffscreenMultiRenderWindow(viewport.id)
    .getOpenGLRenderWindow()
    .getCanvas();
  const { width, height } = viewport.getCanvas();
  const picture = document.createElement('canvas');

  picture.width = width;
  picture.height = height;
  picture
    .getContext('2d')
    .drawImage(
      offscreenCanvas,
      0,
      offscreenCanvas.height - height,
      width,
      height,
      0,
      0,
      width,
      height
    );

  return picture.toDataURL('image/png');
}

describe('Volume Viewport GPU -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  describe('Volume Viewport Sagittal PolyData --- ', function () {
    it('should successfully render a sphere source', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.SAGITTAL,
        viewportType: ViewportType.VOLUME_3D,
        width: 500,
        height: 500,
      });

      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              sphere_default_sagittal,
              'sphere_default_sagittal'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        const sphereSource = vtkSphereSource.newInstance({
          center: [0, 0, 0],
          radius: 100,
          phiResolution: 10,
          thetaResolution: 10,
        });
        const actor = vtkActor.newInstance();
        const mapper = vtkMapper.newInstance();

        actor.getProperty().setEdgeVisibility(true);

        mapper.setInputConnection(sphereSource.getOutputPort());
        actor.setMapper(mapper);

        const { viewPlaneNormal, viewUp } =
          CONSTANTS.MPR_CAMERA_VALUES.sagittal;

        vp.getRenderer().addActor(actor);
        vp.setViewState({ viewPlaneNormal, viewUp });
        vp.resetViewState();
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Volume Viewport Axial Nearest Neighbor and Linear Interpolation --- ', function () {
    it('should successfully load a volume: nearest', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportType: ViewportType.PLANAR,
        width: 500,
        height: 500,
      });

      const slices = 11;
      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          const picture = readPicture(vp);

          expect(
            pixelsOff(
              picture,
              axialBarColorOf(picture.width, slices, InterpolationType.NEAREST)
            )
          ).toEqual([]);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
              vp.render();
            });
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportType: ViewportType.PLANAR,
      });

      const slices = 10;
      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          const picture = readPicture(vp);

          expect(
            pixelsOff(
              picture,
              axialBarColorOf(picture.width, slices, InterpolationType.LINEAR),
              LINEAR_ROUNDING_LEVELS
            )
          ).toEqual([]);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]);
            vp.render();
          });
      } catch (e) {
        done.fail(e);
      }
    });
  }, 2000);

  describe('Volume Viewport Sagittal Nearest Neighbor and Linear Interpolation --- ', function () {
    it('should successfully load a volume: nearest', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.SAGITTAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_0_sagittal_nearest,
              'volumeURI_100_100_10_1_1_1_0_sagittal_nearest'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.SAGITTAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_0_sagittal_linear,
              'volumeURI_100_100_10_1_1_1_0_sagittal_linear'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]);
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Volume Viewport Sagittal Coronal Neighbor and Linear Interpolation --- ', function () {
    it('should successfully load a volume: nearest', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_0_coronal_nearest,
              'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        // we don't set imageIds as we are mocking the imageVolume to
        // return the volume immediately
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_0_coronal_linear,
              'volumeURI_100_100_10_1_1_1_0_coronal_linear'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]);
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Rendering API', function () {
    it('should successfully use setVolumesForViewports API to load image', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_0_coronal_nearest,
              'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should be able to filter viewports based on volumeId', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });

      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const viewport = renderingEngine.getViewport(viewportId);
        const viewports = utilities.getViewportsWithVolumeId(
          volumeId,
          renderingEngine.id
        );

        expect(viewports.length).toBe(1);
        expect(viewports[0]).toBe(viewport);

        done();
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
            });
            renderingEngine.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully use renderViewports API to load image', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const vp = renderingEngine.getViewport(viewportId);
      const canvas = vp.getCanvas();

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_0_coronal_nearest,
              'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully use renderViewport API to load image', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_0_coronal_nearest,
              'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully debug the offscreen canvas', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        const offScreen = offscreenPicture(renderingEngine, vp);
        expect(offScreen).toEqual(image);
        done();
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully render frameOfReference', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_0_coronal_nearest,
              'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
              const viewportIds = renderingEngine
                .getViewports()
                .filter(
                  (viewport) =>
                    viewport.getFrameOfReferenceUID() ===
                    VOLUME_FRAME_OF_REFERENCE
                )
                .map((viewport) => viewport.id);

              expect(viewportIds).toEqual([viewportId]);
              renderingEngine.renderViewports(viewportIds);
            });
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Volume Viewport Color images Neighbor and Linear Interpolation --- ', function () {
    it('should successfully load a color volume: nearest', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
        rgb: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_1_color_coronal_nearest,
              'volumeURI_100_100_10_1_1_1_1_color_coronal_nearest'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.NEAREST,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
        rgb: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        setTimeout(() => {
          testUtils
            .compareImages(
              image,
              volumeURI_100_100_10_1_1_1_1_color_coronal_linear,
              'volumeURI_100_100_10_1_1_1_1_color_coronal_linear'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.LINEAR,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportType: ViewportType.PLANAR,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
        rgb: 1,
      });
      const vp = renderingEngine.getViewport(viewportId);
      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expect(
            pixelsOff(readPicture(vp), () => testUtils.colors[MIDDLE_SLICE])
          ).toEqual([]);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetPresentation({
                interpolationType: InterpolationType.LINEAR,
              });
            });
            vp.render();
          })
          .catch((e) => {
            done(e);
          });
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
