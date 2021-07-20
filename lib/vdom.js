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
      let vNewApp = this.virtualize(this.render());
      const patch = this.diff(this.vApp, vNewApp);
      patch(this.$rootEl);
      this.vApp = vNewApp;
      return true;
    },
  });
  this.directives = options.directives || {};
  this.onMount = options.mounted;

  this.directive("show", {
    mounted({ $el, val }) {
      if (!this.runVal(val)) {
        $el.style.display = "none";
      }
    },
  });
}

/**
 *
 * @param {keyof HTMLElementTagNameMap} options.el
 */
VDom.prototype.mount = function (el) {
  let $el = document.querySelector(el);
  this.vApp = this.virtualize($el);
  this.template = this.virtualize($el);
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
    return $el.textContent;
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
  };
  for (const { name, value } of $el.attributes) {
    vEl.attrs[name] = value;
    if (directives) {
      if (name.startsWith("v-")) {
        let directive = this.directives[name.slice(2)];
        directive?.beforeMount?.call({ vEl });
      }
    }
  }
  for (const node of $el.childNodes) {
    vEl.children.push(this.virtualize(node));
  }

  return vEl;
};

/**
 * @returns {HTMLElement|Text} Element
 */
VDom.prototype.render = function (vNode = this.template) {
  if (typeof vNode === "string") {
    vNode = vNode.replace(/{{(.*)}}/g, (match, val) => {
      return this.runVal(val);
    });
    return document.createTextNode(vNode);
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
  let func = new Function(params, `return { val: ${val}, data: ${params} }`)(
    this.data
  );
  for (const [k, v] of Object.entries(func.data)) {
    if (this.data[k] !== v) this.data[k] = v;
  }

  return func.val;
};

/**
 * @param {vNode} vNode
 * @returns {HTMLElement} Element
 */
VDom.prototype.renderElem = function ({ tagName, attrs, children }) {
  const $el = document.createElement(tagName);

  // set arrtibutes
  for (const [k, v] of Object.entries(attrs)) {
    let key = k;
    let val = v;
    if (key.startsWith(":")) {
      val = this.runVal(val);
      key = key.slice(1);
    }
    if (key.startsWith("@")) {
      $el.addEventListener(key.slice(1), () => {
        this.runVal(val);
      });
      continue;
    }
    if (key.startsWith("v-")) {
      let directive = this.directives[key.slice(2)];
      directive?.call(this, { $el, val });
      continue;
    }
    $el.setAttribute(key, val);
  }
  // set children
  for (const child of children) {
    const $child = this.render(child);
    $el.appendChild($child);
  }

  return $el;
};

/**
 *
 * @param {array} xs
 * @param {array} ys
 * @returns
 */
VDom.prototype.zip = function (xs, ys) {
  const zipped = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    zipped.push([xs[i], ys[i]]);
  }
  return zipped;
};

/**
 *
 * @param {vNode.attrs} oldAttrs
 * @param {vNode.attrs} newAttrs
 * @returns {patch} patch
 */
VDom.prototype.diffAttrs = function (oldAttrs, newAttrs) {
  const patches = [];
  for (const [k, v] of Object.entries(newAttrs)) {
    patches.push((/** @type {HTMLElement} */ $node) => {
      $node.setAttribute(k, v);
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
  for (const [oldVChild, newVChild] of this.zip(oldVChildren, newVChildren)) {
    childPatches.push(this.diff(oldVChild, newVChild));
  }

  const additionPatches = [];
  for (const additionalVChild of newVChildren.slice(oldVChildren.length)) {
    additionPatches.push(
      /** @type {HTMLElement} */ ($node) => {
        $node.appendChild(render(additionalVChild));
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
    for (const [patch, child] of this.zip(childPatches, $parent.childNodes)) {
      patch(child);
    }

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

  if (typeof vOldNode === "string" || typeof vNewNode === "string") {
    if (vOldNode !== vNewNode) {
      return (/** @type {HTMLElement} */ $node) => {
        const $newNode = this.render(vNewNode);
        $node.replaceWith($newNode);
        return $newNode;
      };
    } else {
      return ($node) => undefined;
    }
  }

  if (vOldNode.comment || vNewNode.comment) {
    if (vOldNode !== vNewNode) {
      return (/** @type {HTMLElement} */ $node) => {
        const $newNode = this.render(vNewNode);
        $node.replaceWith($newNode);
        return $newNode;
      };
    } else {
      return ($node) => undefined;
    }
  }

  if (vOldNode.tagName !== vNewNode.tagName) {
    return (/** @type {HTMLElement} */ $node) => {
      const $newNode = this.render(vNewNode);
      $node.replaceWith($newNode);
      return $newNode;
    };
  }

  const patchAttrs = this.diffAttrs(vOldNode.attrs, vNewNode.attrs);
  const patchChildren = this.diffChildren(vOldNode.children, vNewNode.children);

  return (/** @type {HTMLElement} */ $node) => {
    patchAttrs($node);
    patchChildren($node);
    return $node;
  };
};
