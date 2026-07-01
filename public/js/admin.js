import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── EMAILJS CONFIGURATION (FOR STATUS UPDATES) ──────────────────────────────
const EMAILJS_PUBLIC_KEY = "YOUR_EMAILJS_PUBLIC_KEY"; 
const EMAILJS_SERVICE_ID = "YOUR_EMAILJS_SERVICE_ID"; 
const EMAILJS_TEMPLATE_STATUS_UPDATE = "YOUR_EMAILJS_TEMPLATE_STATUS_UPDATE"; 

const ADMIN_EMAILS = [
  'naveensethi2007@yahoo.com',
  'admin@mercurycleaners.in'
];

// Load EmailJS SDK dynamically
if (EMAILJS_PUBLIC_KEY !== "YOUR_EMAILJS_PUBLIC_KEY") {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  script.onload = () => {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  };
  document.head.appendChild(script);
}

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
      if (!user || !ADMIN_EMAILS.includes(user.email)) {
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
      const pickupsSnap = await getDocs(query(collection(db, 'pickups'), orderBy('createdAt', 'desc')));
      const pickups = [];
      pickupsSnap.forEach(docSnap => {
        pickups.push({
          docId: docSnap.id,
          collectionType: 'pickups',
          ...docSnap.data()
        });
      });

      // 2. Fetch Orders
      const ordersSnap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
      const orders = [];
      ordersSnap.forEach(docSnap => {
        orders.push({
          docId: docSnap.id,
          collectionType: 'orders',
          ...docSnap.data()
        });
      });

      // Combine and sort by createdAt
      allItems = [...pickups, ...orders].sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
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
      
      // Compute Items Text
      let itemsText = '';
      if (item.collectionType === 'orders') {
        itemsText = item.items.map(i => `${i.name} (${i.qty})`).join(', ') + ` - ₹${item.totalAmount}`;
      } else {
        itemsText = `${item.garmentCount}x [${item.garmentTypes.join(', ')}] (Pickup request)`;
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
        
        // Trigger customer email notification via EmailJS if email is available and configured
        const item = allItems[idx];
        if (item.email && EMAILJS_PUBLIC_KEY !== "YOUR_EMAILJS_PUBLIC_KEY") {
          sendCustomerNotification(item.email, item.customerName, item.orderId, newStatus);
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

  // Send status update notification via EmailJS
  function sendCustomerNotification(email, name, orderId, status) {
    if (!window.emailjs) return;
    
    // Status visual label helper
    let cleanStatus = status;
    if (status === 'ready') cleanStatus = 'Ready for Delivery 🚚';
    else if (status === 'in cleaning') cleanStatus = 'In Cleaning 🧼';
    else if (status === 'picked up') cleanStatus = 'Picked Up 👕';
    else if (status === 'completed') cleanStatus = 'Delivered & Completed ✅';

    const templateParams = {
      to_email: email,
      to_name: name,
      order_id: orderId,
      status: cleanStatus.toUpperCase(),
      message: `Your dry cleaning order ${orderId} has been updated to: ${cleanStatus}.`
    };

    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_STATUS_UPDATE, templateParams)
      .then(() => {
        console.log(`Notification email sent to ${email} for order ${orderId} status: ${status}`);
      })
      .catch((err) => {
        console.error('EmailJS status update send failed:', err);
      });
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
