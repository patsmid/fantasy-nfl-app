import axios from 'axios';

const https = require("https");
const http = require("http");
const url = require("url");

const spreadsheetId = "1wmjxi3K5rjIYME_lskUvquLbN331YV0vi-kg5VakpdY";

export async function getSleeperLeague(leagueId) {
  const { data } = await axios.get(`https://api.sleeper.app/v1/league/${leagueId}`);
  return data;
}

export async function getLeagueDraft(draftId) {
  const { data } = await axios.get(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
  return data;
}

/**
 * Obtiene la lista de hojas (nombre y gid)
 */
function getSheetList() {
  return new Promise((resolve, reject) => {
    const sheetMetaUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?headers=1`;
    https.get(sheetMetaUrl, (res) => {
      let rawData = "";
      res.on("data", (chunk) => (rawData += chunk));
      res.on("end", () => {
        try {
          const match = rawData.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);/);
          if (!match) throw new Error("No se encontró JSON válido");

          const json = JSON.parse(match[1]);
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
    }).on("error", reject);
  });
}

/**
 * Descarga CSV de una hoja pública dado el gid
 */
function getSheetCSV(gid) {
  return new Promise((resolve, reject) => {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
    https.get(csvUrl, (res) => {
      let csv = "";
      res.on("data", (chunk) => (csv += chunk));
      res.on("end", () => {
        const rows = csv
          .trim()
          .split("\n")
          .map((row) => row.split(","));
        resolve(rows);
      });
    }).on("error", reject);
  });
}

/**
 * Devuelve los datos de la hoja por índice (0 = primera hoja)
 */
async function getSheetByIndex(index) {
  const sheets = await getSheetList();
  if (index >= sheets.length) throw new Error("Índice fuera de rango");
  const gid = sheets[index].gid;
  return await getSheetCSV(gid);
}

// Servidor HTTP básico
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const match = parsedUrl.pathname.match(/^\/sheet\/(\d)$/);

  if (match) {
    const index = parseInt(match[1], 10) - 1;

    try {
      const data = await getSheetByIndex(index);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Error: " + err.message);
    }
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Ruta no encontrada. Usa /sheet/2 o /sheet/3");
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
