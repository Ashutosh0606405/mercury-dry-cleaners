const { db } = require('./firebase');
const { 
  collection, 
  getDocs, 
  getDoc, 
  setDoc, 
  doc, 
  updateDoc 
} = require('firebase/firestore');

// Mongoose interface matching functions
function connectDB() {
  console.log('Firebase Cloud Firestore client initialized.');
  seedDatabase();
}

// Initial Seeding for Firestore
async function seedDatabase() {
  try {
    const ordersCol = collection(db, 'orders');
    const snap = await getDocs(ordersCol);
    
    if (snap.empty) {
      console.log('Database Seeding: No orders found in Firestore. Seeding mock orders...');
      const now = new Date();
      
      const offsetDate = (days) => {
        const d = new Date(now);
        d.setDate(d.getDate() + days);
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
          status: 'Scheduled',
          createdAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
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
          createdAt: new Date(now.getTime() - 24 * 3600000).toISOString(),
          updatedAt: new Date(now.getTime() - 4 * 3600000).toISOString()
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
          createdAt: new Date(now.getTime() - 2 * 24 * 3600000).toISOString(),
          updatedAt: new Date(now.getTime() - 20 * 3600000).toISOString()
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
          createdAt: new Date(now.getTime() - 4 * 24 * 3600000).toISOString(),
          updatedAt: new Date(now.getTime() - 2 * 24 * 3600000).toISOString()
        }
      ];

      for (const order of mockOrders) {
        await setDoc(doc(db, 'orders', order.id), order);
      }
      console.log('Database Seeding: Firestore mock orders populated.');
    }
  } catch (err) {
    console.error('Error seeding Firestore database:', err);
    console.error('Please verify your Firestore Database location setting and rules allow reads/writes.');
  }
}

// Read all orders & pickups across both collections
async function getOrders() {
  const orders = [];
  
  // 1. Fetch from 'orders' collection
  try {
    const snap = await getDocs(collection(db, 'orders'));
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const idVal = data.orderId || data.id || docSnap.id;
      orders.push({
        docId: docSnap.id,
        collectionType: 'orders',
        id: idVal,
        orderId: idVal,
        ...data
      });
    });
  } catch (err) {
    console.error('Error fetching orders collection:', err);
  }

  // 2. Fetch from 'pickups' collection
  try {
    const snap = await getDocs(collection(db, 'pickups'));
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const idVal = data.orderId || data.id || docSnap.id;
      orders.push({
        docId: docSnap.id,
        collectionType: 'pickups',
        id: idVal,
        orderId: idVal,
        ...data
      });
    });
  } catch (err) {
    console.error('Error fetching pickups collection:', err);
  }

  return orders;
}

// Find order by ID or Phone (across both orders and pickups)
async function findOrder(queryText) {
  if (!queryText) return null;
  const normalizedQuery = queryText.trim().toUpperCase();
  
  // Fetch all orders/pickups from both collections
  const allOrders = await getOrders();
  
  // 1. Exact ID match (case-insensitive and format-agnostic)
  let match = allOrders.find(o => {
    const idVal = (o.orderId || o.id || '').toUpperCase();
    return idVal === normalizedQuery || idVal.replace(/[^A-Z0-9]/g, '') === normalizedQuery.replace(/[^A-Z0-9]/g, '');
  });
  if (match) return match;

  // 2. Search by phone number (strip formatting)
  const stripPhone = normalizedQuery.replace(/[^0-9]/g, '');
  if (stripPhone.length > 2) {
    match = allOrders.find(o => {
      const phoneVal = (o.phone || '').replace(/[^0-9]/g, '');
      return phoneVal.includes(stripPhone);
    });
  }

  return match || null;
}

// Create new pickup order
async function createOrder(orderData) {
  let orderId;
  let isUnique = false;
  
  // Generate and verify unique tracking ID
  while (!isUnique) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    orderId = `MERC-${rand}`;
    const docRef = doc(db, 'orders', orderId);
    const docSnap = await getDoc(docRef);
    isUnique = !docSnap.exists();
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

  await setDoc(doc(db, 'orders', orderId), newOrder);
  return newOrder;
}

// Update order status across both collections
async function updateOrderStatus(id, status) {
  const normalizedId = id.trim().toUpperCase();
  const allOrders = await getOrders();
  const found = allOrders.find(o => (o.orderId || o.id || '').toUpperCase() === normalizedId);
  
  if (!found) return null;

  const docRef = doc(db, found.collectionType, found.docId);
  const updatedData = {
    status: status,
    updatedAt: new Date().toISOString()
  };

  await updateDoc(docRef, updatedData);
  
  // Return the merged updated object
  const { docId, collectionType, ...originalData } = found;
  return { ...originalData, ...updatedData };
}

module.exports = {
  connectDB,
  getOrders,
  findOrder,
  createOrder,
  updateOrderStatus
};
