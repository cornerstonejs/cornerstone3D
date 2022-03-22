/**
 * Check if the supplied parameter is undefined and throws and error
 * @param {any} checkParam the parameter to validate for undefined
 * @param {any} errorMsg the error message to be thrown
 * @returns {void}
 * @memberof internal
 */
export function validateParameterUndefined(
  checkParam: any | undefined,
  errorMsg: string
): void {
  if (checkParam === undefined) {
    throw new Error(errorMsg);
  }
}

/**
 * Check if the supplied parameter is undefined or null and throws and error
 * @param {any} checkParam the parameter to validate for undefined
 * @param {any} errorMsg the error message to be thrown
 * @returns {void}
 * @memberof internal
 */
export function validateParameterUndefinedOrNull(
  checkParam: any | null | undefined,
  errorMsg: string
): void {
  if (checkParam === undefined || checkParam === null) {
    throw new Error(errorMsg);
  }
}
