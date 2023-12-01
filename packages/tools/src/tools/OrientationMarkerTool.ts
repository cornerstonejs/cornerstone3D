import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';

import { BaseTool } from './base';
import { getRenderingEngines } from '@cornerstonejs/core';
import { filterViewportsWithToolEnabled } from '../utilities/viewportFilters';

const OverlayMarkerType = {
  ANNOTATED_CUBE: 1,
  AXES: 2,
  CUSTOM: 3,
};

/**
 * The OrientationMarker is a tool that includes an orientation marker in viewports
 * when activated
 */
class OrientationMarkerTool extends BaseTool {
  static toolName;
  static CUBE = 1;
  static AXIS = 2;
  static VTPFILE = 3;
  orientationMarkers;
  polyDataURL;

  static OVERLAY_MARKER_TYPES = OverlayMarkerType;

  configuration_invalidated = true;

  constructor(
    toolProps = {},
    defaultToolProps = {
      configuration: {
        orientationWidget: {
          enabled: true,
          viewportCorner: vtkOrientationMarkerWidget.Corners.BOTTOM_RIGHT,
          viewportSize: 0.15,
          minPixelSize: 100,
          maxPixelSize: 300,
        },
        overlayMarkerType:
          OrientationMarkerTool.OVERLAY_MARKER_TYPES.ANNOTATED_CUBE,
        overlayConfiguration: {
          [OrientationMarkerTool.OVERLAY_MARKER_TYPES.ANNOTATED_CUBE]: {
            faceProperties: {
              xPlus: { text: 'R', faceColor: '#ffff00', faceRotation: 90 },
              xMinus: { text: 'L', faceColor: '#ffff00', faceRotation: 270 },
              yPlus: {
                text: 'P',
                faceColor: '#00ffff',
                fontColor: 'white',
                faceRotation: 180,
              },
              yMinus: { text: 'A', faceColor: '#00ffff', fontColor: 'white' },
              zPlus: { text: 'S' },
              zMinus: { text: 'I' },
            },
            defaultStyle: {
              fontStyle: 'bold',
              fontFamily: 'Arial',
              fontColor: 'black',
              fontSizeScale: (res) => res / 2,
              faceColor: '#0000ff',
              edgeThickness: 0.1,
              edgeColor: 'black',
              resolution: 400,
            },
          },
          [OrientationMarkerTool.OVERLAY_MARKER_TYPES.AXES]: {},
          [OrientationMarkerTool.OVERLAY_MARKER_TYPES.CUSTOM]: {
            polyDataURL:
              'https://raw.githubusercontent.com/Slicer/Slicer/80ad0a04dacf134754459557bf2638c63f3d1d1b/Base/Logic/Resources/OrientationMarkers/Human.vtp',
          },
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.orientationMarkers = {};
    this.configuration_invalidated = true;
  }

  onSetToolEnabled = (): void => {
    this.initViewports();
    this.configuration_invalidated = true;
  };

  onSetToolActive = (): void => {
    this.initViewports();
  };

  onSetToolDisabled = (): void => {
    this.cleanUpData();
  };

  private cleanUpData() {
    const renderingEngines = getRenderingEngines();
    const renderingEngine = renderingEngines[0];
    const viewports = renderingEngine.getViewports();

    viewports.forEach((viewport) => {
      const orientationMarker = this.orientationMarkers[viewport.id];
      if (!orientationMarker) {
        return;
      }

      const { actor, orientationWidget } = orientationMarker;
      orientationWidget?.setEnabled(false);
      orientationWidget?.delete();
      actor?.delete();

      const renderWindow = viewport
        .getRenderingEngine()
        .offscreenMultiRenderWindow.getRenderWindow();
      renderWindow.render();
      viewport.getRenderingEngine().render();

      delete this.orientationMarkers[viewport.id];
    });
  }

  private initViewports() {
    const renderingEngines = getRenderingEngines();
    const renderingEngine = renderingEngines[0];

    if (!renderingEngine) {
      return;
    }

    let viewports = renderingEngine.getViewports();
    viewports = filterViewportsWithToolEnabled(viewports, this.getToolName());
    viewports.forEach((viewport) => this.addAxisActorInViewport(viewport));
  }

  async addAxisActorInViewport(viewport) {
    const viewportId = viewport.id;
    const type = this.configuration.overlayMarkerType;

    const overlayConfiguration = this.configuration.overlayConfiguration[type];

    if (this.orientationMarkers[viewportId]) {
      const { actor, orientationWidget } = this.orientationMarkers[viewportId];
      // remove the previous one
      viewport.getRenderer().removeActor(actor);
      orientationWidget.setEnabled(false);
    }

    let actor;
    if (type === 1) {
      actor = this.createAnnotationCube(overlayConfiguration);
    } else if (type === 2) {
      actor = vtkAxesActor.newInstance();
    } else if (type === 3) {
      actor = await this.createCustomActor();
    }

    const renderer = viewport.getRenderer();
    const renderWindow = viewport
      .getRenderingEngine()
      .offscreenMultiRenderWindow.getRenderWindow();

    const {
      enabled,
      viewportCorner,
      viewportSize,
      minPixelSize,
      maxPixelSize,
    } = this.configuration.orientationWidget;

    const orientationWidget = vtkOrientationMarkerWidget.newInstance({
      actor,
      interactor: renderWindow.getInteractor(),
      parentRenderer: renderer,
    });

    orientationWidget.setEnabled(enabled);
    orientationWidget.setViewportCorner(viewportCorner);
    orientationWidget.setViewportSize(viewportSize);
    orientationWidget.setMinPixelSize(minPixelSize);
    orientationWidget.setMaxPixelSize(maxPixelSize);

    orientationWidget.updateMarkerOrientation();
    this.orientationMarkers[viewportId] = {
      orientationWidget,
      actor,
    };
    renderWindow.render();
    viewport.getRenderingEngine().render();

    this.configuration_invalidated = false;
  }

  private async createCustomActor() {
    const url =
      this.configuration.overlayConfiguration[OverlayMarkerType.CUSTOM]
        .polyDataURL;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const vtpReader = vtkXMLPolyDataReader.newInstance();
    vtpReader.parseAsArrayBuffer(arrayBuffer);
    vtpReader.update();

    const polyData = vtkPolyData.newInstance();
    polyData.shallowCopy(vtpReader.getOutputData());
    polyData.getPointData().setActiveScalars('Color');
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setColorModeToDirectScalars();

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.rotateZ(180);
    return actor;
  }

  private createAnnotationCube(overlayConfiguration: any) {
    const actor = vtkAnnotatedCubeActor.newInstance();
    actor.setDefaultStyle({ ...overlayConfiguration.defaultStyle });
    actor.setXPlusFaceProperty({
      ...overlayConfiguration.faceProperties.xPlus,
    });
    actor.setXMinusFaceProperty({
      ...overlayConfiguration.faceProperties.xMinus,
    });
    actor.setYPlusFaceProperty({
      ...overlayConfiguration.faceProperties.yPlus,
    });
    actor.setYMinusFaceProperty({
      ...overlayConfiguration.faceProperties.yMinus,
    });
    actor.setZPlusFaceProperty({
      ...overlayConfiguration.faceProperties.zPlus,
    });
    actor.setZMinusFaceProperty({
      ...overlayConfiguration.faceProperties.zMinus,
    });
    return actor;
  }

  async createAnnotatedCubeActor() {
    const axes = vtkAnnotatedCubeActor.newInstance();
    const { faceProperties, defaultStyle } = this.configuration.annotatedCube;

    axes.setDefaultStyle(defaultStyle);

    Object.keys(faceProperties).forEach((key) => {
      const methodName = `set${
        key.charAt(0).toUpperCase() + key.slice(1)
      }FaceProperty`;
      axes[methodName](faceProperties[key]);
    });

    return axes;
  }
}

OrientationMarkerTool.toolName = 'OrientationMarker';
export default OrientationMarkerTool;
