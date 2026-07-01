/* =======================================================
   animations.js — Mercury Dry Cleaners
   Scroll reveals, counters, city typer, sticky header
======================================================= */

// ===== SCROLL REVEAL =====
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

// ===== STICKY HEADER SHADOW =====
const header = document.getElementById('main-header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// ===== HAMBURGER MENU =====
const ham = document.getElementById('hamburger');
const mob = document.getElementById('mobile-menu');
if (ham && mob) {
  ham.addEventListener('click', () => mob.classList.toggle('open'));
  mob.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mob.classList.remove('open')));
}

// ===== ANIMATED COUNTER =====
function runCounter(el) {
  const target = parseFloat(el.dataset.target);
  const duration = 1800;
  const startTime = performance.now();

  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const val = eased * target;
    el.textContent = target < 10 ? val.toFixed(0) : Math.floor(val).toLocaleString('en-IN');
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

const cntObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { runCounter(e.target); cntObs.unobserve(e.target); }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.count[data-target]').forEach(el => cntObs.observe(el));

// ===== CITY TYPING ANIMATION =====
const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Jaipur'];
const cityEl = document.getElementById('city-display');
if (cityEl) {
  let ci = 0, charI = 0, deleting = false;
  const typeSpeed = 90, deleteSpeed = 50, pauseTime = 1800;

  function typeCity() {
    const word = cities[ci];
    if (!deleting) {
      cityEl.textContent = word.substring(0, charI + 1);
      charI++;
      if (charI === word.length) { deleting = true; setTimeout(typeCity, pauseTime); return; }
    } else {
      cityEl.textContent = word.substring(0, charI - 1);
      charI--;
      if (charI === 0) { deleting = false; ci = (ci + 1) % cities.length; }
    }
    setTimeout(typeCity, deleting ? deleteSpeed : typeSpeed);
  }
  typeCity();
}

// ===== SMOOTH ANCHOR SCROLL =====
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    const tgt = document.getElementById(id);
    if (tgt) { e.preventDefault(); tgt.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});
