// @ts-ignore
import Viewport from './Viewport.ts';
import createVolumeActor from './helpers/createVolumeActor';

class Scene {
  uid: string;
  render: Function;
  private _viewports: Array<Viewport>;
  private _volumeActors: Array<object>;

  constructor(uid, render) {
    this.uid = uid;
    this._viewports = [];
    this._volumeActors = [];
    this.render = render;
  }

  getViewports() {
    return {
      viewports: this._viewports,
      setToolGroup: toolGroupUID => {
        // TODO Set the toolGroup of all viewports in the scene.
        this._viewports.forEach(viewport => {
          viewport.setToolGroup(toolGroupUID);
        });
      },
      setSyncGroups: (syncGroupUIDs = []) => {
        this._viewports.forEach(viewport => {
          viewport.setSyncGroups(syncGroupUIDs);
        });
      },
    };
  }

  getViewport(uid) {
    return this._viewports.find(vp => vp.uid === uid);
  }

  setVolumes(volumeData, immediate = false) {
    this._volumeActors = [];

    for (let i = 0; i < volumeData.length; i++) {
      const { volumeUID, callback } = volumeData[i];
      const volumeActor = createVolumeActor(volumeUID, callback);

      this._volumeActors.push({ volumeActor, uid: volumeUID });
    }

    this._viewports.forEach(viewport => {
      viewport._setVolumeActors(this._volumeActors);
    });

    if (immediate) {
      this.render();
    }
  }

  _addViewport(viewportProps) {
    const viewport = new Viewport(viewportProps);

    this._viewports.push(viewport);
  }
}

export default Scene;
