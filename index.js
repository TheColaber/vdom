import VDom from "./lib/vdom.js";

window.app = new VDom({
  data() {
    return {
      counter: 0,
    };
  },
});

app.mount("#app");
