import { db } from './core/db.js';
import { localStore } from './core/localStore.js';
import { icons } from './core/icons.js';
import { renderProjectsScreen } from './screens/projectsScreen.js';
import { openNewProjectWizard } from './screens/newProjectWizard.js';
import { renderRoomsScreen } from './screens/roomsScreen.js';
import { renderRoomDetailScreen } from './screens/roomDetailScreen.js';
import { renderSummaryScreen } from './screens/summaryScreen.js';
import { renderAiAdvisorScreen } from './screens/aiAdvisorScreen.js';
import { projectRepository } from './repositories/projectRepository.js';

const APP_VERSION = '0.5.0-phase5';

const NAV_ITEMS = [
  { key: 'projects', label: 'Projects', icon: icons.projects },
  { key: 'rooms', label: 'Rooms', icon: icons.rooms },
  { key: 'summary', label: 'Summary', icon: icons.summary },
  { key: 'advisor', label: 'Advisor', icon: icons.spark },
];

let route = { screen: 'projects', projectId: localStore.getCurrentProjectId() };

function renderShell() {
  document.getElementById('app').innerHTML = `
    <div id="app-shell">
      <header class="topbar" id="topbar"></header>
      <main class="screen" id="screen-root"></main>
      <nav class="bottom-nav" id="bottom-nav"></nav>
    </div>
  `;
}

async function renderTopbar() {
  const topbar = document.getElementById('topbar');
  if (route.screen === 'projects') {
    topbar.innerHTML = `
      <div class="brand-row">
        <img src="assets/logo.png" alt="" class="topbar-logo" />
        <div>
          <div class="topbar-title">Projects</div>
        </div>
      </div>
      <button class="btn btn-icon" id="btn-new-project" aria-label="New project">${icons.plus}</button>
    `;
    document.getElementById('btn-new-project').addEventListener('click', () => {
      openNewProjectWizard({ onCreated: () => render() });
    });
  } else if (route.screen === 'rooms') {
    const project = route.projectId ? await projectRepository.get(route.projectId) : null;
    // Room detail has its own in-screen back/title bar, so keep the topbar minimal there.
    if (route.roomId) {
      topbar.innerHTML = `
        <div class="brand-row">
          <button class="btn btn-icon" id="btn-to-projects" aria-label="All projects">${icons.projects}</button>
          <div class="topbar-title">${project ? escapeHtml(project.address) : 'Rooms'}</div>
        </div>
      `;
    } else {
      topbar.innerHTML = `
        <div class="brand-row">
          <button class="btn btn-icon" id="btn-to-projects" aria-label="All projects">${icons.projects}</button>
          <div class="topbar-title">${project ? escapeHtml(project.address) : 'Rooms'}</div>
        </div>
      `;
    }
    document.getElementById('btn-to-projects').addEventListener('click', () => {
      route = { screen: 'projects', projectId: route.projectId };
      render();
    });
  } else if (route.screen === 'summary') {
    const project = route.projectId ? await projectRepository.get(route.projectId) : null;
    topbar.innerHTML = `
      <div class="brand-row">
        <button class="btn btn-icon" id="btn-to-projects" aria-label="All projects">${icons.projects}</button>
        <div class="topbar-title">Summary${project ? ` &middot; ${escapeHtml(project.address)}` : ''}</div>
      </div>
    `;
    document.getElementById('btn-to-projects').addEventListener('click', () => {
      route = { screen: 'projects', projectId: route.projectId };
      render();
    });
  } else if (route.screen === 'advisor') {
    topbar.innerHTML = `
      <div class="brand-row">
        <button class="btn btn-icon" id="btn-to-projects" aria-label="All projects">${icons.projects}</button>
        <div class="topbar-title">AI Investment Advisor</div>
      </div>
    `;
    document.getElementById('btn-to-projects').addEventListener('click', () => {
      route = { screen: 'projects', projectId: route.projectId };
      render();
    });
  } else {
    topbar.innerHTML = `
      <div>
        <div class="topbar-title">${route.screen[0].toUpperCase() + route.screen.slice(1)}</div>
        <div class="topbar-sub">Coming in the next phase</div>
      </div>
    `;
  }
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  nav.innerHTML = NAV_ITEMS.map((item) => {
    const disabled = (item.key === 'rooms' || item.key === 'summary') && !route.projectId;
    return `
      <button class="nav-btn ${route.screen === item.key ? 'active' : ''}" data-nav="${item.key}" ${disabled ? 'disabled' : ''}>
        ${item.icon}
        <span>${item.label}</span>
      </button>
    `;
  }).join('');
  nav.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      route.screen = btn.dataset.nav;
      if (btn.dataset.nav === 'rooms') route.roomId = null;
      if (btn.dataset.nav === 'advisor') route.aiProjectId = null;
      render();
    });
  });
}

async function renderScreen() {
  const root = document.getElementById('screen-root');
  if (route.screen === 'projects') {
    await renderProjectsScreen(root, {
      onOpenProject: (id) => {
        route = { screen: 'rooms', projectId: id, roomId: null };
        render();
      },
    });
  } else if (route.screen === 'rooms' && route.projectId) {
    if (route.roomId) {
      await renderRoomDetailScreen(root, {
        projectId: route.projectId,
        roomId: route.roomId,
        onBack: () => {
          route.roomId = null;
          render();
        },
      });
    } else {
      await renderRoomsScreen(root, {
        projectId: route.projectId,
        onOpenRoom: (roomId) => {
          route.roomId = roomId;
          render();
        },
      });
    }
  } else if (route.screen === 'summary' && route.projectId) {
    await renderSummaryScreen(root, {
      projectId: route.projectId,
      onOpenRoom: (roomId) => {
        route = { screen: 'rooms', projectId: route.projectId, roomId };
        render();
      },
    });
  } else if (route.screen === 'advisor') {
    await renderAiAdvisorScreen(root, {
      aiProjectId: route.aiProjectId,
      onSelectProject: (id) => {
        route.aiProjectId = id;
        render();
      },
      onBack: () => {
        route.aiProjectId = null;
        render();
      },
    });
  } else {
    root.innerHTML = `
      <div class="empty-state">
        <div class="mark">${icons.spark}</div>
        <h3>${route.screen[0].toUpperCase() + route.screen.slice(1)} screen</h3>
        <p>This part of the app ships in the next build phase. The project data layer underneath it is already live.</p>
      </div>
    `;
  }
}

async function render() {
  await renderTopbar();
  renderBottomNav();
  await renderScreen();
}

async function boot() {
  renderShell();
  await db.ready();
  localStore.setAppVersion(APP_VERSION);
  await render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  }
}

boot();
