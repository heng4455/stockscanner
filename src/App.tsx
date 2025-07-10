import React, { useState } from 'react';
import QRDropzone from './QRDropzone';
import QRCreator from './QRCreator';

const App: React.FC = () => {
  const [page, setPage] = useState<'home' | 'create' | 'scan'>('home');

  if (page === 'create') {
    return (
      <div>
        <button
          onClick={() => setPage('home')}
          style={{
            background: '#1976d2', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 24px', fontSize: 16, fontWeight: 600, margin: 24, cursor: 'pointer', boxShadow: '0 2px 8px #1976d233'
          }}
        >
          กลับหน้าเมนูหลัก
        </button>
        <QRCreator />
      </div>
    );
  }

  if (page === 'scan') {
    return (
      <div>
        <button
          onClick={() => setPage('home')}
          style={{
            background: '#1976d2', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 24px', fontSize: 16, fontWeight: 600, margin: 24, cursor: 'pointer', boxShadow: '0 2px 8px #1976d233'
          }}
        >
          กลับหน้าเมนูหลัก
        </button>
        <QRDropzone />
      </div>
    );
  }

  // Home/Menu page
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #ffffff 100%)', fontFamily: 'Sarabun, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ color: '#1976d2', fontWeight: 700, fontSize: 36, marginBottom: 32 }}>ระบบจัดการ Stock</h1>
      <button
        onClick={() => setPage('create')}
        style={{ background: 'linear-gradient(90deg, #1976d2 60%, #42a5f5 100%)', color: '#fff', border: 'none', borderRadius: 8, padding: '18px 48px', fontSize: 22, fontWeight: 700, boxShadow: '0 2px 8px #1976d233', marginBottom: 24, cursor: 'pointer' }}
      >
        สร้าง QR Code สำหรับ Stock
      </button>
      <button
        onClick={() => setPage('scan')}
        style={{ background: 'linear-gradient(90deg, #388e3c 60%, #81c784 100%)', color: '#fff', border: 'none', borderRadius: 8, padding: '18px 48px', fontSize: 22, fontWeight: 700, boxShadow: '0 2px 8px #388e3c33', marginBottom: 24, cursor: 'pointer' }}
      >
        อ่าน QR Code (นำเข้าข้อมูล)
      </button>
      <div style={{ color: '#888', fontSize: 18 }}>หรือใช้งานฟีเจอร์อื่นได้จากเมนูนี้ในอนาคต</div>
    </div>
  );
};

export default App;
