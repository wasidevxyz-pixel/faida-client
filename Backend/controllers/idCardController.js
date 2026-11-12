'use strict';
/**
 * D.Watson Pharmacy — Employee ID Card Generator
 * CR80: 3.375 x 2.125 inches (243 x 153 pts)
 *
 * REFERENCE DESIGN:
 * Front/Back Header:
 *   - Thin top band: red covers left ~60%, blue covers right ~40%
 *   - Below band: white area with small logo (top-left) + italic text beside it
 *   - Gold stripe separates header white area from card body
 *
 * Front body: name(red), designation(black), info rows, photo(right)
 * Back body: left=notice+CNIC/mobile, right=signature(no box)+QR
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const path    = require('path');
const fs      = require('fs');
const QRCode  = require('qrcode');
const Employee = require('../models/Employee');

const W = 3.375 * 72;   // 243 pts
const H = 2.125 * 72;   // 153 pts

const BLUE     = rgb(0.10, 0.20, 0.62);
const RED      = rgb(0.80, 0.05, 0.05);
const WHITE    = rgb(1, 1, 1);
const LIGHT_BG = rgb(0.95, 0.95, 0.97);
const GOLD     = rgb(0.72, 0.58, 0.08);
const DARK     = rgb(0.08, 0.08, 0.08);
const INK      = rgb(0.06, 0.06, 0.06);

const ASSETS    = path.join(__dirname, '..', '..', 'assets');
const LOGO_PATH = path.join(ASSETS, 'dwatson-logo.png');
const SIGN_PATH = path.join(ASSETS, 'authorized-sign.png');

const fmt   = d => d ? new Date(d).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'}) : 'N/A';
const trunc = (s,n) => !s ? '' : s.length>n ? s.slice(0,n-1)+'…' : s;

function roundRect(page, x, y, w, h, r, fill, stroke, sw) {
  r = Math.min(r, w/2, h/2);
  const p = [
    `M ${x+r} ${y}`,`L ${x+w-r} ${y}`,`Q ${x+w} ${y} ${x+w} ${y+r}`,
    `L ${x+w} ${y+h-r}`,`Q ${x+w} ${y+h} ${x+w-r} ${y+h}`,
    `L ${x+r} ${y+h}`,`Q ${x} ${y+h} ${x} ${y+h-r}`,
    `L ${x} ${y+r}`,`Q ${x} ${y} ${x+r} ${y}`,`Z`,
  ].join(' ');
  page.drawSvgPath(p, {
    ...(fill   ? {color:fill}                                 : {}),
    ...(stroke ? {borderColor:stroke, borderWidth:sw||1}     : {}),
  });
}

async function fetchQr(text) {
  try {
    // Generate QR locally — no internet call, instant
    return await QRCode.toBuffer(text, { type: 'png', width: 300, margin: 2 });
  } catch (_) {
    return null;
  }
}

// ── Card shell (same for front and back) ─────────────────────────────────────
// BAND_H = thin coloured top band (red left + blue right)
// LOGO_AREA_H = white area below band with logo + title text
// GOLD stripe separates logo area from card body
// FOOTER_H = thin white footer at bottom with gold emp code
function drawShell(page, fonts, logoPng, titleText, empCode, R) {
  const { italic, bold, regular } = fonts;
  const BAND_H      = 16;
  const LOGO_AREA_H = 28;
  const GOLD_H      = 3;
  const FOOTER_H    = 16;   // same height as top band

  // ── Card background ───────────────────────────────────────────────────────
  roundRect(page, 0, 0, W, H, R, LIGHT_BG);

  // ── Top colour band (red left ~55%, blue right ~45%) ─────────────────────
  // Simple rectangles — card border clips the corners visually
  const bandY = H - BAND_H;
  const redW  = Math.round(W * 0.55);
  page.drawRectangle({x:0,    y:bandY, width:redW,   height:BAND_H, color:RED});
  page.drawRectangle({x:redW, y:bandY, width:W-redW, height:BAND_H, color:BLUE});

  // ── White logo area below band ────────────────────────────────────────────
  const logoAreaY = bandY - LOGO_AREA_H;
  page.drawRectangle({x:0, y:logoAreaY, width:W, height:LOGO_AREA_H, color:WHITE});

  // Small logo in logo area (left side)
  const logoH = LOGO_AREA_H - 4;
  const logoW = logoH;  // square
  if (logoPng) page.drawImage(logoPng, {x:4, y:logoAreaY+2, width:logoW, height:logoH});

  // Title text beside logo
  page.drawText(titleText, {
    x: logoW + 10, y: logoAreaY + LOGO_AREA_H/2 - 4,
    size:8, font:italic, color:DARK,
  });

  // ── Gold separator stripe ─────────────────────────────────────────────────
  const goldY = logoAreaY - GOLD_H;
  page.drawRectangle({x:0, y:goldY, width:W, height:GOLD_H, color:GOLD});

  // ── Footer — same red+blue split as header ───────────────────────────────
  page.drawRectangle({x:0,    y:0, width:redW,   height:FOOTER_H, color:RED});
  page.drawRectangle({x:redW, y:0, width:W-redW, height:FOOTER_H, color:BLUE});
  // Helpline text in white (left side)
  page.drawText('Helpline: 051-8438111  |  D.Watson Pharmacy Pvt. Ltd.', {
    x:6, y:7, size:4.8, font:regular, color:WHITE,
  });
  // Emp code gold (right side)
  if (empCode) page.drawText(empCode, {x:W-38, y:7, size:6, font:bold, color:GOLD});

  // ── Card border ───────────────────────────────────────────────────────────
  roundRect(page, 0.5, 0.5, W-1, H-1, R, null, rgb(0.75,0.75,0.75), 0.5);

  // Return body boundaries for content drawing
  return {
    bodyTop: goldY - 2,          // just below gold stripe
    bodyBot: FOOTER_H + 1,       // just above footer
    headerBot: logoAreaY,        // bottom of logo area (top of gold)
  };
}

// ── FRONT ─────────────────────────────────────────────────────────────────────
async function drawFront(page, fonts, emp, logoPng, photoPng) {
  const { bold, regular, italic } = fonts;
  const R = 10;

  const { bodyTop, bodyBot } = drawShell(page, fonts, logoPng, 'Employee Identity Card', emp.code||'', R);

  // ── Watermark ─────────────────────────────────────────────────────────────
  if (logoPng) {
    page.drawImage(logoPng, {
      x:W/2-44, y:H/2-40, width:88, height:82, opacity:0.10,
    });
  }

  // ── Employee name (RED bold) ───────────────────────────────────────────────
  const ns = (emp.name||'').length > 16 ? 9.5 : 11.5;
  page.drawText(trunc(emp.name||'',22).toUpperCase(), {
    x:8, y:bodyTop-14, size:ns, font:bold, color:RED,
  });

  // ── Designation (black bold) ───────────────────────────────────────────────
  const desig = emp.designation?.name || emp.designation || '';
  if (desig) {
    page.drawText(trunc(desig,28).toUpperCase(), {
      x:8, y:bodyTop-26, size:7.5, font:bold, color:DARK,
    });
  }

  // ── Thin divider ──────────────────────────────────────────────────────────
  page.drawLine({start:{x:7,y:bodyTop-30}, end:{x:W-68,y:bodyTop-30}, thickness:0.5, color:DARK});

  // ── Info rows ─────────────────────────────────────────────────────────────
  const rows = [
    ['Emp Code', emp.code||'N/A'],
    ['Dept',     trunc(emp.department?.name||emp.department||'',20)],
    ['Branch',   trunc(emp.branch||'',20)],
    ['Joined',   fmt(emp.joiningDate)],
    ['Issued',   fmt(emp.issueDate)],
    ['Expiry',   fmt(emp.expiryDate)],
  ];
  let ry = bodyTop - 38;
  rows.forEach(([lbl,val]) => {
    page.drawText(lbl+':', {x:8,  y:ry, size:5.8, font:bold,    color:DARK});
    page.drawText(val,      {x:48, y:ry, size:5.8, font:regular, color:DARK});
    ry -= 9.2;
  });

  // ── Photo box (right side) ────────────────────────────────────────────────
  const pH = bodyTop - bodyBot - 4;
  const pW = Math.min(62, pH * 0.85);
  const pX = W - pW - 4;
  const pY = bodyBot + 2;
  page.drawRectangle({x:pX-1.5, y:pY-1.5, width:pW+3, height:pH+3, color:DARK});
  page.drawRectangle({x:pX,     y:pY,     width:pW,   height:pH,   color:LIGHT_BG});
  if (photoPng) page.drawImage(photoPng, {x:pX, y:pY, width:pW, height:pH});
  else          page.drawText('PHOTO', {x:pX+14, y:pY+pH/2-4, size:8, font:bold, color:BLUE});
}

// ── BACK ──────────────────────────────────────────────────────────────────────
async function drawBack(page, fonts, emp, logoPng, qrPng, signPng) {
  const { bold, regular, italic, cursive } = fonts;
  const R = 10;

  const { bodyTop, bodyBot } = drawShell(page, fonts, logoPng, 'Authorized Identity Card', emp.code||'', R);

  // ── Watermark ─────────────────────────────────────────────────────────────
  if (logoPng) {
    page.drawImage(logoPng, {
      x:W/2-44, y:H/2-40, width:88, height:82, opacity:0.12,
    });
  }

  // Split body: left col (x=8..136) | right col (x=140..W-4)
  const RX = 140;
  const RW = W - RX - 4;

  // ── LEFT: Important Notice ────────────────────────────────────────────────
  page.drawText('IMPORTANT NOTICE', {
    x:8, y:bodyTop-12, size:7, font:bold, color:RED,
  });
  const notices = [
    'Property of D.Watson Pharmacy',
    'Return immediately if found',
    'Unauthorized use is prohibited',
    'Valid for one year',
  ];
  let nY = bodyTop - 23;
  notices.forEach(line => {
    page.drawText('• '+line, {x:8, y:nY, size:5.8, font:regular, color:DARK});
    nY -= 9;
  });
  page.drawLine({start:{x:7,y:nY-3}, end:{x:134,y:nY-3}, thickness:0.4, color:rgb(0.6,0.6,0.6)});
  const detY = nY - 13;
  page.drawText('CNIC:',   {x:8, y:detY,    size:5.8, font:bold,    color:DARK});
  page.drawText(emp.cnic||'N/A',     {x:34, y:detY,    size:5.8, font:regular, color:DARK});
  page.drawText('Mobile:', {x:8, y:detY-10, size:5.8, font:bold,    color:DARK});
  page.drawText(emp.mobileNo||'N/A', {x:34, y:detY-10, size:5.8, font:regular, color:DARK});

  // ── RIGHT: Signature — placed just below gold line (top of body) ─────────
  const sigImgH = 20;
  const sigImgW = RW;
  const sigImgX = RX;
  const sigImgY = bodyTop - sigImgH - 2;  // just below gold stripe

  if (signPng) {
    // No white background — transparent placement
    page.drawImage(signPng, {x:sigImgX, y:sigImgY, width:sigImgW, height:sigImgH});
  } else {
    const harisTextX = RX + (RW - 40) / 2;
    page.drawText('Haris', {x:harisTextX, y:sigImgY+4, size:18, font:cursive, color:INK});
  }
  // Underline — centred under signature, ~60% of column width
  const lineW = RW * 0.60;
  const lineX = RX + (RW - lineW) / 2;
  page.drawLine({
    start:{x:lineX, y:sigImgY-2}, end:{x:lineX+lineW, y:sigImgY-2},
    thickness:0.8, color:INK,
  });
  // "Authorized Signature" centred
  const sigLabelW = 55;
  page.drawText('Authorized Signature', {
    x: RX + (RW - sigLabelW) / 2, y: sigImgY - 11,
    size:5.2, font:italic, color:rgb(0.35,0.35,0.35),
  });

  // ── RIGHT: QR code (below signature, with padding) ───────────────────────
  const qrTopY  = sigImgY - 18;   // 18pt gap below "Authorized Signature" label
  const qrAvail = qrTopY - bodyBot - 2;
  const qrSize  = Math.min(qrAvail, RW);
  const qrX     = RX + (RW-qrSize)/2;
  const qrY     = bodyBot + 2 + (qrAvail-qrSize)/2;

  if (qrPng) {
    page.drawRectangle({x:qrX-2, y:qrY-2, width:qrSize+4, height:qrSize+4, color:WHITE});
    page.drawImage(qrPng, {x:qrX, y:qrY, width:qrSize, height:qrSize});
  } else {
    roundRect(page, qrX, qrY, qrSize, qrSize, 3, WHITE, BLUE, 0.5);
    page.drawText('QR', {x:qrX+qrSize/2-6, y:qrY+qrSize/2, size:10, font:bold, color:BLUE});
  }
}

// ── Controller ────────────────────────────────────────────────────────────────
exports.generateIdCard = async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id)
      .populate('department','name')
      .populate('designation','name')
      .lean();
    if (!emp) return res.status(404).json({success:false, message:'Employee not found.'});

    const today = new Date();
    emp.issueDate = today;
    const expDate = new Date(today);
    expDate.setFullYear(expDate.getFullYear()+1);
    emp.expiryDate = expDate;
    await Employee.findByIdAndUpdate(emp._id,{issueDate:emp.issueDate,expiryDate:emp.expiryDate}).catch(()=>null);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`ID Card — ${emp.name}`);
    pdfDoc.setAuthor('D.Watson Pharmacy');

    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const italic  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const cursive = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const fonts   = {bold, regular, italic, cursive};

    let logoPng = null;
    if (fs.existsSync(LOGO_PATH)) {
      const b = fs.readFileSync(LOGO_PATH);
      logoPng = await pdfDoc.embedJpg(b).catch(()=>pdfDoc.embedPng(b).catch(()=>null));
    }

    let qrPng = null;
    try {
      const qrData = [
        `Name: ${emp.name||''}`,
        `Code: ${emp.code||''}`,
        `Dept: ${emp.department?.name||emp.department||''}`,
        `Branch: ${emp.branch||''}`,
        `CNIC: ${emp.cnic||''}`,
        `Mobile: ${emp.mobileNo||''}`,
        `Joined: ${fmt(emp.joiningDate)}`,
        `Issued: ${fmt(emp.issueDate)}`,
        `Expiry: ${fmt(emp.expiryDate)}`,
        `Company: D.Watson Pharmacy Pvt. Ltd.`,
        `Helpline: 051-8438111`,
      ].join('\n');
      const qrBuf = await fetchQr(qrData);
      if (qrBuf) qrPng = await pdfDoc.embedPng(qrBuf).catch(()=>null);
    } catch(_){}

    let photoPng = null;
    if (emp.photo) {
      try {
        let photoBytes;
        if (emp.photo.startsWith('data:')) {
          photoBytes = Buffer.from(emp.photo.split(',')[1],'base64');
        } else {
          const pp = path.join(__dirname,'..', emp.photo.replace(/^\//,''));
          if (fs.existsSync(pp)) photoBytes = fs.readFileSync(pp);
        }
        if (photoBytes) {
          photoPng = await pdfDoc.embedJpg(photoBytes).catch(()=>pdfDoc.embedPng(photoBytes).catch(()=>null));
        }
      } catch(_){}
    }

    // Signature image
    let signPng = null;
    if (fs.existsSync(SIGN_PATH)) {
      const b = fs.readFileSync(SIGN_PATH);
      signPng = await pdfDoc.embedJpg(b).catch(() => pdfDoc.embedPng(b).catch(() => null));
    }

    const frontPage = pdfDoc.addPage([W,H]);
    await drawFront(frontPage, fonts, emp, logoPng, photoPng);

    const backPage = pdfDoc.addPage([W,H]);
    await drawBack(backPage, fonts, emp, logoPng, qrPng, signPng);

    const pdfBytes = await pdfDoc.save();
    const safeName = (emp.name||'employee').replace(/[^a-z0-9]/gi,'_');
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="IDCard_${safeName}_${emp.code}.pdf"`,
      'Content-Length':       pdfBytes.length,
    });
    res.end(Buffer.from(pdfBytes));

  } catch(err) {
    console.error('[ID Card] Error:', err);
    res.status(500).json({success:false, message:err.message});
  }
};
