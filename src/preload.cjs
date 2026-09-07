const { contextBridge, ipcRenderer } = require('electron');
const CH = require('./shared/channels.cjs');

contextBridge.exposeInMainWorld('unite', {
  onEvent: (cb) => { ipcRenderer.on(CH.EVENT, (_e, evt) => cb(evt)); },
  submit: (text) => ipcRenderer.send(CH.SUBMIT, String(text)),
  skip: (seat) => ipcRenderer.send(CH.SKIP, String(seat)),
  openApp: (seat) => ipcRenderer.send(CH.OPEN_APP, String(seat)),
  getSettings: () => ipcRenderer.invoke(CH.GET_SETTINGS),
  setSettings: (next) => ipcRenderer.invoke(CH.SET_SETTINGS, next),
  pickRoot: () => ipcRenderer.invoke(CH.PICK_ROOT),
});
