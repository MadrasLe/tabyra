(() => {
  'use strict';
  // Run before the host SDK. Only the embedding host and this panel may supply
  // SDK events; an unrelated opener or sibling frame cannot change our UI.
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== null && event.source !== window && event.source !== window.parent) {
      event.stopImmediatePropagation(); return;
    }
    if (data?.type === 'theme-change') {
      const variables = data.payload?.cssVariables;
      if (!variables || typeof variables !== 'object' || Array.isArray(variables)
        || !Object.entries(variables).every(([key, value]) => /^--[a-zA-Z0-9_-]+$/.test(key) && typeof value === 'string')) {
        event.stopImmediatePropagation();
      }
    }
  }, true);
})();
