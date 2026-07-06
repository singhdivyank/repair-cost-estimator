import { db } from '../core/db.js';
import { makeId, nowIso } from '../core/utils.js';

const STORE = 'repairItems';

// RepairItem — created only when an agent actually interacts with a line
// item (checks it, sets a quantity, adds a note/photo). The full catalog of
// *possible* items per group lives in data/priceList.js; this store only
// holds what's actually been selected for a given room.
// {
//   id, roomId, projectId, groupId, itemId (catalog id or null if custom),
//   name, unit, checked, quantity, notes, equipmentId, photoIds[],
//   isCustom, createdAt, updatedAt
// }

export const repairRepository = {
  async listByRoom(roomId) {
    return db.getAllByIndex(STORE, 'roomId', roomId);
  },

  async listByProject(projectId) {
    return db.getAllByIndex(STORE, 'projectId', projectId);
  },

  async get(id) {
    return db.get(STORE, id);
  },

  async upsertForCatalogItem(roomId, projectId, groupId, catalogItem, patch = {}) {
    const existing = (await this.listByRoom(roomId)).find((r) => r.itemId === catalogItem.id && r.groupId === groupId);
    const timestamp = nowIso();
    if (existing) {
      Object.assign(existing, patch, { updatedAt: timestamp });
      await db.put(STORE, existing);
      return existing;
    }
    const item = {
      id: makeId('repair'),
      roomId,
      projectId,
      groupId,
      itemId: catalogItem.id,
      name: catalogItem.name,
      unit: catalogItem.unit,
      checked: false,
      quantity: 1,
      notes: '',
      equipmentId: null,
      photoIds: [],
      isCustom: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...patch,
    };
    await db.put(STORE, item);
    return item;
  },

  async createCustom(roomId, projectId, groupId, { name, unit, cost, quantity = 1 }) {
    const timestamp = nowIso();
    const item = {
      id: makeId('repair'),
      roomId,
      projectId,
      groupId,
      itemId: makeId('custom'),
      name,
      unit,
      checked: true,
      quantity,
      customCost: cost,
      notes: '',
      equipmentId: null,
      photoIds: [],
      isCustom: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.put(STORE, item);
    return item;
  },

  async update(id, patch) {
    const item = await db.get(STORE, id);
    if (!item) return null;
    Object.assign(item, patch, { updatedAt: nowIso() });
    await db.put(STORE, item);
    return item;
  },

  async remove(id) {
    await db.delete(STORE, id);
  },

  async duplicateInto(item, newRoomId, newProjectId) {
    const id = makeId('repair');
    const timestamp = nowIso();
    const copy = {
      ...item,
      id,
      roomId: newRoomId,
      projectId: newProjectId,
      photoIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.put(STORE, copy);
    return copy;
  },
};
