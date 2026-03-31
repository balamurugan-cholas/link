const { contextBridge: a, ipcRenderer: n } = require("electron");
a.exposeInMainWorld("db", {
  // ======================
  // TASKS
  // ======================
  getTasks: () => n.invoke("db:getTasks"),
  addTask: (e) => n.invoke("db:addTask", e),
  updateTask: (e, o) => n.invoke("db:updateTask", { id: e, updates: o }),
  deleteTask: (e) => n.invoke("db:deleteTask", e),
  restoreTask: (e) => n.invoke("db:restoreTask", e),
  deleteTaskPermanently: (e) => n.invoke("db:deleteTaskPermanently", e),
  // ======================
  // PAGES (NOTES)
  // ======================
  getPages: () => n.invoke("db:getPages"),
  addPage: (e) => n.invoke("db:addPage", e),
  updatePage: (e, o) => n.invoke("db:updatePage", { id: e, updates: o }),
  deletePage: (e) => n.invoke("db:deletePage", e),
  restorePage: (e) => n.invoke("db:restorePage", e),
  deletePagePermanently: (e) => n.invoke("db:deletePagePermanently", e),
  // ======================
  // BLOCKS (EDITOR CONTENT)
  // ======================
  getBlocks: (e) => n.invoke("db:getBlocks", e),
  saveBlocks: (e, o) => n.invoke("db:saveBlocks", { pageId: e, blocks: o }),
  saveBlocksWithHistory: (e, o, i) => n.invoke("db:saveBlocksWithHistory", { pageId: e, blocks: o, history: i }),
  ensurePageHistory: (e, o, i) => n.invoke("db:ensurePageHistory", { pageId: e, blocks: o, history: i }),
  undoBlocks: (e) => n.invoke("db:undoBlocks", e),
  redoBlocks: (e) => n.invoke("db:redoBlocks", e)
});
const r = /* @__PURE__ */ new Set([
  "plugins:listInstalled",
  "plugins:install",
  "plugins:remove",
  "plugins:disable",
  "plugins:enable"
]);
a.exposeInMainWorld("electron", {
  platform: process.platform,
  isMac: process.platform === "darwin",
  windowControl: (e) => {
    n.send("window-control", e);
  },
  ipcRenderer: {
    invoke: (e, o) => r.has(e) ? n.invoke(e, o) : Promise.reject(new Error(`Unsupported IPC channel: ${e}`))
  }
});
a.exposeInMainWorld("plugins", {
  getState: () => n.invoke("plugins:getState"),
  install: (e) => n.invoke("plugins:install", e),
  remove: (e) => n.invoke("plugins:remove", e),
  disable: (e) => n.invoke("plugins:disable", e),
  enable: (e) => n.invoke("plugins:enable", e),
  onStateChanged: (e) => {
    const o = (i, t) => {
      e(t);
    };
    return n.on("plugins:changed", o), () => {
      n.removeListener("plugins:changed", o);
    };
  }
});
a.exposeInMainWorld("ai", {
  getStatus: () => n.invoke("ai:getStatus"),
  downloadModel: () => n.invoke("ai:downloadModel"),
  downloadVisionModel: () => n.invoke("ai:downloadVisionModel"),
  downloadSpeechModel: () => n.invoke("ai:downloadSpeechModel"),
  generateGhostText: (e) => n.invoke("ai:generateGhostText", e),
  runInlineAgent: (e) => n.invoke("ai:runInlineAgent", e),
  cancelInlineAgent: (e) => n.invoke("ai:cancelInlineAgent", e),
  updateTranscriptionPreferences: (e) => n.invoke("ai:updateTranscriptionPreferences", e),
  updateGenerationPreferences: (e) => n.invoke("ai:updateGenerationPreferences", e),
  transcribeAudio: (e) => n.invoke("ai:transcribeAudio", e),
  cancelAudioTranscription: (e) => n.invoke("ai:cancelAudioTranscription", e),
  getSystemAudioSources: () => n.invoke("ai:getSystemAudioSources"),
  onStatusChange: (e) => {
    const o = (i, t) => {
      e(t);
    };
    return n.on("ai:status", o), () => {
      n.removeListener("ai:status", o);
    };
  },
  onInlineAgentEvent: (e) => {
    const o = (i, t) => {
      e(t);
    };
    return n.on("ai:inlineAgentEvent", o), () => {
      n.removeListener("ai:inlineAgentEvent", o);
    };
  }
});
a.exposeInMainWorld("events", {
  on: (e, o) => {
    const i = (t, ...s) => {
      o(...s);
    };
    return n.on(e, i), () => {
      n.removeListener(e, i);
    };
  },
  off: (e) => {
    n.removeAllListeners(e);
  }
});
