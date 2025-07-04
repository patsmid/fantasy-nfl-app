export function getMexicoCityISOString() {
  const date = new Date();

  const options = {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };

  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const getPart = type => parts.find(p => p.type === type)?.value.padStart(2, '0');

  const yyyy = getPart('year');
  const MM = getPart('month');
  const dd = getPart('day');
  const hh = getPart('hour');
  const mm = getPart('minute');
  const ss = getPart('second');

  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}-06:00`; // Hora estándar México
}

export function formatDateToMexico(dateString) {
  const options = {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };

  return new Intl.DateTimeFormat('es-MX', options).format(new Date(dateString));
}
