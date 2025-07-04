import https from 'https';

const spreadsheetId = '1wmjxi3K5rjIYME_lskUvquLbN331YV0vi-kg5VakpdY';

// Obtiene lista de hojas (name + gid)
function getSheetList() {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?headers=1`;
    https.get(url, (res) => {
      let rawData = '';
      res.on('data', (chunk) => (rawData += chunk));
      res.on('end', () => {
        try {
          const match = rawData.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);/);
          if (!match) throw new Error('No se encontró JSON válido');

          const matches = rawData.match(/sheetId":\s*(\d+),\s*"title":\s*"([^"]+)"/g);
          const sheets = matches.map((line) => {
            const gid = line.match(/sheetId":\s*(\d+)/)[1];
            const name = line.match(/"title":\s*"([^"]+)"/)[1];
            return { name, gid };
          });

          resolve(sheets);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// Descarga CSV y lo convierte a JSON con encabezados
function getSheetJSON(gid) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
    https.get(url, (res) => {
      let csv = '';
      res.on('data', (chunk) => (csv += chunk));
      res.on('end', () => {
        const rows = csv
          .trim()
          .split('\n')
          .map((line) => line.split(','));

        const headers = rows[0];
        const data = rows.slice(1).map((row) => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = row[i] || '';
          });
          return obj;
        });

        resolve(data);
      });
    }).on('error', reject);
  });
}

// Exporta función principal
export async function getSleeperADP(prev = false) {
  const sheets = await getSheetList();
  const index = prev ? 2 : 1; // hoja 3 o 2
  if (index >= sheets.length) {
    throw new Error('Índice de hoja fuera de rango');
  }
  const gid = sheets[index].gid;
  return await getSheetJSON(gid);
}
