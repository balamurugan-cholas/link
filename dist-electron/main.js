import { ipcMain as f, BrowserWindow as Ze, app as A, desktopCapturer as ir } from "electron";
import { spawn as be } from "node:child_process";
import * as Be from "node:http";
import * as ar from "node:net";
import g from "node:path";
import * as we from "node:https";
import { fileURLToPath as Qe, pathToFileURL as lr } from "node:url";
import cr from "better-sqlite3";
import u from "fs";
const ke = {
  status: null,
  tags: [],
  date: null
}, me = (e) => Array.isArray(e) ? Array.from(new Set(e.filter((t) => typeof t == "string" && t.trim().length > 0))) : [], dr = (e) => typeof e == "object" && e !== null && !Array.isArray(e), We = (e) => {
  if (!dr(e))
    return { ...ke };
  const t = typeof e.status == "string" && e.status.trim() ? e.status : null, r = me(e.tags), n = typeof e.date == "string" && e.date.trim() ? e.date : null;
  return {
    status: t,
    tags: r,
    date: n
  };
}, ur = (e) => {
  if (typeof e == "string" && e.trim())
    try {
      return We(JSON.parse(e));
    } catch {
      return { ...ke };
    }
  return We(e);
}, je = (e) => JSON.stringify(We(e)), ve = "Phi-3-mini-4k-instruct-q4.gguf", pr = "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf?download=true", Me = "MiniCPM-V-4_5-Q4_K_M.gguf", mr = "https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf/resolve/main/MiniCPM-V-4_5-Q4_K_M.gguf?download=true", De = "mmproj-model-f16.gguf", gr = "https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf/resolve/main/mmproj-model-f16.gguf?download=true", Ne = "ggml-small.en.bin", hr = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin?download=true", Se = () => ({
  modelName: ve,
  modelPath: "",
  status: "missing",
  progress: null,
  error: null,
  downloadedBytes: 0,
  totalBytes: null,
  visualModel: {
    modelName: Me,
    modelPath: "",
    projectorName: De,
    projectorPath: "",
    status: "missing",
    progress: null,
    error: null,
    downloadedBytes: 0,
    totalBytes: null
  },
  speechModel: {
    modelName: Ne,
    modelPath: "",
    runtimeName: "whisper-cli",
    runtimePath: "",
    status: "missing",
    progress: null,
    error: null,
    downloadedBytes: 0,
    totalBytes: null
  },
  transcriptionPreferences: {
    captureMode: "microphone",
    deviceId: null,
    deviceLabel: "",
    transcriptionMode: "manual"
  },
  generationPreferences: {
    answerLength: "detailed"
  }
}), kt = (e) => ({
  captureMode: (e == null ? void 0 : e.captureMode) === "system" ? "system" : "microphone",
  deviceId: typeof (e == null ? void 0 : e.deviceId) == "string" && e.deviceId.trim() ? e.deviceId : null,
  deviceLabel: typeof (e == null ? void 0 : e.deviceLabel) == "string" ? e.deviceLabel : "",
  transcriptionMode: (e == null ? void 0 : e.transcriptionMode) === "live" ? "live" : "manual"
}), vt = (e) => ({
  answerLength: (e == null ? void 0 : e.answerLength) === "concise" || (e == null ? void 0 : e.answerLength) === "balanced" || (e == null ? void 0 : e.answerLength) === "detailed" ? e.answerLength : "detailed"
}), Mt = g.dirname(Qe(import.meta.url));
process.env.APP_ROOT = g.join(Mt, "..");
const He = process.env.VITE_DEV_SERVER_URL, jn = g.join(process.env.APP_ROOT, "dist-electron"), Dt = g.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = He ? g.join(process.env.APP_ROOT, "public") : Dt;
let P = null, d, l = Se(), te = null, re = null, ne = null, oe = null, se = null, k = null, ie = null, v = null, j = null, G = !1, C = null, le = null, ae = null;
const Ae = process.platform === "darwin", N = process.platform === "win32", ze = Ae ? "Cmd" : "Ctrl", yt = /* @__PURE__ */ new Map(), Ge = /* @__PURE__ */ new Map(), ce = /* @__PURE__ */ new Map(), _ = /* @__PURE__ */ new Set();
let ue = null, U = null, Et = Promise.resolve([]);
const Nt = "audio_transcription_preferences", _t = "ai_generation_preferences", Ot = "disabled_plugins", fr = 250, Ct = "minicpm-v-4_5-local", wr = 18e4, yr = 600, H = "b8589", Er = N ? "llama-server.exe" : "llama-server", x = N ? "whisper-cli.exe" : "whisper-cli", Tr = "whisper-bin-x64.zip", Pr = "https://sourceforge.net/projects/whisper-cpp.mirror/files/v1.8.0/whisper-bin-x64.zip/download", Sr = (e) => {
  if (typeof e == "string" && e.trim())
    try {
      return me(JSON.parse(e));
    } catch {
      return [];
    }
  return me(e);
}, Xe = (e) => typeof e == "string" && e.trim() ? e : null, pe = (e) => typeof e == "number" && Number.isFinite(e) ? e : null, Ye = (e) => e === "todo" ? "todo" : "project", Tt = (e) => JSON.stringify(me(e)), Ar = (e) => ({
  ...e,
  scope: Ye(e.scope),
  assignee: e.assignee ?? "",
  tags: Sr(e.tags),
  date: Xe(e.date),
  isDeleted: !!e.isDeleted,
  completedAt: pe(e.completedAt),
  deletedAt: pe(e.deletedAt)
}), Rr = (e) => ({
  ...e,
  isArchived: !!e.isArchived,
  isFavourite: !!e.isFavourite,
  isPinned: !!e.isPinned,
  properties: ur(e.properties)
}), et = (e) => typeof e == "string" && e.trim() ? e.trim() : null, ye = (e) => Array.isArray(e) ? e.map((t, r) => {
  const n = t, o = typeof n.type == "string" && n.type.trim() ? n.type.trim() : "text";
  return {
    id: typeof n.id == "string" && n.id.trim() ? n.id.trim() : `history-block-${Date.now()}-${r}`,
    type: o,
    content: typeof n.content == "string" ? n.content : "",
    checked: o === "checklist" ? !!n.checked : void 0,
    children: Array.isArray(n.children) && n.children.length > 0 ? ye(n.children) : void 0,
    width: typeof n.width == "string" || typeof n.width == "number" ? n.width : void 0,
    refId: typeof n.refId == "string" && n.refId.trim() ? n.refId.trim() : void 0
  };
}) : [], Ir = (e) => {
  if (typeof e != "string" || !e.trim())
    return [];
  try {
    return ye(JSON.parse(e));
  } catch {
    return [];
  }
}, xe = (e) => {
  const t = /* @__PURE__ */ new Set(), r = [e], n = d.prepare("SELECT id FROM pages WHERE parentId = ?");
  for (; r.length > 0; ) {
    const o = r.pop();
    if (t.has(o)) continue;
    t.add(o), n.all(o).forEach((i) => r.push(i.id));
  }
  return Array.from(t);
}, O = (e, t, r = []) => {
  if (t.length === 0) return;
  const n = t.map(() => "?").join(", ");
  d.prepare(e.replace("__IDS__", n)).run(...r, ...t);
}, tt = (e, t) => {
  const r = ye(t), n = d.prepare("DELETE FROM blocks WHERE pageId = ?"), o = d.prepare(`
    INSERT INTO blocks (id, pageId, parentId, type, content, position, width, checked, refId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `), s = (i, a, c = null) => {
    o.run(
      i.id,
      e,
      c,
      i.type,
      i.content,
      a,
      i.width ?? 100,
      i.checked ? 1 : 0,
      i.refId ?? null
    ), Array.isArray(i.children) && i.children.forEach((h, m) => {
      s(h, m, i.id);
    });
  };
  return n.run(e), r.forEach((i, a) => s(i, a)), r;
}, rt = (e) => d.prepare("SELECT currentRevision FROM page_history_state WHERE pageId = ?").get(e), Lr = (e, t) => d.prepare("SELECT revision, blocks, focusBlockId FROM page_history WHERE pageId = ? AND revision = ?").get(e, t), br = (e, t, r) => d.prepare(
  r === "undo" ? "SELECT revision, blocks, focusBlockId FROM page_history WHERE pageId = ? AND revision < ? ORDER BY revision DESC LIMIT 1" : "SELECT revision, blocks, focusBlockId FROM page_history WHERE pageId = ? AND revision > ? ORDER BY revision ASC LIMIT 1"
).get(e, t), Br = (e) => {
  const t = d.prepare("SELECT MAX(revision) AS maxRevision FROM page_history WHERE pageId = ?").get(e);
  return typeof (t == null ? void 0 : t.maxRevision) == "number" ? t.maxRevision : 0;
}, Re = (e, t) => {
  d.prepare(
    `
      INSERT INTO page_history_state (pageId, currentRevision)
      VALUES (?, ?)
      ON CONFLICT(pageId) DO UPDATE SET currentRevision = excluded.currentRevision
    `
  ).run(e, t);
}, kr = (e) => {
  const t = d.prepare("SELECT revision FROM page_history WHERE pageId = ? ORDER BY revision DESC LIMIT -1 OFFSET ?").all(e, fr);
  t.length !== 0 && O(
    "DELETE FROM page_history WHERE pageId = ? AND revision IN (__IDS__)",
    t.map((r) => String(r.revision)),
    [e]
  );
}, Pt = (e, t, r) => {
  const n = ye(t), o = JSON.stringify(n), s = et(r);
  return d.transaction(() => {
    const i = rt(e);
    return i ? {
      blocks: n,
      focusBlockId: s,
      currentRevision: i.currentRevision
    } : (d.prepare(
      `
        INSERT INTO page_history (pageId, revision, blocks, focusBlockId, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(e, 1, o, s, Date.now()), Re(e, 1), {
      blocks: n,
      focusBlockId: s,
      currentRevision: 1
    });
  })();
}, vr = (e, t, r) => {
  const n = ye(t), o = JSON.stringify(n), s = et(r);
  return d.transaction(() => {
    tt(e, n);
    const i = rt(e);
    if (!i)
      return d.prepare(
        `
          INSERT INTO page_history (pageId, revision, blocks, focusBlockId, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `
      ).run(e, 1, o, s, Date.now()), Re(e, 1), {
        blocks: n,
        focusBlockId: s,
        currentRevision: 1
      };
    const a = Lr(e, i.currentRevision);
    if ((a == null ? void 0 : a.blocks) === o)
      return d.prepare(
        `
          UPDATE page_history
          SET focusBlockId = ?, createdAt = ?
          WHERE pageId = ? AND revision = ?
        `
      ).run(s, Date.now(), e, i.currentRevision), {
        blocks: n,
        focusBlockId: s,
        currentRevision: i.currentRevision
      };
    d.prepare("DELETE FROM page_history WHERE pageId = ? AND revision > ?").run(e, i.currentRevision);
    const c = Br(e) + 1;
    return d.prepare(
      `
        INSERT INTO page_history (pageId, revision, blocks, focusBlockId, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(e, c, o, s, Date.now()), Re(e, c), kr(e), {
      blocks: n,
      focusBlockId: s,
      currentRevision: c
    };
  })();
}, St = (e, t) => d.transaction(() => {
  const r = rt(e);
  if (!r)
    return null;
  const n = br(e, r.currentRevision, t);
  if (!n)
    return null;
  const o = Ir(n.blocks);
  return tt(e, o), Re(e, n.revision), {
    blocks: o,
    focusBlockId: et(n.focusBlockId),
    currentRevision: n.revision
  };
})(), Ut = () => g.join(A.getPath("userData"), "models"), J = () => g.join(Ut(), ve), xt = () => `${J()}.download`, nt = () => g.join(A.getPath("userData"), "models", "vision"), q = () => g.join(nt(), Me), Ft = () => `${q()}.download`, K = () => g.join(nt(), De), $t = () => `${K()}.download`, _e = () => g.join(A.getPath("userData"), "llama-runtime"), Vt = () => g.join(A.getPath("userData"), "models", "whisper"), F = () => g.join(Vt(), Ne), Wt = () => `${F()}.download`, Z = () => g.join(A.getPath("userData"), "whispercpp"), Je = () => g.join(Z(), Tr), jt = () => `${Je()}.download`, B = (e) => {
  if (!u.existsSync(e))
    return 0;
  try {
    return u.statSync(e).size;
  } catch {
    return 0;
  }
}, ge = () => B(J()), ot = () => B(xt()), X = () => B(q()), Ht = () => B(Ft()), he = () => B(K()), qe = () => B($t()), Ie = () => B(F()), zt = () => B(Wt()), Gt = () => B(jt()), st = (e, t) => {
  if (!u.existsSync(e))
    return null;
  const r = u.readdirSync(e, { withFileTypes: !0 });
  for (const n of r) {
    const o = g.join(e, n.name);
    if (n.isFile() && n.name.toLowerCase() === t.toLowerCase())
      return o;
    if (n.isDirectory()) {
      const s = st(o, t);
      if (s)
        return s;
    }
  }
  return null;
}, Xt = () => N ? process.arch === "arm64" ? `llama-${H}-bin-win-cpu-arm64.zip` : `llama-${H}-bin-win-cpu-x64.zip` : Ae ? process.arch === "x64" ? `llama-${H}-bin-macos-x64.tar.gz` : `llama-${H}-bin-macos-arm64.tar.gz` : process.platform === "linux" ? `llama-${H}-bin-ubuntu-x64.tar.gz` : null, Yt = () => {
  const e = Xt();
  return e ? g.join(_e(), e) : null;
}, Mr = () => {
  const e = Yt();
  return e ? `${e}.download` : null;
}, Dr = () => {
  const e = Xt();
  return e ? `https://github.com/ggml-org/llama.cpp/releases/download/${H}/${e}` : null;
}, At = () => st(_e(), Er), Nr = (e) => {
  if (!e || !u.existsSync(e))
    return null;
  try {
    return u.statSync(e).isFile() ? (N || u.accessSync(e, u.constants.X_OK), e) : null;
  } catch {
    return null;
  }
}, D = () => {
  const e = st(Z(), x);
  if (e)
    return e;
  const t = /* @__PURE__ */ new Set();
  (process.env.PATH || "").split(g.delimiter).filter(Boolean).forEach((n) => {
    t.add(g.join(n, x));
  }), N || (t.add("/opt/homebrew/bin/whisper-cli"), t.add("/usr/local/bin/whisper-cli"));
  for (const n of t) {
    const o = Nr(n);
    if (o)
      return o;
  }
  return null;
}, Y = () => g.join(A.getPath("userData"), "plugins"), it = () => {
  u.mkdirSync(Y(), { recursive: !0 });
}, Rt = (e) => {
  if (typeof e != "string" || !e.trim())
    throw new Error("A valid plugin filename is required.");
  const t = e.trim(), r = g.basename(t);
  if (r !== t || !r.toLowerCase().endsWith(".js"))
    throw new Error("Plugin filenames must be local .js files.");
  return r;
}, _r = (e) => {
  let t;
  try {
    t = new URL(e);
  } catch {
    return e;
  }
  const r = t.pathname.split("/").filter(Boolean);
  if (t.hostname === "github.com") {
    const [n, o, s, ...i] = r, [a, ...c] = i;
    if (n && o && (s === "blob" || s === "raw") && a && c.length > 0)
      return `https://raw.githubusercontent.com/${n}/${o}/${a}/${c.join("/")}`;
  }
  if (t.hostname === "raw.githubusercontent.com") {
    const [n, o, s, i, a, ...c] = r;
    if (n && o && s === "refs" && i === "heads" && a && c.length > 0)
      return `https://raw.githubusercontent.com/${n}/${o}/${a}/${c.join("/")}`;
  }
  return t.toString();
}, at = () => (it(), u.readdirSync(Y(), { withFileTypes: !0 }).filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".js")).map((e) => ({
  filename: e.name,
  id: e.name.replace(/\.js$/i, "").toLowerCase(),
  pluginPath: g.join(Y(), e.name)
}))), Fe = (e, t) => {
  var o;
  const r = new RegExp(`${t}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`), n = e.match(r);
  return ((o = n == null ? void 0 : n[2]) == null ? void 0 : o.trim()) || null;
}, Or = (e) => {
  try {
    const t = u.readFileSync(e, "utf8");
    return {
      description: Fe(t, "description"),
      name: Fe(t, "name"),
      version: Fe(t, "version")
    };
  } catch (t) {
    return console.error(`Failed to read plugin metadata from "${e}":`, t), {
      description: null,
      name: null,
      version: null
    };
  }
}, Le = () => {
  const e = Oe();
  return at().map((t) => {
    const r = Or(t.pluginPath), n = u.statSync(t.pluginPath);
    return {
      id: t.id,
      filename: t.filename,
      name: r.name || t.id,
      description: r.description,
      disabled: e.has(t.id),
      installedVersion: r.version,
      lastUpdatedAt: Number.isFinite(n.mtimeMs) ? n.mtimeMs : null
    };
  });
}, Cr = (e, t) => {
  if (P && !P.isDestroyed()) {
    const r = {
      reason: e,
      plugins: t,
      occurredAt: Date.now()
    };
    P.webContents.send("plugins:changed", r);
  }
}, Jt = (e, t, r = 0) => new Promise((n, o) => {
  if (r > 5) {
    o(new Error("Too many redirects while downloading the plugin."));
    return;
  }
  const s = _r(e);
  let i;
  try {
    i = new URL(s);
  } catch {
    o(new Error("The plugin download URL is invalid."));
    return;
  }
  if (i.protocol !== "https:") {
    o(new Error("Plugins must be downloaded over HTTPS."));
    return;
  }
  it();
  let a = null;
  const c = () => {
    a == null || a.close(), u.existsSync(t) && u.unlinkSync(t);
  };
  we.get(
    i,
    {
      headers: {
        "User-Agent": "link-plugin-store"
      }
    },
    (m) => {
      const p = m.statusCode ?? 0;
      if (p >= 300 && p < 400 && m.headers.location) {
        const w = new URL(m.headers.location, i).toString();
        Jt(w, t, r + 1).then(n).catch(o);
        return;
      }
      if (p !== 200) {
        m.resume(), c(), o(
          new Error(
            p === 404 ? "Plugin download failed with status 404. The manifest may be pointing to a missing file or a non-raw GitHub URL." : `Plugin download failed with status ${p}.`
          )
        );
        return;
      }
      a = u.createWriteStream(t), a.on("error", (w) => {
        c(), o(w);
      }), m.pipe(a), a.on("finish", () => {
        a.close(), n();
      });
    }
  ).on("error", (m) => {
    c(), o(m);
  });
}), qt = (e) => me(e).map((t) => t.trim().toLowerCase()).filter(Boolean), Oe = () => new Set(qt(ut(Ot, []))), Ur = (e) => {
  dt(Ot, qt(e));
}, Pe = (e, t) => {
  const r = e.trim().toLowerCase(), n = Oe();
  t ? n.add(r) : n.delete(r), Ur(Array.from(n));
}, xr = async () => {
  if (!(!P || P.isDestroyed()))
    try {
      await P.webContents.executeJavaScript(`
      (() => {
        const runtime = window.__linkPluginRuntime
        if (!runtime || !runtime.plugins) {
          return true
        }

        for (const pluginId of Object.keys(runtime.plugins)) {
          const plugin = runtime.plugins[pluginId]
          if (plugin && typeof plugin.dispose === 'function') {
            try {
              plugin.dispose()
            } catch (error) {
              console.error('Failed to dispose plugin', pluginId, error)
            }
          }
        }

        runtime.plugins = {}
        return true
      })()
    `);
    } catch (e) {
      console.error("Failed to dispose renderer plugins:", e);
    }
}, Fr = async (e) => {
  if (!P || P.isDestroyed())
    return;
  const t = await u.promises.readFile(e.pluginPath, "utf8"), r = await P.webContents.executeJavaScript(
    `
      (() => {
        const source = ${JSON.stringify(t)}
        const pluginId = ${JSON.stringify(e.id)}

        window.__linkPluginRuntime = window.__linkPluginRuntime || { plugins: {} }

        const module = { exports: {} }
        const exports = module.exports

        try {
          new Function('module', 'exports', source)(module, exports)

          if (module.exports && typeof module.exports === 'object') {
            window.__linkPluginRuntime.plugins[pluginId] = module.exports
            return { ok: true }
          }

          return { ok: false, error: 'Plugin did not export an object.' }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })()
    `
  );
  if (!(r != null && r.ok))
    throw new Error((r == null ? void 0 : r.error) || "Renderer plugin execution failed.");
}, $r = async () => {
  const e = at(), t = Oe();
  await xr(), yt.clear();
  for (const r of e)
    if (!t.has(r.id))
      try {
        const o = await import(`${lr(r.pluginPath).href}?v=${u.statSync(r.pluginPath).mtimeMs}`);
        yt.set(r.id, o), await Fr(r);
      } catch (n) {
        console.error(`Failed to load plugin "${r.filename}":`, n);
      }
  return Le();
}, z = async (e) => {
  const t = Et.catch(() => Le()).then(async () => {
    const r = await $r();
    return Cr(e, r), r;
  });
  return Et = t.catch(() => Le()), t;
}, It = (e = "filesystem") => {
  U && clearTimeout(U), U = setTimeout(() => {
    U = null, z(e);
  }, 250);
}, lt = () => {
  U && (clearTimeout(U), U = null), ue && (ue.close(), ue = null);
}, ct = () => {
  it(), lt();
  try {
    ue = u.watch(Y(), (e, t) => {
      const r = typeof t == "string" ? t : String(t || "");
      !r || !r.toLowerCase().endsWith(".js") || It("filesystem");
    }), ue.on("error", (e) => {
      console.error("Plugin directory watcher error:", e), It("filesystem"), ct();
    });
  } catch (e) {
    console.error("Failed to start plugin directory watcher:", e);
  }
}, Kt = () => {
  const e = ge();
  return e > 0 ? {
    downloadedBytes: e,
    totalBytes: e,
    isComplete: !0
  } : {
    downloadedBytes: ot(),
    totalBytes: null,
    isComplete: !1
  };
}, fe = () => {
  const e = X(), t = he();
  return e > 0 && t > 0 ? {
    downloadedBytes: e + t,
    totalBytes: e + t,
    isComplete: !0
  } : {
    downloadedBytes: Ht() + qe(),
    totalBytes: null,
    isComplete: !1
  };
}, Zt = () => {
  const e = Ie(), t = D();
  return e > 0 && t ? {
    downloadedBytes: e,
    totalBytes: e,
    isComplete: !0
  } : {
    downloadedBytes: zt() + Gt(),
    totalBytes: null,
    isComplete: !1
  };
}, Ee = () => (P && !P.isDestroyed() && P.webContents.send("ai:status", l), l), b = (e = {}) => {
  if (l = {
    ...l,
    ...e,
    modelName: ve,
    modelPath: J()
  }, l.status !== "downloading") {
    const t = Kt();
    l.downloadedBytes = t.downloadedBytes, t.isComplete ? l.totalBytes = t.totalBytes : l.totalBytes != null && l.totalBytes < t.downloadedBytes && (l.totalBytes = t.downloadedBytes);
  }
  return Ee();
}, R = (e = {}) => {
  if (l = {
    ...l,
    visualModel: {
      ...l.visualModel,
      ...e,
      modelName: Me,
      modelPath: q(),
      projectorName: De,
      projectorPath: K()
    }
  }, l.visualModel.status !== "downloading") {
    const t = fe();
    l.visualModel.downloadedBytes = t.downloadedBytes, t.isComplete ? l.visualModel.totalBytes = t.totalBytes : l.visualModel.totalBytes != null && l.visualModel.totalBytes < t.downloadedBytes && (l.visualModel.totalBytes = t.downloadedBytes);
  }
  return Ee();
}, L = (e = {}) => {
  if (l = {
    ...l,
    speechModel: {
      ...l.speechModel,
      ...e,
      modelName: Ne,
      modelPath: F(),
      runtimeName: x,
      runtimePath: D() || g.join(Z(), x)
    }
  }, l.speechModel.status !== "downloading") {
    const t = Zt();
    l.speechModel.downloadedBytes = t.downloadedBytes, t.isComplete ? l.speechModel.totalBytes = t.totalBytes : l.speechModel.totalBytes != null && l.speechModel.totalBytes < t.downloadedBytes && (l.speechModel.totalBytes = t.downloadedBytes);
  }
  return Ee();
}, dt = (e, t) => {
  d.prepare(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(e, JSON.stringify(t));
}, ut = (e, t) => {
  const r = d.prepare("SELECT value FROM app_settings WHERE key = ?").get(e);
  if (!(r != null && r.value))
    return t;
  try {
    return JSON.parse(r.value);
  } catch {
    return t;
  }
}, Vr = () => kt(
  ut(Nt, l.transcriptionPreferences)
), Wr = () => vt(
  ut(_t, l.generationPreferences)
), jr = (e) => {
  const t = kt(e);
  return dt(Nt, t), l = {
    ...l,
    transcriptionPreferences: t
  }, Ee();
}, Hr = (e) => {
  const t = vt(e);
  return dt(_t, t), l = {
    ...l,
    generationPreferences: t
  }, Ee();
}, zr = () => {
  const e = Kt(), t = fe(), r = Zt();
  l = {
    ...Se(),
    modelName: ve,
    modelPath: J(),
    status: e.isComplete ? "downloaded" : "missing",
    downloadedBytes: e.downloadedBytes,
    totalBytes: e.totalBytes,
    visualModel: {
      ...Se().visualModel,
      modelName: Me,
      modelPath: q(),
      projectorName: De,
      projectorPath: K(),
      status: t.isComplete ? "downloaded" : "missing",
      downloadedBytes: t.downloadedBytes,
      totalBytes: t.totalBytes
    },
    speechModel: {
      ...Se().speechModel,
      modelName: Ne,
      modelPath: F(),
      runtimeName: x,
      runtimePath: D() || g.join(Z(), x),
      status: r.isComplete && D() ? "ready" : "missing",
      downloadedBytes: r.downloadedBytes,
      totalBytes: r.totalBytes
    },
    transcriptionPreferences: Vr(),
    generationPreferences: Wr()
  };
}, Gr = async () => {
  await u.promises.mkdir(Ut(), { recursive: !0 });
}, Xr = async () => {
  await u.promises.mkdir(nt(), { recursive: !0 });
}, Ce = () => g.join(A.getPath("userData"), "vision-inputs"), pt = async () => {
  await u.promises.mkdir(Ce(), { recursive: !0 });
}, Yr = (e) => {
  switch (g.extname(e).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}, Jr = async () => {
  await u.promises.mkdir(_e(), { recursive: !0 });
}, qr = async () => {
  await u.promises.mkdir(Vt(), { recursive: !0 });
}, Kr = async () => {
  await u.promises.mkdir(Z(), { recursive: !0 });
}, Lt = (e) => {
  if (typeof e != "string" || !e.trim())
    return null;
  const t = e.match(/\/(\d+)\s*$/);
  if (!t)
    return null;
  const r = Number(t[1]);
  return Number.isFinite(r) ? r : null;
}, $ = (e, t, r = {}) => new Promise((n, o) => {
  const s = r.tempPath ?? `${t}.download`, i = r.resourceLabel ?? "Model";
  let a = !1;
  const c = (m) => {
    a || (a = !0, o(m));
  }, h = (m) => {
    const p = B(s);
    we.get(
      m,
      {
        headers: {
          "User-Agent": "Link-Desktop/1.0",
          ...p > 0 ? { Range: `bytes=${p}-` } : {}
        }
      },
      (y) => {
        var ft;
        const T = y.statusCode ?? 0;
        if ([301, 302, 307, 308].includes(T) && y.headers.location) {
          y.resume();
          const S = new URL(y.headers.location, m).toString();
          h(S);
          return;
        }
        if (T === 416 && p > 0) {
          const S = Lt(y.headers["content-range"]);
          if (y.resume(), S != null && p >= S) {
            u.promises.unlink(t).catch(() => {
            }).finally(() => {
              u.promises.rename(s, t).then(() => {
                a = !0, n();
              }).catch(
                (W) => c(W instanceof Error ? W : new Error("Unable to save the model file."))
              );
            });
            return;
          }
          u.promises.unlink(s).catch(() => {
          }).finally(() => h(m));
          return;
        }
        if (T !== 200 && T !== 206) {
          y.resume(), c(new Error(`${i} download failed with status ${T}.`));
          return;
        }
        const I = y.headers["content-length"], Q = typeof I == "string" && I.trim() ? Number(I) : null, E = p > 0 && T === 206, V = E ? Lt(y.headers["content-range"]) ?? (Q != null ? p + Q : null) : Q;
        let M = E ? p : 0, Ue = Date.now(), gt = M, ht = null;
        (ft = r.onProgress) == null || ft.call(r, {
          receivedBytes: M,
          totalBytes: V,
          percent: V ? M / V * 100 : null,
          speedBytesPerSecond: null
        });
        const ee = u.createWriteStream(s, { flags: E ? "a" : "w" });
        y.on("data", (S) => {
          var wt;
          M += S.length;
          const W = Date.now();
          W - Ue >= 250 && (ht = Math.round((M - gt) * 1e3 / (W - Ue)), gt = M, Ue = W), (wt = r.onProgress) == null || wt.call(r, {
            receivedBytes: M,
            totalBytes: V,
            percent: V ? M / V * 100 : null,
            speedBytesPerSecond: ht
          });
        }), y.on("error", (S) => {
          ee.destroy(), c(S instanceof Error ? S : new Error("Model download failed."));
        }), ee.on("error", (S) => {
          y.destroy(), c(S);
        }), ee.on("finish", () => {
          ee.close(async () => {
            if (!a)
              try {
                u.existsSync(t) && await u.promises.unlink(t), await u.promises.rename(s, t), a = !0, n();
              } catch (S) {
                c(S instanceof Error ? S : new Error("Unable to save the model file."));
              }
          });
        }), y.pipe(ee);
      }
    ).on("error", (y) => c(y));
  };
  h(e);
}), mt = async () => {
  if (k != null && k.model)
    return b({
      status: "ready",
      progress: null,
      error: null
    }), k.model;
  if (se)
    return await se, k == null ? void 0 : k.model;
  const e = J();
  if (!u.existsSync(e))
    throw b({
      status: "missing",
      error: "Download the Phi-3 model from Settings before requesting ghost text.",
      progress: null,
      downloadedBytes: 0,
      totalBytes: null
    }), new Error("Local model is not downloaded yet.");
  return se = (async () => {
    b({
      status: "starting",
      progress: null,
      error: null
    });
    try {
      const r = await (await import("node-llama-cpp")).getLlama(), n = await r.loadModel({ modelPath: e });
      return k = {
        llama: r,
        model: n
      }, b({
        status: "ready",
        progress: null,
        error: null,
        downloadedBytes: ge(),
        totalBytes: ge()
      }), n;
    } catch (t) {
      throw k = null, b({
        status: "error",
        progress: null,
        error: t instanceof Error ? t.message : "Unable to start the local model."
      }), t;
    } finally {
      se = null;
    }
  })(), se;
}, Qt = () => te || (te = (async () => {
  try {
    await Gr();
    const e = J(), t = ot();
    b({
      status: "downloading",
      progress: {
        receivedBytes: t,
        totalBytes: l.totalBytes,
        percent: l.totalBytes ? t / l.totalBytes * 100 : null,
        speedBytesPerSecond: null
      },
      downloadedBytes: t,
      totalBytes: l.totalBytes,
      error: null
    }), await $(pr, e, {
      tempPath: xt(),
      onProgress: ({ receivedBytes: n, totalBytes: o, percent: s, speedBytesPerSecond: i }) => {
        b({
          status: "downloading",
          progress: {
            receivedBytes: n,
            totalBytes: o,
            percent: s,
            speedBytesPerSecond: i
          },
          downloadedBytes: n,
          totalBytes: o,
          error: null
        });
      }
    });
    const r = ge();
    b({
      status: "downloaded",
      progress: null,
      downloadedBytes: r,
      totalBytes: r,
      error: null
    }), await mt();
  } catch (e) {
    b({
      status: "error",
      progress: null,
      error: e instanceof Error ? e.message : "Unable to download the local model."
    });
  } finally {
    te = null;
  }
})(), te), Zr = (e, t = []) => new Promise((r, n) => {
  if (!N) {
    n(new Error("Whisper runtime extraction is currently available only on Windows."));
    return;
  }
  const o = process.env.SYSTEMROOT != null ? g.join(process.env.SYSTEMROOT, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", s = be(o, ["-NoProfile", "-NonInteractive", "-Command", e, ...t], {
    windowsHide: !0
  });
  let i = "";
  s.stderr.on("data", (a) => {
    i += a.toString();
  }), s.on("error", (a) => {
    n(a);
  }), s.on("close", (a) => {
    if (a === 0) {
      r();
      return;
    }
    n(new Error(i.trim() || `PowerShell exited with code ${a}.`));
  });
}), Qr = (e, t, r = {}) => new Promise((n, o) => {
  const s = be(e, t, {
    cwd: r.cwd,
    windowsHide: !0
  });
  let i = "";
  s.stderr.on("data", (a) => {
    i += a.toString();
  }), s.on("error", (a) => {
    o(a);
  }), s.on("close", (a) => {
    if (a === 0) {
      n();
      return;
    }
    o(new Error(i.trim() || `${g.basename(e)} exited with code ${a}.`));
  });
}), er = async (e, t) => {
  await u.promises.mkdir(t, { recursive: !0 }), await Zr(
    "& { param($archive, $destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }",
    [e, t]
  );
}, en = async (e, t) => {
  if (await u.promises.mkdir(t, { recursive: !0 }), e.toLowerCase().endsWith(".zip")) {
    await er(e, t);
    return;
  }
  if (e.toLowerCase().endsWith(".tar.gz")) {
    await Qr("tar", ["-xzf", e, "-C", t]);
    return;
  }
  throw new Error("Unsupported runtime archive format.");
}, tn = (e) => new Promise((t) => {
  setTimeout(t, e);
}), tr = () => new Promise((e, t) => {
  const r = ar.createServer();
  r.on("error", (n) => {
    t(n);
  }), r.listen(0, "127.0.0.1", () => {
    const n = r.address();
    if (!n || typeof n == "string") {
      r.close(), t(new Error("Unable to allocate a local port for the vision model server."));
      return;
    }
    const { port: o } = n;
    r.close((s) => {
      if (s) {
        t(s);
        return;
      }
      e(o);
    });
  });
}), rn = async () => {
  const e = C;
  e && (await new Promise((t) => {
    e.close(() => t());
  }), C === e && (C = null, le = null));
}, nn = async () => C && le ? le : ae || (ae = (async () => {
  await pt();
  const e = Ce(), t = await tr(), r = Be.createServer((n, o) => {
    if (n.method !== "GET" && n.method !== "HEAD") {
      o.statusCode = 405, o.end();
      return;
    }
    let s = "";
    try {
      const a = new URL(n.url || "/", `http://127.0.0.1:${t}`);
      s = decodeURIComponent(a.pathname.replace(/^\/+/, ""));
    } catch {
      o.statusCode = 400, o.end("Invalid request.");
      return;
    }
    if (!s || g.basename(s) !== s) {
      o.statusCode = 403, o.end("File path is not allowed.");
      return;
    }
    const i = g.join(e, s);
    u.promises.readFile(i).then((a) => {
      if (o.statusCode = 200, o.setHeader("Content-Type", Yr(i)), o.setHeader("Cache-Control", "no-store"), n.method === "HEAD") {
        o.end();
        return;
      }
      o.end(a);
    }).catch((a) => {
      o.statusCode = a && typeof a == "object" && "code" in a && a.code === "ENOENT" ? 404 : 500, o.end();
    });
  });
  return await new Promise((n, o) => {
    const s = (a) => {
      r.off("listening", i), o(a);
    }, i = () => {
      r.off("error", s), n();
    };
    r.once("error", s), r.once("listening", i), r.listen(t, "127.0.0.1");
  }), r.on("close", () => {
    C === r && (C = null, le = null);
  }), C = r, le = t, t;
})().finally(() => {
  ae = null;
}), ae), on = (e, t = {}) => new Promise((r, n) => {
  const o = new URL(e), s = t.body == null ? null : JSON.stringify(t.body), a = (o.protocol === "https:" ? we : Be).request(
    o,
    {
      method: t.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...s ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(s).toString()
        } : {},
        ...t.headers
      }
    },
    (h) => {
      const m = [];
      h.on("data", (p) => {
        m.push(Buffer.isBuffer(p) ? p : Buffer.from(p));
      }), h.on("end", () => {
        const p = Buffer.concat(m).toString("utf8");
        if ((h.statusCode ?? 500) < 200 || (h.statusCode ?? 500) >= 300) {
          n(
            new Error(
              p.trim() || `Request failed with status ${h.statusCode ?? 500}.`
            )
          );
          return;
        }
        if (!p.trim()) {
          r({});
          return;
        }
        try {
          r(JSON.parse(p));
        } catch (w) {
          n(w instanceof Error ? w : new Error("The server returned invalid JSON."));
        }
      });
    }
  ), c = () => {
    a.destroy(new Error("The request was cancelled."));
  };
  t.signal && (t.signal.aborted ? c() : t.signal.addEventListener("abort", c, { once: !0 })), a.on("error", (h) => {
    n(h);
  }), s && a.write(s), a.end();
}), sn = (e) => {
  var t;
  try {
    const r = JSON.parse(e);
    if ((t = r == null ? void 0 : r.error) != null && t.message && typeof r.error.message == "string")
      return r.error.message;
    if (r != null && r.message && typeof r.message == "string")
      return r.message;
  } catch {
    return e;
  }
  return e;
}, an = (e, t) => !(e instanceof Error) || !e.message.trim() ? t : sn(e.message.trim()), ln = (e, t = {}) => new Promise((r, n) => {
  let o = !1;
  const s = (a) => {
    o || (o = !0, n(a));
  }, i = (a) => {
    const c = new URL(a), m = (c.protocol === "https:" ? we : Be).request(
      c,
      {
        method: "GET",
        headers: {
          "User-Agent": "Link-Desktop/1.0",
          ...t.headers
        }
      },
      (w) => {
        const y = w.statusCode ?? 0;
        if ([301, 302, 307, 308].includes(y) && w.headers.location) {
          w.resume(), i(new URL(w.headers.location, a).toString());
          return;
        }
        const T = [];
        w.on("data", (I) => {
          T.push(Buffer.isBuffer(I) ? I : Buffer.from(I));
        }), w.on("end", () => {
          if (!o) {
            if (y < 200 || y >= 300) {
              s(
                new Error(
                  Buffer.concat(T).toString("utf8").trim() || `Request failed with status ${y}.`
                )
              );
              return;
            }
            o = !0, r(Buffer.concat(T));
          }
        });
      }
    ), p = () => {
      m.destroy(new Error("The request was cancelled."));
    };
    t.signal && (t.signal.aborted ? p() : t.signal.addEventListener("abort", p, { once: !0 })), m.on("error", (w) => {
      s(w instanceof Error ? w : new Error("Unable to load the image."));
    }), m.end();
  };
  i(e);
}), cn = async (e, t) => {
  const r = e.trim();
  if (!r)
    throw new Error("No image was found in the focused block.");
  if (r.startsWith("data:image")) {
    const n = r.indexOf(",");
    if (n <= 0)
      throw new Error("The image block contains invalid image data.");
    const o = r.slice(5, n), s = r.slice(n + 1).replace(/\s+/g, ""), [i = "image/png", ...a] = o.split(";");
    if (i.toLowerCase() === "image/svg+xml")
      throw new Error("SVG images are not supported for local vision analysis. Use PNG, JPG, or WebP.");
    if (!a.some((h) => h.toLowerCase() === "base64"))
      throw new Error("The image block uses an unsupported encoding. Use a standard image file instead.");
    const c = Buffer.from(s, "base64");
    if (!c.length)
      throw new Error("The image block is empty.");
    return c;
  }
  if (r.startsWith("file://"))
    return u.promises.readFile(Qe(r));
  if (/^https?:\/\//i.test(r))
    return ln(r, { signal: t });
  throw new Error("The image block must contain a valid image.");
}, dn = (e) => {
  switch (e.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/bmp":
      return ".bmp";
    case "image/tiff":
      return ".tiff";
    default:
      return ".img";
  }
}, $e = (e = ".img") => g.join(
  Ce(),
  `vision-input-${Date.now()}-${Math.random().toString(16).slice(2)}${e}`
), Ve = async (e) => `http://127.0.0.1:${await nn()}/${encodeURIComponent(g.basename(e))}`, un = async (e, t) => {
  const r = e.trim();
  if (!r)
    throw new Error("No image was found in the focused block.");
  if (await pt(), r.startsWith("data:image")) {
    const n = r.indexOf(",");
    if (n <= 0)
      throw new Error("The image block contains invalid image data.");
    const o = r.slice(5, n), [s = "image/png"] = o.split(";"), i = await cn(r, t), a = $e(dn(s));
    return await u.promises.writeFile(a, i), {
      url: await Ve(a),
      cleanup: async () => {
        await u.promises.unlink(a).catch(() => {
        });
      }
    };
  }
  if (r.startsWith("file://")) {
    const n = Qe(r), o = $e(g.extname(n) || ".img");
    return await u.promises.copyFile(n, o), {
      url: await Ve(o),
      cleanup: async () => {
        await u.promises.unlink(o).catch(() => {
        });
      }
    };
  }
  if (/^https?:\/\//i.test(r)) {
    const n = (() => {
      try {
        return new URL(r).pathname;
      } catch {
        return "";
      }
    })(), o = $e(g.extname(n) || ".img");
    return await $(r, o, {
      tempPath: `${o}.download`,
      resourceLabel: "Vision image"
    }), {
      url: await Ve(o),
      cleanup: async () => {
        await u.promises.unlink(o).catch(() => {
        });
      }
    };
  }
  throw new Error("The image block must contain a valid image.");
}, rr = (e) => new Promise((t, r) => {
  const n = new URL(e), s = (n.protocol === "https:" ? we : Be).request(
    n,
    {
      method: "GET"
    },
    (i) => {
      if (i.resume(), (i.statusCode ?? 500) >= 200 && (i.statusCode ?? 500) < 300) {
        t();
        return;
      }
      r(new Error(`Request failed with status ${i.statusCode ?? 500}.`));
    }
  );
  s.on("error", r), s.end();
}), Ke = () => fe().isComplete ? "downloaded" : "missing", pn = async () => {
  const e = q(), t = K();
  if (!u.existsSync(e) || !u.existsSync(t)) {
    const r = `Download MiniCPM-V 4.5 in Settings before using ${ze} + L on an image block.`;
    throw R({
      status: "missing",
      progress: null,
      error: r
    }), new Error(r);
  }
  return R({
    status: l.visualModel.status === "ready" ? "ready" : "downloaded",
    progress: null,
    error: l.visualModel.status === "ready" ? l.visualModel.error : null,
    downloadedBytes: X() + he(),
    totalBytes: X() + he()
  }), {
    modelPath: e,
    projectorPath: t
  };
}, mn = async () => {
  const e = At();
  return e || ne || (ne = (async () => {
    const t = Dr(), r = Yt(), n = Mr();
    if (!t || !r || !n)
      throw new Error("The local MiniCPM-V runtime is not available for this platform.");
    await Jr(), await $(t, r, {
      tempPath: n,
      resourceLabel: "Vision runtime"
    }), await en(r, _e()), await u.promises.unlink(r).catch(() => {
    });
    const o = At();
    if (!o)
      throw new Error("The MiniCPM-V runtime was downloaded but llama-server could not be found.");
    return o;
  })().finally(() => {
    ne = null;
  }), ne);
}, gn = async (e, t = wr) => {
  const r = Date.now();
  for (; Date.now() - r <= t; )
    try {
      await rr(`http://127.0.0.1:${e}/health`);
      return;
    } catch {
      await tn(yr);
    }
  throw new Error("MiniCPM-V took too long to become ready.");
}, hn = async () => {
  const e = v;
  e && (G = !0, await new Promise((t) => {
    let r = !1;
    const n = () => {
      r || (r = !0, t());
    };
    e.once("exit", n);
    try {
      e.kill();
    } catch {
      n();
      return;
    }
    setTimeout(() => {
      if (!r)
        try {
          e.kill("SIGKILL");
        } catch {
          n();
        }
    }, 5e3);
  }), G = !1);
}, fn = async () => {
  if (v && j)
    try {
      return await rr(`http://127.0.0.1:${j}/health`), R({
        status: "ready",
        progress: null,
        error: null
      }), `http://127.0.0.1:${j}`;
    } catch {
      await hn();
    }
  return ie || (ie = (async () => {
    const { modelPath: e, projectorPath: t } = await pn(), r = await mn();
    await pt();
    const n = await tr(), o = g.dirname(r);
    let s = "";
    R({
      status: "starting",
      progress: null,
      error: null
    });
    const i = be(
      r,
      [
        "-m",
        e,
        "--mmproj",
        t,
        "--ctx-size",
        "8192",
        "--host",
        "127.0.0.1",
        "--port",
        String(n),
        "--alias",
        Ct,
        "--media-path",
        Ce(),
        "--no-webui"
      ],
      {
        cwd: o,
        windowsHide: !0
      }
    ), a = (c) => {
      s = `${s}${c.toString()}`.slice(-4e3);
    };
    i.stdout.on("data", a), i.stderr.on("data", a), i.on("exit", (c, h) => {
      v === i && (v = null, j = null, R({
        status: Ke(),
        progress: null,
        error: G || c === 0 ? null : `MiniCPM-V runtime stopped unexpectedly (${h || c || "unknown"}).`
      }));
    }), v = i, j = n;
    try {
      return await gn(n), R({
        status: "ready",
        progress: null,
        error: null
      }), `http://127.0.0.1:${n}`;
    } catch (c) {
      throw v = null, j = null, G = !0, i.kill(), G = !1, new Error(
        c instanceof Error && c.message ? `${c.message}${s.trim() ? ` ${s.trim()}` : ""}` : "Unable to start the MiniCPM-V runtime."
      );
    }
  })().catch((e) => {
    throw R({
      status: Ke(),
      progress: null,
      error: e instanceof Error ? e.message : "Unable to prepare MiniCPM-V."
    }), e;
  }).finally(() => {
    ie = null;
  }), ie);
}, nr = () => re || (re = (async () => {
  try {
    await Xr();
    const e = X(), t = he(), r = e + t + Ht() + qe();
    R({
      status: "downloading",
      progress: {
        receivedBytes: r,
        totalBytes: l.visualModel.totalBytes,
        percent: l.visualModel.totalBytes ? r / l.visualModel.totalBytes * 100 : null,
        speedBytesPerSecond: null
      },
      downloadedBytes: r,
      totalBytes: l.visualModel.totalBytes,
      error: null
    });
    let n = null;
    e === 0 ? await $(mr, q(), {
      tempPath: Ft(),
      onProgress: ({ receivedBytes: a, totalBytes: c, percent: h, speedBytesPerSecond: m }) => {
        n = c, R({
          status: "downloading",
          progress: {
            receivedBytes: a,
            totalBytes: c != null && l.visualModel.totalBytes != null ? c + Math.max(l.visualModel.totalBytes - c, 0) : c,
            percent: h,
            speedBytesPerSecond: m
          },
          downloadedBytes: a,
          totalBytes: c,
          error: null
        });
      }
    }) : n = e;
    const o = X(), s = o + qe();
    R({
      status: "downloading",
      progress: {
        receivedBytes: s,
        totalBytes: n,
        percent: null,
        speedBytesPerSecond: null
      },
      downloadedBytes: s,
      totalBytes: n,
      error: null
    }), t === 0 && await $(gr, K(), {
      tempPath: $t(),
      onProgress: ({ receivedBytes: a, totalBytes: c, speedBytesPerSecond: h }) => {
        const m = o + a, p = c != null ? o + c : null;
        R({
          status: "downloading",
          progress: {
            receivedBytes: m,
            totalBytes: p,
            percent: p ? m / p * 100 : null,
            speedBytesPerSecond: h
          },
          downloadedBytes: m,
          totalBytes: p,
          error: null
        });
      }
    });
    const i = X() + he();
    R({
      status: "downloaded",
      progress: null,
      downloadedBytes: i,
      totalBytes: i,
      error: null
    });
  } catch (e) {
    R({
      status: Ke(),
      progress: null,
      error: e instanceof Error ? e.message : "Unable to download the MiniCPM-V model."
    });
  } finally {
    re = null;
  }
})(), re), wn = async () => {
  const e = F(), t = D();
  if (!u.existsSync(e) || !t) {
    const r = !t && !N ? `Speech transcription on this build still needs a macOS whisper-cli runtime. Install whisper.cpp with Homebrew or place whisper-cli on PATH, then ${ze} + J will work.` : `Download Whisper small.en in Settings before using ${ze} + J.`;
    throw L({
      status: "missing",
      progress: null,
      error: r
    }), new Error(r);
  }
  return L({
    status: "ready",
    progress: null,
    error: null,
    downloadedBytes: Ie(),
    totalBytes: Ie(),
    runtimePath: t
  }), {
    modelPath: e,
    runtimePath: t
  };
}, yn = () => oe || (oe = (async () => {
  try {
    if (!N && !D())
      throw new Error(
        "Speech runtime download is currently packaged for Windows only. On macOS, install whisper.cpp with Homebrew or place whisper-cli on PATH, then download Whisper small.en."
      );
    if (await Kr(), await qr(), !D()) {
      const n = Gt();
      L({
        status: "downloading",
        progress: {
          receivedBytes: n,
          totalBytes: l.speechModel.totalBytes,
          percent: l.speechModel.totalBytes != null && l.speechModel.totalBytes > 0 ? n / l.speechModel.totalBytes * 100 : null,
          speedBytesPerSecond: null
        },
        downloadedBytes: n,
        totalBytes: l.speechModel.totalBytes,
        error: null
      }), await $(Pr, Je(), {
        tempPath: jt(),
        onProgress: ({ receivedBytes: o, totalBytes: s, percent: i, speedBytesPerSecond: a }) => {
          L({
            status: "downloading",
            progress: {
              receivedBytes: o,
              totalBytes: s,
              percent: i,
              speedBytesPerSecond: a
            },
            downloadedBytes: o,
            totalBytes: s,
            error: null
          });
        }
      }), await er(Je(), Z());
    }
    const t = D();
    if (!t)
      throw new Error(
        `Whisper runtime was downloaded, but ${x} could not be found.`
      );
    if (!u.existsSync(F())) {
      const n = zt();
      L({
        status: "downloading",
        progress: {
          receivedBytes: n,
          totalBytes: l.speechModel.totalBytes,
          percent: l.speechModel.totalBytes != null && l.speechModel.totalBytes > 0 ? n / l.speechModel.totalBytes * 100 : null,
          speedBytesPerSecond: null
        },
        downloadedBytes: n,
        totalBytes: l.speechModel.totalBytes,
        error: null,
        runtimePath: t
      }), await $(hr, F(), {
        tempPath: Wt(),
        onProgress: ({ receivedBytes: o, totalBytes: s, percent: i, speedBytesPerSecond: a }) => {
          L({
            status: "downloading",
            progress: {
              receivedBytes: o,
              totalBytes: s,
              percent: i,
              speedBytesPerSecond: a
            },
            downloadedBytes: o,
            totalBytes: s,
            error: null,
            runtimePath: t
          });
        }
      });
    }
    const r = Ie();
    L({
      status: "ready",
      progress: null,
      downloadedBytes: r,
      totalBytes: r,
      error: null,
      runtimePath: t
    });
  } catch (e) {
    L({
      status: "error",
      progress: null,
      error: e instanceof Error ? e.message : "Unable to download the speech model."
    });
  } finally {
    oe = null;
  }
})(), oe), En = (e) => e.replace(/\r/g, "").split(`
`).map((t) => {
  var n;
  const r = t.match(/^\[[^\]]+\]\s*(.*)$/);
  return ((n = r == null ? void 0 : r[1]) == null ? void 0 : n.trim()) ?? "";
}).filter(Boolean).join(" ").replace(/\s+/g, " ").trim(), de = "Audio transcription cancelled.", Tn = /\[BLANK_AUDIO\]/gi, Pn = (e) => e.replace(Tn, " ").replace(/\s+/g, " ").trim(), Sn = (e) => e === "No audio was captured." || e === "No speech was detected in the captured audio.", An = (e) => e === de, Rn = async (e) => {
  const t = typeof e == "string" ? e.trim() : "";
  if (!t)
    return;
  _.add(t);
  const r = ce.get(t);
  if (r && !r.killed) {
    r.kill();
    return;
  }
}, In = async (e) => {
  const t = g.join(A.getPath("userData"), "audio-transcription"), r = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`, n = g.join(t, r), o = typeof e.requestId == "string" && e.requestId.trim() ? e.requestId.trim() : null;
  try {
    const { modelPath: s, runtimePath: i } = await wn(), a = Buffer.from(e.audioData ?? []);
    if (o && _.has(o))
      throw new Error(de);
    if (a.length === 0)
      return {
        text: "",
        status: l.speechModel.status,
        error: "No audio was captured."
      };
    await u.promises.mkdir(t, { recursive: !0 }), await u.promises.writeFile(n, a);
    const c = await new Promise((h, m) => {
      if (o && _.has(o)) {
        m(new Error(de));
        return;
      }
      const p = be(i, ["-m", s, "-f", n], {
        cwd: g.dirname(i),
        windowsHide: !0
      });
      o && (ce.set(o, p), _.has(o) && !p.killed && p.kill());
      let w = "", y = "";
      p.stdout.on("data", (T) => {
        w += T.toString();
      }), p.stderr.on("data", (T) => {
        y += T.toString();
      }), p.on("error", (T) => {
        if (o && (ce.delete(o), _.delete(o))) {
          m(new Error(de));
          return;
        }
        m(T);
      }), p.on("close", (T) => {
        if (o && (ce.delete(o), _.delete(o))) {
          m(new Error(de));
          return;
        }
        if (T !== 0) {
          m(new Error(y.trim() || `whisper-cli exited with code ${T}.`));
          return;
        }
        const I = Pn(En(`${w}
${y}`));
        if (!I) {
          m(new Error("No speech was detected in the captured audio."));
          return;
        }
        h(I);
      });
    });
    return L({
      status: "ready",
      progress: null,
      error: null
    }), {
      text: c,
      status: "ready",
      error: null
    };
  } catch (s) {
    const i = s instanceof Error ? s.message : "Unable to transcribe audio.";
    return Sn(i) || An(i) ? (L({
      status: "ready",
      progress: null,
      error: null
    }), {
      text: "",
      status: "ready",
      error: i
    }) : (L({
      status: l.speechModel.status === "missing" ? "missing" : "error",
      progress: null,
      error: i
    }), {
      text: "",
      status: l.speechModel.status,
      error: i
    });
  } finally {
    o && (ce.delete(o), _.delete(o)), await u.promises.unlink(n).catch(() => {
    });
  }
}, bt = (e, t, r) => {
  const o = e.replace(/\r/g, "").split(`
`);
  return (r ? o.slice(-t) : o.slice(0, t)).join(`
`);
}, Bt = (e, t, r = 160) => {
  const n = Math.min(e.length, t.length, r);
  for (let o = n; o > 0; o -= 1)
    if (e.slice(-o) === t.slice(0, o))
      return o;
  return 0;
}, Ln = (e, t) => {
  const r = t.blockType === "code" ? 6 : 2, n = t.blockType === "code" ? 240 : 160;
  return e.split(`
`).slice(0, r).join(`
`).slice(0, n);
}, bn = (e, t) => {
  let r = e.replace(/\r/g, "").replace(/^```[A-Za-z0-9_-]*\n?/i, "").replace(/\n?```$/, "").replace(/^(sure|here(?:'s| is)|continuation:)\s*/i, "").replace(/\u0000/g, "");
  if (!r.trim())
    return "";
  const n = Bt(t.beforeText, r);
  n > 0 && (r = r.slice(n));
  const o = Bt(r, t.afterText);
  if (o > 0 && (r = r.slice(0, -o)), r = r.replace(/\n{3,}/g, `

`).replace(/[ \t]+$/g, ""), !r.trim())
    return "";
  const s = t.beforeText.slice(-1), i = r.charAt(0), a = !!s && !!i && !/\s/.test(s) && !/\s/.test(i) && /[A-Za-z0-9([{'"`]/.test(i), c = r.slice(-1), h = t.afterText.charAt(0), m = t.blockType !== "code" && !!c && !!h && !/\s/.test(c) && !/\s/.test(h) && /[A-Za-z0-9)]/.test(c) && /[A-Za-z0-9([{'"`]/.test(h);
  return r = `${a ? " " : ""}${r}${m ? " " : ""}`, Ln(r, t);
}, Bn = async (e) => {
  try {
    const t = await mt(), r = await import("node-llama-cpp"), n = await t.createContext({ contextSize: 2048 });
    try {
      const o = new r.LlamaChatSession({
        contextSequence: n.getSequence()
      }), s = `${e.beforeText}<CURSOR>${e.afterText}` || "<CURSOR>", i = bt(e.beforeText, 7, !0), a = bt(e.afterText, 3, !1), c = [
        "You generate inline ghost text inside a note-taking editor.",
        "Reply with only the exact text to insert at <CURSOR>.",
        "Use only the currently focused block. Ignore page titles, page metadata, and other blocks.",
        "Match the existing spacing, punctuation, indentation, and tone.",
        "Do not explain, do not quote, and do not repeat text that is already before or after the cursor.",
        e.blockType === "code" ? "Continue the code naturally and keep the syntax valid." : "Prefer a direct continuation of the current sentence or line.",
        "Do not add list bullets, heading markers, or checkbox syntax unless it belongs inside the block text itself.",
        `Focused block type: ${e.blockType}`,
        `Last 7 lines before cursor:
${i || "(empty)"}`,
        `Upcoming text after cursor:
${a || "(none)"}`,
        `Focused block with cursor:
${s}`
      ].join(`

`), h = await o.prompt(c, {
        maxTokens: e.blockType === "code" ? 96 : 64,
        temperature: 0.1
      });
      return {
        suggestion: bn(h, e),
        status: "ready",
        error: null
      };
    } finally {
      n && typeof n.dispose == "function" && n.dispose();
    }
  } catch (t) {
    return {
      suggestion: "",
      status: l.status,
      error: t instanceof Error ? t.message : "Unable to generate ghost text."
    };
  }
}, kn = (e) => e.replace(/\r/g, "").replace(/\u0000/g, ""), Te = (e, t) => {
  const r = t === "code";
  return e === "concise" ? {
    maxTokens: r ? 480 : 260,
    outputLimit: r ? 6e3 : 2800,
    instruction: r ? "Keep the implementation compact, correct, and focused on the requested task." : "Keep the response concise, direct, and complete without unnecessary filler.",
    temperature: r ? 0.12 : 0.24
  } : e === "balanced" ? {
    maxTokens: r ? 800 : 540,
    outputLimit: r ? 9e3 : 4200,
    instruction: r ? "Provide a solid implementation with the necessary structure, handling, and clarity." : "Give a complete answer with useful detail, but stay focused on the request.",
    temperature: r ? 0.14 : 0.3
  } : {
    maxTokens: r ? 1200 : 900,
    outputLimit: r ? 12e3 : 7e3,
    instruction: r ? "Provide a robust, well-fleshed-out implementation with the important details handled." : "Be detailed, thoughtful, and complete. Include the useful specifics the user is implicitly asking for.",
    temperature: r ? 0.16 : 0.34
  };
}, vn = (e, t, r) => {
  if (e.length <= t)
    return e;
  const n = e.slice(0, t);
  return r ? n.trimEnd() : n.replace(/\s+\S*$/, "").trim();
}, or = (e, t) => {
  const r = Te(
    l.generationPreferences.answerLength,
    t.targetBlockType
  );
  let n = e.replace(/\r/g, "").replace(/\u0000/g, "").replace(/^```[A-Za-z0-9_-]*\n?/i, "").replace(/\n?```$/, "").replace(/^(sure|here(?:'s| is)|result:|output:)\s*/i, "");
  return n = t.targetBlockType === "code" ? n.trimEnd() : n.trim(), n = n.replace(/\n{3,}/g, `

`), vn(n, r.outputLimit, t.targetBlockType === "code");
}, Mn = (e) => {
  const t = Te(
    l.generationPreferences.answerLength,
    e.targetBlockType
  );
  return [
    "You are an inline AI agent inside a block-based note editor.",
    "Reply with only the content for the currently focused block.",
    "Do not add explanations about what you did, markdown fences, labels, or surrounding quotes.",
    e.targetBlockType === "code" ? "Output only valid code or code-adjacent content for the requested task." : "Output polished block content that directly satisfies the instruction.",
    "Follow the user instruction closely and satisfy every concrete detail they asked for.",
    e.targetBlockType === "code" ? "Prefer code that is correct, coherent, and ready to use instead of pseudo-code." : "If the user is asking for an explanation, answer clearly and specifically rather than giving vague filler.",
    e.actionMode === "append" ? "Keep the existing block content unchanged. Output only the new content that should be appended." : "Replace the existing block content. Output the full new block content only.",
    t.instruction,
    "Finish cleanly instead of trailing off mid-thought.",
    `User instruction:
${e.prompt}`,
    `Action mode: ${e.actionMode}`,
    `Current block type: ${e.currentBlockType}`,
    `Target block type: ${e.targetBlockType}`,
    `Current block content:
${e.currentBlockContent || "(empty)"}`
  ].join(`

`);
}, Dn = (e) => {
  const t = Te(
    l.generationPreferences.answerLength,
    e.targetBlockType
  );
  return [
    "You are a local visual AI agent inside a block-based note editor.",
    "An image from the currently focused block is attached.",
    "Reply with only the content for the new block that will be inserted directly below that image.",
    "Do not add markdown fences, labels, surrounding quotes, or meta commentary.",
    e.targetBlockType === "code" ? "If the user is asking for code, output only valid code or code-adjacent content." : "If the user is asking for an explanation, answer clearly, concretely, and accurately from the image.",
    "Base your answer on the visible evidence in the image and say when the image is insufficient instead of guessing.",
    t.instruction,
    "Finish cleanly instead of trailing off mid-thought.",
    `User instruction:
${e.prompt}`,
    `Target block type: ${e.targetBlockType}`
  ].join(`

`);
}, Nn = (e) => typeof e == "string" ? e : Array.isArray(e) ? e.map((t) => typeof t == "string" ? t : t && typeof t == "object" && "text" in t && typeof t.text == "string" ? t.text : "").filter(Boolean).join("") : "", _n = async (e, t, r) => {
  var i, a, c, h, m, p;
  if (!((i = t.imageUrl) != null && i.trim()))
    throw new Error("No image was found in the focused block.");
  const n = await fn();
  if (r.signal.aborted)
    throw new Error("Inline agent cancelled.");
  const o = await un(t.imageUrl, r.signal), s = Te(
    l.generationPreferences.answerLength,
    t.targetBlockType
  );
  try {
    const w = await on(`${n}/v1/chat/completions`, {
      method: "POST",
      signal: r.signal,
      body: {
        model: Ct,
        max_tokens: s.maxTokens,
        temperature: Math.max(0.1, s.temperature - 0.06),
        stream: !1,
        messages: [
          {
            role: "system",
            content: "You answer from the attached image for a block-based note editor. Return only the block content the app should insert."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: Dn(t)
              },
              {
                type: "image_url",
                image_url: {
                  url: o.url
                }
              }
            ]
          }
        ]
      }
    }), y = Nn((h = (c = (a = w.choices) == null ? void 0 : a[0]) == null ? void 0 : c.message) == null ? void 0 : h.content);
    if (!y.trim()) {
      const T = (p = (m = w.error) == null ? void 0 : m.message) == null ? void 0 : p.trim();
      throw new Error(T || "The local vision model returned empty content.");
    }
    e.sender.send("ai:inlineAgentEvent", {
      requestId: t.requestId,
      type: "complete",
      fullText: or(y, t)
    });
  } finally {
    await o.cleanup();
  }
}, On = async (e, t) => {
  var o;
  if (!t.prompt.trim()) {
    e.sender.send("ai:inlineAgentEvent", {
      requestId: t.requestId,
      type: "error",
      error: "Enter a prompt before running the AI agent."
    });
    return;
  }
  const n = new AbortController();
  Ge.set(t.requestId, n);
  try {
    if ((o = t.imageUrl) != null && o.trim()) {
      await _n(e, t, n);
      return;
    }
    const s = await mt(), i = await import("node-llama-cpp"), a = await s.createContext({ contextSize: 4096 });
    try {
      const c = new i.LlamaChatSession({
        contextSequence: a.getSequence()
      }), h = [], m = Te(
        l.generationPreferences.answerLength,
        t.targetBlockType
      );
      await c.prompt(Mn(t), {
        maxTokens: m.maxTokens,
        temperature: m.temperature,
        signal: n.signal,
        stopOnAbortSignal: !0,
        onTextChunk: (p) => {
          const w = kn(p);
          w && (h.push(w), e.sender.send("ai:inlineAgentEvent", {
            requestId: t.requestId,
            type: "chunk",
            chunk: w
          }));
        }
      }), e.sender.send("ai:inlineAgentEvent", {
        requestId: t.requestId,
        type: "complete",
        fullText: or(h.join(""), t)
      });
    } finally {
      a && typeof a.dispose == "function" && a.dispose();
    }
  } catch (s) {
    if (n.signal.aborted) {
      e.sender.send("ai:inlineAgentEvent", {
        requestId: t.requestId,
        type: "cancelled"
      });
      return;
    }
    e.sender.send("ai:inlineAgentEvent", {
      requestId: t.requestId,
      type: "error",
      error: an(s, "Unable to generate inline AI content.")
    });
  } finally {
    Ge.delete(t.requestId);
  }
};
function sr() {
  ct(), P = new Ze({
    icon: g.join(process.env.VITE_PUBLIC, "icon.png"),
    webPreferences: {
      preload: g.join(Mt, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      backgroundThrottling: !1
    },
    width: 1200,
    height: 800,
    show: !1,
    frame: Ae,
    titleBarStyle: Ae ? "hiddenInset" : "hidden",
    backgroundColor: "#FAFAFA"
  }), P.maximize(), P.once("ready-to-show", () => {
    P == null || P.show();
  }), P.webContents.on("did-finish-load", () => {
    z("load");
  }), He ? (P.webContents.openDevTools({ mode: "detach" }), P.loadURL(He)) : P.loadFile(g.join(Dt, "index.html"));
}
f.on("window-control", (e, t) => {
  const r = Ze.getFocusedWindow();
  if (r)
    switch (t) {
      case "minimize":
        r.minimize();
        break;
      case "maximize":
        r.isMaximized() ? r.unmaximize() : r.maximize();
        break;
      case "close":
        r.close();
        break;
    }
});
function Cn() {
  f.handle("ai:getStatus", () => (b({}), l)), f.handle("ai:downloadModel", async () => (Qt(), l)), f.handle("ai:downloadVisionModel", async () => (nr(), l)), f.handle("ai:downloadSpeechModel", async () => (yn(), l)), f.handle("ai:generateGhostText", async (e, t) => Bn(t)), f.handle("ai:runInlineAgent", async (e, t) => {
    await On(e, t);
  }), f.handle("ai:cancelInlineAgent", async (e, t) => {
    var r;
    (r = Ge.get(t)) == null || r.abort();
  }), f.handle("ai:updateTranscriptionPreferences", async (e, t) => jr(t)), f.handle("ai:updateGenerationPreferences", async (e, t) => Hr(t)), f.handle("ai:getSystemAudioSources", async () => (await ir.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: !1
  })).map((t) => ({
    id: t.id,
    label: t.name,
    kind: "system"
  }))), f.handle("ai:transcribeAudio", async (e, t) => In(t)), f.handle("ai:cancelAudioTranscription", async (e, t) => {
    await Rn(t);
  }), f.handle("plugins:getState", () => Le()), f.handle("plugins:listInstalled", () => {
    const e = Oe();
    return at().map((t) => ({
      filename: t.filename,
      id: t.id,
      disabled: e.has(t.id)
    }));
  }), f.handle("plugins:install", async (e, t) => {
    const r = typeof (t == null ? void 0 : t.downloadUrl) == "string" ? t.downloadUrl : typeof (t == null ? void 0 : t.url) == "string" ? t.url : null, n = typeof (t == null ? void 0 : t.filename) == "string" ? t.filename : typeof (t == null ? void 0 : t.name) == "string" ? t.name : null;
    if (!r || !n)
      throw new Error("The plugin download URL and filename are required.");
    const o = Rt(n), s = o.replace(/\.js$/i, "").toLowerCase(), i = g.join(Y(), o);
    return await Jt(r, i), Pe(s, !1), await z("install"), {
      filename: o,
      id: s,
      installed: !0
    };
  }), f.handle("plugins:remove", async (e, t) => {
    const r = typeof (t == null ? void 0 : t.filename) == "string" ? t.filename : typeof (t == null ? void 0 : t.name) == "string" ? t.name : null;
    if (!r)
      throw new Error("A plugin filename is required to remove a plugin.");
    const n = Rt(r), o = n.replace(/\.js$/i, "").toLowerCase(), s = g.join(Y(), n);
    if (!u.existsSync(s))
      throw new Error("That plugin file could not be found in the local plugins folder.");
    return await u.promises.unlink(s), Pe(o, !1), await z("remove"), {
      filename: n,
      id: o,
      removed: !0
    };
  }), f.handle("plugins:disable", async (e, t) => {
    if (typeof t != "string" || !t.trim())
      throw new Error("A valid plugin id is required to disable a plugin.");
    return Pe(t, !0), await z("disable"), {
      id: t.trim().toLowerCase(),
      disabled: !0
    };
  }), f.handle("plugins:enable", async (e, t) => {
    if (typeof t != "string" || !t.trim())
      throw new Error("A valid plugin id is required to enable a plugin.");
    return Pe(t, !1), await z("enable"), {
      id: t.trim().toLowerCase(),
      disabled: !1
    };
  }), f.handle("db:getTasks", () => {
    try {
      return d.prepare("SELECT * FROM tasks").all().map(Ar);
    } catch (e) {
      return console.error("getTasks error:", e), [];
    }
  }), f.handle("db:addTask", (e, t) => {
    try {
      const r = t.status === "done" ? pe(t.completedAt) ?? Date.now() : null, n = !!t.isDeleted, o = n ? pe(t.deletedAt) ?? Date.now() : null, s = Ye(t.scope);
      return d.prepare(`
        INSERT INTO tasks (id, title, status, priority, scope, assignee, tags, date, isDeleted, completedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        t.id,
        t.title,
        t.status,
        t.priority,
        s,
        t.assignee ?? null,
        Tt(t.tags),
        Xe(t.date),
        n ? 1 : 0,
        r,
        o
      ), !0;
    } catch (r) {
      return console.error("addTask error:", r), !1;
    }
  }), f.handle("db:updateTask", (e, { id: t, updates: r }) => {
    try {
      const n = d.prepare("SELECT completedAt FROM tasks WHERE id = ?").get(t);
      if (!n)
        return !1;
      const o = ["title", "status", "priority", "scope", "assignee", "tags", "date"], s = {
        ...r,
        ...Object.prototype.hasOwnProperty.call(r, "scope") ? { scope: Ye(r.scope) } : {},
        ...Object.prototype.hasOwnProperty.call(r, "tags") ? { tags: Tt(r.tags) } : {},
        ...Object.prototype.hasOwnProperty.call(r, "date") ? { date: Xe(r.date) } : {}
      };
      Object.prototype.hasOwnProperty.call(r, "status") && (s.completedAt = r.status === "done" ? pe(n.completedAt) ?? Date.now() : null);
      const i = Object.keys(s).filter((a) => [...o, "completedAt"].includes(a)).map((a) => `${a} = @${a}`).join(", ");
      return i ? (d.prepare(`
        UPDATE tasks
        SET ${i}
        WHERE id = @id
      `).run({ id: t, ...s }), !0) : !1;
    } catch (n) {
      return console.error("updateTask error:", n), !1;
    }
  }), f.handle("db:deleteTask", (e, t) => {
    try {
      return d.prepare(`
        UPDATE tasks
        SET isDeleted = 1, deletedAt = ?
        WHERE id = ?
      `).run(Date.now(), t), !0;
    } catch (r) {
      return console.error("deleteTask error:", r), !1;
    }
  }), f.handle("db:restoreTask", (e, t) => {
    try {
      return d.prepare(`
        UPDATE tasks
        SET isDeleted = 0, deletedAt = NULL
        WHERE id = ?
      `).run(t), !0;
    } catch (r) {
      return console.error("restoreTask error:", r), !1;
    }
  }), f.handle("db:deleteTaskPermanently", (e, t) => {
    try {
      return d.prepare("DELETE FROM tasks WHERE id = ?").run(t), !0;
    } catch (r) {
      return console.error("deleteTaskPermanently error:", r), !1;
    }
  }), f.handle("db:getPages", () => {
    try {
      return d.prepare("SELECT * FROM pages ORDER BY updatedAt DESC, createdAt DESC").all().map(
        Rr
      );
    } catch (e) {
      return console.error("getPages error:", e), [];
    }
  }), f.handle("db:addPage", (e, t) => {
    try {
      return d.prepare(`
        INSERT INTO pages (id, title, parentId, properties, isFavourite, isPinned, isArchived, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        t.id,
        t.title,
        t.parentId ?? null,
        je(t.properties ?? ke),
        0,
        0,
        0,
        Date.now(),
        Date.now()
      ), Pt(t.id, [], null), !0;
    } catch (r) {
      return console.error("addPage error:", r), !1;
    }
  }), f.handle("db:updatePage", (e, { id: t, updates: r }) => {
    try {
      const n = ["title", "parentId", "isFavourite", "isPinned", "isArchived", "properties"], o = {
        ...r,
        ...Object.prototype.hasOwnProperty.call(r, "isArchived") ? { isArchived: r.isArchived ? 1 : 0 } : {},
        ...Object.prototype.hasOwnProperty.call(r, "properties") ? { properties: je(r.properties) } : {}
      }, s = Object.keys(o).filter((i) => n.includes(i)).map((i) => `${i} = @${i}`).join(", ");
      return s ? (d.prepare(`
        UPDATE pages
        SET ${s}, updatedAt = @updatedAt
        WHERE id = @id
      `).run({
        id: t,
        ...o,
        updatedAt: Date.now()
      }), !0) : !1;
    } catch (n) {
      return console.error("updatePage error:", n), !1;
    }
  }), f.handle("db:deletePage", (e, t) => {
    try {
      const r = xe(t);
      return O(
        `
          UPDATE pages
          SET isArchived = 1,
              isFavourite = 0,
              isPinned = 0,
              updatedAt = ?
          WHERE id IN (__IDS__)
        `,
        r,
        [Date.now()]
      ), !0;
    } catch (r) {
      return console.error("deletePage error:", r), !1;
    }
  }), f.handle("db:restorePage", (e, t) => {
    try {
      const r = d.prepare("SELECT parentId FROM pages WHERE id = ?").get(t), n = r != null && r.parentId ? d.prepare("SELECT id, isArchived FROM pages WHERE id = ?").get(r.parentId) : void 0, o = n && !n.isArchived ? (r == null ? void 0 : r.parentId) ?? null : null;
      d.prepare(`
        UPDATE pages
        SET isArchived = 0,
            parentId = ?,
            updatedAt = ?
        WHERE id = ?
      `).run(o, Date.now(), t);
      const s = xe(t).filter((i) => i !== t);
      return O(
        `
          UPDATE pages
          SET isArchived = 0,
              updatedAt = ?
          WHERE id IN (__IDS__)
        `,
        s,
        [Date.now()]
      ), !0;
    } catch (r) {
      return console.error("restorePage error:", r), !1;
    }
  }), f.handle("db:deletePagePermanently", (e, t) => {
    try {
      const r = xe(t);
      return O("DELETE FROM blocks WHERE pageId IN (__IDS__)", r), O("DELETE FROM page_history WHERE pageId IN (__IDS__)", r), O("DELETE FROM page_history_state WHERE pageId IN (__IDS__)", r), O("DELETE FROM pages WHERE id IN (__IDS__)", r), !0;
    } catch (r) {
      return console.error("deletePagePermanently error:", r), !1;
    }
  }), f.handle("db:getBlocks", (e, t) => {
    try {
      const n = d.prepare("SELECT * FROM blocks WHERE pageId = ? ORDER BY position ASC").all(t).map((i) => ({
        ...i,
        checked: i.checked === 1,
        children: []
        // Initialize empty children array
      })), o = /* @__PURE__ */ new Map(), s = [];
      return n.forEach((i) => o.set(i.id, i)), n.forEach((i) => {
        i.parentId && o.has(i.parentId) ? o.get(i.parentId).children.push(i) : s.push(i);
      }), s;
    } catch (r) {
      return console.error("getBlocks error:", r), [];
    }
  }), f.handle("db:saveBlocks", (e, { pageId: t, blocks: r }) => {
    try {
      return tt(t, r), !0;
    } catch (n) {
      return console.error("saveBlocks error:", n), !1;
    }
  }), f.handle("db:ensurePageHistory", (e, { pageId: t, blocks: r, history: n }) => {
    try {
      return Pt(t, r, n == null ? void 0 : n.focusBlockId);
    } catch (o) {
      return console.error("ensurePageHistory error:", o), null;
    }
  }), f.handle("db:saveBlocksWithHistory", (e, { pageId: t, blocks: r, history: n }) => {
    try {
      return vr(t, r, n == null ? void 0 : n.focusBlockId);
    } catch (o) {
      return console.error("saveBlocksWithHistory error:", o), null;
    }
  }), f.handle("db:undoBlocks", (e, t) => {
    try {
      return St(t, "undo");
    } catch (r) {
      return console.error("undoBlocks error:", r), null;
    }
  }), f.handle("db:redoBlocks", (e, t) => {
    try {
      return St(t, "redo");
    } catch (r) {
      return console.error("redoBlocks error:", r), null;
    }
  });
}
A.whenReady().then(async () => {
  const e = A.getPath("userData"), t = g.join(e, "app.db");
  u.existsSync(e) || u.mkdirSync(e, { recursive: !0 }), d = new cr(t), d.pragma("foreign_keys = ON"), d.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'project',
      assignee TEXT,
      tags TEXT DEFAULT '[]',
      date TEXT,
      isDeleted INTEGER DEFAULT 0,
      completedAt INTEGER,
      deletedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      parentId TEXT,
      properties TEXT DEFAULT '{}',
      isFavourite INTEGER DEFAULT 0,
      isPinned INTEGER DEFAULT 0,
      isArchived INTEGER DEFAULT 0,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      pageId TEXT NOT NULL,
      parentId TEXT,
      type TEXT NOT NULL,
      content TEXT,
      position INTEGER,
      width REAL DEFAULT 100,
      checked INTEGER DEFAULT 0,
      refId TEXT,
      FOREIGN KEY(pageId) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageId TEXT NOT NULL,
      revision INTEGER NOT NULL,
      blocks TEXT NOT NULL,
      focusBlockId TEXT,
      createdAt INTEGER NOT NULL,
      UNIQUE(pageId, revision)
    );

    CREATE TABLE IF NOT EXISTS page_history_state (
      pageId TEXT PRIMARY KEY,
      currentRevision INTEGER NOT NULL
    );
  `), d.prepare("PRAGMA table_info(tasks)").all().some((E) => E.name === "scope") || d.exec("ALTER TABLE tasks ADD COLUMN scope TEXT NOT NULL DEFAULT 'project';"), d.prepare("UPDATE tasks SET scope = 'project' WHERE scope IS NULL OR TRIM(scope) = ''").run();
  const o = d.prepare("PRAGMA table_info(blocks)").all(), s = o.some((E) => E.name === "parentId"), i = o.some((E) => E.name === "width"), a = o.some((E) => E.name === "refId");
  s || d.exec("ALTER TABLE blocks ADD COLUMN parentId TEXT;"), i || d.exec("ALTER TABLE blocks ADD COLUMN width REAL DEFAULT 100;"), a || d.exec("ALTER TABLE blocks ADD COLUMN refId TEXT;"), (!s || !i || !a) && console.log("Successfully migrated database schema!");
  const c = d.prepare("PRAGMA table_info(pages)").all(), h = c.some((E) => E.name === "properties"), m = c.some((E) => E.name === "isArchived");
  h || d.exec("ALTER TABLE pages ADD COLUMN properties TEXT DEFAULT '{}';"), m || d.exec("ALTER TABLE pages ADD COLUMN isArchived INTEGER DEFAULT 0;"), d.prepare("UPDATE pages SET properties = ? WHERE properties IS NULL OR TRIM(properties) = ''").run(
    je(ke)
  ), d.prepare("UPDATE pages SET isArchived = 0 WHERE isArchived IS NULL").run();
  const p = d.prepare("PRAGMA table_info(tasks)").all(), w = p.some((E) => E.name === "tags"), y = p.some((E) => E.name === "date"), T = p.some((E) => E.name === "isDeleted"), I = p.some((E) => E.name === "completedAt"), Q = p.some((E) => E.name === "deletedAt");
  w || d.exec("ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]';"), y || d.exec("ALTER TABLE tasks ADD COLUMN date TEXT;"), T || d.exec("ALTER TABLE tasks ADD COLUMN isDeleted INTEGER DEFAULT 0;"), I || d.exec("ALTER TABLE tasks ADD COLUMN completedAt INTEGER;"), Q || d.exec("ALTER TABLE tasks ADD COLUMN deletedAt INTEGER;"), d.prepare("UPDATE tasks SET tags = '[]' WHERE tags IS NULL OR TRIM(tags) = ''").run(), d.prepare("UPDATE tasks SET isDeleted = 0 WHERE isDeleted IS NULL").run(), d.prepare("UPDATE tasks SET completedAt = NULL WHERE status <> 'done'").run(), d.prepare("UPDATE tasks SET deletedAt = NULL WHERE isDeleted = 0").run(), zr(), Cn(), ct(), sr(), ot() > 0 && ge() === 0 && Qt(), fe().downloadedBytes > 0 && !fe().isComplete && nr();
});
A.on("before-quit", () => {
  lt(), G = !0, v == null || v.kill(), rn();
});
A.on("window-all-closed", () => {
  lt(), process.platform !== "darwin" && (A.quit(), P = null);
});
A.on("activate", () => {
  Ze.getAllWindows().length === 0 && sr();
});
export {
  jn as MAIN_DIST,
  Dt as RENDERER_DIST,
  He as VITE_DEV_SERVER_URL
};
