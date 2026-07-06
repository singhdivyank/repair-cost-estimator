// StorageService: thin, promise-based IndexedDB wrapper.
// IndexedDB is the single source of truth for all business data (per the
// design doc). Repositories build on top of this — no other module should
// touch indexedDB directly.

const DB_NAME = 'spark-estimator';
const DB_VERSION = 2; // v2: added missing `roomId` index on the photos store

const STORES = {
  projects: { keyPath: 'id', indexes: [['updatedAt', 'updatedAt'], ['status', 'status']] },
  rooms: { keyPath: 'id', indexes: [['projectId', 'projectId']] },
  repairItems: { keyPath: 'id', indexes: [['roomId', 'roomId'], ['projectId', 'projectId']] },
  photos: { keyPath: 'id', indexes: [['projectId', 'projectId'], ['roomId', 'roomId'], ['repairId', 'repairId']] },
  equipment: { keyPath: 'id', indexes: [['repairId', 'repairId']] },
  aiReports: { keyPath: 'id', indexes: [['projectId', 'projectId']] },
  priceOverridesGlobal: { keyPath: 'itemId' },
  customItems: { keyPath: 'id', indexes: [['projectId', 'projectId']] },
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const upgradeTx = event.target.transaction;
      Object.entries(STORES).forEach(([name, config]) => {
        let store;
        if (!db.objectStoreNames.contains(name)) {
          store = db.createObjectStore(name, { keyPath: config.keyPath });
        } else {
          store = upgradeTx.objectStore(name);
        }
        (config.indexes || []).forEach(([indexName, keyPath]) => {
          if (!store.indexNames.contains(indexName)) {
            store.createIndex(indexName, keyPath, { unique: false });
          }
        });
      });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('[db] upgrade blocked by another open tab');
  });
  return dbPromise;
}

function tx(storeName, mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        try {
          result = work(store);
        } catch (err) {
          reject(err);
          return;
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('transaction aborted'));
      })
  );
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async put(storeName, value) {
    return tx(storeName, 'readwrite', (store) => store.put(value));
  },

  async putMany(storeName, values) {
    return tx(storeName, 'readwrite', (store) => {
      values.forEach((v) => store.put(v));
    });
  },

  async get(storeName, key) {
    const db_ = await openDb();
    const t = db_.transaction(storeName, 'readonly');
    return reqToPromise(t.objectStore(storeName).get(key));
  },

  async getAll(storeName) {
    const db_ = await openDb();
    const t = db_.transaction(storeName, 'readonly');
    return reqToPromise(t.objectStore(storeName).getAll());
  },

  async getAllByIndex(storeName, indexName, value) {
    const db_ = await openDb();
    const t = db_.transaction(storeName, 'readonly');
    const index = t.objectStore(storeName).index(indexName);
    return reqToPromise(index.getAll(value));
  },

  async delete(storeName, key) {
    return tx(storeName, 'readwrite', (store) => store.delete(key));
  },

  async deleteMany(storeName, keys) {
    return tx(storeName, 'readwrite', (store) => {
      keys.forEach((k) => store.delete(k));
    });
  },

  async clear(storeName) {
    return tx(storeName, 'readwrite', (store) => store.clear());
  },

  async ready() {
    await openDb();
    return true;
  },
};
