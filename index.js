import VDom from "./lib/vdom.js";

window.app = new VDom({
  data() {
    return {
      data: "",
      hidePopup: false,
    };
  },
});

app.mount("#app");
