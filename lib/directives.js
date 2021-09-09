export class ShowDirective {
  mounted({ vEl, $el, value }) {
    if (!vEl.runVal(value)) {
      $el.style.display = "none";
    }
  }
}
export class IfDirective {
  beforeMount({ vEl, value }) {
    if (vEl.runVal(value)) {
      if (vEl.tagName === "TEMPLATE") vEl.fragment = true;
    } else {
      vEl.anchor = true;
      if (vEl.tagName === "TEMPLATE") vEl.fragment = false;
    }
  }
}
export class ModelDirective {
  mounted({ vEl, $el, value }) {
    $el.value = vEl.runVal(value);
    $el.addEventListener("input", () => {
      vEl.runVal(`${value} = "${$el.value}"`);
    });
  }
}
export class ScopeDirective {
  beforeMount({ vEl, value }) {
    const obj = vEl.runVal(value);
    Object.keys(obj).forEach((key) => {
      vEl.data[key] = obj[key];
    });
    vEl.$template.removeAttribute("v-scope"); // ugly hack
  }
}
