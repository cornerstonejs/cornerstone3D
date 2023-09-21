import { getEnabledElement } from '@cornerstonejs/core';
import { BaseTool } from './base';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
/**
 * The OrientationMarker is a tool that includes an orientation marker in viewports
 * when activated
 */
class OrientationMarkerTool extends BaseTool {
  static toolName;
  _configuration: any;
  orientationMarkers;

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        invert: false,
        debounceIfNotLoaded: true,
        loop: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.orientationMarkers = {};
  }

  addAxisActorInViewport(viewport, type = 2): void {
    const viewportId = viewport.id;
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
          faceColor: '#00ff00',
          faceRotation: 180,
        });
        axes.setYMinusFaceProperty({
          text: 'A',
          faceColor: '#00ffff',
          fontColor: 'white',
        });
        axes.setZPlusFaceProperty({
          text: 'S',
          edgeColor: 'yellow',
        });
        axes.setZMinusFaceProperty({
          text: 'I',
          edgeThickness: 0,
        });
      } else if (type === 2) {
        axes = vtkAxesActor.newInstance();
      }

      const renderer = viewport.getRenderer();
      const renderWindow = viewport
        .getRenderingEngine()
        .offscreenMultiRenderWindow.getRenderWindow();
      // create orientation widget
      const orientationWidget = vtkOrientationMarkerWidget.newInstance({
        actor: axes,
        interactor: renderWindow.getInteractor(),
      });
      orientationWidget.setEnabled(true);
      orientationWidget.setViewportCorner(
        vtkOrientationMarkerWidget.Corners.TOP_RIGHT
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
    const actorEntries = viewport.getActors();
    const actorEntry = actorEntries.find(
      (actorEntry) => actorEntry.uid === 'orientationMarker'
    );

    if (!actorEntry) {
      viewport.addActor({
        uid: 'orientationMarker',
        actor: this.orientationMarkers[viewportId].actor,
      });
    }
  }

  onCameraModified = (evt) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement.viewport;
    this.addAxisActorInViewport(viewport);
  };
}

OrientationMarkerTool.toolName = 'OrientationMarker';
export default OrientationMarkerTool;
