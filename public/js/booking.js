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
  getDoc,
  updateDoc,
  query,
  where,
  getDocs
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
        let profile = {};
        if (userDocSnap.exists()) {
          profile = userDocSnap.data();
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

        // Query pickups for this user to check if they have booked before
        const pickupsCol = collection(db, 'pickups');
        const qUser = query(pickupsCol, where('userId', '==', user.uid));
        const snapUser = await getDocs(qUser);
        
        let hasUsedFreePickup = snapUser.size >= 1;

        // Update form titles & button
        const formTitle = document.querySelector('.booking-form-wrap .form-title');
        const submitBtn = document.getElementById('submit-btn');
        
        // Remove existing notice if any
        const oldNotice = document.getElementById('pickup-fee-notice');
        if (oldNotice) oldNotice.remove();

        if (hasUsedFreePickup) {
          if (formTitle) formTitle.textContent = '📅 Book Your Pickup';
          if (submitBtn) submitBtn.textContent = '🚀 Confirm Pickup Request (+₹50 fee)';
          
          if (bookingForm) {
            const banner = document.createElement('div');
            banner.id = 'pickup-fee-notice';
            banner.className = 'ready-alert';
            banner.style.cssText = 'display: flex; background: rgba(53, 79, 108, 0.08); border: 1.5px dashed var(--border); color: var(--text-dark); margin-bottom: 1.5rem; padding: 1rem; border-radius: 12px; font-size: 0.85rem; text-align: left;';
            banner.innerHTML = `<div style="font-size: 1.5rem; margin-right: 0.75rem;">⚠️</div><div><strong>Pickup Fee: ₹50 Applied</strong><br>Your promotional free pickup has been used. A standard charge of ₹50 will be collected as Cash on Delivery for this booking.</div>`;
            bookingForm.insertBefore(banner, bookingForm.firstChild);
          }
        } else {
          if (formTitle) formTitle.textContent = '📅 Book Your Free Pickup';
          if (submitBtn) submitBtn.textContent = '🚀 Confirm Free Pickup Request';
        }

      } catch (err) {
        console.error("Error auto-filling profile & checking past pickups:", err);
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

    const hasNotice = !!document.getElementById('pickup-fee-notice');
    const computedFee = hasNotice ? 50 : 0;

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
      pickupFee:           computedFee,
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

      // ── Auto-update User Profile details if authenticated ──────────────────
      if (auth.currentUser) {
        try {
          const userDocRef = doc(db, "users", auth.currentUser.uid);
          await updateDoc(userDocRef, {
            phone: orderData.phone,
            name: orderData.customerName
          });
          console.log("Profile phone/name updated successfully!");
        } catch (e) {
          console.error("Failed to auto-update profile:", e);
        }
      }

      // ── Send Email confirmation via Nodemailer backend ─────────────────
      fetch('/api/email/pickup-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: orderData.customerName,
          email: orderData.email,
          phone: orderData.phone,
          orderId,
          pickupDate: orderData.pickupDate,
          pickupTime: orderData.pickupTime,
          garmentCount: orderData.garmentCount,
          garmentTypes: orderData.garmentTypes,
          specialInstructions: orderData.specialInstructions,
          pickupFee: orderData.pickupFee
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
