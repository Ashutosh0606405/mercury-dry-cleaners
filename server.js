require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./database');
const { auth } = require('./firebase');
const { signInWithEmailAndPassword } = require('firebase/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Session store (in-memory mapping of session tokens to authenticated user emails)
const SESSIONS = new Map();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Connect database client (Trigger Firestore check & seed)
db.connectDB();

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
  
  req.adminUser = session.email;
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
app.post('/api/orders/pickup', async (req, res) => {
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

    const order = await db.createOrder({
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
app.get('/api/orders/track', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    const order = await db.findOrder(query);
    if (!order) {
      return res.status(404).json({ error: 'No order found matching your query.' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Error tracking order:', err);
    res.status(500).json({ error: 'An error occurred while tracking your order.' });
  }
});

// 3. Admin Login (Authenticates via Firebase Authentication)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required.' });
    }

    // Map default admin username to full email for Firebase Auth
    const email = username.includes('@') 
      ? username.trim() 
      : `${username.trim().toLowerCase()}@mercurydrycleaners.com`;

    // Perform Firebase Authentication sign-in
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Generate secure session token mapping to this session
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    
    SESSIONS.set(token, {
      email: user.email,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    // Set secure cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: false, // Set to true if deploying with HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({ 
      success: true, 
      message: 'Logged in successfully via Firebase Auth.',
      user: { email: user.email }
    });
  } catch (err) {
    console.error('Firebase Auth error:', err.message);
    
    // Provide user friendly message depending on Firebase Auth errors
    let clientMessage = 'Invalid username/email or password.';
    if (err.code === 'auth/invalid-credential') {
      clientMessage = 'Invalid credentials. Please verify your account password.';
    } else if (err.code === 'auth/user-not-found') {
      clientMessage = 'No administrative account found with those details.';
    } else if (err.code === 'auth/network-request-failed') {
      clientMessage = 'Authentication server connection error. Verify your internet connection.';
    }
    
    res.status(401).json({ error: clientMessage });
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

// 5. Check Session Status
app.get('/api/auth/status', (req, res) => {
  const token = req.cookies.session_token;
  if (token && SESSIONS.has(token)) {
    const session = SESSIONS.get(token);
    // Display short name
    const shortName = session.email.split('@')[0];
    return res.json({ authenticated: true, username: shortName });
  }
  res.json({ authenticated: false });
});

// 6. Get All Orders (Admin Protected)
app.get('/api/admin/orders', requireAuth, async (req, res) => {
  try {
    const orders = await db.getOrders();
    
    // Sort orders: Scheduled first, then Picked Up, In Cleaning, Ready, and Completed last
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
app.patch('/api/admin/orders/:id', requireAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['Scheduled', 'Picked Up', 'In Cleaning', 'Ready', 'Completed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status.' });
    }

    const updatedOrder = await db.updateOrderStatus(orderId, status);
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
// Only start the server listening if not imported as a Vercel serverless function
if (process.env.NODE_ENV !== 'production' || process.env.PORT) {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`Mercury Dry Cleaners backend is active with Firebase!`);
    console.log(`Running on: http://localhost:${PORT}`);
    console.log(`==================================================`);
  });
}

module.exports = app;

