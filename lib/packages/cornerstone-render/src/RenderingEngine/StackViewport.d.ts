import Viewport from './Viewport';
import { Point2, Point3, ViewportInput, VOIRange } from '../types';
/**
 * An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 */
declare class StackViewport extends Viewport {
    private imageIds;
    private currentImageIdIndex;
    private _imageData;
    private stackActorVOI;
    constructor(props: ViewportInput);
    getFrameOfReferenceUID: () => string | undefined;
    private createActorMapper;
    private buildMetadata;
    private _getNumCompsFromPhotometricInterpretation;
    private _getImageDataMetadata;
    private _getCameraOrientation;
    private _createVTKImageData;
    setStack(imageIds: Array<string>, currentImageIdIndex?: number): any;
    setStackActorVOI(range: VOIRange): void;
    private _checkVTKImageDataMatchesCornerstoneImage;
    private _updateVTKImageDataFromCornerstoneImage;
    private _loadImage;
    private _updateActorToDisplayImageId;
    private _setImageIdIndex;
    setImageIdIndex(imageIdIndex: number): void;
    private _restoreCameraProps;
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
    getCurrentImageIdIndex: () => number;
    getImageIds: () => Array<string>;
    getCurrentImageId: () => string;
}
export default StackViewport;
