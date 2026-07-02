import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

/** Generate a short human-readable order ID, e.g. MDC-20240701-A3F2 */
function generateOrderId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `MDC-${datePart}-${randPart}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const pickupForm   = document.getElementById('pickup-form');
  const submitBtn    = document.getElementById('submit-btn');
  const confDialog   = document.getElementById('confirmation-dialog');
  const confOrderId  = document.getElementById('conf-order-id');
  const confDate     = document.getElementById('conf-date');
  const confTime     = document.getElementById('conf-time');
  const trackOrderLink = document.getElementById('track-order-link');
  const closeDialogBtn = document.getElementById('close-dialog-btn');

  // Handle Auth State and prefill
  onAuthStateChanged(auth, async (user) => {
    const bookingForm = document.getElementById('pickup-form');
    const authPrompt = document.getElementById('booking-auth-prompt');

    if (user) {
      if (bookingForm) bookingForm.style.display = 'block';
      if (authPrompt) authPrompt.style.display = 'none';

      // Autofill user details from Firestore
      try {
        const userDocSnap = await getDoc(doc(db, "users", user.uid));
        if (userDocSnap.exists()) {
          const profile = userDocSnap.data();
          const nameInput = document.getElementById('customerName');
          const emailInput = document.getElementById('email');
          const phoneInput = document.getElementById('phone');

          if (nameInput && !nameInput.value.trim()) nameInput.value = profile.name || '';
          if (emailInput && !emailInput.value.trim()) emailInput.value = profile.email || '';
          if (phoneInput && (!phoneInput.value.trim() || phoneInput.value.trim() === '+91' || phoneInput.value.trim() === '+91 ')) {
            let ph = profile.phone || '';
            if (ph) {
              if (ph.length === 10 && !ph.startsWith('+')) ph = '+91' + ph;
              phoneInput.value = ph.trim();
            }
          }
        }
      } catch (err) {
        console.error("Error auto-filling profile:", err);
      }
    } else {
      if (bookingForm) bookingForm.style.display = 'none';
      if (authPrompt) authPrompt.style.display = 'block';
    }
  });

  // ── Set min date of pickup to tomorrow ────────────────────────────────────
  const pickupDateInput = document.getElementById('pickupDate');
  if (pickupDateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    pickupDateInput.setAttribute('min', tomorrowStr);
    pickupDateInput.value = tomorrowStr;
  }

  // ── Inline validation styling ──────────────────────────────────────────────
  const inputs = pickupForm.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.addEventListener('blur', () => {
      input.setAttribute('aria-invalid', input.matches(':user-invalid') ? 'true' : 'false');
    });
    input.addEventListener('input', () => {
      if (input.hasAttribute('aria-invalid') && input.checkValidity()) {
        input.removeAttribute('aria-invalid');
      }
    });
  });

  // ── Submit Handler ─────────────────────────────────────────────────────────
  pickupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate all fields first
    let firstInvalid = null;
    inputs.forEach(input => {
      if (!input.checkValidity()) {
        input.setAttribute('aria-invalid', 'true');
        input.classList.add('user-invalid-fallback');
        if (!firstInvalid) firstInvalid = input;
      } else {
        input.removeAttribute('aria-invalid');
        input.classList.remove('user-invalid-fallback');
      }
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    // Collect garment types
    const garmentTypes = [];
    document.querySelectorAll('input[name="garmentTypes"]:checked').forEach(cb => {
      garmentTypes.push(cb.value);
    });
    if (garmentTypes.length === 0) garmentTypes.push('General Garments');

    // Normalise phone to +91XXXXXXXXXX
    let phoneVal = document.getElementById('phone').value.trim().replace(/[\s\-]/g, '');
    if (phoneVal.length === 10 && !phoneVal.startsWith('+')) {
      phoneVal = '+91' + phoneVal;
    } else if (phoneVal.length === 12 && phoneVal.startsWith('91')) {
      phoneVal = '+' + phoneVal;
    }

    const orderId = generateOrderId();

    const orderData = {
      orderId,
      userId:              auth.currentUser ? auth.currentUser.uid : null,
      customerName:        document.getElementById('customerName').value.trim(),
      phone:               phoneVal,
      email:               document.getElementById('email').value.trim(),
      pickupDate:          document.getElementById('pickupDate').value,
      pickupTime:          document.getElementById('pickupTime').value,
      garmentCount:        Number(document.getElementById('garmentCount').value),
      garmentTypes,
      specialInstructions: document.getElementById('specialInstructions').value.trim(),
      status:              'pending',
      createdAt:           serverTimestamp()
    };

    // Loading state
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Scheduling Pickup…';

    try {
      // ── Save directly to Firestore (no backend needed) ──────────────────
      await addDoc(collection(db, 'pickups'), orderData);

      // ── Send Email confirmation via Nodemailer backend ─────────────────
      fetch('/api/email/pickup-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: orderData.customerName,
          email: orderData.email,
          orderId,
          pickupDate: orderData.pickupDate,
          pickupTime: orderData.pickupTime,
          garmentCount: orderData.garmentCount,
          garmentTypes: orderData.garmentTypes,
          specialInstructions: orderData.specialInstructions
        })
      })
      .then(r => r.json())
      .then(d => console.log('Confirmation email:', d.message))
      .catch(err => console.error('Email API error:', err));

      // Populate & open success dialog
      if (confOrderId)  confOrderId.textContent = orderId;
      if (confDate)     confDate.textContent     = orderData.pickupDate;
      if (confTime)     confTime.textContent     = orderData.pickupTime;
      if (trackOrderLink) trackOrderLink.href    = `track.html?id=${orderId}`;

      confDialog.showModal();

      // Reset form
      pickupForm.reset();
      if (pickupDateInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        pickupDateInput.value = tomorrow.toISOString().split('T')[0];
      }

    } catch (err) {
      console.error('Booking error:', err);
      alert(`Booking Failed: ${err.message}`);
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = originalBtnText;
    }
  });

  // ── Close dialog ───────────────────────────────────────────────────────────
  if (closeDialogBtn) {
    closeDialogBtn.addEventListener('click', () => confDialog.close());
  }
});
