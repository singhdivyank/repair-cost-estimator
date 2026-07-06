import { projectRepository } from '../repositories/projectRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { repairRepository } from '../repositories/repairRepository.js';
import { photoRepository } from '../repositories/photoRepository.js';
import { equipmentRepository } from '../repositories/equipmentRepository.js';
import { pricingService } from '../services/pricingService.js';
import { photoService } from '../services/photoService.js';
import { ocrService } from '../services/ocrService.js';
import { icons } from '../core/icons.js';
import { formatCurrency } from '../core/utils.js';
import { EQUIPMENT_SCAN_GROUPS } from '../data/roomTemplates.js';

const expandedGroups = new Set(); // persists while the app session is open
let liveObjectUrls = new Set(); // revoked and rebuilt on every render to avoid leaking blob URLs

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function trackUrl(blob) {
  const url = URL.createObjectURL(blob);
  liveObjectUrls.add(url);
  return url;
}

function photoStripTemplate(photos, repairId) {
  return `
    <div class="photo-strip">
      ${photos.map((p) => `
        <div class="photo-thumb" data-photo-id="${p.id}">
          <img src="${trackUrl(p.thumbnailBlob)}" alt="Repair photo" />
          <button class="photo-remove" data-action="remove-photo" data-photo-id="${p.id}" aria-label="Remove photo">${icons.close}</button>
        </div>
      `).join('')}
      <label class="photo-add-btn" aria-label="Add photo">
        ${icons.camera}
        <input type="file" accept="image/*" capture="environment" data-action="add-photo" data-repair-id="${repairId}" hidden />
      </label>
    </div>
  `;
}

function equipmentSectionTemplate(row) {
  const { equipment, repairItem } = row;
  if (!repairItem) return '';
  if (equipment) {
    const age = ocrService.estimateAge(equipment.manufactureDate);
    return `
      <div class="equipment-chip">
        ${icons.check}
        <span>${escapeHtml(equipment.manufacturer || 'Unknown make')}${equipment.model ? ' · ' + escapeHtml(equipment.model) : ''}${equipment.serialNumber ? ' · SN ' + escapeHtml(equipment.serialNumber) : ''}${age !== null ? ' · ~' + age + 'y old' : ''}</span>
        <button class="link-btn" data-action="rescan-equipment" data-repair-id="${repairItem.id}">Rescan</button>
      </div>
    `;
  }
  return `
    <label class="scan-equipment-btn">
      ${icons.scan} Scan Equipment Label
      <input type="file" accept="image/*" capture="environment" data-action="scan-equipment" data-repair-id="${repairItem.id}" hidden />
    </label>
  `;
}

function catalogRowTemplate(row, groupName) {
  const { catalogItem, unitCost, isOverridden, repairItem, photos = [] } = row;
  const checked = !!repairItem?.checked;
  const quantity = repairItem?.quantity ?? 1;
  const lineTotal = checked ? unitCost * quantity : 0;
  const scannable = EQUIPMENT_SCAN_GROUPS.has(groupName);
  return `
    <div class="repair-item-block">
      <div class="repair-row" data-catalog-id="${catalogItem.id}" data-repair-id="${repairItem?.id || ''}">
        <label class="repair-checkbox">
          <input type="checkbox" data-action="toggle-check" data-catalog-id="${catalogItem.id}" ${checked ? 'checked' : ''} />
        </label>
        <div class="repair-row-main">
          <div class="repair-row-name">${escapeHtml(catalogItem.name)}</div>
          <div class="repair-row-sub">
            <span class="num" data-role="unit-cost" data-action="edit-price" data-item-id="${catalogItem.id}">${formatCurrency(unitCost)} / ${escapeHtml(catalogItem.unit)}</span>
            ${isOverridden ? '<span class="override-tag">edited</span>' : ''}
          </div>
        </div>
        ${checked ? `
          <div class="stepper stepper-sm">
            <button type="button" data-action="qty-dec" data-catalog-id="${catalogItem.id}">${icons.minus}</button>
            <input type="number" min="0" step="1" value="${quantity}" data-action="qty-input" data-catalog-id="${catalogItem.id}" class="num" />
            <button type="button" data-action="qty-inc" data-catalog-id="${catalogItem.id}">${icons.plus}</button>
          </div>
          <div class="repair-row-total num" data-role="line-total">${formatCurrency(lineTotal)}</div>
          <button class="row-trash-btn" data-action="delete-repair" data-repair-id="${repairItem?.id}" aria-label="Remove selection">${icons.trash}</button>
        ` : `<div class="repair-row-total num" style="color:var(--text-tertiary)">&mdash;</div><div style="width:32px;"></div>`}
      </div>
      ${checked && repairItem ? `
        <div class="repair-item-extras">
          ${photoStripTemplate(photos, repairItem.id)}
          ${scannable ? equipmentSectionTemplate(row) : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function customRowTemplate(item) {
  const lineTotal = (item.customCost || 0) * (item.quantity || 0);
  return `
    <div class="repair-item-block">
      <div class="repair-row" data-repair-id="${item.id}">
        <div style="width:22px;"></div>
        <div class="repair-row-main">
          <div class="repair-row-name">${escapeHtml(item.name)} <span class="override-tag">custom</span></div>
          <div class="repair-row-sub"><span class="num">${formatCurrency(item.customCost)} / ${escapeHtml(item.unit)}</span></div>
        </div>
        <div class="stepper stepper-sm">
          <button type="button" data-action="custom-qty-dec" data-repair-id="${item.id}">${icons.minus}</button>
          <input type="number" min="0" step="1" value="${item.quantity}" data-action="custom-qty-input" data-repair-id="${item.id}" class="num" />
          <button type="button" data-action="custom-qty-inc" data-repair-id="${item.id}">${icons.plus}</button>
        </div>
        <div class="repair-row-total num">${formatCurrency(lineTotal)}</div>
        <button class="row-trash-btn" data-action="delete-repair" data-repair-id="${item.id}" aria-label="Remove item">${icons.trash}</button>
      </div>
      <div class="repair-item-extras">
        ${photoStripTemplate(item.photos || [], item.id)}
      </div>
    </div>
  `;
}

async function groupSubtotal(view) {
  let total = 0;
  for (const row of view.catalogRows) {
    if (row.repairItem?.checked) total += row.unitCost * (row.repairItem.quantity || 0);
  }
  for (const item of view.customRows) {
    total += (item.customCost || 0) * (item.quantity || 0);
  }
  return total;
}

function showOverlay(message) {
  const el = document.createElement('div');
  el.className = 'scan-overlay';
  el.id = 'scan-overlay';
  el.innerHTML = `<div class="scan-overlay-card"><span class="spin">${icons.spinner}</span><span id="scan-overlay-msg">${escapeHtml(message)}</span></div>`;
  document.body.appendChild(el);
  return {
    update(msg) { const m = el.querySelector('#scan-overlay-msg'); if (m) m.textContent = msg; },
    close() { el.remove(); },
  };
}

function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

const OCR_STATUS_MESSAGES = {
  enhancing: 'Enhancing photo…',
  'loading-engine': 'Loading OCR engine (first scan only)…',
  reading: 'Reading label…',
};

export async function renderRoomDetailScreen(root, { projectId, roomId, onBack }) {
  const project = await projectRepository.get(projectId);
  const room = await roomRepository.get(roomId);
  if (!project || !room) {
    root.innerHTML = `<div class="empty-state"><h3>Room not found</h3></div>`;
    return;
  }

  const rerender = () => renderRoomDetailScreen(root, { projectId, roomId, onBack });

  photoService.revokeAll(liveObjectUrls);

  const roomTotal = await pricingService.calcRoomTotal(roomId, project);
  const roomProgress = await pricingService.calcRoomProgress(room);
  const groups = room.groups || [];

  const groupSections = [];
  for (const groupName of groups) {
    const view = await pricingService.getRoomGroupView(room, groupName, project);
    for (const row of view.catalogRows) {
      if (row.repairItem) {
        row.photos = await photoRepository.listByRepair(row.repairItem.id);
        row.equipment = (await equipmentRepository.listByRepair(row.repairItem.id))[0] || null;
      } else {
        row.photos = [];
        row.equipment = null;
      }
    }
    for (const item of view.customRows) {
      item.photos = await photoRepository.listByRepair(item.id);
    }
    const subtotal = await groupSubtotal(view);
    const complete = view.noActionNeeded || view.catalogRows.some((r) => r.repairItem?.checked) || view.customRows.length > 0;
    const isExpanded = expandedGroups.has(`${roomId}:${groupName}`);
    groupSections.push({ groupName, view, subtotal, complete, isExpanded });
  }

  root.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
      <button class="btn btn-icon" data-action="back" aria-label="Back to rooms">${icons.arrowLeft}</button>
      <div style="flex:1; min-width:0;">
        <div style="font-size:18px; font-weight:700;" data-action="rename-room">${escapeHtml(room.name)}</div>
        <div class="project-meta">${roomProgress.completedGroups}/${roomProgress.totalGroups} groups reviewed</div>
      </div>
      <div class="project-estimate num" style="font-size:18px;">${formatCurrency(roomTotal)}</div>
    </div>

    <div class="group-list">
      ${groupSections.map((g) => `
        <div class="group-card">
          <button class="group-header" data-action="toggle-group" data-group="${escapeHtml(g.groupName)}">
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="group-status-dot ${g.complete ? 'complete' : ''}"></span>
              <span class="group-name">${escapeHtml(g.groupName)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="num" style="color:var(--text-secondary); font-size:13px;">${formatCurrency(g.subtotal)}</span>
              <span style="transform: rotate(${g.isExpanded ? '180deg' : '0deg'}); display:flex;">${icons.chevronDown}</span>
            </div>
          </button>
          ${g.isExpanded ? `
            <div class="group-body">
              <label class="no-action-row">
                <input type="checkbox" data-action="toggle-no-action" data-group="${escapeHtml(g.groupName)}" ${g.view.noActionNeeded ? 'checked' : ''} />
                <span>${icons.ban} No Action Needed</span>
              </label>
              ${g.view.catalogRows.map((row) => catalogRowTemplate(row, g.groupName)).join('')}
              ${g.view.customRows.map((item) => customRowTemplate(item)).join('')}
              <button class="btn btn-ghost" data-action="add-custom" data-group="${escapeHtml(g.groupName)}" style="margin-top:6px;">${icons.plus} Add custom item</button>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;

  root.querySelector('[data-action="back"]').addEventListener('click', onBack);

  root.querySelector('[data-action="rename-room"]').addEventListener('click', async () => {
    const name = prompt('Room name', room.name);
    if (name && name.trim()) {
      await roomRepository.rename(roomId, name.trim());
      rerender();
    }
  });

  root.querySelectorAll('[data-action="toggle-group"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = `${roomId}:${btn.dataset.group}`;
      if (expandedGroups.has(key)) expandedGroups.delete(key);
      else expandedGroups.add(key);
      rerender();
    });
  });

  root.querySelectorAll('[data-action="toggle-no-action"]').forEach((cb) => {
    cb.addEventListener('click', async (e) => {
      e.stopPropagation();
      await roomRepository.setNoActionNeeded(roomId, cb.dataset.group, cb.checked);
      await projectRepository.touch(projectId, {});
      rerender();
    });
  });

  root.querySelectorAll('[data-action="toggle-check"]').forEach((cb) => {
    cb.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catalogId = cb.dataset.catalogId;
      const groupName = cb.closest('.group-card').querySelector('[data-action="toggle-group"]').dataset.group;
      const catalogItem = await pricingService.getCatalogItem(catalogId);
      const existing = (await repairRepository.listByRoom(roomId)).find((r) => r.itemId === catalogId && !r.isCustom && r.groupId === groupName);
      if (existing) {
        await repairRepository.update(existing.id, { checked: !existing.checked });
      } else {
        await repairRepository.upsertForCatalogItem(roomId, projectId, groupName, catalogItem, { checked: true, quantity: 1 });
        const room2 = await roomRepository.get(roomId);
        if (room2.noActionGroups?.[groupName]) {
          await roomRepository.setNoActionNeeded(roomId, groupName, false);
        }
      }
      await projectRepository.touch(projectId, {});
      rerender();
    });
  });

  async function adjustQty(catalogId, groupName, delta, explicitValue) {
    const catalogItem = await pricingService.getCatalogItem(catalogId);
    const existing = (await repairRepository.listByRoom(roomId)).find((r) => r.itemId === catalogId && !r.isCustom && r.groupId === groupName);
    let newQty;
    if (explicitValue !== undefined) newQty = Math.max(0, explicitValue);
    else newQty = Math.max(0, (existing?.quantity ?? 1) + delta);
    if (existing) {
      await repairRepository.update(existing.id, { quantity: newQty, checked: newQty > 0 ? true : existing.checked });
    } else if (newQty > 0) {
      await repairRepository.upsertForCatalogItem(roomId, projectId, groupName, catalogItem, { checked: true, quantity: newQty });
    }
    await projectRepository.touch(projectId, {});
    rerender();
  }
  root.querySelectorAll('[data-action="qty-inc"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupName = btn.closest('.group-card').querySelector('[data-action="toggle-group"]').dataset.group;
      adjustQty(btn.dataset.catalogId, groupName, 1);
    });
  });
  root.querySelectorAll('[data-action="qty-dec"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupName = btn.closest('.group-card').querySelector('[data-action="toggle-group"]').dataset.group;
      adjustQty(btn.dataset.catalogId, groupName, -1);
    });
  });
  root.querySelectorAll('[data-action="qty-input"]').forEach((input) => {
    input.addEventListener('change', () => {
      const groupName = input.closest('.group-card').querySelector('[data-action="toggle-group"]').dataset.group;
      adjustQty(input.dataset.catalogId, groupName, 0, parseInt(input.value, 10) || 0);
    });
  });

  async function adjustCustomQty(repairId, delta, explicitValue) {
    const item = await repairRepository.get(repairId);
    const newQty = explicitValue !== undefined ? Math.max(0, explicitValue) : Math.max(0, (item.quantity || 0) + delta);
    await repairRepository.update(repairId, { quantity: newQty });
    await projectRepository.touch(projectId, {});
    rerender();
  }
  root.querySelectorAll('[data-action="custom-qty-inc"]').forEach((btn) => btn.addEventListener('click', () => adjustCustomQty(btn.dataset.repairId, 1)));
  root.querySelectorAll('[data-action="custom-qty-dec"]').forEach((btn) => btn.addEventListener('click', () => adjustCustomQty(btn.dataset.repairId, -1)));
  root.querySelectorAll('[data-action="custom-qty-input"]').forEach((input) => {
    input.addEventListener('change', () => adjustCustomQty(input.dataset.repairId, 0, parseInt(input.value, 10) || 0));
  });

  root.querySelectorAll('[data-action="delete-repair"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const photos = await photoRepository.listByRepair(btn.dataset.repairId);
      for (const p of photos) await photoRepository.remove(p.id);
      await repairRepository.remove(btn.dataset.repairId);
      await projectRepository.touch(projectId, {});
      rerender();
    });
  });

  root.querySelectorAll('[data-action="edit-price"]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const itemId = el.dataset.itemId;
      const catalogItem = await pricingService.getCatalogItem(itemId);
      const current = await pricingService.resolveUnitCost(itemId, project);
      const input = prompt(`Override unit cost for "${catalogItem.name}" (applies project-wide)`, current);
      if (input === null) return;
      const parsed = parseFloat(input);
      if (Number.isNaN(parsed)) return;
      await projectRepository.setPriceOverride(projectId, itemId, parsed);
      rerender();
    });
  });

  root.querySelectorAll('[data-action="add-custom"]').forEach((btn) => {
    btn.addEventListener('click', () => openAddCustomItemSheet({
      groupName: btn.dataset.group,
      onAdd: async ({ name, unit, cost, quantity }) => {
        await repairRepository.createCustom(roomId, projectId, btn.dataset.group, { name, unit, cost, quantity });
        await projectRepository.touch(projectId, {});
        rerender();
      },
    }));
  });

  // Photo capture
  root.querySelectorAll('[data-action="add-photo"]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const { blob, thumbnailBlob } = await photoService.processCapturedFile(file);
      await photoRepository.add({ projectId, roomId, repairId: input.dataset.repairId, blob, thumbnailBlob });
      rerender();
    });
  });
  root.querySelectorAll('[data-action="remove-photo"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await photoRepository.remove(btn.dataset.photoId);
      rerender();
    });
  });

  // Equipment OCR scan
  async function runScan(repairId, file) {
    const overlay = showOverlay('Enhancing photo…');
    try {
      const result = await ocrService.scanEquipmentPhoto(file, {
        onStatus: (status) => overlay.update(OCR_STATUS_MESSAGES[status] || 'Working…'),
      });
      overlay.close();
      openEquipmentConfirmSheet({
        result,
        onConfirm: async (fields) => {
          const { blob, thumbnailBlob } = await photoService.processCapturedFile(file);
          const photo = await photoRepository.add({ projectId, roomId, repairId, blob, thumbnailBlob });
          await equipmentRepository.create(repairId, { ...fields, photoId: photo.id, extractedText: result.extractedText, confidence: result.confidence });
          rerender();
        },
      });
    } catch (err) {
      overlay.close();
      showToast(err.message || 'Scan failed. Try a clearer, well-lit photo.');
    }
  }
  root.querySelectorAll('[data-action="scan-equipment"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) runScan(input.dataset.repairId, file);
    });
  });
  root.querySelectorAll('[data-action="rescan-equipment"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const existing = await equipmentRepository.listByRepair(btn.dataset.repairId);
      for (const eq of existing) await equipmentRepository.remove(eq.id);
      rerender();
    });
  });
}

function openAddCustomItemSheet({ groupName, onAdd }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h2>Add Item &mdash; ${escapeHtml(groupName)}</h2>
        <button class="btn btn-icon" data-act="close" aria-label="Close">${icons.close}</button>
      </div>
      <form id="custom-item-form">
        <div class="field">
          <label for="ci-name">Item name</label>
          <input class="input" id="ci-name" name="name" placeholder="e.g. Custom trim work" required autofocus />
        </div>
        <div class="input-row">
          <div class="field">
            <label for="ci-unit">Unit</label>
            <input class="input" id="ci-unit" name="unit" placeholder="ea. / sqft / flat" value="ea." />
          </div>
          <div class="field">
            <label for="ci-cost">Unit cost ($)</label>
            <input class="input" id="ci-cost" name="cost" type="number" min="0" step="0.01" required />
          </div>
        </div>
        <div class="field">
          <label for="ci-qty">Quantity</label>
          <input class="input" id="ci-qty" name="quantity" type="number" min="1" step="1" value="1" />
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary btn-block" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary btn-block">Add Item</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-act="close"]').forEach((btn) => btn.addEventListener('click', close));
  backdrop.querySelector('#custom-item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    onAdd({
      name: data.get('name'),
      unit: data.get('unit') || 'ea.',
      cost: parseFloat(data.get('cost')) || 0,
      quantity: parseInt(data.get('quantity'), 10) || 1,
    });
    close();
  });
}

function openEquipmentConfirmSheet({ result, onConfirm }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const confidenceNote = result.confidence !== null ? `OCR confidence: ${result.confidence}%` : '';
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h2>Confirm Equipment Details</h2>
        <button class="btn btn-icon" data-act="close" aria-label="Close">${icons.close}</button>
      </div>
      <p style="color:var(--text-tertiary); font-size:12.5px; margin:-8px 0 14px;">Review what we read off the label — edit anything that looks off. ${confidenceNote}</p>
      <form id="equipment-form">
        <div class="field">
          <label for="eq-manufacturer">Manufacturer</label>
          <input class="input" id="eq-manufacturer" name="manufacturer" value="${escapeHtml(result.manufacturer || '')}" placeholder="e.g. Trane" />
        </div>
        <div class="field">
          <label for="eq-model">Model</label>
          <input class="input" id="eq-model" name="model" value="${escapeHtml(result.model || '')}" placeholder="e.g. XR14" />
        </div>
        <div class="field">
          <label for="eq-serial">Serial number</label>
          <input class="input" id="eq-serial" name="serialNumber" value="${escapeHtml(result.serialNumber || '')}" placeholder="e.g. 19191E3F1V" />
        </div>
        <div class="field">
          <label for="eq-year">Manufacture year</label>
          <input class="input" id="eq-year" name="manufactureDate" value="${escapeHtml(result.manufactureDate || '')}" placeholder="e.g. 2019" />
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary btn-block" data-act="close">Discard</button>
          <button type="submit" class="btn btn-primary btn-block">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-act="close"]').forEach((btn) => btn.addEventListener('click', close));
  backdrop.querySelector('#equipment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    onConfirm({
      manufacturer: data.get('manufacturer') || null,
      model: data.get('model') || null,
      serialNumber: data.get('serialNumber') || null,
      manufactureDate: data.get('manufactureDate') || null,
    });
    close();
  });
}