import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import jsQR from 'jsqr';
import * as XLSX from 'xlsx';

interface ScanData {
  model_name: string;
  lot: string;
  quantity: number;
  fileName?: string;
}

interface GroupedScanData {
  model_name: string;
  lot: string;
  total_quantity: number;
  files: string[];
}

const parseQR = (text: string): ScanData | null => {
  try {
    const obj = JSON.parse(text);
    if (obj.model_name && obj.lot && typeof obj.quantity !== 'undefined') return obj;
  } catch {
    const parts = text.split('|');
    if (parts.length === 3) {
      return {
        model_name: parts[0],
        lot: parts[1],
        quantity: Number(parts[2]),
      };
    }
  }
  return null;
};

const QRDropzone: React.FC = () => {
  const [data, setData] = useState<ScanData[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setLoading(true);
    setErrors([]);
    const results: ScanData[] = [];
    const errs: string[] = [];
    for (const file of acceptedFiles) {
      try {
        const img = new Image();
        const fileData = await file.arrayBuffer();
        const blob = new Blob([fileData]);
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject('โหลดรูปไม่ได้');
          img.src = url;
        });
        // สร้าง canvas เพื่ออ่าน pixel
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw 'ไม่สามารถอ่าน canvas ได้';
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const qr = jsQR(imageData.data, imageData.width, imageData.height);
        if (qr && qr.data) {
          console.log('QR data from', file.name, ':', qr.data);
          const parsed = parseQR(qr.data);
          if (parsed) {
            results.push({ ...parsed, fileName: file.name });
          } else {
            errs.push(`${file.name}: QR ไม่ใช่ฟอร์แมตที่รองรับ`);
          }
        } else {
          errs.push(`${file.name}: ไม่พบ QR code ในภาพ`);
        }
        URL.revokeObjectURL(url);
      } catch (e: any) {
        errs.push(`${file.name}: ${e?.toString() || 'เกิดข้อผิดพลาด'}`);
      }
    }
    setData(prev => {
      const merged = [...prev];
      results.forEach(newItem => {
        const idx = merged.findIndex(
          d => d.fileName === newItem.fileName
        );
        if (idx !== -1) {
          merged[idx] = newItem; // ทับข้อมูลเดิม
        } else {
          merged.push(newItem);
        }
      });
      return merged;
    });
    setErrors(errs);
    setLoading(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  });

  const groupedData: GroupedScanData[] = data.reduce((acc: GroupedScanData[], item) => {
    const existingGroup = acc.find(g => g.model_name === item.model_name && g.lot === item.lot);
    if (existingGroup) {
      existingGroup.total_quantity += item.quantity;
      if (item.fileName) existingGroup.files.push(item.fileName);
    } else {
      acc.push({
        model_name: item.model_name,
        lot: item.lot,
        total_quantity: item.quantity,
        files: item.fileName ? [item.fileName] : []
      });
    }
    return acc;
  }, []);

  const exportExcel = () => {
    const dataForExport = data.map((item, index) => ({
      'ลำดับ': index + 1,
      model_name: item.model_name,
      lot: item.lot,
      quantity: item.quantity,
    }));
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scanned');
    XLSX.writeFile(wb, 'scanned_qrcodes.xlsx');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #ffffff 100%)', fontFamily: 'Sarabun, sans-serif', padding: 0 }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        <style>{`
          @media (max-width: 700px) {
            table { font-size: 14px; min-width: 400px; }
            th, td { padding: 6px !important; }
          }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <img src="/coilmaster_usa_inc__logo.jpg" alt="Coilmaster Logo" style={{ width: 80, height: 80, objectFit: 'contain', background: 'none', boxShadow: 'none' }} />
          <div>
            <h1 style={{ margin: 0, color: '#1976d2', fontWeight: 700, fontSize: 32 }}>Coilmaster Electronics</h1>
            <div style={{ color: '#1976d2', fontSize: 22, fontWeight: 600, marginTop: 4 }}>stock counting</div>
          </div>
        </div>
        <div style={{ border: '2px dashed #2196f3', borderRadius: 16, padding: 40, textAlign: 'center', background: isDragActive ? '#e3f2fd' : '#fff', cursor: 'pointer', marginBottom: 24, boxShadow: '0 2px 12px #0001', transition: 'background 0.2s' }} {...getRootProps()}>
          <input {...getInputProps()} />
          {isDragActive ? <p style={{ color: '#1976d2', fontWeight: 600 }}>ปล่อยไฟล์ที่นี่...</p> : <p style={{ color: '#1976d2', fontWeight: 600 }}>ลากรูปภาพ QR Code มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์ (เลือกได้หลายไฟล์)</p>}
        </div>
        {loading && <div style={{ color: '#1976d2', fontWeight: 600, marginBottom: 12 }}>กำลังประมวลผล...</div>}
        {errors.length > 0 && (
          <div style={{ color: '#d32f2f', marginBottom: 16, background: '#fff3f3', borderRadius: 8, padding: 12, boxShadow: '0 1px 4px #0001' }}>
            <b>ข้อผิดพลาด:</b>
            <ul style={{ textAlign: 'left', margin: 0 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
        <button onClick={exportExcel} disabled={data.length === 0} style={{
          background: data.length === 0 ? '#90caf9' : 'linear-gradient(90deg, #1976d2 60%, #42a5f5 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '12px 32px',
          fontSize: 18,
          fontWeight: 600,
          boxShadow: '0 2px 8px #1976d233',
          marginBottom: 16,
          cursor: data.length === 0 ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
          display: 'block',
          marginLeft: 'auto',
        }}>Export Excel</button>
        <button onClick={() => setData([])} disabled={data.length === 0} style={{
          background: data.length === 0 ? '#eee' : '#d32f2f',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 32px',
          fontSize: 16,
          fontWeight: 600,
          boxShadow: '0 2px 8px #d32f2f33',
          marginBottom: 24,
          marginLeft: 'auto',
          display: 'block',
          cursor: data.length === 0 ? 'not-allowed' : 'pointer',
        }}>เคลียร์ข้อมูล</button>
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px #0001', padding: 0 }}>
          <table style={{ width: '100%', fontSize: 16, borderCollapse: 'collapse', minWidth: 500 }}>
            <thead style={{ background: '#e3f2fd' }}>
              <tr>
                <th style={{ padding: 12, borderBottom: '1px solid #bbdefb', color: '#1976d2', fontWeight: 700 }}>ลำดับ</th>
                <th style={{ padding: 12, borderBottom: '1px solid #bbdefb', color: '#1976d2', fontWeight: 700 }}>ชื่อโมเดล</th>
                <th style={{ padding: 12, borderBottom: '1px solid #bbdefb', color: '#1976d2', fontWeight: 700 }}>ล็อต</th>
                <th style={{ padding: 12, borderBottom: '1px solid #bbdefb', color: '#1976d2', fontWeight: 700 }}>จำนวน</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888', padding: 24 }}>ยังไม่มีข้อมูล</td></tr>
              ) : data.map((d, i) => (
                <tr key={d.fileName + d.model_name + d.lot} style={{ background: i % 2 ? '#f5fafd' : undefined }}>
                  <td style={{ padding: 12, borderBottom: '1px solid #bbdefb' }}>{i + 1}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #bbdefb' }}>{d.model_name}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #bbdefb' }}>{d.lot}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #bbdefb', textAlign: 'center' }}>{d.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QRDropzone; 