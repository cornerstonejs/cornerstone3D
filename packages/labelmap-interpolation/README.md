# Cornerstone Segmentation Labelmap Interpolation

This package provides a utility for interpolating labelmaps in 3D medical imaging. It leverages the power of `itk-wasm` and `@itk-wasm/morphological-contour-interpolation` to perform morphological contour interpolation between segmented slices.

## Overview

When creating segmentations in 3D medical imaging, it's often time-consuming to manually segment every slice. This package allows you to segment only a subset of slices and then automatically interpolate the segmentation between those slices, significantly reducing the time required for complete 3D segmentation.

## Installation

```bash
npm install @cornerstonejs/labelmap-interpolation
```

## Usage

### Basic Usage

```typescript
import { interpolate } from '@cornerstonejs/labelmap-interpolation';

// Run interpolation on a specific segment
interpolate({
  segmentationId: 'MY_SEGMENTATION_ID',
  segmentIndex: 1, // The segment index to interpolate
});
```

### With Configuration Options

```typescript
import { interpolate } from '@cornerstonejs/labelmap-interpolation';

// Run interpolation with custom configuration
interpolate({
  segmentationId: 'MY_SEGMENTATION_ID',
  segmentIndex: 1,
  configuration: {
    axis: 2, // Axis along which to perform interpolation (0=X, 1=Y, 2=Z)
    noHeuristicAlignment: false, // Whether to disable heuristic alignment
    noUseDistanceTransform: false, // Whether to disable distance transform
    useCustomSlicePositions: false, // Whether to use custom slice positions
    preview: false // Whether to preview the interpolation result
  }
});
```

## How It Works

The interpolation process works by:

1. Taking a segmentation volume with segments on non-adjacent slices
2. Using morphological contour interpolation to fill in the missing slices
3. Updating the segmentation volume with the interpolated data

The package uses web workers to perform the interpolation in a background thread, preventing UI freezes during computation.

## License

MIT
