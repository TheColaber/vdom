export class ShowDirective {
  mounted({ $el, value }) {
    if (!app.runVal(value)) {
      $el.style.display = "none";
    }
  }
}
export class IfDirective {
  beforeMount({ vEl, value }) {
    if (!this.runVal(value)) {
      vEl.anchor = "";
    }
  }
}
export class ModelDirective {
  mounted({ $el, value }) {
    $el.value = this.runVal(value);
    $el.addEventListener("input", () => {
      this.runVal(`${value} = "${$el.value}"`);
    });
  }
}
