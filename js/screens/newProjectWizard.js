import { projectRepository } from '../repositories/projectRepository.js';
import { icons } from '../core/icons.js';

export function openNewProjectWizard({ onCreated }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <h2>New Project</h2>
        <button class="btn btn-icon" data-act="close" aria-label="Close">${icons.close}</button>
      </div>
      <form id="new-project-form">
        <div class="field">
          <label for="address">Property address</label>
          <input class="input" id="address" name="address" placeholder="1422 Elm Street" required autofocus />
        </div>
        <div class="field">
          <label for="propertyType">Property type</label>
          <select class="input" id="propertyType" name="propertyType">
            <option value="single_family">Single Family</option>
            <option value="duplex">Duplex</option>
            <option value="townhouse">Townhouse</option>
            <option value="multi_family">Multi-Family</option>
          </select>
        </div>
        <div class="input-row">
          <div class="field">
            <label for="bedrooms">Bedrooms</label>
            <input class="input" id="bedrooms" name="bedrooms" type="number" min="0" max="12" value="3" />
          </div>
          <div class="field">
            <label for="bathrooms">Bathrooms</label>
            <input class="input" id="bathrooms" name="bathrooms" type="number" min="1" max="8" value="2" />
          </div>
        </div>
        <div class="input-row">
          <div class="field">
            <label for="squareFootage">Square footage</label>
            <input class="input" id="squareFootage" name="squareFootage" type="number" min="0" placeholder="1450" />
          </div>
          <div class="field">
            <label for="garage">Garage</label>
            <select class="input" id="garage" name="garage">
              <option value="false">None</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>
        <div class="input-row">
          <div class="field">
            <label for="purchasePrice">Purchase price</label>
            <input class="input" id="purchasePrice" name="purchasePrice" type="number" min="0" placeholder="145000" />
          </div>
          <div class="field">
            <label for="arv">ARV</label>
            <input class="input" id="arv" name="arv" type="number" min="0" placeholder="245000" />
          </div>
        </div>
        <div class="field">
          <label for="targetMarginPct">Target profit margin (%)</label>
          <input class="input" id="targetMarginPct" name="targetMarginPct" type="number" min="0" max="100" value="20" />
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary btn-block" data-act="close">Cancel</button>
          <button type="submit" class="btn btn-primary btn-block">Create Project</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-act="close"]').forEach((btn) => btn.addEventListener('click', close));

  backdrop.querySelector('#new-project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    await projectRepository.create({
      address: data.get('address'),
      propertyType: data.get('propertyType'),
      bedrooms: parseInt(data.get('bedrooms'), 10) || 0,
      bathrooms: parseInt(data.get('bathrooms'), 10) || 1,
      garage: data.get('garage') === 'true',
      squareFootage: data.get('squareFootage') ? parseInt(data.get('squareFootage'), 10) : null,
      purchasePrice: data.get('purchasePrice') ? parseFloat(data.get('purchasePrice')) : null,
      arv: data.get('arv') ? parseFloat(data.get('arv')) : null,
      targetMarginPct: parseFloat(data.get('targetMarginPct')) || 20,
    });
    close();
    onCreated();
  });
}
