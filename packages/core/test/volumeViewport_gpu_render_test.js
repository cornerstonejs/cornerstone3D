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
      this.renderingEngine?.destroy();
    });

    it('should successfully render a sphere source', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.SAGITTAL,
        300,
        300,
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
});
