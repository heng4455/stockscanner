import React, { useState, useRef } from 'react';
import QRCode from 'react-qr-code';
import * as XLSX from 'xlsx';

interface RowData {
  model_name: string;
  lot: string;
  quantity: number;
  erp: string;
}

const emptyRow: RowData = { model_name: '', lot: '', quantity: 1, erp: '' };

const QRPrintLayout: React.FC = () => {
  const [rows, setRows] = useState<RowData[]>([{ ...emptyRow }]);
  const printRef = useRef<HTMLDivElement>(null);

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
          erp: row.ERP ? String(row.ERP) : '',
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
          erp: rowDataItem.ERP ? String(rowDataItem.ERP) : '',
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

  const clearAllRows = () => {
    setRows([{ ...emptyRow }]);
    
    // Reset input values เพื่อให้สามารถ import ไฟล์เดิมได้อีก
    const excelInput = document.getElementById('excelFileInput') as HTMLInputElement;
    const csvInput = document.getElementById('csvFileInput') as HTMLInputElement;
    if (excelInput) excelInput.value = '';
    if (csvInput) csvInput.value = '';
  };

  const getQRValue = (row: RowData) => {
    return JSON.stringify(row);
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>QR Code Sticker Print</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 1.4cm 0.8cm 1.1cm 0.9cm;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-container {
              width: 100%;
              height: 100%;
            }
            .qr-grid {
              display: grid;
              grid-template-columns: repeat(3, 6.3cm);
              grid-template-rows: repeat(8, 3.4cm);
              gap: 0mm 0.2cm;
              width: 100%;
              height: 100%;
              box-sizing: border-box;
            }
            .qr-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              border: 1px dashed #ccc;
              padding: 1mm;
              box-sizing: border-box;
              page-break-inside: avoid;
              width: 6.3cm;
              height: 3.4cm;
              position: relative;
            }
            .qr-code {
              width: 1.5cm;
              height: 1.5cm;
              margin: 0;
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            }
            .qr-text {
              font-size: 6px;
              text-align: center;
              line-height: 0.9;
              position: absolute;
              bottom: 1mm;
              left: 50%;
              transform: translateX(-50%);
              width: 5cm;
            }
            .qr-number {
              font-weight: bold;
              font-size: 12px;
              margin: 0;
              position: absolute;
              top: 3mm;
              left: 3mm;
            }
            .qr-text div {
              margin: 0.2px 0;
              word-wrap: break-word;
              overflow: hidden;
              max-width: 5.8cm;
            }
            @media print {
              .no-print {
                display: none !important;
              }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .qr-grid {
                page-break-inside: avoid;
              }
              * {
                box-sizing: border-box;
              }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    
    // รอให้โหลดเสร็จก่อนพิมพ์
    setTimeout(() => {
      // แสดงคำแนะนำการตั้งค่าการพิมพ์
      alert('การตั้งค่าการพิมพ์:\n\n' +
            '1. เลือก Layout: Portrait (แนวตั้ง)\n' +
            '2. Paper size: A4\n' +
            '3. Scale: 100% (ห้ามปรับขนาด)\n' +
            '4. Margins: Custom หรือ None\n' +
            '5. Headers and footers: ปิด\n' +
            '6. Background graphics: เปิด\n\n' +
            'กดปุ่ม Print หลังจากตั้งค่าเรียบร้อย');
      
      printWindow.print();
      printWindow.close();
    }, 1000);
  };

  // แบ่งข้อมูลเป็นหน้าๆ ละ 24 รายการ
  const getPages = () => {
    const pages = [];
    const itemsPerPage = 24;
    
    // ถ้ามีข้อมูลจริง
    if (rows.some(row => row.model_name || row.lot || row.erp)) {
      for (let i = 0; i < rows.length; i += itemsPerPage) {
        const pageItems = rows.slice(i, i + itemsPerPage);
        // เติมช่องว่างให้ครบ 24 ช่อง
        while (pageItems.length < itemsPerPage) {
          pageItems.push({ model_name: '', lot: '', quantity: 0, erp: '' });
        }
        pages.push(pageItems);
      }
    } else {
      // ถ้าไม่มีข้อมูล ให้แสดงแค่ 1 หน้าเปล่า
      const emptyPage = [];
      for (let i = 0; i < itemsPerPage; i++) {
        emptyPage.push({ model_name: '', lot: '', quantity: 0, erp: '' });
      }
      pages.push(emptyPage);
    }
    
    return pages;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #ffffff 100%)', fontFamily: 'Sarabun, sans-serif', padding: 0 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <h1 style={{ color: '#1976d2', fontWeight: 700, fontSize: 32, marginBottom: 16 }}>QR Code Layout สำหรับพิมพ์สติ๊กเกอร์ A4</h1>
        
        <div style={{ marginBottom: 24, background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 2px 8px #0001' }}>
          <h3 style={{ color: '#1976d2', marginTop: 0 }}>ข้อมูลสำหรับพิมพ์:</h3>
          <ul style={{ color: '#666', lineHeight: 1.6 }}>
            <li>📄 กระดาษ A4: 210×297mm</li>
            <li>📊 Grid: 3×8 = 24 สติ๊กเกอร์ต่อหน้า</li>
            <li>📏 ขนาดสติ๊กเกอร์: 6.3×3.4cm</li>
            <li>↕️ ระยะห่าง Row: ติดกัน (0mm)</li>
            <li>↔️ ระยะห่าง Column: 0.2cm</li>
            <li>📐 ขอบกระดาษ: บน 1.4cm, ล่าง 1.1cm, ซ้าย 0.9cm, ขวา 0.8cm</li>
          </ul>
        </div>

        {/* ปุ่มต่างๆ */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={addRow} style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginRight: 16 }}>+ เพิ่มแถว</button>
          
          <input type="file" id="excelFileInput" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelImport} />
          <button onClick={() => document.getElementById('excelFileInput')?.click()} style={{ background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginRight: 16 }}>Import Excel</button>
          
          <input type="file" id="csvFileInput" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
          <button onClick={() => document.getElementById('csvFileInput')?.click()} style={{ background: '#FFC107', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginRight: 16 }}>Import CSV</button>
          
          <button onClick={clearAllRows} style={{ background: '#9E9E9E', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginRight: 16 }}>🗑️ เคลียร์ข้อมูล</button>
          
          <button onClick={handlePrint} style={{ background: '#FF5722', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>🖨️ พิมพ์สติ๊กเกอร์</button>
        </div>

        {/* ส่วนจัดการข้อมูล */}
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px #0001', padding: 0, marginBottom: 24 }}>
          <table style={{ width: '100%', fontSize: 16, borderCollapse: 'collapse', minWidth: 600 }}>
            <thead style={{ background: '#e3f2fd' }}>
              <tr>
                <th style={{ padding: 12 }}>ลำดับ</th>
                <th style={{ padding: 12 }}>ชื่อโมเดล</th>
                <th style={{ padding: 12 }}>ล็อต</th>
                <th style={{ padding: 12 }}>ERP</th>
                <th style={{ padding: 12 }}>จำนวน</th>
                <th style={{ padding: 12 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ background: idx % 2 ? '#f5fafd' : undefined }}>
                  <td style={{ padding: 10, textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ padding: 10 }}>
                    <input value={row.model_name} onChange={e => handleChange(idx, 'model_name', e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                  </td>
                  <td style={{ padding: 10 }}>
                    <input value={row.lot} onChange={e => handleChange(idx, 'lot', e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                  </td>
                  <td style={{ padding: 10 }}>
                    <input value={row.erp} onChange={e => handleChange(idx, 'erp', e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                  </td>
                  <td style={{ padding: 10 }}>
                    <input type="number" min={1} value={row.quantity} onChange={e => handleChange(idx, 'quantity', e.target.value)} style={{ width: 80, padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                  </td>
                  <td style={{ padding: 10, textAlign: 'center' }}>
                    <button onClick={() => removeRow(idx)} style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ตัวอย่าง Layout สำหรับพิมพ์ */}
        <div ref={printRef} className="print-container">
          {getPages().map((pageItems, pageIndex) => (
            <div key={pageIndex} style={{ pageBreakAfter: pageIndex < getPages().length - 1 ? 'always' : 'auto' }}>
              <div className="no-print" style={{ background: '#fff3cd', padding: '8px 16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #ffc107' }}>
                <strong>หน้าที่ {pageIndex + 1}</strong> - รายการที่ {pageIndex * 24 + 1} ถึง {Math.min((pageIndex + 1) * 24, rows.length)}
              </div>
              
              <div className="qr-grid" style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 6.3cm)', 
                gridTemplateRows: 'repeat(8, 3.4cm)', 
                gap: '0mm 0.2cm'
              }}>
                {pageItems.map((item, itemIndex) => {
                  const globalIndex = pageIndex * 24 + itemIndex + 1;
                  const isEmpty = !item.model_name && !item.lot && !item.erp;
                  
                  return (
                    <div key={itemIndex} className="qr-item" style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      padding: '1mm',
                      boxSizing: 'border-box',
                      background: isEmpty ? '#f8f9fa' : '#fff',
                      width: '6.3cm',
                      height: '3.4cm',
                      position: 'relative'
                    }}>
                      {!isEmpty ? (
                        <>
                          <div className="qr-number" style={{ 
                            fontWeight: 'bold', 
                            fontSize: '12px', 
                            margin: 0,
                            position: 'absolute',
                            top: '3mm',
                            left: '3mm'
                          }}>{globalIndex}</div>
                          <div className="qr-code" style={{ 
                            width: '1.5cm', 
                            height: '1.5cm', 
                            margin: 0,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)'
                          }}>
                            <QRCode
                              value={getQRValue(item)}
                              size={256}
                              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                              viewBox={`0 0 256 256`}
                            />
                          </div>
                          <div className="qr-text" style={{ 
                            fontSize: '6px', 
                            textAlign: 'center', 
                            lineHeight: 0.9,
                            position: 'absolute',
                            bottom: '1mm',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '5cm'
                          }}>
                            <div style={{ margin: '0.2px 0', wordWrap: 'break-word', overflow: 'hidden', maxWidth: '5.8cm' }}>{item.model_name}</div>
                            <div style={{ margin: '0.2px 0', wordWrap: 'break-word', overflow: 'hidden', maxWidth: '5.8cm' }}>{item.lot}</div>
                            <div style={{ margin: '0.2px 0', wordWrap: 'break-word', overflow: 'hidden', maxWidth: '5.8cm' }}>{item.erp}</div>
                            <div style={{ margin: '0.2px 0', wordWrap: 'break-word', overflow: 'hidden', maxWidth: '5.8cm' }}>จำนวน: {item.quantity}</div>
                          </div>
                        </>
                      ) : (
                        <div style={{ color: '#ccc', fontSize: '10px' }}>ช่องว่าง</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        <div className="no-print" style={{ background: '#e3f2fd', padding: '16px', borderRadius: '8px', marginTop: '24px' }}>
          <h4 style={{ color: '#1976d2', marginTop: 0 }}>วิธีการใช้งาน:</h4>
          <ol style={{ color: '#666', lineHeight: 1.6 }}>
            <li>กรอกข้อมูลในตาราง หรือ Import จาก Excel/CSV</li>
            <li>ตรวจสอบ Layout ในส่วนตัวอย่างด้านล่าง</li>
            <li>คลิก "🖨️ พิมพ์สติ๊กเกอร์" เพื่อเปิดหน้าต่างพิมพ์</li>
            <li>ตั้งค่าเครื่องพิมพ์ให้เป็น A4 และ Scale 100%</li>
            <li>พิมพ์บนกระดาษสติ๊กเกอร์ตามสเปคที่กำหนด</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default QRPrintLayout;
