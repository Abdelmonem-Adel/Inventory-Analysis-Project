

export function formatRows(rows, sheetName = null) {
  if (!rows || rows.length === 0) return [];
  const headers = rows[0];

  return rows.slice(1).map(row => {
    const obj = Object.fromEntries(
      headers.map((h, i) => [h, row[i]])
    );
    if (sheetName) obj._sheetName = sheetName;
    return obj;
  });
}
