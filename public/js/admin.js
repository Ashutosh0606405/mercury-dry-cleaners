import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ALLOWED_ADMIN_EMAIL = 'mercurydrycleaners22@gmail.com';


document.addEventListener('DOMContentLoaded', () => {
  let allItems = []; // Combines pickups and orders
  const tbody = document.getElementById('orders-tbody');
  const searchInput = document.getElementById('admin-search-input');
  const filterSelect = document.getElementById('admin-filter-status');
  const logoutBtn = document.getElementById('logout-btn');
  const sessionUser = document.getElementById('session-username');

  // Stats Counters
  const statTotal = document.getElementById('stat-total');
  const statScheduled = document.getElementById('stat-scheduled');
  const statCleaning = document.getElementById('stat-cleaning');
  const statReady = document.getElementById('stat-ready');

  checkAuth();

  // Auth check
  function checkAuth() {
    onAuthStateChanged(auth, (user) => {
      if (!user || user.email !== ALLOWED_ADMIN_EMAIL) {
        window.location.href = 'admin-login.html';
        return;
      }
      sessionUser.textContent = `Staff: ${user.email}`;
      loadData();
    });
  }

  // Fetch pickups & orders from Firestore
  async function loadData() {
    try {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-muted);">Syncing with live database...</td></tr>`;

      // 1. Fetch Pickups
      const pickupsSnap = await getDocs(collection(db, 'pickups'));
      const pickups = [];
      pickupsSnap.forEach(docSnap => {
        pickups.push({
          docId: docSnap.id,
          collectionType: 'pickups',
          ...docSnap.data()
        });
      });

      // 2. Fetch Orders
      const ordersSnap = await getDocs(collection(db, 'orders'));
      const orders = [];
      ordersSnap.forEach(docSnap => {
        orders.push({
          docId: docSnap.id,
          collectionType: 'orders',
          ...docSnap.data()
        });
      });

      // Combine and sort by createdAt robustly (handles Firebase Timestamp & ISO strings)
      allItems = [...pickups, ...orders].sort((a, b) => {
        const dateA = a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(b.createdAt || 0);
        return dateB - dateA; // Newest first
      });

      updateStats();
      renderTable();

    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--error);">❌ Error loading live operational data: ${err.message}</td></tr>`;
    }
  }

  // Render Table
  function renderTable() {
    const searchQuery = searchInput.value.toLowerCase().trim();
    const filterStatus = filterSelect.value;

    const filtered = allItems.filter(item => {
      // Filter status matches (normalise case for compatibility)
      const matchesStatus = filterStatus === 'ALL' || 
        item.status?.toLowerCase() === filterStatus.toLowerCase();

      // Search matches
      const matchesSearch = !searchQuery ||
        item.orderId?.toLowerCase().includes(searchQuery) ||
        item.customerName?.toLowerCase().includes(searchQuery) ||
        item.phone?.includes(searchQuery) ||
        item.email?.toLowerCase().includes(searchQuery);

      return matchesStatus && matchesSearch;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-muted);">No records found matching filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const instructions = item.notes || item.specialInstructions || '—';
      
      // Compute Items Text (safe against missing items list)
      let itemsText = '';
      if (item.collectionType === 'orders' && Array.isArray(item.items)) {
        itemsText = item.items.map(i => `${i.name} (${i.qty})`).join(', ') + ` - ₹${item.totalAmount}`;
      } else {
        const count = item.garmentCount || 0;
        const types = Array.isArray(item.garmentTypes) ? item.garmentTypes.join(', ') : (item.garmentTypes || '—');
        itemsText = `${count}x [${types}] (Pickup request)`;
      }

      // Schedule Info
      const scheduleInfo = item.pickupDate 
        ? `<div>${item.pickupDate}</div><div style="font-size:0.8rem; color:var(--primary); font-weight:500;">⏱ ${item.pickupTime}</div>`
        : `<div style="color:var(--text-muted);">Immediate Order</div>`;

      // Status selector classes
      let selectClass = '';
      const currentStatus = item.status || 'Pending';
      switch (currentStatus.toLowerCase()) {
        case 'pending': selectClass = 'badge-scheduled'; break;
        case 'scheduled': selectClass = 'badge-scheduled'; break;
        case 'picked up': selectClass = 'badge-pickedup'; break;
        case 'in cleaning': selectClass = 'badge-cleaning'; break;
        case 'ready': selectClass = 'badge-ready'; break;
        case 'completed': selectClass = 'badge-completed'; break;
      }

      return `
        <tr data-doc-id="${item.docId}" data-collection="${item.collectionType}">
          <td>
            <a href="#" class="view-details-link" data-id="${item.orderId}" style="color:var(--primary); font-family:var(--font-heading); font-weight:700; text-decoration:underline;">
              ${item.orderId}
            </a>
          </td>
          <td>
            <div style="font-weight:600;">${item.customerName}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.1rem;">📞 ${item.phone}</div>
            ${item.email ? `<div style="font-size:0.75rem; color:var(--text-muted);">✉ ${item.email}</div>` : ''}
          </td>
          <td>
            ${scheduleInfo}
          </td>
          <td>
            <span style="font-size:0.85rem; font-weight:500;">${itemsText}</span>
          </td>
          <td style="max-width:200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${instructions}">
            <p style="font-size:0.8rem; color:var(--text-muted); font-style:italic;">
              ${instructions}
            </p>
          </td>
          <td>
            <select class="admin-select-status ${selectClass}" style="font-weight:600; padding:0.4rem 0.6rem; border-radius:6px;">
              <option value="pending" ${currentStatus.toLowerCase() === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="picked up" ${currentStatus.toLowerCase() === 'picked up' ? 'selected' : ''}>Picked Up</option>
              <option value="in cleaning" ${currentStatus.toLowerCase() === 'in cleaning' ? 'selected' : ''}>In Cleaning</option>
              <option value="ready" ${currentStatus.toLowerCase() === 'ready' ? 'selected' : ''}>Ready for Delivery</option>
              <option value="completed" ${currentStatus.toLowerCase() === 'completed' ? 'selected' : ''}>Completed</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');

    // Attach status update event listeners
    tbody.querySelectorAll('select.admin-select-status').forEach(select => {
      select.addEventListener('change', async (e) => {
        const tr = select.closest('tr');
        const docId = tr.dataset.docId;
        const collectionType = tr.dataset.collection;
        const newStatus = e.target.value;

        await updateStatus(collectionType, docId, newStatus);
      });
    });

    // Attach order details click listeners
    tbody.querySelectorAll('.view-details-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const orderId = link.dataset.id;
        openOrderDetails(orderId);
      });
    });
  }

  // Update Status in Firestore
  async function updateStatus(collectionType, docId, newStatus) {
    try {
      const docRef = doc(db, collectionType, docId);
      await updateDoc(docRef, { status: newStatus });

      // Update local copy
      const idx = allItems.findIndex(i => i.docId === docId && i.collectionType === collectionType);
      if (idx !== -1) {
        allItems[idx].status = newStatus;
        
        // Trigger customer email notification via Nodemailer backend
        const item = allItems[idx];
        if (item.email) {
          fetch('/api/email/status-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerName: item.customerName,
              email: item.email,
              orderId: item.orderId,
              newStatus: newStatus
            })
          })
          .then(r => r.json())
          .then(d => console.log('Status update email sent:', d.message))
          .catch(err => console.error('Status email failed:', err));
        }
      }

      updateStats();
      renderTable();

    } catch (err) {
      console.error(err);
      alert(`Error updating order status: ${err.message}`);
      loadData();
    }
  }


  // Update Stats Counters
  function updateStats() {
    const active = allItems.filter(o => (o.status || '').toLowerCase() !== 'completed');
    statTotal.textContent = active.length;

    statScheduled.textContent = allItems.filter(o => (o.status || '').toLowerCase() === 'pending' || (o.status || '').toLowerCase() === 'scheduled').length;
    statCleaning.textContent = allItems.filter(o => (o.status || '').toLowerCase() === 'in cleaning').length;
    statReady.textContent = allItems.filter(o => (o.status || '').toLowerCase() === 'ready').length;
  }

  // Filter & Search listeners
  searchInput.addEventListener('input', renderTable);
  filterSelect.addEventListener('change', renderTable);

  // Logout trigger
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Logout failed:', err);
      window.location.href = 'index.html';
    }
  });

  // --- Order Details Modal Overlay Setup ---
  const detailsDialog = document.getElementById('order-details-dialog');
  const detailsContent = document.getElementById('details-modal-content');
  const closeDetailsBtn = document.getElementById('close-details-btn');

  if (closeDetailsBtn && detailsDialog) {
    closeDetailsBtn.addEventListener('click', () => detailsDialog.close());
  }

  function openOrderDetails(orderId) {
    const item = allItems.find(o => o.orderId === orderId);
    if (!item) return;

    let itemsHTML = '';
    if (item.collectionType === 'orders' && Array.isArray(item.items)) {
      itemsHTML = `
        <div style="margin-top: 1.5rem;">
          <h4 style="font-family: var(--font-heading); margin-bottom: 0.5rem; font-size: 1rem; color: var(--text-dark);">Garments & Pricing</h4>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                <th style="padding: 0.5rem 0;">Garment</th>
                <th style="padding: 0.5rem 0; text-align: center;">Qty</th>
                <th style="padding: 0.5rem 0; text-align: right;">Price</th>
                <th style="padding: 0.5rem 0; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${item.items.map(i => `
                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                  <td style="padding: 0.5rem 0; font-weight: 500;">${i.name}</td>
                  <td style="padding: 0.5rem 0; text-align: center;">${i.qty}</td>
                  <td style="padding: 0.5rem 0; text-align: right;">₹${i.price}</td>
                  <td style="padding: 0.5rem 0; text-align: right; font-weight: 600;">₹${i.subtotal}</td>
                </tr>
              `).join('')}
              <tr>
                <td colspan="3" style="padding: 0.75rem 0; font-weight: 700; text-align: right;">Total Amount:</td>
                <td style="padding: 0.75rem 0; text-align: right; font-weight: 700; color: var(--primary); font-size: 1.05rem;">₹${item.totalAmount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    } else {
      const types = Array.isArray(item.garmentTypes) ? item.garmentTypes.join(', ') : (item.garmentTypes || '—');
      itemsHTML = `
        <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(0,0,0,0.02); border-radius: 10px; border: 1px dashed var(--border-color);">
          <h4 style="font-family: var(--font-heading); margin-bottom: 0.25rem; font-size: 0.95rem; color: var(--text-dark);">Garments to Clean</h4>
          <p style="font-size: 0.9rem; font-weight: 500;">${types}</p>
          <span style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-top: 0.5rem;">Estimated count: <strong>${item.garmentCount || 0} items</strong></span>
        </div>
      `;
    }

    const instructions = item.notes || item.specialInstructions || 'None provided';
    const currentStatus = item.status || 'Pending';
    
    // Format status for class
    let badgeClass = '';
    let badgeLabel = currentStatus;
    switch (currentStatus.toLowerCase()) {
      case 'pending':
      case 'scheduled': badgeClass = 'badge-scheduled'; badgeLabel = 'Scheduled'; break;
      case 'picked up': badgeClass = 'badge-pickedup'; badgeLabel = 'Picked Up'; break;
      case 'in cleaning': badgeClass = 'badge-cleaning'; badgeLabel = 'In Cleaning'; break;
      case 'ready': badgeClass = 'badge-ready'; badgeLabel = 'Ready for Delivery'; break;
      case 'completed': badgeClass = 'badge-completed'; badgeLabel = 'Completed'; break;
    }

    // Schedule info
    const scheduleHTML = item.pickupDate 
      ? `<p style="font-size:0.9rem; margin-top:0.25rem;">📅 Date: <strong>${item.pickupDate}</strong> | ⏱ Slot: <strong>${item.pickupTime}</strong></p>`
      : `<p style="font-size:0.9rem; margin-top:0.25rem; color:var(--text-muted);">Immediate Store Drop-off/Pickup</p>`;

    // Customer Address
    const addressHTML = item.address
      ? `<div style="margin-top: 1rem;">
          <h4 style="font-family: var(--font-heading); margin-bottom: 0.25rem; font-size: 0.95rem; color: var(--text-dark);">Delivery Address</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">📍 ${item.address}</p>
         </div>`
      : '';

    detailsContent.innerHTML = `
      <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
        <span class="badge ${badgeClass}" style="margin-bottom: 0.5rem; display: inline-block;">${badgeLabel}</span>
        <h3 style="font-family: var(--font-heading); font-size: 1.5rem; color: var(--text-dark); margin: 0;">Order ${item.orderId}</h3>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">Type: ${item.collectionType === 'orders' ? 'Direct Booking & Checkout' : 'Pickup Request Schedule'}</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
        <div>
          <h4 style="font-family: var(--font-heading); font-size: 0.95rem; color: var(--text-dark); margin: 0;">Customer</h4>
          <p style="font-size: 0.9rem; font-weight: 600; margin-top: 0.25rem;">${item.customerName}</p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">📞 ${item.phone}</p>
          ${item.email ? `<p style="font-size: 0.85rem; color: var(--text-muted);">✉ ${item.email}</p>` : ''}
        </div>
        <div>
          <h4 style="font-family: var(--font-heading); font-size: 0.95rem; color: var(--text-dark); margin: 0;">Schedule Details</h4>
          ${scheduleHTML}
        </div>
      </div>

      ${addressHTML}

      <div style="margin-top: 1rem;">
        <h4 style="font-family: var(--font-heading); font-size: 0.95rem; color: var(--text-dark); margin: 0;">Special Instructions</h4>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem; font-style: italic; background: rgba(0,0,0,0.02); padding: 0.75rem; border-radius: 8px;">
          "${instructions}"
        </p>
      </div>

      ${itemsHTML}

      <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
        <button id="close-modal-footer-btn" class="btn-secondary" style="padding: 0.6rem 1.25rem; border-radius: 8px; font-size: 0.85rem; cursor:pointer;">Close Details</button>
      </div>
    `;

    // Attach click to footer close button
    const footerCloseBtn = document.getElementById('close-modal-footer-btn');
    if (footerCloseBtn) {
      footerCloseBtn.addEventListener('click', () => detailsDialog.close());
    }

    detailsDialog.showModal();
  }

  // --- Pricing Manager Setup ---
  const pricingBtn = document.getElementById('manage-pricing-btn');
  const pricingDialog = document.getElementById('pricing-manager-dialog');
  const pricingForm = document.getElementById('pricing-form');
  const pricingContainer = document.getElementById('pricing-inputs-container');
  const closePricingBtn = document.getElementById('close-pricing-btn');
  const cancelPricingBtn = document.getElementById('cancel-pricing-btn');

  const DEFAULT_SERVICES = [
    { id: 'shirt',    name: 'Shirt',    icon: '👔', price: 100 },
    { id: 'trousers', name: 'Trousers', icon: '👖', price: 150 },
    { id: 'suit',     name: 'Suit',     icon: '🤵', price: 250 },
    { id: 'saree',    name: 'Saree',    icon: '🥻', price: 350 },
    { id: 'coat',     name: 'Coat',     icon: '🧥', price: 500 },
    { id: 'shoes',    name: 'Shoes',    icon: '👟', price: 200 },
    { id: 'dresses',  name: 'Dresses',  icon: '👗', price: 300 },
  ];

  let currentServices = [];

  if (pricingBtn && pricingDialog) {
    pricingBtn.addEventListener('click', async () => {
      pricingContainer.innerHTML = '<p style="text-align:center; padding:1rem; color:var(--text-muted);">Syncing current prices...</p>';
      pricingDialog.showModal();

      try {
        const snap = await getDocs(collection(db, 'services'));
        currentServices = [];
        if (!snap.empty) {
          snap.forEach(docSnap => {
            currentServices.push({
              id: docSnap.id,
              ...docSnap.data()
            });
          });
          // Sort to keep order consistent
          currentServices.sort((a, b) => {
            const indexA = DEFAULT_SERVICES.findIndex(ds => ds.id === a.id);
            const indexB = DEFAULT_SERVICES.findIndex(ds => ds.id === b.id);
            return indexA - indexB;
          });
        } else {
          // Fallback to defaults
          currentServices = [...DEFAULT_SERVICES];
        }

        pricingContainer.innerHTML = currentServices.map(s => `
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:0.6rem;">
            <span style="font-size:0.95rem; font-weight:500; display:flex; align-items:center; gap:0.6rem;">
              <span style="font-size:1.2rem;">${s.icon || '🧺'}</span> ${s.name}
            </span>
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <span style="font-size:0.9rem; font-weight:600; color:var(--text-muted);">₹</span>
              <input type="number" name="${s.id}" value="${s.price}" min="0" required style="width:100px; padding:0.4rem 0.6rem; border:1px solid var(--border-color); border-radius:6px; font-weight:600; text-align:right; outline:none; font-family:inherit;">
            </div>
          </div>
        `).join('');

      } catch (err) {
        console.error('Error fetching services:', err);
        pricingContainer.innerHTML = `<p style="text-align:center; padding:1rem; color:var(--error);">Error: ${err.message}</p>`;
      }
    });
  }

  if (closePricingBtn && pricingDialog) {
    closePricingBtn.addEventListener('click', () => pricingDialog.close());
  }
  if (cancelPricingBtn && pricingDialog) {
    cancelPricingBtn.addEventListener('click', () => pricingDialog.close());
  }

  if (pricingForm && pricingDialog) {
    pricingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = pricingForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const formData = new FormData(pricingForm);
        for (const [serviceId, priceVal] of formData.entries()) {
          const s = currentServices.find(item => item.id === serviceId);
          if (s) {
            await setDoc(doc(db, 'services', serviceId), {
              name: s.name,
              icon: s.icon || '🧺',
              price: Number(priceVal)
            });
          }
        }
        alert('Pricing successfully updated in database!');
        pricingDialog.close();
      } catch (err) {
        console.error('Error saving pricing:', err);
        alert(`Failed to save pricing: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }
});
