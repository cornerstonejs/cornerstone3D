import { BaseTool } from './base';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import { getRenderingEngines } from '@cornerstonejs/core';
import { filterViewportsWithToolEnabled } from '../utilities/viewportFilters';

async function getXML(url) {
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
  return { actor, mapper };
}

/**
 * The OrientationMarker is a tool that includes an orientation marker in viewports
 * when activated
 */
class OrientationMarkerTool extends BaseTool {
  static toolName;
  orientationMarkers;

  constructor(
    toolProps = {},
    defaultToolProps = {
      configuration: {
        overlayMarkerType: 1,
        polyDataURL: '',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.orientationMarkers = {};
  }

  initViewports() {
    const renderingEngines = getRenderingEngines();
    const renderingEngine = renderingEngines[0];

    // Todo: handle this case where it is too soon to get the rendering engine
    if (!renderingEngine) {
      return;
    }

    let viewports = renderingEngine.getViewports();
    viewports = filterViewportsWithToolEnabled(viewports, this.getToolName());
    console.debug('🚀 ~ viewports:', viewports);
    viewports.forEach((viewport) => this.addAxisActorInViewport(viewport));
  }

  onSetToolEnabled = (): void => {
    this.initViewports();
  };

  onSetToolActive = (): void => {
    this.initViewports();
  };

  async addAxisActorInViewport(viewport) {
    const viewportId = viewport.id;
    const type = this.configuration.overlayMarkerType;
    if (!this.orientationMarkers[viewportId]) {
      let axes;
      if (type === 1) {
        axes = vtkAnnotatedCubeActor.newInstance();
        axes.setDefaultStyle({
          fontStyle: 'bold',
          fontFamily: 'Arial',
          fontColor: 'black',
          fontSizeScale: (res) => res / 2,
          faceColor: '#0000ff',
          edgeThickness: 0.1,
          edgeColor: 'black',
          resolution: 400,
        });
        axes.setXPlusFaceProperty({
          text: 'R',
          faceColor: '#ffff00',
          faceRotation: 90,
          //fontStyle: 'italic',
        });
        axes.setXMinusFaceProperty({
          text: 'L',
          faceColor: '#ffff00',
          faceRotation: 270,
          //fontStyle: 'italic',
        });
        axes.setYPlusFaceProperty({
          text: 'P',
          faceColor: '#00ffff',
          fontColor: 'white',
          faceRotation: 180,
        });
        axes.setYMinusFaceProperty({
          text: 'A',
          faceColor: '#00ffff',
          fontColor: 'white',
        });
        axes.setZPlusFaceProperty({
          text: 'S',
        });
        axes.setZMinusFaceProperty({
          text: 'I',
        });
      } else if (type === 2) {
        axes = vtkAxesActor.newInstance();
      } else if (type === 3) {
        const { actor } = await getXML(this.configuration.polyDataURL);
        axes = actor;
        axes.rotateZ(180);
      }

      const renderer = viewport.getRenderer();
      const renderWindow = viewport
        .getRenderingEngine()
        .offscreenMultiRenderWindow.getRenderWindow();
      // create orientation widget
      const orientationWidget = vtkOrientationMarkerWidget.newInstance({
        actor: axes,
        interactor: renderWindow.getInteractor(),
        parentRenderer: renderer,
      });
      orientationWidget.setEnabled(true);
      orientationWidget.setViewportCorner(
        vtkOrientationMarkerWidget.Corners.BOTTOM_RIGHT
      );
      orientationWidget.setViewportSize(0.15);
      orientationWidget.setMinPixelSize(100);
      orientationWidget.setMaxPixelSize(300);

      orientationWidget.updateMarkerOrientation();
      this.orientationMarkers[viewportId] = {
        orientationWidget,
        actor: axes,
      };
      renderer.resetCamera();
      renderWindow.render();
    }
  }
}

OrientationMarkerTool.toolName = 'OrientationMarker';
export default OrientationMarkerTool;
