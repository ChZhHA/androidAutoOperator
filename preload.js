const { contextBridge } = require('electron');

// Expose a minimal safe API surface to renderer if needed later
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
});
