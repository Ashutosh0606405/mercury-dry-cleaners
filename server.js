require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./database');
const { auth } = require('./firebase');
const { signInWithEmailAndPassword } = require('firebase/auth');
const { sendPickupConfirmation, sendOrderConfirmation, sendStatusUpdate } = require('./mailer');

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
const apiRouter = express.Router();

// 1. Submit a pickup request (Public)
apiRouter.post('/orders/pickup', async (req, res) => {
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

// 1b. Send pickup booking confirmation email (Public)
apiRouter.post('/email/pickup-confirmation', async (req, res) => {
  try {
    const { customerName, email, orderId, pickupDate, pickupTime, garmentCount, garmentTypes, specialInstructions } = req.body;
    if (!email || !orderId) {
      return res.status(400).json({ error: 'Missing required fields: email and orderId.' });
    }
    await sendPickupConfirmation({ customerName, email, orderId, pickupDate, pickupTime, garmentCount, garmentTypes, specialInstructions });
    res.json({ success: true, message: 'Pickup confirmation email sent.' });
  } catch (err) {
    console.error('Pickup email error:', err);
    res.status(500).json({ error: 'Failed to send confirmation email.' });
  }
});

// 1c. Send order confirmation email (Public)
apiRouter.post('/email/order-confirmation', async (req, res) => {
  try {
    const { customerName, email, orderId, items, totalAmount, address, notes } = req.body;
    if (!email || !orderId) {
      return res.status(400).json({ error: 'Missing required fields: email and orderId.' });
    }
    await sendOrderConfirmation({ customerName, email, orderId, items, totalAmount, address, notes });
    res.json({ success: true, message: 'Order confirmation email sent.' });
  } catch (err) {
    console.error('Order email error:', err);
    res.status(500).json({ error: 'Failed to send confirmation email.' });
  }
});

// 1d. Send status update email (Public/Admin)
apiRouter.post('/email/status-update', async (req, res) => {
  try {
    const { customerName, email, orderId, newStatus } = req.body;
    if (!email || !orderId || !newStatus) {
      return res.status(400).json({ error: 'Missing required fields: email, orderId, and newStatus.' });
    }
    await sendStatusUpdate({ customerName, email, orderId, newStatus });
    res.json({ success: true, message: 'Status update email sent.' });
  } catch (err) {
    console.error('Status update email error:', err);
    res.status(500).json({ error: 'Failed to send status update email.' });
  }
});

// 2. Track an order by ID or phone number (Public)
apiRouter.get('/orders/track', async (req, res) => {
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
apiRouter.post('/auth/login', async (req, res) => {
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

    if (user.email !== 'mercurydrycleaners22@gmail.com') {
      return res.status(403).json({ error: 'Access denied. You do not have administrator permissions.' });
    }

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
apiRouter.post('/auth/logout', (req, res) => {
  const token = req.cookies.session_token;
  if (token) {
    SESSIONS.delete(token);
    res.clearCookie('session_token');
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// 5. Check Session Status
apiRouter.get('/auth/status', (req, res) => {
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
apiRouter.get('/admin/orders', requireAuth, async (req, res) => {
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
apiRouter.patch('/admin/orders/:id', requireAuth, async (req, res) => {
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

    // ── Send status update email to customer if they have an email ──
    if (updatedOrder.email) {
      sendStatusUpdate({
        customerName: updatedOrder.customerName,
        email: updatedOrder.email,
        orderId: updatedOrder.id || orderId,
        newStatus: status
      }).catch(err => console.error('Status email failed:', err.message));
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

// Mount the router under both prefix-less and /api prefixes
app.use('/api', apiRouter);
app.use('/', apiRouter);


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

