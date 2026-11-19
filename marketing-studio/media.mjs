const mediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']);
let opening;

function database() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('flow-marketing-media', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          opening = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      opening = undefined;
      throw error;
    });
  }
  return opening;
}

async function mediaTransaction(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', mode);
    const request = operation(transaction.objectStore('drafts'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function readMedia(id) {
  return (await mediaTransaction('readonly', (store) => store.get(id))) ?? [];
}

export function updateMedia(id, files) {
  if (files.some((file) => !mediaTypes.has(file.type))) {
    throw new Error('Choose JPG, PNG, WebP, GIF, MP4, WebM or MOV files.');
  }
  if (files.length > 10 || files.reduce((total, file) => total + file.size, 0) > 30_000_000) {
    throw new Error('Attach up to 10 files and 30 MB total per draft.');
  }
  return mediaTransaction('readwrite', (store) => files.length ? store.put(files, id) : store.delete(id));
}
