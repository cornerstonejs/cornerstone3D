import renderingEngineCache from './renderingEngineCache';
import { createVolumeActor } from './helpers';
import { loadVolume } from '../volumeLoader';
import { uuidv4 } from '../utilities';
/**
 * @class Scene - Describes a scene which defined a world space containing actors.
 * A scene may have different viewports which may be different views of this same data.
 */
class Scene {
    constructor(uid, renderingEngineUID) {
        this.renderingEngineUID = renderingEngineUID;
        this._sceneViewports = [];
        this._internalScene = !uid;
        this.uid = uid ? uid : uuidv4();
    }
    getFrameOfReferenceUID() {
        return this._FrameOfReferenceUID;
    }
    getIsInternalScene() {
        return this._internalScene;
    }
    /**
     * @method getRenderingEngine Returns the rendering engine driving the `Scene`.
     *
     * @returns {RenderingEngine} The RenderingEngine instance.
     */
    getRenderingEngine() {
        return renderingEngineCache.get(this.renderingEngineUID);
    }
    /**
     * @method getViewports Returns the viewports on the scene.
     *
     * @returns {Array<VolumeViewport>} The viewports.
     */
    getViewports() {
        const renderingEngine = this.getRenderingEngine();
        return this._sceneViewports.map((uid) => {
            return renderingEngine.getViewport(uid);
        });
    }
    /**
     * @method getViewport - Returns a `Viewport` from the `Scene` by its `uid`.
     * @param {string } viewportUID The UID of the viewport to get.
     */
    getViewport(viewportUID) {
        const renderingEngine = this.getRenderingEngine();
        const index = this._sceneViewports.indexOf(viewportUID);
        if (index > -1) {
            return renderingEngine.getViewport(viewportUID);
        }
        throw new Error(`Requested ${viewportUID} does not belong to ${this.uid} scene`);
    }
    /**
     * @method setVolumes Creates volume actors for all volumes defined in the `volumeInputArray`.
     * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
     * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
     * `VolumeMapper`.
     *
     * @param {Array<VolumeInput>} volumeInputArray The array of `VolumeInput`s which define the volumes to add.
     * @param {boolean} [immediate=false] Whether the `Scene` should be rendered as soon as volumes are added.
     */
    async setVolumes(volumeInputArray, immediate = false) {
        // TODO: should we have a get or fail? If it's in the cache, give it back, otherwise throw
        const firstImageVolume = await loadVolume(volumeInputArray[0].volumeUID);
        if (!firstImageVolume) {
            throw new Error(`imageVolume with uid: ${firstImageVolume.uid} does not exist`);
        }
        const FrameOfReferenceUID = firstImageVolume.metadata.FrameOfReferenceUID;
        const numVolumes = volumeInputArray.length;
        // Check all other volumes exist and have the same FrameOfReference
        for (let i = 1; i < numVolumes; i++) {
            const volumeInput = volumeInputArray[i];
            const imageVolume = await loadVolume(volumeInput.volumeUID);
            if (!imageVolume) {
                throw new Error(`imageVolume with uid: ${imageVolume.uid} does not exist`);
            }
            if (FrameOfReferenceUID !== imageVolume.metadata.FrameOfReferenceUID) {
                throw new Error(`Volumes being added to scene ${this.uid} do not share the same FrameOfReferenceUID. This is not yet supported`);
            }
        }
        this._FrameOfReferenceUID = FrameOfReferenceUID;
        const slabThicknessValues = [];
        const volumeActors = [];
        // One actor per volume
        for (let i = 0; i < volumeInputArray.length; i++) {
            const { volumeUID, slabThickness } = volumeInputArray[i];
            const volumeActor = await createVolumeActor(volumeInputArray[i]);
            volumeActors.push({ uid: volumeUID, volumeActor, slabThickness });
            if (slabThickness !== undefined &&
                !slabThicknessValues.includes(slabThickness)) {
                slabThicknessValues.push(slabThickness);
            }
        }
        if (slabThicknessValues.length > 1) {
            console.warn('Currently slab thickness for intensity projections is tied to the camera, not per volume, using the largest of the two volumes for this scene.');
        }
        this._sceneViewports.forEach((uid) => {
            const viewport = this.getViewport(uid);
            viewport._setVolumeActors(volumeActors);
        });
        if (immediate) {
            this.render();
        }
    }
    /**
     * @method render Renders all `Viewport`s in the `Scene` using the `Scene`'s `RenderingEngine`.
     */
    render() {
        const renderingEngine = this.getRenderingEngine();
        renderingEngine.renderScene(this.uid);
    }
    addViewportByUID(viewportUID) {
        if (this._sceneViewports.indexOf(viewportUID) < 0) {
            this._sceneViewports.push(viewportUID);
        }
    }
    removeViewportByUID(viewportUID) {
        const index = this._sceneViewports.indexOf(viewportUID);
        if (index > -1) {
            this._sceneViewports.splice(index, 1);
        }
    }
    getViewportUIDs() {
        return this._sceneViewports;
    }
    addVolumeActors(viewportUID) {
        const volumeActor = this.getVolumeActors();
        const viewport = this.getViewport(viewportUID);
        viewport._setVolumeActors(volumeActor);
    }
    /**
     * @method getVolumeActor Gets a volume actor on the scene by its `uid`.
     *
     * @param {string } uid The UID of the volumeActor to fetch.
     * @returns {object} The volume actor.
     */
    getVolumeActor(uid) {
        const viewports = this.getViewports();
        const volumeActorEntry = viewports[0].getActor(uid);
        if (volumeActorEntry) {
            return volumeActorEntry.volumeActor;
        }
    }
    /**
     * @method getVolumeActors Gets the array of `VolumeActorEntry`s.
     *
     * @returns {Array<ActorEntry>} The array of volume actors.
     */
    getVolumeActors() {
        const viewports = this.getViewports();
        return viewports[0].getActors();
    }
}
export default Scene;
//# sourceMappingURL=Scene.js.map