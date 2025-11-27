import { inPlaneDecimationModifier } from '../../src/loaders/enhancedVolumeModifiers';

const createMetadata = () => ({
  Columns: 128,
  Rows: 64,
  PixelSpacing: [0.6, 0.4],
  PhotometricInterpretation: 'MONOCHROME2',
  ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
  BitsAllocated: 16,
  PixelRepresentation: 0,
});

const createBaseProps = () => ({
  volumeId: 'volume',
  metadata: createMetadata(),
  dimensions: [128, 64, 32],
  spacing: [0.4, 0.6, 1],
  origin: [0, 0, 0],
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  imageIds: ['frame-1', 'frame-2'],
  dataType: 'Uint8Array',
  numberOfComponents: 1,
  voxelManager: null,
});

const createContext = (ijkDecimation) => ({
  volumeId: 'volume',
  imageIds: ['frame-1', 'frame-2'],
  options: {
    ijkDecimation,
  },
});

describe('inPlaneDecimationModifier', () => {
  it('returns the original props when no decimation is requested', () => {
    const baseProps = createBaseProps();
    const context = createContext([1, 1, 1]);

    const result = inPlaneDecimationModifier.apply(baseProps, context);

    expect(result).toBe(baseProps);
  });

  it('reduces dimensions and updates spacing/metadata when column and row decimation are applied', () => {
    const baseProps = createBaseProps();
    const context = createContext([2, 4, 1]);

    const result = inPlaneDecimationModifier.apply(baseProps, context);

    expect(result.dimensions).toEqual([64, 16, 32]);
    expect(result.spacing).toEqual([0.8, 2.4, 1]);
    expect(result.metadata.Columns).toBe(64);
    expect(result.metadata.Rows).toBe(16);
    expect(result.metadata.PixelSpacing).toEqual([2.4, 0.8]);
    expect(result.dimensions[2]).toBe(32);
  });
});
