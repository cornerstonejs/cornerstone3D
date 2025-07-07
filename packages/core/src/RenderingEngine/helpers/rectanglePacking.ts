interface Rectangle {
  width: number;
  height: number;
  id: string;
}

interface PackedRectangle extends Rectangle {
  x: number;
  y: number;
}

interface Shelf {
  y: number;
  height: number;
  freeX: number;
}

interface PackingResult {
  packedRectangles: PackedRectangle[];
  totalWidth: number;
  totalHeight: number;
}

interface OptimalPackingResult extends PackingResult {
  optimalWidth: number;
  optimalHeight: number;
}

/**
 * Calculates the optimal dimensions needed to pack all rectangles.
 * Uses a binary tree packing algorithm with container size optimization.
 *
 * @param rectangles - Array of rectangles to pack
 * @returns OptimalPackingResult with packed rectangles and optimal dimensions
 */
export function packRectanglesOptimal(
  rectangles: Rectangle[]
): OptimalPackingResult {
  if (!rectangles.length) {
    return {
      packedRectangles: [],
      totalWidth: 0,
      totalHeight: 0,
      optimalWidth: 0,
      optimalHeight: 0,
    };
  }

  // Calculate total area and maximum dimensions
  let totalArea = 0;
  let maxRectWidth = 0;
  let maxRectHeight = 0;

  for (const rect of rectangles) {
    totalArea += rect.width * rect.height;
    maxRectWidth = Math.max(maxRectWidth, rect.width);
    maxRectHeight = Math.max(maxRectHeight, rect.height);
  }

  // Define multiple sorting strategies to explore different packing possibilities
  const sortStrategies = [
    // By area, descending (good general heuristic)
    (a: Rectangle, b: Rectangle) => b.width * b.height - a.width * a.height,
    // By max side, descending (good for fitting long/tall items first)
    (a: Rectangle, b: Rectangle) =>
      Math.max(b.width, b.height) - Math.max(a.width, a.height),
    // By height, descending (shelf packing style)
    (a: Rectangle, b: Rectangle) => b.height - a.height,
    // By width, descending
    (a: Rectangle, b: Rectangle) => b.width - a.width,
    // By perimeter, descending (balances width and height)
    (a: Rectangle, b: Rectangle) => b.width + b.height - (a.width + a.height),
  ];

  let bestResult: OptimalPackingResult | null = null;
  let bestAspectPenalty = Infinity;
  let bestEfficiency = 0;

  // Try different aspect ratios to find optimal container
  const aspectRatios = [1.0, 1.5, 0.67, 2.0, 0.5, 1.33, 0.75, 1.2, 0.83];

  // Try each sorting strategy
  for (const sortFn of sortStrategies) {
    const sortedRectangles = [...rectangles].sort(sortFn);

    // Try each aspect ratio with this sorting
    for (const aspectRatio of aspectRatios) {
      // Calculate initial dimensions based on aspect ratio
      const width = Math.ceil(Math.sqrt(totalArea * aspectRatio));
      const height = Math.ceil(width / aspectRatio);

      // Ensure minimum dimensions
      const initialWidth = Math.max(width, maxRectWidth);
      const initialHeight = Math.max(height, maxRectHeight);

      // Try to pack with these dimensions
      const result = tryPackingWithBinarySearch(
        sortedRectangles,
        initialWidth,
        initialHeight,
        totalArea
      );

      if (result) {
        const resultAspectRatio = result.optimalWidth / result.optimalHeight;
        // Calculate how far from square (1:1) the result is
        // A perfect square has penalty 1.0, rectangles have higher penalties
        const aspectPenalty = Math.max(
          resultAspectRatio,
          1 / resultAspectRatio
        );
        const efficiency =
          totalArea / (result.optimalWidth * result.optimalHeight);

        // First priority: minimize aspect penalty (closer to square)
        // Second priority: maximize efficiency when aspect penalties are similar
        const aspectTolerance = 0.1;

        if (
          !bestResult ||
          aspectPenalty < bestAspectPenalty - aspectTolerance ||
          (Math.abs(aspectPenalty - bestAspectPenalty) <= aspectTolerance &&
            efficiency > bestEfficiency)
        ) {
          bestAspectPenalty = aspectPenalty;
          bestEfficiency = efficiency;
          bestResult = result;
        }
      }
    }
  }

  // If no valid packing found, use a simple shelf packing as fallback
  if (!bestResult) {
    bestResult = packWithSimpleShelf(rectangles);
  }

  // Create a map to preserve original order
  const idToPackedRect = new Map<string, PackedRectangle>();
  bestResult.packedRectangles.forEach((rect) => {
    idToPackedRect.set(rect.id, rect);
  });

  // Return rectangles in original order
  const orderedPackedRectangles = rectangles
    .map((rect) => idToPackedRect.get(rect.id))
    .filter((rect): rect is PackedRectangle => rect !== undefined);

  return {
    ...bestResult,
    packedRectangles: orderedPackedRectangles,
  };
}

/**
 * Binary search to find optimal container size for given aspect ratio
 */
function tryPackingWithBinarySearch(
  rectangles: Rectangle[],
  initialWidth: number,
  initialHeight: number,
  totalArea: number
): OptimalPackingResult | null {
  // Binary search for the optimal size
  let size = Math.max(initialWidth, initialHeight);
  let step = size / 2;
  const minStep = 1;
  let bestPacking: OptimalPackingResult | null = null;

  while (step >= minStep) {
    const width = Math.ceil(
      size * (initialWidth / Math.max(initialWidth, initialHeight))
    );
    const height = Math.ceil(
      size * (initialHeight / Math.max(initialWidth, initialHeight))
    );

    const result = packWithBinaryTree(rectangles, width, height);

    if (result && result.packedRectangles.length === rectangles.length) {
      // Success - try smaller size
      bestPacking = {
        ...result,
        optimalWidth: result.totalWidth,
        optimalHeight: result.totalHeight,
      };
      size -= step;
    } else {
      // Failed - need larger size
      size += step;
    }

    step /= 2;
  }

  return bestPacking;
}

/**
 * Binary tree packing algorithm
 */
function packWithBinaryTree(
  rectangles: Rectangle[],
  maxWidth: number,
  maxHeight: number
): PackingResult | null {
  interface Node {
    x: number;
    y: number;
    width: number;
    height: number;
    used: boolean;
    right?: Node;
    down?: Node;
  }

  const root: Node = {
    x: 0,
    y: 0,
    width: maxWidth,
    height: maxHeight,
    used: false,
  };

  const packedRectangles: PackedRectangle[] = [];
  let actualWidth = 0;
  let actualHeight = 0;

  for (const rect of rectangles) {
    const node = findNode(root, rect.width, rect.height);

    if (node) {
      const fit = splitNode(node, rect.width, rect.height);
      packedRectangles.push({
        ...rect,
        x: fit.x,
        y: fit.y,
      });

      actualWidth = Math.max(actualWidth, fit.x + rect.width);
      actualHeight = Math.max(actualHeight, fit.y + rect.height);
    } else {
      // Failed to pack this rectangle
      return null;
    }
  }

  return {
    packedRectangles,
    totalWidth: actualWidth,
    totalHeight: actualHeight,
  };

  function findNode(root: Node, width: number, height: number): Node | null {
    if (root.used) {
      return (
        findNode(root.right!, width, height) ||
        findNode(root.down!, width, height)
      );
    } else if (width <= root.width && height <= root.height) {
      return root;
    } else {
      return null;
    }
  }

  function splitNode(node: Node, width: number, height: number): Node {
    node.used = true;

    // Decide which way to split based on remaining space
    const dw = node.width - width;
    const dh = node.height - height;

    if (dw > dh) {
      // Split vertically
      node.down = {
        x: node.x,
        y: node.y + height,
        width: width,
        height: dh,
        used: false,
      };
      node.right = {
        x: node.x + width,
        y: node.y,
        width: dw,
        height: node.height,
        used: false,
      };
    } else {
      // Split horizontally
      node.down = {
        x: node.x,
        y: node.y + height,
        width: node.width,
        height: dh,
        used: false,
      };
      node.right = {
        x: node.x + width,
        y: node.y,
        width: dw,
        height: height,
        used: false,
      };
    }

    return node;
  }
}

/**
 * Simple shelf packing as fallback
 */
function packWithSimpleShelf(rectangles: Rectangle[]): OptimalPackingResult {
  const sortedRectangles = [...rectangles].sort((a, b) => b.height - a.height);
  const packedRectangles: PackedRectangle[] = [];

  // Calculate a reasonable maximum width based on total area
  let totalArea = 0;
  for (const rect of sortedRectangles) {
    totalArea += rect.width * rect.height;
  }
  // Use a target aspect ratio closer to square (1.2 instead of 1.5)
  const targetWidth = Math.ceil(Math.sqrt(totalArea * 1.2));

  let currentX = 0;
  let currentY = 0;
  let shelfHeight = 0;
  let maxWidth = 0;
  let totalHeight = 0;

  for (const rect of sortedRectangles) {
    // Start new shelf if rectangle doesn't fit within target width
    if (currentX + rect.width > targetWidth && currentX > 0) {
      currentY += shelfHeight;
      currentX = 0;
      shelfHeight = 0;
    }

    packedRectangles.push({
      ...rect,
      x: currentX,
      y: currentY,
    });

    currentX += rect.width;
    shelfHeight = Math.max(shelfHeight, rect.height);
    maxWidth = Math.max(maxWidth, currentX);
    totalHeight = Math.max(totalHeight, currentY + rect.height);
  }

  return {
    packedRectangles,
    totalWidth: maxWidth,
    totalHeight: totalHeight,
    optimalWidth: maxWidth,
    optimalHeight: totalHeight,
  };
}

/**
 * Packs rectangles using a shelf packing algorithm.
 * This algorithm places rectangles on horizontal shelves, creating new shelves as needed.
 * It's efficient for packing viewport canvases within the Chrome canvas size limits.
 *
 * @param rectangles - Array of rectangles to pack
 * @param maxWidth - Maximum width constraint (e.g., 16384 for Chrome)
 * @param maxHeight - Maximum height constraint (e.g., 16384 for Chrome)
 * @returns PackingResult containing packed rectangles with x,y positions and total dimensions
 */
export function packRectangles(
  rectangles: Rectangle[],
  maxWidth: number,
  maxHeight: number
): PackingResult {
  if (!rectangles.length) {
    return {
      packedRectangles: [],
      totalWidth: 0,
      totalHeight: 0,
    };
  }

  // Sort rectangles by height in descending order for better packing
  const sortedRectangles = [...rectangles].sort((a, b) => b.height - a.height);

  const packedRectangles: PackedRectangle[] = [];
  const shelves: Shelf[] = [];
  let currentShelfIndex = -1;
  let totalHeight = 0;
  let totalWidth = 0;

  for (const rect of sortedRectangles) {
    let placed = false;

    // Try to place rectangle on existing shelves
    for (let i = 0; i <= currentShelfIndex; i++) {
      const shelf = shelves[i];

      // Check if rectangle fits on this shelf
      if (shelf.freeX + rect.width <= maxWidth && rect.height <= shelf.height) {
        // Place rectangle on this shelf
        packedRectangles.push({
          ...rect,
          x: shelf.freeX,
          y: shelf.y,
        });

        shelf.freeX += rect.width;
        totalWidth = Math.max(totalWidth, shelf.freeX);
        placed = true;
        break;
      }
    }

    // If not placed, create new shelf
    if (!placed) {
      const newShelfY =
        currentShelfIndex >= 0
          ? shelves[currentShelfIndex].y + shelves[currentShelfIndex].height
          : 0;

      // Check if new shelf would exceed height limit
      if (newShelfY + rect.height > maxHeight) {
        console.warn(
          `Cannot pack rectangle ${rect.id}: would exceed maximum height of ${maxHeight}px`
        );
        continue;
      }

      // Check if rectangle width exceeds maximum width
      if (rect.width > maxWidth) {
        console.warn(
          `Cannot pack rectangle ${rect.id}: width ${rect.width}px exceeds maximum width of ${maxWidth}px`
        );
        continue;
      }

      // Create new shelf
      const newShelf: Shelf = {
        y: newShelfY,
        height: rect.height,
        freeX: rect.width,
      };

      shelves.push(newShelf);
      currentShelfIndex++;

      // Place rectangle on new shelf
      packedRectangles.push({
        ...rect,
        x: 0,
        y: newShelfY,
      });

      totalWidth = Math.max(totalWidth, rect.width);
      totalHeight = newShelfY + rect.height;
    }
  }

  // Create a map to preserve original order
  const idToPackedRect = new Map<string, PackedRectangle>();
  packedRectangles.forEach((rect) => {
    idToPackedRect.set(rect.id, rect);
  });

  // Return rectangles in original order
  const orderedPackedRectangles = rectangles
    .map((rect) => idToPackedRect.get(rect.id))
    .filter((rect): rect is PackedRectangle => rect !== undefined);

  return {
    packedRectangles: orderedPackedRectangles,
    totalWidth,
    totalHeight,
  };
}

/**
 * Calculates optimal viewport positions and canvas dimensions.
 * Dynamically determines the smallest canvas size needed to pack all viewports.
 *
 * @param viewportInputs - Array of viewport inputs with canvas dimensions
 * @returns Object containing viewport positions and optimal canvas dimensions
 */
export function calculateOptimalViewportOffsets(
  viewportInputs: Array<{
    id: string;
    canvas: { width: number; height: number };
  }>
): {
  viewportOffsets: Array<{
    id: string;
    xOffset: number;
    yOffset: number;
    width: number;
    height: number;
  }>;
  canvasWidth: number;
  canvasHeight: number;
} {
  const rectangles: Rectangle[] = viewportInputs.map((input) => ({
    id: input.id,
    width: input.canvas.width,
    height: input.canvas.height,
  }));

  const { packedRectangles, optimalWidth, optimalHeight } =
    packRectanglesOptimal(rectangles);

  const viewportOffsets = packedRectangles.map((rect) => ({
    id: rect.id,
    xOffset: rect.x,
    yOffset: rect.y,
    width: rect.width,
    height: rect.height,
  }));

  return {
    viewportOffsets,
    canvasWidth: optimalWidth,
    canvasHeight: optimalHeight,
  };
}
