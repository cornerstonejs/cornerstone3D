# VTK.js Custom Sources

This directory contains custom VTK.js-style sources that follow the vtk.js design patterns and could potentially be contributed back to the vtk.js library.

## Components

### RhombicuboctahedronSource

A source object that generates a rhombicuboctahedron geometry - an Archimedean solid with 26 faces:

- 6 square faces aligned with coordinate axes
- 12 square faces along edges
- 8 triangular faces at corners

**Features:**

- Configurable scale
- 3D texture coordinate generation
- Selective face generation (main/edges/corners)
- Proper normals calculation

**Usage:**

```javascript
import vtkRhombicuboctahedronSource from './RhombicuboctahedronSource';

const source = vtkRhombicuboctahedronSource.newInstance({
  scale: 1.0,
  generate3DTextureCoordinates: true,
  generateMainFaces: true,
  generateEdgeFaces: true,
  generateCornerFaces: true,
});
```

### AnnotatedRhombicuboctahedronActor

An actor that combines the rhombicuboctahedron geometry with canvas-based face annotations, similar to vtkAnnotatedCubeActor.

**Features:**

- Text labels on the 6 main faces
- Customizable colors, fonts, and rotations per face
- Configurable edge and corner face visibility
- Canvas-based texture rendering

**Usage:**

```javascript
import vtkAnnotatedRhombicuboctahedronActor from './AnnotatedRhombicuboctahedronActor';

const actor = vtkAnnotatedRhombicuboctahedronActor.newInstance({
  showMainFaces: true,
  showEdgeFaces: true,
  showCornerFaces: true,
});

// Configure main faces with anatomical labels
actor.setXPlusFaceProperty({ text: 'L', faceColor: '#ffff00' });
actor.setXMinusFaceProperty({ text: 'R', faceColor: '#ffff00' });
actor.setYPlusFaceProperty({ text: 'P', faceColor: '#00ffff' });
actor.setYMinusFaceProperty({ text: 'A', faceColor: '#00ffff' });
actor.setZPlusFaceProperty({ text: 'S', faceColor: '#0000ff' });
actor.setZMinusFaceProperty({ text: 'I', faceColor: '#0000ff' });
```

## Design Patterns

These sources follow vtk.js conventions:

1. **Factory Pattern**: Use `newInstance()` and `extend()` methods
2. **Macro System**: Use vtk.js macros for common patterns
3. **Algorithm Pattern**: Sources implement `requestData()` for pipeline execution
4. **TypeScript Support**: Comprehensive `.d.ts` type definitions

## Integration with Cornerstone3D

The `OrientationController` tool demonstrates how to use these sources in a Cornerstone3D context, providing:

- Interactive 3D orientation control
- Clickable faces for camera reorientation
- Smooth animated transitions
- Configurable appearance and positioning

## Potential vtk.js Contribution

These sources are designed to be generic enough to contribute back to vtk.js:

- No Cornerstone-specific dependencies
- Follow vtk.js naming conventions
- Include comprehensive TypeScript definitions
- Well-documented API

To prepare for vtk.js contribution, these files would need:

1. Tests (following vtk.js test patterns)
2. Examples (HTML/JS demonstrations)
3. Documentation in vtk.js format
4. Integration into vtk.js build system
