document.addEventListener('DOMContentLoaded', () => {
  const pickupForm = document.getElementById('pickup-form');
  const pickupDateInput = document.getElementById('pickup-date');
  const submitBtn = document.getElementById('submit-btn');
  const confDialog = document.getElementById('confirmation-dialog');
  const confOrderId = document.getElementById('conf-order-id');
  const confDate = document.getElementById('conf-date');
  const confTime = document.getElementById('conf-time');
  const trackOrderLink = document.getElementById('track-order-link');
  const closeDialogBtn = document.getElementById('close-dialog-btn');

  // Set min date of pickup to tomorrow
  const pickupDate = document.getElementById('pickupDate');
  if (pickupDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    pickupDate.setAttribute('min', tomorrowStr);
    pickupDate.value = tomorrowStr;
  }

  // Manage field validation styles and sync aria-invalid (per retrieved guidelines)
  const inputs = pickupForm.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    // Check validation on blur
    input.addEventListener('blur', () => {
      // Sync aria-invalid with the :user-invalid state
      const isUserInvalid = input.matches(':user-invalid');
      input.setAttribute('aria-invalid', isUserInvalid ? 'true' : 'false');
    });

    // Clear error style immediately as user corrects input
    input.addEventListener('input', () => {
      if (input.hasAttribute('aria-invalid') && input.checkValidity()) {
        input.removeAttribute('aria-invalid');
      }
    });
  });

  // Submit Handler
  pickupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Trigger validation styling across all fields
    let firstInvalid = null;
    inputs.forEach(input => {
      // Forces browser validation to trigger immediately
      const isValid = input.checkValidity();
      if (!isValid) {
        input.setAttribute('aria-invalid', 'true');
        // Standard user-invalid polyfill backup trigger if browser doesn't support
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

    // Get checked garment types
    const garmentTypes = [];
    document.querySelectorAll('input[name="garmentTypes"]:checked').forEach(cb => {
      garmentTypes.push(cb.value);
    });

    if (garmentTypes.length === 0) {
      // If none selected, default to a generic "Garments" array
      garmentTypes.push('General Garments');
    }

    let phoneVal = document.getElementById('phone').value.trim().replace(/[\s-]/g, '');
    if (phoneVal.length === 10 && !phoneVal.startsWith('+')) {
      phoneVal = '+91' + phoneVal;
    } else if (phoneVal.length === 12 && phoneVal.startsWith('91')) {
      phoneVal = '+' + phoneVal;
    }

    const formData = {
      customerName: document.getElementById('customerName').value,
      phone: phoneVal,
      email: document.getElementById('email').value,
      pickupDate: document.getElementById('pickupDate').value,
      pickupTime: document.getElementById('pickupTime').value,
      garmentCount: document.getElementById('garmentCount').value,
      garmentTypes: garmentTypes,
      specialInstructions: document.getElementById('specialInstructions').value
    };

    // Show loading state
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Scheduling Pickup...';

    try {
      const response = await fetch('/api/orders/pickup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server error occurred.');
      }

      // Populate success dialog
      confOrderId.textContent = data.order.id;
      confDate.textContent = data.order.pickupDate;
      confTime.textContent = data.order.pickupTime;
      trackOrderLink.href = `track.html?id=${data.order.id}`;

      // Open modal dialog natively
      confDialog.showModal();

      // Reset form
      pickupForm.reset();
      // Reset pickup date to tomorrow
      if (pickupDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        pickupDate.value = tomorrow.toISOString().split('T')[0];
      }

    } catch (err) {
      console.error(err);
      alert(`Booking Failed: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });

  // Close Dialog handler
  if (closeDialogBtn) {
    closeDialogBtn.addEventListener('click', () => {
      confDialog.close();
    });
  }
});
