import VDom from "./lib/vdom.js";

const app = (window.app = new VDom({
  showTemplate: true,
  welcome: "hello!",
}));

app.mount("#app");
