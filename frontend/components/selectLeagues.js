import { fetchLeagues } from '../js/api.js';

/**
 * Crea un <select> de ligas y lo convierte en TomSelect
 * @param {string} selector - Selector CSS del input select a inicializar
 * @param {Object} [options] - Opciones de TomSelect adicionales
 */
export async function renderLeagueSelect(selector, options = {}) {
  try {
    const leagues = await fetchLeagues();
    const selectElement = document.querySelector(selector);
    if (!selectElement) return;

    selectElement.innerHTML = '<option value="">Selecciona una liga</option>';

    leagues.forEach(league => {
      const opt = document.createElement('option');
      opt.value = league.league_id;
      opt.textContent = league.name;
      selectElement.appendChild(opt);
    });

    selectElement.tomselect = new TomSelect(selector, {
      placeholder: 'Selecciona una liga...',
      allowEmptyOption: true,
      create: false,
      persist: false,
      plugins: ['dropdown_input'],
      dropdownInput: false,
      ...options
    });
  } catch (err) {
    console.error('Error al cargar ligas:', err);
  }
}
