import { DEFAULT_PRICE_LIST } from '../data/priceList.js';
import { db } from '../core/db.js';
import { repairRepository } from '../repositories/repairRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { CATALOG_LESS_GROUPS } from '../data/roomTemplates.js';

let catalogIndex = null; // Map<id, item> — built lazily, refreshed when custom items change
let customItemsCache = null;

async function buildCatalogIndex() {
  const customItems = await db.getAll('customItems');
  customItemsCache = customItems;
  const map = new Map();
  DEFAULT_PRICE_LIST.forEach((item) => map.set(item.id, item));
  customItems.forEach((item) => map.set(item.id, item));
  catalogIndex = map;
  return map;
}

export const pricingService = {
  async getCatalogItem(itemId) {
    if (!catalogIndex) await buildCatalogIndex();
    return catalogIndex.get(itemId) || null;
  },

  async getItemsForGroup(groupName) {
    if (!catalogIndex) await buildCatalogIndex();
    return Array.from(catalogIndex.values()).filter((i) => i.group === groupName);
  },

  async invalidateCatalog() {
    catalogIndex = null;
  },

  async addCustomCatalogItem({ name, cost, unit, group, section }) {
    const { makeId } = await import('../core/utils.js');
    const item = { id: makeId('custom'), name, cost, unit, group, section, isCustom: true };
    await db.put('customItems', item);
    await this.invalidateCatalog();
    return item;
  },

  async removeCustomCatalogItem(itemId) {
    await db.delete('customItems', itemId);
    await this.invalidateCatalog();
  },

  async getGlobalOverride(itemId) {
    const record = await db.get('priceOverridesGlobal', itemId);
    return record ? record.cost : null;
  },

  async setGlobalOverride(itemId, cost) {
    await db.put('priceOverridesGlobal', { itemId, cost });
  },

  async getAllGlobalOverrides() {
    const all = await db.getAll('priceOverridesGlobal');
    const map = {};
    all.forEach((o) => (map[o.itemId] = o.cost));
    return map;
  },

  // Resolve the effective unit cost for a catalog item within a project,
  // respecting priority: project-level override > global override > catalog default.
  async resolveUnitCost(itemId, project) {
    const projectOverrides = project?.priceOverrides || {};
    if (Object.prototype.hasOwnProperty.call(projectOverrides, itemId)) {
      return projectOverrides[itemId];
    }
    const globalOverride = await this.getGlobalOverride(itemId);
    if (globalOverride !== null) return globalOverride;
    const catalogItem = await this.getCatalogItem(itemId);
    return catalogItem ? catalogItem.cost : 0;
  },

  async setProjectOverride(project, itemId, cost) {
    project.priceOverrides = { ...(project.priceOverrides || {}), [itemId]: cost };
    return project;
  },

  async lineTotal(repairItem, project) {
    if (repairItem.isCustom) {
      return (repairItem.customCost || 0) * (repairItem.quantity || 0);
    }
    const unitCost = await this.resolveUnitCost(repairItem.itemId, project);
    return unitCost * (repairItem.quantity || 0);
  },

  // Running total across the whole project: sum of checked, quantified repair items.
  async calcProjectTotal(project) {
    const items = await repairRepository.listByProject(project.id);
    let total = 0;
    for (const item of items) {
      if (!item.checked) continue;
      total += await this.lineTotal(item, project);
    }
    return total;
  },

  async calcRoomTotal(roomId, project) {
    const items = await repairRepository.listByRoom(roomId);
    let total = 0;
    for (const item of items) {
      if (!item.checked) continue;
      total += await this.lineTotal(item, project);
    }
    return total;
  },

  // Progress: a group is "complete" if it's marked No Action Needed, or if
  // at least one item within it is checked.
  async calcRoomProgress(room) {
    const items = await repairRepository.listByRoom(room.id);
    const groups = room.groups || [];
    if (groups.length === 0) return { completedGroups: 0, totalGroups: 0, pct: 0 };
    let completed = 0;
    for (const group of groups) {
      const noAction = room.noActionGroups?.[group];
      const hasChecked = items.some((i) => i.groupId === group && i.checked);
      if (noAction || hasChecked) completed += 1;
    }
    return { completedGroups: completed, totalGroups: groups.length, pct: Math.round((completed / groups.length) * 100) };
  },

  async calcProjectProgress(projectId) {
    const rooms = await roomRepository.listByProject(projectId);
    let totalGroups = 0;
    let completedGroups = 0;
    for (const room of rooms) {
      const p = await this.calcRoomProgress(room);
      totalGroups += p.totalGroups;
      completedGroups += p.completedGroups;
    }
    const pct = totalGroups > 0 ? Math.round((completedGroups / totalGroups) * 100) : 0;
    return { completedGroups, totalGroups, pct };
  },

  isCatalogLessGroup(groupName) {
    return CATALOG_LESS_GROUPS.has(groupName);
  },

  // Combines the catalog with whatever has actually been selected for a
  // given room+group, so the UI can render one row per possible item plus
  // any custom (non-catalog) items added on top.
  async getRoomGroupView(room, groupName, project) {
    const catalogItems = this.isCatalogLessGroup(groupName) ? [] : await this.getItemsForGroup(groupName);
    const repairItems = await repairRepository.listByRoom(room.id);
    const relevant = repairItems.filter((r) => r.groupId === groupName);

    const catalogRows = [];
    for (const ci of catalogItems) {
      const existing = relevant.find((r) => r.itemId === ci.id && !r.isCustom);
      const unitCost = await this.resolveUnitCost(ci.id, project);
      const isOverridden = Object.prototype.hasOwnProperty.call(project?.priceOverrides || {}, ci.id);
      catalogRows.push({ catalogItem: ci, unitCost, isOverridden, repairItem: existing || null });
    }
    const customRows = relevant.filter((r) => r.isCustom);
    const noActionNeeded = !!room.noActionGroups?.[groupName];
    return { catalogRows, customRows, noActionNeeded };
  },

  // Simple deal-analysis numbers for the Rooms dashboard header. Returns null
  // if the project doesn't have enough info entered to compute them.
  calcFinancials(project, totalRepairCost) {
    if (!project.purchasePrice || !project.arv) return null;
    const totalCost = project.purchasePrice + totalRepairCost;
    const profit = project.arv - totalCost;
    const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const targetProfit = project.targetMarginPct ? (project.arv * project.targetMarginPct) / 100 : null;
    return { profit, roi, totalCost, targetProfit };
  },
};
