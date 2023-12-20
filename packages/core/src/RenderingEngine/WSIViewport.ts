import { vec3 } from 'gl-matrix';
import { Events as EVENTS, MetadataModules } from '../enums';
import {
  IWSIViewport,
  WSIViewportProperties,
  Point3,
  Point2,
  ICamera,
  InternalVideoCamera,
  WSIViewportInput,
  VOIRange,
} from '../types';
import * as metaData from '../metaData';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import Viewport from './Viewport';
import { getOrCreateCanvas } from './helpers';

/**
 * An object representing a single stack viewport, which is a camera
 * looking into an internal scene, and an associated target output `canvas`.
 */
class WSIViewport extends Viewport implements IWSIViewport {
  public modality;
  // Viewport Data
  protected imageIds: string[];
  readonly uid;
  readonly renderingEngineId: string;
  private slideHeight = 0;
  private slideWidth = 0;

  private frameOfReferenceUID: string;

  protected metadata;
  private microscopyElement: HTMLDivElement;

  private internalCamera: InternalVideoCamera = {
    panWorld: [0, 0],
    parallelScale: 1,
  };

  private viewer;

  /**
   * The VOI Range is used to apply contrast/brightness adjustments to the image.
   */
  private voiRange: VOIRange = {
    lower: 0,
    upper: 255,
  };

  constructor(props: WSIViewportInput) {
    super({
      ...props,
      canvas: props.canvas || getOrCreateCanvas(props.element),
    });
    this.renderingEngineId = props.renderingEngineId;

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    // Need to set the top level position as relative to make nested items
    // use absolute positioning internally.
    this.element.style.position = 'relative';
    this.microscopyElement = document.createElement('div');
    this.microscopyElement.id = crypto.randomUUID();
    this.microscopyElement.innerText = 'Initial';
    this.microscopyElement.style.background = 'grey';
    this.microscopyElement.style.width = '100%';
    this.microscopyElement.style.height = '100%';
    this.microscopyElement.style.position = 'absolute';
    this.microscopyElement.style.left = '0';
    this.microscopyElement.style.top = '0';
    this.element.appendChild(this.microscopyElement);

    this.addEventListeners();
    this.resize();
  }

  public static get useCustomRenderingPipeline() {
    return true;
  }

  private addEventListeners() {
    this.canvas.addEventListener(
      EVENTS.ELEMENT_DISABLED,
      this.elementDisabledHandler
    );
  }

  private removeEventListeners() {
    this.canvas.removeEventListener(
      EVENTS.ELEMENT_DISABLED,
      this.elementDisabledHandler
    );
  }

  private elementDisabledHandler() {
    this.removeEventListeners();
  }

  private _getImageDataMetadata(imageIndex = 0) {
    const imagePlaneModule = metaData.get(
      MetadataModules.IMAGE_PLANE,
      this.imageIds[imageIndex]
    );

    let rowCosines = <Point3>imagePlaneModule.rowCosines;
    let columnCosines = <Point3>imagePlaneModule.columnCosines;

    // if null or undefined
    if (rowCosines == null || columnCosines == null) {
      rowCosines = <Point3>[1, 0, 0];
      columnCosines = <Point3>[0, 1, 0];
    }

    const rowCosineVec = vec3.fromValues(
      rowCosines[0],
      rowCosines[1],
      rowCosines[2]
    );
    const colCosineVec = vec3.fromValues(
      columnCosines[0],
      columnCosines[1],
      columnCosines[2]
    );
    const scanAxisNormal = vec3.create();
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

    const { rows, columns } = imagePlaneModule;
    this.slideHeight = rows;
    this.slideWidth = columns;

    let origin = imagePlaneModule.imagePositionPatient;
    if (!origin) {
      origin = [0, 0, 0];
    }

    const xSpacing = imagePlaneModule.columnPixelSpacing || 1;
    const ySpacing = imagePlaneModule.rowPixelSpacing || 1;
    const xVoxels = columns;
    const yVoxels = rows;

    const zSpacing = 1;
    const zVoxels = 1;

    this.hasPixelSpacing = !!imagePlaneModule.columnPixelSpacing;
    return {
      bitsAllocated: 8,
      numComps: 3,
      origin,
      direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal],
      dimensions: [xVoxels, yVoxels, zVoxels],
      spacing: [xSpacing, ySpacing, zSpacing],
      hasPixelSpacing: this.hasPixelSpacing,
      numVoxels: xVoxels * yVoxels * zVoxels,
      imagePlaneModule,
    };
  }

  // Sets the frame number - note according to DICOM, this is 1 based
  public async setFrameNumber(frame: number) {
    // No-op right now, not sure what this will be
  }

  public setProperties(props: WSIViewportProperties) {
    // No-op - todo implement this
  }

  public getProperties = (): WSIViewportProperties => {
    return {};
  };

  public resetProperties() {
    this.setProperties({});
  }

  protected getScalarData() {
    return null;
  }

  public getImageData() {
    const { metadata } = this;

    const spacing = metadata.spacing;

    return {
      dimensions: metadata.dimensions,
      spacing,
      origin: metadata.origin,
      direction: metadata.direction,
      metadata: { Modality: this.modality },
      getScalarData: () => this.getScalarData(),
      imageData: {
        getDirection: () => metadata.direction,
        getDimensions: () => metadata.dimensions,
        getRange: () => [0, 255],
        getScalarData: () => this.getScalarData(),
        getSpacing: () => metadata.spacing,
        worldToIndex: (point: Point3) => {
          const canvasPoint = this.worldToCanvas(point);
          const pixelCoord = this.canvasToIndex(canvasPoint);
          return [pixelCoord[0], pixelCoord[1], 0];
        },
        indexToWorld: (point: Point3) => {
          const canvasPoint = this.indexToCanvas([point[0], point[1]]);
          return this.canvasToWorld(canvasPoint);
        },
      },
      hasPixelSpacing: this.hasPixelSpacing,
      calibration: this.calibration,
      preScale: {
        scaled: false,
      },
    };
  }

  /**
   * Checks to see if the imageURI is currently being displayed.  The imageURI
   * may contain frame numbers according to the DICOM standard format, which
   * will be stripped to compare the base image URI, and then the values used
   * to check if that frame is currently being displayed.
   *
   * The DICOM standard allows for comma separated values as well, however,
   * this is not supported here, with only a single range or single value
   * being tested.
   *
   * For a single value, the time range +/- 5 frames is permitted to allow
   * the detection to actually succeed when nearby without requiring an exact
   * time frame to be matched.
   *
   * @param imageURI - containing frame number or range.
   * @returns
   */
  public hasImageURI(imageURI: string) {
    // TODO - implement this
    return true;
  }

  public setCamera(camera: ICamera): void {
    const { parallelScale, focalPoint } = camera;
    // console.log('Setting WSI Camera to', camera);

    // NOTE: the parallel scale should be done first
    // because it affects the focal point later
    if (camera.parallelScale !== undefined) {
      this.internalCamera.parallelScale =
        this.element.clientHeight / 2 / parallelScale;
    }

    if (focalPoint !== undefined) {
      const focalPointCanvas = this.worldToCanvas(focalPoint);
      const canvasCenter: Point2 = [
        this.element.clientWidth / 2,
        this.element.clientHeight / 2,
      ];

      const panWorldDelta: Point2 = [
        (focalPointCanvas[0] - canvasCenter[0]) /
          this.internalCamera.parallelScale,
        (focalPointCanvas[1] - canvasCenter[1]) /
          this.internalCamera.parallelScale,
      ];

      this.internalCamera.panWorld = [
        this.internalCamera.panWorld[0] - panWorldDelta[0],
        this.internalCamera.panWorld[1] - panWorldDelta[1],
      ];
    }
  }

  /**
   * This function returns the imageID associated with either the current
   * frame being displayed, or the range of frames being played.  This may not
   * correspond to any particular imageId that has imageId metadata, as the
   * format is one of:
   * `<DICOMweb URI>/frames/<Start Frame>(-<End Frame>)?`
   * or
   * `<Other URI>[?&]frameNumber=<Start Frame>(-<EndFrame>)?`
   * for a URL parameter.
   *
   * @returns an imageID for video
   */
  public getCurrentImageId() {
    return this.imageIds[0];
  }

  public getFrameNumber() {
    return 1;
  }

  public getCamera(): ICamera {
    this.showWSI();
    const { parallelScale } = this.internalCamera;

    const canvasCenter: Point2 = [
      this.element.clientWidth / 2,
      this.element.clientHeight / 2,
    ];

    // All other viewports have the focal point in canvas coordinates in the center
    // of the canvas, so to make tools work the same, we need to do the same here
    // and convert to the world coordinate system since focal point is in world coordinates.
    const canvasCenterWorld = this.canvasToWorld(canvasCenter);

    return {
      parallelProjection: true,
      focalPoint: canvasCenterWorld,
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale: this.element.clientHeight / 2 / parallelScale, // Reverse zoom direction back
      viewPlaneNormal: [0, 0, 1],
    };
  }

  public resetCamera = (): boolean => {
    return true;
  };

  public getNumberOfSlices = (): number => {
    return 1;
  };

  public getFrameOfReferenceUID = (): string => {
    return this.frameOfReferenceUID;
  };

  public resize = (): void => {
    const canvas = this.canvas;
    const { clientWidth, clientHeight } = canvas;

    // Set the canvas to be same resolution as the client.
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }

    this.refreshRenderValues();
  };

  /**
   * Converts a VideoViewport canvas coordinate to a video coordinate.
   *
   * @param canvasPos - to convert to world
   * @returns World position
   */
  public canvasToWorld = (canvasPos: Point2): Point3 => {
    const pan: Point2 = this.internalCamera.panWorld; // In world coordinates
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const panOffsetCanvas: Point2 = [
      pan[0] * worldToCanvasRatio,
      pan[1] * worldToCanvasRatio,
    ];

    const subCanvasPos: Point2 = [
      canvasPos[0] - panOffsetCanvas[0],
      canvasPos[1] - panOffsetCanvas[1],
    ];

    const worldPos: Point3 = [
      subCanvasPos[0] / worldToCanvasRatio,
      subCanvasPos[1] / worldToCanvasRatio,
      0,
    ];

    return worldPos;
  };

  public async setWSI(imageIds: string[], client) {
    this.microscopyElement.style.background = 'red';
    this.microscopyElement.innerText = 'Loading';
    this.imageIds = imageIds;
    const DicomMicroscopyViewer = await import('dicom-microscopy-viewer');
    this.frameOfReferenceUID = null;
    this.metadata = this._getImageDataMetadata();

    const metadata = this.imageIds.map((imageId) => {
      const imageMetadata = client.getDICOMwebMetadata(imageId);

      Object.defineProperty(imageMetadata, 'isMultiframe', {
        value: imageMetadata.isMultiframe,
        enumerable: false,
      });
      Object.defineProperty(imageMetadata, 'frameNumber', {
        value: undefined,
        enumerable: false,
      });
      const imageType = imageMetadata['00080008']?.Value;
      if (imageType?.length === 1) {
        imageMetadata['00080008'].Value = imageType[0].split('\\');
      }
      const frameOfReference = imageMetadata['00200052']?.Value?.[0];
      if (!this.frameOfReferenceUID) {
        this.frameOfReferenceUID = frameOfReference;
      } else if (frameOfReference !== this.frameOfReferenceUID) {
        imageMetadata['00200052'].Value = [this.frameOfReferenceUID];
      }

      return imageMetadata;
    });
    console.log('Loaded metadata for', metadata.length, 'images');
    const volumeImages = [];
    metadata.forEach((m) => {
      const image =
        new DicomMicroscopyViewer.metadata.VLWholeSlideMicroscopyImage({
          metadata: m,
        });
      const imageFlavor = image.ImageType[2];
      if (imageFlavor === 'VOLUME' || imageFlavor === 'THUMBNAIL') {
        volumeImages.push(image);
      } else {
        console.log('Image type not volume', image.ImageType);
      }
    });
    // Construct viewer instance
    const viewer = new DicomMicroscopyViewer.viewer.VolumeImageViewer({
      client,
      metadata: volumeImages,
      controls: [],
      bindings: {},
    });

    // Render viewer instance in the "viewport" HTML element
    viewer.render({ container: this.microscopyElement });
    // viewer.deactivateDragPanInteraction();
    this.viewer = viewer;
    this.resize();
    this.microscopyElement.style.background = 'green';
    this.microscopyElement.innerText = '';
  }

  /**
   * Converts and [x,y] video coordinate to a Cornerstone3D VideoViewport.
   *
   * @param  worldPos - world coord to convert to canvas
   * @returns Canvas position
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const pan: Point2 = this.internalCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();

    const subCanvasPos: Point2 = [
      (worldPos[0] + pan[0]) * worldToCanvasRatio,
      (worldPos[1] + pan[1]) * worldToCanvasRatio,
    ];

    const canvasPos: Point2 = [subCanvasPos[0], subCanvasPos[1]];

    return canvasPos;
  };

  public getPan(): Point2 {
    const worldPan = this.internalCamera.panWorld;
    return [worldPan[0], worldPan[1]];
  }

  public getRotation = () => 0;

  protected canvasToIndex = (canvasPos: Point2): Point2 => {
    const transform = this.getTransform();
    transform.invert();

    return transform.transformPoint(canvasPos);
  };

  protected indexToCanvas = (indexPos: Point2): Point2 => {
    const transform = this.getTransform();
    return transform.transformPoint(indexPos);
  };

  private showWSI() {
    if (!this.viewer) {
      return;
    }

    const {
      imageMetadata,
      frameOfReferenceUID,
      size,
      boundingBox,
      numLevels,
      physicalOffset,
      physicalSize,
    } = this.viewer;
    console.log(
      'image data',
      size,
      numLevels,
      physicalOffset,
      physicalSize,
      boundingBox,
      imageMetadata
    );
    const _map = Symbol('map');
    const map = this.viewer[_map];
    console.log('map=', map);
    window.viewer = this.viewer;
    window.map = map;
  }

  private refreshRenderValues() {
    this.showWSI();

    // this means that each unit (pixel) in the world (video) would be
    // represented by n pixels in the canvas.
    let worldToCanvasRatio = this.canvas.width / this.slideHeight;

    if (this.slideWidth * worldToCanvasRatio > this.canvas.height) {
      // If by fitting the width, we exceed the height of the viewport, then we need to decrease the
      // size of the viewport further by considering its verticality.
      const secondWorldToCanvasRatio =
        this.canvas.height / (this.slideWidth * worldToCanvasRatio);

      worldToCanvasRatio *= secondWorldToCanvasRatio;
    }

    // Set the width as big as possible, this is the portion of the canvas
    // that the video will occupy.
    const drawWidth = Math.floor(this.slideHeight * worldToCanvasRatio);
    const drawHeight = Math.floor(this.slideWidth * worldToCanvasRatio);

    // calculate x and y offset in order to center the image
    const xOffsetCanvas = this.canvas.width / 2 - drawWidth / 2;
    const yOffsetCanvas = this.canvas.height / 2 - drawHeight / 2;

    const xOffsetWorld = xOffsetCanvas / worldToCanvasRatio;
    const yOffsetWorld = yOffsetCanvas / worldToCanvasRatio;

    this.internalCamera.panWorld = [xOffsetWorld, yOffsetWorld];
    this.internalCamera.parallelScale = worldToCanvasRatio;
  }

  private getWorldToCanvasRatio() {
    return this.internalCamera.parallelScale;
  }

  private getCanvasToWorldRatio() {
    return 1.0 / this.internalCamera.parallelScale;
  }

  public customRenderViewportToCanvas = () => {
    // console.log('TODO - custom render');
  };

  protected getTransform() {
    const panWorld: Point2 = this.internalCamera.panWorld;
    const worldToCanvasRatio: number = this.getWorldToCanvasRatio();
    const canvasToWorldRatio: number = this.getCanvasToWorldRatio();
    const halfCanvas = [this.canvas.width / 2, this.canvas.height / 2];
    const halfCanvasWorldCoordinates = [
      halfCanvas[0] * canvasToWorldRatio,
      halfCanvas[1] * canvasToWorldRatio,
    ];
    const transform = new Transform();

    // Translate to the center of the canvas (move origin of the transform
    // to the center of the canvas)
    transform.translate(halfCanvas[0], halfCanvas[1]);

    // Scale
    transform.scale(worldToCanvasRatio, worldToCanvasRatio);

    // Apply the translation
    transform.translate(panWorld[0], panWorld[1]);

    // Translate back
    transform.translate(
      -halfCanvasWorldCoordinates[0],
      -halfCanvasWorldCoordinates[1]
    );
    return transform;
  }
}

export default WSIViewport;
