class vNode {
  constructor($el, data, vParent, app) {
    this.$template = $el;
    this.vParent = vParent;
    this.data = vParent ? data : app.data;
  }
  get scope() {
    return new Proxy(
      { ...(this.vParent?.scope || {}), ...this.data },
      {
        set: (target, prop, value) => {
          if (prop in this.data) {
            this.data[prop] = value;
            let vNewTemplate = app.virtualize(
              this.$template,
              this.vParent,
              this.data
            );
            const patch = app.diff(this, vNewTemplate);
            patch(this.$el);
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
}

class vText extends vNode {
  constructor($el, data, vParent, app) {
    super($el, data, vParent, app);
    this.text = true;
    this.content = $el.textContent.replace(/{{([^}]*)}}/g, (_, val) => {
      return this.runVal(val);
    });
  }
}

class vComment extends vNode {
  constructor($el, data, vParent, app) {
    super($el, data, vParent, app);
    this.comment = true;
    this.content = $el.textContent;
  }
}

class vEl extends vNode {
  constructor($el, data, vParent, app) {
    super($el, data, vParent, app);
    this.tagName = $el.tagName;
    this.attrs = {};
    this.children = [];
    this.directives = [];
    this.anchor = false;
    this.fragment = false;

    for (const { name, value } of $el.attributes) {
      this.attrs[name] = value;
      if (name.startsWith("v-")) {
        let directiveClass = app.directives[name.slice(2)];
        if (!directiveClass) continue;
        let directive = new directiveClass();
        this.directives.push({ directive, value });
      }
    }

    let $parent = $el;
    if ($el.tagName === "TEMPLATE") {
      let $temp = document.createElement("div");
      $temp.appendChild($el.cloneNode(true).content);
      $parent = $temp;
    }

    for (const { directive, value } of this.directives || {}) {
      directive.beforeMount?.call(app, { vEl: this, value });
    }
    for (const $node of $parent.childNodes || []) {
      this.children.push(app.virtualize($node, this));
    }
  }
}

export { vText, vComment, vEl };
