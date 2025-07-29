import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as QRCodePNG from 'qrcode';

interface RowData {
  model_name: string;
  lot: string;
  quantity: number;
}

const emptyRow: RowData = { model_name: '', lot: '', quantity: 1 };

const QRCreator: React.FC = () => {
  const [rows, setRows] = useState<RowData[]>([{ ...emptyRow }]);
  const [showQR, setShowQR] = useState<number | null>(null);

  const processBoxColumn = (boxValue: string | number, baseRow: RowData): RowData[] => {
    const results: RowData[] = [];
    
    if (!boxValue) {
      return [baseRow];
    }
    
    const boxStr = String(boxValue).trim();
    
    // กรณีพิเศษ: ถ้า quantity เป็น "-" และ box เป็นตัวเลข 
    // ให้สร้าง 1 row โดยใช้ค่า box เป็น quantity
    if (baseRow.quantity === 0 || String(baseRow.quantity) === '-' || baseRow.quantity < 0) {
      const boxAsQuantity = parseInt(boxStr);
      if (!isNaN(boxAsQuantity) && boxAsQuantity > 0) {
        return [{
          ...baseRow,
          quantity: boxAsQuantity
        }];
      }
    }
    
    // ตรวจสอบว่าเป็นรูปแบบ "10+2000" หรือไม่
    if (boxStr.includes('+')) {
      const parts = boxStr.split('+');
      if (parts.length === 2) {
        const firstCount = parseInt(parts[0].trim());
        const secondQuantity = parseInt(parts[1].trim());
        
        if (!isNaN(firstCount) && !isNaN(secondQuantity)) {
          // สร้าง row ซ้ำตามจำนวนแรก (เช่น 10 ครั้ง)
          for (let i = 0; i < firstCount; i++) {
            results.push({ ...baseRow });
          }
          
          // สร้าง row เพิ่มเติม 1 อันโดยใส่จำนวนเป็นตัวเลขที่สอง (เช่น 2000)
          results.push({
            ...baseRow,
            quantity: secondQuantity
          });
          
          return results;
        }
      }
    }
    
    // ถ้าเป็นตัวเลขธรรมดา ให้สร้าง row ซ้ำตามจำนวนนั้น
    const boxCount = parseInt(boxStr);
    if (!isNaN(boxCount) && boxCount > 0) {
      for (let i = 0; i < boxCount; i++) {
        results.push({ ...baseRow });
      }
      return results;
    }
    
    // ถ้าไม่ใช่ตัวเลข ให้ return row เดิม
    return [baseRow];
  };

  const handleExcelImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet) as any[];

      const processedRows: RowData[] = [];
      
      json.forEach(row => {
        // จัดการค่า Qty ที่อาจเป็น "-" หรือค่าอื่นๆ
        let quantity = 1;
        if (row.Qty) {
          const qtyStr = String(row.Qty).trim();
          if (qtyStr === '-' || qtyStr === '') {
            quantity = 0; // ใช้ 0 เป็นสัญญาณว่าให้ใช้ค่าจาก Box แทน
          } else {
            // ลบ comma ออกจากตัวเลข เช่น "18,000" -> "18000"
            const cleanQty = qtyStr.replace(/,/g, '');
            const parsedQty = Number(cleanQty);
            quantity = !isNaN(parsedQty) ? parsedQty : 1;
          }
        }

        const baseRow: RowData = {
          model_name: row.Item ? String(row.Item) : '',
          lot: row.Lot ? String(row.Lot) : '',
          quantity: quantity,
        };
        
        // ประมวลผล column Box
        const boxValue = row.Box || row.box || row.BOX;
        const expandedRows = processBoxColumn(boxValue, baseRow);
        processedRows.push(...expandedRows);
      });
      
      setRows(processedRows.length > 0 ? processedRows : [{ ...emptyRow }]);
      
      // Reset input value เพื่อให้สามารถ import ไฟล์เดิมได้อีก
      event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCSVImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      
      // ปรับปรุงการ parse CSV เพื่อจัดการกับ quotes และ comma ภายในเซลล์
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            // ตรวจสอบ double quotes ("")
            if (line[i + 1] === '"') {
              current += '"';
              i++; // skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        
        result.push(current.trim());
        return result;
      };
      
      const lines = csv.split(/\r?\n/);
      const headers = parseCSVLine(lines[0]);
      const dataRows = lines.slice(1).filter(line => line.trim() !== '');

      const processedRows: RowData[] = [];

      dataRows.forEach(line => {
        const row = parseCSVLine(line);
        const rowDataItem: { [key: string]: string } = {};
        
        headers.forEach((header, index) => {
          // ลบ quotes ออกจากข้อมูลถ้ามี
          let value = row[index] || '';
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }
          rowDataItem[header.trim()] = value.trim();
        });

        // จัดการค่า Qty ที่อาจเป็น "-" หรือค่าอื่นๆ
        let quantity = 1;
        if (rowDataItem.Qty) {
          const qtyStr = String(rowDataItem.Qty).trim();
          if (qtyStr === '-' || qtyStr === '') {
            quantity = 0; // ใช้ 0 เป็นสัญญาณว่าให้ใช้ค่าจาก Box แทน
          } else {
            // ลบ comma ออกจากตัวเลข เช่น "47,800" -> "47800"
            const cleanQty = qtyStr.replace(/,/g, '');
            const parsedQty = Number(cleanQty);
            quantity = !isNaN(parsedQty) ? parsedQty : 1;
          }
        }

        const baseRow: RowData = {
          model_name: rowDataItem.Item ? String(rowDataItem.Item) : '',
          lot: rowDataItem.Lot ? String(rowDataItem.Lot) : '',
          quantity: quantity,
        };
        
        // ประมวลผล column Box
        const boxValue = rowDataItem.Box || rowDataItem.box || rowDataItem.BOX;
        const expandedRows = processBoxColumn(boxValue, baseRow);
        processedRows.push(...expandedRows);
      });
      
      setRows(processedRows.length > 0 ? processedRows : [{ ...emptyRow }]);
      
      // Reset input value เพื่อให้สามารถ import ไฟล์เดิมได้อีก
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleChange = (idx: number, field: keyof RowData, value: string) => {
    const newRows = [...rows];
    if (field === 'quantity') {
      newRows[idx][field] = Number(value);
    } else {
      newRows[idx][field] = value;
    }
    setRows(newRows);
  };

  const addRow = () => setRows([...rows, { ...emptyRow }]);
  const removeRow = (idx: number) => {
    if (rows.length === 1) {
      setRows([{ ...emptyRow }]);
      setShowQR(null);
    } else {
      setRows(rows.filter((_, i) => i !== idx));
      if (showQR === idx) setShowQR(null);
    }
  };

  const getQRValue = (row: RowData) => {
    return JSON.stringify(row);
  };

  const downloadQR = async (idx: number) => {
    const qrValue = getQRValue(rows[idx]);
    const dataUrl = await QRCodePNG.toDataURL(qrValue, { errorCorrectionLevel: 'H', width: 300 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qrcode_${idx + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllQR = async () => {
    const zip = new JSZip();
    for (let idx = 0; idx < rows.length; idx++) {
      const qrValue = getQRValue(rows[idx]);
      const dataUrl = await QRCodePNG.toDataURL(qrValue, { errorCorrectionLevel: 'H', width: 300 });
      const base64 = dataUrl.split(',')[1];
      const safeModel = rows[idx].model_name.replace(/[^a-zA-Z0-9ก-๙_.-]/g, '_');
      const safeLot = rows[idx].lot.replace(/[^a-zA-Z0-9ก-๙_.-]/g, '_');
      const fileName = `${idx + 1}_${safeModel}_${safeLot}.png`;
      zip.file(fileName, base64, { base64: true });
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'qrcodes.zip');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #f8fafc 100%)', fontFamily: 'Sarabun, sans-serif', padding: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ maxWidth: 1300, minWidth: 900, width: '100%', margin: '32px auto 0 auto', padding: 0, paddingBottom: 32 }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
          @media (max-width: 700px) {
            table { font-size: 14px; min-width: 340px; }
            th, td { padding: 6px !important; }
            .qr-btn, .add-btn, .download-btn, .import-btn, .delete-btn { font-size: 15px !important; padding: 8px 16px !important; }
          }
          table {
            border: 1.5px solid #e0e0e0;
            border-radius: 12px;
            overflow: hidden;
          }
          th, td {
            border: 1.5px solid #e0e0e0;
          }
          th { background: #e3f2fd; }
          input, .qr-btn, .add-btn, .download-btn, .import-btn, .delete-btn {
            transition: box-shadow 0.2s, background 0.2s, border 0.2s, transform 0.15s;
          }
          input:focus {
            outline: none;
            border: 1.5px solid #1976d2;
            box-shadow: 0 0 0 2px #1976d233;
          }
          .qr-btn:hover, .add-btn:hover, .download-btn:hover, .import-btn:hover {
            box-shadow: 0 4px 16px #1976d244;
            filter: brightness(1.08);
            transform: translateY(-2px) scale(1.03);
          }
          .delete-btn:hover {
            box-shadow: 0 4px 16px #d32f2f44;
            filter: brightness(1.08);
            transform: translateY(-2px) scale(1.03);
          }
          input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input[type=number] {
            -moz-appearance: textfield;
          }
        `}</style>
        <div style={{ background: '#fff', borderRadius: 32, boxShadow: '0 8px 32px #1976d222', padding: '36px 24px 28px 24px', marginBottom: 40, width: '100%', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 8 }}>
            <input type="file" id="excelFileInput" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelImport} />
            <button onClick={() => document.getElementById('excelFileInput')?.click()} className="import-btn" style={{ background: 'linear-gradient(90deg, #4CAF50 60%, #81C784 100%)', color: '#fff', border: 'none', borderRadius: 20, padding: '14px 36px', fontSize: 20, fontWeight: 700, boxShadow: '0 2px 12px #4CAF5033', cursor: 'pointer', minWidth: 180, marginRight: 16 }}>Import Excel</button>
            <input type="file" id="csvFileInput" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
            <button onClick={() => document.getElementById('csvFileInput')?.click()} className="import-btn" style={{ background: 'linear-gradient(90deg, #FFC107 60%, #FFD54F 100%)', color: '#fff', border: 'none', borderRadius: 20, padding: '14px 36px', fontSize: 20, fontWeight: 700, boxShadow: '0 2px 12px #FFC10733', cursor: 'pointer', minWidth: 180 }}>Import CSV</button>
          </div>
          <h1 style={{ color: '#1976d2', fontWeight: 700, fontSize: 36, marginBottom: 32, letterSpacing: 1, textAlign: 'center' }}>สร้าง QR Code สำหรับ Stock</h1>
          <div style={{ overflowX: 'auto', borderRadius: 24, marginBottom: 32 }}>
            <table style={{ width: '100%', fontSize: 22, borderCollapse: 'separate', borderSpacing: '0 16px', minWidth: 1100 }}>
              <thead style={{ background: '#e3f2fd' }}>
                <tr>
                  <th style={{ padding: 18, textAlign: 'center', borderRadius: 10 }}>ลำดับ</th>
                  <th style={{ padding: 18, textAlign: 'center', borderRadius: 10 }}>ชื่อโมเดล</th>
                  <th style={{ padding: 18, textAlign: 'center', borderRadius: 10 }}>ล็อต</th>
                  <th style={{ padding: 18, textAlign: 'center', borderRadius: 10 }}>จำนวน</th>
                  <th style={{ padding: 12 }}></th>
                  <th style={{ padding: 12 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <React.Fragment key={idx}>
                    <tr style={{ background: idx % 2 ? '#f5fafd' : '#fff', boxShadow: '0 1px 4px #0001', borderRadius: 12 }}>
                      <td style={{ padding: 18, textAlign: 'center', verticalAlign: 'middle', fontWeight: 600, fontSize: 24 }}>{idx + 1}</td>
                      <td style={{ padding: 18, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input value={row.model_name} onChange={e => handleChange(idx, 'model_name', e.target.value)} style={{ width: 260, padding: '16px 24px', border: '1.5px solid #e3e3e3', borderRadius: 18, boxShadow: '0 1px 4px #0001', fontSize: 22, textAlign: 'center', background: '#f8fafc' }} />
                      </td>
                      <td style={{ padding: 18, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input value={row.lot} onChange={e => handleChange(idx, 'lot', e.target.value)} style={{ width: 200, padding: '16px 24px', border: '1.5px solid #e3e3e3', borderRadius: 18, boxShadow: '0 1px 4px #0001', fontSize: 22, textAlign: 'center', background: '#f8fafc' }} />
                      </td>
                      <td style={{ padding: 18, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input type="number" min={0} value={row.quantity} onChange={e => handleChange(idx, 'quantity', e.target.value)} style={{ width: 120, padding: '16px 24px', border: '1.5px solid #e3e3e3', borderRadius: 18, boxShadow: '0 1px 4px #0001', fontSize: 22, textAlign: 'center', background: '#f8fafc' }} />
                      </td>
                      <td style={{ padding: 18, textAlign: 'center', verticalAlign: 'middle' }}>
                        <button
                          onClick={() => setShowQR(idx)}
                          className="qr-btn"
                          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 28, padding: '16px 36px', fontWeight: 700, cursor: 'pointer', fontSize: 22, minWidth: 120, boxShadow: '0 2px 8px #1976d233' }}
                        >
                          สร้าง QR
                        </button>
                      </td>
                      <td style={{ padding: 18, textAlign: 'center', verticalAlign: 'middle' }}>
                        <button onClick={() => removeRow(idx)} className="delete-btn" style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 28, padding: '16px 36px', fontWeight: 700, cursor: 'pointer', fontSize: 22, minWidth: 100, boxShadow: '0 2px 8px #d32f2f33' }}>ลบ</button>
                      </td>
                    </tr>
                    {showQR === idx && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 36, background: '#f1f8e9', borderRadius: 24 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                            <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 2px 16px #388e3c22', padding: 28, marginBottom: 16, display: 'inline-block' }}>
                              <QRCode id={`qr-svg-${idx}`} value={getQRValue(row)} size={220} />
                            </div>
                            <button onClick={() => downloadQR(idx)} className="download-btn" style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 20, padding: '16px 48px', fontWeight: 600, cursor: 'pointer', fontSize: 20, boxShadow: '0 2px 12px #388e3c33' }}>ดาวน์โหลด QR</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginTop: 32, justifyContent: 'center' }}>
            <button onClick={addRow} className="add-btn" style={{ background: 'linear-gradient(90deg, #1976d2 60%, #42a5f5 100%)', color: '#fff', border: 'none', borderRadius: 20, padding: '18px 48px', fontSize: 22, fontWeight: 700, boxShadow: '0 2px 12px #1976d233', cursor: 'pointer', minWidth: 160 }}>เพิ่มแถว</button>
            <button onClick={handleDownloadAllQR} className="download-btn" style={{ background: 'linear-gradient(90deg, #388e3c 60%, #81C784 100%)', color: '#fff', border: 'none', borderRadius: 20, padding: '18px 48px', fontSize: 22, fontWeight: 700, boxShadow: '0 2px 12px #388e3c33', cursor: 'pointer', minWidth: 260 }}>ดาวน์โหลด QR ทั้งหมด (ZIP)</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCreator;
