/**
 * Returns the default number of simultaneous requests.
 * @export @public @method
 * @name getDefaultSimultaneousRequests
 *
 * @returns {number} The default number of simultaneous requests.
 */
export function getDefaultSimultaneousRequests(): number;
/**
 * Returns the maximum number of simultaneous requests.
 * @export @public @method
 * @name getMaxSimultaneousRequests
 *
 * @returns {number} The maximum number of simultaneous requests
 */
export function getMaxSimultaneousRequests(): number;
/**
 * Sets the maximum number of simultaneous requests.
 * @export @public @method
 * @name setMaxSimultaneousRequests
 *
 * @param  {number} newMaxSimultaneousRequests The value.
 * @returns {void}
 */
export function setMaxSimultaneousRequests(newMaxSimultaneousRequests: number): void;
/**
 * Browser name / version detection
 * http://stackoverflow.com/questions/2400935/browser-detection-in-javascript
 * @export @public @method
 * @name getBrowserInfo
 *
 * @returns {string} The name and version of the browser.
 */
export function getBrowserInfo(): string;
/**
 * Checks if cornerstoneTools is operating on a mobile device.
 * @export @public @method
 * @name isMobileDevice
 *
 * @returns {boolean} True if running on a mobile device.
 */
export function isMobileDevice(): boolean;
