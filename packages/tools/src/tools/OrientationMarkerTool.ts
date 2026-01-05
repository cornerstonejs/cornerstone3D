import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import { mat4, vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from './base';
import {
  Enums,
  eventTarget,
  getEnabledElement,
  getEnabledElementByIds,
  getRenderingEngines,
} from '@cornerstonejs/core';
import { filterViewportsWithToolEnabled } from '../utilities/viewportFilters';
import {
  getToolGroup,
  getToolGroupForViewport,
} from '../store/ToolGroupManager';
import { Events } from '../enums';
import { ToolModes } from '../enums';
import type { EventTypes } from '../types';

enum OverlayMarkerType {
  ANNOTATED_CUBE = 1,
  AXES = 2,
  CUSTOM = 3,
}

type FaceProperty = {
  text?: string;
  faceColor?: string;
  fontColor?: string;
  faceRotation?: number;
};

type AnnotatedCubeConfig = {
  faceProperties: {
    xPlus: FaceProperty;
    xMinus: FaceProperty;
    yPlus: FaceProperty;
    yMinus: FaceProperty;
    zPlus: FaceProperty;
    zMinus: FaceProperty;
  };
  defaultStyle: {
    fontStyle?: string;
    fontFamily?: string;
    fontColor?: string;
    fontSizeScale?: (res: number) => number;
    faceColor?: string;
    edgeThickness?: number;
    edgeColor?: string;
    resolution?: number;
  };
};

type OverlayConfiguration = {
  [OverlayMarkerType.ANNOTATED_CUBE]: AnnotatedCubeConfig;
  [OverlayMarkerType.AXES]: Record<string, never>;
  [OverlayMarkerType.CUSTOM]: {
    polyDataURL: string;
  };
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
  updatingOrientationMarker;
  polyDataURL;
  _resizeObservers = new Map();
  _isDraggingOrientationMarker = false;
  _draggingViewportId = null;
  mouseDragCallback: (evt: EventTypes.InteractionEventType) => void;

  static OVERLAY_MARKER_TYPES = OverlayMarkerType;

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
          interactive: true,
          rotateIncrementDegrees: 2,
        },
        overlayMarkerType:
          OrientationMarkerTool.OVERLAY_MARKER_TYPES.ANNOTATED_CUBE,
        overlayConfiguration: {
          [OrientationMarkerTool.OVERLAY_MARKER_TYPES.ANNOTATED_CUBE]: {
            faceProperties: {
              xPlus: { text: 'L', faceColor: '#ffff00', faceRotation: 90 },
              xMinus: { text: 'R', faceColor: '#ffff00', faceRotation: 270 },
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
          } as AnnotatedCubeConfig,
          [OrientationMarkerTool.OVERLAY_MARKER_TYPES.AXES]: {},
          [OrientationMarkerTool.OVERLAY_MARKER_TYPES.CUSTOM]: {
            polyDataURL:
              'https://raw.githubusercontent.com/Slicer/Slicer/80ad0a04dacf134754459557bf2638c63f3d1d1b/Base/Logic/Resources/OrientationMarkers/Human.vtp',
          },
        } as OverlayConfiguration,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.orientationMarkers = {};
    this.updatingOrientationMarker = {};
    this.mouseDragCallback = this._handleMouseDrag.bind(this);
  }

  onSetToolEnabled = (): void => {
    this.initViewports();
    this._subscribeToViewportEvents();
  };

  onSetToolActive = (): void => {
    this.initViewports();

    this._subscribeToViewportEvents();
  };

  onSetToolDisabled = (): void => {
    this.cleanUpData();
    this._unsubscribeToViewportNewVolumeSet();
    this._isDraggingOrientationMarker = false;
    this._draggingViewportId = null;
  };

  mouseUpCallback = (evt: EventTypes.InteractionEventType): void => {
    if (this._isDraggingOrientationMarker) {
      console.log('[OrientationMarker] mouseUpCallback - ending drag');
      this._isDraggingOrientationMarker = false;
      this._draggingViewportId = null;
    }
  };

  _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;

    return viewports;
  };

  resize = (viewportId) => {
    const orientationMarker = this.orientationMarkers[viewportId];
    if (!orientationMarker) {
      return;
    }

    const { orientationWidget } = orientationMarker;
    orientationWidget.updateViewport();
  };

  _unsubscribeToViewportNewVolumeSet() {
    const unsubscribe = () => {
      const viewportsInfo = this._getViewportsInfo();
      viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
        const { viewport } = getEnabledElementByIds(
          viewportId,
          renderingEngineId
        );
        const { element } = viewport;

        element.removeEventListener(
          Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
          this.initViewports.bind(this)
        );

        const resizeObserver = this._resizeObservers.get(viewportId);
        resizeObserver.unobserve(element);
      });
    };

    eventTarget.removeEventListener(Events.TOOLGROUP_VIEWPORT_ADDED, (evt) => {
      if (evt.detail.toolGroupId !== this.toolGroupId) {
        return;
      }
      unsubscribe();
      this.initViewports();
    });
  }

  _subscribeToViewportEvents() {
    const subscribeToElementResize = () => {
      const viewportsInfo = this._getViewportsInfo();
      viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
        const { viewport } = getEnabledElementByIds(
          viewportId,
          renderingEngineId
        );
        const { element } = viewport;
        this.initViewports();

        element.addEventListener(
          Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
          this.initViewports.bind(this)
        );

        const resizeObserver = new ResizeObserver(() => {
          // Todo: i wish there was a better way to do this
          setTimeout(() => {
            const element = getEnabledElementByIds(
              viewportId,
              renderingEngineId
            );
            if (!element) {
              return;
            }
            const { viewport } = element;
            this.resize(viewportId);
            viewport.render();
          }, 100);
        });

        resizeObserver.observe(element);

        this._resizeObservers.set(viewportId, resizeObserver);
      });
    };

    subscribeToElementResize();

    eventTarget.addEventListener(Events.TOOLGROUP_VIEWPORT_ADDED, (evt) => {
      if (evt.detail.toolGroupId !== this.toolGroupId) {
        return;
      }

      subscribeToElementResize();
      this.initViewports();
    });
  }

  private isPointInOrientationMarker(
    viewport,
    canvasPoint: Types.Point2
  ): boolean {
    const viewportId = viewport.id;
    const orientationMarker = this.orientationMarkers[viewportId];
    if (!orientationMarker) {
      return false;
    }

    const { orientationWidget } = orientationMarker;
    const viewportBounds = orientationWidget.computeViewport();
    if (!viewportBounds) {
      return false;
    }

    const [left, bottom, right, top] = viewportBounds;
    const element = viewport.element;
    const width = element.clientWidth;
    const height = element.clientHeight;

    // Convert canvas point to normalized viewport coordinates
    const viewportX = canvasPoint[0] / width;
    const viewportY = 1 - canvasPoint[1] / height; // Flip Y coordinate

    const isWithin =
      viewportX >= left &&
      viewportX <= right &&
      viewportY >= bottom &&
      viewportY <= top;

    //     console.log('[OrientationMarker] isPointInOrientationMarker', {
    //       canvasPoint,
    //       viewportX,
    //       viewportY,
    //       bounds: { left, bottom, right, top },
    //       isWithin,
    //     });

    return isWithin;
  }

  /**
   * Check if any enabled OrientationMarkerTool in the tool group has the mouse over its marker
   * This is called from the active tool's preMouseDownCallback to check before other tools consume the event
   */
  static checkOrientationMarkerInteraction(
    evt: EventTypes.InteractionEventType
  ): boolean {
    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return false;
    }

    const { viewport } = enabledElement;
    const { viewportId } = evt.detail;
    const toolGroup = getToolGroupForViewport(viewportId);

    if (!toolGroup) {
      return false;
    }

    // Check all enabled OrientationMarkerTool instances in this tool group
    const toolGroupToolNames = Object.keys(toolGroup.toolOptions);
    for (const toolName of toolGroupToolNames) {
      if (toolName === OrientationMarkerTool.toolName) {
        const toolInstance = toolGroup.getToolInstance(toolName);
        if (toolInstance && toolInstance.mode !== ToolModes.Disabled) {
          const { interactive } =
            toolInstance.configuration?.orientationWidget || {};

          if (interactive) {
            const canvasPoint = currentPoints.canvas;
            const isInMarker = toolInstance.isPointInOrientationMarker(
              viewport,
              canvasPoint
            );

            if (isInMarker) {
              console.log(
                '[OrientationMarker] checkOrientationMarkerInteraction - found interaction'
              );
              toolInstance._isDraggingOrientationMarker = true;
              toolInstance._draggingViewportId = viewport.id;
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  preMouseDownCallback = (evt: EventTypes.InteractionEventType): boolean => {
    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return false;
    }

    const { viewport } = enabledElement;
    const { interactive } = this.configuration.orientationWidget || {};

    if (!interactive) {
      return false;
    }

    const canvasPoint = currentPoints.canvas;
    const isInMarker = this.isPointInOrientationMarker(viewport, canvasPoint);

    if (isInMarker) {
      console.log('[OrientationMarker] preMouseDownCallback - consuming event');
      this._isDraggingOrientationMarker = true;
      this._draggingViewportId = viewport.id;
      return true; // Consume the event to prevent other tools from handling it
    }

    return false;
  };

  private _handleMouseDrag(evt: EventTypes.InteractionEventType): void {
    if (!this._isDraggingOrientationMarker) {
      return;
    }

    const { element, currentPoints, lastPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;

    if (viewport.id !== this._draggingViewportId) {
      return;
    }

    console.log('[OrientationMarker] _handleMouseDrag');

    const currentPointsCanvas = currentPoints.canvas;
    const lastPointsCanvas = lastPoints.canvas;
    const { rotateIncrementDegrees = 2 } =
      this.configuration.orientationWidget || {};

    const camera = viewport.getCamera();
    const width = element.clientWidth;
    const height = element.clientHeight;

    const deltaX = currentPointsCanvas[0] - lastPointsCanvas[0];
    const deltaY = currentPointsCanvas[1] - lastPointsCanvas[1];

    const normalizedDeltaX = deltaX / width;
    const normalizedDeltaY = deltaY / height;

    const center: Types.Point2 = [width * 0.5, height * 0.5];
    const centerWorld = viewport.canvasToWorld(center);

    const upVec = camera.viewUp;
    const atV = camera.viewPlaneNormal;
    const rightV: Types.Point3 = [0, 0, 0];
    const forwardV: Types.Point3 = [0, 0, 0];

    vtkMath.cross(upVec, atV, rightV);
    vtkMath.normalize(rightV);

    vtkMath.cross(atV, rightV, forwardV);
    vtkMath.normalize(forwardV);
    vtkMath.normalize(upVec);

    const angleX = -normalizedDeltaX * rotateIncrementDegrees * (Math.PI / 180);
    const angleY = normalizedDeltaY * rotateIncrementDegrees * (Math.PI / 180);

    console.log('[OrientationMarker] Applying rotation', {
      deltaX,
      deltaY,
      angleX: (angleX * 180) / Math.PI,
      angleY: (angleY * 180) / Math.PI,
    });

    this.rotateCamera(viewport, centerWorld, forwardV, angleX);
    this.rotateCamera(viewport, centerWorld, rightV, angleY);

    viewport.render();
  }

  private rotateCamera(viewport, centerWorld, axis, angle) {
    const vtkCamera = viewport.getVtkActiveCamera();
    const viewUp = vtkCamera.getViewUp();
    const focalPoint = vtkCamera.getFocalPoint();
    const position = vtkCamera.getPosition();

    const newPosition: Types.Point3 = [0, 0, 0];
    const newFocalPoint: Types.Point3 = [0, 0, 0];
    const newViewUp: Types.Point3 = [0, 0, 0];

    const transform = mat4.identity(new Float32Array(16));
    mat4.translate(transform, transform, centerWorld);
    mat4.rotate(transform, transform, angle, axis);
    mat4.translate(transform, transform, [
      -centerWorld[0],
      -centerWorld[1],
      -centerWorld[2],
    ]);
    vec3.transformMat4(newPosition, position, transform);
    vec3.transformMat4(newFocalPoint, focalPoint, transform);

    mat4.identity(transform);
    mat4.rotate(transform, transform, angle, axis);
    vec3.transformMat4(newViewUp, viewUp, transform);

    viewport.setCamera({
      position: newPosition,
      viewUp: newViewUp,
      focalPoint: newFocalPoint,
    });
  }

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
        .getOffscreenMultiRenderWindow(viewport.id)
        .getRenderWindow();
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

    viewports.forEach((viewport) => {
      const widget = viewport.getWidget(this.getToolName());
      // testing if widget has been deleted
      if (!widget || widget.isDeleted()) {
        this.addAxisActorInViewport(viewport);
      }
    });
  }

  async addAxisActorInViewport(viewport) {
    const viewportId = viewport.id;
    if (!this.updatingOrientationMarker[viewportId]) {
      this.updatingOrientationMarker[viewportId] = true;
      const type = this.configuration.overlayMarkerType;

      const overlayConfiguration =
        this.configuration.overlayConfiguration[type];

      if (this.orientationMarkers[viewportId]) {
        const { actor, orientationWidget } =
          this.orientationMarkers[viewportId];
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
        .getOffscreenMultiRenderWindow(viewportId)
        .getRenderWindow();

      const {
        enabled,
        viewportCorner,
        viewportSize,
        minPixelSize,
        maxPixelSize,
        interactive = true,
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
      viewport.addWidget(this.getToolName(), orientationWidget);

      // Interaction is now handled via cornerstone event system (preMouseDownCallback, mouseDragCallback)
      // No need for direct DOM event listeners

      renderWindow.render();
      viewport.getRenderingEngine().render();
      this.updatingOrientationMarker[viewportId] = false;
    }
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

  private createAnnotationCube(overlayConfiguration: AnnotatedCubeConfig) {
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
