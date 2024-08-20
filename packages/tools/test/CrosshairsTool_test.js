import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';

const {
  cache,
  RenderingEngine,
  utilities,
  metaData,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  imageLoader,
  getEnabledElement,
} = cornerstone3D;

const { transformWorldToIndex } = utilities;

const { Events, ViewportType } = Enums;

const { unregisterAllImageLoaders } = imageLoader;
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const {
  CrosshairsTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  annotation,
  synchronizers,
} = csTools3d;
const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

const { Events: csToolsEvents } = csToolsEnums;

const { fakeMetaDataProvider, fakeVolumeLoader, createNormalizedMouseEvent } =
  testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportIds = ['VIEWPORT1', 'VIEWPORT2', 'VIEWPORT3'];

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
});

describe('Cornerstone Tools: ', () => {
  let renderingEngine;

  beforeEach(() => {
    const tools = [CrosshairsTool];
    const toolConfigurations = {
      [CrosshairsTool.toolName]: { volumeId: volumeId },
    };
    const toolActivations = {
      [CrosshairsTool.toolName]: { bindings: [{ mouseButton: 1 }] },
    };
    const testEnvironment = testUtils.setupTestEnvironment({
      viewportIds,
      toolGroupIds: ['crosshairs'],
      renderingEngineId,
      tools,
      toolConfigurations,
      toolActivations,
    });

    renderingEngine = testEnvironment.renderingEngine;
  });

  afterEach(() => {
    testUtils.cleanupTestEnvironment();
  });

  it('Should successfully initialize the crosshairs to the middle of the image and canvas', (done) => {
    const elements = testUtils.createViewports(
      renderingEngine,
      [
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          width: 512,
          height: 128,
          viewportId: viewportIds[0],
          background: [1, 0, 1],
          orientation: Enums.OrientationAxis.AXIAL,
        },
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          width: 512,
          height: 128,
          viewportId: viewportIds[1],
          background: [1, 0, 1],
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          width: 512,
          height: 128,
          viewportId: viewportIds[2],
          background: [1, 0, 1],
          orientation: Enums.OrientationAxis.CORONAL,
        },
      ],
      3
    );

    let canvasesRendered = 0;
    let annotationRendered = 0;

    const crosshairsEventHandler = () => {
      annotationRendered += 1;

      if (annotationRendered !== 3) {
        return;
      }

      const vp = renderingEngine.getViewport(viewportIds[0]);
      const { imageData } = vp.getImageData();

      const indexMiddle = imageData
        .getDimensions()
        .map((s) => Math.floor(s / 2));

      const imageCenterWorld = imageData.indexToWorld(indexMiddle);

      const crosshairAnnotations = annotation.state.getAnnotations(
        CrosshairsTool.toolName,
        elements[0]
      );

      expect(crosshairAnnotations).toBeDefined();
      expect(crosshairAnnotations.length).toBe(3);

      crosshairAnnotations.forEach((crosshairAnnotation) => {
        expect(crosshairAnnotation.metadata.cameraFocalPoint).toBeDefined();
        crosshairAnnotation.data.handles.toolCenter.forEach((p, i) => {
          expect(p).toBeCloseTo(imageCenterWorld[i], 3);
        });
        annotation.state.removeAnnotation(crosshairAnnotation.annotationUID);
      });

      done();
    };

    const renderEventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 3) {
        return;
      }

      elements.forEach((element) => {
        element.addEventListener(
          csToolsEvents.ANNOTATION_RENDERED,
          crosshairsEventHandler
        );
      });
    };

    elements.forEach((element) => {
      element.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    });

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          viewportIds
        );
        renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  // Todo: see what is wrong here
  // it('Should successfully jump to move the crosshairs', (done) => {
  //   const elements = testUtils.createViewports(
  //     renderingEngine,
  //     [
  //       {
  //         viewportType: ViewportType.ORTHOGRAPHIC,
  //         width: 512,
  //         height: 128,
  //         viewportId: viewportIds[0],
  //         background: [1, 0, 1],
  //         orientation: Enums.OrientationAxis.AXIAL,
  //       },
  //       {
  //         viewportType: ViewportType.ORTHOGRAPHIC,
  //         width: 512,
  //         height: 128,
  //         viewportId: viewportIds[1],
  //         background: [1, 0, 1],
  //         orientation: Enums.OrientationAxis.SAGITTAL,
  //       },
  //       {
  //         viewportType: ViewportType.ORTHOGRAPHIC,
  //         width: 512,
  //         height: 128,
  //         viewportId: viewportIds[2],
  //         background: [1, 0, 1],
  //         orientation: Enums.OrientationAxis.CORONAL,
  //       },
  //     ],
  //     3
  //   );

  //   let canvasesRendered = 0;
  //   let annotationRendered = 0;
  //   let p1;

  //   const crosshairsEventHandler = () => {
  //     annotationRendered += 1;

  //     if (annotationRendered !== 3) {
  //       return;
  //     }

  //     const crosshairAnnotationsAfter = annotation.state.getAnnotations(
  //       CrosshairsTool.toolName,
  //       elements[0]
  //     );
  //     const axialCanvasToolCenter =
  //       crosshairAnnotationsAfter[0].data.handles.toolCenter;

  //     crosshairAnnotationsAfter.forEach((crosshairAnnotation) => {
  //       expect(crosshairAnnotation.metadata.cameraFocalPoint).toBeDefined();
  //       crosshairAnnotation.data.handles.toolCenter.forEach((p, i) => {
  //         expect(p).toBeCloseTo(p1[i], 3);
  //         expect(p).toBeCloseTo(axialCanvasToolCenter[i], 3);
  //         annotation.state.removeAnnotation(crosshairAnnotation.annotationUID);
  //       });
  //     });
  //     done();
  //   };

  //   const renderEventHandler = () => {
  //     canvasesRendered += 1;

  //     if (canvasesRendered !== 3) {
  //       return;
  //     }

  //     elements.forEach((element) => {
  //       element.addEventListener(
  //         csToolsEvents.ANNOTATION_RENDERED,
  //         crosshairsEventHandler
  //       );
  //     });

  //     // Perform the jump action
  //     const vp1 = renderingEngine.getViewport(viewportIds[0]);
  //     const { imageData } = vp1.getImageData();

  //     const crosshairAnnotations = annotation.state.getAnnotations(
  //       CrosshairsTool.toolName,
  //       elements[0]
  //     );

  //     const currentWorldLocation =
  //       crosshairAnnotations[0].data.handles.toolCenter;
  //     const currentIndexLocation = transformWorldToIndex(
  //       imageData,
  //       currentWorldLocation
  //     );

  //     const jumpIndexLocation = [
  //       currentIndexLocation[0] + 20,
  //       currentIndexLocation[1] + 20,
  //       currentIndexLocation[2],
  //     ];

  //     const {
  //       pageX: pageX1,
  //       pageY: pageY1,
  //       clientX: clientX1,
  //       clientY: clientY1,
  //       worldCoord: worldCoord1,
  //     } = createNormalizedMouseEvent(
  //       imageData,
  //       jumpIndexLocation,
  //       elements[0],
  //       vp1
  //     );
  //     p1 = worldCoord1;

  //     const mouseDownEvt = new MouseEvent('mousedown', {
  //       target: elements[0],
  //       buttons: 1,
  //       pageX: pageX1,
  //       pageY: pageY1,
  //       clientX: clientX1,
  //       clientY: clientY1,
  //     });

  //     const mouseUpEvt = new MouseEvent('mouseup');

  //     performMouseDownAndUp(elements[0], mouseDownEvt, mouseUpEvt);
  //   };

  //   elements.forEach((element) => {
  //     element.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
  //   });

  //   try {
  //     createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
  //       setVolumesForViewports(
  //         renderingEngine,
  //         [{ volumeId: volumeId }],
  //         viewportIds
  //       );
  //       renderingEngine.render();
  //     });
  //   } catch (e) {
  //     done.fail(e);
  //   }
  // });

  it('Should successfully drag and move the crosshairs', (done) => {
    const elements = testUtils.createViewports(
      renderingEngine,
      [
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          width: 512,
          height: 128,
          viewportId: viewportIds[0],
          background: [1, 0, 1],
          orientation: Enums.OrientationAxis.AXIAL,
        },
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          width: 512,
          height: 128,
          viewportId: viewportIds[1],
          background: [1, 0, 1],
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
        {
          viewportType: ViewportType.ORTHOGRAPHIC,
          width: 512,
          height: 128,
          viewportId: viewportIds[2],
          background: [1, 0, 1],
          orientation: Enums.OrientationAxis.CORONAL,
        },
      ],
      3
    );

    let canvasesRendered = 0;
    let annotationRendered = 0;

    const crosshairsEventHandler = () => {
      annotationRendered += 1;

      if (annotationRendered !== 3) {
        return;
      }

      const vp1 = renderingEngine.getViewport(viewportIds[0]);
      const { imageData } = vp1.getImageData();

      const crosshairAnnotations = annotation.state.getAnnotations(
        CrosshairsTool.toolName,
        elements[0]
      );

      const currentWorldLocation =
        crosshairAnnotations[0].data.handles.toolCenter;
      const currentIndexLocation = transformWorldToIndex(
        imageData,
        currentWorldLocation
      );

      const jumpIndexLocation = [
        currentIndexLocation[0] - 20,
        currentIndexLocation[1] - 20,
        currentIndexLocation[2],
      ];

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      } = createNormalizedMouseEvent(
        imageData,
        currentIndexLocation,
        elements[0],
        vp1
      );

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(
        imageData,
        jumpIndexLocation,
        elements[0],
        vp1
      );

      let evt = new MouseEvent('mousedown', {
        target: elements[0],
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });
      elements[0].dispatchEvent(evt);

      evt = new MouseEvent('mousemove', {
        target: elements[0],
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      setTimeout(() => {
        const crosshairAnnotationsAfter = annotation.state.getAnnotations(
          CrosshairsTool.toolName,
          elements[0]
        );
        crosshairAnnotationsAfter.forEach((crosshairAnnotation) => {
          expect(crosshairAnnotation.metadata.cameraFocalPoint).toBeDefined();
          crosshairAnnotation.data.handles.toolCenter.forEach((p, i) => {
            expect(p).toBeCloseTo(worldCoord2[i], 3);
            annotation.state.removeAnnotation(
              crosshairAnnotation.annotationUID
            );
          });
        });
        done();
      }, 50);
    };

    const renderEventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 3) {
        return;
      }

      elements.forEach((element) => {
        element.addEventListener(
          csToolsEvents.ANNOTATION_RENDERED,
          crosshairsEventHandler
        );
      });
    };

    elements.forEach((element) => {
      element.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    });

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          viewportIds
        );
        renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
