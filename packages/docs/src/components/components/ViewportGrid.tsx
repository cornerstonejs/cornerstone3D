import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

const ViewportGrid = React.forwardRef(
  ({ numRows, numCols, style, renderingEngine, children }, ref) => {
    const rowSize = 100 / numRows;
    const colSize = 100 / numCols;

    useEffect(() => {
      if (renderingEngine) {
        renderingEngine.resize();
      }
    }, [renderingEngine]);

    return (
      <div
        className="cs-viewport-grid"
        onContextMenu={e => e.preventDefault()}
        data-cy="viewport-grid"
        style={{
          display: 'grid',
          gridTemplateRows: `repeat(${numRows}, ${rowSize}%)`,
          gridTemplateColumns: `repeat(${numCols}, ${colSize}%)`,
          height: '100%',
          width: '100%',
          ...style,
        }}
        ref={ref}
      >
        {children}
      </div>
    );
  }
);

ViewportGrid.propTypes = {
  /** Number of columns */
  numRows: PropTypes.number.isRequired,
  /** Number of rows */
  numCols: PropTypes.number.isRequired,
  /** Styles to merge to outer container */
  styles: PropTypes.object,
  /** Array of React Components to render within grid */
  children: PropTypes.arrayOf(PropTypes.node).isRequired,
};

export default ViewportGrid;
