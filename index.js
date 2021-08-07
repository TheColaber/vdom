import VDom from "./lib/vdom.js";

window.app = new VDom({
  data() {
    return {
      showTemplate: true,
      welcome: "hello!",
    };
  },
});

app.mount("#app");
