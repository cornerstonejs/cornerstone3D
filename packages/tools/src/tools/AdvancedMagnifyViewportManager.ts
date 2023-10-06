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

const SYMBOL_SINGLETON = Symbol('AdvancedMagnifyViewportManager');

class AdvancedMagnifyViewportManager {
  private _viewports: Map<string, AdvancedMagnifyViewport>;

  constructor() {
    this._viewports = new Map();

    this._annotationRemovedCallback =
      this._annotationRemovedCallback.bind(this);

    this._initialize();
  }

  public static getInstance(): AdvancedMagnifyViewportManager {
    AdvancedMagnifyViewportManager[SYMBOL_SINGLETON] =
      AdvancedMagnifyViewportManager[SYMBOL_SINGLETON] ??
      new AdvancedMagnifyViewportManager();

    return AdvancedMagnifyViewportManager[SYMBOL_SINGLETON];
  }

  public createViewport = ({
    magnifyViewportId,
    sourceEnabledElement,
    position,
    radius,
    zoomFactor,
    autoPan,
  }: {
    magnifyViewportId?: string;
    sourceEnabledElement: Types.IEnabledElement;
    position: Types.Point2;
    radius: number;
    zoomFactor: number;
    autoPan: {
      enabled: boolean;
      padding: number;
      callback: AutoPanCallback;
    };
  }): AdvancedMagnifyViewport => {
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

  public getViewport(magnifyViewportId: string): AdvancedMagnifyViewport {
    return this._viewports.get(magnifyViewportId);
  }

  public dispose() {
    this._removeEventListeners();
  }

  private _annotationRemovedCallback(evt: AnnotationRemovedEventType) {
    const { annotation } = evt.detail;

    if (annotation.metadata.toolName !== ADVANCED_MAGNIFY_TOOL_NAME) {
      return;
    }

    const { magnifyViewportId } = annotation.data.magnifyViewportId;
    const magnifyViewport = this._viewports.get(magnifyViewportId);

    if (magnifyViewport) {
      magnifyViewport.dispose();
      this._viewports.delete(magnifyViewportId);
    }
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
