// TODO: add support for WGSL files
const shader = `
const MAX_STRENGTH = 65535f;

// Workgroup size - X*Y*Z must be multiple of 32 for better performance
override workGroupSizeX = 1u;
override workGroupSizeY = 1u;
override workGroupSizeZ = 1u;

// Compare the current voxel to neighbors using a 9x9x9 window
override windowSize = 9i;

struct Params {
  size: vec3u,
  iteration: u32,
}

// New structure to track bounds of modified voxels
struct Bounds {
  minX: atomic<i32>,
  minY: atomic<i32>,
  minZ: atomic<i32>,
  maxX: atomic<i32>,
  maxY: atomic<i32>,
  maxZ: atomic<i32>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage> volumePixelData: array<f32>;
@group(0) @binding(2) var<storage, read_write> labelmap: array<u32>;
@group(0) @binding(3) var<storage, read_write> strengthData: array<f32>;
@group(0) @binding(4) var<storage> prevLabelmap: array<u32>;
@group(0) @binding(5) var<storage> prevStrengthData: array<f32>;
@group(0) @binding(6) var<storage, read_write> updatedVoxelsCounter: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> modifiedBounds: Bounds;

fn getPixelIndex(ijkPos: vec3u) -> u32 {
  let numPixelsPerSlice = params.size.x * params.size.y;
  return ijkPos.x + ijkPos.y * params.size.x + ijkPos.z * numPixelsPerSlice;
}

fn updateBounds(position: vec3i) {
  // Atomically update min bounds (use min operation)
  let oldMinX = atomicMin(&modifiedBounds.minX, position.x);
  let oldMinY = atomicMin(&modifiedBounds.minY, position.y);
  let oldMinZ = atomicMin(&modifiedBounds.minZ, position.z);

  // Atomically update max bounds (use max operation)
  let oldMaxX = atomicMax(&modifiedBounds.maxX, position.x);
  let oldMaxY = atomicMax(&modifiedBounds.maxY, position.y);
  let oldMaxZ = atomicMax(&modifiedBounds.maxZ, position.z);
}

@compute @workgroup_size(workGroupSizeX, workGroupSizeY, workGroupSizeZ)
fn main(
  @builtin(global_invocation_id) globalId: vec3u,
) {
  // Make sure it will not get out of bounds for volume with sizes that
  // are not multiple of workGroupSize
  if (
    globalId.x >= params.size.x ||
    globalId.y >= params.size.y ||
    globalId.z >= params.size.z
  ) {
    return;
  }

  // Initialize bounds for the first iteration
  if (params.iteration == 0 && globalId.x == 0 && globalId.y == 0 && globalId.z == 0) {
    // Initialize to opposite extremes to ensure any update will improve the bounds
    atomicStore(&modifiedBounds.minX, i32(params.size.x));
    atomicStore(&modifiedBounds.minY, i32(params.size.y));
    atomicStore(&modifiedBounds.minZ, i32(params.size.z));
    atomicStore(&modifiedBounds.maxX, -1);
    atomicStore(&modifiedBounds.maxY, -1);
    atomicStore(&modifiedBounds.maxZ, -1);
  }

  let currentCoord = vec3i(globalId);
  let currentPixelIndex = getPixelIndex(globalId);

  let numPixels = arrayLength(&volumePixelData);
  let currentPixelValue = volumePixelData[currentPixelIndex];

  if (params.iteration == 0) {
    // All non-zero initial labels are given maximum strength
    strengthData[currentPixelIndex] = select(MAX_STRENGTH, 0., labelmap[currentPixelIndex] == 0);

    // Update bounds for non-zero initial labels
    if (labelmap[currentPixelIndex] != 0) {
      updateBounds(currentCoord);
    }
    return;
  }

  // It should at least copy the values from previous state
  var newLabel = prevLabelmap[currentPixelIndex];
  var newStrength = prevStrengthData[currentPixelIndex];

  let window = i32(ceil(f32(windowSize - 1) * .5));
  let minWindow = -1i * window;
  let maxWindow = 1i * window;

  for (var k = minWindow; k <= maxWindow; k++) {
    for (var j = minWindow; j <= maxWindow; j++) {
      for (var i = minWindow; i <= maxWindow; i++) {
        // Skip current voxel
        if (i == 0 && j == 0 && k == 0) {
          continue;
        }

        let neighborCoord = currentCoord + vec3i(i, j, k);

        //  Boundary conditions. Do not grow outside of the volume
        if (
          neighborCoord.x < 0i || neighborCoord.x >= i32(params.size.x) ||
          neighborCoord.y < 0i || neighborCoord.y >= i32(params.size.y) ||
          neighborCoord.z < 0i || neighborCoord.z >= i32(params.size.z)
        ) {
          continue;
        }

        let neighborIndex = getPixelIndex(vec3u(neighborCoord));
        let neighborPixelValue = volumePixelData[neighborIndex];
        let prevNeighborStrength = prevStrengthData[neighborIndex];
        let strengthCost = abs(neighborPixelValue - currentPixelValue);
        let takeoverStrength = prevNeighborStrength - strengthCost;

        if (takeoverStrength > newStrength) {
          newLabel = prevLabelmap[neighborIndex];
          newStrength = takeoverStrength;
        }
      }
    }
  }

  if (labelmap[currentPixelIndex] != newLabel) {
    atomicAdd(&updatedVoxelsCounter[params.iteration], 1u);

    // Update bounds for modified voxels
    updateBounds(currentCoord);
  }

  labelmap[currentPixelIndex] = newLabel;
  strengthData[currentPixelIndex] = newStrength;
}
`;

export default shader;
