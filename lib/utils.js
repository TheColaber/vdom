/**
 *
 * @param {any} val1
 * @param {any} val2
 * @returns
 */
export function compare(val1, val2) {
  return JSON.stringify(val1) === JSON.stringify(val2);
}
