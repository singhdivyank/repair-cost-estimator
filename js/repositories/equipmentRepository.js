import { db } from '../core/db.js';
import { makeId, nowIso } from '../core/utils.js';

const STORE = 'equipment';

// Equipment (OCR result)
// { id, repairId, manufacturer, model, serialNumber, manufactureDate,
//   confidence, extractedText, photoId, timestamp }

export const equipmentRepository = {
  async listByRepair(repairId) {
    return db.getAllByIndex(STORE, 'repairId', repairId);
  },

  async get(id) {
    return db.get(STORE, id);
  },

  async create(repairId, data) {
    const record = {
      id: makeId('equip'),
      repairId,
      manufacturer: data.manufacturer || null,
      model: data.model || null,
      serialNumber: data.serialNumber || null,
      manufactureDate: data.manufactureDate || null,
      confidence: data.confidence ?? null,
      extractedText: data.extractedText || '',
      photoId: data.photoId || null,
      timestamp: nowIso(),
    };
    await db.put(STORE, record);
    return record;
  },

  async remove(id) {
    await db.delete(STORE, id);
  },
};
