import { db } from '../core/db.js';
import { makeId, nowIso } from '../core/utils.js';
import { WHOLE_HOUSE_ROOMS, ROOM_TYPES, SECTION_GROUPS } from '../data/roomTemplates.js';
import { repairRepository } from './repairRepository.js';
import { photoRepository } from './photoRepository.js';

const STORE = 'rooms';

// Room
// { id, projectId, type, name, order, createdAt, updatedAt,
//   groups: string[]                — resolved group names for this instance
//   noActionGroups: { [group]: bool } — explicit "No Action Needed" toggles
// }

function resolveGroupsForType(type) {
  const wholeHouse = WHOLE_HOUSE_ROOMS.find((w) => w.type === type);
  if (wholeHouse) return SECTION_GROUPS[wholeHouse.section];
  const template = ROOM_TYPES[type];
  if (template) return template.groups;
  return [];
}

export const roomRepository = {
  async listByProject(projectId) {
    const rooms = await db.getAllByIndex(STORE, 'projectId', projectId);
    return rooms.sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  async get(id) {
    return db.get(STORE, id);
  },

  async create(projectId, { type, name, groups = undefined }) {
    const existing = await this.listByProject(projectId);
    const id = makeId('room');
    const timestamp = nowIso();
    const resolvedGroups = groups === null ? [] : groups || resolveGroupsForType(type);
    const room = {
      id,
      projectId,
      type,
      name,
      order: existing.length,
      createdAt: timestamp,
      updatedAt: timestamp,
      groups: resolvedGroups,
      noActionGroups: {},
    };
    await db.put(STORE, room);
    return room;
  },

  async rename(id, name) {
    const room = await db.get(STORE, id);
    if (!room) return null;
    room.name = name;
    room.updatedAt = nowIso();
    await db.put(STORE, room);
    return room;
  },

  async setNoActionNeeded(id, groupName, value) {
    const room = await db.get(STORE, id);
    if (!room) return null;
    room.noActionGroups = { ...room.noActionGroups, [groupName]: value };
    room.updatedAt = nowIso();
    await db.put(STORE, room);
    return room;
  },

  async reorder(projectId, orderedIds) {
    const rooms = await this.listByProject(projectId);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const updates = orderedIds.map((id, idx) => {
      const room = byId.get(id);
      room.order = idx;
      return room;
    });
    await db.putMany(STORE, updates);
    return updates;
  },

  async remove(id) {
    const items = await repairRepository.listByRoom(id);
    for (const item of items) {
      await repairRepository.remove(item.id);
    }
    const photos = await photoRepository.listByRoom(id);
    for (const photo of photos) {
      await photoRepository.remove(photo.id);
    }
    await db.delete(STORE, id);
  },

  // Is this room type an addable/removable field instance, or a permanent
  // whole-house singleton created at project setup?
  isSingleton(type) {
    return WHOLE_HOUSE_ROOMS.some((w) => w.type === type);
  },

  async duplicateInto(room, newProjectId) {
    const id = makeId('room');
    const timestamp = nowIso();
    const copy = {
      ...room,
      id,
      projectId: newProjectId,
      createdAt: timestamp,
      updatedAt: timestamp,
      noActionGroups: { ...room.noActionGroups },
    };
    await db.put(STORE, copy);
    const items = await repairRepository.listByRoom(room.id);
    for (const item of items) {
      await repairRepository.duplicateInto(item, id, newProjectId);
    }
    return copy;
  },
};
