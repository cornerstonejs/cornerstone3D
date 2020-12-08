import IViewportUID from './../IViewportUID';

export interface ISynchronizerEventHandler {
  (
    synchronizer: Synchronizer,
    sourceViewport: IViewportUID,
    targetViewport: IViewportUID,
    sourceEvent: any
  ): void;
}

class Synchronizer {
  //
  private _enabled: boolean;
  private _eventName: string;
  private _eventHandler: ISynchronizerEventHandler;
  private _ignoreFiredEvents: boolean;
  private _sourceViewports: Array<IViewportUID>;
  private _targetViewports: Array<IViewportUID>;
  //
  public id: string;

  constructor(
    synchronizerId: string,
    eventName: string,
    eventHandler: ISynchronizerEventHandler
  ) {
    this._enabled = true;
    this._eventName = eventName;
    this._eventHandler = eventHandler;
    this._ignoreFiredEvents = false;
    this._sourceViewports = [];
    this._targetViewports = [];

    //
    this.id = synchronizerId;
  }

  public isDisabled(): boolean {
    return !this._enabled || !this._hasSourceElements();
  }

  public add(
    renderingEngineUID: string,
    sceneUID: string,
    viewportUID: string,
    types = { source: true, target: true }
  ): void {
    const viewport: IViewportUID = {
      renderingEngineUID,
      sceneUID,
      viewportUID,
    };
    if (types.source) {
      this._sourceViewports.push(viewport);
    }

    if (types.target) {
      this._targetViewports.push(viewport);
    }
  }

  public hasSourceViewport(renderingEngineUID, sceneUID, viewportUID) {
    // Exact match; could make loose
    const containsExactMatch = this._sourceViewports.some(
      vp =>
        vp.renderingEngineUID === renderingEngineUID &&
        vp.sceneUID === sceneUID &&
        vp.viewportUID === viewportUID
    );

    return containsExactMatch;
  }

  public fireEvent(sourceViewport: IViewportUID, sourceEvent: any): void {
    if (this.isDisabled() || this._ignoreFiredEvents) {
      return;
    }

    this._ignoreFiredEvents = true;
    try {
      for (let i = 0; i < this._targetViewports.length; i++) {
        const targetViewport = this._targetViewports[i];
        const targetIsSource =
          sourceViewport.viewportUID === targetViewport.viewportUID;

        if (targetIsSource) {
          continue;
        }

        this._eventHandler(this, sourceViewport, targetViewport, sourceEvent);
      }
    } catch (ex) {
      console.warn(`Synchronizer, for: ${this._eventName}`, ex);
    } finally {
      this._ignoreFiredEvents = false;
    }
  }

  private _hasSourceElements(): boolean {
    return this._sourceViewports.length !== 0;
  }
}

export default Synchronizer;
