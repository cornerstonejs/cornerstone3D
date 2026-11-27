import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  getRenderingEngines,
  getEnabledElement,
  eventTarget,
  Enums,
} from '@cornerstonejs/core';

import type { ISynchronizerEventHandler } from '../../types';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'store.SynchronizerManager.Synchronizer'
);

type eventSource = 'element' | 'eventTarget';

type auxiliaryEvent = {
  name: string;
  source?: eventSource;
};

export type SynchronizerOptions = {
  auxiliaryEvents?: auxiliaryEvent[];
  eventSource?: eventSource;
  viewFraming?: Types.ViewFramingSelector;
  syncInvertState?: boolean;
  syncColormap?: boolean;
};

/**
 * Synchronizer is a class that listens to a specific event on a specific source
 * targets and fires a specific event on a specific target elements. Use cases
 * include: synchronizing a camera between two viewports, synchronizing a
 * windowLevel between various viewports.
 */
class Synchronizer {
  //
  private _enabled: boolean;
  private _eventName: string;
  private _auxiliaryEvents: auxiliaryEvent[];
  private _eventHandler: ISynchronizerEventHandler;
  private _eventListener: EventListenerOrEventListenerObject;
  private _eventSource: eventSource;
  private _ignoreFiredEvents: boolean;
  private _sourceViewports: Array<Types.IViewportId>;
  /**
   * The element of each source viewport whose events the synchronizer
   * listens to, by `renderingEngineId:viewportId`. A source that is not
   * enabled yet has none until its ELEMENT_ENABLED.
   */
  private _sourceElements = new Map<string, HTMLDivElement>();
  private _targetViewports: Array<Types.IViewportId>;
  private _viewportOptions: Record<string, Record<string, unknown>> = {};
  /**
   * The options of the viewport of one rendering engine, by rendering engine
   * id and viewport id. They go before the options of the viewport id alone.
   */
  private _renderingEngineViewportOptions = new Map<
    string,
    Map<string, Record<string, unknown>>
  >();
  private _options: SynchronizerOptions;
  public id: string;

  constructor(
    synchronizerId: string,
    eventName: string,
    eventHandler: ISynchronizerEventHandler,
    options?: SynchronizerOptions
  ) {
    this._enabled = true;
    this._eventName = eventName;
    this._eventHandler = eventHandler;
    this._eventListener = this._onEvent.bind(this);
    this._ignoreFiredEvents = false;
    this._sourceViewports = [];
    this._targetViewports = [];
    this._options = options || {};
    this._eventSource = this._options.eventSource || 'element';
    this._auxiliaryEvents = this._options.auxiliaryEvents || [];

    //
    this.id = synchronizerId;
  }

  /**
   * "Returns true if the synchronizer is disabled."
   * @returns A boolean value.
   */
  public isDisabled(): boolean {
    return !this._enabled || !this._hasSourceElements();
  }

  /**
   * Sets the options for the viewport id.  This can be used to
   * provide configuration on a viewport basis for things like offsets
   * to the general synchronization, or turn `on/off` synchronization of certain
   * attributes.
   *
   * Without a rendering engine id the options are those of the viewport with
   * this id in every rendering engine. With one they are those of the
   * viewport of that rendering engine only, and go before the others, so two
   * rendering engines whose viewports have the same id keep their options
   * apart.
   *
   * @param viewportId - The id of the viewport.
   * @param options - The options of the viewport.
   * @param renderingEngineId - The id of the rendering engine of the viewport.
   */
  public setOptions(
    viewportId: string,
    options: Record<string, unknown> = {},
    renderingEngineId?: string
  ): void {
    if (renderingEngineId === undefined) {
      this._viewportOptions[viewportId] = options;
      return;
    }

    if (!this._renderingEngineViewportOptions.has(renderingEngineId)) {
      this._renderingEngineViewportOptions.set(renderingEngineId, new Map());
    }

    this._renderingEngineViewportOptions
      .get(renderingEngineId)
      .set(viewportId, options);
  }

  /**
   * Sets a synchronizer enabled
   */
  public setEnabled(enabled: boolean) {
    this._enabled = enabled;
  }

  /**
   * Gets the options for the given viewport id: with a rendering engine id,
   * the options set for the viewport of that rendering engine, else those set
   * for the viewport id alone.
   *
   * @param viewportId - The id of the viewport.
   * @param renderingEngineId - The id of the rendering engine of the viewport.
   * @returns The options, or undefined when none were set.
   */
  public getOptions(
    viewportId: string,
    renderingEngineId?: string
  ): Record<string, unknown> | undefined {
    return (
      (renderingEngineId === undefined
        ? undefined
        : this._renderingEngineViewportOptions
            .get(renderingEngineId)
            ?.get(viewportId)) ?? this._viewportOptions[viewportId]
    );
  }

  /**
   * Add a viewport to the list of targets and sources both. A viewport that
   * is not enabled yet is added too, and becomes a source when it is
   * enabled (see `addSource`).
   * @param viewportInfo - The viewportId and its renderingEngineId to add to the list of targets and sources.
   */
  public add(viewportInfo: Types.IViewportId): void {
    this.addTarget(viewportInfo);
    this.addSource(viewportInfo);
  }

  /**
   * Add a viewport to the list of sources (source ONLY).
   *
   * The viewport is known by its rendering engine id and its viewport id, so
   * it can be added before it is enabled, as an application names the panes
   * of a group before they exist: the synchronizer then listens to its events
   * from its ELEMENT_ENABLED on. A viewport that is disabled leaves the
   * synchronizer, so one that is enabled again under the same id is added
   * again, before or after that enable.
   * @param viewportInfo - The viewportId and its renderingEngineId to add to the list of targets and sources.
   */
  public addSource(viewportInfo: Types.IViewportId): void {
    if (_containsViewport(this._sourceViewports, viewportInfo)) {
      return;
    }

    this._sourceViewports.push(viewportInfo);
    this._listenToSource(viewportInfo);
    this._updateElementHandlers();
  }

  /**
   * Add a viewport to the list of viewports that will get the eventHandler
   * executed when the event is fired on the source viewport.
   * @param viewportInfo - The viewportId and its renderingEngineId to add to the list of targets and sources.
   */
  public addTarget(viewportInfo: Types.IViewportId): void {
    if (_containsViewport(this._targetViewports, viewportInfo)) {
      return;
    }

    this._targetViewports.push(viewportInfo);
    this._updateElementHandlers();
  }

  /**
   * Get the list of source viewports (as `{viewportId, renderingEngineId}` objects)
   * @returns An array of `{viewportId, renderingEngineId}` objects.
   */
  public getSourceViewports(): Array<Types.IViewportId> {
    return this._sourceViewports;
  }

  /**
   * Get the list of target viewports (as `{viewportId, renderingEngineId}` objects)
   * @returns An array of `{viewportId, renderingEngineId}` objects.
   */
  public getTargetViewports(): Array<Types.IViewportId> {
    return this._targetViewports;
  }

  /**
   * Takes every viewport out of the synchronizer and removes its listeners.
   */
  public destroy(): void {
    [...this._sourceViewports].forEach((s) => this.removeSource(s));
    [...this._targetViewports].forEach((t) => this.removeTarget(t));
  }

  /**
   * Remove the viewport from the list of targets and sources
   * @param viewportInfo - The viewport info including viewportId and renderingEngineId.
   */
  public remove(viewportInfo: Types.IViewportId): void {
    this.removeTarget(viewportInfo);
    this.removeSource(viewportInfo);
  }

  /**
   * Remove the viewport from the list of source viewports
   * @param viewportInfo - The viewport info including viewportId and renderingEngineId.
   */
  public removeSource(viewportInfo: Types.IViewportId): void {
    const index = _getViewportIndex(this._sourceViewports, viewportInfo);

    if (index === -1) {
      return;
    }

    this._sourceViewports.splice(index, 1);
    this._stopListeningToSource(viewportInfo);
    this._updateElementHandlers();
  }

  /**
   * Remove the viewport from the list of viewports that are currently targeted by
   * this handler
   * @param viewportInfo - The viewport info including viewportId and renderingEngineId.
   *
   */
  public removeTarget(viewportInfo: Types.IViewportId): void {
    const index = _getViewportIndex(this._targetViewports, viewportInfo);

    if (index === -1) {
      return;
    }

    this._targetViewports.splice(index, 1);
    this._updateElementHandlers();
  }

  public hasSourceViewport(
    renderingEngineId: string,
    viewportId: string
  ): boolean {
    return _containsViewport(this._sourceViewports, {
      renderingEngineId,
      viewportId,
    });
  }

  public hasTargetViewport(
    renderingEngineId: string,
    viewportId: string
  ): boolean {
    return _containsViewport(this._targetViewports, {
      renderingEngineId,
      viewportId,
    });
  }

  private fireEvent(
    sourceViewport: Types.IViewportId,
    sourceEvent: Event
  ): void {
    if (this.isDisabled() || this._ignoreFiredEvents) {
      return;
    }

    this._ignoreFiredEvents = true;

    const promises = [];
    try {
      for (let i = 0; i < this._targetViewports.length; i++) {
        const targetViewport = this._targetViewports[i];
        const targetIsSource =
          sourceViewport.renderingEngineId ===
            targetViewport.renderingEngineId &&
          sourceViewport.viewportId === targetViewport.viewportId;

        if (targetIsSource) {
          continue;
        }
        const result = this._eventHandler(
          this,
          sourceViewport,
          targetViewport,
          sourceEvent,
          this._options
        );

        // if the result is a promise, then add it to the list of promises
        // to wait for before setting _ignoreFiredEvents to false
        if (result instanceof Promise) {
          promises.push(result);
        }
      }
    } catch (ex) {
      cs3dLogger.warn(`Synchronizer, for: ${this._eventName}`, ex);
    } finally {
      if (promises.length) {
        Promise.allSettled(promises).then(() => {
          this._ignoreFiredEvents = false;
        });
      } else {
        this._ignoreFiredEvents = false;
      }
    }
  }

  private _onEvent = (evt: Event): void => {
    if (this._ignoreFiredEvents === true) {
      return;
    }

    // If no target viewports, then return immediately, this is useful
    // when switching between layouts, when previous layout has disabled
    // its viewports, and the new layout has not yet enabled them.
    // Right now we don't "delete" the synchronizer if all source and targets
    // are removed, but we may want to do that in the future.
    if (!this._targetViewports.length) {
      return;
    }

    const enabledElement =
      this._eventSource === 'element'
        ? getEnabledElement(evt.currentTarget as HTMLDivElement)
        : _getEventTargetViewport((evt as CustomEvent).detail);

    if (!enabledElement) {
      return;
    }

    const { renderingEngineId, viewportId } = enabledElement;

    // If the viewport has been removed from the synchronizer before the event is
    // fired, then return immediately.
    if (
      !_containsViewport(this._sourceViewports, {
        renderingEngineId,
        viewportId,
      })
    ) {
      return;
    }

    this.fireEvent(
      {
        renderingEngineId,
        viewportId,
      },
      evt
    );
  };

  private _hasSourceElements(): boolean {
    return this._sourceViewports.length !== 0;
  }

  /**
   * Listens to the events of a source viewport, on its element or on the
   * global event target, when the viewport is enabled; a viewport that is
   * not enabled yet gets its listeners at its ELEMENT_ENABLED.
   */
  private _listenToSource(viewportInfo: Types.IViewportId): void {
    const { renderingEngineId, viewportId } = viewportInfo;
    const viewport =
      getRenderingEngine(renderingEngineId)?.getViewport(viewportId);

    if (!viewport) {
      return;
    }

    const { element } = viewport;
    const eventSource = this._eventSource === 'element' ? element : eventTarget;

    eventSource.addEventListener(this._eventName, this._eventListener);

    this._auxiliaryEvents.forEach(({ name, source = 'element' }) => {
      const target = source === 'element' ? element : eventTarget;
      target.addEventListener(name, this._eventListener);
    });

    this._sourceElements.set(_getViewportKey(viewportInfo), element);
  }

  /**
   * Removes the listeners of a source viewport from the element they were
   * added to, which a disabled viewport no longer gives. A source that was
   * never enabled has none.
   */
  private _stopListeningToSource(viewportInfo: Types.IViewportId): void {
    const key = _getViewportKey(viewportInfo);
    const element = this._sourceElements.get(key);

    if (!element) {
      return;
    }

    this._sourceElements.delete(key);

    const eventSource = this._eventSource === 'element' ? element : eventTarget;

    eventSource.removeEventListener(this._eventName, this._eventListener);

    this._auxiliaryEvents.forEach(({ name, source = 'element' }) => {
      const target = source === 'element' ? element : eventTarget;
      target.removeEventListener(name, this._eventListener);
    });
  }

  /**
   * Listens to the events of a source viewport that was added before it was
   * enabled, by the rendering engine id and the viewport id of the event.
   */
  private _onElementEnabled = (
    evt: Types.EventTypes.ElementEnabledEvent
  ): void => {
    const { renderingEngineId, viewportId } = evt.detail;
    const viewportInfo = { renderingEngineId, viewportId };

    if (
      !_containsViewport(this._sourceViewports, viewportInfo) ||
      this._sourceElements.has(_getViewportKey(viewportInfo))
    ) {
      return;
    }

    this._listenToSource(viewportInfo);
    this._updateElementHandlers();
  };

  /**
   * Takes the viewport of a disabled element out of the synchronizer, by the
   * rendering engine id and the viewport id of the event.
   */
  private _onElementDisabled = (
    evt: Types.EventTypes.ElementDisabledEvent
  ): void => {
    const { renderingEngineId, viewportId } = evt.detail;

    this.remove({ renderingEngineId, viewportId });
  };

  /**
   * Listens to `ELEMENT_DISABLED` while the synchronizer has a viewport, and
   * to `ELEMENT_ENABLED` while it has a source that is not enabled yet, each
   * with one function for the synchronizer, on the global event target where
   * the rendering engine fires the events, so each listener is added once
   * and goes with the last viewport that needs it.
   */
  private _updateElementHandlers(): void {
    if (this._sourceViewports.length || this._targetViewports.length) {
      eventTarget.addEventListener(
        Enums.Events.ELEMENT_DISABLED,
        this._onElementDisabled
      );
    } else {
      eventTarget.removeEventListener(
        Enums.Events.ELEMENT_DISABLED,
        this._onElementDisabled
      );
    }

    if (this._sourceViewports.length > this._sourceElements.size) {
      eventTarget.addEventListener(
        Enums.Events.ELEMENT_ENABLED,
        this._onElementEnabled
      );
    } else {
      eventTarget.removeEventListener(
        Enums.Events.ELEMENT_ENABLED,
        this._onElementEnabled
      );
    }
  }
}

/** The key of a viewport in `_sourceElements`. */
function _getViewportKey({
  renderingEngineId,
  viewportId,
}: Types.IViewportId): string {
  return `${renderingEngineId}:${viewportId}`;
}

function _getViewportIndex(
  arr: Array<Types.IViewportId>,
  vp: Types.IViewportId
): number {
  return arr.findIndex(
    (ar) =>
      vp.renderingEngineId === ar.renderingEngineId &&
      vp.viewportId === ar.viewportId
  );
}

/**
 * The viewport of an event of the global event target: the one of the
 * rendering engine id and the viewport id of the event, or, for an event with
 * a viewport id alone, the viewport of the one rendering engine that has that
 * id. An event whose viewport id is in several rendering engines gives none,
 * as its source is unknown.
 */
function _getEventTargetViewport(detail?: {
  viewportId?: string;
  renderingEngineId?: string;
}): Types.IViewportId | undefined {
  const { viewportId, renderingEngineId } = detail ?? {};

  if (!viewportId) {
    return;
  }

  if (renderingEngineId) {
    return getRenderingEngine(renderingEngineId)?.getViewport(viewportId)
      ? { renderingEngineId, viewportId }
      : undefined;
  }

  const renderingEngines = (getRenderingEngines() ?? []).filter(
    (renderingEngine) => renderingEngine.getViewport(viewportId)
  );

  if (renderingEngines.length !== 1) {
    return;
  }

  return { renderingEngineId: renderingEngines[0].id, viewportId };
}

function _containsViewport(
  arr: Array<Types.IViewportId>,
  vp: Types.IViewportId
) {
  return arr.some(
    (ar) =>
      ar.renderingEngineId === vp.renderingEngineId &&
      ar.viewportId === vp.viewportId
  );
}

export default Synchronizer;
