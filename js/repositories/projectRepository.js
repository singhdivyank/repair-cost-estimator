import { db } from '../core/db.js';
import { makeId, nowIso } from '../core/utils.js';
import { WHOLE_HOUSE_ROOMS } from '../data/roomTemplates.js';
import { roomRepository } from './roomRepository.js';

const STORE = 'projects';

// Project
// {
//   id, address, propertyType, bedrooms, bathrooms, garage, squareFootage,
//   purchasePrice, arv, targetMarginPct,
//   createdAt, updatedAt, status ('active'|'complete'|'archived'),
//   currentEstimate, progress, projectVersion, roomIds[], aiReportId
// }

export const projectRepository = {
  async list() {
    const all = await db.getAll(STORE);
    return all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  async get(id) {
    return db.get(STORE, id);
  },

  async create({ address, propertyType = 'single_family', bedrooms = 3, bathrooms = 2, garage = false, squareFootage = null, purchasePrice = null, arv = null, targetMarginPct = 20 }) {
    const id = makeId('proj');
    const timestamp = nowIso();
    const project = {
      id,
      address: address || 'Untitled Property',
      propertyType,
      bedrooms,
      bathrooms,
      garage,
      squareFootage,
      purchasePrice,
      arv,
      targetMarginPct,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'active',
      currentEstimate: 0,
      progress: 0,
      projectVersion: 1,
      roomIds: [],
      aiReportId: null,
    };
    await db.put(STORE, project);

    // Seed the three whole-house rooms plus one instance each of Kitchen and
    // `bathrooms` Bathroom instances, matching the New Project Wizard's
    // "auto-generate inspection structure" behavior.
    const seededRoomIds = [];
    for (const wh of WHOLE_HOUSE_ROOMS) {
      const room = await roomRepository.create(id, { type: wh.type, name: wh.name });
      seededRoomIds.push(room.id);
    }
    const kitchenRoom = await roomRepository.create(id, { type: 'kitchen', name: 'Kitchen' });
    seededRoomIds.push(kitchenRoom.id);
    for (let i = 1; i <= Math.max(1, bathrooms); i++) {
      const bathRoom = await roomRepository.create(id, { type: 'bathroom', name: `Bathroom ${i}` });
      seededRoomIds.push(bathRoom.id);
    }
    for (let i = 1; i <= Math.max(0, bedrooms); i++) {
      const bedRoom = await roomRepository.create(id, { type: 'bedroom', name: `Bedroom ${i}` });
      seededRoomIds.push(bedRoom.id);
    }

    project.roomIds = seededRoomIds;
    await db.put(STORE, project);
    return project;
  },

  async rename(id, address) {
    const project = await db.get(STORE, id);
    if (!project) return null;
    project.address = address;
    project.updatedAt = nowIso();
    await db.put(STORE, project);
    return project;
  },

  async duplicate(id) {
    const original = await db.get(STORE, id);
    if (!original) return null;
    const rooms = await roomRepository.listByProject(id);
    const newId = makeId('proj');
    const timestamp = nowIso();
    const copy = {
      ...original,
      id: newId,
      address: `${original.address} (Copy)`,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'active',
      projectVersion: 1,
      aiReportId: null,
      roomIds: [],
    };
    await db.put(STORE, copy);
    const newRoomIds = [];
    for (const room of rooms) {
      const newRoom = await roomRepository.duplicateInto(room, newId);
      newRoomIds.push(newRoom.id);
    }
    copy.roomIds = newRoomIds;
    await db.put(STORE, copy);
    return copy;
  },

  async archive(id) {
    const project = await db.get(STORE, id);
    if (!project) return null;
    project.status = 'archived';
    project.updatedAt = nowIso();
    await db.put(STORE, project);
    return project;
  },

  async remove(id) {
    const rooms = await roomRepository.listByProject(id);
    for (const room of rooms) {
      await roomRepository.remove(room.id);
    }
    await db.delete(STORE, id);
  },

  async touch(id, patch = {}) {
    const project = await db.get(STORE, id);
    if (!project) return null;
    Object.assign(project, patch, {
      updatedAt: nowIso(),
      projectVersion: (project.projectVersion || 1) + 1,
    });
    await db.put(STORE, project);
    return project;
  },

  async setStatus(id, status) {
    return this.touch(id, { status });
  },

  // Per-project price override: edits the effective unit cost for this
  // catalog item across the whole project (every room that uses it).
  async setPriceOverride(id, itemId, cost) {
    const project = await db.get(STORE, id);
    if (!project) return null;
    const priceOverrides = { ...(project.priceOverrides || {}) };
    if (cost === null) delete priceOverrides[itemId];
    else priceOverrides[itemId] = cost;
    project.priceOverrides = priceOverrides;
    project.updatedAt = nowIso();
    project.projectVersion = (project.projectVersion || 1) + 1;
    await db.put(STORE, project);
    return project;
  },

  // Exporting doesn't change project content, so this intentionally does
  // NOT bump projectVersion or updatedAt (which would otherwise mark a
  // cached AI report STALE just because someone downloaded a report).
  async recordExport(id) {
    const project = await db.get(STORE, id);
    if (!project) return null;
    project.lastExportedAt = nowIso();
    await db.put(STORE, project);
    return project;
  },
};