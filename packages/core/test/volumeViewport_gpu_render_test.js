import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

// import { User } from ... doesn't work right now since we don't have named exports set up

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

const {
  cache,
  RenderingEngine,
  imageLoader,
  metaData,
  Enums,
  volumeLoader,
  utilities,
  setVolumesForViewports,
} = cornerstone3D;

const { ViewportType, Events } = Enums;

const { registerVolumeLoader } = volumeLoader;
const { unregisterAllImageLoaders } = imageLoader;

const { fakeMetaDataProvider, compareImages, fakeVolumeLoader } = testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

function createViewport(
  renderingEngine,
  orientation,
  width = 1000,
  height = 1000,
  type = ViewportType.ORTHOGRAPHIC
) {
  const element = document.createElement('div');

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type,
      element,
      defaultOptions: {
        orientation,
        background: [1, 0, 1], // pinkish background
      },
    },
  ]);
  return element;
}

describe('Volume Viewport GPU -- ', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Volume Viewport Sagittal PolyData --- ', function () {
    beforeEach(function () {
      cache.purgeCache();
      this.DOMElements = [];
      this.renderingEngine = new RenderingEngine(renderingEngineId);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();
    });

    it('should successfully render a sphere source', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.SAGITTAL,
        1000,
        1000,
        ViewportType.VOLUME_3D
      );
      this.DOMElements.push(element);

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          sphere_default_sagittal,
          'sphere_default_sagittal'
        ).then(done, done.fail);
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

  describe('Volume Viewport Axial Nearest Neighbor and Linear Interpolation --- ', function () {
    beforeEach(function () {
      cache.purgeCache();
      this.DOMElements = [];

      this.renderingEngine = new RenderingEngine(renderingEngineId);

      metaData.addProvider(fakeMetaDataProvider, 10000);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should successfully load a volume: nearest', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_axial_nearest,
          'volumeURI_100_100_10_1_1_1_0_axial_nearest'
        ).then(done, done.fail);
      });

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_axial_linear,
          'volumeURI_100_100_10_1_1_1_0_axial_linear'
        ).then(done, done.fail);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId]
            );
            vp.render();
          });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Volume Viewport Sagittal Nearest Neighbor and Linear Interpolation --- ', function () {
    beforeEach(function () {
      cache.purgeCache();

      this.DOMElements = [];
      this.renderingEngine = new RenderingEngine(renderingEngineId);

      metaData.addProvider(fakeMetaDataProvider, 10000);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();

      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should successfully load a volume: nearest', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.SAGITTAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_sagittal_nearest,
          'volumeURI_100_100_10_1_1_1_0_sagittal_nearest'
        ).then(done, done.fail);
      });

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.SAGITTAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_sagittal_linear,
          'volumeURI_100_100_10_1_1_1_0_sagittal_linear'
        ).then(done, done.fail);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Volume Viewport Sagittal Coronal Neighbor and Linear Interpolation --- ', function () {
    beforeEach(function () {
      cache.purgeCache();

      this.DOMElements = [];

      this.renderingEngine = new RenderingEngine(renderingEngineId);

      metaData.addProvider(fakeMetaDataProvider, 10000);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();

      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should successfully load a volume: nearest', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_coronal_nearest,
          'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
        ).then(done, done.fail);
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
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_coronal_linear,
          'volumeURI_100_100_10_1_1_1_0_coronal_linear'
        ).then(done, done.fail);
      });

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Rendering API', function () {
    beforeEach(function () {
      cache.purgeCache();

      this.DOMElements = [];
      this.renderingEngine = new RenderingEngine(renderingEngineId);

      metaData.addProvider(fakeMetaDataProvider, 10000);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should successfully use setVolumesForViewports API to load image', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_coronal_nearest,
          'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
        ).then(done, done.fail);
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
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should be able to filter viewports based on volumeId', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const viewport = this.renderingEngine.getViewport(viewportId);
        const viewports = utilities.getViewportsWithVolumeId(
          volumeId,
          this.renderingEngine.id
        );

        expect(viewports.length).toBe(1);
        expect(viewports[0]).toBe(viewport);

        done();
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
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            this.renderingEngine.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully use renderViewports API to load image', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const vp = this.renderingEngine.getViewport(viewportId);
      const canvas = vp.getCanvas();

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_coronal_nearest,
          'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
        ).then(done, done.fail);
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
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully use renderViewport API to load image', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_coronal_nearest,
          'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
        ).then(done, done.fail);
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
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully debug the offscreen canvas', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        const offScreen = this.renderingEngine._debugRender();
        expect(offScreen).toEqual(image);
        done();
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
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully render frameOfReference', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_coronal_nearest,
          'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
        ).then(done, done.fail);
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
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            ).then(() => {
              this.renderingEngine.renderFrameOfReference(
                'Volume_Frame_Of_Reference'
              );
            });
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Volume Viewport Color images Neighbor and Linear Interpolation --- ', function () {
    beforeEach(function () {
      cache.purgeCache();

      this.DOMElements = [];
      this.renderingEngine = new RenderingEngine(renderingEngineId);

      metaData.addProvider(fakeMetaDataProvider, 10000);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();

      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should successfully load a color volume: nearest', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_1';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_1_color_coronal_nearest,
          'volumeURI_100_100_10_1_1_1_1_color_coronal_nearest'
        ).then(done, done.fail);
      });

      const callback = ({ volumeActor }) => {
        volumeActor.getProperty().setIndependentComponents(false);
        volumeActor.getProperty().setInterpolationTypeToNearest();
      };

      try {
        // we don't set imageIds as we are mocking the imageVolume to
        // return the volume immediately
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully load a volume: linear', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_1';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_1_color_coronal_linear,
          'volumeURI_100_100_10_1_1_1_1_color_coronal_linear'
        ).then(done, done.fail);
      });

      const callback = ({ volumeActor }) => {
        volumeActor.getProperty().setIndependentComponents(false);
        volumeActor.getProperty().setInterpolationTypeToLinear();
      };

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId, callback }],
              [viewportId]
            );
            vp.render();
          })
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
