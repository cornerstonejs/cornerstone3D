import { eventTarget } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { AnnotationRemovedEventType } from '../types/EventTypes';
import { Events } from '../enums';
import {
  AdvancedMagnifyViewport,
  AutoPanCallback,
} from './AdvancedMagnifyViewport';

// Defined the tool name internally instead of importing
// AdvangedMagnifyTool due to cyclic dependency
const ADVANCED_MAGNIFY_TOOL_NAME = 'AdvancedMagnify';

export type MagnifyViewportInfo = {
  // Viewport id to be used or new v4 compliant GUID is used instead
  magnifyViewportId?: string;
  // Enabled element where the magnifying glass shall be added to
  sourceEnabledElement: Types.IEnabledElement;
  // Magnifying glass position (center)
  position: Types.Point2;
  // Magnifying glass radius (pixels)
  radius: number;
  // Amount of magnification applied to the magnifying glass image compared to the source viewport.
  zoomFactor: number;
  // Allow panning the viewport when moving an annotation point close to the border of the magnifying glass
  autoPan: {
    // Enable or disable auto pan
    enabled: boolean;
    // Minimum distance to the border before start auto panning
    padding: number;
    // Callback function responsible for updating the annotation (circle)
    // that contains the magnifying viewport
    callback: AutoPanCallback;
  };
};

/**
 * Manager responsible for creating, storing and destroying magnifying glass
 * viewports. There are no restrictions to create a new instance of it but it
 * should be accessed through getInstance() method.
 */
class AdvancedMagnifyViewportManager {
  private static _singleton: AdvancedMagnifyViewportManager;

  private _viewports: Map<string, AdvancedMagnifyViewport>;

  constructor() {
    this._viewports = new Map();

    this._annotationRemovedCallback =
      this._annotationRemovedCallback.bind(this);

    this._initialize();
  }

  /**
   * Creates a new magnifying glass viewport manager instance when this method is
   * called for the first time or return the instance previously created for
   * any subsequent call (singleton pattern).
   * @returns A magnifying viewport manager instance
   */
  public static getInstance(): AdvancedMagnifyViewportManager {
    AdvancedMagnifyViewportManager._singleton =
      AdvancedMagnifyViewportManager._singleton ??
      new AdvancedMagnifyViewportManager();

    return AdvancedMagnifyViewportManager._singleton;
  }

  /**
   * Creates a new magnifying glass viewport instance
   * @param viewportInfo - Viewport data used when creating a new magnifying glass viewport
   * @returns A magnifying glass viewport instance
   */
  public createViewport = (
    viewportInfo: MagnifyViewportInfo
  ): AdvancedMagnifyViewport => {
    const {
      magnifyViewportId,
      sourceEnabledElement,
      position,
      radius,
      zoomFactor,
      autoPan,
    } = viewportInfo;

    const magnifyViewport = new AdvancedMagnifyViewport({
      magnifyViewportId,
      sourceEnabledElement,
      radius,
      position,
      zoomFactor,
      autoPan,
    });

    this._viewports.set(magnifyViewport.viewportId, magnifyViewport);

    return magnifyViewport;
  };

  /**
   * Find and return a magnifying glass viewport based on its id
   * @param magnifyViewportId - Magnifying glass viewport id
   * @returns A magnifying glass viewport instance
   */
  public getViewport(magnifyViewportId: string): AdvancedMagnifyViewport {
    return this._viewports.get(magnifyViewportId);
  }

  /**
   * Release all magnifying glass viewport instances and remove all event
   * listeners making all objects available to be garbage collected.
   */
  public dispose() {
    this._removeEventListeners();
    this._destroyViewports();
  }

  private _destroyViewport(magnifyViewportId: string) {
    const magnifyViewport = this._viewports.get(magnifyViewportId);

    if (magnifyViewport) {
      magnifyViewport.dispose();
      this._viewports.delete(magnifyViewportId);
    }
  }

  private _destroyViewports() {
    const magnifyViewportIds = Array.from(this._viewports.keys());

    magnifyViewportIds.forEach((magnifyViewportId) =>
      this._destroyViewport(magnifyViewportId)
    );
  }

  private _annotationRemovedCallback(evt: AnnotationRemovedEventType) {
    const { annotation } = evt.detail;

    if (annotation.metadata.toolName !== ADVANCED_MAGNIFY_TOOL_NAME) {
      return;
    }

    this._destroyViewport(annotation.data.magnifyViewportId);
  }

  private _addEventListeners() {
    eventTarget.addEventListener(
      Events.ANNOTATION_REMOVED,
      this._annotationRemovedCallback
    );
  }

  private _removeEventListeners() {
    eventTarget.removeEventListener(
      Events.ANNOTATION_REMOVED,
      this._annotationRemovedCallback
    );
  }

  private _initialize() {
    this._addEventListeners();
  }
}

export {
  AdvancedMagnifyViewportManager as default,
  AdvancedMagnifyViewportManager,
};
