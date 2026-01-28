import macro from '@kitware/vtk.js/macros';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';
import ImageHelper from '@kitware/vtk.js/Common/Core/ImageHelper';
import vtkRhombicuboctahedronSource from '../RhombicuboctahedronSource';

// Face connectivity arrays for reference
const MAIN_FACES = [
  4,
  0,
  1,
  2,
  3, // Bottom (z = -phi) - cell 0
  4,
  4,
  5,
  6,
  7, // Top (z = +phi) - cell 1
  4,
  8,
  9,
  10,
  11, // Front (y = -phi) - cell 2
  4,
  12,
  13,
  14,
  15, // Back (y = +phi) - cell 3
  4,
  16,
  17,
  18,
  19, // Left (x = -phi) - cell 4
  4,
  20,
  21,
  22,
  23, // Right (x = +phi) - cell 5
];

// Vertex positions for the rhombicuboctahedron (same as RhombicuboctahedronSource)
function getRhombicuboctahedronVertices(scale = 1.0) {
  const phi = 1.4; // Match OrientationControllerTool
  const faceSize = 0.95;

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

  // Scale all vertices
  for (let i = 0; i < vertices.length; i++) {
    vertices[i] *= scale;
  }

  return vertices;
}

// Generate 2D texture coordinates for each face
// Only main face vertices get texture coordinates that show text
// Edge/corner vertices get coordinates that map to blank areas
function generateTextureCoordinates() {
  const tcoords = [];

  // Main face vertices (get text coordinates):
  // Bottom: 0,1,2,3; Top: 4,5,6,7; Front: 8,9,10,11; Back: 12,13,14,15
  // Left: 16,17,18,19; Right: 20,21,22,23

  // Edge/corner vertices (get blank coordinates):
  // These are vertices used by multiple faces - assign to blank areas

  for (let i = 0; i < 24; i++) {
    let u = 0.5,
      v = 0.5; // Default to center (blank area)

    // Only assign text coordinates to vertices that are primarily on main faces
    // and not shared extensively with edges/corners

    // For simplicity, let's assign text coordinates only to the "face-center" vertices
    // and leave edge vertices with blank coordinates

    // Bottom face (z = -phi): vertices 0,1,2,3 - these are edge vertices, keep blank
    // Top face (z = +phi): vertices 4,5,6,7 - these are edge vertices, keep blank
    // Front face (y = -phi): vertices 8,9,10,11 - these are edge vertices, keep blank
    // Back face (y = +phi): vertices 12,13,14,15 - these are edge vertices, keep blank
    // Left face (x = -phi): vertices 16,17,18,19 - these are edge vertices, keep blank
    // Right face (x = +phi): vertices 20,21,22,23 - these are edge vertices, keep blank

    // All vertices are actually edge vertices since they connect faces!
    // So this approach won't work.

    // Alternative: assign all vertices to blank coordinates (0.5, 0.5)
    // and only the main face polygons will get textured properly

    // Actually, the issue is that ALL vertices are used by the main faces,
    // so they all get texture coordinates. The edge faces inherit these coordinates.

    // The real solution is to use cell-based coloring for edge faces,
    // not texture coordinates.

    // For now, assign all vertices to blank coordinates to avoid text on edges
    u = 0.5;
    v = 0.5;

    tcoords.push(u, v);
  }

  return tcoords;
}

// Create separate meshes for different face types
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
    // Generate 2D texture coordinates for each vertex
    // Texture atlas layout: 3x2 grid (3 columns, 2 rows)
    // [0][1][2]
    // [3][4][5]
    // Each cell is 1/3 wide and 1/2 tall
    const tcoords = [];

    // For each of the 6 faces (24 vertices total, 4 per face)
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
      const col = faceIdx % 3;
      const row = Math.floor(faceIdx / 3);

      // Calculate texture coordinates for this face's section
      const u0 = col / 3.0; // Left
      const u1 = (col + 1) / 3.0; // Right
      const v0 = row / 2.0; // Bottom
      const v1 = (row + 1) / 2.0; // Top

      // Map quad vertices to this section of the atlas
      tcoords.push(u0, v0); // Bottom-left
      tcoords.push(u1, v0); // Bottom-right
      tcoords.push(u1, v1); // Top-right
      tcoords.push(u0, v1); // Top-left
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
    // Assign solid color to all edge faces (12 faces)
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
    // Assign solid color to all corner faces (8 triangular faces)
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

// ----------------------------------------------------------------------------
// vtkAnnotatedRhombicuboctahedronActor
// ----------------------------------------------------------------------------
// Helper function to create texture atlas with all 6 faces
// ----------------------------------------------------------------------------

function createTextureAtlas(faceTextureData) {
  // Create a 3x2 grid for 6 faces (3 columns, 2 rows)
  const faceSize = 256;
  const canvas = document.createElement('canvas');
  canvas.width = faceSize * 3; // 3 columns
  canvas.height = faceSize * 2; // 2 rows
  const ctx = canvas.getContext('2d');

  // Draw each face in the grid
  // Layout: [0][1][2]
  //         [3][4][5]
  faceTextureData.forEach((data, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = col * faceSize;
    const y = row * faceSize;

    // Draw background color
    ctx.fillStyle = `rgb(${data.faceColor[0]}, ${data.faceColor[1]}, ${data.faceColor[2]})`;
    ctx.fillRect(x, y, faceSize, faceSize);

    // Draw text if provided with rotation and flip
    if (data.text) {
      ctx.save();
      ctx.translate(x + faceSize / 2, y + faceSize / 2);

      // Apply flip if specified
      if (data.flipVertical) {
        ctx.scale(1, -1);
      }
      if (data.flipHorizontal) {
        ctx.scale(-1, 1);
      }

      // Apply rotation
      ctx.rotate(((data.rotation || 0) * Math.PI) / 180);

      ctx.fillStyle = `rgb(${data.textColor[0]}, ${data.textColor[1]}, ${data.textColor[2]})`;
      ctx.font = 'bold 180px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.text, 0, 0);
      ctx.restore();
    }
  });

  // Convert to VTK image
  return ImageHelper.canvasToImageData(canvas);
}

// ----------------------------------------------------------------------------

function vtkAnnotatedRhombicuboctahedronActor(publicAPI, model) {
  model.classHierarchy.push('vtkAnnotatedRhombicuboctahedronActor');

  // Private variables

  // Private methods

  // No-op function since actors are created on demand
  function updateAllFaceTextures() {
    // Actors are created fresh each time getActors() is called
    // so no update is needed here
  }

  function createActors() {
    // Extract scale value
    let sourceScale = 1.0;
    if (model.scale !== undefined && model.scale !== null) {
      if (Array.isArray(model.scale)) {
        sourceScale = model.scale[0] || 1.0;
      } else if (typeof model.scale === 'number') {
        sourceScale = model.scale;
      }
    }

    const actors = [];

    // Extract RGB colors from face properties (hex strings to RGB arrays)
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

    // Parse fontColor from various formats (rgb(r,g,b), hex, named colors)
    const parseFontColor = (color) => {
      if (!color) {
        return [0, 0, 0]; // Default to black
      }

      // Handle rgb(r, g, b) format
      const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        return [
          parseInt(rgbMatch[1], 10),
          parseInt(rgbMatch[2], 10),
          parseInt(rgbMatch[3], 10),
        ];
      }

      // Handle hex format
      if (color.startsWith('#')) {
        return hexToRgb(color);
      }

      // Handle named colors
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

      // Default to black
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

    // Create main faces actor with texture atlas (includes text)
    if (model.showMainFaces !== false) {
      // Create texture atlas with all 6 faces
      // MAIN_FACES order: Bottom, Top, Front, Back, Left, Right
      // Map to: Z-, Z+, Y-, Y+, X-, X+
      // Atlas layout: 3x2 grid [0][1][2]
      //                        [3][4][5]
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

        // Add single texture atlas
        const texture = vtkTexture.newInstance();
        texture.setInputData(atlasImageData);
        texture.setInterpolate(true);
        mainFacesActor.addTexture(texture);

        // Disable backface culling and lighting
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

    // Create edge faces actor with solid colors
    if (model.showEdgeFaces !== false) {
      const edgeColor = [200, 200, 200]; // Light gray
      const edgeData = createEdgeFacesMesh(sourceScale, edgeColor);
      if (edgeData) {
        const edgeFacesActor = vtkActor.newInstance();
        const edgeMapper = vtkMapper.newInstance();
        edgeMapper.setInputData(edgeData);
        edgeMapper.setScalarModeToUseCellData();
        edgeMapper.setScalarVisibility(true);
        edgeMapper.setColorModeToDirectScalars();
        edgeFacesActor.setMapper(edgeMapper);

        // Disable backface culling and lighting
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

    // Create corner faces actor with solid colors
    if (model.showCornerFaces !== false) {
      const cornerColor = [150, 150, 150]; // Darker gray
      const cornerData = createCornerFacesMesh(sourceScale, cornerColor);
      if (cornerData) {
        const cornerFacesActor = vtkActor.newInstance();
        const cornerMapper = vtkMapper.newInstance();
        cornerMapper.setInputData(cornerData);
        cornerMapper.setScalarModeToUseCellData();
        cornerMapper.setScalarVisibility(true);
        cornerMapper.setColorModeToDirectScalars();
        cornerFacesActor.setMapper(cornerMapper);

        // Disable backface culling and lighting
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

  // Public methods
  publicAPI.setDefaultStyle = (style) => {
    model.defaultStyle = { ...model.defaultStyle, ...style };
    // Default style changes require recreating actors
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
      // Note: scale changes require recreating actors
    }
  };

  publicAPI.getActors = () => {
    return createActors();
  };

  // Constructor - no initial setup needed since actors are created on demand
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

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  vtkActor.extend(publicAPI, model, initialValues);

  // Initialize face properties
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
