import { fetchExperts } from '../js/api.js';

/**
 * Crea un <select> de expertos y lo convierte en TomSelect
 * @param {string} selector - Selector CSS del select
 * @param {Object} [options] - Opciones adicionales para TomSelect
 */
export async function renderExpertSelect(selector, options = {}) {
  const experts = await fetchExperts();
  const selectElement = document.querySelector(selector);
  if (!selectElement) return;

  // Limpiar opciones previas
  selectElement.innerHTML = '<option value="">Selecciona un experto</option>';

  experts.forEach(expert => {
    const opt = document.createElement('option');
    opt.value = expert.id_experto;
    opt.textContent = expert.experto;
    selectElement.appendChild(opt);
  });

  // Inicializar y guardar instancia en el DOM
  selectElement.tomselect = new TomSelect(selector, {
    placeholder: 'Selecciona un experto...',
    allowEmptyOption: true,
    ...options
  });
}
