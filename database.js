const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Seeding
function seedDatabase() {
  // Seed admin if missing
  if (!fs.existsSync(ADMIN_FILE)) {
    const defaultAdmin = [
      {
        username: 'admin',
        // Hash for "mercurydrycleaners123"
        passwordHash: '$2a$10$Lle/4wJYiSvnpD.g9oMCjuqfsvxkG3wjn5FvmXpuKmdhDX2oh9BD2'
      }
    ];
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(defaultAdmin, null, 2), 'utf-8');
  }

  // Seed mock orders if missing
  if (!fs.existsSync(ORDERS_FILE)) {
    const now = new Date();
    
    // Helper to generate dates relative to now
    const offsetDate = (days, hours = 0) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      d.setHours(d.getHours() + hours);
      return d.toISOString().split('T')[0];
    };

    const mockOrders = [
      {
        id: 'MERC-8341',
        customerName: 'Sarah Jenkins',
        phone: '555-0192',
        email: 'sarah.j@example.com',
        pickupDate: offsetDate(1),
        pickupTime: '10:00 - 12:00',
        garmentCount: 5,
        garmentTypes: ['2x Suits', '3x Shirts'],
        specialInstructions: 'Dry clean only, extra starch on shirts please.',
        status: 'Scheduled', // Scheduled, Picked Up, In Cleaning, Ready, Completed
        createdAt: new Date(now.getTime() - 2 * 3600000).toISOString(), // 2 hours ago
        updatedAt: new Date(now.getTime() - 2 * 3600000).toISOString()
      },
      {
        id: 'MERC-4720',
        customerName: 'Marcus Vance',
        phone: '555-0143',
        email: 'marcus.vance@example.com',
        pickupDate: offsetDate(0),
        pickupTime: '14:00 - 16:00',
        garmentCount: 3,
        garmentTypes: ['1x Wool Coat', '2x Trousers'],
        specialInstructions: 'Please check the pockets. Front pocket had a small stain.',
        status: 'In Cleaning',
        createdAt: new Date(now.getTime() - 24 * 3600000).toISOString(), // 1 day ago
        updatedAt: new Date(now.getTime() - 4 * 3600000).toISOString() // 4 hours ago
      },
      {
        id: 'MERC-9104',
        customerName: 'Elena Rostova',
        phone: '555-0188',
        email: 'elena.rostova@example.com',
        pickupDate: offsetDate(-1),
        pickupTime: '09:00 - 11:00',
        garmentCount: 2,
        garmentTypes: ['1x Silk Dress', '1x Evening Gown'],
        specialInstructions: 'Very delicate silk fabrics. Hand wash or gentle dry clean.',
        status: 'Ready',
        createdAt: new Date(now.getTime() - 2 * 24 * 3600000).toISOString(), // 2 days ago
        updatedAt: new Date(now.getTime() - 20 * 3600000).toISOString() // 20 hours ago
      },
      {
        id: 'MERC-2291',
        customerName: 'Robert Chen',
        phone: '555-0112',
        email: 'robert.chen@example.com',
        pickupDate: offsetDate(-3),
        pickupTime: '16:00 - 18:00',
        garmentCount: 6,
        garmentTypes: ['6x Cotton Shirts'],
        specialInstructions: 'Hang on wood hangers please.',
        status: 'Completed',
        createdAt: new Date(now.getTime() - 4 * 24 * 3600000).toISOString(), // 4 days ago
        updatedAt: new Date(now.getTime() - 2 * 24 * 3600000).toISOString() // 2 days ago
      }
    ];
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(mockOrders, null, 2), 'utf-8');
  }
}

// Read orders
function getOrders() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) return [];
    const data = fs.readFileSync(ORDERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading orders database:', err);
    return [];
  }
}

// Write orders
function saveOrders(orders) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing orders database:', err);
    return false;
  }
}

// Get order by ID or Phone
function findOrder(query) {
  const orders = getOrders();
  const normalizedQuery = query.trim().toLowerCase();
  
  // Try finding by exact ID first (case-insensitive)
  let order = orders.find(o => o.id.toLowerCase() === normalizedQuery);
  
  // If not found, try searching by normalized phone number (strip spaces/dashes)
  if (!order) {
    const stripPhone = p => p.replace(/[^0-9]/g, '');
    const cleanQuery = stripPhone(normalizedQuery);
    if (cleanQuery.length > 2) {
      order = orders.find(o => stripPhone(o.phone).includes(cleanQuery));
    }
  }
  
  return order;
}

// Create new pickup order
function createOrder(orderData) {
  const orders = getOrders();
  
  // Generate tracking ID: MERC-XXXX where XXXX is a 4-digit number
  let orderId;
  let isUnique = false;
  while (!isUnique) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    orderId = `MERC-${rand}`;
    isUnique = !orders.some(o => o.id === orderId);
  }

  const newOrder = {
    id: orderId,
    customerName: orderData.customerName,
    phone: orderData.phone,
    email: orderData.email,
    pickupDate: orderData.pickupDate,
    pickupTime: orderData.pickupTime,
    garmentCount: parseInt(orderData.garmentCount, 10) || 1,
    garmentTypes: Array.isArray(orderData.garmentTypes) ? orderData.garmentTypes : [orderData.garmentTypes],
    specialInstructions: orderData.specialInstructions || '',
    status: 'Scheduled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  orders.push(newOrder);
  saveOrders(orders);
  return newOrder;
}

// Update order status
function updateOrderStatus(id, status) {
  const orders = getOrders();
  const index = orders.findIndex(o => o.id === id);
  if (index === -1) return null;

  orders[index].status = status;
  orders[index].updatedAt = new Date().toISOString();
  saveOrders(orders);
  return orders[index];
}

// Get admin accounts
function getAdmins() {
  try {
    if (!fs.existsSync(ADMIN_FILE)) return [];
    const data = fs.readFileSync(ADMIN_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading admin database:', err);
    return [];
  }
}

// Seed the DB on import
seedDatabase();

module.exports = {
  getOrders,
  findOrder,
  createOrder,
  updateOrderStatus,
  getAdmins
};
