import { vec2, vec3 } from 'gl-matrix';
import {
  getEnabledElement,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  SegmentationRepresentations,
  ToolModes,
  Events as cstEvents,
} from '../enums';
import { ToolGroupManager, state } from '../store';
import { debounce } from '../utilities';
import { ToolModeChangedEventType } from '../types/EventTypes';
import { segmentation } from '..';
import { EventTypes, IToolGroup } from '../types';
import {
  AnnotationTool,
  AdvancedMagnifyTool,
  SegmentationDisplayTool,
} from './';
import { distanceToPoint } from '../utilities/math/point';

const MAGNIFY_CLASSNAME = 'advancedMagnifyTool';
const MAGNIFY_VIEWPORT_INITIAL_RADIUS = 125;

// TODO: find a better to identify segmentation actors
const isSegmentation = (actor) => actor.uid !== actor.referenceId;

export type AutoPanCallbackData = {
  points: {
    currentPosition: {
      canvas: Types.Point2;
      world: Types.Point3;
    };
    newPosition: {
      canvas: Types.Point2;
      world: Types.Point3;
    };
  };
  delta: {
    canvas: Types.Point2;
    world: Types.Point3;
  };
};

export type AutoPanCallback = (data: AutoPanCallbackData) => void;

class AdvancedMagnifyViewport {
  private _viewportId: string;
  private _sourceEnabledElement: Types.IEnabledElement;
  private _enabledElement: Types.IEnabledElement = null;
  private _sourceToolGroup: IToolGroup = null;
  private _magnifyToolGroup: IToolGroup = null;
  private _isViewportReady = false;
  private _radius = 0;
  private _resized = false;
  private _resizeViewportAsync: () => void;
  private _canAutoPan = false;
  private _autoPan: {
    enabled: boolean;
    padding: number;
    callback: AutoPanCallback;
  };
  public position: Types.Point2;
  public zoomFactor: number;
  public visible: boolean;

  constructor({
    magnifyViewportId,
    sourceEnabledElement,
    radius = MAGNIFY_VIEWPORT_INITIAL_RADIUS,
    position = [0, 0],
    zoomFactor,
    autoPan,
  }: {
    magnifyViewportId?: string;
    sourceEnabledElement: Types.IEnabledElement;
    radius?: number;
    position?: Types.Point2;
    zoomFactor: number;
    autoPan: {
      enabled: boolean;
      padding: number;
      callback: AutoPanCallback;
    };
  }) {
    // Private properties
    this._viewportId = magnifyViewportId ?? csUtils.uuidv4();
    this._sourceEnabledElement = sourceEnabledElement;
    this._autoPan = autoPan;

    // Public properties
    this.radius = radius;
    this.position = position;
    this.zoomFactor = zoomFactor;
    this.visible = true;

    this._browserMouseDownCallback = this._browserMouseDownCallback.bind(this);
    this._browserMouseUpCallback = this._browserMouseUpCallback.bind(this);
    this._handleToolModeChanged = this._handleToolModeChanged.bind(this);
    this._mouseDragCallback = this._mouseDragCallback.bind(this);
    this._resizeViewportAsync = <() => void>(
      debounce(this._resizeViewport.bind(this), 1)
    );

    this._initialize();
  }

  public get sourceEnabledElement() {
    return this._sourceEnabledElement;
  }

  public get viewportId() {
    return this._viewportId;
  }

  public get radius() {
    return this._radius;
  }

  public set radius(radius: number) {
    // Just moving the magnifying glass around may change its radius
    // by very small amount due to floating number precision
    if (Math.abs(this._radius - radius) > 0.00001) {
      this._radius = radius;
      this._resized = true;
    }
  }

  public update() {
    const { radius, position, visible } = this;
    const { viewport } = this._enabledElement;
    const { element } = viewport;
    const size = 2 * radius;
    const [x, y] = position;

    if (this._resized) {
      this._resizeViewportAsync();
      this._resized = false;
    }

    Object.assign(element.style, {
      display: visible ? 'block' : 'hidden',
      width: `${size}px`,
      height: `${size}px`,
      left: `${-radius}px`,
      top: `${-radius}px`,
      transform: `translate(${x}px, ${y}px)`,
    });

    if (this._isViewportReady) {
      this._syncViewports();
      viewport.render();
    }
  }

  public dispose() {
    const { viewport } = this._enabledElement;
    const { element } = viewport;
    const renderingEngine = viewport.getRenderingEngine();

    this._removeEventListeners(element);
    renderingEngine.disableElement(viewport.id);

    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  private _handleToolModeChanged(evt: ToolModeChangedEventType) {
    const { _magnifyToolGroup: magnifyToolGroup } = this;
    const { toolGroupId, toolName, mode, toolBindingsOptions } = evt.detail;

    if (this._sourceToolGroup?.id !== toolGroupId) {
      return;
    }

    switch (mode) {
      case ToolModes.Active:
        magnifyToolGroup.setToolActive(toolName, toolBindingsOptions);
        break;
      case ToolModes.Passive:
        magnifyToolGroup.setToolPassive(toolName);
        break;
      case ToolModes.Enabled:
        magnifyToolGroup.setToolEnabled(toolName);
        break;
      case ToolModes.Disabled:
        magnifyToolGroup.setToolDisabled(toolName);
        break;
      default:
        throw new Error(`Unknow tool mode (${mode})`);
    }
  }

  // Children elements need to inherit border-radius otherwise the canvas will
  // trigger events when moving/dragging/clicking on the corners outside of the
  // border (circle) region.
  private _inheritBorderRadius(magnifyElement) {
    const viewport = magnifyElement.querySelector('.viewport-element');
    const canvas = magnifyElement.querySelector('.cornerstone-canvas');

    viewport.style.borderRadius = 'inherit';
    canvas.style.borderRadius = 'inherit';
  }

  private _createViewportNode(): HTMLDivElement {
    const magnifyElement = document.createElement('div');
    const { radius } = this;
    const size = radius * 2;

    magnifyElement.classList.add(MAGNIFY_CLASSNAME);

    // Update the style and move the element out of the screen with "transforms"
    // to make it "invisible" and preserving its size because when "display" is
    // set to "none" both "offsetWidth" and "offsetHeight" returns zero. Another
    // way would be setting "visibility" to "hidden" but "transforms" is used
    // because it is already being updated when update() is called
    Object.assign(magnifyElement.style, {
      display: 'block',
      width: `${size}px`,
      height: `${size}px`,
      position: 'absolute',
      overflow: 'hidden',
      borderRadius: '50%',
      boxSizing: 'border-box',
      left: `${-radius}px`,
      top: `${-radius}px`,
      transform: `translate(-1000px, -1000px)`,
    });

    return magnifyElement;
  }

  private _convertZoomFactorToParallelScale(
    viewport,
    magnifyViewport,
    zoomFactor
  ) {
    const { parallelScale } = viewport.getCamera();
    const canvasRatio =
      magnifyViewport.canvas.offsetWidth / viewport.canvas.offsetWidth;

    return parallelScale * (1 / zoomFactor) * canvasRatio;
  }

  private _isStackViewport(
    viewport: Types.IViewport
  ): viewport is Types.IStackViewport {
    return 'setStack' in viewport;
  }

  private _isVolumeViewport(
    viewport: Types.IViewport
  ): viewport is Types.IVolumeViewport {
    return 'addVolumes' in viewport;
  }

  private _cloneToolGroups(
    sourceViewport: Types.IViewport,
    magnifyViewport: Types.IViewport
  ) {
    const sourceActors = sourceViewport.getActors();
    const magnifyToolGroupId = `${magnifyViewport.id}-toolGroup`;
    const sourceToolGroup = ToolGroupManager.getToolGroupForViewport(
      sourceViewport.id,
      sourceViewport.renderingEngineId
    );

    const magnifyToolGroup = sourceToolGroup.clone(
      magnifyToolGroupId,
      (toolName) => {
        const toolInstance = sourceToolGroup.getToolInstance(toolName);
        const isAnnotationTool =
          toolInstance instanceof AnnotationTool &&
          !(toolInstance instanceof AdvancedMagnifyTool);

        return (
          isAnnotationTool || toolName === SegmentationDisplayTool.toolName
        );
      }
    );

    magnifyToolGroup.addViewport(
      magnifyViewport.id,
      magnifyViewport.renderingEngineId
    );

    sourceActors.filter(isSegmentation).forEach((actor) => {
      segmentation.addSegmentationRepresentations(magnifyToolGroupId, [
        {
          segmentationId: actor.referenceId,
          type: SegmentationRepresentations.Labelmap,
        },
      ]);
    });

    return { sourceToolGroup, magnifyToolGroup };
  }

  private _cloneStack(
    sourceViewport: Types.IStackViewport,
    magnifyViewport: Types.IStackViewport
  ): void {
    const imageIds = sourceViewport.getImageIds();

    magnifyViewport.setStack(imageIds).then(() => {
      this._isViewportReady = true;
      this.update();
    });
  }

  private _cloneVolumes(
    sourceViewport: Types.IVolumeViewport,
    magnifyViewport: Types.IVolumeViewport
  ): Types.IVolumeViewport {
    const actors = sourceViewport.getActors();
    const volumeInputArray: Types.IVolumeInput[] = actors
      .filter((actor) => !isSegmentation(actor))
      .map((actor) => ({ volumeId: actor.uid }));

    magnifyViewport.setVolumes(volumeInputArray).then(() => {
      this._isViewportReady = true;
      this.update();
    });

    return magnifyViewport;
  }

  private _cloneViewport(sourceViewport, magnifyElement) {
    const { viewportId: magnifyViewportId } = this;
    const renderingEngine =
      sourceViewport.getRenderingEngine() as Types.IRenderingEngine;

    const { options: sourceViewportOptions } = sourceViewport;
    const viewportInput = {
      element: magnifyElement,
      viewportId: magnifyViewportId,
      type: sourceViewport.type,
      defaultOptions: { ...sourceViewportOptions },
    };

    renderingEngine.enableElement(viewportInput);

    const magnifyViewport = <Types.IViewport>(
      renderingEngine.getViewport(magnifyViewportId)
    );

    if (this._isStackViewport(sourceViewport)) {
      this._cloneStack(sourceViewport, magnifyViewport as Types.IStackViewport);
    } else if (this._isVolumeViewport(sourceViewport)) {
      this._cloneVolumes(
        sourceViewport,
        magnifyViewport as Types.IVolumeViewport
      );
    }

    // Prevent handling events outside of the magnifying glass because it has rounded border
    this._inheritBorderRadius(magnifyElement);

    const toolGroups = this._cloneToolGroups(sourceViewport, magnifyViewport);

    this._sourceToolGroup = toolGroups.sourceToolGroup;
    this._magnifyToolGroup = toolGroups.magnifyToolGroup;
  }

  private _cancelMouseEventCallback(evt): void {
    evt.stopPropagation();
    evt.preventDefault();
  }

  private _browserMouseUpCallback(evt) {
    const { element } = this._enabledElement.viewport;

    document.removeEventListener('mouseup', this._browserMouseUpCallback);

    // Restrict the scope of magnifying glass events again
    element.addEventListener('mouseup', this._cancelMouseEventCallback);
    element.addEventListener('mousemove', this._cancelMouseEventCallback);
  }

  private _browserMouseDownCallback(evt) {
    const { element } = this._enabledElement.viewport;

    // Enable auto pan only when user clicks inside of the magnifying glass
    // viewport otherwise it can move when interacting with annotations outside
    // of the magnifying glass or when trying to move/resize it.
    this._canAutoPan = !!evt.target?.closest('.advancedMagnifyTool');

    // Wait for the mouseup event to restrict the scope of magnifying glass events again
    document.addEventListener('mouseup', this._browserMouseUpCallback);

    // Allow mouseup and mousemove events to make it possible to manipulate the
    // tool when passing the mouse over the magnifying glass (dragging a handle).
    // Just relying on state.isInteractingWithTool does not work because there
    // is a 400ms delay to handle double click (see mouseDownListener) which
    // makes the magnifying glass unresponsive for that amount of time.
    element.removeEventListener('mouseup', this._cancelMouseEventCallback);
    element.removeEventListener('mousemove', this._cancelMouseEventCallback);
  }

  private _mouseDragCallback(evt: EventTypes.InteractionEventType) {
    if (!state.isInteractingWithTool) {
      return;
    }

    const { _autoPan: autoPan } = this;

    if (!autoPan.enabled || !this._canAutoPan) {
      return;
    }

    const { currentPoints } = evt.detail;
    const { viewport } = this._enabledElement;
    const { canvasToWorld } = viewport;
    const { canvas: canvasCurrent } = currentPoints;
    const { radius: magnifyRadius } = this;
    const canvasCenter: Types.Point2 = [magnifyRadius, magnifyRadius];
    const dist = distanceToPoint(canvasCenter, canvasCurrent);
    const maxDist = magnifyRadius - autoPan.padding;

    // No need to pan if it is not close to the border
    if (dist <= maxDist) {
      return;
    }

    const panDist = dist - maxDist;
    const canvasDeltaPos = vec2.sub(
      vec2.create(),
      canvasCurrent,
      canvasCenter
    ) as Types.Point2;

    vec2.normalize(canvasDeltaPos, canvasDeltaPos);
    vec2.scale(canvasDeltaPos, canvasDeltaPos, panDist);

    const newCanvasPosition = vec2.add(
      vec2.create(),
      this.position,
      canvasDeltaPos
    ) as Types.Point2;
    const currentWorldPos = canvasToWorld(this.position);
    const newWorldPos = canvasToWorld(newCanvasPosition);
    const worldDeltaPos = vec3.sub(
      vec3.create(),
      newWorldPos,
      currentWorldPos
    ) as Types.Point3;

    const autoPanCallbackData: AutoPanCallbackData = {
      points: {
        currentPosition: {
          canvas: this.position,
          world: currentWorldPos,
        },
        newPosition: {
          canvas: newCanvasPosition,
          world: newWorldPos,
        },
      },
      delta: {
        canvas: canvasDeltaPos,
        world: worldDeltaPos,
      },
    };

    autoPan.callback(autoPanCallbackData);
  }

  private _addBrowserEventListeners(element) {
    // mousedown on document is handled in the capture phase because the other
    // mousedown event listener added to the magnifying glass element does not
    // allow the event to buble up and reach the document.
    document.addEventListener(
      'mousedown',
      this._browserMouseDownCallback,
      true
    );

    // All mouse events should not buble up avoiding the source viewport from
    // handling those events resulting in unexpected behaviors.
    element.addEventListener('mousedown', this._cancelMouseEventCallback);
    element.addEventListener('mouseup', this._cancelMouseEventCallback);
    element.addEventListener('mousemove', this._cancelMouseEventCallback);
    element.addEventListener('dblclick', this._cancelMouseEventCallback);
  }

  private _removeBrowserEventListeners(element) {
    document.removeEventListener(
      'mousedown',
      this._browserMouseDownCallback,
      true
    );
    document.removeEventListener('mouseup', this._browserMouseUpCallback);

    element.removeEventListener('mousedown', this._cancelMouseEventCallback);
    element.removeEventListener('mouseup', this._cancelMouseEventCallback);
    element.removeEventListener('mousemove', this._cancelMouseEventCallback);
    element.removeEventListener('dblclick', this._cancelMouseEventCallback);
  }

  private _addEventListeners(element) {
    eventTarget.addEventListener(
      cstEvents.TOOL_MODE_CHANGED,
      this._handleToolModeChanged
    );

    element.addEventListener(
      cstEvents.MOUSE_MOVE,
      this._mouseDragCallback as EventListener
    );

    element.addEventListener(
      cstEvents.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );

    this._addBrowserEventListeners(element);
  }

  private _removeEventListeners(element) {
    eventTarget.removeEventListener(
      cstEvents.TOOL_MODE_CHANGED,
      this._handleToolModeChanged
    );

    element.addEventListener(
      cstEvents.MOUSE_MOVE,
      this._mouseDragCallback as EventListener
    );

    element.addEventListener(
      cstEvents.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );

    this._removeBrowserEventListeners(element);
  }

  private _initialize() {
    const { _sourceEnabledElement: sourceEnabledElement } = this;
    const { viewport: sourceViewport } = sourceEnabledElement;
    const { canvas: sourceCanvas } = sourceViewport;
    const magnifyElement = this._createViewportNode();

    sourceCanvas.parentNode.appendChild(magnifyElement);

    this._addEventListeners(magnifyElement);
    this._cloneViewport(sourceViewport, magnifyElement);
    this._enabledElement = getEnabledElement(magnifyElement);
  }

  private _syncViewportsCameras(sourceViewport, magnifyViewport) {
    const worldPos = sourceViewport.canvasToWorld(this.position);

    // Use the original viewport for the base for parallelScale
    const parallelScale = this._convertZoomFactorToParallelScale(
      sourceViewport,
      magnifyViewport,
      this.zoomFactor
    );

    const { focalPoint, position, viewPlaneNormal } =
      magnifyViewport.getCamera();

    const distance = Math.sqrt(
      Math.pow(focalPoint[0] - position[0], 2) +
        Math.pow(focalPoint[1] - position[1], 2) +
        Math.pow(focalPoint[2] - position[2], 2)
    );

    const updatedFocalPoint = <Types.Point3>[
      worldPos[0],
      worldPos[1],
      worldPos[2],
    ];

    const updatedPosition = <Types.Point3>[
      updatedFocalPoint[0] + distance * viewPlaneNormal[0],
      updatedFocalPoint[1] + distance * viewPlaneNormal[1],
      updatedFocalPoint[2] + distance * viewPlaneNormal[2],
    ];

    magnifyViewport.setCamera({
      parallelScale,
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
  }

  private _syncStackViewports(
    sourceViewport: Types.IStackViewport,
    magnifyViewport: Types.IStackViewport
  ) {
    magnifyViewport.setImageIdIndex(sourceViewport.getCurrentImageIdIndex());
  }

  private _syncViewports() {
    const { viewport: sourceViewport } = this._sourceEnabledElement;
    const { viewport: magnifyViewport } = this._enabledElement;
    const sourceProperties = sourceViewport.getProperties();
    const imageData = magnifyViewport.getImageData();

    if (!imageData) {
      return;
    }

    magnifyViewport.setProperties(sourceProperties);
    this._syncViewportsCameras(sourceViewport, magnifyViewport);

    if (this._isStackViewport(sourceViewport)) {
      this._syncStackViewports(
        sourceViewport as Types.IStackViewport,
        magnifyViewport as Types.IStackViewport
      );
    }

    this._syncViewportsCameras(sourceViewport, magnifyViewport);
    magnifyViewport.render();
  }

  private _resizeViewport() {
    const { viewport } = this._enabledElement;
    const renderingEngine = viewport.getRenderingEngine();

    renderingEngine.resize();
  }
}

export { AdvancedMagnifyViewport as default, AdvancedMagnifyViewport };
