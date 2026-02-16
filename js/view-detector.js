// View Detector - Ensures correct desktop/mobile view

(function() {
  'use strict';
  
  // Check for force desktop preference
  const forceDesktop = localStorage.getItem('forceDesktop') === 'true';
  const isMobileDevice = window.matchMedia('(max-width: 768px)').matches;
  const isMobilePage = window.location.pathname.includes('mobile.html');
  const isDashboardPage = window.location.pathname.includes('dashboard.html');
  
  // If on mobile page but should be desktop
  if (isMobilePage && (!isMobileDevice || forceDesktop)) {
    window.location.href = 'dashboard.html';
    return;
  }
  
  // If on dashboard page but should be mobile (and not forced)
  if (isDashboardPage && isMobileDevice && !forceDesktop) {
    // Only redirect if actually a small screen
    if (window.innerWidth <= 768) {
      window.location.href = 'mobile.html';
      return;
    }
  }
  
  // Add viewport meta tag if missing (for proper mobile rendering)
  if (!document.querySelector('meta[name="viewport"]')) {
    const viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1.0';
    document.head.appendChild(viewport);
  }
  
  // Mark body for desktop mode
  if (forceDesktop || (!isMobileDevice && isDashboardPage)) {
    document.body.classList.add('desktop-mode');
  }
  
  // Add desktop toggle button to mobile view
  if (isMobilePage) {
    const toggleBtn = document.createElement('button');
    toggleBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
    toggleBtn.className = 'btn btn-icon btn-ghost';
    toggleBtn.style.cssText = 'position: fixed; top: var(--space-md); right: var(--space-md); z-index: 1000; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-lg);';
    toggleBtn.title = 'Switch to Desktop View';
    toggleBtn.onclick = () => {
      localStorage.setItem('forceDesktop', 'true');
      window.location.href = 'dashboard.html';
    };
    document.body.appendChild(toggleBtn);
  }
  
  // Add mobile toggle button to desktop view (only show on small screens)
  if (isDashboardPage && isMobileDevice && !forceDesktop) {
    const toggleBtn = document.createElement('button');
    toggleBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12" y2="18.01"></line></svg>';
    toggleBtn.className = 'btn btn-icon btn-ghost';
    toggleBtn.style.cssText = 'position: fixed; top: var(--space-md); right: var(--space-md); z-index: 1000; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-lg);';
    toggleBtn.title = 'Switch to Mobile View';
    toggleBtn.onclick = () => {
      localStorage.setItem('forceDesktop', 'false');
      window.location.href = 'mobile.html';
    };
    document.body.appendChild(toggleBtn);
  }
  
  // Auto-detect and redirect on page load if needed
  window.addEventListener('load', () => {
    // If screen is wide enough, always use desktop
    if (window.innerWidth > 1024 && isMobilePage) {
      localStorage.setItem('forceDesktop', 'true');
      window.location.href = 'dashboard.html';
    }
    
    // If forced desktop but on mobile page, redirect
    if (forceDesktop && isMobilePage) {
      window.location.href = 'dashboard.html';
    }
    
    // If not forced desktop and on dashboard but screen is small, redirect
    if (!forceDesktop && isDashboardPage && window.innerWidth <= 768) {
      window.location.href = 'mobile.html';
    }
  });
  
  // Prevent zoom on double tap (mobile)
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, false);
  
})();
