import { fetchExperts } from '../js/api.js';

export async function renderExpertSelect(selector, options = {}) {
  const experts = await fetchExperts();
  const selectElement = document.querySelector(selector);
  if (!selectElement) return;

  selectElement.innerHTML = '<option value="">Selecciona un experto</option>';

  // Ordenar por display_order
  experts
    .sort((a, b) => {
      if (a.display_order === null) return 1;
      if (b.display_order === null) return -1;
      return a.display_order - b.display_order;
    })
    .forEach(expert => {
      const opt = document.createElement('option');
      opt.value = expert.source === 'flock' ? expert.experto : expert.id_experto;
      opt.textContent = `${expert.experto}`;
      opt.dataset.source = expert.source || ''; // <- Aquí se agrega el data-source
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
