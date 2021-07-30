import VDom from "./lib/vdom.js";

window.app = new VDom({
  data() {
    return {
      showTemplate: false,
    };
  },
});

app.mount("#app");
