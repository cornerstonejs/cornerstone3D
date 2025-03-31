/**
 *
 * @param attributes
 * @param svgNode
 * @returns true if attributes were modified
 */
export function setAttributesIfNecessary(attributes, svgNode) {
  return Object.keys(attributes).forEach((key) => {
    const currentValue = svgNode.getAttribute(key);
    const newValue = attributes[key];
    if (newValue === undefined || newValue === '') {
      svgNode.removeAttribute(key);
    } else if (currentValue !== newValue) {
      svgNode.setAttribute(key, newValue);
    }
  });
}

export default setAttributesIfNecessary;
