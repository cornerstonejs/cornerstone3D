import { BaseTool } from './base';
import { Events } from '../enums';

import { getEnabledElement, Enums } from '@cornerstonejs/core';
import type { PlanarViewport, Types } from '@cornerstonejs/core';
import type { EventTypes, PublicToolProps, ToolProps, IPoints } from '../types';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { getNativeSourceProperties } from '../utilities/genericViewportToolHelpers';
import {
  getWorldHeightPerPixel,
  mountLoupeSource,
  syncLoupeWithSource,
} from '../utilities/magnifyLoupe';
import { state } from '../store/state';

import {
  hideElementCursor,
  resetElementCursor,
} from '../cursors/elementCursor';

const MAGNIFY_VIEWPORT_ID = 'magnify-viewport';

class MagnifyTool extends BaseTool {
  static toolName;
  editData: {
    referencedImageId: string;
    viewportIdsToRender: string[];
    enabledElement: Types.IEnabledElement;
    renderingEngine: Types.IRenderingEngine;
    currentPoints: IPoints;
    isTouch: boolean;
  } | null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        magnifySize: 10, // parallel scale , higher more zoom
        magnifyWidth: 250, //px
        magnifyHeight: 250, //px
        // On touch, the loupe is lifted above the contact point; this is the
        // gap in px between the contact point and the loupe's bottom edge.
        touchOffset: 40, //px
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  private _hasBeenRemoved = false;

  _getReferencedImageId(viewport: Types.IViewport): string | undefined {
    return getNativeSourceProperties(viewport).currentImageId;
  }

  preMouseDownCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

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

    // True when reached via preTouchStartCallback (explicit alias or the
    // dispatcher-level touch fallback) — both deliver the TOUCH_START event.
    const isTouch = evt.type === Events.TOUCH_START;

    this.editData = {
      referencedImageId,
      viewportIdsToRender,
      enabledElement,
      renderingEngine,
      currentPoints,
      isTouch,
    };

    this._createMagnificationViewport();
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    return true;
  };

  preTouchStartCallback = (evt: EventTypes.InteractionEventType) => {
    this.preMouseDownCallback(evt);
  };

  /**
   * Positions the magnify loupe element relative to the interaction point.
   * Mouse: centered on the pointer (unchanged legacy behavior). Touch: lifted
   * above the contact point by `configuration.touchOffset` so the finger does
   * not occlude the loupe, clamped to the viewport bounds.
   */
  private _positionMagnifyElement = (
    magnifyElement: HTMLDivElement,
    canvasPos: Types.Point2,
    element: HTMLDivElement
  ) => {
    const { magnifyWidth, magnifyHeight, touchOffset } = this.configuration;

    let left = canvasPos[0] - magnifyWidth / 2;
    let top = canvasPos[1] - magnifyHeight / 2;

    if (this.editData?.isTouch) {
      top = canvasPos[1] - magnifyHeight - (touchOffset ?? 0);

      const maxLeft = Math.max(element.clientWidth - magnifyWidth, 0);
      const maxTop = Math.max(element.clientHeight - magnifyHeight, 0);

      left = Math.min(Math.max(left, 0), maxLeft);
      top = Math.min(Math.max(top, 0), maxTop);
    }

    magnifyElement.style.top = `${top}px`;
    magnifyElement.style.left = `${left}px`;
  };

  /**
   * Makes the loupe: a next planar viewport in an element over the source
   * viewport. It shows the source display set with the presentation, the
   * slice, the orientation, the rotation and the flips of the source, with
   * the world point under the pointer at its centre. Its canvas spans
   * `1 / magnifySize` of the world height that the source canvas spans.
   */
  _createMagnificationViewport = () => {
    const {
      enabledElement,
      viewportIdsToRender,
      renderingEngine,
      currentPoints,
    } = this.editData;
    const { viewport } = enabledElement;
    const { element } = viewport;
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
        type: Enums.ViewportType.PLANAR_NEXT,
        element: magnifyToolElement as HTMLDivElement,
      };

      renderingEngine.enableElement(viewportInput);
    }

    // Todo: use CSS transform instead of setting top and left for better performance
    this._positionMagnifyElement(magnifyToolElement, canvasPos, element);

    const sourceViewport = viewport as unknown as PlanarViewport;
    const magnifyViewport = renderingEngine.getViewport(
      MAGNIFY_VIEWPORT_ID
    ) as unknown as PlanarViewport;
    const worldPerPixel =
      (getWorldHeightPerPixel(sourceViewport) * element.clientHeight) /
      (this.configuration.magnifySize * magnifyToolElement.clientHeight);

    mountLoupeSource(sourceViewport, magnifyViewport).then((mounted) => {
      if (this._hasBeenRemoved || !mounted) {
        return;
      }

      syncLoupeWithSource(
        sourceViewport,
        magnifyViewport,
        worldPos,
        worldPerPixel
      );
      magnifyViewport.render();
    });

    magnifyToolElement.style.display = 'block';
    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
  };

  _cancelCallback = (evt: EventTypes.InteractionEventType) => {
    // Empêche l'affichage du menu contextuel par défaut du navigateur
    evt.preventDefault();
    evt.stopPropagation();

    // Appelle la fonction qui désactive et nettoie l'outil
    this._dragEndCallback(evt);
  };

  _dragCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;

    const { deltaPoints, element, currentPoints } = eventDetail;
    const deltaPointsWorld = deltaPoints.world;
    const canvasPos = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const magnifyViewport = renderingEngine.getViewport(
      MAGNIFY_VIEWPORT_ID
    ) as unknown as PlanarViewport;

    const magnifyElement = element.querySelector(
      '.magnifyTool'
    ) as HTMLDivElement;

    if (!magnifyElement) {
      return;
    }

    this._positionMagnifyElement(magnifyElement, canvasPos, element);

    const { anchorWorld } = magnifyViewport.getViewState();

    if (!anchorWorld) {
      return;
    }

    magnifyViewport.setViewState({
      anchorWorld: <Types.Point3>[
        anchorWorld[0] + deltaPointsWorld[0],
        anchorWorld[1] + deltaPointsWorld[1],
        anchorWorld[2] + deltaPointsWorld[2],
      ],
    });

    magnifyViewport.render();
  };

  _dragEndCallback = (evt: EventTypes.InteractionEventType) => {
    let { element } = evt.detail;

    if (element === undefined) {
      const { enabledElement } = this.editData;

      const { viewport } = enabledElement;
      element = viewport.element;
    }

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
    this._hasBeenRemoved = true;
  };

  _activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;
    this._hasBeenRemoved = false;

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
      'contextmenu',
      this._cancelCallback as EventListener
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
      'contextmenu',
      this._cancelCallback as EventListener
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
