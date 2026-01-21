import macro from '@kitware/vtk.js/macros';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';
import ImageHelper from '@kitware/vtk.js/Common/Core/ImageHelper';
import vtkRhombicuboctahedronSource from '../RhombicuboctahedronSource';

// Mapping from anatomical faces to VTK cube map texture indices
// VTK cube map ordering: 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
// Rhombicuboctahedron faces: 0:bottom(-Z), 1:top(+Z), 2:front(-Y), 3:back(+Y), 4:left(-X), 5:right(+X)
const FACE_TO_INDEX = {
  xPlus: 0, // Right (+X)
  xMinus: 1, // Left (-X)
  yPlus: 2, // Back (+Y)
  yMinus: 3, // Front (-Y)
  zPlus: 4, // Top (+Z)
  zMinus: 5, // Bottom (-Z)
};

// ----------------------------------------------------------------------------
// vtkAnnotatedRhombicuboctahedronActor
// ----------------------------------------------------------------------------

function vtkAnnotatedRhombicuboctahedronActor(publicAPI, model) {
  model.classHierarchy.push('vtkAnnotatedRhombicuboctahedronActor');

  // Make sure face properties are not references to the default value
  model.xPlusFaceProperty = { ...model.xPlusFaceProperty };
  model.xMinusFaceProperty = { ...model.xMinusFaceProperty };
  model.yPlusFaceProperty = { ...model.yPlusFaceProperty };
  model.yMinusFaceProperty = { ...model.yMinusFaceProperty };
  model.zPlusFaceProperty = { ...model.zPlusFaceProperty };
  model.zMinusFaceProperty = { ...model.zMinusFaceProperty };

  // Private variables
  let rhombSource = null;

  const canvas = document.createElement('canvas');
  const mapper = vtkMapper.newInstance();
  const texture = vtkTexture.newInstance();
  texture.setInterpolate(true);
  texture.setRepeat(false);
  texture.setEdgeClamp(false);

  // Private methods
  function updateFaceTexture(faceName, newProp = null) {
    if (newProp) {
      Object.assign(model[`${faceName}FaceProperty`], newProp);
    }

    const prop = {
      ...model.defaultStyle,
      ...model[`${faceName}FaceProperty`],
    };

    // Set canvas resolution
    canvas.width = prop.resolution;
    canvas.height = prop.resolution;

    const ctxt = canvas.getContext('2d');

    // Set background color
    ctxt.fillStyle = prop.faceColor;
    ctxt.fillRect(0, 0, canvas.width, canvas.height);

    // Draw edge
    if (prop.edgeThickness > 0) {
      ctxt.strokeStyle = prop.edgeColor;
      ctxt.lineWidth = prop.edgeThickness * canvas.width;
      ctxt.strokeRect(0, 0, canvas.width, canvas.height);
    }

    // Set face rotation
    ctxt.save();

    // Vertical flip
    ctxt.translate(0, canvas.height);
    ctxt.scale(1, -1);

    ctxt.translate(canvas.width / 2, canvas.height / 2);
    ctxt.rotate(-Math.PI * (prop.faceRotation / 180.0));

    // Set foreground text
    const textSize = prop.fontSizeScale(prop.resolution);
    ctxt.fillStyle = prop.fontColor;
    ctxt.textAlign = 'center';
    ctxt.textBaseline = 'middle';
    ctxt.font = `${prop.fontStyle} ${textSize}px "${prop.fontFamily}"`;
    ctxt.fillText(prop.text, 0, 0);

    ctxt.restore();

    const vtkImage = ImageHelper.canvasToImageData(canvas);
    const faceIndex = FACE_TO_INDEX[faceName];
    texture.setInputData(vtkImage, faceIndex);
    texture.modified();
    publicAPI.modified();
  }

  function updateAllFaceTextures() {
    // Extract scale value - handle both number and array (from vtkActor's scale property)
    let sourceScale = 1.0;
    if (model.scale !== undefined && model.scale !== null) {
      if (Array.isArray(model.scale)) {
        sourceScale = model.scale[0] || 1.0;
      } else if (typeof model.scale === 'number') {
        sourceScale = model.scale;
      }
    }

    rhombSource = vtkRhombicuboctahedronSource.newInstance({
      generate3DTextureCoordinates: true,
      generateMainFaces: model.showMainFaces !== false,
      generateEdgeFaces: model.showEdgeFaces !== false,
      generateCornerFaces: model.showCornerFaces !== false,
      scale: sourceScale,
    });

    console.log(
      'AnnotatedRhombicuboctahedronActor: Setting mapper connection...'
    );
    mapper.setInputConnection(rhombSource.getOutputPort());

    // Get the output to verify it has data and compute bounds
    rhombSource.modified();
    rhombSource.update();
    const outputData = rhombSource.getOutputData();
    if (outputData) {
      // Force bounds computation
      outputData.computeBounds();
      outputData.modified();
    }

    // Force mapper to update
    mapper.update();
    mapper.modified();

    console.log('AnnotatedRhombicuboctahedronActor: Updating face textures...');
    updateFaceTexture('xPlus');
    updateFaceTexture('xMinus');
    updateFaceTexture('yPlus');
    updateFaceTexture('yMinus');
    updateFaceTexture('zPlus');
    updateFaceTexture('zMinus');

    if (texture.getNumberOfInputPorts && texture.getInputData) {
      const inputPorts = texture.getNumberOfInputPorts();
      console.log('AnnotatedRhombicuboctahedronActor: Texture inputs', {
        inputPorts,
      });
      for (let i = 0; i < Math.min(inputPorts, 6); i++) {
        const data = texture.getInputData(i);
        const scalars = data?.getPointData?.()?.getScalars?.();
        console.log('AnnotatedRhombicuboctahedronActor: Texture input data', {
          index: i,
          hasData: !!data,
          dimensions: data?.getDimensions?.(),
          extent: data?.getExtent?.(),
          hasScalars: !!scalars,
          numComps: scalars?.getNumberOfComponents?.(),
          dataType: scalars?.getDataType?.(),
        });
      }
    }
  }

  // Public methods
  publicAPI.setDefaultStyle = (style) => {
    model.defaultStyle = { ...model.defaultStyle, ...style };
    updateAllFaceTextures();
  };

  publicAPI.setXPlusFaceProperty = (prop) => updateFaceTexture('xPlus', prop);
  publicAPI.setXMinusFaceProperty = (prop) => updateFaceTexture('xMinus', prop);
  publicAPI.setYPlusFaceProperty = (prop) => updateFaceTexture('yPlus', prop);
  publicAPI.setYMinusFaceProperty = (prop) => updateFaceTexture('yMinus', prop);
  publicAPI.setZPlusFaceProperty = (prop) => updateFaceTexture('zPlus', prop);
  publicAPI.setZMinusFaceProperty = (prop) => updateFaceTexture('zMinus', prop);

  publicAPI.setShowMainFaces = (show) => {
    if (model.showMainFaces !== show) {
      model.showMainFaces = show;
      updateAllFaceTextures();
    }
  };

  publicAPI.setShowEdgeFaces = (show) => {
    if (model.showEdgeFaces !== show) {
      model.showEdgeFaces = show;
      updateAllFaceTextures();
    }
  };

  publicAPI.setShowCornerFaces = (show) => {
    if (model.showCornerFaces !== show) {
      model.showCornerFaces = show;
      updateAllFaceTextures();
    }
  };

  publicAPI.setRhombScale = (scale) => {
    if (model.scale !== scale) {
      model.scale = scale;
      updateAllFaceTextures();
    }
  };

  // Constructor
  updateAllFaceTextures();

  // Set mapper
  mapper.setInputConnection(rhombSource.getOutputPort());
  publicAPI.setMapper(mapper);

  // Set texture
  publicAPI.addTexture(texture);
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

export const DEFAULT_VALUES = {
  defaultStyle: {
    text: '',
    faceColor: 'white',
    faceRotation: 0,
    fontFamily: 'Arial',
    fontColor: 'black',
    fontStyle: 'normal',
    fontSizeScale: (resolution) => resolution / 1.8,
    edgeThickness: 0.1,
    edgeColor: 'black',
    resolution: 200,
  },
  showMainFaces: true,
  showEdgeFaces: true,
  showCornerFaces: true,
  scale: 1.0,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  vtkActor.extend(publicAPI, model, initialValues);

  macro.get(publicAPI, model, [
    'defaultStyle',
    'xPlusFaceProperty',
    'xMinusFaceProperty',
    'yPlusFaceProperty',
    'yMinusFaceProperty',
    'zPlusFaceProperty',
    'zMinusFaceProperty',
    'showMainFaces',
    'showEdgeFaces',
    'showCornerFaces',
    'scale',
  ]);

  // Object methods
  vtkAnnotatedRhombicuboctahedronActor(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkAnnotatedRhombicuboctahedronActor'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
