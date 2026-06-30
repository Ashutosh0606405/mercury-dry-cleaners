const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Session store
const SESSIONS = new Map();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
function requireAuth(req, res, next) {
  const token = req.cookies.session_token;
  if (!token || !SESSIONS.has(token)) {
    return res.status(401).json({ error: 'Unauthorized access. Please login.' });
  }
  
  // Extend session duration
  const session = SESSIONS.get(token);
  session.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  SESSIONS.set(token, session);
  
  req.adminUser = session.username;
  next();
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of SESSIONS.entries()) {
    if (session.expiresAt < now) {
      SESSIONS.delete(token);
    }
  }
}, 60 * 60 * 1000); // Clean every hour

// --- API ROUTES ---

// 1. Submit a pickup request (Public)
app.post('/api/orders/pickup', (req, res) => {
  try {
    const {
      customerName,
      phone,
      email,
      pickupDate,
      pickupTime,
      garmentCount,
      garmentTypes,
      specialInstructions
    } = req.body;

    // Server-side validation
    if (!customerName || !phone || !pickupDate || !pickupTime) {
      return res.status(400).json({ error: 'Required fields are missing.' });
    }

    const order = db.createOrder({
      customerName,
      phone,
      email: email || '',
      pickupDate,
      pickupTime,
      garmentCount: garmentCount || 1,
      garmentTypes: garmentTypes || ['Garments'],
      specialInstructions: specialInstructions || ''
    });

    res.status(201).json({
      success: true,
      message: 'Pickup scheduled successfully!',
      order
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'An error occurred while scheduling your pickup.' });
  }
});

// 2. Track an order by ID or phone number (Public)
app.get('/api/orders/track', (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    const order = db.findOrder(query);
    if (!order) {
      return res.status(404).json({ error: 'No order found matching your query.' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Error tracking order:', err);
    res.status(500).json({ error: 'An error occurred while tracking your order.' });
  }
});

// 3. Admin Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const admins = db.getAdmins();
    const admin = admins.find(a => a.username.toLowerCase() === username.trim().toLowerCase());

    if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Generate random secure token
    const token = crypto.randomBytes(32).toString('hex');
    SESSIONS.set(token, {
      username: admin.username,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    // Set HTTP-only cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({ success: true, message: 'Logged in successfully.' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'An error occurred during authentication.' });
  }
});

// 4. Admin Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies.session_token;
  if (token) {
    SESSIONS.delete(token);
    res.clearCookie('session_token');
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// 5. Check Session Status (Public API helper for frontend redirect logic)
app.get('/api/auth/status', (req, res) => {
  const token = req.cookies.session_token;
  if (token && SESSIONS.has(token)) {
    return res.json({ authenticated: true, username: SESSIONS.get(token).username });
  }
  res.json({ authenticated: false });
});

// 6. Get All Orders (Admin Protected)
app.get('/api/admin/orders', requireAuth, (req, res) => {
  try {
    const orders = db.getOrders();
    // Sort orders: Scheduled first (by pickup date desc), then active, then completed
    const statusPriority = {
      'Scheduled': 1,
      'Picked Up': 2,
      'In Cleaning': 3,
      'Ready': 4,
      'Completed': 5
    };
    
    const sortedOrders = [...orders].sort((a, b) => {
      const priorityA = statusPriority[a.status] || 99;
      const priorityB = statusPriority[b.status] || 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      
      // Sort identical statuses by updatedAt desc
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    res.json({ success: true, orders: sortedOrders });
  } catch (err) {
    console.error('Error fetching admin orders:', err);
    res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
});

// 7. Update Order Status (Admin Protected)
app.patch('/api/admin/orders/:id', requireAuth, (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['Scheduled', 'Picked Up', 'In Cleaning', 'Ready', 'Completed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status.' });
    }

    const updatedOrder = db.updateOrderStatus(orderId, status);
    if (!updatedOrder) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}.`,
      order: updatedOrder
    });
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Mercury Dry Cleaners backend is active!`);
  console.log(`Running on: http://localhost:${PORT}`);
  console.log(`========================================`);
});
