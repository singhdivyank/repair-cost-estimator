// Runs the AI Investment Advisor entirely on-device via transformers.js
// (lazy-loaded from a CDN as an ES module, same lazy-load pattern as the OCR
// and export services). The model weights download once on first use and
// are then cached by the service worker, so every subsequent analysis
// — for this project or any other — runs with zero network access.
//
// Deliberate scope decision vs. the original design doc: there is no
// FastAPI/vLLM backend and no external market-data provider (RentCast/ATTOM/
// etc). Those require server-side API keys and can't be called safely from
// a static client. Instead the advisor reasons entirely over data already
// captured during the walkthrough (repair costs by category, purchase
// price, ARV, target margin, equipment ages from OCR) — genuinely useful,
// with no external dependency to keep alive.

import { exportService } from './exportService.js';
import { pricingService } from './pricingService.js';

const TRANSFORMERS_CDN_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';

let generatorPromise = null;

async function loadGenerator(onProgress) {
  if (generatorPromise) return generatorPromise;
  generatorPromise = (async () => {
    let mod;
    try {
      mod = await import(TRANSFORMERS_CDN_URL);
    } catch (err) {
      generatorPromise = null;
      throw new Error('Could not load the AI engine. An internet connection is required the first time you run the AI Advisor.');
    }
    const { pipeline, env } = mod;
    env.allowLocalModels = false;

    const preferWebGpu = typeof navigator !== 'undefined' && !!navigator.gpu;
    try {
      if (preferWebGpu) {
        return await pipeline('text-generation', MODEL_ID, { device: 'webgpu', dtype: 'q4', progress_callback: onProgress });
      }
      return await pipeline('text-generation', MODEL_ID, { dtype: 'q8', progress_callback: onProgress });
    } catch (err) {
      if (preferWebGpu) {
        return await pipeline('text-generation', MODEL_ID, { dtype: 'q8', progress_callback: onProgress });
      }
      generatorPromise = null;
      throw err;
    }
  })();
  return generatorPromise;
}

const SYSTEM_PROMPT = `You are a residential real-estate investment advisor helping a house-flipping acquisition agent. Use ONLY the inspection and financial data provided in the user message — never invent market data, comparable sales, or facts that were not given. Respond with a single valid JSON object and NOTHING else: no markdown, no code fences, no commentary before or after. Match exactly this shape:
{"opportunityScore": <integer 0-100>, "executiveSummary": "<2-3 sentences>", "recommendations": [{"title": "<short title>", "reasoning": "<1 sentence>", "priority": "high|medium|low"}], "risks": ["<short risk>"], "expectedProfitIncrease": <integer dollar amount, 0 if unknown>}
Include at most 5 recommendations and at most 4 risks.`;

function buildUserPrompt(project, rows, categories, financials, equipmentSummary) {
  const lines = [];
  lines.push(`Property: ${project.address} (${project.propertyType || 'unknown type'}, ${project.bedrooms} bd / ${project.bathrooms} ba${project.squareFootage ? `, ${project.squareFootage} sqft` : ''})`);
  if (project.purchasePrice) lines.push(`Purchase price: $${project.purchasePrice}`);
  if (project.arv) lines.push(`After-repair value (ARV): $${project.arv}`);
  if (project.targetMarginPct) lines.push(`Target profit margin: ${project.targetMarginPct}%`);
  const total = rows.reduce((s, r) => s + r.lineTotal, 0);
  lines.push(`Total repair estimate: $${Math.round(total)}`);
  if (financials) {
    lines.push(`Estimated total cost (purchase + repairs): $${Math.round(financials.totalCost)}`);
    lines.push(`Estimated profit: $${Math.round(financials.profit)}`);
    lines.push(`Estimated ROI: ${financials.roi.toFixed(1)}%`);
  }
  lines.push('Repair cost by category:');
  categories.slice(0, 8).forEach((c) => lines.push(`- ${c.group}: $${Math.round(c.total)}`));
  if (equipmentSummary.length > 0) {
    lines.push('Scanned equipment:');
    equipmentSummary.forEach((e) => lines.push(`- ${e}`));
  }
  return lines.join('\n');
}

function tryParseJson(text) {
  const attempts = [text.trim()];
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) attempts.push(braceMatch[0]);
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      // try next candidate
    }
  }
  return null;
}

function validateReportShape(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.opportunityScore !== 'number') return false;
  if (typeof obj.executiveSummary !== 'string' || !obj.executiveSummary.trim()) return false;
  if (!Array.isArray(obj.recommendations)) return false;
  if (!Array.isArray(obj.risks)) return false;
  return true;
}

function normalizeReport(obj) {
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const recommendations = (obj.recommendations || [])
    .filter((r) => r && r.title)
    .map((r) => ({
      title: String(r.title).slice(0, 120),
      reasoning: String(r.reasoning || '').slice(0, 300),
      priority: ['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'medium',
    }))
    .sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1))
    .slice(0, 5);
  return {
    opportunityScore: Math.max(0, Math.min(100, Math.round(obj.opportunityScore))),
    executiveSummary: String(obj.executiveSummary).slice(0, 800),
    recommendations,
    risks: (obj.risks || []).filter(Boolean).map((r) => String(r).slice(0, 200)).slice(0, 4),
    expectedProfitIncrease: typeof obj.expectedProfitIncrease === 'number' ? Math.round(obj.expectedProfitIncrease) : 0,
  };
}

// Deterministic, rule-based report used only if the on-device model fails
// twice in a row (small quantized models occasionally drift off the JSON
// schema). This keeps the feature useful even in the worst case, and is
// clearly labeled to the user as computed rather than AI-generated.
function buildFallbackReport(project, rows, categories, financials) {
  const total = rows.reduce((s, r) => s + r.lineTotal, 0);
  let opportunityScore = 50;
  if (financials) {
    if (financials.roi >= 20) opportunityScore = 85;
    else if (financials.roi >= 10) opportunityScore = 70;
    else if (financials.roi >= 0) opportunityScore = 55;
    else opportunityScore = 30;
  }
  const top = categories.slice(0, 3);
  const recommendations = top.map((c, i) => ({
    title: `Review ${c.group} costs`,
    reasoning: `${c.group} is ${i === 0 ? 'the largest' : 'a significant'} cost driver at $${Math.round(c.total)} — get a second quote before locking the budget.`,
    priority: i === 0 ? 'high' : 'medium',
  }));
  const risks = [];
  if (financials && financials.roi < 10) risks.push('Estimated ROI is below a typical 10% threshold for flips — margin is thin if costs run over.');
  if (project.purchasePrice && total > project.purchasePrice * 0.5) risks.push('Repair estimate exceeds 50% of purchase price — verify structural/systems items closely.');
  if (risks.length === 0) risks.push('No major risk flags from the numbers alone — confirm with a full contractor walkthrough.');
  return {
    opportunityScore,
    executiveSummary: financials
      ? `Based on the numbers entered, this deal projects roughly $${Math.round(financials.profit)} in profit (${financials.roi.toFixed(1)}% ROI) after an estimated $${Math.round(total)} in repairs.`
      : `Total repair estimate is $${Math.round(total)}. Add a purchase price and ARV to this project for profit/ROI analysis.`,
    recommendations,
    risks,
    expectedProfitIncrease: 0,
  };
}

export const aiService = {
  async generateReport(project, { onStatus } = {}) {
    const rows = await exportService.gatherLineItems(project);
    const categories = exportService.categoryTotalsFromRows(rows);
    const financials = pricingService.calcFinancials(project, rows.reduce((s, r) => s + r.lineTotal, 0));

    const equipmentSummary = rows
      .filter((r) => r.equipment)
      .map((r) => {
        const e = r.equipment;
        const parts = [e.manufacturer, e.model].filter(Boolean).join(' ');
        const age = e.manufactureDate ? `${new Date().getFullYear() - parseInt(e.manufactureDate, 10)}y old` : null;
        return [parts, age].filter(Boolean).join(', ') || null;
      })
      .filter(Boolean);

    onStatus?.('loading-engine');
    let generator;
    try {
      generator = await loadGenerator((p) => onStatus?.('downloading-model', p));
    } catch (err) {
      return { ...buildFallbackReport(project, rows, categories, financials), model: 'fallback-heuristic', usedFallback: true, engineError: err.message };
    }

    const userPrompt = buildUserPrompt(project, rows, categories, financials, equipmentSummary);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    onStatus?.('generating');
    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const promptMessages = attempt === 0
        ? messages
        : [...messages, { role: 'assistant', content: '(invalid JSON)' }, { role: 'user', content: 'That was not valid JSON. Respond again with ONLY the JSON object, no other text.' }];
      try {
        const output = await generator(promptMessages, { max_new_tokens: 450, do_sample: false });
        const text = output?.[0]?.generated_text?.at?.(-1)?.content || '';
        const candidate = tryParseJson(text);
        if (candidate && validateReportShape(candidate)) parsed = candidate;
      } catch (err) {
        // fall through to retry / fallback
      }
    }

    if (!parsed) {
      return { ...buildFallbackReport(project, rows, categories, financials), model: 'fallback-heuristic', usedFallback: true };
    }
    return { ...normalizeReport(parsed), model: MODEL_ID, usedFallback: false };
  },
};