import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

// poly data
import * as sphere_default_sagittal from './groundTruth/sphere_default_sagittal.png';

// nearest neighbor interpolation
import * as volumeURI_100_100_10_1_1_1_0_axial_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_0_axial_nearest.png';
import * as volumeURI_100_100_10_1_1_1_0_sagittal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_0_sagittal_nearest.png';
import * as volumeURI_100_100_10_1_1_1_0_coronal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_0_coronal_nearest.png';
import * as volumeURI_100_100_10_1_1_1_1_color_coronal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_1_color_coronal_nearest.png';

// linear interpolation
import * as volumeURI_100_100_10_1_1_1_0_axial_linear from './groundTruth/volumeURI_100_100_10_1_1_1_0_axial_linear.png';
import * as volumeURI_100_100_10_1_1_1_0_sagittal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_0_sagittal_linear.png';
import * as volumeURI_100_100_10_1_1_1_0_coronal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_0_coronal_linear.png';
import * as volumeURI_100_100_10_1_1_1_1_color_coronal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_1_color_coronal_linear.png';
import * as volumeURI_100_100_10_1_1_1_1_color_axial_linear from './groundTruth/volumeURI_100_100_10_1_1_1_1_color_axial_linear.png';

const { imageLoader, Enums, volumeLoader, utilities, setVolumesForViewports } =
  cornerstone3D;

const { ViewportType, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'VIEWPORT';

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

        const nonVolumeActors = [];
        nonVolumeActors.push({ uid: 'spherePolyData', actor });

        vp.setActors(nonVolumeActors);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });
  });

  xdescribe('Volume Viewport Axial Nearest Neighbor and Linear Interpolation --- ', function () {
    it('should successfully load a volume: nearest', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportType: ViewportType.ORTHOGRAPHIC,
        width: 500,
        height: 500,
      });

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 11,
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
              volumeURI_100_100_10_1_1_1_0_axial_nearest,
              'volumeURI_100_100_10_1_1_1_0_axial_nearest'
            )
            .then(done, done.fail);
        }, 1000);
      });

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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
              volumeURI_100_100_10_1_1_1_0_axial_linear,
              'volumeURI_100_100_10_1_1_1_0_axial_linear'
            )
            .then(done, done.fail);
        }, 200);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId]
            );
            vp.render();
          });
      } catch (e) {
        done.fail(e);
      }
    });
  }, 2000);

  xdescribe('Volume Viewport Sagittal Nearest Neighbor and Linear Interpolation --- ', function () {
    it('should successfully load a volume: nearest', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.SAGITTAL,
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId]
            );
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

  xdescribe('Volume Viewport Sagittal Coronal Neighbor and Linear Interpolation --- ', function () {
    it('should successfully load a volume: nearest', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        // we don't set imageIds as we are mocking the imageVolume to
        // return the volume immediately
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId]
            );
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

  xdescribe('Rendering API', function () {
    it('should successfully use setVolumesForViewports API to load image', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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
        const offScreen = renderingEngine._debugRender();
        expect(offScreen).toEqual(image);
        done();
      });

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            ).then(() => {
              renderingEngine.renderFrameOfReference(
                'Volume_Frame_Of_Reference'
              );
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

  xdescribe('Volume Viewport Color images Neighbor and Linear Interpolation --- ', function () {
    it('should successfully load a color volume: nearest', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportId,
        orientation: Enums.OrientationAxis.CORONAL,
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) => {
        volumeActor.getProperty().setInterpolationTypeToNearest();
      };

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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

      const callback = ({ volumeActor }) => {
        volumeActor.getProperty().setInterpolationTypeToLinear();
      };

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
        viewportType: ViewportType.ORTHOGRAPHIC,
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
              volumeURI_100_100_10_1_1_1_1_color_axial_linear,
              'volumeURI_100_100_10_1_1_1_1_color_axial_linear'
            )
            .then(done, done.fail);
        }, 200);
      });

      const callback = ({ volumeActor }) => {
        volumeActor.getProperty().setInterpolationTypeToLinear();
      };

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
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
