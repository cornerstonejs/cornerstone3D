import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { getConfiguration, setConfiguration } from '../src/init';
import { getDefaultLabelmapVoxelRepresentation } from '../src/loaders/imageLoader';
import VoxelManagerEnum from '../src/enums/VoxelManagerEnum';

/**
 * `segmentation.labelmapVoxelRepresentation` is what a deployment sets to move
 * labelmaps onto the RLE representation, so it has to behave for a value that
 * arrived as a plain string out of a host's configuration, and it has to fail
 * loudly rather than quietly doing nothing.
 */
describe('getDefaultLabelmapVoxelRepresentation', () => {
  const original = getConfiguration();

  afterEach(() => {
    setConfiguration(original);
    jest.restoreAllMocks();
  });

  function configure(labelmapVoxelRepresentation) {
    setConfiguration({
      ...original,
      segmentation: { labelmapVoxelRepresentation },
    });
  }

  it('defaults to Volume so an unconfigured deployment is unchanged', () => {
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(
      VoxelManagerEnum.Volume
    );
  });

  it('defaults to Volume when the config has no segmentation section at all', () => {
    setConfiguration({ ...original, segmentation: undefined });
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(
      VoxelManagerEnum.Volume
    );
  });

  it('accepts the enum member', () => {
    configure(VoxelManagerEnum.RLE);
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(VoxelManagerEnum.RLE);
  });

  it('accepts the bare string, as a JSON configuration would supply it', () => {
    configure('RLE');
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(VoxelManagerEnum.RLE);

    configure('Volume');
    expect(getDefaultLabelmapVoxelRepresentation()).toBe(
      VoxelManagerEnum.Volume
    );
  });

  it('warns and falls back to Volume on an unrecognized value', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    // Wrong case is the likely typo, and the one that used to be a silent no-op.
    configure('rle');

    expect(getDefaultLabelmapVoxelRepresentation()).toBe(
      VoxelManagerEnum.Volume
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rle'));
  });
});
