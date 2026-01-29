import macro from '@kitware/vtk.js/macros';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';
import ImageHelper from '@kitware/vtk.js/Common/Core/ImageHelper';
import vtkRhombicuboctahedronSource from '../RhombicuboctahedronSource';

function createMainFacesMesh(scale, faceColors, faceTextures) {
  const source = vtkRhombicuboctahedronSource.newInstance({
    generate3DTextureCoordinates: false,
    generateMainFaces: true,
    generateEdgeFaces: false,
    generateCornerFaces: false,
    scale: scale,
  });

  source.update();
  const data = source.getOutputData();

  if (data) {
    const tcoords = [];
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
      const col = faceIdx % 3;
      const row = Math.floor(faceIdx / 3);
      const u0 = col / 3.0;
      const u1 = (col + 1) / 3.0;
      const v0 = row / 2.0;
      const v1 = (row + 1) / 2.0;
      tcoords.push(u0, v0);
      tcoords.push(u1, v0);
      tcoords.push(u1, v1);
      tcoords.push(u0, v1);
    }

    const tcoordsArray = vtkDataArray.newInstance({
      name: 'TextureCoordinates',
      values: new Float32Array(tcoords),
      numberOfComponents: 2,
    });

    data.getPointData().setTCoords(tcoordsArray);
    data.modified();
  }

  return data;
}

function createEdgeFacesMesh(scale, color) {
  const source = vtkRhombicuboctahedronSource.newInstance({
    generate3DTextureCoordinates: false,
    generateMainFaces: false,
    generateEdgeFaces: true,
    generateCornerFaces: false,
    scale: scale,
  });

  source.update();
  const data = source.getOutputData();

  if (data) {
    const colors = [];
    const numCells = data.getNumberOfCells();
    for (let i = 0; i < numCells; i++) {
      colors.push(color[0], color[1], color[2], 255);
    }

    const colorsArray = vtkDataArray.newInstance({
      name: 'Colors',
      values: new Uint8Array(colors),
      numberOfComponents: 4,
    });
    data.getCellData().setScalars(colorsArray);
    data.modified();
  }

  return data;
}

function createCornerFacesMesh(scale, color) {
  const source = vtkRhombicuboctahedronSource.newInstance({
    generate3DTextureCoordinates: false,
    generateMainFaces: false,
    generateEdgeFaces: false,
    generateCornerFaces: true,
    scale: scale,
  });

  source.update();
  const data = source.getOutputData();

  if (data) {
    const colors = [];
    const numCells = data.getNumberOfCells();
    for (let i = 0; i < numCells; i++) {
      colors.push(color[0], color[1], color[2], 255);
    }

    const colorsArray = vtkDataArray.newInstance({
      name: 'Colors',
      values: new Uint8Array(colors),
      numberOfComponents: 4,
    });
    data.getCellData().setScalars(colorsArray);
    data.modified();
  }

  return data;
}

function createTextureAtlas(faceTextureData) {
  const faceSize = 256;
  const canvas = document.createElement('canvas');
  canvas.width = faceSize * 3;
  canvas.height = faceSize * 2;
  const ctx = canvas.getContext('2d');

  faceTextureData.forEach((data, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = col * faceSize;
    const y = row * faceSize;

    ctx.fillStyle = `rgb(${data.faceColor[0]}, ${data.faceColor[1]}, ${data.faceColor[2]})`;
    ctx.fillRect(x, y, faceSize, faceSize);

    if (data.text) {
      ctx.save();
      ctx.translate(x + faceSize / 2, y + faceSize / 2);
      if (data.flipVertical) {
        ctx.scale(1, -1);
      }
      if (data.flipHorizontal) {
        ctx.scale(-1, 1);
      }
      ctx.rotate(((data.rotation || 0) * Math.PI) / 180);

      ctx.fillStyle = `rgb(${data.textColor[0]}, ${data.textColor[1]}, ${data.textColor[2]})`;
      ctx.font = 'bold 180px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.text, 0, 0);
      ctx.restore();
    }
  });

  return ImageHelper.canvasToImageData(canvas);
}

function vtkAnnotatedRhombicuboctahedronActor(publicAPI, model) {
  model.classHierarchy.push('vtkAnnotatedRhombicuboctahedronActor');

  function updateAllFaceTextures() {}

  function createActors() {
    let sourceScale = 1.0;
    if (model.scale !== undefined && model.scale !== null) {
      if (Array.isArray(model.scale)) {
        sourceScale = model.scale[0] || 1.0;
      } else if (typeof model.scale === 'number') {
        sourceScale = model.scale;
      }
    }

    const actors = [];

    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16),
          ]
        : [255, 255, 255];
    };

    const parseFontColor = (color) => {
      if (!color) {
        return [0, 0, 0];
      }

      const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        return [
          parseInt(rgbMatch[1], 10),
          parseInt(rgbMatch[2], 10),
          parseInt(rgbMatch[3], 10),
        ];
      }

      if (color.startsWith('#')) {
        return hexToRgb(color);
      }

      const namedColors = {
        black: [0, 0, 0],
        white: [255, 255, 255],
        red: [255, 0, 0],
        green: [0, 255, 0],
        blue: [0, 0, 255],
      };
      if (namedColors[color.toLowerCase()]) {
        return namedColors[color.toLowerCase()];
      }

      return [0, 0, 0];
    };

    const faceColors = {
      zMinus: hexToRgb(
        model.zMinusFaceProperty.faceColor || model.defaultStyle.faceColor
      ),
      zPlus: hexToRgb(
        model.zPlusFaceProperty.faceColor || model.defaultStyle.faceColor
      ),
      yMinus: hexToRgb(
        model.yMinusFaceProperty.faceColor || model.defaultStyle.faceColor
      ),
      yPlus: hexToRgb(
        model.yPlusFaceProperty.faceColor || model.defaultStyle.faceColor
      ),
      xMinus: hexToRgb(
        model.xMinusFaceProperty.faceColor || model.defaultStyle.faceColor
      ),
      xPlus: hexToRgb(
        model.xPlusFaceProperty.faceColor || model.defaultStyle.faceColor
      ),
    };

    if (model.showMainFaces !== false) {
      const faceTextureData = [
        {
          faceColor: faceColors.zMinus,
          text: model.zMinusFaceProperty.text || 'I',
          textColor: parseFontColor(
            model.zMinusFaceProperty.fontColor || model.defaultStyle.fontColor
          ),
          rotation: 0,
        },
        {
          faceColor: faceColors.zPlus,
          text: model.zPlusFaceProperty.text || 'S',
          textColor: parseFontColor(
            model.zPlusFaceProperty.fontColor || model.defaultStyle.fontColor
          ),
          rotation: 0,
          flipVertical: true,
        },
        {
          faceColor: faceColors.yMinus,
          text: model.yMinusFaceProperty.text || 'A',
          textColor: parseFontColor(
            model.yMinusFaceProperty.fontColor || model.defaultStyle.fontColor
          ),
          rotation: 180,
        },
        {
          faceColor: faceColors.yPlus,
          text: model.yPlusFaceProperty.text || 'P',
          textColor: parseFontColor(
            model.yPlusFaceProperty.fontColor || model.defaultStyle.fontColor
          ),
          rotation: 180,
        },
        {
          faceColor: faceColors.xMinus,
          text: model.xMinusFaceProperty.text || 'L',
          textColor: parseFontColor(
            model.xMinusFaceProperty.fontColor || model.defaultStyle.fontColor
          ),
          rotation: 90,
          flipVertical: true,
        },
        {
          faceColor: faceColors.xPlus,
          text: model.xPlusFaceProperty.text || 'R',
          textColor: parseFontColor(
            model.xPlusFaceProperty.fontColor || model.defaultStyle.fontColor
          ),
          rotation: 90,
        },
      ];

      const atlasImageData = createTextureAtlas(faceTextureData);

      const mainData = createMainFacesMesh(sourceScale, faceColors, null);
      if (mainData) {
        const mainFacesActor = vtkActor.newInstance();
        const mainMapper = vtkMapper.newInstance();
        mainMapper.setInputData(mainData);
        mainFacesActor.setMapper(mainMapper);

        const texture = vtkTexture.newInstance();
        texture.setInputData(atlasImageData);
        texture.setInterpolate(true);
        mainFacesActor.addTexture(texture);

        const property = mainFacesActor.getProperty();
        property.setBackfaceCulling(false);
        property.setFrontfaceCulling(false);
        property.setLighting(false);
        property.setAmbient(1.0);
        property.setDiffuse(0.0);
        property.setSpecular(0.0);

        actors.push(mainFacesActor);
      }
    }

    if (model.showEdgeFaces !== false) {
      const edgeColor = [200, 200, 200];
      const edgeData = createEdgeFacesMesh(sourceScale, edgeColor);
      if (edgeData) {
        const edgeFacesActor = vtkActor.newInstance();
        const edgeMapper = vtkMapper.newInstance();
        edgeMapper.setInputData(edgeData);
        edgeMapper.setScalarModeToUseCellData();
        edgeMapper.setScalarVisibility(true);
        edgeMapper.setColorModeToDirectScalars();
        edgeFacesActor.setMapper(edgeMapper);

        const edgeProperty = edgeFacesActor.getProperty();
        edgeProperty.setBackfaceCulling(false);
        edgeProperty.setFrontfaceCulling(false);
        edgeProperty.setLighting(false);
        edgeProperty.setAmbient(1.0);
        edgeProperty.setDiffuse(0.0);
        edgeProperty.setSpecular(0.0);

        actors.push(edgeFacesActor);
      }
    }

    if (model.showCornerFaces !== false) {
      const cornerColor = [150, 150, 150];
      const cornerData = createCornerFacesMesh(sourceScale, cornerColor);
      if (cornerData) {
        const cornerFacesActor = vtkActor.newInstance();
        const cornerMapper = vtkMapper.newInstance();
        cornerMapper.setInputData(cornerData);
        cornerMapper.setScalarModeToUseCellData();
        cornerMapper.setScalarVisibility(true);
        cornerMapper.setColorModeToDirectScalars();
        cornerFacesActor.setMapper(cornerMapper);

        const cornerProperty = cornerFacesActor.getProperty();
        cornerProperty.setBackfaceCulling(false);
        cornerProperty.setFrontfaceCulling(false);
        cornerProperty.setLighting(false);
        cornerProperty.setAmbient(1.0);
        cornerProperty.setDiffuse(0.0);
        cornerProperty.setSpecular(0.0);

        actors.push(cornerFacesActor);
      }
    }

    return actors;
  }

  publicAPI.setDefaultStyle = (style) => {
    model.defaultStyle = { ...model.defaultStyle, ...style };
  };

  publicAPI.setXPlusFaceProperty = (prop) => {
    Object.assign(model.xPlusFaceProperty, prop);
    publicAPI.modified();
  };
  publicAPI.setXMinusFaceProperty = (prop) => {
    Object.assign(model.xMinusFaceProperty, prop);
    publicAPI.modified();
  };
  publicAPI.setYPlusFaceProperty = (prop) => {
    Object.assign(model.yPlusFaceProperty, prop);
    publicAPI.modified();
  };
  publicAPI.setYMinusFaceProperty = (prop) => {
    Object.assign(model.yMinusFaceProperty, prop);
    publicAPI.modified();
  };
  publicAPI.setZPlusFaceProperty = (prop) => {
    Object.assign(model.zPlusFaceProperty, prop);
    publicAPI.modified();
  };
  publicAPI.setZMinusFaceProperty = (prop) => {
    Object.assign(model.zMinusFaceProperty, prop);
    publicAPI.modified();
  };

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
    }
  };

  publicAPI.getActors = () => {
    return createActors();
  };
}

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
  xPlusFaceProperty: {},
  xMinusFaceProperty: {},
  yPlusFaceProperty: {},
  yMinusFaceProperty: {},
  zPlusFaceProperty: {},
  zMinusFaceProperty: {},
  showMainFaces: true,
  showEdgeFaces: true,
  showCornerFaces: true,
  scale: 1.0,
};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkActor.extend(publicAPI, model, initialValues);

  model.xPlusFaceProperty = { ...model.xPlusFaceProperty };
  model.xMinusFaceProperty = { ...model.xMinusFaceProperty };
  model.yPlusFaceProperty = { ...model.yPlusFaceProperty };
  model.yMinusFaceProperty = { ...model.yMinusFaceProperty };
  model.zPlusFaceProperty = { ...model.zPlusFaceProperty };
  model.zMinusFaceProperty = { ...model.zMinusFaceProperty };

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

  vtkAnnotatedRhombicuboctahedronActor(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkAnnotatedRhombicuboctahedronActor'
);

export default { newInstance, extend };
