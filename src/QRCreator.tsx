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
    } else {
      setRows(rows.filter((_, i) => i !== idx));
    }
  };

  const getQRValue = (row: RowData) => {
    return JSON.stringify(row);
  };

  const downloadQR = (idx: number) => {
    const svg = document.getElementById(`qr-svg-${idx}`);
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qrcode_${idx}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllQR = async () => {
    const zip = new JSZip();
    for (let idx = 0; idx < rows.length; idx++) {
      const qrValue = JSON.stringify(rows[idx]);
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
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #ffffff 100%)', fontFamily: 'Sarabun, sans-serif', padding: 0 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <style>{`
          @media (max-width: 700px) {
            table { font-size: 14px; min-width: 400px; }
            th, td { padding: 6px !important; }
          }
        `}</style>
        <h1 style={{ color: '#1976d2', fontWeight: 700, fontSize: 32, marginBottom: 16 }}>สร้าง QR Code สำหรับ Stock</h1>
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px #0001', padding: 0, marginBottom: 24 }}>
          <table style={{ width: '100%', fontSize: 16, borderCollapse: 'collapse', minWidth: 600 }}>
            <thead style={{ background: '#e3f2fd' }}>
              <tr>
                <th style={{ padding: 12 }}>ลำดับ</th>
                <th style={{ padding: 12 }}>ชื่อโมเดล</th>
                <th style={{ padding: 12 }}>ล็อต</th>
                <th style={{ padding: 12 }}>จำนวน</th>
                <th style={{ padding: 12 }}></th>
                <th style={{ padding: 12 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <React.Fragment key={idx}>
                  <tr style={{ background: idx % 2 ? '#f5fafd' : undefined }}>
                    <td style={{ padding: 10, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ padding: 10 }}>
                      <input value={row.model_name} onChange={e => handleChange(idx, 'model_name', e.target.value)} style={{ width: '100%' }} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <input value={row.lot} onChange={e => handleChange(idx, 'lot', e.target.value)} style={{ width: '100%' }} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <input type="number" min={1} value={row.quantity} onChange={e => handleChange(idx, 'quantity', e.target.value)} style={{ width: 80 }} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <button
                        onClick={() => setShowQR(idx)}
                        style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        สร้าง QR Code
                      </button>
                    </td>
                    <td style={{ padding: 10 }}>
                      <button onClick={() => removeRow(idx)} style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 600, cursor: 'pointer' }}>ลบ</button>
                    </td>
                  </tr>
                  {showQR === idx && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 16 }}>
                        <QRCode id={`qr-svg-${idx}`} value={getQRValue(row)} size={128} />
                        <div style={{ marginTop: 8 }}>
                          <button onClick={() => downloadQR(idx)} style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 600, cursor: 'pointer' }}>ดาวน์โหลด QR</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} style={{ background: 'linear-gradient(90deg, #1976d2 60%, #42a5f5 100%)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 32px', fontSize: 18, fontWeight: 600, boxShadow: '0 2px 8px #1976d233', marginBottom: 24, cursor: 'pointer' }}>+ เพิ่มแถว</button>
        <button
          onClick={handleDownloadAllQR}
          style={{
            background: 'linear-gradient(90deg, #388e3c 60%, #81C784 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 32px',
            fontSize: 18,
            fontWeight: 600,
            boxShadow: '0 2px 8px #388e3c33',
            marginBottom: 24,
            cursor: 'pointer',
            display: 'inline-block',
            marginLeft: '16px',
          }}
        >
          ดาวน์โหลด QR ทั้งหมด (ZIP)
        </button>
        <input
          type="file"
          id="excelFileInput"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleExcelImport}
        />
        <button
          onClick={() => document.getElementById('excelFileInput')?.click()}
          style={{
            background: 'linear-gradient(90deg, #4CAF50 60%, #81C784 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 32px',
            fontSize: 18,
            fontWeight: 600,
            boxShadow: '0 2px 8px #4CAF5033',
            marginBottom: 24,
            cursor: 'pointer',
            display: 'inline-block',
            marginLeft: '16px',
          }}
        >Import Excel</button>
        <input
          type="file"
          id="csvFileInput"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={handleCSVImport}
        />
        <button
          onClick={() => document.getElementById('csvFileInput')?.click()}
          style={{
            background: 'linear-gradient(90deg, #FFC107 60%, #FFD54F 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 32px',
            fontSize: 18,
            fontWeight: 600,
            boxShadow: '0 2px 8px #FFC10733',
            marginBottom: 24,
            cursor: 'pointer',
            display: 'inline-block',
            marginLeft: '16px',
          }}
        >Import CSV</button>
      </div>
    </div>
  );
};

export default QRCreator; 