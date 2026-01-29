import macro from '@kitware/vtk.js/macros';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';

const MAIN_FACES = [
  4, 0, 1, 2, 3, 4, 4, 5, 6, 7, 4, 8, 9, 10, 11, 4, 12, 13, 14, 15, 4, 16, 17,
  18, 19, 4, 20, 21, 22, 23,
];

const CORNER_FACES = [
  3, 0, 16, 8, 3, 1, 9, 20, 3, 2, 23, 13, 3, 3, 12, 19, 3, 4, 17, 11, 3, 5, 10,
  21, 3, 6, 14, 22, 3, 7, 18, 15,
];

const EDGE_FACES = [
  4, 0, 1, 9, 8, 4, 1, 2, 23, 20, 4, 2, 3, 12, 13, 4, 3, 0, 16, 19, 4, 4, 5, 10,
  11, 4, 5, 6, 22, 21, 4, 6, 7, 15, 14, 4, 7, 4, 17, 18, 4, 8, 11, 17, 16, 4, 9,
  20, 21, 10, 4, 13, 23, 22, 14, 4, 12, 19, 18, 15,
];

function vtkRhombicuboctahedronSource(publicAPI, model) {
  model.classHierarchy.push('vtkRhombicuboctahedronSource');

  publicAPI.requestData = (inData, outData) => {
    const polyData = outData[0]?.initialize() || vtkPolyData.newInstance();
    outData[0] = polyData;

    let scale = 1.0;
    if (model.scale !== undefined && model.scale !== null) {
      if (Array.isArray(model.scale)) {
        scale = model.scale[0] || 1.0;
      } else if (typeof model.scale === 'number') {
        scale = model.scale;
      }
    }

    const phi = 1.4;
    const faceSize = 0.95;
    const vertices = [];

    vertices.push(-faceSize, -faceSize, -phi);
    vertices.push(faceSize, -faceSize, -phi);
    vertices.push(faceSize, faceSize, -phi);
    vertices.push(-faceSize, faceSize, -phi);
    vertices.push(-faceSize, -faceSize, phi);
    vertices.push(faceSize, -faceSize, phi);
    vertices.push(faceSize, faceSize, phi);
    vertices.push(-faceSize, faceSize, phi);
    vertices.push(-faceSize, -phi, -faceSize);
    vertices.push(faceSize, -phi, -faceSize);
    vertices.push(faceSize, -phi, faceSize);
    vertices.push(-faceSize, -phi, faceSize);
    vertices.push(-faceSize, phi, -faceSize);
    vertices.push(faceSize, phi, -faceSize);
    vertices.push(faceSize, phi, faceSize);
    vertices.push(-faceSize, phi, faceSize);
    vertices.push(-phi, -faceSize, -faceSize);
    vertices.push(-phi, -faceSize, faceSize);
    vertices.push(-phi, faceSize, faceSize);
    vertices.push(-phi, faceSize, -faceSize);
    vertices.push(phi, -faceSize, -faceSize);
    vertices.push(phi, -faceSize, faceSize);
    vertices.push(phi, faceSize, faceSize);
    vertices.push(phi, faceSize, -faceSize);

    let textureCoords = null;
    if (model.generate3DTextureCoordinates) {
      textureCoords = new Float64Array(24 * 3);

      for (let i = 0; i < 24; i++) {
        const vx = vertices[i * 3];
        const vy = vertices[i * 3 + 1];
        const vz = vertices[i * 3 + 2];
        const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
        textureCoords[i * 3] = vx / len;
        textureCoords[i * 3 + 1] = vy / len;
        textureCoords[i * 3 + 2] = vz / len;
      }
    }

    for (let i = 0; i < vertices.length; i++) {
      vertices[i] *= scale;
    }

    const vertexArray = Float64Array.from(vertices);
    polyData.getPoints().setData(vertexArray, 3);

    const normals = new Float64Array(24 * 3);
    for (let i = 0; i < 24; i++) {
      const x = vertexArray[i * 3];
      const y = vertexArray[i * 3 + 1];
      const z = vertexArray[i * 3 + 2];
      const len = Math.sqrt(x * x + y * y + z * z);
      normals[i * 3] = x / len;
      normals[i * 3 + 1] = y / len;
      normals[i * 3 + 2] = z / len;
    }

    const normalArray = vtkDataArray.newInstance({
      name: 'Normals',
      values: normals,
      numberOfComponents: 3,
    });
    polyData.getPointData().setNormals(normalArray);

    if (textureCoords) {
      const tcoords = vtkDataArray.newInstance({
        name: 'TextureCoordinates',
        values: textureCoords,
        numberOfComponents: 3,
      });
      polyData.getPointData().setTCoords(tcoords);
    }

    const allFaces = [];
    if (model.generateMainFaces) {
      allFaces.push(...MAIN_FACES);
    }
    if (model.generateEdgeFaces) {
      allFaces.push(...EDGE_FACES);
    }
    if (model.generateCornerFaces) {
      allFaces.push(...CORNER_FACES);
    }

    if (allFaces.length > 0) {
      const polys = vtkCellArray.newInstance({
        values: Uint16Array.from(allFaces),
      });
      polyData.getPolys().deepCopy(polys);
    } else {
      polyData.getPolys().initialize();
    }

    polyData.modified();
  };
}

const DEFAULT_VALUES = {
  scale: 1.0,
  generate3DTextureCoordinates: false,
  generateMainFaces: true,
  generateEdgeFaces: true,
  generateCornerFaces: true,
};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  macro.obj(publicAPI, model);
  macro.setGet(publicAPI, model, [
    'scale',
    'generate3DTextureCoordinates',
    'generateMainFaces',
    'generateEdgeFaces',
    'generateCornerFaces',
  ]);

  macro.algo(publicAPI, model, 0, 1);
  vtkRhombicuboctahedronSource(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkRhombicuboctahedronSource'
);

export default { newInstance, extend };
