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
 * Calculates viewport positions on the offscreen canvas using rectangle packing.
 * This is used to efficiently pack viewports within Chrome's canvas size limits.
 *
 * @param viewportInputs - Array of viewport inputs with canvas dimensions
 * @param maxWidth - Maximum width constraint
 * @param maxHeight - Maximum height constraint
 * @returns Array of viewport positions with x, y offsets
 */
export function calculateViewportOffsets(
  viewportInputs: Array<{
    id: string;
    canvas: { width: number; height: number };
  }>,
  maxWidth: number,
  maxHeight: number
): Array<{
  id: string;
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
}> {
  const rectangles: Rectangle[] = viewportInputs.map((input) => ({
    id: input.id,
    width: input.canvas.width,
    height: input.canvas.height,
  }));

  const { packedRectangles } = packRectangles(rectangles, maxWidth, maxHeight);

  return packedRectangles.map((rect) => ({
    id: rect.id,
    xOffset: rect.x,
    yOffset: rect.y,
    width: rect.width,
    height: rect.height,
  }));
}
