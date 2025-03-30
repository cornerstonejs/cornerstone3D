/**
 *
 * @param attributes
 * @param svgNode
 * @returns true if attributes were modified
 */
export function setAttributesIfNecessary(attributes, svgNode): boolean {
  return (
    Object.keys(attributes)
      .map((key) => {
        const currentValue = svgNode.getAttribute(key);
        const newValue = attributes[key];
        if (newValue === undefined || newValue === '') {
          svgNode.removeAttribute(key);
          return true;
        } else if (currentValue !== newValue) {
          svgNode.setAttribute(key, newValue);
          return true;
        }
        return false;
      })
      .find((v) => v) !== undefined
  );
}

export default setAttributesIfNecessary;
