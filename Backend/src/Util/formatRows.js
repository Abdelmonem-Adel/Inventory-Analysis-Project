

export function formatRows(rows, sheetName = null) {
  if (!rows || rows.length === 0) return [];
  const headers = rows[0];

  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      // توحيد اسماء الأعمدة بدون مسافات
      const key = String(h).replace(/\s/g, '').toLowerCase();
      obj[key] = row[i];
      // إضافة نسخة أصلية من Final QTY
      if (key.includes('finalqty')) {
        obj['finalqty'] = row[i];
        obj['FinalQTY'] = row[i];
        obj['finalQtyOriginal'] = row[i];
        console.log(`[FORMAT DEBUG] Final QTY column: ${h}, value: ${row[i]}`);
      }
      // دعم اسم العمود بالمسافة كما هو في الشيت
      if (String(h).trim() === 'Final QTY') {
        obj['Final QTY'] = row[i];
        obj['FinalQTY'] = row[i];
        obj['finalqty'] = row[i];
        obj['finalQtyOriginal'] = row[i];
        console.log(`[FORMAT DEBUG] (EXACT) Final QTY column: ${h}, value: ${row[i]}`);
      }
    });
    if (sheetName) obj._sheetName = sheetName;
    return obj;
  });
}
