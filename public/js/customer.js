import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber
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
const phoneForm = document.getElementById('phone-form');
const authTabs = document.getElementById('auth-tabs');
const socialLoginSection = document.getElementById('social-login-section');

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const errorContainer = document.getElementById('error-container');
const errorText = document.getElementById('error-text');

// Form Switch Triggers
const toPhoneBtn = document.getElementById('to-phone-btn');
const toEmailBtn = document.getElementById('to-email-btn');
const googleBtn = document.getElementById('google-btn');

// Phone Flow Phase Elements
const phoneInputPhase = document.getElementById('phone-input-phase');
const phoneOtpPhase = document.getElementById('phone-otp-phase');
const phoneInput = document.getElementById('phone-number');
const phoneSendBtn = document.getElementById('phone-send-btn');
const otpInput = document.getElementById('phone-otp');
const phoneVerifyBtn = document.getElementById('phone-verify-btn');
const phoneBackBtn = document.getElementById('phone-back-btn');
const sentPhoneDisplay = document.getElementById('sent-phone-display');

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
    phoneForm.style.display = 'none';
    if (errorContainer) errorContainer.style.display = 'none';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.className = 'btn-primary';
    tabRegister.style.background = 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)';
    tabLogin.className = 'btn-secondary';
    tabLogin.style.background = 'none';
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    phoneForm.style.display = 'none';
    if (errorContainer) errorContainer.style.display = 'none';
  });

  // Switch between Email and Phone Sign In
  toPhoneBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'none';
    authTabs.style.display = 'none';
    phoneForm.style.display = 'block';
    phoneInputPhase.style.display = 'block';
    phoneOtpPhase.style.display = 'none';
    if (errorContainer) errorContainer.style.display = 'none';
  });

  toEmailBtn.addEventListener('click', (e) => {
    e.preventDefault();
    phoneForm.style.display = 'none';
    authTabs.style.display = 'flex';
    loginForm.style.display = 'block';
    tabLogin.click(); // Trigger login tab active
  });

  // --- GOOGLE AUTHENTICATION FLOW ---
  googleBtn.addEventListener('click', async () => {
    if (errorContainer) errorContainer.style.display = 'none';
    const originalText = googleBtn.querySelector('span').textContent;
    googleBtn.querySelector('span').textContent = 'Connecting Google...';
    googleBtn.disabled = true;

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if profile exists, if not, write profile document
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await setDoc(docRef, {
          name: user.displayName || 'Google Account',
          email: user.email,
          phone: user.phoneNumber || '—',
          createdAt: new Date().toISOString()
        });
      }

      window.location.href = 'customer.html';

    } catch (err) {
      console.error(err);
      if (errorText) {
        errorText.textContent = getFriendlyErrorMessage(err.code);
        errorContainer.style.display = 'flex';
      }
      googleBtn.querySelector('span').textContent = originalText;
      googleBtn.disabled = false;
    }
  });

  // --- PHONE AUTHENTICATION FLOW ---
  phoneSendBtn.addEventListener('click', async () => {
    if (errorContainer) errorContainer.style.display = 'none';
    
    let phoneNumberValue = phoneInput.value.trim().replace(/[\s-]/g, '');
    if (phoneNumberValue.length === 10 && !phoneNumberValue.startsWith('+')) {
      phoneNumberValue = '+91' + phoneNumberValue;
    } else if (phoneNumberValue.length === 12 && phoneNumberValue.startsWith('91')) {
      phoneNumberValue = '+' + phoneNumberValue;
    }

    if (!phoneNumberValue || !phoneNumberValue.startsWith('+') || phoneNumberValue.length < 10) {
      phoneInput.setAttribute('aria-invalid', 'true');
      if (errorText) {
        errorText.textContent = 'Enter a valid Indian phone number (e.g. +91 99999-99999).';
        errorContainer.style.display = 'flex';
      }
      return;
    }
    phoneInput.removeAttribute('aria-invalid');

    phoneSendBtn.disabled = true;
    phoneSendBtn.textContent = 'Sending SMS...';

    try {
      // Destroy old verifier if it exists to avoid duplicate reCAPTCHA errors
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch(e) {}
        window.recaptchaVerifier = null;
      }

      // Create a fresh reCAPTCHA verifier each time
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': () => {},
        'expired-callback': () => {
          if (errorText) {
            errorText.textContent = 'reCAPTCHA expired. Please try again.';
            errorContainer.style.display = 'flex';
          }
        }
      });

      // Render it explicitly before use
      await window.recaptchaVerifier.render();

      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumberValue, window.recaptchaVerifier);
      window.confirmationResult = confirmationResult;

      sentPhoneDisplay.textContent = phoneNumberValue;
      phoneInputPhase.style.display = 'none';
      socialLoginSection.style.display = 'none';
      phoneOtpPhase.style.display = 'block';

    } catch (err) {
      console.error(err);
      // Clear broken verifier so next attempt starts fresh
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch(e) {}
        window.recaptchaVerifier = null;
      }
      if (errorText) {
        errorText.textContent = `Error [${err.code}]: ${getFriendlyErrorMessage(err.code)}`;
        errorContainer.style.display = 'flex';
      }
    } finally {
      phoneSendBtn.disabled = false;
      phoneSendBtn.textContent = 'Send Verification Code';
    }
  });

  phoneVerifyBtn.addEventListener('click', async () => {
    if (errorContainer) errorContainer.style.display = 'none';

    const code = otpInput.value.trim();
    if (!code || code.length !== 6) {
      otpInput.setAttribute('aria-invalid', 'true');
      return;
    }
    otpInput.removeAttribute('aria-invalid');

    phoneVerifyBtn.disabled = true;
    phoneVerifyBtn.textContent = 'Verifying...';

    try {
      const result = await window.confirmationResult.confirm(code);
      const user = result.user;

      // Check if profile exists, if not, write profile document
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await setDoc(docRef, {
          name: 'Verified Mobile Customer',
          email: user.email || '—',
          phone: user.phoneNumber,
          createdAt: new Date().toISOString()
        });
      }

      window.location.href = 'customer.html';

    } catch (err) {
      console.error(err);
      if (errorText) {
        errorText.textContent = getFriendlyErrorMessage(err.code);
        errorContainer.style.display = 'flex';
      }
      phoneVerifyBtn.disabled = false;
      phoneVerifyBtn.textContent = 'Verify Code';
    }
  });

  phoneBackBtn.addEventListener('click', () => {
    phoneOtpPhase.style.display = 'none';
    phoneInputPhase.style.display = 'block';
    socialLoginSection.style.display = 'block';
    otpInput.value = '';
    if (errorContainer) errorContainer.style.display = 'none';
  });

  // --- EMAIL/PASSWORD SIGN IN FLOW ---
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

  // --- EMAIL/PASSWORD REGISTRATION FLOW ---
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
      
      let phone = phoneInput.value.trim().replace(/[\s-]/g, '');
      if (phone.length === 10 && !phone.startsWith('+')) {
        phone = '+91' + phone;
      } else if (phone.length === 12 && phone.startsWith('91')) {
        phone = '+' + phone;
      }
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, passwordInput.value);
      const user = userCredential.user;

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
      window.location.href = 'customer-login.html';
      return;
    }

    try {
      // 1. Fetch User profile document
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let name = user.email ? user.email.split('@')[0] : 'Valued Customer';
      let phone = user.phoneNumber || '—';
      let email = user.email || '—';
      
      if (userDocSnap.exists()) {
        const profile = userDocSnap.data();
        name = profile.name;
        phone = profile.phone;
        email = profile.email;
      }
      
      // Populate Profile Sidebar & Greeting
      custName.textContent = name;
      custWelcomeHeader.textContent = `Hello, ${name.split(' ')[0]}`;
      profName.textContent = name;
      profEmail.textContent = email;
      profPhone.textContent = phone;

      // 2. Fetch Customer Orders: Query by email or phone depending on auth method
      // 2. Fetch Customer Orders: Query by email or phone across both collections
      const ordersCol = collection(db, "orders");
      const pickupsCol = collection(db, "pickups");
      
      let qOrders, qPickups;
      if (user.email) {
        qOrders = query(ordersCol, where("email", "==", user.email));
        qPickups = query(pickupsCol, where("email", "==", user.email));
      } else {
        qOrders = query(ordersCol);
        qPickups = query(pickupsCol);
      }
      
      const [ordersSnap, pickupsSnap] = await Promise.all([
        getDocs(qOrders),
        getDocs(qPickups)
      ]);
      
      let orders = [];
      ordersSnap.forEach(doc => {
        const data = doc.data();
        const idVal = data.orderId || data.id || doc.id;
        orders.push({
          id: idVal,
          orderId: idVal,
          collectionType: 'orders',
          ...data
        });
      });
      pickupsSnap.forEach(doc => {
        const data = doc.data();
        const idVal = data.orderId || data.id || doc.id;
        orders.push({
          id: idVal,
          orderId: idVal,
          collectionType: 'pickups',
          ...data
        });
      });

      // Filter phone users locally (Firestore where limitations)
      if (!user.email) {
        const cleanPhone = user.phoneNumber.replace(/[^0-9]/g, '');
        orders = orders.filter(o => (o.phone || '').replace(/[^0-9]/g, '').includes(cleanPhone));
      }

      // Sort: Scheduled first, then active, then completed (case-insensitive)
      const statusPriority = {
        'pending': 1,
        'scheduled': 1,
        'picked up': 2,
        'in cleaning': 3,
        'ready': 4,
        'completed': 5
      };
      
      orders.sort((a, b) => {
        const priorityA = statusPriority[(a.status || '').toLowerCase()] || 99;
        const priorityB = statusPriority[(b.status || '').toLowerCase()] || 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        
        // Handle timestamps/dates robustly
        const dateA = a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(b.createdAt || 0);
        return dateB - dateA;
      });

      // Update statistics
      statTotal.textContent = orders.length;
      statActive.textContent = orders.filter(o => (o.status || '').toLowerCase() !== 'completed').length;
      statReady.textContent = orders.filter(o => (o.status || '').toLowerCase() === 'ready').length;

      // Render table
      if (orders.length === 0) {
        tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
      } else {
        tableContainer.style.display = 'block';
        emptyState.style.display = 'none';
        
        tbody.innerHTML = orders.map(order => {
          let badgeClass = '';
          let badgeLabel = order.status || 'Pending';
          
          switch ((order.status || '').toLowerCase()) {
            case 'pending':
            case 'scheduled': 
              badgeClass = 'badge-scheduled'; 
              badgeLabel = 'Scheduled';
              break;
            case 'picked up': 
              badgeClass = 'badge-pickedup'; 
              badgeLabel = 'Picked Up';
              break;
            case 'in cleaning': 
              badgeClass = 'badge-cleaning'; 
              badgeLabel = 'In Cleaning';
              break;
            case 'ready': 
              badgeClass = 'badge-ready'; 
              badgeLabel = 'Ready';
              break;
            case 'completed': 
              badgeClass = 'badge-completed'; 
              badgeLabel = 'Completed';
              break;
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
                <span class="badge ${badgeClass}">${badgeLabel}</span>
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
      return 'Social/Phone provider logins are not enabled. Enable them in your Firebase Console.';
    case 'auth/network-request-failed':
      return 'Server timeout. Check your internet connection.';
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA verification failed. Please try again.';
    case 'auth/invalid-phone-number':
      return 'The phone number format is invalid. Make sure to include the country code (e.g. +91 or +1).';
    case 'auth/missing-phone-number':
      return 'Please enter a mobile phone number.';
    case 'auth/quota-exceeded':
      return 'SMS quota exceeded for today. Please try again later or log in via email.';
    default:
      return 'Account verification failed. Please try again.';
  }
}
