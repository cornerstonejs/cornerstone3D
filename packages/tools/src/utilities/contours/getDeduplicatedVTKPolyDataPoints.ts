/**
 * Iterate through polyData from vtkjs and merge any points that are the same
 * then update merged point references within lines array
 * @param polyData - vtkPolyData
 * @param bypass - bypass the duplicate point removal
 * @returns the updated polyData
 */
export function getDeduplicatedVTKPolyDataPoints(polyData, bypass = false) {
  const points = polyData.getPoints();
  const lines = polyData.getLines();

  // Todo: This is cloning which is not ideal, we should move to use the PointsArrayManager
  // that will get merged soon
  const pointsArray = new Array(points.getNumberOfPoints())
    .fill(0)
    .map((_, i) => points.getPoint(i).slice());

  const linesArray = new Array(lines.getNumberOfCells()).fill(0).map((_, i) => {
    const cell = lines.getCell(i * 3).slice();
    return { a: cell[0], b: cell[1] };
  });

  if (bypass) {
    return { points: pointsArray, lines: linesArray };
  }

  const newPoints = [];
  for (const [i, pt] of pointsArray.entries()) {
    // Todo: This is an n^2 algorithm - consider using a Map<string,Point3>.
    // Generates a reasonable amount of garbage, but I think the performance
    //  of that is better than doing repeated compares across the entire array.
    const index = newPoints.findIndex(
      (point) => point[0] === pt[0] && point[1] === pt[1] && point[2] === pt[2]
    );

    if (index >= 0) {
      linesArray.map((line) => {
        if (line.a === i) {
          line.a = index;
        }
        if (line.b === i) {
          line.b = index;
        }
        return line;
      });
    } else {
      const newIndex = newPoints.length;
      newPoints.push(pt);
      linesArray.map((line) => {
        if (line.a === i) {
          line.a = newIndex;
        }
        if (line.b === i) {
          line.b = newIndex;
        }
        return line;
      });
    }
  }

  const newLines = linesArray.filter((line) => line.a !== line.b);

  return { points: newPoints, lines: newLines };
}

export default { getDeduplicatedVTKPolyDataPoints };
