document.addEventListener('DOMContentLoaded', () => {
  let allOrders = [];
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

  // Authenticate Session on Load
  checkAuth();

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      
      if (!data.authenticated) {
        window.location.href = 'admin-login.html';
        return;
      }
      
      sessionUser.textContent = `Staff: ${data.username}`;
      loadOrders();
      
    } catch (err) {
      console.error('Session check failed:', err);
      window.location.href = 'admin-login.html';
    }
  }

  // Fetch Orders
  async function loadOrders() {
    try {
      const res = await fetch('/api/admin/orders');
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = 'admin-login.html';
          return;
        }
        throw new Error('Failed to retrieve orders list.');
      }
      const data = await res.json();
      allOrders = data.orders;
      
      updateStats();
      renderTable();
      
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--error);">❌ Error loading operational queue: ${err.message}</td></tr>`;
    }
  }

  // Render Orders Table
  function renderTable() {
    const searchQuery = searchInput.value.toLowerCase().trim();
    const filterStatus = filterSelect.value;

    // Apply filters
    const filteredOrders = allOrders.filter(order => {
      // Status filter
      const matchesStatus = filterStatus === 'ALL' || order.status === filterStatus;
      
      // Search filter
      const matchesSearch = !searchQuery || 
        order.id.toLowerCase().includes(searchQuery) ||
        order.customerName.toLowerCase().includes(searchQuery) ||
        order.phone.includes(searchQuery) ||
        (order.email && order.email.toLowerCase().includes(searchQuery));
        
      return matchesStatus && matchesSearch;
    });

    if (filteredOrders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-muted);">No orders match the selected filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredOrders.map(order => {
      const instructions = order.specialInstructions ? `"${order.specialInstructions}"` : '—';
      const garmentsText = `${order.garmentCount}x [${order.garmentTypes.join(', ')}]`;
      
      // Status styling helper
      let selectClass = '';
      switch (order.status) {
        case 'Scheduled': selectClass = 'badge-scheduled'; break;
        case 'Picked Up': selectClass = 'badge-pickedup'; break;
        case 'In Cleaning': selectClass = 'badge-cleaning'; break;
        case 'Ready': selectClass = 'badge-ready'; break;
        case 'Completed': selectClass = 'badge-completed'; break;
      }

      return `
        <tr data-id="${order.id}">
          <td>
            <a href="track.html?id=${order.id}" style="color:var(--primary); font-family:var(--font-heading); font-weight:700; text-decoration:underline;">
              ${order.id}
            </a>
          </td>
          <td>
            <div style="font-weight:600;">${order.customerName}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.1rem;">📞 ${order.phone}</div>
            ${order.email ? `<div style="font-size:0.75rem; color:var(--text-muted);">✉ ${order.email}</div>` : ''}
          </td>
          <td>
            <div>${order.pickupDate}</div>
            <div style="font-size:0.8rem; color:var(--primary); font-weight:500;">⏱ ${order.pickupTime}</div>
          </td>
          <td>
            <span style="font-size:0.85rem; font-weight:500;">${garmentsText}</span>
          </td>
          <td style="max-width:200px;">
            <p style="font-size:0.8rem; color:var(--text-muted); font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${order.specialInstructions || ''}">
              ${instructions}
            </p>
          </td>
          <td>
            <select class="admin-select-status ${selectClass}" onchange="updateStatus('${order.id}', this.value)" style="font-weight:600; padding:0.4rem 0.6rem; border-radius:6px;">
              <option value="Scheduled" ${order.status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
              <option value="Picked Up" ${order.status === 'Picked Up' ? 'selected' : ''}>Picked Up</option>
              <option value="In Cleaning" ${order.status === 'In Cleaning' ? 'selected' : ''}>In Cleaning</option>
              <option value="Ready" ${order.status === 'Ready' ? 'selected' : ''}>Garments Ready</option>
              <option value="Completed" ${order.status === 'Completed' ? 'selected' : ''}>Completed</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Update Status API Call
  window.updateStatus = async function(id, newStatus) {
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update order status.');
      }
      
      // Update local state item
      const idx = allOrders.findIndex(o => o.id === id);
      if (idx !== -1) {
        allOrders[idx].status = newStatus;
        allOrders[idx].updatedAt = new Date().toISOString();
      }

      updateStats();
      renderTable();
      
    } catch (err) {
      console.error(err);
      alert(`Error updating order: ${err.message}`);
      loadOrders(); // Reload to sync state
    }
  };

  // Update Stats Blocks
  function updateStats() {
    // Total active includes all except Completed
    const activeOrders = allOrders.filter(o => o.status !== 'Completed');
    statTotal.textContent = activeOrders.length;
    
    statScheduled.textContent = allOrders.filter(o => o.status === 'Scheduled').length;
    statCleaning.textContent = allOrders.filter(o => o.status === 'In Cleaning').length;
    statReady.textContent = allOrders.filter(o => o.status === 'Ready').length;
  }

  // Filter & Search listeners
  searchInput.addEventListener('input', renderTable);
  filterSelect.addEventListener('change', renderTable);

  // Logout trigger
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Logout failed:', err);
      window.location.href = 'index.html';
    }
  });
});
