import { projectRepository } from '../repositories/projectRepository.js';
import { pricingService } from '../services/pricingService.js';
import { icons } from '../core/icons.js';
import { formatCurrency, formatDate } from '../core/utils.js';
import { openNewProjectWizard } from './newProjectWizard.js';
import { localStore } from '../core/localStore.js';

const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
  { key: 'complete', label: 'Complete' },
  { key: 'archived', label: 'Archived' },
];

let state = {
  filter: 'active',
  query: '',
};

function matchesFilter(project, filter) {
  if (filter === 'all') return project.status !== 'archived';
  return project.status === filter;
}

function matchesQuery(project, query) {
  if (!query.trim()) return true;
  return project.address.toLowerCase().includes(query.trim().toLowerCase());
}

async function computeCardData(project) {
  const total = await pricingService.calcProjectTotal(project);
  const progress = await pricingService.calcProjectProgress(project.id);
  return { total, progress };
}

function projectCardTemplate(project, { total, progress }) {
  const isComplete = project.status === 'complete' || progress.pct === 100;
  return `
    <div class="project-card" data-project-id="${project.id}" role="button" tabindex="0">
      <div class="project-card-top">
        <div>
          <div class="project-address">${escapeHtml(project.address)}</div>
          <div class="project-meta">Updated ${formatDate(project.updatedAt)} &middot; ${project.bedrooms} bd / ${project.bathrooms} ba</div>
        </div>
        <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <div class="project-estimate num">${formatCurrency(total)}</div>
          <button class="card-menu-btn" data-action="menu" data-project-id="${project.id}" aria-label="Project options">${icons.dots}</button>
        </div>
      </div>
      <div class="project-progress-row">
        <span class="status-badge ${isComplete ? 'complete' : project.status}">${isComplete ? 'Complete' : project.status}</span>
        <div class="progress-track"><div class="progress-fill ${isComplete ? 'complete' : ''}" style="width:${progress.pct}%"></div></div>
        <div class="progress-pct num">${progress.pct}%</div>
      </div>
    </div>
  `;
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function emptyStateTemplate(hasAnyProjects) {
  if (hasAnyProjects) {
    return `
      <div class="empty-state">
        <div class="mark">${icons.search}</div>
        <h3>No matching projects</h3>
        <p>Try a different search term or switch filters.</p>
      </div>
    `;
  }
  return `
    <div class="empty-state">
      <div class="mark">${icons.spark}</div>
      <h3>No projects yet</h3>
      <p>Start a walkthrough by creating your first property project.</p>
      <button class="btn btn-primary" style="margin-top:16px" data-action="new-project">${icons.plus} New Project</button>
    </div>
  `;
}

export async function renderProjectsScreen(root, { onOpenProject }) {
  const allProjects = await projectRepository.list();
  const filtered = allProjects.filter((p) => matchesFilter(p, state.filter) && matchesQuery(p, state.query));

  root.innerHTML = `
    <div class="search-bar">
      ${icons.search}
      <input type="search" placeholder="Search by address" value="${escapeHtml(state.query)}" id="project-search" aria-label="Search projects" />
    </div>
    <div class="filter-row" id="filter-row">
      ${FILTERS.map((f) => `<button class="chip ${state.filter === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
    </div>
    <div id="project-list">
      ${filtered.length === 0 ? emptyStateTemplate(allProjects.length > 0) : '<div class="skeleton-placeholder"></div>'}
    </div>
  `;

  const listEl = root.querySelector('#project-list');
  if (filtered.length > 0) {
    const cardsData = await Promise.all(filtered.map((p) => computeCardData(p)));
    listEl.innerHTML = filtered.map((p, i) => projectCardTemplate(p, cardsData[i])).join('');
  }

  // Search
  const searchInput = root.querySelector('#project-search');
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderProjectsScreen(root, { onOpenProject });
  });
  // Preserve focus + caret across re-render triggered by typing
  if (document.activeElement !== searchInput && state.query) {
    // no-op; re-render already reflects value
  }

  // Filters
  root.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      renderProjectsScreen(root, { onOpenProject });
    });
  });

  // Open project
  listEl.querySelectorAll('.project-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="menu"]')) return;
      const id = card.dataset.projectId;
      localStore.pushRecentProject(id);
      localStore.setCurrentProjectId(id);
      onOpenProject(id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') card.click();
    });
  });

  // Card menu
  listEl.querySelectorAll('[data-action="menu"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openProjectMenu(btn.dataset.projectId, () => renderProjectsScreen(root, { onOpenProject }));
    });
  });

  // New project entry points
  root.querySelectorAll('[data-action="new-project"]').forEach((btn) => {
    btn.addEventListener('click', () => openNewProjectWizard({ onCreated: () => renderProjectsScreen(root, { onOpenProject }) }));
  });
}

function openProjectMenu(projectId, onChange) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="action-list">
        <button class="action-item" data-act="rename">${icons.edit} Rename</button>
        <button class="action-item" data-act="duplicate">${icons.copy} Duplicate</button>
        <button class="action-item" data-act="archive">${icons.archive} Archive</button>
        <button class="action-item danger" data-act="delete">${icons.trash} Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('[data-act="rename"]').addEventListener('click', async () => {
    close();
    const project = await projectRepository.get(projectId);
    const name = prompt('Project address', project.address);
    if (name && name.trim()) {
      await projectRepository.rename(projectId, name.trim());
      onChange();
    }
  });
  backdrop.querySelector('[data-act="duplicate"]').addEventListener('click', async () => {
    close();
    await projectRepository.duplicate(projectId);
    onChange();
  });
  backdrop.querySelector('[data-act="archive"]').addEventListener('click', async () => {
    close();
    await projectRepository.archive(projectId);
    onChange();
  });
  backdrop.querySelector('[data-act="delete"]').addEventListener('click', async () => {
    close();
    if (confirm('Delete this project? This cannot be undone.')) {
      await projectRepository.remove(projectId);
      onChange();
    }
  });
}
