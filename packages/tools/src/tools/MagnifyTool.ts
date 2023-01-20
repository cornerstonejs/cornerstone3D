import { BaseTool } from './base';
import { Events } from '../enums';

import { getEnabledElement, StackViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { EventTypes, PublicToolProps, ToolProps } from '../types';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { state } from '../store';
import { Enums } from '@cornerstonejs/core';

import {
  hideElementCursor,
  resetElementCursor,
} from '../cursors/elementCursor';
import { IPoints } from '../types';

const MAGNIFY_VIEWPORT_ID = 'magnify-viewport';

class MagnifyTool extends BaseTool {
  static toolName;
  _bounds: any;
  editData: {
    referencedImageId: string;
    viewportIdsToRender: string[];
    enabledElement: Types.IEnabledElement;
    renderingEngine: Types.IRenderingEngine;
    currentPoints: IPoints;
  } | null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        magnifySize: 10, // parallel scale , higher more zoom
        magnifyWidth: 250, //px
        magnifyHeight: 250, //px
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _getReferencedImageId(
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ): string {
    const targetId = this.getTargetId(viewport);

    let referencedImageId;

    if (viewport instanceof StackViewport) {
      referencedImageId = targetId.split('imageId:')[1];
    }

    return referencedImageId;
  }

  preMouseDownCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    if (!(viewport instanceof StackViewport)) {
      throw new Error('MagnifyTool only works on StackViewports');
    }

    const referencedImageId = this._getReferencedImageId(viewport);

    if (!referencedImageId) {
      throw new Error(
        'MagnifyTool: No referenced image id found, reconstructed planes not supported yet'
      );
    }

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      referencedImageId,
      viewportIdsToRender,
      enabledElement,
      renderingEngine,
      currentPoints,
    };

    this._createMagnificationViewport();
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return true;
  };

  preTouchStartCallback = (evt: EventTypes.InteractionEventType) => {
    this.preMouseDownCallback(evt);
  };

  _createMagnificationViewport = () => {
    const {
      enabledElement,
      referencedImageId,
      viewportIdsToRender,
      renderingEngine,
      currentPoints,
    } = this.editData;
    const { viewport } = enabledElement;
    const { element } = viewport;
    const { voiRange } = viewport.getProperties();

    const { canvas: canvasPos, world: worldPos } = currentPoints;

    let magnifyToolElement: HTMLDivElement;

    magnifyToolElement = element.querySelector('.magnifyTool');
    if (magnifyToolElement === null) {
      const magnifyElement = document.createElement('div');

      magnifyElement.classList.add('magnifyTool');

      magnifyElement.style.display = 'block';
      magnifyElement.style.width = `${this.configuration.magnifyWidth}px`;
      magnifyElement.style.height = `${this.configuration.magnifyHeight}px`;
      magnifyElement.style.position = 'absolute';

      magnifyToolElement = magnifyElement;

      const viewportElement = element.querySelector('.viewport-element');
      viewportElement.appendChild(magnifyElement);

      const viewportInput = {
        viewportId: MAGNIFY_VIEWPORT_ID,
        type: Enums.ViewportType.STACK,
        element: magnifyToolElement as HTMLDivElement,
      };

      renderingEngine.enableElement(viewportInput);
    }

    // Todo: use CSS transform instead of setting top and left for better performance
    magnifyToolElement.style.top = `${
      canvasPos[1] - this.configuration.magnifyHeight / 2
    }px`;
    magnifyToolElement.style.left = `${
      canvasPos[0] - this.configuration.magnifyWidth / 2
    }px`;

    const magnifyViewport = renderingEngine.getViewport(
      MAGNIFY_VIEWPORT_ID
    ) as Types.IStackViewport;

    magnifyViewport.setStack([referencedImageId]).then(() => {
      // match the original viewport voi range
      magnifyViewport.setProperties({ voiRange });

      // Use the original viewport for the base for parallelScale
      const { parallelScale } = viewport.getCamera();

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
        parallelScale: parallelScale * (1 / this.configuration.magnifySize),
        focalPoint: updatedFocalPoint,
        position: updatedPosition,
      });
      magnifyViewport.render();
    });

    magnifyToolElement.style.display = 'block';
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _dragCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;

    const { deltaPoints, element, currentPoints } = eventDetail;
    const deltaPointsWorld = deltaPoints.world;
    const canvasPos = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const magnifyViewport = renderingEngine.getViewport(MAGNIFY_VIEWPORT_ID);

    const magnifyElement = element.querySelector(
      '.magnifyTool'
    ) as HTMLDivElement;

    if (!magnifyElement) {
      return;
    }

    magnifyElement.style.top = `${
      canvasPos[1] - this.configuration.magnifyHeight / 2
    }px`;
    magnifyElement.style.left = `${
      canvasPos[0] - this.configuration.magnifyWidth / 2
    }px`;

    const { focalPoint, position } = magnifyViewport.getCamera();

    const updatedPosition = <Types.Point3>[
      position[0] + deltaPointsWorld[0],
      position[1] + deltaPointsWorld[1],
      position[2] + deltaPointsWorld[2],
    ];

    const updatedFocalPoint = <Types.Point3>[
      focalPoint[0] + deltaPointsWorld[0],
      focalPoint[1] + deltaPointsWorld[1],
      focalPoint[2] + deltaPointsWorld[2],
    ];

    magnifyViewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });

    magnifyViewport.render();
  };

  _dragEndCallback = (evt: EventTypes.InteractionEventType) => {
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.disableElement(MAGNIFY_VIEWPORT_ID);

    const viewportElement = element.querySelector('.viewport-element');

    const magnifyToolElement = viewportElement.querySelector(
      '.magnifyTool'
    ) as HTMLDivElement;

    viewportElement.removeChild(magnifyToolElement);

    this._deactivateDraw(element);
    resetElementCursor(element);
  };

  _activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._dragEndCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._dragEndCallback as EventListener
    );

    element.addEventListener(
      Events.TOUCH_END,
      this._dragEndCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
  };

  _deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._dragEndCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._dragEndCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_END,
      this._dragEndCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
  };
}

MagnifyTool.toolName = 'Magnify';
export default MagnifyTool;
