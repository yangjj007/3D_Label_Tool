import { local } from "@/utils/storage.js";

const DB_NAME = "threejsModelFilesDB";
const STORE_NAME = "files";
const DB_VERSION = 1;
const FALLBACK_STORAGE_KEY = "threejs:filePersistence";
export const STORAGE_FOLDER = "uploaded-models";

let dbPromise;

const isBrowser = typeof window !== "undefined";
const isIndexedDBSupported = isBrowser && "indexedDB" in window;

const openDatabase = () => {
  if (!isIndexedDBSupported) {
    return Promise.reject(new Error("IndexedDB 不可用"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
};

const sanitizeRecord = (metadata, fileBlob) => {
  const record = {
    id: metadata.id,
    name: metadata.name,
    size: metadata.size ?? (fileBlob?.size ?? 0),
    type: metadata.type ?? (fileBlob?.type ?? ""),
    folder: metadata.folder || STORAGE_FOLDER,
    labels: metadata.labels || [],
    hasLabels: metadata.hasLabels || false,
    updatedAt: metadata.updatedAt || new Date().toISOString(),
    fileBlob: fileBlob || metadata.fileBlob || null
  };
  return record;
};

const stripBlob = record => {
  const { fileBlob, ...rest } = record;
  return rest;
};

const loadFallbackFiles = () => {
  if (!isBrowser) return [];
  const stored = local.get(FALLBACK_STORAGE_KEY);
  if (!Array.isArray(stored)) return [];
  return stored;
};

const persistFallbackFiles = files => {
  if (!isBrowser) return;
  local.set(FALLBACK_STORAGE_KEY, files);
};

const persistFallbackRecord = record => {
  const list = loadFallbackFiles();
  const filtered = list.filter(file => file.id !== record.id);
  persistFallbackFiles([record, ...filtered]);
};

const removeFallbackRecord = fileId => {
  const list = loadFallbackFiles();
  const filtered = list.filter(file => file.id !== fileId);
  persistFallbackFiles(filtered);
};

const removeFallbackFolderRecords = folder => {
  const list = loadFallbackFiles();
  persistFallbackFiles(list.filter(file => file.folder !== folder));
};

export const saveModelFile = async (metadata, rawFile) => {
  if (!metadata?.id) {
    throw new Error("保存模型文件需要提供 id");
  }
  const record = sanitizeRecord(metadata, rawFile);
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const withoutBlob = stripBlob(record);
    persistFallbackRecord(withoutBlob);
    return withoutBlob;
  } catch (error) {
    console.warn("无法写入 IndexedDB，使用本地缓存保存数据", error);
    const withoutBlob = stripBlob(record);
    persistFallbackRecord(withoutBlob);
    return withoutBlob;
  }
};

export const listFolderFiles = async (folder = STORAGE_FOLDER) => {
  const fallback = loadFallbackFiles().filter(file => file.folder === folder);
  if (!isIndexedDBSupported) {
    return fallback;
  }
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const files = request.result
          .filter(file => file.folder === folder)
          .map(stripBlob);
        resolve(files);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("读取 IndexedDB 数据失败，回退至本地缓存", error);
    return fallback;
  }
};

export const deleteModelFile = async fileId => {
  removeFallbackRecord(fileId);
  if (!isIndexedDBSupported) {
    return;
  }
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(fileId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("删除 IndexedDB 数据失败", error);
  }
};

export const getModelFile = async fileId => {
  const fallback = loadFallbackFiles().find(file => file.id === fileId);
  if (!isIndexedDBSupported) {
    return fallback || null;
  }
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(fileId);
      request.onsuccess = () => resolve(request.result || fallback || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("读取 IndexedDB 模型文件失败", error);
    return fallback || null;
  }
};

export const clearModelFiles = async (folder = STORAGE_FOLDER) => {
  removeFallbackFolderRecords(folder);
  if (!isIndexedDBSupported) {
    return;
  }
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = event => {
        const cursor = event.target.result;
        if (!cursor) {
          return;
        }
        if (cursor.value.folder === folder) {
          cursor.delete();
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("清空 IndexedDB 模型文件失败", error);
  }
};

