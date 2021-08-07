export class ShowDirective {
  mounted({ $el, value }) {
    if (!app.runVal(value)) {
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
    }
  }
}
export class ModelDirective {
  mounted({ vEl, $el, value }) {
    console.log(vEl);
    $el.value = this.runVal(value);
    $el.addEventListener("input", () => {
      this.runVal(`${value} = "${$el.value}"`);
    });
  }
}
