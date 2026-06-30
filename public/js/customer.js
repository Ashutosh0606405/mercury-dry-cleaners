import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const errorContainer = document.getElementById('error-container');
const errorText = document.getElementById('error-text');

// --- DETECT ACTIVE PAGE ---
const isLoginPage = !!loginForm;
const isDashboardPage = !!document.getElementById('customer-name');

if (isLoginPage) {
  // Hide error container on start
  if (errorContainer) errorContainer.style.display = 'none';

  // Toggle Tab switches
  tabLogin.addEventListener('click', () => {
    tabLogin.className = 'btn-primary';
    tabLogin.style.background = 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)';
    tabRegister.className = 'btn-secondary';
    tabRegister.style.background = 'none';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    if (errorContainer) errorContainer.style.display = 'none';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.className = 'btn-primary';
    tabRegister.style.background = 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)';
    tabLogin.className = 'btn-secondary';
    tabLogin.style.background = 'none';
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    if (errorContainer) errorContainer.style.display = 'none';
  });

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorContainer) errorContainer.style.display = 'none';

    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');

    let isValid = true;
    if (!emailInput.value.trim() || !emailInput.checkValidity()) {
      emailInput.setAttribute('aria-invalid', 'true');
      isValid = false;
    } else {
      emailInput.removeAttribute('aria-invalid');
    }

    if (!passwordInput.value.trim()) {
      passwordInput.setAttribute('aria-invalid', 'true');
      isValid = false;
    } else {
      passwordInput.removeAttribute('aria-invalid');
    }

    if (!isValid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying Account...';

    try {
      await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
      window.location.href = 'customer.html';
    } catch (err) {
      console.error(err);
      if (errorText) {
        errorText.textContent = getFriendlyErrorMessage(err.code);
        errorContainer.style.display = 'flex';
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In to Portal';
    }
  });

  // Register handler
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorContainer) errorContainer.style.display = 'none';

    const nameInput = document.getElementById('reg-name');
    const emailInput = document.getElementById('reg-email');
    const phoneInput = document.getElementById('reg-phone');
    const passwordInput = document.getElementById('reg-password');
    const passConfInput = document.getElementById('reg-password-conf');
    const submitBtn = document.getElementById('reg-submit-btn');

    let isValid = true;

    // Validation checks
    if (!nameInput.value.trim() || nameInput.value.trim().length < 2) {
      nameInput.setAttribute('aria-invalid', 'true');
      isValid = false;
    } else {
      nameInput.removeAttribute('aria-invalid');
    }

    if (!emailInput.value.trim() || !emailInput.checkValidity()) {
      emailInput.setAttribute('aria-invalid', 'true');
      isValid = false;
    } else {
      emailInput.removeAttribute('aria-invalid');
    }

    if (!phoneInput.value.trim() || !phoneInput.checkValidity()) {
      phoneInput.setAttribute('aria-invalid', 'true');
      isValid = false;
    } else {
      phoneInput.removeAttribute('aria-invalid');
    }

    if (!passwordInput.value.trim() || passwordInput.value.length < 6) {
      passwordInput.setAttribute('aria-invalid', 'true');
      isValid = false;
    } else {
      passwordInput.removeAttribute('aria-invalid');
    }

    if (passwordInput.value !== passConfInput.value) {
      passConfInput.setAttribute('aria-invalid', 'true');
      isValid = false;
    } else {
      passConfInput.removeAttribute('aria-invalid');
    }

    if (!isValid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    try {
      const email = emailInput.value.trim();
      const name = nameInput.value.trim();
      const phone = phoneInput.value.trim();
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, passwordInput.value);
      const user = userCredential.user;

      // Save user profile to Firestore
      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        phone,
        createdAt: new Date().toISOString()
      });

      window.location.href = 'customer.html';

    } catch (err) {
      console.error(err);
      if (errorText) {
        errorText.textContent = getFriendlyErrorMessage(err.code);
        errorContainer.style.display = 'flex';
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register & Log In';
    }
  });
}

if (isDashboardPage) {
  const custWelcomeHeader = document.getElementById('customer-welcome-header');
  const custName = document.getElementById('customer-name');
  const profName = document.getElementById('profile-name');
  const profEmail = document.getElementById('profile-email');
  const profPhone = document.getElementById('profile-phone');
  
  const statTotal = document.getElementById('stat-total');
  const statActive = document.getElementById('stat-active');
  const statReady = document.getElementById('stat-ready');
  
  const tbody = document.getElementById('orders-tbody');
  const emptyState = document.getElementById('empty-state');
  const tableContainer = document.querySelector('.admin-table-container');
  const logoutBtn = document.getElementById('logout-btn');

  // Verify auth session
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // Not logged in, redirect to portal login
      window.location.href = 'customer-login.html';
      return;
    }

    try {
      // 1. Fetch User profile document
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let name = user.email.split('@')[0];
      let phone = '—';
      
      if (userDocSnap.exists()) {
        const profile = userDocSnap.data();
        name = profile.name;
        phone = profile.phone;
      }
      
      // Populate Profile Sidebar & Greeting
      custName.textContent = name;
      custWelcomeHeader.textContent = `Hello, ${name.split(' ')[0]}`;
      profName.textContent = name;
      profEmail.textContent = user.email;
      profPhone.textContent = phone;

      // 2. Fetch Customer Orders (where email matching)
      const ordersCol = collection(db, "orders");
      const q = query(ordersCol, where("email", "==", user.email));
      const querySnap = await getDocs(q);
      
      const orders = [];
      querySnap.forEach(doc => {
        orders.push(doc.data());
      });

      // Sort: Scheduled first, then active, then completed (matching admin layout)
      const statusPriority = {
        'Scheduled': 1,
        'Picked Up': 2,
        'In Cleaning': 3,
        'Ready': 4,
        'Completed': 5
      };
      
      orders.sort((a, b) => {
        const priorityA = statusPriority[a.status] || 99;
        const priorityB = statusPriority[b.status] || 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });

      // Update statistics
      statTotal.textContent = orders.length;
      statActive.textContent = orders.filter(o => o.status !== 'Completed').length;
      statReady.textContent = orders.filter(o => o.status === 'Ready').length;

      // Render table
      if (orders.length === 0) {
        tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
      } else {
        tableContainer.style.display = 'block';
        emptyState.style.display = 'none';
        
        tbody.innerHTML = orders.map(order => {
          let badgeClass = '';
          switch (order.status) {
            case 'Scheduled': badgeClass = 'badge-scheduled'; break;
            case 'Picked Up': badgeClass = 'badge-pickedup'; break;
            case 'In Cleaning': badgeClass = 'badge-cleaning'; break;
            case 'Ready': badgeClass = 'badge-ready'; break;
            case 'Completed': badgeClass = 'badge-completed'; break;
          }

          return `
            <tr>
              <td>
                <a href="track.html?id=${order.id}" style="color:var(--primary); font-family:var(--font-heading); font-weight:700; text-decoration:underline;">
                  ${order.id}
                </a>
              </td>
              <td>
                <div>${order.pickupDate}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">⏱ ${order.pickupTime}</div>
              </td>
              <td>${order.garmentCount} items</td>
              <td>
                <span style="font-size:0.85rem; font-weight:500;">${order.garmentTypes.join(', ')}</span>
              </td>
              <td>
                <span class="badge ${badgeClass}">${order.status}</span>
              </td>
              <td>
                <a href="track.html?id=${order.id}" class="btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.8rem; border-radius:6px; display:inline-flex; align-items:center;">
                  Track Status
                </a>
              </td>
            </tr>
          `;
        }).join('');
      }

    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--error);">❌ Error loading order history: ${err.message}</td></tr>`;
    }
  });

  // Logout Trigger
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Logout failed:', err);
      window.location.href = 'index.html';
    }
  });
}

// Translate raw Firebase Auth error codes into reader-friendly warnings
function getFriendlyErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'The email address format is invalid.';
    case 'auth/user-disabled':
      return 'This customer account has been deactivated.';
    case 'auth/user-not-found':
      return 'No registered account found with that email address.';
    case 'auth/wrong-password':
      return 'Incorrect password. Check details and try again.';
    case 'auth/email-already-in-use':
      return 'An account is already registered with this email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Must be at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/Password logins are not enabled. Contact support.';
    case 'auth/network-request-failed':
      return 'Server timeout. Check your internet connection.';
    default:
      return 'Account verification failed. Please try again.';
  }
}
