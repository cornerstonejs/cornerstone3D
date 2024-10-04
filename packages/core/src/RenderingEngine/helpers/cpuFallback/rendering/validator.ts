/**
 * Check if the supplied parameter is undefined and throws an error
 * @param {unknown} checkParam the parameter to validate for undefined
 * @param {string} errorMsg the error message to be thrown
 * @returns {void}
 * @memberof internal
 */
export function validateParameterUndefined(
  checkParam: unknown,
  errorMsg: string
): void {
  if (checkParam === undefined) {
    throw new Error(errorMsg);
  }
}

/**
 * Check if the supplied parameter is undefined or null and throws an error
 * @param {unknown} checkParam the parameter to validate for undefined or null
 * @param {string} errorMsg the error message to be thrown
 * @returns {void}
 * @memberof internal
 */
export function validateParameterUndefinedOrNull(
  checkParam: unknown,
  errorMsg: string
): void {
  if (checkParam === undefined || checkParam === null) {
    throw new Error(errorMsg);
  }
}
