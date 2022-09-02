import CPUFallbackColormapData from './CPUFallbackColormapData';
import CPUIImageData from './CPUIImageData';
import ICamera from './ICamera';
import IImageData from './IImageData';
import { IViewport } from './IViewport';
import Point2 from './Point2';
import Point3 from './Point3';
import { Scaling } from './ScalingParameters';
import StackViewportProperties from './StackViewportProperties';

/**
 * Interface for Stack Viewport
 */
export default interface IStackViewport extends IViewport {
  modality: string;
  /** Scaling parameters */
  scaling: Scaling;
  /**
   * Resizes the viewport - only used in CPU fallback for StackViewport. The
   * GPU resizing happens inside the RenderingEngine.
   */
  resize: () => void;
  /**
   * Returns the frame of reference UID, if the image doesn't have imagePlaneModule
   * metadata, it returns undefined, otherwise, frameOfReferenceUID is returned.
   */
  getFrameOfReferenceUID: () => string;
  /**
   * Sets the properties for the viewport on the default actor. Properties include
   * setting the VOI, inverting the colors and setting the interpolation type, rotation
   */
  setProperties(
    { voiRange, invert, interpolationType, rotation }: StackViewportProperties,
    suppressEvents?: boolean
  ): void;
  /**
   * Retrieve the viewport properties
   */
  getProperties: () => StackViewportProperties;
  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s camera.
   */
  canvasToWorld: (canvasPos: Point2) => Point3;
  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   */
  worldToCanvas: (worldPos: Point3) => Point2;
  /**
   * Returns the index of the imageId being renderer
   */
  getCurrentImageIdIndex: () => number;
  /**
   * Returns the list of image Ids for the current viewport
   */
  getImageIds: () => string[];
  /**
   * Returns true if the viewport contains the imageId
   */
  hasImageId: (imageId: string) => boolean;
  /**
   * Returns true if the viewport contains the imageURI
   */
  hasImageURI: (imageURI: string) => boolean;
  /**
   * Returns the currently rendered imageId
   */
  getCurrentImageId: () => string;

  /**
   * Custom rendering pipeline for the rendering for the CPU fallback
   */
  customRenderViewportToCanvas: () => {
    canvas: HTMLCanvasElement;
    element: HTMLDivElement;
    viewportId: string;
    renderingEngineId: string;
  };
  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   */
  getImageData(): IImageData | CPUIImageData;
  /**
   * Reset the viewport properties to the default values
   */
  resetProperties(): void;
  /**
   * If the user has selected CPU rendering, return the CPU camera, otherwise
   * return the default camera
   */
  getCamera(): ICamera;
  /**
   * Set the camera based on the provided camera object.
   */
  setCamera(cameraInterface: ICamera): void;
  /**
   * Sets the imageIds to be visualized inside the stack viewport. It accepts
   * list of imageIds, the index of the first imageId to be viewed. It is a
   * asynchronous function that returns a promise resolving to imageId being
   * displayed in the stack viewport.
   */
  setStack(
    imageIds: Array<string>,
    currentImageIdIndex?: number
  ): Promise<string>;
  /**
   * Centers Pan and resets the zoom for stack viewport.
   */
  resetCamera(resetPan?: boolean, resetZoom?: boolean): boolean;
  /**
   * Loads the image based on the provided imageIdIndex. It is an Async function which
   * returns a promise that resolves to the imageId.
   */
  setImageIdIndex(imageIdIndex: number): Promise<string>;
  /**
   * Calibrates the image with new metadata that has been added for imageId. To calibrate
   * a viewport, you should add your calibration data manually to
   * calibratedPixelSpacingMetadataProvider and call viewport.calibrateSpacing
   * for it get applied.
   */
  calibrateSpacing(imageId: string): void;
  /**
   * If the renderer is CPU based, throw an error. Otherwise, returns the `vtkRenderer` responsible for rendering the `Viewport`.
   */
  getRenderer(): any;
  /**
   * Sets the colormap for the current viewport.
   * @param colormap - The colormap data to use.
   */
  setColormap(colormap: CPUFallbackColormapData): void;
  /**
   * It sets the colormap to the default colormap.
   */
  unsetColormap(): void;
}
