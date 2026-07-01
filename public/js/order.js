import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── EMAILJS CONFIGURATION (FOR ORDER CONFIRMATIONS) ───────────────────────────
const EMAILJS_PUBLIC_KEY = "YOUR_EMAILJS_PUBLIC_KEY"; 
const EMAILJS_SERVICE_ID = "YOUR_EMAILJS_SERVICE_ID"; 
const EMAILJS_TEMPLATE_CONFIRMATION = "YOUR_EMAILJS_TEMPLATE_CONFIRMATION"; 

// Dynamic script loader for EmailJS
if (EMAILJS_PUBLIC_KEY !== "YOUR_EMAILJS_PUBLIC_KEY") {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  script.onload = () => {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  };
  document.head.appendChild(script);
}

// ── Service catalogue with prices ────────────────────────────────────────────
const SERVICES = [
  { id: 'shirt',    name: 'Shirt',    icon: '👔', price: 100 },
  { id: 'trousers', name: 'Trousers', icon: '👖', price: 150 },
  { id: 'suit',     name: 'Suit',     icon: '🤵', price: 250 },
  { id: 'saree',    name: 'Saree',    icon: '🥻', price: 350 },
  { id: 'coat',     name: 'Coat',     icon: '🧥', price: 500 },
  { id: 'shoes',    name: 'Shoes',    icon: '👟', price: 200 },
  { id: 'dresses',  name: 'Dresses',  icon: '👗', price: 300 },
];

// qty map: serviceId → quantity
const quantities = {};
SERVICES.forEach(s => quantities[s.id] = 0);

// ── Build price table rows ────────────────────────────────────────────────────
function buildTable() {
  const tbody = document.getElementById('priceBody');
  tbody.innerHTML = SERVICES.map(s => `
    <tr>
      <td>
        <span class="garment-name">
          <span class="garment-icon">${s.icon}</span>${s.name}
        </span>
      </td>
      <td class="garment-price">₹${s.price}</td>
      <td>
        <div class="qty-control">
          <button class="qty-btn" data-id="${s.id}" data-delta="-1" type="button">−</button>
          <span class="qty-value" id="qty-${s.id}">0</span>
          <button class="qty-btn" data-id="${s.id}" data-delta="1"  type="button">+</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Attach quantity button listeners
  tbody.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id    = btn.dataset.id;
      const delta = parseInt(btn.dataset.delta);
      quantities[id] = Math.max(0, quantities[id] + delta);
      document.getElementById(`qty-${id}`).textContent = quantities[id];
      updateSummary();
    });
  });
}

// ── Live order summary ────────────────────────────────────────────────────────
function updateSummary() {
  const itemsEl  = document.getElementById('summaryItems');
  const totalEl  = document.getElementById('totalAmount');

  const selected = SERVICES.filter(s => quantities[s.id] > 0);
  let total = 0;

  if (selected.length === 0) {
    itemsEl.innerHTML = '<p class="summary-empty">Add garments from the table →</p>';
    totalEl.textContent = '₹0';
    return;
  }

  itemsEl.innerHTML = selected.map(s => {
    const subtotal = s.price * quantities[s.id];
    total += subtotal;
    return `
      <div class="summary-item">
        <span>${s.icon} ${s.name} × ${quantities[s.id]}</span>
        <span>₹${subtotal}</span>
      </div>
    `;
  }).join('');

  totalEl.textContent = `₹${total}`;
}

// ── Generate order ID ─────────────────────────────────────────────────────────
function generateOrderId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `MDC-${d}-${r}`;
}

// ── Form submission → Firestore ───────────────────────────────────────────────
function setupForm() {
  const form      = document.getElementById('orderForm');
  const submitBtn = document.getElementById('orderSubmitBtn');
  const dialog    = document.getElementById('orderSuccessDialog');
  const closeBtn  = document.getElementById('closeOrderDialog');
  const dialogId  = document.getElementById('dialogOrderId');
  const dialogTot = document.getElementById('dialogTotal');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate – at least one garment selected
    const selected = SERVICES.filter(s => quantities[s.id] > 0);
    if (selected.length === 0) {
      alert('Please add at least one garment before confirming.');
      return;
    }

    // HTML5 validation
    if (!form.checkValidity()) {
      form.querySelectorAll('input, textarea').forEach(inp => {
        if (!inp.checkValidity()) inp.setAttribute('aria-invalid', 'true');
      });
      form.querySelector(':invalid')?.focus();
      return;
    }

    const total    = selected.reduce((sum, s) => sum + s.price * quantities[s.id], 0);
    const orderId  = generateOrderId();

    let phone = document.getElementById('custPhone').value.trim().replace(/[\s\-]/g, '');
    if (phone.length === 10) phone = '+91' + phone;

    const orderData = {
      orderId,
      customerName: document.getElementById('custName').value.trim(),
      phone,
      email:        document.getElementById('custEmail').value.trim(),
      address:      document.getElementById('custAddress').value.trim(),
      notes:        document.getElementById('custNotes').value.trim(),
      items: selected.map(s => ({
        id:       s.id,
        name:     s.name,
        price:    s.price,
        qty:      quantities[s.id],
        subtotal: s.price * quantities[s.id],
      })),
      totalAmount: total,
      status:      'pending',
      createdAt:   serverTimestamp(),
    };

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Placing Order…';

    try {
      await addDoc(collection(db, 'orders'), orderData);

      // ── Send Email confirmation to customer via EmailJS ────────────────
      if (window.emailjs && EMAILJS_PUBLIC_KEY !== "YOUR_EMAILJS_PUBLIC_KEY") {
        const itemsList = orderData.items.map(i => `${i.name} (${i.qty})`).join(', ');
        const detailsText = `Garments: ${itemsList}\nPickup Address: ${orderData.address}\nSpecial Instructions: ${orderData.notes || 'None'}`;
        
        const emailParams = {
          to_name: orderData.customerName,
          to_email: orderData.email,
          order_id: orderId,
          pickup_date: "Immediate (From order form)",
          pickup_time: "Same day",
          details: detailsText,
          total_amount: `₹${total}`,
          admin_email: 'naveensethi2007@yahoo.com'
        };

        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CONFIRMATION, emailParams)
          .then(() => {
            console.log('Order confirmation email sent to', orderData.email);
          })
          .catch((err) => {
            console.error('EmailJS order confirmation failed:', err);
          });
      }

      // Show success dialog
      dialogId.textContent  = orderId;
      dialogTot.textContent = `₹${total}`;
      dialog.showModal();

      // Reset form & quantities
      form.reset();
      SERVICES.forEach(s => {
        quantities[s.id] = 0;
        const el = document.getElementById(`qty-${s.id}`);
        if (el) el.textContent = '0';
      });
      updateSummary();

    } catch (err) {
      console.error('Order failed:', err);
      alert(`Order Failed: ${err.message}`);
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = '✅ Confirm Order';
    }
  });

  // Clear aria-invalid on input
  form.querySelectorAll('input, textarea').forEach(inp => {
    inp.addEventListener('input', () => {
      if (inp.checkValidity()) inp.removeAttribute('aria-invalid');
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', () => dialog.close());
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildTable();
  updateSummary();
  setupForm();
});
