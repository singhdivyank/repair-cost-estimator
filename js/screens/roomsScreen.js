import { projectRepository } from '../repositories/projectRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { pricingService } from '../services/pricingService.js';
import { icons } from '../core/icons.js';
import { formatCurrency } from '../core/utils.js';
import { WHOLE_HOUSE_ROOMS, ROOM_TYPES } from '../data/roomTemplates.js';

const ROOM_TYPE_ICON = { bathroom: icons.bath, kitchen: icons.kitchen, bedroom: icons.bed, living: icons.sofa };
const WHOLE_HOUSE_ICON = { whole_house_interior: icons.home, whole_house_systems: icons.rooms, whole_house_exterior: icons.rooms };

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nextInstanceName(existingRooms, type) {
  const label = ROOM_TYPES[type].label;
  const count = existingRooms.filter((r) => r.type === type).length;
  return `${label} ${count + 1}`;
}

function roomCardTemplate(room, progress, { deletable }) {
  const icon = WHOLE_HOUSE_ICON[room.type] || ROOM_TYPE_ICON[room.type] || icons.rooms;
  const isComplete = progress.totalGroups > 0 && progress.pct === 100;
  return `
    <div class="project-card" style="padding:14px 16px;" data-room-id="${room.id}" role="button" tabindex="0">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:38px;height:38px;border-radius:10px;background:var(--bg-surface-raised);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0;">${icon}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:15px;">${escapeHtml(room.name)}</div>
          <div class="project-meta">${progress.completedGroups}/${progress.totalGroups} groups reviewed</div>
        </div>
        ${deletable ? `<button class="card-menu-btn" data-action="delete-room" data-room-id="${room.id}" aria-label="Remove room">${icons.trash}</button>` : ''}
      </div>
      <div class="project-progress-row" style="margin-top:10px;">
        <div class="progress-track"><div class="progress-fill ${isComplete ? 'complete' : ''}" style="width:${progress.pct}%"></div></div>
        <div class="progress-pct num">${progress.pct}%</div>
      </div>
    </div>
  `;
}

export async function renderRoomsScreen(root, { projectId, onOpenRoom }) {
  const project = await projectRepository.get(projectId);
  if (!project) {
    root.innerHTML = `<div class="empty-state"><h3>Project not found</h3></div>`;
    return;
  }
  const rooms = await roomRepository.listByProject(projectId);
  const total = await pricingService.calcProjectTotal(project);
  const progress = await pricingService.calcProjectProgress(projectId);
  const financials = pricingService.calcFinancials(project, total);

  const wholeHouseRooms = rooms.filter((r) => roomRepository.isSingleton(r.type));
  const adjustableRooms = rooms.filter((r) => !roomRepository.isSingleton(r.type));
  const byType = { kitchen: [], bathroom: [], bedroom: [], living: [] };
  adjustableRooms.forEach((r) => { if (byType[r.type]) byType[r.type].push(r); });

  const roomProgressList = await Promise.all(rooms.map((r) => pricingService.calcRoomProgress(r)));
  const progressById = new Map(rooms.map((r, i) => [r.id, roomProgressList[i]]));

  const isComplete = progress.pct === 100;

  root.innerHTML = `
    <div class="project-card" style="margin-bottom:18px;">
      <div class="project-address">${escapeHtml(project.address)}</div>
      <div class="project-estimate num" style="font-size:28px; margin-top:6px;">${formatCurrency(total)}</div>
      <div class="project-progress-row" style="margin-top:12px;">
        <div class="progress-track"><div class="progress-fill ${isComplete ? 'complete' : ''}" style="width:${progress.pct}%"></div></div>
        <div class="progress-pct num">${progress.pct}%</div>
      </div>
      ${financials ? `
        <div style="display:flex; gap:20px; margin-top:14px; padding-top:14px; border-top:1px solid var(--border-subtle);">
          <div>
            <div class="project-meta">Est. Profit</div>
            <div class="num" style="font-weight:700; color:${financials.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(financials.profit)}</div>
          </div>
          <div>
            <div class="project-meta">Est. ROI</div>
            <div class="num" style="font-weight:700;">${financials.roi.toFixed(1)}%</div>
          </div>
        </div>
      ` : ''}
      ${project.status === 'active' ? `
        <button class="btn ${isComplete ? 'btn-primary' : 'btn-secondary'} btn-block" style="margin-top:14px;" data-action="mark-complete" ${isComplete ? '' : 'disabled'}>
          ${isComplete ? 'Mark Project Complete' : `Finish all groups to complete (${progress.completedGroups}/${progress.totalGroups})`}
        </button>
      ` : `<div class="status-badge complete" style="margin-top:14px; display:inline-block;">Complete</div>`}
    </div>

    <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-tertiary); margin-bottom:8px;">Whole House</h3>
    <div style="margin-bottom:20px;">
      ${wholeHouseRooms.map((r) => roomCardTemplate(r, progressById.get(r.id), { deletable: false })).join('')}
    </div>

    ${Object.entries(byType).map(([type, list]) => `
      <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-tertiary); margin-bottom:8px;">${ROOM_TYPES[type].label}${list.length > 1 ? 's' : ''}</h3>
      <div style="margin-bottom:20px;">
        ${list.length === 0 ? `<p style="color:var(--text-tertiary); font-size:13px; margin-bottom:12px;">None added yet.</p>` : list.map((r) => roomCardTemplate(r, progressById.get(r.id), { deletable: true })).join('')}
        <button class="btn btn-secondary btn-block" data-action="add-room" data-type="${type}">${icons.plus} Add ${ROOM_TYPES[type].label}</button>
      </div>
    `).join('')}
  `;

  root.querySelectorAll('[data-room-id]:not([data-action])').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="delete-room"]')) return;
      onOpenRoom(card.dataset.roomId);
    });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') card.click(); });
  });

  root.querySelectorAll('[data-action="add-room"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const name = nextInstanceName(rooms, type);
      await roomRepository.create(projectId, { type, name });
      await projectRepository.touch(projectId, {});
      renderRoomsScreen(root, { projectId, onOpenRoom });
    });
  });

  root.querySelectorAll('[data-action="delete-room"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Remove this room and all its repair selections?')) {
        await roomRepository.remove(btn.dataset.roomId);
        renderRoomsScreen(root, { projectId, onOpenRoom });
      }
    });
  });

  const markCompleteBtn = root.querySelector('[data-action="mark-complete"]');
  if (markCompleteBtn && isComplete) {
    markCompleteBtn.addEventListener('click', async () => {
      await projectRepository.setStatus(projectId, 'complete');
      renderRoomsScreen(root, { projectId, onOpenRoom });
    });
  }
}
