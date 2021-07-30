/**
 * @typedef {Object} vEl
 * @property {String} tagName
 * @property {Object.<String, String>} attrs
 * @property {Array<vNode | String>} children
 * @property {Array} directives
 * @property {Boolean} anchor
 */

/**
 * @typedef {Object} vText
 * @property {true} text
 * @property {String} content
 */

/**
 * @typedef {Object} vComment
 * @property {true} comment
 * @property {String} content
 */

/**
 * @typedef {vEl | vText | vComment} vNode
 */

/**
 * @typedef {Function} patch
 * @param {HTMLElement} $node
 * @returns {HTMLElement|undefined} Element
 */

export default {};
