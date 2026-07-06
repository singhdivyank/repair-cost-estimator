import { projectRepository } from '../repositories/projectRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { repairRepository } from '../repositories/repairRepository.js';
import { pricingService } from '../services/pricingService.js';
import { icons } from '../core/icons.js';
import { formatCurrency } from '../core/utils.js';

const expandedGroups = new Set(); // persists while the app session is open

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function catalogRowTemplate(row) {
  const { catalogItem, unitCost, isOverridden, repairItem } = row;
  const checked = !!repairItem?.checked;
  const quantity = repairItem?.quantity ?? 1;
  const lineTotal = checked ? unitCost * quantity : 0;
  return `
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
  `;
}

function customRowTemplate(item) {
  const lineTotal = (item.customCost || 0) * (item.quantity || 0);
  return `
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

export async function renderRoomDetailScreen(root, { projectId, roomId, onBack }) {
  const project = await projectRepository.get(projectId);
  const room = await roomRepository.get(roomId);
  if (!project || !room) {
    root.innerHTML = `<div class="empty-state"><h3>Room not found</h3></div>`;
    return;
  }

  const rerender = () => renderRoomDetailScreen(root, { projectId, roomId, onBack });

  const roomTotal = await pricingService.calcRoomTotal(roomId, project);
  const roomProgress = await pricingService.calcRoomProgress(room);
  const groups = room.groups || [];

  const groupSections = [];
  for (const groupName of groups) {
    const view = await pricingService.getRoomGroupView(room, groupName, project);
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
              ${g.view.catalogRows.map((row) => catalogRowTemplate(row)).join('')}
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
