import Viewport from './Viewport';
import createVolumeActor from './helpers/createVolumeActor';

class Scene {
  constructor(uid) {
    this.uid = uid;
    this._viewports = [];
    this._volumeActors = [];
  }

  render() {
    // TODO -> Render only this scene's viewports.
    // traverseAllPasses but only for the relevant views.
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
    // TODO: -> make actors and add reference to actor to viewport.

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
      // TODO Render
    }
  }

  _addViewport(viewportProps) {
    const viewport = new Viewport(viewportProps);

    this._viewports.push(viewport);
  }
}

export default Scene;
