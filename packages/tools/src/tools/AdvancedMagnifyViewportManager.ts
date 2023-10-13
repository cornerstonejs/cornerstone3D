import { vec3 } from 'gl-matrix';
import {
  eventTarget,
  Enums,
  getRenderingEngine,
  CONSTANTS,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { AnnotationRemovedEventType } from '../types/EventTypes';
import { Events as cstEvents } from '../enums';
import {
  AdvancedMagnifyViewport,
  AutoPanCallback,
} from './AdvancedMagnifyViewport';
import { AdvancedMagnifyAnnotation } from '../types/ToolSpecificAnnotationTypes';

// Defined the tool name internally instead of importing
// AdvangedMagnifyTool due to cyclic dependency
const ADVANCED_MAGNIFY_TOOL_NAME = 'AdvancedMagnify';

const PARALLEL_THRESHOLD = 1 - CONSTANTS.EPSILON;
const { Events } = Enums;

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

type MagnifyViewportsMapEntry = {
  annotation: AdvancedMagnifyAnnotation;
  magnifyViewport: AdvancedMagnifyViewport;
};

/**
 * Manager responsible for creating, storing and destroying magnifying glass
 * viewports. There are no restrictions to create a new instance of it but it
 * should be accessed through getInstance() method.
 */
class AdvancedMagnifyViewportManager {
  private static _singleton: AdvancedMagnifyViewportManager;
  private _magnifyViewportsMap: Map<string, MagnifyViewportsMapEntry>;

  constructor() {
    this._magnifyViewportsMap = new Map();
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
    annotation: AdvancedMagnifyAnnotation,
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
    const { viewport: sourceViewport } = sourceEnabledElement;
    const { element: sourceElement } = sourceViewport;

    const magnifyViewport = new AdvancedMagnifyViewport({
      magnifyViewportId,
      sourceEnabledElement,
      radius,
      position,
      zoomFactor,
      autoPan,
    });

    this._addSourceElementEventListener(sourceElement);
    this._magnifyViewportsMap.set(magnifyViewport.viewportId, {
      annotation,
      magnifyViewport,
    });

    return magnifyViewport;
  };

  /**
   * Find and return a magnifying glass viewport based on its id
   * @param magnifyViewportId - Magnifying glass viewport id
   * @returns A magnifying glass viewport instance
   */
  public getViewport(magnifyViewportId: string): AdvancedMagnifyViewport {
    return this._magnifyViewportsMap.get(magnifyViewportId)?.magnifyViewport;
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
    const magnifyViewportMapEntry =
      this._magnifyViewportsMap.get(magnifyViewportId);

    if (magnifyViewportMapEntry) {
      const { magnifyViewport } = magnifyViewportMapEntry;
      const { viewport: sourceViewport } = magnifyViewport.sourceEnabledElement;
      const { element: sourceElement } = sourceViewport;

      this._removeSourceElementEventListener(sourceElement);

      magnifyViewport.dispose();
      this._magnifyViewportsMap.delete(magnifyViewportId);
    }
  }

  private _destroyViewports() {
    const magnifyViewportIds = Array.from(this._magnifyViewportsMap.keys());

    magnifyViewportIds.forEach((magnifyViewportId) =>
      this._destroyViewport(magnifyViewportId)
    );
  }

  private _annotationRemovedCallback = (evt: AnnotationRemovedEventType) => {
    const { annotation } = evt.detail;

    if (annotation.metadata.toolName !== ADVANCED_MAGNIFY_TOOL_NAME) {
      return;
    }

    this._destroyViewport(annotation.data.magnifyViewportId);
  };

  private _getMagnifyViewportsMapEntriesBySourceViewportId(sourceViewportId) {
    const magnifyViewportsMapEntries = Array.from(
      this._magnifyViewportsMap.values()
    );

    return magnifyViewportsMapEntries.filter(({ magnifyViewport }) => {
      const { viewport } = magnifyViewport.sourceEnabledElement;
      return viewport.id === sourceViewportId;
    });
  }

  private _newStackImageCallback = (
    evt: Types.EventTypes.StackNewImageEvent
  ) => {
    const { viewportId: sourceViewportId, imageId } = evt.detail;
    const magnifyViewportsMapEntries =
      this._getMagnifyViewportsMapEntriesBySourceViewportId(sourceViewportId);

    magnifyViewportsMapEntries.forEach(({ annotation }) => {
      annotation.metadata.referencedImageId = imageId;
      annotation.invalidated = true;
    });
  };

  private _newVolumeImageCallback = (
    evt: Types.EventTypes.VolumeNewImageEvent
  ) => {
    const { renderingEngineId, viewportId: sourceViewportId } = evt.detail;
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const sourceViewport = renderingEngine.getViewport(sourceViewportId);
    const { viewPlaneNormal: currentViewPlaneNormal } =
      sourceViewport.getCamera();

    const magnifyViewportsMapEntries =
      this._getMagnifyViewportsMapEntriesBySourceViewportId(sourceViewportId);

    magnifyViewportsMapEntries.forEach(({ annotation }) => {
      const { viewPlaneNormal } = annotation.metadata;

      // Compare the normal to make sure the volume is not rotate in 3D space
      const isParallel =
        Math.abs(vec3.dot(viewPlaneNormal, currentViewPlaneNormal)) >
        PARALLEL_THRESHOLD;

      if (!isParallel) {
        return;
      }

      const { handles } = annotation.data;
      const worldImagePlanePoint = sourceViewport.canvasToWorld([0, 0]);
      const vecHandleToImagePlane = vec3.sub(
        vec3.create(),
        worldImagePlanePoint,
        handles.points[0]
      );
      const worldDist = vec3.dot(vecHandleToImagePlane, currentViewPlaneNormal);
      const worldDelta = vec3.scale(
        vec3.create(),
        currentViewPlaneNormal,
        worldDist
      );

      // Move all handle points to the image plane to make the annotation visible
      for (let i = 0, len = handles.points.length; i < len; i++) {
        const point = handles.points[i];

        point[0] += worldDelta[0];
        point[1] += worldDelta[1];
        point[2] += worldDelta[2];
      }

      annotation.invalidated = true;
    });
  };

  private _addEventListeners() {
    eventTarget.addEventListener(
      cstEvents.ANNOTATION_REMOVED,
      this._annotationRemovedCallback
    );
  }

  private _removeEventListeners() {
    eventTarget.removeEventListener(
      cstEvents.ANNOTATION_REMOVED,
      this._annotationRemovedCallback
    );
  }

  private _addSourceElementEventListener(element) {
    element.addEventListener(
      Events.STACK_NEW_IMAGE,
      this._newStackImageCallback
    );

    element.addEventListener(
      Events.VOLUME_NEW_IMAGE,
      this._newVolumeImageCallback
    );
  }

  private _removeSourceElementEventListener(element) {
    element.removeEventListener(
      Events.STACK_NEW_IMAGE,
      this._newStackImageCallback
    );

    element.removeEventListener(
      Events.VOLUME_NEW_IMAGE,
      this._newVolumeImageCallback
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
