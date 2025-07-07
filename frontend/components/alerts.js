export function showSuccess(message = '¡Operación exitosa!') {
  Swal.fire({
    icon: 'success',
    title: 'Éxito',
    text: message,
    timer: 2000,
    showConfirmButton: false
  });
}

export function showError(message = 'Ocurrió un error inesperado') {
  Swal.fire({
    icon: 'error',
    title: 'Error',
    text: message
  });
}

export function showConfirm({
  title = '¿Estás seguro?',
  text = '',
  confirmButtonText = 'Sí',
  cancelButtonText = 'Cancelar'
} = {}) {
  return Swal.fire({
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6c757d',
    confirmButtonText,
    cancelButtonText
  });
}

export function showLoadingBar(title = 'Cargando...', text = 'Esto puede tardar unos segundos') {
  Swal.fire({
    title: `<span style="color: var(--text-primary); font-size: 1.1rem;">${title}</span>`,
    html: `
      <p style="color: var(--text-secondary); font-size: 0.95rem;">${text}</p>
      <div class="progress mt-3" style="height: 18px; background-color: var(--border); border-radius: 10px;">
        <div class="progress-bar progress-bar-striped progress-bar-animated"
             role="progressbar"
             style="
               width: 100%;
               background-color: var(--accent);
               border-radius: 10px;">
        </div>
      </div>
    `,
    background: 'var(--bg-secondary)',
    allowOutsideClick: false,
    showConfirmButton: false,
    customClass: {
      popup: 'swal2-flock-loading'
    },
    didOpen: () => Swal.showLoading()
  });
}
