import dropdown_input from 'tom-select/plugins/dropdown_input/plugin.js';
import { fetchExperts } from '../js/api.js';

export async function renderExpertSelect(selector, options = {}) {
  const experts = await fetchExperts();
  const selectElement = document.querySelector(selector);
  if (!selectElement) return;

  selectElement.innerHTML = '<option value="">Selecciona un experto</option>';

  experts.forEach(expert => {
    const opt = document.createElement('option');
    opt.value = expert.id_experto;
    opt.textContent = expert.experto;
    selectElement.appendChild(opt);
  });

  selectElement.tomselect = new TomSelect(selector, {
    placeholder: 'Selecciona un experto...',
    allowEmptyOption: true,
    create: false,
    persist: false,
    plugins: ['dropdown_input'],
    dropdownInput: false,
    ...options
  });
}
