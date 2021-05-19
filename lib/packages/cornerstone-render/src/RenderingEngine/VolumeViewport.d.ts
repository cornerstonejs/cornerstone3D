import Scene from './Scene';
import Viewport from './Viewport';
import { ViewportInput, Point2, Point3 } from '../types';
import { ActorEntry } from '../types';
/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
declare class VolumeViewport extends Viewport {
    constructor(props: ViewportInput);
    getFrameOfReferenceUID: () => string;
    /**
     * @method Sets the slab thickness option in the `Viewport`'s `options`.
     *
     * @param {number} [slabThickness]
     */
    setSlabThickness(slabThickness: number): void;
    /**
     * @method Gets the slab thickness option in the `Viewport`'s `options`.
     *
     * @returns {number} [slabThickness]
     */
    getSlabThickness(): number;
    /**
     * @method getScene Gets the `Scene` object that the `Viewport` is associated with.
     *
     * @returns {Scene} The `Scene` object.
     */
    getScene(): Scene;
    /**
     * @method _setVolumeActors Attaches the volume actors to the viewport.
     *
     * @param {Array<ActorEntry>} volumeActorEntries The volume actors to add the viewport.
     *
     * NOTE: overwrites the slab thickness value in the options if one of the actor has a higher value
     */
    _setVolumeActors(volumeActorEntries: Array<ActorEntry>): void;
    /**
     * canvasToWorld Returns the world coordinates of the given `canvasPos`
     * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
     * and the direction of projection.
     *
     * @param canvasPos The position in canvas coordinates.
     * @returns The corresponding world coordinates.
     * @public
     */
    canvasToWorld: (canvasPos: Point2) => Point3;
    /**
     * @canvasToWorld Returns the canvas coordinates of the given `worldPos`
     * projected onto the `Viewport`'s `canvas`.
     *
     * @param worldPos The position in world coordinates.
     * @returns The corresponding canvas coordinates.
     * @public
     */
    worldToCanvas: (worldPos: Point3) => Point2;
}
export default VolumeViewport;
