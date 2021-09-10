import {
  ShowDirective,
  IfDirective,
  ModelDirective,
  ScopeDirective,
} from "./directives.js";

import { vText, vComment, vEl } from "./vNode.js ";

/**
 * @constructor
 * @param {object} data
 * @param {object} options.$directives
 * @param {function} options.$mounted
 */
export default function VDom(data = {}) {
  if (!(this instanceof VDom)) {
    return new VDom(data);
  }
  this.data = data;
  this.directives = data.$directives || {};
  this.$mount = data.$mounted;

  this.directive("show", ShowDirective);
  this.directive("if", IfDirective);
  this.directive("model", ModelDirective);
  this.directive("scope", ScopeDirective);
}

/**
 *
 * @param {keyof HTMLElementTagNameMap} el
 */
VDom.prototype.mount = function (el) {
  let $el = document.querySelector(el);
  let vApp = this.virtualize($el.cloneNode(true));
  $el.replaceWith(vApp.render());
  this.$mount?.call(this.data);
  return this;
};

VDom.prototype.directive = function (name, func) {
  this.directives[name] = func;
  return this;
};

/**
 * @param {HTMLElement|Text|Comment} $el
 * @private
 */
VDom.prototype.virtualize = function ($el, vParent, data = {}) {
  if ($el instanceof Text) {
    return new vText($el, data, vParent, this);
  } else if ($el instanceof Comment) {
    return new vComment($el, data, vParent, this);
  } else {
    return new vEl($el, data, vParent, this);
  }
};
