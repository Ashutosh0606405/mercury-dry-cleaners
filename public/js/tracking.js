document.addEventListener('DOMContentLoaded', () => {
  const trackInput = document.getElementById('track-input');
  const trackBtn = document.getElementById('track-btn');
  
  const welcomeState = document.getElementById('tracker-welcome');
  const loadingState = document.getElementById('tracker-loading');
  const errorState = document.getElementById('tracker-error');
  const resultsState = document.getElementById('tracker-results');
  
  const errorMessageText = document.getElementById('error-message-text');
  
  const resOrderId = document.getElementById('result-order-id');
  const resBadgeContainer = document.getElementById('result-badge-container');
  
  const progressBar = document.getElementById('stepper-progress-bar');
  const stepScheduled = document.getElementById('step-scheduled');
  const stepPickedUp = document.getElementById('step-pickedup');
  const stepCleaning = document.getElementById('step-cleaning');
  const stepReady = document.getElementById('step-ready');
  const stepCompleted = document.getElementById('step-completed');
  
  const readyHighlight = document.getElementById('garment-ready-highlight');
  
  const detCustName = document.getElementById('detail-customer-name');
  const detPhone = document.getElementById('detail-phone');
  const detEmail = document.getElementById('detail-email');
  const detPickupDate = document.getElementById('detail-pickup-date');
  const detPickupTime = document.getElementById('detail-pickup-time');
  const detCount = document.getElementById('detail-count');
  const detTypes = document.getElementById('detail-types');
  const detSpecial = document.getElementById('detail-special');
  const detFeeRow = document.getElementById('detail-fee-row');
  const detFeeVal = document.getElementById('detail-fee');

  // Trigger search from URL query param (?id=MERC-XXXX or ?q=MERC-XXXX)
  const urlParams = new URLSearchParams(window.location.search);
  const searchId = urlParams.get('id') || urlParams.get('q');
  
  if (searchId) {
    trackInput.value = searchId;
    performSearch(searchId);
  }

  // Event Listeners
  trackBtn.addEventListener('click', () => {
    const val = trackInput.value.trim();
    if (val) performSearch(val);
  });

  trackInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const val = trackInput.value.trim();
      if (val) performSearch(val);
    }
  });

  async function performSearch(query) {
    // Show loading, hide others
    welcomeState.style.display = 'none';
    resultsState.style.display = 'none';
    errorState.style.display = 'none';
    loadingState.style.display = 'block';

    try {
      const response = await fetch(`/api/orders/track?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to fetch tracking data.');
      }

      const order = data.order;
      populateOrderDetails(order);
      updateStepper(order.status);

      // Hide loading, show results
      loadingState.style.display = 'none';
      resultsState.style.display = 'block';

    } catch (err) {
      console.error(err);
      errorMessageText.textContent = err.message || 'We could not find an order matching that details. Double check your Order ID (MERC-XXXX) or phone number and try again.';
      loadingState.style.display = 'none';
      errorState.style.display = 'block';
    }
  }

  function populateOrderDetails(order) {
    resOrderId.textContent = order.id;
    
    // Status badge
    let badgeHTML = '';
    const statusNormalized = (order.status || '').toLowerCase();
    switch (statusNormalized) {
      case 'pending':
      case 'scheduled':
        badgeHTML = '<span class="badge badge-scheduled">Scheduled</span>';
        break;
      case 'picked up':
        badgeHTML = '<span class="badge badge-pickedup">Picked Up</span>';
        break;
      case 'in cleaning':
        badgeHTML = '<span class="badge badge-cleaning">In Cleaning</span>';
        break;
      case 'ready':
        badgeHTML = '<span class="badge badge-ready">Garments Ready</span>';
        break;
      case 'completed':
        badgeHTML = '<span class="badge badge-completed">Completed</span>';
        break;
    }
    resBadgeContainer.innerHTML = badgeHTML;

    // Table values
    detCustName.textContent = order.customerName;
    detPhone.textContent = order.phone;
    detEmail.textContent = order.email || 'None Provided';
    detPickupDate.textContent = order.pickupDate;
    detPickupTime.textContent = order.pickupTime;
    detCount.textContent = `${order.garmentCount} items`;
    detTypes.textContent = order.garmentTypes.join(', ');

    if (detFeeRow && detFeeVal) {
      const fee = Number(order.pickupFee || 0);
      detFeeVal.textContent = fee > 0 ? `₹${fee} (Cash on Delivery)` : 'FREE (1st Booking Promotion)';
      detFeeVal.style.color = fee > 0 ? '#c2410c' : '#16a34a';
      detFeeRow.style.display = 'flex';
    }
    
    if (order.specialInstructions) {
      detSpecial.textContent = order.specialInstructions;
      detSpecial.parentElement.style.display = 'block';
    } else {
      detSpecial.parentElement.style.display = 'none';
    }

    // Ready notification highlight
    if (statusNormalized === 'ready') {
      readyHighlight.style.display = 'flex';
    } else {
      readyHighlight.style.display = 'none';
    }
  }

  function updateStepper(status) {
    // Reset all classes
    const steps = [stepScheduled, stepPickedUp, stepCleaning, stepReady, stepCompleted];
    steps.forEach(step => {
      step.classList.remove('completed', 'active');
    });

    // Map status to progress bar width and active steps (case-insensitive)
    const statusNormalized = (status || '').toLowerCase();
    switch (statusNormalized) {
      case 'pending':
      case 'scheduled':
        progressBar.style.width = '0%';
        progressBar.style.height = '0%';
        stepScheduled.classList.add('active');
        break;
      case 'picked up':
        progressBar.style.width = '25%';
        progressBar.style.height = '25%';
        stepScheduled.classList.add('completed');
        stepPickedUp.classList.add('active');
        break;
      case 'in cleaning':
        progressBar.style.width = '50%';
        progressBar.style.height = '50%';
        stepScheduled.classList.add('completed');
        stepPickedUp.classList.add('completed');
        stepCleaning.classList.add('active');
        break;
      case 'ready':
        progressBar.style.width = '75%';
        progressBar.style.height = '75%';
        stepScheduled.classList.add('completed');
        stepPickedUp.classList.add('completed');
        stepCleaning.classList.add('completed');
        stepReady.classList.add('active');
        break;
      case 'completed':
        progressBar.style.width = '100%';
        progressBar.style.height = '100%';
        stepScheduled.classList.add('completed');
        stepPickedUp.classList.add('completed');
        stepCleaning.classList.add('completed');
        stepReady.classList.add('completed');
        stepCompleted.classList.add('completed');
        break;
    }
  }
});
