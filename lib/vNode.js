class vNode {
  constructor($el, data, vParent, app) {
    this.$template = $el;
    this.vParent = vParent;
    this.app = app;
    this.data = vParent ? data : app.data;
  }

  runVal(val) {
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
  }


  get scope() {
    return new Proxy(
      { ...(this.vParent?.scope || {}), ...this.data },
      {
        set: (target, prop, value) => {
          if (prop in this.data) {
            this.data[prop] = value;
            this.update()
          } else if (this.vParent) {
            this.vParent.scope[prop] = value;
          } else {
            throw "What...";
          }
          return true;
        },
      }
    );
  }
}

class vText extends vNode {
  constructor($el, data, vParent, app) {
    super($el, data, vParent, app);
    this.text = true;
    this.content = $el.textContent.replace(/{{([^}]*)}}/g, (_, val) => {
      return this.runVal(val);
    });
  }

  render() {
    return document.createTextNode(this.content);
  }
}

class vComment extends vNode {
  constructor($el, data, vParent, app) {
    super($el, data, vParent, app);
    this.comment = true;
    this.content = $el.textContent;
  }

  render() {
    return document.createComment(this.content);
  }
}

class vEl extends vNode {
  constructor(...params) {
    super(...params);
    this.tagName = this.$template.tagName;
    this.anchor = false;
    this.fragment = false;

    this.setup();
  }

  setup(update) {
    this.attrs = {};
    this.directives = [];
    for (const { name, value } of this.$template.attributes) {
      this.attrs[name] = value;
      if (name.startsWith("v-")) {
        let directiveClass = this.app.directives[name.slice(2)];
        if (!directiveClass) continue;
        let directive = new directiveClass();
        this.directives.push({ directive, value });
        let method = update ? "updated" : "mounted";
        directive[method]?.call(this.app, { vEl: this, value });
      }
    }

    let $parent = this.$template;
    if ($parent.tagName === "TEMPLATE") {
      let $temp = document.createElement("div");
      $temp.appendChild($parent.cloneNode(true).content);
      $parent = $temp;
    }

    this.children = [];
    for (const $node of $parent.childNodes || []) {
      this.children.push(this.app.virtualize($node, this));
    }

  }

  render() {
    if (this.anchor) return document.createTextNode("");

    let $el;
    if (this.fragment) $el = new DocumentFragment();
    else {
      $el = document.createElement(this.tagName);

      for (const [k, v] of Object.entries(this.attrs)) {
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

    for (const child of this.children) {
      const $child = child.render();
      $el.appendChild($child);
    }

    for (const { directive, value } of this.directives) {
      directive.mounted?.call(this, { vEl: this, $el, value });
    }

    return (this.$el = $el);
  }

  update() {
    // This is a hack to store old data :c
    let old = { attrs: this.attrs, children: this.children };
    this.setup(true);
    const patch = diff(old, this);
    patch(this.$el);
  }
}

/**
 *
 * @param {vText|vComment|vEl} vOldNode
 * @param {vText|vComment|vEl} vNewNode
 * @returns
 */
function diff(vOldNode, vNewNode) {
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
        const $el = vNewNode.render();
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
        const $el = vNewNode.render();
        $node.replaceWith($el);
        return $el;
      };
    } else {
      return ($node) => undefined;
    }
  }

  if (vOldNode.tagName !== vNewNode.tagName) {
    return (/** @type {HTMLElement} */ $node) => {
      const $el = vNewNode.render();
      $node.replaceWith($el);
      return $el;
    };
  }

  const patchAttrs = diffAttrs(vOldNode.attrs, vNewNode.attrs);
  const patchChildren = diffChildren(vOldNode.children, vNewNode.children);

  return (/** @type {HTMLElement} */ $node) => {
    patchAttrs($node);
    patchChildren($node);
    return $node;
  };
}

function diffAttrs(oldAttrs, newAttrs) {
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
}

function diffChildren(oldVChildren, newVChildren) {
  const childPatches = [];
  oldVChildren.forEach((oldVChild, i) => {
    childPatches.push(diff(oldVChild, newVChildren[i]));
  });

  const additionPatches = [];
  for (const additionalVChild of newVChildren.slice(oldVChildren.length)) {
    additionPatches.push(
      /** @type {HTMLElement} */ ($node) => {
        const $el = additionalVChild.render();
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
}

export { vText, vComment, vEl };
