import React, { useState } from 'react';
import QRCode from 'react-qr-code';

interface RowData {
  model_name: string;
  lot: string;
  quantity: number;
}

const emptyRow: RowData = { model_name: '', lot: '', quantity: 1 };

const QRCreator: React.FC = () => {
  const [rows, setRows] = useState<RowData[]>([{ ...emptyRow }]);
  const [showQR, setShowQR] = useState<number | null>(null);

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
  const removeRow = (idx: number) => setRows(rows.filter((_, i) => i !== idx));

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
                <th style={{ padding: 12 }}>ชื่อโมเดล</th>
                <th style={{ padding: 12 }}>ล็อต</th>
                <th style={{ padding: 12 }}>จำนวน</th>
                <th style={{ padding: 12 }}></th>
                <th style={{ padding: 12 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ background: idx % 2 ? '#f5fafd' : undefined }}>
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
                    <button onClick={() => setShowQR(idx)} style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}>สร้าง QR</button>
                  </td>
                  <td style={{ padding: 10 }}>
                    {rows.length > 1 && <button onClick={() => removeRow(idx)} style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 600, cursor: 'pointer' }}>ลบ</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} style={{ background: 'linear-gradient(90deg, #1976d2 60%, #42a5f5 100%)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 32px', fontSize: 18, fontWeight: 600, boxShadow: '0 2px 8px #1976d233', marginBottom: 24, cursor: 'pointer' }}>+ เพิ่มแถว</button>
        {showQR !== null && rows[showQR] && (
          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <h2 style={{ color: '#1976d2', fontWeight: 700 }}>QR Code สำหรับโมเดล: {rows[showQR].model_name}</h2>
            <div style={{ display: 'inline-block', background: '#fff', padding: 24, borderRadius: 16, boxShadow: '0 2px 12px #0001' }}>
              <QRCode id={`qr-svg-${showQR}`} value={getQRValue(rows[showQR])} size={256} level="H" />
            </div>
            <div style={{ marginTop: 16 }}>
              <button onClick={() => downloadQR(showQR)} style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 32px', fontSize: 18, fontWeight: 600, boxShadow: '0 2px 8px #1976d233', marginRight: 16, cursor: 'pointer' }}>ดาวน์โหลด QR</button>
              <button onClick={() => setShowQR(null)} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 32px', fontSize: 18, fontWeight: 600, boxShadow: '0 2px 8px #8882', cursor: 'pointer' }}>ปิด</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRCreator; 