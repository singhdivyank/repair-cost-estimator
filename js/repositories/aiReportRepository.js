import { db } from '../core/db.js';
import { makeId, nowIso } from '../core/utils.js';

const STORE = 'aiReports';

// AIReport
// { id, projectId, status ('GENERATING'|'READY'|'FAILED'|'STALE'),
//   generatedAt, model, projectVersion (the project.projectVersion this was
//   generated from — used to detect staleness),
//   opportunityScore, expectedProfitIncrease, executiveSummary,
//   recommendations[], risks[], version }

export const aiReportRepository = {
  async getByProject(projectId) {
    const all = await db.getAllByIndex(STORE, 'projectId', projectId);
    return all[0] || null;
  },

  async get(id) {
    return db.get(STORE, id);
  },

  async upsert(projectId, patch) {
    let report = await this.getByProject(projectId);
    const timestamp = nowIso();
    if (!report) {
      report = {
        id: makeId('aireport'),
        projectId,
        status: 'GENERATING',
        generatedAt: null,
        model: null,
        projectVersion: null,
        opportunityScore: null,
        expectedProfitIncrease: null,
        executiveSummary: '',
        recommendations: [],
        risks: [],
        version: 1,
      };
    }
    Object.assign(report, patch, { updatedAt: timestamp });
    await db.put(STORE, report);
    return report;
  },

  async remove(id) {
    await db.delete(STORE, id);
  },
};
