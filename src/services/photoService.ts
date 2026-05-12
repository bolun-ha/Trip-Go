/**
 * 照片存储服务
 * 使用 IndexedDB 存储用户为景点上传的照片
 */

const DB_NAME = 'trip_photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const MAX_PHOTOS_PER_PLACE = 9;
const IMAGE_QUALITY = 0.6;
const MAX_WIDTH = 1200;

export interface StoredPhoto {
  id: string;
  placeId: string;
  dataUrl: string; // 压缩后的 base64
  thumbnailUrl: string; // 缩略图 base64
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('placeId', 'placeId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 压缩图片到指定最大宽度和 JPEG 质量 */
function compressImage(file: File, maxWidth: number, quality: number): Promise<{ full: string; thumb: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        // 全尺寸压缩
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = h * (maxWidth / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const full = canvas.toDataURL('image/jpeg', quality);

        // 缩略图（200px 宽）
        const tw = 200;
        const th = h * (tw / w);
        canvas.width = tw;
        canvas.height = th;
        ctx.drawImage(img, 0, 0, tw, th);
        const thumbnail = canvas.toDataURL('image/jpeg', 0.6);

        resolve({ full, thumb: thumbnail });
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 为某个景点上传照片 */
export async function uploadPhoto(placeId: string, file: File): Promise<StoredPhoto> {
  // 先检查数量，不够才压缩，避免无谓等待
  const db = await openDB();
  const count = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.index('placeId').count(placeId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (count >= MAX_PHOTOS_PER_PLACE) {
    db.close();
    throw new Error(`最多只能上传 ${MAX_PHOTOS_PER_PLACE} 张照片，已达上限`);
  }

  const compressed = await compressImage(file, MAX_WIDTH, IMAGE_QUALITY);
  const photo: StoredPhoto = {
    id: `${placeId}_${Date.now()}`,
    placeId,
    dataUrl: compressed.full,
    thumbnailUrl: compressed.thumb,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add(photo);

    tx.oncomplete = () => {
      resolve(photo);
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
  });
}

/** 获取某个景点的所有照片 */
export async function getPhotos(placeId: string): Promise<StoredPhoto[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('placeId');
    const req = index.getAll(placeId);
    req.onsuccess = () => {
      resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}

/** 删除某张照片 */
export async function deletePhoto(photoId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(photoId);
    tx.oncomplete = () => {
      resolve();
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
  });
}

/** 获取所有有照片的 placeId 列表（用于快速判断哪些景点有照片） */
export async function getAllPlaceIdsWithPhotos(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const ids = new Set<string>();
      req.result.forEach((p: StoredPhoto) => ids.add(p.placeId));
      resolve(Array.from(ids));
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}
