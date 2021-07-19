import VDom from "./lib/vdom.js";

const app = new VDom({
  data() {
    return {
      counter: 0,
    };
  },
});

app.mount("#app");
