const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const docx = require('docx');
const qrcode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Use cors middleware
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

// Serve static files from build directory
app.use(express.static(path.join(__dirname, 'build')));

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    // Echo back the message
    ws.send(`Server received: ${message}`);
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Serve React app for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// New API endpoint to generate Word document with QR codes
app.post('/generate-word', async (req, res) => {
  console.log('Received request to generate Word document');
  const { qrData } = req.body;
  console.log('qrData:', qrData); // Debug log

  if (!qrData || !Array.isArray(qrData) || qrData.length === 0) {
    return res.status(400).send('No QR data provided');
  }

  try {
    const doc = new docx.Document({
      sections: [{
        properties: {},
        children: [],
      }],
    });
    const section = doc.sections[0];

    // วนลูปข้อมูล qrData ตามลำดับ แล้วแปะ QR code + ข้อมูลแต่ละรายการลงไปทีละแถว
    for (let idx = 0; idx < qrData.length; idx++) {
      const dataItem = qrData[idx];
      const qrValue = JSON.stringify({
        model_name: dataItem.model_name,
        lot: dataItem.lot,
        quantity: dataItem.quantity,
      });
      const qrCodeDataUrl = await qrcode.toDataURL(qrValue, { errorCorrectionLevel: 'H', width: 200, margin: 1 });
      // robust check base64 split
      if (typeof qrCodeDataUrl !== 'string') {
        console.error('qrCodeDataUrl is not a string:', qrCodeDataUrl);
        throw new Error('qrCodeDataUrl is not a string');
      }
      const splitIndex = qrCodeDataUrl.indexOf(';base64,');
      if (splitIndex === -1) {
        console.error('qrCodeDataUrl missing ;base64, part:', qrCodeDataUrl);
        throw new Error('qrCodeDataUrl missing ;base64, part');
      }
      const base64Data = qrCodeDataUrl.substring(splitIndex + 8);
      if (!base64Data || typeof base64Data !== 'string' || base64Data.length < 10) {
        console.error('base64Data invalid:', base64Data);
        throw new Error('base64Data invalid');
      }
      let buffer;
      try {
        buffer = Buffer.from(base64Data, 'base64');
      } catch (e) {
        console.error('Buffer.from failed:', base64Data.slice(0, 30), e);
        throw new Error('Buffer.from failed');
      }
      const image = new docx.ImageRun({
        data: buffer,
        transformation: { width: 100, height: 100 }
      });

      section.children.push(
        new docx.Paragraph({ children: [image], alignment: docx.AlignmentType.CENTER }),
        new docx.Paragraph({ text: `ลำดับ: ${idx + 1}`, alignment: docx.AlignmentType.CENTER }),
        new docx.Paragraph({ text: `โมเดล: ${dataItem.model_name}`, alignment: docx.AlignmentType.CENTER }),
        new docx.Paragraph({ text: `ล็อต: ${dataItem.lot}`, alignment: docx.AlignmentType.CENTER }),
        new docx.Paragraph({ text: `จำนวน: ${dataItem.quantity}`, alignment: docx.AlignmentType.CENTER }),
        new docx.Paragraph({ text: '' }) // เว้นบรรทัด
      );
    }

    // Generate the Word document buffer
    const buffer = await docx.Packer.toBuffer(doc);

    res.setHeader('Content-Disposition', 'attachment; filename=qrcodes.docx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);

  } catch (error) {
    console.error('Error generating Word document:', error.stack || error);
    res.status(500).send('Error generating Word document');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}`);
}); 