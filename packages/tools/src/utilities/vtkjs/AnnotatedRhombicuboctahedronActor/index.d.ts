import vtkActor, {
  IActorInitialValues,
} from '@kitware/vtk.js/Rendering/Core/Actor';

export interface IStyle {
  text?: string;
  faceColor?: string;
  faceRotation?: number;
  fontFamily?: string;
  fontColor?: string;
  fontStyle?: string;
  fontSizeScale?: (res: number) => number;
  edgeThickness?: number;
  edgeColor?: string;
  resolution?: number;
}

export interface IFaceProperty extends IStyle {
  text?: string;
  faceRotation?: number;
}

export interface IAnnotatedRhombicuboctahedronActorInitialValues
  extends IActorInitialValues {
  defaultStyle?: IStyle;
  showMainFaces?: boolean;
  showEdgeFaces?: boolean;
  showCornerFaces?: boolean;
  scale?: number;
}

export interface vtkAnnotatedRhombicuboctahedronActor extends vtkActor {
  /**
   * Set the default style.
   * @param {IStyle} style
   */
  setDefaultStyle(style: IStyle): boolean;

  /**
   * The +X face property.
   * @param {IFaceProperty} prop +X face property
   */
  setXPlusFaceProperty(prop: IFaceProperty): boolean;

  /**
   * The -X face property.
   * @param {IFaceProperty} prop The -X face property.
   */
  setXMinusFaceProperty(prop: IFaceProperty): boolean;

  /**
   * The +Y face property.
   * @param {IFaceProperty} prop The +Y face property.
   */
  setYPlusFaceProperty(prop: IFaceProperty): boolean;

  /**
   * The -Y face property.
   * @param {IFaceProperty} prop The -Y face property.
   */
  setYMinusFaceProperty(prop: IFaceProperty): boolean;

  /**
   * The +Z face property.
   * @param {IFaceProperty} prop The +Z face property.
   */
  setZPlusFaceProperty(prop: IFaceProperty): boolean;

  /**
   * The -Z face property.
   * @param {IFaceProperty} prop The -Z face property.
   */
  setZMinusFaceProperty(prop: IFaceProperty): boolean;

  /**
   * Set whether to show the 6 main square faces.
   * @param {Boolean} show
   */
  setShowMainFaces(show: boolean): void;

  /**
   * Get whether the 6 main square faces are shown.
   */
  getShowMainFaces(): boolean;

  /**
   * Set whether to show the 12 edge square faces.
   * @param {Boolean} show
   */
  setShowEdgeFaces(show: boolean): void;

  /**
   * Get whether the 12 edge square faces are shown.
   */
  getShowEdgeFaces(): boolean;

  /**
   * Set whether to show the 8 corner triangular faces.
   * @param {Boolean} show
   */
  setShowCornerFaces(show: boolean): void;

  /**
   * Get whether the 8 corner triangular faces are shown.
   */
  getShowCornerFaces(): boolean;

  /**
   * Set the scale of the rhombicuboctahedron.
   * @param {Number} scale
   */
  setRhombScale(scale: number): void;

  /**
   * Get the scale of the rhombicuboctahedron.
   */
  getScale(): number;
}

/**
 * Method use to decorate a given object (publicAPI+model) with vtkAnnotatedRhombicuboctahedronActor characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param {IAnnotatedRhombicuboctahedronActorInitialValues} [initialValues] (default: {})
 */
export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IAnnotatedRhombicuboctahedronActorInitialValues
): void;

/**
 * Method use to create a new instance of vtkAnnotatedRhombicuboctahedronActor
 * @param {IAnnotatedRhombicuboctahedronActorInitialValues} [initialValues] for pre-setting some of its content
 */
export function newInstance(
  initialValues?: IAnnotatedRhombicuboctahedronActorInitialValues
): vtkAnnotatedRhombicuboctahedronActor;

/**
 * vtkAnnotatedRhombicuboctahedronActor is an actor that displays a rhombicuboctahedron
 * with annotated faces. Similar to vtkAnnotatedCubeActor but uses a rhombicuboctahedron
 * geometry which has 26 faces (6 main squares, 12 edge squares, 8 corner triangles).
 *
 * The 6 main square faces can be annotated with text and custom colors, similar to
 * vtkAnnotatedCubeActor. The edge and corner faces can be toggled on/off.
 */
export declare const vtkAnnotatedRhombicuboctahedronActor: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};

export default vtkAnnotatedRhombicuboctahedronActor;
