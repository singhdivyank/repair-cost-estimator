import { db } from '../core/db.js';
import { makeId, nowIso } from '../core/utils.js';

const STORE = 'photos';

// Photo
// { id, projectId, roomId, repairId, blob, thumbnailBlob, capturedAt }
// Blobs are stored directly in IndexedDB (supported natively, unlike
// localStorage) so photos survive offline with no external dependency.

export const photoRepository = {
  async listByProject(projectId) {
    return db.getAllByIndex(STORE, 'projectId', projectId);
  },

  async listByRoom(roomId) {
    return db.getAllByIndex(STORE, 'roomId', roomId);
  },

  async listByRepair(repairId) {
    return db.getAllByIndex(STORE, 'repairId', repairId);
  },

  async get(id) {
    return db.get(STORE, id);
  },

  async add({ projectId, roomId, repairId, blob, thumbnailBlob }) {
    const photo = {
      id: makeId('photo'),
      projectId,
      roomId: roomId || null,
      repairId: repairId || null,
      blob,
      thumbnailBlob,
      capturedAt: nowIso(),
    };
    await db.put(STORE, photo);
    return photo;
  },

  async remove(id) {
    await db.delete(STORE, id);
  },
};
