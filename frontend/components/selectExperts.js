import { fetchExperts } from '../js/api.js';

/**
 * Crea un <select> de expertos y lo convierte en TomSelect
 * @param {string} selector - Selector CSS del input select a inicializar
 * @param {Object} [options] - Opciones de TomSelect adicionales
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

  new TomSelect(selector, {
    placeholder: 'Selecciona un experto...',
    allowEmptyOption: true,
    ...options
  });
}
