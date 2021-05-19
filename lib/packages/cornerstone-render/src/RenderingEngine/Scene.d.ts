import RenderingEngine from './RenderingEngine';
import VolumeViewport from './VolumeViewport';
import { VolumeActor, ActorEntry } from '../types';
declare type VolumeInput = {
    volumeUID: string;
    callback?: () => any;
    blendMode?: string;
    slabThickness?: number;
};
/**
 * @class Scene - Describes a scene which defined a world space containing actors.
 * A scene may have different viewports which may be different views of this same data.
 */
declare class Scene {
    readonly uid: string;
    readonly renderingEngineUID: string;
    readonly _sceneViewports: Array<string>;
    private _FrameOfReferenceUID;
    readonly _internalScene: boolean;
    constructor(uid: string, renderingEngineUID: string);
    getFrameOfReferenceUID(): string;
    getIsInternalScene(): boolean;
    /**
     * @method getRenderingEngine Returns the rendering engine driving the `Scene`.
     *
     * @returns {RenderingEngine} The RenderingEngine instance.
     */
    getRenderingEngine(): RenderingEngine;
    /**
     * @method getViewports Returns the viewports on the scene.
     *
     * @returns {Array<VolumeViewport>} The viewports.
     */
    getViewports(): Array<VolumeViewport>;
    /**
     * @method getViewport - Returns a `Viewport` from the `Scene` by its `uid`.
     * @param {string } viewportUID The UID of the viewport to get.
     */
    getViewport(viewportUID: string): VolumeViewport;
    /**
     * @method setVolumes Creates volume actors for all volumes defined in the `volumeInputArray`.
     * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
     * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
     * `VolumeMapper`.
     *
     * @param {Array<VolumeInput>} volumeInputArray The array of `VolumeInput`s which define the volumes to add.
     * @param {boolean} [immediate=false] Whether the `Scene` should be rendered as soon as volumes are added.
     */
    setVolumes(volumeInputArray: Array<VolumeInput>, immediate?: boolean): Promise<void>;
    /**
     * @method render Renders all `Viewport`s in the `Scene` using the `Scene`'s `RenderingEngine`.
     */
    render(): void;
    addViewportByUID(viewportUID: string): void;
    removeViewportByUID(viewportUID: string): void;
    getViewportUIDs(): Array<string>;
    addVolumeActors(viewportUID: string): void;
    /**
     * @method getVolumeActor Gets a volume actor on the scene by its `uid`.
     *
     * @param {string } uid The UID of the volumeActor to fetch.
     * @returns {object} The volume actor.
     */
    getVolumeActor(uid: string): VolumeActor;
    /**
     * @method getVolumeActors Gets the array of `VolumeActorEntry`s.
     *
     * @returns {Array<ActorEntry>} The array of volume actors.
     */
    getVolumeActors(): Array<ActorEntry>;
}
export default Scene;
