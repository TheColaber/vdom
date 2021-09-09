import {
  ShowDirective,
  IfDirective,
  ModelDirective,
  ScopeDirective,
} from "./directives.js";

/**
 * @constructor
 * @param {object} data
 * @param {object} options.$directives
 * @param {function} options.$mounted
 */
export default function VDom(data = {}) {
  this.data = data;
  this.directives = data.$directives || {};
  this.onMount = data.$mounted;

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
  this.$template = $el.cloneNode(true);
  let $app = this.render(this.virtualize());
  $el.replaceWith($app);
  this.$rootEl = $app;
  this.onMount?.call(this.data);
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
VDom.prototype.virtualize = function (
  $el = this.$template,
  vParent = null,
  data = {}
) {
  let vEl = {};
  vEl.$template = $el;
  vEl.vParent = vParent;
  vEl.data = vParent ? data : this.data;
  Object.defineProperty(vEl, "scope", {
    get: () =>
      new Proxy(
        { ...(vEl.vParent?.scope || {}), ...vEl.data },
        {
          set: (target, prop, value) => {
            if (prop in vEl.data) {
              vEl.data[prop] = value;
              let vNewTemplate = this.virtualize(
                vEl.$template,
                vEl.vParent,
                vEl.data
              );
              const patch = this.diff(vEl, vNewTemplate);
              patch(vEl.$el);
            } else if (vEl.vParent) {
              vEl.vParent.scope[prop] = value;
            } else {
              // error
            }
            return true;
          },
        }
      ),
  });

  vEl.runVal = (val) => {
    let params = `{${Object.keys(vEl.scope).join(",")}}`;
    let func;
    try {
      func = new Function(params, `return { val: ${val}, scope: ${params} }`)(
        vEl.scope
      );
    } catch (error) {
      let isNotDefined = error.message.match(/(.*) is not defined/);
      if (isNotDefined) throw error.message;
    }
    for (const [k, v] of Object.entries(func.scope)) {
      if (vEl.scope[k] !== v) vEl.scope[k] = v;
    }

    return func.val;
  };

  if ($el instanceof Text) {
    vEl.text = true;
    vEl.content = $el.textContent.replace(/{{([^}]*)}}/g, (_, val) => {
      return vEl.runVal(val);
    });
  } else if ($el instanceof Comment) {
    vEl.comment = true;
    vEl.content = $el.textContent;
  } else {
    vEl.tagName = $el.tagName;
    vEl.attrs = {};
    vEl.children = [];
    vEl.directives = [];
    vEl.anchor = false;
    vEl.fragment = false;

    for (const { name, value } of $el.attributes) {
      vEl.attrs[name] = value;
      if (name.startsWith("v-")) {
        let directiveClass = this.directives[name.slice(2)];
        if (!directiveClass) continue;
        let directive = new directiveClass();
        vEl.directives.push({ directive, value });
      }
    }
  }

  let $parent = $el;
  if ($el.tagName === "TEMPLATE") {
    let $temp = document.createElement("div");
    $temp.appendChild($el.cloneNode(true).content);
    $parent = $temp;
  }

  for (const { directive, value } of vEl.directives || []) {
    directive.beforeMount?.call(this, { vEl, value });
  }
  for (const $node of $parent.childNodes || []) {
    vEl.children.push(this.virtualize($node, vEl));
  }
  return vEl;
};

/**
 * @param {vNode} vNode
 * @returns {HTMLElement|Text|Comment} Element
 * @private
 */
VDom.prototype.render = function (vNode) {
  if (vNode.text) {
    return document.createTextNode(vNode.content);
  }
  if (vNode.comment) {
    return document.createComment(vNode.content);
  }
  const $el = this.renderElem(vNode);
  vNode.$el = $el;
  return $el;
};

/**
 * @param {vNode} vEl
 * @returns {HTMLElement} Element
 * @private
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
 * @private
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
 * @private
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
 * @private
 */
VDom.prototype.diff = function (vOldNode, vNewNode) {
  if (vNewNode === undefined) {
    return (/** @type {HTMLElement} */ $node) => {
      $node.remove();
      return undefined;
    };
  }

  const oneIs = (prop) => vOldNode[prop] || vNewNode[prop];
  if (oneIs("text") || oneIs("comment")) {
    if (vOldNode.content !== vNewNode.content) {
      return (/** @type {HTMLElement} */ $node) => {
        const $el = this.render(vNewNode);
        $node.replaceWith($el);
        return $el;
      };
    } else {
      return ($node) => undefined;
    }
  }

  if (oneIs("anchor")) {
    if (vOldNode.anchor !== vNewNode.anchor) {
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
