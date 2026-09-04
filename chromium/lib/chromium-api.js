(function attachChromiumBrowserApi(root) {
  "use strict";
  if (!root.browser) root.browser = root.chrome;
})(globalThis);
