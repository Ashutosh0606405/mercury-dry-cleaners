const nodemailer = require('nodemailer');

// ── Create transporter using Gmail SMTP ──────────────────────────────────────
// Required env vars: GMAIL_USER, GMAIL_APP_PASSWORD
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const ADMIN_EMAIL = process.env.GMAIL_USER || 'naveensethi2007@yahoo.com';
const BUSINESS_NAME = 'Mercury Dry Cleaners';

// ── Shared email HTML header/footer ─────────────────────────────────────────
function emailWrapper(content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f7faff; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    .header { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: white; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; color: rgba(255,255,255,0.85); font-size: 14px; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 18px; font-weight: 700; color: #1a2744; margin-bottom: 12px; }
    .text { color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 20px; }
    .info-box { background: #fff7ed; border-left: 4px solid #f97316; border-radius: 0 8px 8px 0; padding: 16px 20px; margin-bottom: 24px; }
    .info-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px dashed #e5e7eb; font-size: 14px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b7280; font-weight: 500; }
    .info-value { color: #1a2744; font-weight: 700; }
    .status-badge { display: inline-block; padding: 6px 16px; border-radius: 100px; font-weight: 700; font-size: 14px; }
    .badge-pending     { background: #dbeafe; color: #1e40af; }
    .badge-picked_up   { background: #ede9fe; color: #5b21b6; }
    .badge-in_cleaning { background: #fef3c7; color: #92400e; }
    .badge-ready       { background: #dcfce7; color: #166534; }
    .badge-completed   { background: #f3f4f6; color: #374151; }
    .cta-btn { display: block; background: #f97316; color: white !important; text-decoration: none; text-align: center; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 16px; margin: 24px 0; }
    .footer { background: #f7faff; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 4px 0; color: #9ca3af; font-size: 13px; }
    .footer a { color: #f97316; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🧺 Mercury Dry Cleaners</h1>
      <p>India's Premium Laundry & Dry Cleaning Service</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>📞 +91 80103 66665 &nbsp;|&nbsp; ✉ <a href="mailto:${ADMIN_EMAIL}">${ADMIN_EMAIL}</a></p>
      <p>© ${new Date().getFullYear()} Mercury Dry Cleaners. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ── 1. Send Pickup Booking Confirmation ──────────────────────────────────────
// ── 1. Send Pickup Booking Confirmation ──────────────────────────────────────
async function sendPickupConfirmation({ customerName, email, orderId, pickupDate, pickupTime, garmentCount, garmentTypes, specialInstructions, pickupFee }) {
  const garments = Array.isArray(garmentTypes) ? garmentTypes.join(', ') : garmentTypes || 'Various garments';
  const fee = Number(pickupFee || 0);

  const feeRow = `<div class="info-row"><span class="info-label">Pickup Fee</span><span class="info-value">${fee > 0 ? `₹${fee} (Cash on Delivery)` : 'FREE (1st Booking Promotion)'}</span></div>`;
  const feeWarningNote = fee > 0 
    ? `<p class="text" style="color: #c2410c; background: #fff7ed; padding: 0.75rem; border-radius: 8px; border: 1px dashed #fdba74; font-size: 13px; font-weight: 500;">
        ⚠️ <strong>Pickup Fee applied:</strong> A fee of ₹${fee} has been added as Cash on Delivery for this booking, as only your first pickup is free.
       </p>`
    : `<p class="text" style="color: #15803d; background: #f0fdf4; padding: 0.75rem; border-radius: 8px; border: 1px dashed #bbf7d0; font-size: 13px; font-weight: 500;">
        🎉 <strong>First Pickup is FREE:</strong> Your promotional free pickup slot has been applied successfully!
       </p>`;

  const customerHtml = emailWrapper(`
    <div class="greeting">Hi ${customerName}! 🎉</div>
    <p class="text">Your pickup has been scheduled. Here are your booking details:</p>
    ${feeWarningNote}
    <div class="info-box">
      <div class="info-row"><span class="info-label">Order ID</span><span class="info-value">${orderId}</span></div>
      <div class="info-row"><span class="info-label">Pickup Date</span><span class="info-value">${pickupDate}</span></div>
      <div class="info-row"><span class="info-label">Time Window</span><span class="info-value">${pickupTime}</span></div>
      <div class="info-row"><span class="info-label">Garments</span><span class="info-value">${garmentCount} items — ${garments}</span></div>
      ${feeRow}
      ${specialInstructions ? `<div class="info-row"><span class="info-label">Your Instructions</span><span class="info-value">${specialInstructions}</span></div>` : ''}
    </div>
    <p class="text">Our team will arrive at your door in the chosen time window. We'll SMS you 30 minutes before arrival.</p>
    <p class="text" style="font-size:13px; color:#6b7280;">If you have any questions, reply to this email or call us at <strong>+91 80103 66665</strong>.</p>
  `);

  const adminHtml = emailWrapper(`
    <div class="greeting">🆕 New Pickup Booking Received</div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Order ID</span><span class="info-value">${orderId}</span></div>
      <div class="info-row"><span class="info-label">Customer</span><span class="info-value">${customerName}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-value">${email}</span></div>
      <div class="info-row"><span class="info-label">Pickup Date</span><span class="info-value">${pickupDate}</span></div>
      <div class="info-row"><span class="info-label">Time Window</span><span class="info-value">${pickupTime}</span></div>
      <div class="info-row"><span class="info-label">Garments</span><span class="info-value">${garmentCount} items — ${garments}</span></div>
      <div class="info-row"><span class="info-label">Pickup Fee</span><span class="info-value">₹${fee} (COD)</span></div>
      ${specialInstructions ? `<div class="info-row"><span class="info-label">Instructions</span><span class="info-value">${specialInstructions}</span></div>` : ''}
    </div>
    <p class="text">Log in to the Admin Portal to manage this booking.</p>
  `);

  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `✅ Pickup Confirmed — Order ${orderId} | Mercury Dry Cleaners`,
    html: customerHtml,
  });

  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject: `🆕 New Pickup Booking — ${orderId} from ${customerName}`,
    html: adminHtml,
  });
}

// ── 2. Send Order Confirmation ───────────────────────────────────────────────
async function sendOrderConfirmation({ customerName, email, orderId, items, totalAmount, address, notes }) {
  const itemsList = Array.isArray(items)
    ? items.map(i => `<div class="info-row"><span class="info-label">${i.name} × ${i.qty}</span><span class="info-value">₹${i.subtotal}</span></div>`).join('')
    : '';

  const customerHtml = emailWrapper(`
    <div class="greeting">Thank you, ${customerName}! 🛍️</div>
    <p class="text">Your order has been placed successfully. We'll confirm your pickup shortly.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Order ID</span><span class="info-value">${orderId}</span></div>
      ${itemsList}
      <div class="info-row" style="margin-top:8px;"><span class="info-label" style="font-size:15px; font-weight:700;">Total</span><span class="info-value" style="font-size:18px; color:#f97316;">₹${totalAmount}</span></div>
    </div>
    <div class="info-box" style="background:#f0fdf4; border-color:#22c55e;">
      <div class="info-row"><span class="info-label">Pickup Address</span><span class="info-value">${address}</span></div>
      ${notes ? `<div class="info-row"><span class="info-label">Instructions</span><span class="info-value">${notes}</span></div>` : ''}
    </div>
    <p class="text">We'll call you to confirm the pickup time. Our team will arrive within 24 hours.</p>
  `);

  const adminHtml = emailWrapper(`
    <div class="greeting">🆕 New Order Received — ₹${totalAmount}</div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Order ID</span><span class="info-value">${orderId}</span></div>
      <div class="info-row"><span class="info-label">Customer</span><span class="info-value">${customerName}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-value">${email}</span></div>
      <div class="info-row"><span class="info-label">Address</span><span class="info-value">${address}</span></div>
      ${itemsList}
      <div class="info-row"><span class="info-label">Total</span><span class="info-value" style="color:#f97316;">₹${totalAmount}</span></div>
    </div>
  `);

  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `🛍️ Order Confirmed — ${orderId} | Mercury Dry Cleaners`,
    html: customerHtml,
  });

  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject: `🆕 New Order ₹${totalAmount} — ${orderId} from ${customerName}`,
    html: adminHtml,
  });
}

// ── 3. Send Status Update Notification ──────────────────────────────────────
async function sendStatusUpdate({ customerName, email, orderId, newStatus }) {
  const statusMessages = {
    'pending':     { icon: '⏳', label: 'Order Received', message: 'We have received your order and will schedule a pickup shortly.' },
    'picked up':   { icon: '🚗', label: 'Picked Up',      message: 'Your garments have been picked up and are on the way to our facility.' },
    'in cleaning': { icon: '🧼', label: 'In Cleaning',    message: 'Your garments are now being professionally cleaned and treated.' },
    'ready':       { icon: '✅', label: 'Ready for Delivery', message: 'Your garments are cleaned, pressed and ready for delivery! We will deliver them to you shortly.' },
    'completed':   { icon: '🎉', label: 'Delivered & Completed', message: 'Your order has been delivered. We hope you love the freshness! Thank you for choosing Mercury.' },
  };

  const statusKey = newStatus.toLowerCase();
  const info = statusMessages[statusKey] || { icon: '📦', label: newStatus, message: `Your order status has been updated to: ${newStatus}` };

  const badgeClass = `badge-${statusKey.replace(' ', '_')}`;

  const html = emailWrapper(`
    <div class="greeting">Hi ${customerName}, update on your order! ${info.icon}</div>
    <p class="text">Your order status has been updated:</p>
    <div style="text-align: center; margin: 24px 0;">
      <span class="status-badge ${badgeClass}">${info.icon} ${info.label}</span>
    </div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Order ID</span><span class="info-value">${orderId}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value">${info.icon} ${info.label}</span></div>
    </div>
    <p class="text">${info.message}</p>
    <p class="text" style="font-size:13px; color:#6b7280;">Questions? Call us at <strong>+91 80103 66665</strong> or reply to this email.</p>
  `);

  await transporter.sendMail({
    from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `${info.icon} Order ${orderId} Update — ${info.label} | Mercury Dry Cleaners`,
    html,
  });
}

module.exports = { sendPickupConfirmation, sendOrderConfirmation, sendStatusUpdate };
