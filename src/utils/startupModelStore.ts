const DB_NAME = 'vertice_studio_startup_db';
const DB_VERSION = 1;
const STORE_NAME = 'models';
const KEY_NAME = 'startup_model';

export interface StoredStartupModel {
  name: string;
  mimeType: string;
  buffer: ArrayBuffer;
  autoRigOnImport: boolean;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir IndexedDB'));
  });
}

export async function saveStartupModelFile(
  file: File,
  autoRigOnImport: boolean
): Promise<void> {
  const buffer = await file.arrayBuffer();
  const db = await openDb();
  const record: StoredStartupModel = {
    name: file.name,
    mimeType: file.type || 'model/gltf-binary',
    buffer,
    autoRigOnImport,
    savedAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record, KEY_NAME);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Erro ao salvar modelo inicial'));
    };
  });
}

export async function loadStartupModelFile(): Promise<{
  file: File;
  autoRigOnImport: boolean;
} | null> {
  try {
    const db = await openDb();
    const record = await new Promise<StoredStartupModel | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_NAME);
      req.onsuccess = () => resolve(req.result as StoredStartupModel | undefined);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    if (!record || !record.buffer || !record.name) return null;
    const file = new File([record.buffer], record.name, {
      type: record.mimeType || 'model/gltf-binary',
      lastModified: record.savedAt || Date.now(),
    });
    return { file, autoRigOnImport: Boolean(record.autoRigOnImport) };
  } catch {
    return null;
  }
}

export async function clearStartupModelFile(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(KEY_NAME);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore cleanup failures cleanly
  }
}
