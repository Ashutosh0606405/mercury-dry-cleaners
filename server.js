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

// --- TWILIO SMS HELPER ---
async function sendSMS(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    console.log('[Twilio SMS] Missing environment variables. Skipping SMS.');
    return { success: false, reason: 'credentials_missing' };
  }

  // Ensure to number has country code prefix
  let formattedTo = to.trim().replace(/[\s\-]/g, '');
  if (formattedTo.length === 10) {
    formattedTo = '+91' + formattedTo;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const authHeader = 'Basic ' + Buffer.from(sid + ':' + token).toString('base64');

  try {
    const params = new URLSearchParams();
    params.append('To', formattedTo);
    params.append('From', from);
    params.append('Body', body);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (response.ok) {
      console.log(`[Twilio SMS] Sent successfully to ${formattedTo}. Message SID: ${data.sid}`);
      return { success: true, sid: data.sid };
    } else {
      console.error(`[Twilio SMS] API Error: ${data.message}`);
      return { success: false, reason: data.message };
    }
  } catch (err) {
    console.error('[Twilio SMS] Fetch Error:', err);
    return { success: false, error: err.message };
  }
}

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

// 1b. Send pickup booking confirmation email & SMS (Public)
apiRouter.post('/email/pickup-confirmation', async (req, res) => {
  try {
    const { customerName, email, phone, orderId, pickupDate, pickupTime, garmentCount, garmentTypes, specialInstructions, pickupFee } = req.body;
    if ((!email && !phone) || !orderId) {
      return res.status(400).json({ error: 'Missing contact info (email/phone) or orderId.' });
    }
    
    // Send Email (only if email is provided)
    if (email) {
      await sendPickupConfirmation({ customerName, email, orderId, pickupDate, pickupTime, garmentCount, garmentTypes, specialInstructions, pickupFee });
    }
    
    // Send SMS (if phone is provided)
    if (phone) {
      const fee = Number(pickupFee || 0);
      let smsBody = `Hi ${customerName}, your dry cleaning pickup is scheduled for ${pickupDate} during ${pickupTime}. Order ID: ${orderId}. `;
      if (fee > 0) {
        smsBody += `A pickup fee of ₹${fee} is applicable (COD). `;
      } else {
        smsBody += `Pickup is FREE. `;
      }
      smsBody += `Thanks, Mercury Dry Cleaners!`;
      await sendSMS(phone, smsBody);
    }
    
    res.json({ success: true, message: 'Pickup confirmation processed.' });
  } catch (err) {
    console.error('Pickup notification error:', err);
    res.status(500).json({ error: 'Failed to process pickup notification.' });
  }
});

// 1c. Send order confirmation email & SMS (Public)
apiRouter.post('/email/order-confirmation', async (req, res) => {
  try {
    const { customerName, email, phone, orderId, items, totalAmount, address, notes } = req.body;
    if ((!email && !phone) || !orderId) {
      return res.status(400).json({ error: 'Missing contact info (email/phone) or orderId.' });
    }
    
    // Send Email (only if email is provided)
    if (email) {
      await sendOrderConfirmation({ customerName, email, orderId, items, totalAmount, address, notes });
    }
    
    // Send SMS (if phone is provided)
    if (phone) {
      const smsBody = `Hi ${customerName}, your dry cleaning order ${orderId} has been received! Total amount: ₹${totalAmount} (COD). We will update you once it goes into cleaning. Thanks, Mercury Dry Cleaners!`;
      await sendSMS(phone, smsBody);
    }
    
    res.json({ success: true, message: 'Order confirmation processed.' });
  } catch (err) {
    console.error('Order notification error:', err);
    res.status(500).json({ error: 'Failed to process order notification.' });
  }
});

// 1d. Send status update email & SMS (Public/Admin)
apiRouter.post('/email/status-update', async (req, res) => {
  try {
    const { customerName, email, phone, orderId, newStatus } = req.body;
    if ((!email && !phone) || !orderId || !newStatus) {
      return res.status(400).json({ error: 'Missing contact info (email/phone), orderId, or newStatus.' });
    }
    
    // Send Email (only if email is provided)
    if (email) {
      await sendStatusUpdate({ customerName, email, orderId, newStatus });
    }
    
    // Send SMS (if phone is provided)
    if (phone) {
      const smsBody = `Hi ${customerName}, the status of your dry cleaning order ${orderId} has been updated to: ${newStatus.toUpperCase()}. Track your progress here: https://mercury-dry-cleaners.vercel.app/track.html?id=${orderId} . Thanks, Mercury Dry Cleaners!`;
      await sendSMS(phone, smsBody);
    }
    
    res.json({ success: true, message: 'Status update processed.' });
  } catch (err) {
    console.error('Status update notification error:', err);
    res.status(500).json({ error: 'Failed to process status update notification.' });
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

