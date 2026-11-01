import { requestGoogle } from './googleWorkspaceRequest.js';

const BASE_SHEETS = 'https://sheets.googleapis.com/v4';

export async function buatSpreadsheetDenganData(accessToken, { judul, values }) {
  const spreadsheetTitle = typeof judul === 'string' ? judul.trim() : '';
  if (!spreadsheetTitle || spreadsheetTitle.length > 120) {
    throw new TypeError('Judul spreadsheet harus diisi dan maksimal 120 karakter.');
  }
  if (!Array.isArray(values) || values.length === 0 || values.length > 500) {
    throw new TypeError('Data spreadsheet harus berisi 1 sampai 500 baris.');
  }
  if (!values.every((row) => Array.isArray(row) && row.length > 0 && row.length <= 20)) {
    throw new TypeError('Setiap baris spreadsheet harus berisi 1 sampai 20 kolom.');
  }
  const cellCount = values.reduce((total, row) => total + row.length, 0);
  if (cellCount > 5000 || values.some((row) => row.some((cell) => (
    typeof cell !== 'string' || cell.length > 2000
  )))) {
    throw new TypeError('Data spreadsheet melebihi batas 5.000 sel atau 2.000 karakter per sel.');
  }

  const spreadsheet = await requestGoogle(`${BASE_SHEETS}/spreadsheets`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: spreadsheetTitle },
      sheets: [{ properties: { title: 'Data' } }],
    }),
  });
  const sheet = spreadsheet.sheets?.[0]?.properties;
  if (typeof spreadsheet.spreadsheetId !== 'string' || !spreadsheet.spreadsheetId ||
      !Number.isInteger(sheet?.sheetId)) {
    throw new Error('Google Sheets tidak mengembalikan identitas spreadsheet yang valid.');
  }

  let spreadsheetUrl = spreadsheet.spreadsheetUrl ||
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheet.spreadsheetId)}/edit`;
  try {
    const parsedUrl = new URL(spreadsheetUrl);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'docs.google.com') {
      throw new Error('Google Sheets mengembalikan alamat spreadsheet yang tidak aman.');
    }
    spreadsheetUrl = parsedUrl.href;
  } catch (error) {
    if (error.message === 'Google Sheets mengembalikan alamat spreadsheet yang tidak aman.') {
      throw error;
    }
    throw new Error('Google Sheets mengembalikan alamat spreadsheet yang tidak valid.', { cause: error });
  }

  try {
    await requestGoogle(
      `${BASE_SHEETS}/spreadsheets/${encodeURIComponent(spreadsheet.spreadsheetId)}/values/Data!A1?valueInputOption=RAW`,
      accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ majorDimension: 'ROWS', values }),
      },
    );
  } catch (error) {
    throw new Error(
      'Spreadsheet kosong sudah dibuat, tetapi data gagal ditulis. Periksa Google Sheets sebelum mencoba ulang.',
      { cause: error },
    );
  }
  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl,
  };
}
