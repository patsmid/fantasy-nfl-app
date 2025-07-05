import { fetchLeagues } from '../api.js';

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
      opt.textContent = `${league.name} (${league.season})`;
      selectElement.appendChild(opt);
    });

    new TomSelect(selector, {
      placeholder: 'Selecciona una liga...',
      allowEmptyOption: true,
      ...options
    });
  } catch (err) {
    console.error('Error al cargar ligas:', err);
  }
}
