// see earlier idb.js block in this message (same content)
const DB_NAME = 'bluebirdlearn_db';
const DB_VERSION = 1;
const STORE_MEDIA = 'media';

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev)=>{
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

export async function putMedia({blob, type='blob', name='media'}) {
  const db = await openDB();
  const id = 'm_' + Date.now() + '_' + Math.floor(Math.random()*1000);
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    const store = tx.objectStore(STORE_MEDIA);
    const rec = { id, blob, type, name, created: new Date().toISOString() };
    const r = store.put(rec);
    r.onsuccess = ()=> { resolve(id); db.close(); };
    r.onerror = ()=> { reject(r.error); db.close(); };
  });
}

export async function getMedia(id){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const store = tx.objectStore(STORE_MEDIA);
    const r = store.get(id);
    r.onsuccess = ()=> { resolve(r.result || null); db.close(); };
    r.onerror = ()=> { reject(r.error); db.close(); };
  });
}

export async function deleteMedia(id){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    const store = tx.objectStore(STORE_MEDIA);
    const r = store.delete(id);
    r.onsuccess = ()=> { resolve(true); db.close(); };
    r.onerror = ()=> { reject(r.error); db.close(); };
  });
}