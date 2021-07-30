import { ShowDirective, IfDirective, ModelDirective } from "./directives.js";
// TODO: https://github.com/mmckegg/notevil

/**
 * @typedef {import('./types.js').vNode} vNode
 * @typedef {import('./types.js').patch} patch
 */

/**
 * @constructor
 * @param {object} options
 * @param {function} options.data
 * @param {function} options.mounted
 * @param {object} options.directives
 */
export default function VDom(options) {
  this.data = new Proxy(options.data?.() || {}, {
    set: (target, prop, value) => {
      target[prop] = value;
      let vNewTemplate = this.virtualize(this.$template);
      const patch = this.diff(this.vTemplate, vNewTemplate);
      patch(this.$rootEl);
      this.vTemplate = vNewTemplate;
      return true;
    },
  });
  this.directives = options.directives || {};
  this.onMount = options.mounted;

  this.directive("show", ShowDirective);
  this.directive("if", IfDirective);
  this.directive("model", ModelDirective);
}

/**
 *
 * @param {keyof HTMLElementTagNameMap} options.el
 */
VDom.prototype.mount = function (el) {
  let $el = document.querySelector(el);
  this.$template = $el.cloneNode(true);
  this.vTemplate = this.virtualize(this.$template);
  let $app = this.render();
  $el.replaceWith($app);
  this.$rootEl = $app;
  this.onMount?.call(this.data);
};

VDom.prototype.directive = function (name, func) {
  this.directives[name] = func;
};

/**
 * @param {HTMLElement|Text|Comment} $el
 */
VDom.prototype.virtualize = function ($el) {
  if ($el instanceof Text) {
    return {
      text: true,
      content: $el.textContent,
    };
  }
  if ($el instanceof Comment) {
    return {
      comment: true,
      content: $el.textContent,
    };
  }

  const vEl = {
    tagName: $el.tagName,
    attrs: {},
    children: [],
    directives: [],
    anchor: false,
    fragment: false,
  };

  for (const { name, value } of $el.attributes) {
    vEl.attrs[name] = value;
    if (name.startsWith("v-")) {
      let directiveClass = this.directives[name.slice(2)];
      if (!directiveClass) continue;
      let directive = new directiveClass();
      vEl.directives.push({ directive, value });
    }
  }

  let $parent = $el;
  if ($el.tagName === "TEMPLATE") {
    let $temp = document.createElement("div");
    $temp.appendChild($el.content);
    $parent = $temp;
  }
  for (const $node of $parent.childNodes) {
    vEl.children.push(this.virtualize($node));
  }

  for (const { directive, value } of vEl.directives) {
    directive.beforeMount?.call(this, { vEl, value });
  }

  return vEl;
};

/**
 * @param {vNode} vNode
 * @returns {HTMLElement|Text|Comment} Element
 */
VDom.prototype.render = function (vNode = this.vTemplate) {
  if (vNode.text) {
    vNode.content = vNode.content.replace(/{{(.*)}}/g, (_, val) => {
      return this.runVal(val);
    });
    return document.createTextNode(vNode.content);
  }
  if (vNode.comment) {
    return document.createComment(vNode.content);
  }
  return this.renderElem(vNode);
};

/**
 *
 * @param {string} val
 * @returns {any}
 */
VDom.prototype.runVal = function (val) {
  let params = `{${Object.keys(this.data).join(",")}}`;
  let func;
  try {
    func = new Function(params, `return { val: ${val}, data: ${params} }`)(
      this.data
    );
  } catch (error) {
    let isNotDefined = error.message.match(/(.*) is not defined/);
    if (isNotDefined) throw error.message;
  }
  for (const [k, v] of Object.entries(func.data)) {
    if (this.data[k] !== v) this.data[k] = v;
  }

  return func.val;
};

/**
 * @param {vNode} vEl
 * @returns {HTMLElement} Element
 */
VDom.prototype.renderElem = function (vEl) {
  const { tagName, attrs, children, anchor, fragment, directives } = vEl;

  if (anchor) return this.render({ text: true, content: "" });

  let $el;
  if (fragment) $el = new DocumentFragment();
  else {
    $el = document.createElement(tagName);

    for (const [k, v] of Object.entries(attrs)) {
      let key = k;
      let value = v;
      if (key.startsWith(":")) {
        value = this.runVal(value);
        key = key.slice(1);
      }
      if (key.startsWith("@")) {
        $el.addEventListener(key.slice(1), () => {
          this.runVal(value);
        });
        continue;
      }
      if (key.startsWith("v-")) {
        continue;
      }
      $el.setAttribute(key, value);
    }
  }

  for (const child of children) {
    const $child = this.render(child);
    $el.appendChild($child);
  }

  for (const { directive, value } of directives) {
    directive.mounted?.call(this, { $el, value });
  }

  return $el;
};

/**
 *
 * @param {vNode.attrs} oldAttrs
 * @param {vNode.attrs} newAttrs
 * @returns {patch} patch
 */
VDom.prototype.diffAttrs = function (oldAttrs, newAttrs) {
  const patches = [];
  for (const key of Object.keys(newAttrs)) {
    if (newAttrs[key] === oldAttrs[key]) continue;
    patches.push((/** @type {HTMLElement} */ $node) => {
      $node.setAttribute(key, newAttrs[key]);
      return $node;
    });
  }

  for (const k in oldAttrs) {
    if (!(k in newAttrs)) {
      patches.push((/** @type {HTMLElement} */ $node) => {
        $node.removeAttribute(k);
        return $node;
      });
    }
  }

  return (/** @type {HTMLElement} */ $node) => {
    for (const patch of patches) {
      patch($node);
    }
  };
};

/**
 *
 * @param {vNode.children} oldVChildren
 * @param {vNode.children} newVChildren
 * @returns {patch} patch
 */
VDom.prototype.diffChildren = function (oldVChildren, newVChildren) {
  const childPatches = [];
  oldVChildren.forEach((oldVChild, i) => {
    childPatches.push(this.diff(oldVChild, newVChildren[i]));
  });

  const additionPatches = [];
  for (const additionalVChild of newVChildren.slice(oldVChildren.length)) {
    additionPatches.push(
      /** @type {HTMLElement} */ ($node) => {
        const $el = this.render(additionalVChild);
        $node.appendChild($el);

        return $node;
      }
    );
  }

  for (const removedVChild of oldVChildren.slice(newVChildren.length)) {
    additionPatches.push(
      /** @type {HTMLElement} */ ($node) => {
        $node.removeChild($node.lastChild);
        return $node;
      }
    );
  }

  return (/** @type {HTMLElement} */ $parent) => {
    $parent.childNodes.forEach((node, i) => {
      childPatches[i](node);
    });

    for (const patch of additionPatches) {
      patch($parent);
    }
    return $parent;
  };
};

/**
 * @param {vNode} vOldNode
 * @param {vNode} vNewNode
 * @returns {patch} patch
 */
VDom.prototype.diff = function (vOldNode, vNewNode) {
  if (vNewNode === undefined) {
    return (/** @type {HTMLElement} */ $node) => {
      $node.remove();
      return undefined;
    };
  }

  const oneIs = (prop) => vOldNode[prop] || vNewNode[prop];
  if (oneIs("text") || oneIs("comment") || oneIs("anchor")) {
    if (JSON.stringify(vOldNode) !== JSON.stringify(vNewNode)) {
      return (/** @type {HTMLElement} */ $node) => {
        const $el = this.render(vNewNode);
        $node.replaceWith($el);
        return $el;
      };
    } else {
      return ($node) => undefined;
    }
  }

  if (vOldNode.tagName !== vNewNode.tagName) {
    return (/** @type {HTMLElement} */ $node) => {
      const $el = this.render(vNewNode);
      $node.appendChild($el);
      return $el;
    };
  }

  const patchAttrs = this.diffAttrs(vOldNode.attrs, vNewNode.attrs);
  const patchChildren = this.diffChildren(vOldNode.children, vNewNode.children);

  return (/** @type {HTMLElement} */ $node) => {
    for (const { directive, value } of vNewNode.directives) {
      if (vNewNode.anchor) continue;
      directive.mounted?.call(this, { $el: $node, value });
    }
    patchAttrs($node);
    patchChildren($node);
    return $node;
  };
};
