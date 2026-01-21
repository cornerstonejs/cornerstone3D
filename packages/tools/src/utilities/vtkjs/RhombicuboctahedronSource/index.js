import macro from '@kitware/vtk.js/macros';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';

// A rhombicuboctahedron has 24 vertices, 26 faces (8 triangular, 18 square)
// Vertices are at permutations of (±1, ±1, ±φ) where φ = 1 + √2 ≈ 2.414

// Face connectivity arrays
// Format: [numPoints, index1, index2, ...]

// 6 main square faces aligned with axes (match OrientationControlTool - these are SKIPPED in edges/corners mode)
const MAIN_FACES = [
  4,
  0,
  1,
  2,
  3, // Bottom (z = -phi)
  4,
  4,
  5,
  6,
  7, // Top (z = +phi)
  4,
  8,
  9,
  10,
  11, // Front (y = -phi)
  4,
  12,
  13,
  14,
  15, // Back (y = +phi)
  4,
  16,
  17,
  18,
  19, // Left (x = -phi)
  4,
  20,
  21,
  22,
  23, // Right (x = +phi)
];

// 8 triangular corner faces (from OrientationControlTool)
const CORNER_FACES = [
  3,
  0,
  16,
  8, // Corner (-,-,-)
  3,
  1,
  9,
  20, // Corner (+,-,-)
  3,
  2,
  23,
  13, // Corner (+,+,-)
  3,
  3,
  12,
  19, // Corner (-,+,-)
  3,
  4,
  17,
  11, // Corner (-,-,+)
  3,
  5,
  10,
  21, // Corner (+,-,+)
  3,
  6,
  14,
  22, // Corner (+,+,+)
  3,
  7,
  18,
  15, // Corner (-,+,+)
];

// 12 square edge faces (from OrientationControlTool)
const EDGE_FACES = [
  // Edges around bottom face
  4,
  0,
  1,
  9,
  8, // bottom-front
  4,
  1,
  2,
  23,
  20, // bottom-right
  4,
  2,
  3,
  12,
  13, // bottom-back
  4,
  3,
  0,
  16,
  19, // bottom-left
  // Edges around top face
  4,
  4,
  5,
  10,
  11, // top-front
  4,
  5,
  6,
  22,
  21, // top-right
  4,
  6,
  7,
  15,
  14, // top-back
  4,
  7,
  4,
  17,
  18, // top-left
  // Vertical edges
  4,
  8,
  11,
  17,
  16, // front-left
  4,
  9,
  20,
  21,
  10, // front-right
  4,
  13,
  23,
  22,
  14, // back-right
  4,
  12,
  19,
  18,
  15, // back-left
];

// ----------------------------------------------------------------------------
// vtkRhombicuboctahedronSource methods
// ----------------------------------------------------------------------------

function vtkRhombicuboctahedronSource(publicAPI, model) {
  model.classHierarchy.push('vtkRhombicuboctahedronSource');

  publicAPI.requestData = (inData, outData) => {
    const polyData = outData[0]?.initialize() || vtkPolyData.newInstance();
    outData[0] = polyData;

    // Handle scale - it might be a number or an array
    let scale = 1.0;
    if (model.scale !== undefined && model.scale !== null) {
      if (Array.isArray(model.scale)) {
        // If it's an array, use the first element (uniform scaling)
        scale = model.scale[0] || 1.0;
      } else if (typeof model.scale === 'number') {
        scale = model.scale;
      }
    }

    const phi = 1.4; // Match OrientationControlTool
    const faceSize = 0.95;

    // Generate 24 vertices - exact same as OrientationControlTool
    const vertices = [];

    // Group 1: (±faceSize, ±faceSize, ±phi) - 8 vertices forming top/bottom faces
    vertices.push(-faceSize, -faceSize, -phi); // 0
    vertices.push(faceSize, -faceSize, -phi); // 1
    vertices.push(faceSize, faceSize, -phi); // 2
    vertices.push(-faceSize, faceSize, -phi); // 3
    vertices.push(-faceSize, -faceSize, phi); // 4
    vertices.push(faceSize, -faceSize, phi); // 5
    vertices.push(faceSize, faceSize, phi); // 6
    vertices.push(-faceSize, faceSize, phi); // 7

    // Group 2: (±faceSize, ±phi, ±faceSize) - 8 vertices forming front/back faces
    vertices.push(-faceSize, -phi, -faceSize); // 8
    vertices.push(faceSize, -phi, -faceSize); // 9
    vertices.push(faceSize, -phi, faceSize); // 10
    vertices.push(-faceSize, -phi, faceSize); // 11
    vertices.push(-faceSize, phi, -faceSize); // 12
    vertices.push(faceSize, phi, -faceSize); // 13
    vertices.push(faceSize, phi, faceSize); // 14
    vertices.push(-faceSize, phi, faceSize); // 15

    // Group 3: (±phi, ±faceSize, ±faceSize) - 8 vertices forming left/right faces
    vertices.push(-phi, -faceSize, -faceSize); // 16
    vertices.push(-phi, -faceSize, faceSize); // 17
    vertices.push(-phi, faceSize, faceSize); // 18
    vertices.push(-phi, faceSize, -faceSize); // 19
    vertices.push(phi, -faceSize, -faceSize); // 20
    vertices.push(phi, -faceSize, faceSize); // 21
    vertices.push(phi, faceSize, faceSize); // 22
    vertices.push(phi, faceSize, -faceSize); // 23

    // Generate texture coordinates BEFORE scaling (using original geometry)
    // Use normalized vertex positions as cube-map directions.
    // Dominant axis (±phi) determines the face selection.
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

    // Scale all vertices
    for (let i = 0; i < vertices.length; i++) {
      vertices[i] *= scale;
    }

    const vertexArray = Float64Array.from(vertices);

    // Set points data
    polyData.getPoints().setData(vertexArray, 3);

    // Calculate normals using the typed array
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

    // Set texture coordinates if generated
    if (textureCoords) {
      const tcoords = vtkDataArray.newInstance({
        name: 'TextureCoordinates',
        values: textureCoords,
        numberOfComponents: 3,
      });
      polyData.getPointData().setTCoords(tcoords);
    }

    // Build face arrays based on flags
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

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  scale: 1.0,
  generate3DTextureCoordinates: false,
  generateMainFaces: true,
  generateEdgeFaces: true,
  generateCornerFaces: true,
};

// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkRhombicuboctahedronSource'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
