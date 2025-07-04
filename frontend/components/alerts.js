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
