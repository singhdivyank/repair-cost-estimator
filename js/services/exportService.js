import { roomRepository } from '../repositories/roomRepository.js';
import { repairRepository } from '../repositories/repairRepository.js';
import { photoRepository } from '../repositories/photoRepository.js';
import { equipmentRepository } from '../repositories/equipmentRepository.js';
import { pricingService } from './pricingService.js';
import { formatCurrency, formatDate } from '../core/utils.js';

// Both libraries are lazy-loaded only when an export is actually requested,
// via jsdelivr's `+esm` endpoint (wraps the published UMD/CJS package as a
// real ES module on the fly) — no build step, and the initial app bundle
// stays small. The service worker caches these after first successful load
// the same way it does for the OCR engine.
const XLSX_CDN_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';
const JSZIP_CDN_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

let xlsxModulePromise = null;
function loadXLSX() {
  if (!xlsxModulePromise) xlsxModulePromise = import(XLSX_CDN_URL);
  return xlsxModulePromise;
}
let jsZipModulePromise = null;
function loadJSZip() {
  if (!jsZipModulePromise) jsZipModulePromise = import(JSZIP_CDN_URL);
  return jsZipModulePromise;
}

function sanitizeFilename(str) {
  return (str || 'project').trim().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase() || 'project';
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Flattens every checked repair item + custom item across all rooms into one
// reporting-friendly row shape, with unit cost resolved through the same
// override chain the app uses everywhere else.
async function gatherLineItems(project) {
  const rooms = await roomRepository.listByProject(project.id);
  const rows = [];
  for (const room of rooms) {
    const items = await repairRepository.listByRoom(room.id);
    for (const item of items) {
      if (!item.checked) continue;
      const unitCost = item.isCustom ? item.customCost || 0 : await pricingService.resolveUnitCost(item.itemId, project);
      const lineTotal = unitCost * (item.quantity || 0);
      const photos = await photoRepository.listByRepair(item.id);
      const equipment = (await equipmentRepository.listByRepair(item.id))[0] || null;
      rows.push({
        roomName: room.name,
        groupName: item.groupId,
        itemName: item.name,
        unit: item.unit,
        quantity: item.quantity || 0,
        unitCost,
        lineTotal,
        isCustom: !!item.isCustom,
        notes: item.notes || '',
        photoCount: photos.length,
        equipment,
        repairId: item.id,
        roomId: room.id,
      });
    }
  }
  return rows;
}

function categoryTotalsFromRows(rows) {
  const map = new Map();
  rows.forEach((r) => {
    map.set(r.groupName, (map.get(r.groupName) || 0) + r.lineTotal);
  });
  return Array.from(map.entries()).map(([group, total]) => ({ group, total })).sort((a, b) => b.total - a.total);
}

async function buildWorkbook(project, rows, XLSX) {
  const wb = XLSX.utils.book_new();

  const total = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const financials = pricingService.calcFinancials(project, total);
  const summaryAOA = [
    ['Spark Homes Scope Estimator — Project Summary'],
    [],
    ['Address', project.address],
    ['Property Type', project.propertyType],
    ['Bedrooms', project.bedrooms],
    ['Bathrooms', project.bathrooms],
    ['Square Footage', project.squareFootage || ''],
    [],
    ['Purchase Price', project.purchasePrice || ''],
    ['ARV', project.arv || ''],
    ['Target Margin %', project.targetMarginPct || ''],
    [],
    ['Total Repair Estimate', total],
  ];
  if (financials) {
    summaryAOA.push(['Est. Total Cost (Purchase + Repairs)', financials.totalCost]);
    summaryAOA.push(['Est. Profit', financials.profit]);
    summaryAOA.push(['Est. ROI %', Number(financials.roi.toFixed(1))]);
  }
  summaryAOA.push([]);
  summaryAOA.push(['Generated', new Date().toLocaleString('en-US')]);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAOA);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const categoryRows = categoryTotalsFromRows(rows);
  const categorySheet = XLSX.utils.json_to_sheet(categoryRows.map((c) => ({ Group: c.group, Total: c.total })));
  categorySheet['!cols'] = [{ wch: 26 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, categorySheet, 'By Category');

  const lineItemSheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Room: r.roomName,
      Group: r.groupName,
      Item: r.itemName,
      Unit: r.unit,
      Quantity: r.quantity,
      'Unit Cost': r.unitCost,
      'Line Total': r.lineTotal,
      Custom: r.isCustom ? 'Yes' : '',
      Photos: r.photoCount,
      Equipment: r.equipment ? [r.equipment.manufacturer, r.equipment.model, r.equipment.serialNumber].filter(Boolean).join(' / ') : '',
      Notes: r.notes,
    }))
  );
  lineItemSheet['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 28 }, { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 7 }, { wch: 7 }, { wch: 26 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, lineItemSheet, 'Line Items');

  return wb;
}

export const exportService = {
  async exportExcel(project) {
    const XLSX = await loadXLSX();
    const rows = await gatherLineItems(project);
    const wb = await buildWorkbook(project, rows, XLSX);
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerDownload(blob, `${sanitizeFilename(project.address)}-estimate.xlsx`);
  },

  async exportZip(project, { onProgress } = {}) {
    onProgress?.('Loading export tools…');
    const [XLSX, { default: JSZip }] = await Promise.all([loadXLSX(), loadJSZip()]);

    onProgress?.('Gathering line items…');
    const rows = await gatherLineItems(project);
    const wb = await buildWorkbook(project, rows, XLSX);
    const xlsxArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const zip = new JSZip();
    zip.file('estimate.xlsx', xlsxArrayBuffer);

    onProgress?.('Adding photos…');
    const photosFolder = zip.folder('photos');
    let photoIndex = 1;
    for (const row of rows) {
      if (row.photoCount === 0) continue;
      const photos = await photoRepository.listByRepair(row.repairId);
      const roomFolder = photosFolder.folder(sanitizeFilename(row.roomName));
      for (const photo of photos) {
        const ext = (photo.blob.type || 'image/jpeg').split('/')[1] || 'jpg';
        roomFolder.file(`${sanitizeFilename(row.itemName)}-${photoIndex}.${ext}`, photo.blob);
        photoIndex += 1;
      }
    }

    onProgress?.('Writing project data…');
    const total = rows.reduce((sum, r) => sum + r.lineTotal, 0);
    const progress = await pricingService.calcProjectProgress(project.id);
    zip.file(
      'project.json',
      JSON.stringify(
        {
          project: { ...project },
          totalEstimate: total,
          progress,
          lineItems: rows.map(({ equipment, ...r }) => ({ ...r, equipment: equipment ? { ...equipment } : null })),
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    onProgress?.('Compressing…');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    triggerDownload(blob, `${sanitizeFilename(project.address)}-export.zip`);
  },

  categoryTotalsFromRows,
  gatherLineItems,
};