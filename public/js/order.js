import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

// Update Auth Button State
onAuthStateChanged(auth, (user) => {
  const btn = document.getElementById('auth-nav-btn');
  if (user && btn) {
    btn.textContent = 'My Account';
    btn.href = 'customer.html';
  }
});

// Load pricing dynamically from Firestore
async function loadPricing() {
  try {
    const snap = await getDocs(collection(db, 'services'));
    if (!snap.empty) {
      const dbServices = [];
      snap.forEach(docSnap => {
        dbServices.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      SERVICES.forEach(s => {
        const found = dbServices.find(dbS => dbS.id === s.id);
        if (found) s.price = Number(found.price);
      });
    } else {
      // Seed default prices into database
      for (const s of SERVICES) {
        await setDoc(doc(db, 'services', s.id), {
          name: s.name,
          icon: s.icon,
          price: s.price
        });
      }
    }
  } catch (err) {
    console.error('Error loading dynamic pricing:', err);
  }
}

// ── Service catalogue with prices ────────────────────────────────────────────
let SERVICES = [
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

    const paymentMethod = 'COD';

    const orderData = {
      orderId,
      customerName: document.getElementById('custName').value.trim(),
      phone,
      email:        document.getElementById('custEmail').value.trim(),
      address:      document.getElementById('custAddress').value.trim(),
      notes:        document.getElementById('custNotes').value.trim(),
      paymentMethod,
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

      // ── Send Email confirmation via Nodemailer backend ─────────────────
      fetch('/api/email/order-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: orderData.customerName,
          email: orderData.email,
          orderId,
          items: orderData.items,
          totalAmount: total,
          address: orderData.address,
          notes: orderData.notes
        })
      })
      .then(r => r.json())
      .then(d => console.log('Order email:', d.message))
      .catch(err => console.error('Order email API error:', err));


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
  loadPricing().then(() => {
    buildTable();
    updateSummary();
    setupForm();
  });
});
