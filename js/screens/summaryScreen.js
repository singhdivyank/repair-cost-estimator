import { projectRepository } from '../repositories/projectRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { pricingService } from '../services/pricingService.js';
import { exportService } from '../services/exportService.js';
import { icons } from '../core/icons.js';
import { formatCurrency, formatSignedCurrency, formatSignedPercent } from '../core/utils.js';

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function categoryBarTemplate(cat, maxTotal) {
  const pct = maxTotal > 0 ? Math.max(3, Math.round((cat.total / maxTotal) * 100)) : 0;
  return `
    <div class="cat-bar-row">
      <div class="cat-bar-label">${escapeHtml(cat.group)}</div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
      <div class="cat-bar-value num">${formatCurrency(cat.total)}</div>
    </div>
  `;
}

function showOverlay(message) {
  const el = document.createElement('div');
  el.className = 'scan-overlay';
  el.innerHTML = `<div class="scan-overlay-card"><span class="spin">${icons.spinner}</span><span id="export-overlay-msg">${escapeHtml(message)}</span></div>`;
  document.body.appendChild(el);
  return {
    update(msg) { const m = el.querySelector('#export-overlay-msg'); if (m) m.textContent = msg; },
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

export async function renderSummaryScreen(root, { projectId, onOpenRoom }) {
  const project = await projectRepository.get(projectId);
  if (!project) {
    root.innerHTML = `<div class="empty-state"><h3>Project not found</h3></div>`;
    return;
  }

  const rerender = () => renderSummaryScreen(root, { projectId, onOpenRoom });

  const rows = await exportService.gatherLineItems(project);
  const total = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const progress = await pricingService.calcProjectProgress(projectId);
  const financials = pricingService.calcFinancials(project, total);
  const categories = exportService.categoryTotalsFromRows(rows);
  const maxCat = categories.length ? categories[0].total : 0;

  const rooms = await roomRepository.listByProject(projectId);
  const roomRows = [];
  for (const room of rooms) {
    const roomTotal = await pricingService.calcRoomTotal(room.id, project);
    const roomProgress = await pricingService.calcRoomProgress(room);
    roomRows.push({ room, roomTotal, roomProgress });
  }

  const isIncomplete = progress.pct < 100;

  root.innerHTML = `
    <div class="project-card" style="margin-bottom:18px;">
      <div class="project-address">${escapeHtml(project.address)}</div>
      <div class="project-estimate num" style="font-size:26px; margin-top:6px;">${formatCurrency(total)}</div>
      <div class="project-progress-row" style="margin-top:10px;">
        <div class="progress-track"><div class="progress-fill ${progress.pct === 100 ? 'complete' : ''}" style="width:${progress.pct}%"></div></div>
        <div class="progress-pct num">${progress.pct}%</div>
      </div>
      ${financials ? `
        <div style="display:flex; gap:20px; margin-top:14px; padding-top:14px; border-top:1px solid var(--border-subtle);">
          <div><div class="project-meta">Profit / Loss</div><div class="num" style="font-weight:700; color:${financials.meetsTarget ? 'var(--success)' : 'var(--danger)'};">${formatSignedCurrency(financials.profit)}</div></div>
          <div><div class="project-meta">Margin <span class="num">(target ${project.targetMarginPct}%)</span></div><div class="num" style="font-weight:700; color:${financials.meetsTarget ? 'var(--success)' : 'var(--danger)'};">${formatSignedPercent(financials.marginPct)}</div></div>
        </div>
      ` : ''}
    </div>

    <h3 class="section-heading">By Category</h3>
    <div class="project-card" style="margin-bottom:18px;">
      ${categories.length === 0
        ? `<p style="color:var(--text-tertiary); font-size:13px;">No repairs selected yet.</p>`
        : categories.map((c) => categoryBarTemplate(c, maxCat)).join('')}
    </div>

    <h3 class="section-heading">By Room</h3>
    <div class="project-card" style="margin-bottom:18px; padding:6px 8px;">
      ${roomRows.map(({ room, roomTotal, roomProgress }) => `
        <button class="room-summary-row" data-room-id="${room.id}">
          <div>
            <div class="room-summary-name">${escapeHtml(room.name)}</div>
            <div class="project-meta">${roomProgress.completedGroups}/${roomProgress.totalGroups} groups</div>
          </div>
          <div class="num" style="font-weight:700;">${formatCurrency(roomTotal)}</div>
        </button>
      `).join('')}
    </div>

    <h3 class="section-heading">Export</h3>
    <div class="project-card">
      ${isIncomplete ? `<p class="export-warning">${icons.ban} Inspection is ${progress.pct}% complete. You can still export, but totals may be incomplete.</p>` : ''}
      <button class="btn btn-secondary btn-block export-btn" data-action="export-excel">${icons.fileSpreadsheet} Export Excel (.xlsx)</button>
      <button class="btn btn-primary btn-block export-btn" data-action="export-zip" style="margin-top:10px;">${icons.fileZip} Export Full Package (.zip)</button>
      <p style="color:var(--text-tertiary); font-size:12px; margin-top:10px;">Full package includes the Excel breakdown, every captured photo organized by room, and a raw project JSON backup.</p>
      ${project.lastExportedAt ? `<p style="color:var(--text-tertiary); font-size:12px; margin-top:4px;">Last exported ${new Date(project.lastExportedAt).toLocaleString('en-US')}</p>` : ''}
    </div>
  `;

  root.querySelectorAll('[data-room-id]').forEach((btn) => {
    btn.addEventListener('click', () => onOpenRoom(btn.dataset.roomId));
  });

  root.querySelector('[data-action="export-excel"]').addEventListener('click', async () => {
    if (isIncomplete && !confirm(`This project is only ${progress.pct}% complete. Export the estimate anyway?`)) return;
    const overlay = showOverlay('Building spreadsheet…');
    try {
      await exportService.exportExcel(project);
      await projectRepository.recordExport(projectId);
      overlay.close();
      showToast('Excel file downloaded');
      rerender();
    } catch (err) {
      overlay.close();
      showToast('Export failed: ' + (err.message || 'unknown error'));
    }
  });

  root.querySelector('[data-action="export-zip"]').addEventListener('click', async () => {
    if (isIncomplete && !confirm(`This project is only ${progress.pct}% complete. Export the package anyway?`)) return;
    const overlay = showOverlay('Preparing export…');
    try {
      await exportService.exportZip(project, { onProgress: (msg) => overlay.update(msg) });
      await projectRepository.recordExport(projectId);
      overlay.close();
      showToast('Full package downloaded');
      rerender();
    } catch (err) {
      overlay.close();
      showToast('Export failed: ' + (err.message || 'unknown error'));
    }
  });
}