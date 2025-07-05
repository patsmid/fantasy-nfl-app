import { fetchExperts } from '../js/api.js';

/**
 * Crea un <select> de expertos y lo convierte en TomSelect
 * @param {string} selector - Selector CSS del input select a inicializar
 * @param {Object} [options] - Opciones de TomSelect adicionales
 */
export async function renderExpertSelect(selector, options = {}) {
  const res = await fetchExperts();

  if (!res.success || !Array.isArray(res.data)) {
    console.error('Error al obtener expertos:', res.error || 'Sin datos');
    return;
  }

  const selectElement = document.querySelector(selector);
  if (!selectElement) return;

  // Limpiar opciones previas
  selectElement.innerHTML = '<option value="">Selecciona un experto</option>';

  res.data.forEach(expert => {
    const opt = document.createElement('option');
    opt.value = expert.id;
    opt.textContent = expert.name;
    selectElement.appendChild(opt);
  });

  new TomSelect(selector, {
    placeholder: 'Selecciona un experto...',
    allowEmptyOption: true,
    ...options
  });
}
