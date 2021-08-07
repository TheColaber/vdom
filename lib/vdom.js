import { ShowDirective, IfDirective, ModelDirective } from "./directives.js";

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
  this.data = options.data?.() || {};
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
  this.vTemplate = this.virtualize();
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
VDom.prototype.virtualize = function ($el = this.$template) {
  const scope = new Proxy(this.data, {
    set: (target, prop, value) => {
      target[prop] = value;
      let vNewTemplate = this.virtualize();
      // todo: diffing can be improved with v-scope
      const patch = this.diff(this.vTemplate, vNewTemplate);
      patch(this.$rootEl);
      this.vTemplate = vNewTemplate;
      return true;
    },
  });
  const runVal = function (val) {
    let params = `{${Object.keys(this.scope).join(",")}}`;
    let func;
    try {
      func = new Function(params, `return { val: ${val}, scope: ${params} }`)(
        this.scope
      );
    } catch (error) {
      let isNotDefined = error.message.match(/(.*) is not defined/);
      if (isNotDefined) throw error.message;
    }
    for (const [k, v] of Object.entries(func.scope)) {
      if (this.scope[k] !== v) this.scope[k] = v;
    }

    return func.val;
  };

  if ($el instanceof Text) {
    return {
      text: true,
      content: $el.textContent,
      scope,
      runVal,
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
    scope,
    runVal,
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
    $temp.appendChild($el.cloneNode(true).content);
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
      return vNode.runVal(val);
    });
    return document.createTextNode(vNode.content);
  }
  if (vNode.comment) {
    return document.createComment(vNode.content);
  }
  return this.renderElem(vNode);
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
        value = vEl.runVal(value);
        key = key.slice(1);
      }
      if (key.startsWith("@")) {
        $el.addEventListener(key.slice(1), () => {
          vEl.runVal(value);
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
 * @param {vEl.attrs} oldAttrs
 * @param {vEl.attrs} newAttrs
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
 * @param {vEl.children} oldVChildren
 * @param {vEl.children} newVChildren
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
    $parent.childNodes.forEach(($child, i) => {
      childPatches[i]($child);
      if (oldVChildren[i].fragment && !newVChildren[i].fragment) {
        let childrenCount = oldVChildren[i].children.length - 1;
        i++;
        for (let j = 0; j < childrenCount; j++) {
          const $node = $parent.childNodes[i];
          $node.remove();
        }
      }
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
