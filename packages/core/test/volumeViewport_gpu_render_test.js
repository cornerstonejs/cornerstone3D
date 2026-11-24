import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import { vec3 } from 'gl-matrix';

// poly data
import * as sphere_default_sagittal from './groundTruth/sphere_default_sagittal.png';

const { imageLoader, Enums, volumeLoader, utilities, CONSTANTS, cache } =
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

/** The background colour of the test viewports: magenta. */
const BACKGROUND_COLOR = [255, 0, 255];

/**
 * The length in millimetres of the longer side of a bar volume in the plane
 * of a sagittal or a coronal view: 100 voxels of 1 mm. It fills the width of
 * the canvas.
 */
const VOLUME_SIDE = 100;

/**
 * The colour of a voxel of a volume: its three components for a colour
 * volume, its value three times for a grey volume (the window of the bar
 * volumes is 0 to 255).
 */
function voxelColor(volume, i, j, k) {
  const value = volume.voxelManager.getAtIJK(i, j, k);

  return typeof value === 'number'
    ? [value, value, value]
    : Array.from(value).slice(0, 3);
}

/**
 * The colour of a volume at a continuous voxel index: the colour of the
 * nearest voxel, or the trilinear interpolation of the eight voxel centres
 * around the index. An index between the last voxel centre and the edge of
 * the volume takes the edge voxel, as the texture of the GPU does.
 */
function volumeColorAt(volume, index, interpolationType) {
  const { dimensions } = volume;
  const clamped = index.map((value, axis) =>
    Math.min(Math.max(value, 0), dimensions[axis] - 1)
  );

  if (interpolationType === InterpolationType.NEAREST) {
    return voxelColor(volume, ...clamped.map((value) => Math.round(value)));
  }

  const low = clamped.map(Math.floor);
  const weights = clamped.map((value, axis) => value - low[axis]);
  const color = [0, 0, 0];

  for (let corner = 0; corner < 8; corner++) {
    const offsets = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
    const weight = offsets.reduce(
      (product, offset, axis) =>
        product * (offset ? weights[axis] : 1 - weights[axis]),
      1
    );
    const ijk = low.map((value, axis) =>
      Math.min(value + offsets[axis], dimensions[axis] - 1)
    );

    voxelColor(volume, ...ijk).forEach((value, channel) => {
      color[channel] += weight * value;
    });
  }

  return color;
}

/**
 * The colour that a canvas pixel of a viewport should show of a volume, by
 * its column and row: the colour of the volume at the world point of the
 * centre of the pixel, or the background outside the volume. The view is a
 * parallel projection, so the world points of three pixel centres give the
 * others.
 */
function volumeColorOf(viewport, volume, interpolationType) {
  const origin = viewport.canvasToWorld([0.5, 0.5]);
  const right = vec3.subtract([], viewport.canvasToWorld([1.5, 0.5]), origin);
  const down = vec3.subtract([], viewport.canvasToWorld([0.5, 1.5]), origin);
  const { dimensions, imageData } = volume;

  return (x, y) => {
    const world = origin.map(
      (value, axis) => value + x * right[axis] + y * down[axis]
    );
    const index = utilities.transformWorldToIndexContinuous(imageData, world);

    if (
      index.some(
        (value, axis) => value < -0.5 || value > dimensions[axis] - 0.5
      )
    ) {
      return BACKGROUND_COLOR;
    }

    return volumeColorAt(volume, index, interpolationType);
  };
}

/**
 * Expects a view of a volume to show the volume fitted and centred: its
 * longer side in the plane fills the width of the canvas, the centre of the
 * canvas shows the centre of the volume in the plane, and the plane is
 * within half a voxel of the middle of the volume.
 */
function expectFittedAndCentred(viewport, volume) {
  const { width, height } = viewport.getCanvas();
  const across = vec3.subtract(
    [],
    viewport.canvasToWorld([width, height / 2]),
    viewport.canvasToWorld([0, height / 2])
  );
  const down = vec3.subtract(
    [],
    viewport.canvasToWorld([width / 2, height]),
    viewport.canvasToWorld([width / 2, 0])
  );
  const normal = vec3.normalize([], vec3.cross([], across, down));
  const offset = vec3.subtract(
    [],
    viewport.canvasToWorld([width / 2, height / 2]),
    utilities.transformIndexToWorld(
      volume.imageData,
      volume.dimensions.map((size) => (size - 1) / 2)
    )
  );

  expect(vec3.length(across)).toBeCloseTo(VOLUME_SIDE, 3);
  expect(vec3.dot(offset, across) / vec3.length(across)).toBeCloseTo(0, 3);
  expect(vec3.dot(offset, down) / vec3.length(down)).toBeCloseTo(0, 3);
  expect(Math.abs(vec3.dot(offset, normal))).toBeLessThanOrEqual(0.5 + 1e-6);
}

/**
 * Expects the canvas of a viewport to show a volume as its voxels give it:
 * fitted and centred, and each pixel the colour of the volume at the centre
 * of the pixel, exactly with nearest interpolation and within
 * `LINEAR_ROUNDING_LEVELS` with linear interpolation.
 */
function expectVolumePicture(viewport, volumeId, interpolationType) {
  const volume = cache.getVolume(volumeId);

  expectFittedAndCentred(viewport, volume);
  expect(
    pixelsOff(
      readPicture(viewport),
      volumeColorOf(viewport, volume, interpolationType),
      interpolationType === InterpolationType.NEAREST
        ? 0
        : LINEAR_ROUNDING_LEVELS
    )
  ).toEqual([]);
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
              vp.setDisplaySetAppearance({
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.NEAREST);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetAppearance({
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.LINEAR);
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.NEAREST);
          done();
        },
        { once: true }
      );

      try {
        // we don't set imageIds as we are mocking the imageVolume to
        // return the volume immediately
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetAppearance({
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.LINEAR);
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.NEAREST);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetAppearance({
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
              vp.setDisplaySetAppearance({
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.NEAREST);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetAppearance({
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.NEAREST);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetAppearance({
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
              vp.setDisplaySetAppearance({
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.NEAREST);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetAppearance({
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

      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.NEAREST);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetAppearance({
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
      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => {
          expectVolumePicture(vp, volumeId, InterpolationType.LINEAR);
          done();
        },
        { once: true }
      );

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            testUtils.setVolumesOnNextViewport(vp, [volumeId]).then(() => {
              vp.setDisplaySetAppearance({
                interpolationType: InterpolationType.LINEAR,
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
              vp.setDisplaySetAppearance({
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
