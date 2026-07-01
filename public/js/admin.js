import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc
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
            <a href="track.html?id=${item.orderId}" style="color:var(--primary); font-family:var(--font-heading); font-weight:700; text-decoration:underline;">
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
});
