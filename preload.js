const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal safe API surface to renderer if needed later
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  sendMessage: (channel, payload, target) => {
    ipcRenderer.send('androidAutoOperator:message', { channel, payload, target });
  },
});
