import { projectRepository } from '../repositories/projectRepository.js';
import { aiReportRepository } from '../repositories/aiReportRepository.js';
import { aiService } from '../services/aiService.js';
import { speechService } from '../services/speechService.js';
import { icons } from '../core/icons.js';
import { formatCurrency } from '../core/utils.js';

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const inFlight = new Map(); // projectId -> { status, progress }

function statusMessage(entry) {
  if (!entry) return 'Working…';
  switch (entry.status) {
    case 'loading-engine': return 'Loading AI engine…';
    case 'downloading-model': {
      const pct = entry.progress?.progress;
      return typeof pct === 'number' ? `Downloading on-device model… ${Math.round(pct)}%` : 'Downloading on-device model (first run only)…';
    }
    case 'generating': return 'Analyzing project data…';
    default: return 'Starting…';
  }
}

async function ensureGeneration(project, rerender) {
  if (inFlight.has(project.id)) return;
  inFlight.set(project.id, { status: 'starting' });
  await aiReportRepository.upsert(project.id, { status: 'GENERATING' });
  rerender();
  try {
    const result = await aiService.generateReport(project, {
      onStatus: (status, progress) => {
        inFlight.set(project.id, { status, progress });
        rerender();
      },
    });
    await aiReportRepository.upsert(project.id, {
      status: 'READY',
      projectVersion: project.projectVersion,
      generatedAt: new Date().toISOString(),
      model: result.model,
      opportunityScore: result.opportunityScore,
      expectedProfitIncrease: result.expectedProfitIncrease,
      executiveSummary: result.executiveSummary,
      recommendations: result.recommendations,
      risks: result.risks,
      usedFallback: result.usedFallback,
    });
  } catch (err) {
    await aiReportRepository.upsert(project.id, { status: 'FAILED', error: err.message || String(err) });
  } finally {
    inFlight.delete(project.id);
    rerender();
  }
}

function projectPickerRow(project, { locked }) {
  return `
    <button class="advisor-project-row ${locked ? 'locked' : ''}" data-project-id="${project.id}" ${locked ? 'disabled' : ''}>
      <div>
        <div class="room-summary-name">${escapeHtml(project.address)}</div>
        ${locked ? `<div class="project-meta">${icons.lock} Complete inspection to unlock AI Advisor</div>` : `<div class="project-meta">Tap to view or generate analysis</div>`}
      </div>
      ${!locked ? icons.chevronRight : ''}
    </button>
  `;
}

async function renderProjectPicker(root, { onSelectProject }) {
  const projects = await projectRepository.list();
  const eligible = projects.filter((p) => p.status === 'complete');
  const locked = projects.filter((p) => p.status !== 'complete' && p.status !== 'archived');

  root.innerHTML = `
    <div class="project-card" style="margin-bottom:18px; display:flex; gap:12px; align-items:flex-start;">
      <div style="color:var(--accent-text); flex-shrink:0;">${icons.spark}</div>
      <div>
        <div style="font-weight:700; margin-bottom:4px;">AI Investment Advisor</div>
        <p style="font-size:12.5px; color:var(--text-secondary); line-height:1.5;">Runs a real language model entirely on your device — no data leaves your phone, and once the model is downloaded it works with zero signal. Only available for completed projects.</p>
      </div>
    </div>

    ${eligible.length > 0 ? `
      <h3 class="section-heading">Completed Projects</h3>
      <div class="project-card" style="padding:4px 8px; margin-bottom:18px;">
        ${eligible.map((p) => projectPickerRow(p, { locked: false })).join('')}
      </div>
    ` : ''}

    ${locked.length > 0 ? `
      <h3 class="section-heading">Locked</h3>
      <div class="project-card" style="padding:4px 8px;">
        ${locked.map((p) => projectPickerRow(p, { locked: true })).join('')}
      </div>
    ` : ''}

    ${eligible.length === 0 && locked.length === 0 ? `
      <div class="empty-state">
        <div class="mark">${icons.spark}</div>
        <h3>No projects yet</h3>
        <p>Create and complete a project to unlock the AI Advisor.</p>
      </div>
    ` : ''}
  `;

  root.querySelectorAll('[data-project-id]:not(.locked)').forEach((btn) => {
    btn.addEventListener('click', () => onSelectProject(btn.dataset.projectId));
  });
}

function scoreColor(score) {
  if (score >= 70) return 'var(--success)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

function priorityColor(priority) {
  if (priority === 'high') return 'var(--danger)';
  if (priority === 'low') return 'var(--text-tertiary)';
  return 'var(--warning)';
}

async function renderReportView(root, { project, onBack, rerender }) {
  const report = await aiReportRepository.getByProject(project.id);
  const entry = inFlight.get(project.id);
  const generating = !!entry || report?.status === 'GENERATING';

  const header = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <button class="btn btn-icon" data-action="back" aria-label="Back">${icons.arrowLeft}</button>
      <div style="flex:1; min-width:0;">
        <div style="font-size:17px; font-weight:700;">${escapeHtml(project.address)}</div>
        <div class="project-meta">AI Investment Advisor</div>
      </div>
    </div>
  `;

  if (!report || generating) {
    if (!report && !generating) {
      // Shouldn't normally happen (we auto-trigger), but handle a manual retry entry point.
      root.innerHTML = `${header}
        <div class="empty-state">
          <div class="mark">${icons.spark}</div>
          <h3>Ready to analyze</h3>
          <p>Generate AI-powered insights for this completed project.</p>
          <button class="btn btn-primary" style="margin-top:16px;" data-action="generate">${icons.spark} Generate Analysis</button>
        </div>`;
      root.querySelector('[data-action="back"]').addEventListener('click', onBack);
      root.querySelector('[data-action="generate"]').addEventListener('click', () => ensureGeneration(project, rerender));
      return;
    }
    root.innerHTML = `${header}
      <div class="empty-state">
        <span class="spin" style="display:inline-flex; color:var(--accent);">${icons.spinner}</span>
        <h3 style="margin-top:14px;">${escapeHtml(statusMessage(entry))}</h3>
        <p>This runs entirely on your device and may take a little while the first time.</p>
      </div>`;
    root.querySelector('[data-action="back"]').addEventListener('click', onBack);
    if (!entry) ensureGeneration(project, rerender);
    return;
  }

  if (report.status === 'FAILED') {
    root.innerHTML = `${header}
      <div class="empty-state">
        <div class="mark" style="color:var(--danger);">${icons.alertTriangle}</div>
        <h3>Analysis failed</h3>
        <p>${escapeHtml(report.error || 'Something went wrong generating the report.')}</p>
        <button class="btn btn-primary" style="margin-top:16px;" data-action="retry">${icons.refresh} Try Again</button>
      </div>`;
    root.querySelector('[data-action="back"]').addEventListener('click', onBack);
    root.querySelector('[data-action="retry"]').addEventListener('click', () => ensureGeneration(project, rerender));
    return;
  }

  const stale = report.projectVersion !== project.projectVersion;
  const speaking = speechService.isSpeaking();

  root.innerHTML = `${header}
    ${stale ? `
      <div class="export-warning" style="color:var(--accent-text); background:var(--accent-soft);">
        ${icons.refresh} This project changed since this analysis ran.
      </div>
    ` : ''}

    <div class="project-card" style="margin-bottom:16px; text-align:center;">
      <div class="project-meta">Opportunity Score</div>
      <div class="num" style="font-size:42px; font-weight:800; color:${scoreColor(report.opportunityScore)};">${report.opportunityScore}</div>
      <div class="project-meta">out of 100</div>
      ${report.expectedProfitIncrease ? `<div style="margin-top:10px; font-size:13px; color:var(--text-secondary);">Est. profit opportunity: <span class="num" style="color:var(--success); font-weight:700;">${formatCurrency(report.expectedProfitIncrease)}</span></div>` : ''}
      <div style="margin-top:10px;">
        <span class="override-tag" style="${report.usedFallback ? 'color:var(--text-tertiary); background:var(--bg-surface-raised);' : ''}">${report.usedFallback ? 'Computed insights' : 'On-device AI'}</span>
      </div>
    </div>

    <div class="project-card" style="margin-bottom:16px;">
      <h3 class="section-heading">Summary</h3>
      <p style="font-size:14px; line-height:1.6; color:var(--text-primary);">${escapeHtml(report.executiveSummary)}</p>
      <button class="btn btn-secondary btn-block" style="margin-top:14px;" data-action="toggle-voice">
        ${speaking ? icons.volumeOff : icons.volume} ${speaking ? 'Stop Playback' : 'Listen to Report'}
      </button>
    </div>

    ${report.recommendations?.length ? `
      <h3 class="section-heading">Recommendations</h3>
      <div class="project-card" style="margin-bottom:16px;">
        ${report.recommendations.map((r) => `
          <div style="padding:10px 0; border-bottom:1px solid var(--border-subtle);">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="width:8px; height:8px; border-radius:50%; background:${priorityColor(r.priority)}; flex-shrink:0;"></span>
              <span style="font-weight:600; font-size:14px;">${escapeHtml(r.title)}</span>
            </div>
            <p style="font-size:12.5px; color:var(--text-secondary); margin:4px 0 0 16px;">${escapeHtml(r.reasoning)}</p>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${report.risks?.length ? `
      <h3 class="section-heading">Risks to Watch</h3>
      <div class="project-card" style="margin-bottom:16px;">
        ${report.risks.map((r) => `
          <div style="display:flex; gap:8px; padding:8px 0; align-items:flex-start;">
            <span style="color:var(--warning); flex-shrink:0; margin-top:1px;">${icons.alertTriangle}</span>
            <span style="font-size:12.5px; color:var(--text-secondary); line-height:1.5;">${escapeHtml(r)}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <button class="btn btn-secondary btn-block" data-action="regenerate">${icons.refresh} Regenerate Analysis</button>
    <p style="color:var(--text-tertiary); font-size:11.5px; text-align:center; margin-top:8px;">Generated ${new Date(report.generatedAt).toLocaleString('en-US')}</p>
  `;

  root.querySelector('[data-action="back"]').addEventListener('click', () => { speechService.stop(); onBack(); });
  root.querySelector('[data-action="regenerate"]').addEventListener('click', () => ensureGeneration(project, rerender));
  root.querySelector('[data-action="toggle-voice"]').addEventListener('click', () => {
    if (speechService.isSpeaking()) {
      speechService.stop();
    } else {
      speechService.speakReport(report, { onEnd: rerender });
    }
    rerender();
  });
}

export async function renderAiAdvisorScreen(root, { aiProjectId, onSelectProject, onBack }) {
  if (!aiProjectId) {
    await renderProjectPicker(root, { onSelectProject });
    return;
  }
  const project = await projectRepository.get(aiProjectId);
  if (!project) {
    root.innerHTML = `<div class="empty-state"><h3>Project not found</h3></div>`;
    return;
  }
  const rerender = () => renderAiAdvisorScreen(root, { aiProjectId, onSelectProject, onBack });
  await renderReportView(root, { project, onBack, rerender });
}