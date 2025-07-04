/**
 * Realiza un fetch con timeout configurable
 * @param {string} url
 * @param {object} options
 * @param {number} timeout en milisegundos
 */
export async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);

    if (!res.ok) throw new Error(`Error: ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(id);

    if (err.name === 'AbortError') {
      Swal.fire({
        icon: 'info',
        title: 'Servidor en reposo',
        text: 'Render puede tardar unos segundos en activarse. Intenta nuevamente en breve.',
        confirmButtonText: 'Aceptar'
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error de conexión',
        text: err.message,
        confirmButtonText: 'Cerrar'
      });
    }

    throw err; // opcional: propaga el error si necesitas manejarlo en el caller
  }
}
