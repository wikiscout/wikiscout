// WikiScout Version Check — detects new UI deployments and prompts user to refresh
// WIKISCOUT_BUILD is set inline in each HTML page's <script> tag by the deploy script.

(function () {
  const CHECK_INTERVAL = 30_000; // 30 seconds
  const currentBuild = (typeof WIKISCOUT_BUILD !== 'undefined') ? WIKISCOUT_BUILD : null;

  if (!currentBuild) return; // No build stamp — skip checks

  async function checkForUpdate() {
    try {
      const resp = await fetch('/version.json?_=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.build && data.build !== currentBuild) {
        showUpdateBanner();
      }
    } catch {
      // Network error — silently ignore
    }
  }

  function showUpdateBanner() {
    // Mobile banner
    const mobileBanner = document.getElementById('updateBanner');
    if (mobileBanner) {
      mobileBanner.style.display = '';
    }
    const mobileBtn = document.getElementById('updateBannerBtn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => location.reload());
    }

    // Desktop toast
    const desktopToast = document.getElementById('updateToast');
    if (desktopToast) {
      desktopToast.style.display = '';
    }
    const desktopBtn = document.getElementById('updateToastBtn');
    if (desktopBtn) {
      desktopBtn.addEventListener('click', () => location.reload());
    }
  }

  // Start periodic check
  setInterval(checkForUpdate, CHECK_INTERVAL);

  // Also check once shortly after load
  setTimeout(checkForUpdate, 5_000);
})();
