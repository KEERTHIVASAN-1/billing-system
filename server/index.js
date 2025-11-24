const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');



const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------- Helper functions ----------
function safeFilename(name) {
  return String(name || '').replace(/[^a-zA-Z0-9\-_.]/g, '-').replace(/-+/g, '-');
}
function numberToWords(num) {
  num = Math.floor(Number(num) || 0);
  if (num === 0) return 'zero';
  const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
    'eighty', 'ninety'];
  function convert(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return n.toString();
  }
  return convert(num);
}
function formatRupee(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

// Simple vector icons to avoid font/emoji rendering issues
function drawPhoneIcon(doc, x, y, w = 10, h = 14) {
  doc.save();
  doc.lineWidth(1);
  // Smartphone-style icon
  doc.roundedRect(x, y, w, h, 2).stroke();
  doc.rect(x + 2, y + 2, w - 4, h - 6).stroke();
  doc.circle(x + w / 2, y + h - 3, 1).stroke();
  doc.restore();
}

function drawEnvelopeIcon(doc, x, y, w = 12, h = 9) {
  doc.save();
  doc.lineWidth(1);
  doc.rect(x, y, w, h).stroke();
  doc.moveTo(x, y).lineTo(x + w / 2, y + h / 2).lineTo(x + w, y).stroke();
  doc.moveTo(x, y + h).lineTo(x + w / 2, y + h / 2).lineTo(x + w, y + h).stroke();
  doc.restore();
}
async function saveInvoiceToSheetDB(data) {
  const sheetdbUrl = process.env.SHEETDB_URL;
  if (!sheetdbUrl) {
    console.error('SHEETDB_URL is not set');
    return;
  }

  const products = data.products || [];

  const payload = {
    data: {
      invoice_no: data.inNumber,
      date: data.invoiceDate,
      customer_name: data.customerName,
      address: data.customerAddress,
      mobile: data.customerMobile,
      email: data.customerEmail,
      products: products.map(p => p.name).join(', '),
      quantities: products.map(p => p.quantity).join(', '),
      prices: products.map(p => p.price).join(', '),
      total_price: data.totalPrice,
      delivery_charge: data.deliveryCharge,
      discount: data.discount,
      final_amount: data.finalAmount,
      advance: data.advanceAmount,
      balance: data.balanceAmount,
    },
  };

  try {
    await axios.post(sheetdbUrl, payload);
    console.log('✅ Invoice row stored in Google Sheet via SheetDB');
  } catch (err) {
    console.error('❌ Failed to store invoice in SheetDB:', err.message || err);
  }
}



// ---------- Generate Bill ----------
app.post('/generate-bill', async (req, res) => {
  // Normalize incoming body to support both legacy and new frontend payloads
  const incoming = req.body || {};

  function formatDateNative(d) {
    try {
      const date = d ? new Date(d) : new Date();
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = String(date.getFullYear());
      return `${dd}.${mm}.${yyyy}`;
    } catch (_) {
      const date = new Date();
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = String(date.getFullYear());
      return `${dd}.${mm}.${yyyy}`;
    }
  }

  const body = (() => {
    // If legacy keys present, use them as-is
    if (incoming.customerName || incoming.customerAddress || incoming.inNumber) {
      return {
        customerName: incoming.customerName || '',
        customerAddress: incoming.customerAddress || '',
        customerMobile: incoming.customerMobile || '',
        customerEmail: incoming.customerEmail || '',
        inNumber: incoming.inNumber || `IN-${Date.now()}`,
        dateOfIssue: incoming.dateOfIssue || formatDateNative(),
        products: Array.isArray(incoming.products) ? incoming.products : [],
        deliveryCharge: Number(incoming.deliveryCharge || 0),
        discount: Number(incoming.discount || 0),
        advanceAmount: Number(incoming.advanceAmount || 0)
      };
    }

    // Map from new App.jsx shape: { invoiceNo, date, customer:{...}, products:[{description,quantity,price}], deliveryCharge, discount, advance }
    const c = incoming.customer || {};
    const prods = Array.isArray(incoming.products) ? incoming.products.map(p => ({
      name: String((p && p.description) || '').trim(),
      quantity: Number((p && p.quantity) || 0),
      price: Number((p && p.price) || 0)
    })) : [];

    return {
      customerName: c.name || '',
      customerAddress: c.address || '',
      customerMobile: c.phone || '',
      customerEmail: c.email || '',
      inNumber: incoming.invoiceNo || `IN-${Date.now()}`,
      dateOfIssue: incoming.date ? formatDateNative(incoming.date) : formatDateNative(),
      products: prods,
      deliveryCharge: Number(incoming.deliveryCharge || 0),
      discount: Number(incoming.discount || 0),
      advanceAmount: Number(incoming.advance || 0)
    };
  })();

  const {
    customerName, customerAddress, customerMobile, customerEmail,
    inNumber, dateOfIssue, products = [],
    deliveryCharge = 0, discount = 0, advanceAmount = 0
  } = body;

  // Always auto-generate date to ensure consistency
  const invoiceDate = formatDateNative();

  const normalizedProducts = (Array.isArray(products) ? products : []).map(p => ({
    name: String((p && p.name) || '').trim(),
    quantity: Number((p && p.quantity) || 0),
    price: Number((p && p.price) || 0)
  }));

  let totalPrice = 0;
  normalizedProducts.forEach(p => { totalPrice += p.quantity * p.price; });
  const deliveryChargeNum = Number(deliveryCharge || 0);
  const discountNum = Number(discount || 0);
  const finalAmount = totalPrice + deliveryChargeNum - discountNum;
  const advanceAmountNum = Number(advanceAmount || 0);
  const balanceAmount = Math.max(0, finalAmount - advanceAmountNum);


 await saveInvoiceToSheetDB({
  inNumber,
  invoiceDate,
  customerName,
  customerAddress,
  customerMobile,
  customerEmail,
  products: normalizedProducts,
  totalPrice,
  deliveryCharge: deliveryChargeNum,
  discount: discountNum,
  finalAmount,
  advanceAmount: advanceAmountNum,
  balanceAmount
});


  const safeIn = safeFilename(inNumber || `IN-${Date.now()}`);
  const filename = `Bill_${safeIn}_${Date.now()}.pdf`;
  const filePath = path.join(UPLOADS_DIR, filename);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  let responded = false;
  doc.on('error', (err) => {
    console.error('PDFKit error:', err);
    if (!responded) {
      responded = true;
      res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
    }
  });

 // ---------- PDF CONTENT (with logo) ----------
const logoPath = path.join(__dirname, 'assets', 'kk.jpg');
// logo inside assets folder

// 🖼️ Draw logo if available, else show fallback text
if (fs.existsSync(logoPath)) {
  try {
    doc.image(logoPath, 25, -45, { width: 200 });
  } catch (e) {
    console.error('Logo load error:', e);
    doc.font('Helvetica-Bold').fontSize(34).text('E-GROOTS', 50, 40);
  }
} else {
  doc.font('Helvetica-Bold').fontSize(34).text('E-GROOTS', 50, 40);
}

// Horizontal line under logo
doc.moveTo(50, 80).lineTo(545, 80).stroke();

// Company details
doc.fontSize(10).font('Helvetica-Bold').text('E-GROOTS ED-TECH SOLUTIONS', 50, 95);
doc.font('Helvetica').text('COIMBATORE', 50, 110);
doc.font('Helvetica').text('TAMILNADU', 50, 125);
doc.font('Helvetica').text('INDIA', 50, 140);

// Contact details
drawPhoneIcon(doc, 50, 156, 10, 14);
doc.font('Helvetica').text('+91-8015221905', 66, 156, { width: 160 });
drawEnvelopeIcon(doc, 50, 175, 12, 9);
doc.font('Helvetica').text('egroots.in@gmail.com', 66, 175, { width: 160 });


  // Column separators for neat layout
  const headerTopY = 90;
  const headerBottomY = 180;
  // After company details column
  doc.moveTo(215, headerTopY).lineTo(215, headerBottomY).stroke();

  // Customer box
  doc.font('Helvetica-Bold').text('ORDER FROM :', 220, 95);
  doc.font('Helvetica').text(`Customer Name: ${customerName}`, 220, 110);
  doc.text(`Address: ${customerAddress}`, 220, 125, { width: 200 });
  doc.text(`Mobile No: ${customerMobile}`, 220, 155);
  doc.text(`E-Mail Id: ${customerEmail}`, 220, 170);

  // After order-from column
  doc.moveTo(430, headerTopY).lineTo(430, headerBottomY).stroke();

  // Invoice info
  doc.font('Helvetica-Bold').text('IN Number :', 440, 95);
  // Keep value on the same line with adequate width
  doc.font('Helvetica').text(inNumber, 510, 95, { width: 120, align: 'left' });
  doc.font('Helvetica-Bold').text('Date of Issue :', 440, 110);
  doc.font('Helvetica').text(invoiceDate, 510, 110, { width: 120, align: 'left' });

  // Products section as a single large box with spaced rows (no inner lines)
  const boxLeft = 50;
  const boxTop = 200;
  const boxWidth = 495;
  const headerH = 25;
  const rowH = 26;
  const rowsCount = normalizedProducts.length;
  const boxHeight = Math.max(headerH + rowsCount * rowH + 30, 260); // larger box for cleaner A4 usage

  // Outer box
  doc.rect(boxLeft, boxTop, boxWidth, boxHeight).stroke();
  // Header labels inside box (no separate header row lines)
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('S.NO', boxLeft + 10, boxTop + 7);
  doc.text('PRODUCT LIST', boxLeft + 60, boxTop + 7);
  doc.text('QTY', boxLeft + 270, boxTop + 7);
  doc.text('Price/Unit', boxLeft + 330, boxTop + 7);
  doc.text('TOTAL', boxLeft + 420, boxTop + 7);

  doc.moveTo(boxLeft, boxTop + headerH).lineTo(boxLeft + boxWidth, boxTop + headerH).stroke();

  // Rows content with natural spacing (no inner strokes)
  let y = boxTop + headerH;
  doc.font('Helvetica').fontSize(10);
  normalizedProducts.forEach((p, i) => {
    const rowTotal = p.quantity * p.price;
    doc.text(i + 1, boxLeft + 10, y + 6);
    doc.text(p.name, boxLeft + 60, y + 6, { width: 200 });
    doc.text(p.quantity, boxLeft + 275, y + 6);
    doc.text(formatRupee(p.price), boxLeft + 330, y + 6);
    doc.text(formatRupee(rowTotal), boxLeft + 420, y + 6);
    y += rowH;
  });

  // Totals box (place strictly below the products outer box)
  // Add extra breathing room before totals box
  y = boxTop + boxHeight + 20;
  doc.rect(345, y, 200, 120).stroke();
  let tY = y + 5;
  const labelX = 355;
  const valueX = 445; // bring values closer to labels
  const valueW = 90;  // smaller width so gap is reduced
  const row = (label, val) => {
    doc.font('Helvetica-Bold').text(label, labelX, tY);
    doc.font('Helvetica').text(formatRupee(val), valueX, tY, { width: valueW, align: 'right' });
    tY += 18;
  };
  row('Total Price :', totalPrice);
  row('Delivery Charge :', deliveryChargeNum);
  row('Discount :', discountNum);
  row('Amount :', finalAmount);
  row('Advance :', advanceAmountNum);
  row('Balance :', balanceAmount);

 // Amount and Terms

y = tY - 50;

// Amount label and numeric value
doc.font('Helvetica-Bold').fontSize(14).text('Amount :', 35, y);
doc.font('Helvetica').fontSize(12).text(formatRupee(finalAmount), 105, y);
// Amount in words (italic + gray + wrapped properly)
doc.font('Helvetica-Oblique').fontSize(11).fillColor('gray');
const amountWords = `(${numberToWords(finalAmount)} rupees only)`;
// Measure wrapped height and print
const textHeight = doc.heightOfString(amountWords, { width: 500 });
doc.text(amountWords, 30, y + 20, { width: 500, align: 'left' });
// Reset text color to black for next sections
doc.fillColor('black');
// Move y down dynamically to prevent overlap
y += 20 + textHeight + 10;



// --- Terms and Signature aligned horizontally ---
y += 80;

// Base Y for signatures
const sigY = y;

// ✍️ Left Signature block (moved slightly right)
doc.moveTo(300, sigY + 36).lineTo(405, sigY + 36).stroke();
doc.font('Helvetica-Bold').fontSize(10).text('(Pugalenthi G)', 290, sigY + 42, { width: 100, align: 'center' });
doc.font('Helvetica').fontSize(9).text('FOUNDER', 310, sigY + 60, { width: 60, align: 'center' });

// ✍️ Right Signature block (also moved 5 points right)
doc.moveTo(440, sigY + 36).lineTo(555, sigY + 36).stroke();
doc.font('Helvetica-Bold').fontSize(10).text(' (Mohan Prasanth N)', 440, sigY + 42, { width: 100, align: 'center' });
doc.font('Helvetica').fontSize(9).text('DIRECTOR', 460, sigY + 60, { width: 60, align: 'center' });

// 📅 Date (centered neatly below both signatures, moved slightly right)
const currentDate = new Date().toLocaleDateString('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
}).replace(/\//g, '.');

doc.font('Helvetica').fontSize(9).text(`Date : ${currentDate}`, 340, sigY + 80, { width: 150, align: 'center' });


// 🧾 Terms and Conditions (perfect left alignment)
const termsY = sigY + 30; // small offset below signature line height
doc.font('Helvetica-Bold').fontSize(11).text('Terms and Conditions:', 40, termsY);

const terms = [
  '• A minimum of 5-10 days will be taken to dispatch the order.',
  '• Defective products must be reported within 24 hours of delivery.',
  '• All prices are in Indian Rupees .',
];

doc.font('Helvetica').fontSize(9);

let ty = termsY + 16;
terms.forEach(t => {
  // left-aligned with no indentation or offset
  doc.text(t, 40, ty, { align: 'left' });
  ty += 14;
});

doc.end();






  // Wait for PDF fully written
  stream.on('finish', () => {
    if (responded) return;
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!responded) {
          responded = true;
          res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
        }
        return;
      }
      setTimeout(() => fs.existsSync(filePath) && fs.unlinkSync(filePath), 10000);
    });
  });

  stream.on('error', (err) => {
    console.error('Stream error:', err);
    if (!responded) {
      responded = true;
      res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
    }
  });
});

// ---------- Test ----------
app.get('/', (req, res) => res.json({ status: 'Billing Server Running' }));

// 🔹 NEW: Download invoices Excel file
app.get('/download-invoices', (req, res) => {
  const filePath = path.join(__dirname, 'invoices.xlsx');

  if (!fs.existsSync(filePath)) {
    return res
      .status(404)
      .json({ success: false, message: 'No invoices file found yet.' });
  }

  res.download(filePath, 'invoices.xlsx', (err) => {
    if (err) {
      console.error('Error sending Excel file:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error downloading file' });
      }
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Billing server running on PORT ${PORT}`);
});

