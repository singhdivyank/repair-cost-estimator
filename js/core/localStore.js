// Lightweight localStorage manager. Only small, non-business-critical state
// lives here (per the design doc) — everything else belongs in IndexedDB via
// repositories.

const KEYS = {
  currentProjectId: 'spark.currentProjectId',
  recentProjects: 'spark.recentProjects',
  theme: 'spark.theme',
  settings: 'spark.settings',
  appVersion: 'spark.appVersion',
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`[localStore] failed to read ${key}`, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[localStore] failed to write ${key}`, err);
  }
}

export const localStore = {
  getCurrentProjectId() {
    return localStorage.getItem(KEYS.currentProjectId) || null;
  },
  setCurrentProjectId(id) {
    if (id) localStorage.setItem(KEYS.currentProjectId, id);
    else localStorage.removeItem(KEYS.currentProjectId);
  },

  getRecentProjects() {
    return readJSON(KEYS.recentProjects, []);
  },
  pushRecentProject(id) {
    const list = this.getRecentProjects().filter((x) => x !== id);
    list.unshift(id);
    writeJSON(KEYS.recentProjects, list.slice(0, 10));
  },

  getTheme() {
    return localStorage.getItem(KEYS.theme) || 'dark';
  },
  setTheme(theme) {
    localStorage.setItem(KEYS.theme, theme);
  },

  getSettings() {
    return readJSON(KEYS.settings, { hapticsEnabled: true, contingencyPct: 10 });
  },
  setSettings(settings) {
    writeJSON(KEYS.settings, settings);
  },

  getAppVersion() {
    return localStorage.getItem(KEYS.appVersion);
  },
  setAppVersion(v) {
    localStorage.setItem(KEYS.appVersion, v);
  },
};
