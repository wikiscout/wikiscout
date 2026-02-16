// WikiScout Dashboard Application - SellAux Style

class DashboardApp {
  constructor() {
    this.currentEvent = null;
    this.teamNumber = null;
    this.userName = null;
    this.teams = [];
    this.teamNameMap = {};     // { teamNumber: nameShort } lookup
    this.rankings = [];
    this.matches = [];
    this.schedule = [];       // schedule with startTime for each match
    this.oprData = [];
    this.sosData = [];
    this.selectedDataTeam = null;
    this.subAccounts = [];
    this.selectedMemberId = null;
    this.loading = false;
    this.currentPage = 'overview';
    
    // Event metadata
    this.eventDateEnd = null;   // ISO string of event end date
    this.eventStatus = null;    // 'live' | 'past' | 'upcoming'
    this.eventEnded = false;    // derived: is event in the past?
    
    // Auto-refresh config
    this.autoRefreshInterval = 5000;  // milliseconds (overridden by server config)
    this._refreshTimer = null;
    
    this.init();
  }
  
  async init() {
    // Initialize icons
    initIcons();
    
    // Show loading state
    this.showLoading(true);
    
    // Check authentication
    const isAuthenticated = await this.checkAuth();
    if (!isAuthenticated) return;
    
    // Setup event listeners
    this.setupNavigation();
    this.setupEventListeners();
    
    // Load initial data
    await this.loadInitialData();
    
    // Navigate to overview
    this.navigateTo('overview');
    
    this.showLoading(false);
    
    // Start auto-refresh
    this._startAutoRefresh();
  }
  
  showLoading(show) {
    this.loading = show;
    const loader = $('#globalLoader');
    if (loader) {
      loader.style.display = show ? 'flex' : 'none';
    }
  }
  
  async checkAuth() {
    try {
      const result = await api.validateToken();
      if (result && result.team_number) {
        this.teamNumber = result.team_number.toString();
        this.userName = result.name || 'Team Member';
        this.updateUserInfo();
        return true;
      }
      // No team number in response - redirect to code entry
      this.redirectToLogin('code.html');
      return false;
    } catch (error) {
      console.error('Auth check failed:', error);
      if (error.status === 401) {
        this.redirectToLogin('index.html');
        return false;
      }
      if (error.status === 501) {
        // No team number assigned - redirect to code entry
        this.redirectToLogin('code.html');
        return false;
      }
      // Network error or other issue - show error state instead of redirect loop
      this.showAuthError(error.message || 'Failed to connect to server');
      return false;
    }
  }
  
  redirectToLogin(page) {
    // Prevent redirect loops by checking if we're already on the target page
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage !== page) {
      window.location.href = page;
    } else {
      // Already on login page, just hide the loader
      this.showLoading(false);
    }
  }
  
  showAuthError(message) {
    this.showLoading(false);
    const appLayout = document.querySelector('.app-layout');
    if (appLayout) {
      appLayout.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: var(--space-2xl); text-align: center;">
          <div style="font-size: 48px; margin-bottom: var(--space-lg);" data-icon="alertCircle" data-icon-size="48"></div>
          <h1 style="font-size: var(--text-2xl); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-md);">Connection Error</h1>
          <p style="color: var(--text-secondary); margin-bottom: var(--space-xl); max-width: 400px;">${message}</p>
          <div style="display: flex; gap: var(--space-md);">
            <button class="btn btn-primary" onclick="window.location.reload()">Try Again</button>
            <button class="btn btn-secondary" onclick="window.location.href='index.html'">Go to Login</button>
          </div>
        </div>
      `;
      initIcons();
    }
  }
  
  updateUserInfo() {
    const userAvatar = $('#userAvatar');
    const userName = $('#userName');
    const userTeam = $('#userTeam');
    const settingsAvatar = $('#settingsAvatarLetter');
    const settingsName = $('#settingsDisplayName');
    const settingsTeamInfo = $('#settingsTeamInfo');
    const settingsTeamNumber = $('#settingsTeamNumber');
    
    const initial = this.teamNumber ? this.teamNumber.charAt(0) : 'T';
    const displayName = this.userName || storage.get('displayName', 'Team Member');
    
    if (userAvatar) userAvatar.textContent = initial;
    if (userName) userName.textContent = displayName;
    if (userTeam) userTeam.textContent = `Team ${this.teamNumber}`;
    if (settingsAvatar) settingsAvatar.textContent = initial;
    if (settingsName) settingsName.textContent = displayName;
    if (settingsTeamInfo) settingsTeamInfo.textContent = `Team #${this.teamNumber}`;
    if (settingsTeamNumber) settingsTeamNumber.value = this.teamNumber || '';
  }
  
  setupNavigation() {
    // Page navigation
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-page]');
      if (link) {
        e.preventDefault();
        const page = link.dataset.page;
        this.navigateTo(page);
      }
    });
    
    // Settings navigation
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-settings-section]');
      if (link) {
        e.preventDefault();
        const section = link.dataset.settingsSection;
        this.showSettingsSection(section);
      }
    });
    
    // Match filter tabs
    document.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-match-filter]');
      if (pill) {
        $$('[data-match-filter]').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.filterMatches(pill.dataset.matchFilter);
      }
    });
    
  }
  
  navigateTo(page) {
    this.currentPage = page;
    
    // Update nav
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    
    // Page titles and subtitles
    const pageInfo = {
      overview: { title: 'Dashboard', subtitle: "Welcome back! Here's what's happening." },
      rankings: { title: 'Rankings', subtitle: 'Event rankings and standings' },
      matches: { title: 'Matches', subtitle: 'Match schedule and results' },
      teams: { title: 'Teams', subtitle: 'All teams at this event' },
      scout: { title: 'Scout Team', subtitle: 'Record scouting data' },
      'match-scout': { title: 'Match Scouting', subtitle: 'Add notes to specific matches' },
      data: { title: 'View Data', subtitle: 'Browse team scouting data' },
      otp: { title: 'Team Members', subtitle: 'Manage sub-accounts for your team' },
      settings: { title: 'Settings', subtitle: 'Manage your account' },
      profile: { title: 'Trading Card', subtitle: 'Create your team\'s trading card profile' }
    };
    
    const info = pageInfo[page] || { title: 'Dashboard', subtitle: '' };
    const titleEl = $('#pageTitle');
    const subtitleEl = $('#pageSubtitle');
    
    if (titleEl) titleEl.textContent = info.title;
    if (subtitleEl) subtitleEl.textContent = info.subtitle;
    
    // Hide all screens, show target
    $$('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    
    const targetScreen = $(`#page-${page}`);
    if (targetScreen) {
      targetScreen.classList.add('active');
    }
    
    // Load page-specific data
    this.loadPageData(page);
    initIcons();
  }
  
  showSettingsSection(section) {
    $$('[data-settings-section]').forEach(link => {
      link.classList.toggle('active', link.dataset.settingsSection === section);
    });
    
    $$('.settings-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `settings-${section}`);
    });
    
    initIcons();
  }
  
  setupEventListeners() {
    // Refresh button
    $('#refreshBtn')?.addEventListener('click', () => this.refreshData());
    
    // Scout form
    $('#scoutForm')?.addEventListener('submit', (e) => this.handleScoutSubmit(e));
    
    // Scout team select
    $('#scoutTeamSelect')?.addEventListener('change', (e) => {
      this.updateScoutPreview();
      const submitTeam = $('#scoutSubmitTeam');
      if (submitTeam) {
        submitTeam.textContent = e.target.value ? `Team ${e.target.value}${this.getTeamName(e.target.value) ? ' · ' + this.getTeamName(e.target.value) : ''}` : 'No team selected';
      }
      this.loadScoutTeamMatchNotes(e.target.value);
      this.autofillScoutForm(e.target.value);
    });
    
    // Data browser search
    $('#dataBrowserSearch')?.addEventListener('input', debounce((e) => {
      this.filterDataBrowserTeams(e.target.value);
    }, 200));
    
    // Teams page search
    $('#teamsSearch')?.addEventListener('input', debounce((e) => {
      this.renderTeamsGrid(e.target.value);
    }, 200));
    
    // Data actions
    $('#dataScoutBtn')?.addEventListener('click', () => {
      if (this.selectedDataTeam) {
        this.navigateTo('scout');
        const select = $('#scoutTeamSelect');
        if (select) select.value = this.selectedDataTeam;
      }
    });
    
    // Team Members (sub-accounts)
    $('#addMemberForm')?.addEventListener('submit', (e) => this.handleAddMember(e));
    $('#memberToggleBtn')?.addEventListener('click', () => this.toggleSelectedMember());
    $('#memberDeleteBtn')?.addEventListener('click', () => this.deleteSelectedMember());
    $('#memberGenCredsBtn')?.addEventListener('click', () => this.generateMemberCredentials());
    $('#memberOtpCopy')?.addEventListener('click', () => this.copyMemberOtp());
    
    // Event Selector
    $('#eventSelector')?.addEventListener('click', () => this.openEventPicker());
    
    // Event Picker tabs
    document.querySelectorAll('.ep-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchEventPickerTab(tab.dataset.epFilter));
    });
    
    // Event Picker search
    $('#epSearchInput')?.addEventListener('input', debounce((e) => {
      this.filterEventPickerList(e.target.value);
    }, 250));
    
    // Event Picker season dropdown
    $('#epSeasonSelect')?.addEventListener('change', (e) => {
      this._epSeason = parseInt(e.target.value);
      this._loadEventPickerData();
    });
    
    // Event Picker modal overlay click to close
    $('#eventPickerModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'eventPickerModal') this.closeEventPicker();
    });
    
    // Logout
    $('#logoutBtn')?.addEventListener('click', () => this.logout());
    $('#settingsLogoutBtn')?.addEventListener('click', () => this.logout());
    
    // Profile / Trading Card
    $('#profileForm')?.addEventListener('submit', (e) => this.handleProfileSave(e));
    $('#profileUploadBtn')?.addEventListener('click', () => this.startPhotoUpload());
    $('#profileCancelQr')?.addEventListener('click', () => this.cancelPhotoUpload());
    $('#profileCopyUrl')?.addEventListener('click', () => this.copyProfileUrl());
    
    // Custom Questions
    this.setupCustomQuestionsListeners();
  }
  
  async loadInitialData() {
    try {
      // Get user info and current event
      const meData = await api.getMe().catch(err => {
        console.error('Failed to fetch /me:', err);
        return { found: false };
      });
      
      // Apply server-side config (auto-refresh interval, etc.)
      if (meData.config) {
        const interval = meData.config.desktop_refresh_interval;
        this.autoRefreshInterval = (typeof interval === 'number' && interval >= 0) ? interval : 5000;
      }

      if (meData.found && meData.event) {
        // Store all events for division grouping
        this._allTeamEvents = meData.allEvents || [];

        // Auto-select division event: if the team has multiple active events
        // where one code is a prefix of another, prefer the longer (division) code
        const activeEvents = (meData.allEvents || []).filter(e => e.status === 'live');
        let pickedEvent = meData.event;
        if (activeEvents.length > 1) {
          pickedEvent = this._pickDivisionEvent(activeEvents);
        }

        this.currentEvent = pickedEvent.code;
        this.eventName = pickedEvent.name || this.currentEvent;
        this.eventDateEnd = pickedEvent.endDate || null;
        this.eventStatus = pickedEvent.status || 'live';
        storage.set('currentEvent', this.currentEvent);
        
        // Update event display
        const eventNameEl = $('#currentEventName');
        if (eventNameEl) {
          eventNameEl.textContent = this.eventName;
        }
        
        // Load event data
        await this.loadEventData();
      } else {
        // No event found - check for stored event or show event picker
        this._allTeamEvents = meData.allEvents || [];
        this.currentEvent = storage.get('currentEvent');
        if (this.currentEvent) {
          await this.loadEventData();
        } else {
          // Try to load today's events so user can pick one
          await this.loadTodayEvents();
        }
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
      // Still show the UI, just without event data
      this.showNoEventState();
    }
  }

  /**
   * Given multiple active events, pick the best one (prefer division event).
   * If a team is in USMNCMP and USMNCMPGLXY, pick USMNCMPGLXY (the division).
   */
  _pickDivisionEvent(activeEvents) {
    if (activeEvents.length === 0) return activeEvents[0];
    if (activeEvents.length === 1) return activeEvents[0];

    // Sort by code length descending — longer code = more specific (division)
    const sorted = [...activeEvents].sort((a, b) => b.code.length - a.code.length);

    // Check if the longest code starts with any shorter code (indicates division)
    for (const longer of sorted) {
      for (const shorter of sorted) {
        if (longer.code !== shorter.code && longer.code.startsWith(shorter.code)) {
          return longer;
        }
      }
    }

    // No prefix relationship found — just pick the first active event
    return sorted[0];
  }
  
  async loadTodayEvents() {
    try {
      const todayData = await api.getTodayEvents().catch(() => null);
      if (todayData && todayData.events && todayData.events.length > 0) {
        // Show event picker or auto-select first event
        this.currentEvent = todayData.events[0].code;
        this.eventName = todayData.events[0].name || this.currentEvent;
        storage.set('currentEvent', this.currentEvent);
        
        const eventNameEl2 = $('#currentEventName');
        if (eventNameEl2) {
          eventNameEl2.textContent = this.eventName;
        }
        
        await this.loadEventData();
      } else {
        this.showNoEventState();
      }
    } catch (error) {
      console.error('Failed to load today events:', error);
      this.showNoEventState();
    }
  }
  
  showNoEventState() {
    // Show empty states when no event is loaded
    const containers = ['#topRankings', '#upcomingMatches', '#teamsGrid', '#rankingsTable'];
    containers.forEach(selector => {
      const container = $(selector);
      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon" data-icon="calendar" data-icon-size="48"></div>
            <div class="empty-state-title">No Event Loaded</div>
            <div class="empty-state-text">Join an event to see data</div>
          </div>
        `;
      }
    });
    initIcons();
  }
  
  async loadEventData() {
    if (!this.currentEvent) return;
    
    // Reset all data before loading new event
    this.teams = [];
    this.teamNameMap = {};
    this.rankings = [];
    this.matches = [];
    this.schedule = [];
    this.oprData = [];
    this.sosData = [];
    this.demoMatchNotes = null;
    this.matchScoutNotesCache = {};
    
    try {
      // Load teams, rankings, matches, and schedule in parallel
      const [teamsData, rankingsData, matchesData, scheduleData] = await Promise.all([
        api.getTeams(this.currentEvent).catch(() => null),
        api.getRankings(this.currentEvent).catch(() => null),
        api.getMatches(this.currentEvent).catch(() => null),
        api.getEventSchedule(this.currentEvent).catch(() => null)
      ]);
      
      // Process teams
      if (teamsData && teamsData.teams) {
        this.teams = teamsData.teams.map(t => t.teamNumber || t);
        // Build team name lookup from API data
        teamsData.teams.forEach(t => {
          if (t.nameShort || t.nameFull) {
            this.teamNameMap[t.teamNumber || t] = t.nameShort || t.nameFull || '';
          }
        });
      }
      
      // Process rankings (worker returns lowercase 'rankings')
      if (rankingsData && (rankingsData.rankings || rankingsData.Rankings)) {
        const rankings = rankingsData.rankings || rankingsData.Rankings;
        this.rankings = rankings.map(r => ({
          teamNumber: r.teamNumber,
          rank: r.rank,
          wins: r.wins || 0,
          losses: r.losses || 0,
          ties: r.ties || 0,
          matchesPlayed: r.matchesPlayed || (r.wins + r.losses + r.ties) || 0,
          sortOrder1: r.sortOrder1 || 0,
          sortOrder2: r.sortOrder2 || 0
        }));
        // Supplement name map from rankings (rankings have teamName)
        rankings.forEach(r => {
          if (r.teamName && !this.teamNameMap[r.teamNumber]) {
            this.teamNameMap[r.teamNumber] = r.teamName;
          }
        });
      }
      
      // Process matches (worker returns lowercase 'matches')
      if (matchesData && (matchesData.matches || matchesData.Schedule)) {
        const matches = matchesData.matches || matchesData.Schedule;
        this.matches = matches.map(m => ({
          description: m.description || `Match ${m.matchNumber}`,
          tournamentLevel: m.tournamentLevel,
          matchNumber: m.matchNumber,
          completed: m.red?.total !== null && m.red?.total !== undefined,
          red: m.red || {
            teams: m.teams?.filter(t => t.station?.startsWith('Red')).map(t => t.teamNumber) || [],
            total: m.scoreRedFinal
          },
          blue: m.blue || {
            teams: m.teams?.filter(t => t.station?.startsWith('Blue')).map(t => t.teamNumber) || [],
            total: m.scoreBlueFinal
          },
          redScore: m.red?.total || m.scoreRedFinal,
          blueScore: m.blue?.total || m.scoreBlueFinal
        }));
      }
      
      // Process schedule (has startTime for each match)
      if (scheduleData && scheduleData.schedule) {
        this.schedule = scheduleData.schedule.map(s => ({
          description: s.description,
          matchNumber: s.matchNumber,
          startTime: s.startTime,
          teams: s.teams || []
        }));
      }
      
      // Calculate advanced stats
      this.calculateOPR();
      this.calculateSoS();
      
      // Determine if event has ended
      this._updateEventEndedStatus();
      
      // Only generate demo notes for DEVDATA events
      if (this._isDevDataEvent()) {
      this.generateDemoMatchNotes();
      }
      
      // Update dashboard overview UI
      this.updateStats();
      this.populateTeamSelects();
      this.renderUpcomingMatches();
      this.renderRecentResults();
      this.renderTopRankings();
      this.renderScoreAnalysis();
      this._updateQueuingBanner();
      this._updateEventEndedUI();
      
      // Re-render the currently active page so it reflects the new event data
      if (this.currentPage && this.currentPage !== 'overview') {
        this.loadPageData(this.currentPage);
      }
      
    } catch (error) {
      console.error('Failed to load event data:', error);
      toast.error('Failed to load event data');
    }
  }
  
  _isDevDataEvent() {
    return this.currentEvent && ['DEVDATA0', 'DEVDATA1'].includes(this.currentEvent.toUpperCase());
  }

  /** Get the short team name (or empty string) for a team number */
  getTeamName(num) {
    return this.teamNameMap[num] || this.teamNameMap[parseInt(num)] || '';
  }

  /** Return "TEAM_NUM · Name" if name exists, otherwise just "TEAM_NUM" */
  teamLabel(num) {
    const name = this.getTeamName(num);
    return name ? `${num} · ${name}` : `${num}`;
  }
  
  async refreshData() {
    const btn = $('#refreshBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span data-icon="refresh" data-icon-size="16" class="spin"></span> Refreshing...';
    }
    
    try {
      await this.loadEventData();
      toast.success('Data refreshed');
    } catch (error) {
      toast.error('Failed to refresh data');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span data-icon="refresh" data-icon-size="16"></span> Refresh';
        initIcons();
      }
    }
  }
  
  // ---- Auto-Refresh ----
  
  _startAutoRefresh() {
    this._stopAutoRefresh();
    if (this.autoRefreshInterval > 0) {
      this._refreshTimer = setInterval(() => this._silentRefresh(), this.autoRefreshInterval);
    }
  }
  
  _stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }
  
  async _silentRefresh() {
    if (!this.currentEvent) return;
    if (this._silentRefreshing) return; // prevent overlap
    
    // Only auto-refresh on data-display pages, NOT on forms or settings
    const refreshPages = ['overview', 'rankings', 'matches'];
    if (!refreshPages.includes(this.currentPage)) return;
    
    this._silentRefreshing = true;
    
    const btn = $('#refreshBtn');
    if (btn) {
      btn.innerHTML = '<span data-icon="refresh" data-icon-size="16" class="spin"></span> Refreshing...';
      initIcons();
    }
    
    try {
      await this.loadEventData();
    } catch (e) {
      // Silent fail — don't toast
      console.warn('Silent refresh failed:', e);
    } finally {
      this._silentRefreshing = false;
      if (btn) {
        btn.innerHTML = '<span data-icon="refresh" data-icon-size="16"></span> Refresh';
        initIcons();
      }
    }
  }
  
  // ---- Event Status Helpers ----
  
  _isEventEnded() {
    return this.eventEnded === true;
  }
  
  _updateEventEndedStatus() {
    if (this.eventDateEnd) {
      // Event has ended if end date + 1 day buffer is in the past
      const endTime = new Date(this.eventDateEnd).getTime() + 24 * 60 * 60 * 1000;
      this.eventEnded = Date.now() > endTime;
    } else if (this.eventStatus === 'past') {
      this.eventEnded = true;
    } else {
      // Fallback: if all matches are completed and there's at least some data
      this.eventEnded = this.matches.length > 0 && this.matches.every(m => m.completed);
    }
  }
  
  // ---- Queuing Soon Banner ----
  
  _updateQueuingBanner() {
    const banner = $('#queuingSoonBanner');
    const detail = $('#queuingSoonDetail');
    if (!banner) return;
    
    // Don't show for ended events
    if (this._isEventEnded()) {
      banner.style.display = 'none';
      return;
    }
    
    const teamNum = parseInt(this.teamNumber);
    if (!teamNum || this.schedule.length === 0) {
      banner.style.display = 'none';
      return;
    }
    
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    
    // Find upcoming scheduled matches for this team within the next 10 minutes
    const queuingMatch = this.schedule.find(s => {
      if (!s.startTime) return false;
      const matchTime = new Date(s.startTime).getTime();
      const diff = matchTime - now;
      // Match is in the future and within 10 minutes
      if (diff < 0 || diff > tenMinutes) return false;
      // Check if our team is in this match
      const teamNums = (s.teams || []).map(t => t.teamNumber);
      return teamNums.includes(teamNum);
    });
    
    if (queuingMatch) {
      const matchTime = new Date(queuingMatch.startTime);
      const minsLeft = Math.max(1, Math.ceil((matchTime.getTime() - now) / 60000));
      const matchDesc = queuingMatch.description || `Match ${queuingMatch.matchNumber}`;
      if (detail) detail.textContent = `${matchDesc} starts in ~${minsLeft} min`;
      banner.style.display = 'flex';
      initIcons();
    } else {
      banner.style.display = 'none';
    }
  }
  
  // ---- Event Ended UI ----
  
  _updateEventEndedUI() {
    const upcomingCard = $('#upcomingMatchesCard');
    
    if (this._isEventEnded()) {
      // Hide upcoming matches card for ended events
      if (upcomingCard) upcomingCard.style.display = 'none';
    } else {
      if (upcomingCard) upcomingCard.style.display = '';
    }
  }
  
  updateStats() {
    const statTeams = $('#statTeams');
    const statRank = $('#statRank');
    const statMatches = $('#statMatches');
    const eventTeamsCompeting = $('#eventTeamsCompeting');
    
    if (statTeams) statTeams.textContent = this.teams.length;
    if (eventTeamsCompeting) eventTeamsCompeting.textContent = `${this.teams.length} teams competing`;
    
    const myRank = this.rankings.find(r => r.teamNumber.toString() === this.teamNumber);
    if (myRank) {
      if (statRank) statRank.textContent = `#${myRank.rank}`;
      if (statMatches) statMatches.textContent = myRank.matchesPlayed;
    } else {
      if (statRank) statRank.textContent = '--';
      if (statMatches) statMatches.textContent = '0';
    }
  }
  
  populateTeamSelects() {
    const selects = ['#scoutTeamSelect'];
    selects.forEach(selector => {
      const select = $(selector);
      if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select a team...</option>' +
          this.teams.map(t => `<option value="${t}">${this.teamLabel(t)}</option>`).join('');
        if (currentValue && this.teams.includes(parseInt(currentValue))) {
          select.value = currentValue;
        }
      }
    });
    
    this.renderDataBrowser();
  }
  
  renderTopRankings() {
    const container = $('#topRankings');
    if (!container) return;
    
    const top10 = this.rankings.slice(0, 10);
    
    if (top10.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="rankings" data-icon-size="48"></div>
          <div class="empty-state-title">No rankings yet</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    container.innerHTML = `
      <div class="ranking-row ranking-header">
        <div>#</div>
        <div>Team</div>
        <div style="color: var(--success);">W</div>
        <div style="color: var(--danger);">L</div>
        <div style="color: var(--text-muted);">T</div>
        <div style="color: var(--purple);">GP</div>
        </div>
      ${top10.map(team => {
        const isHighlight = team.teamNumber.toString() === this.teamNumber;
        return `
          <div class="ranking-row ${isHighlight ? 'highlight' : ''}" onclick="app.viewTeamData(${team.teamNumber})">
            <div class="rank-position ${team.rank === 1 ? 'gold' : team.rank === 2 ? 'silver' : team.rank === 3 ? 'bronze' : ''}">${team.rank}</div>
            <div class="rank-team"><span class="rank-team-number">${team.teamNumber}</span>${this.getTeamName(team.teamNumber) ? `<span class="rank-team-name">· ${this.getTeamName(team.teamNumber)}</span>` : ''}</div>
            <div class="rank-stat" style="color: var(--success);">${team.wins}</div>
            <div class="rank-stat" style="color: var(--danger);">${team.losses}</div>
            <div class="rank-stat" style="color: var(--text-muted);">${team.ties}</div>
            <div class="rank-stat" style="color: var(--purple);">${team.matchesPlayed}</div>
      </div>
        `;
      }).join('')}
    `;
  }
  
  renderUpcomingMatches() {
    const container = $('#upcomingMatches');
    if (!container) return;
    
    const allUpcoming = this.matches.filter(m => !m.completed);
    
    if (allUpcoming.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" data-icon="calendar" data-icon-size="48"></div>
          <div class="empty-state-title">No upcoming matches</div>
          <div class="empty-state-text">Check back later for match schedule</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    // Calculate how many cards fit in one row
    const containerWidth = container.offsetWidth || 1100;
    const minCardWidth = 200;
    const gap = 12;
    const count = Math.max(1, Math.floor((containerWidth + gap) / (minCardWidth + gap)));
    const upcoming = allUpcoming.slice(0, count);
    
    container.innerHTML = upcoming.map(match => this.renderUpcomingCard(match)).join('');
  }
  
  renderUpcomingCard(match) {
    const isYourMatch = match.red.teams.includes(parseInt(this.teamNumber)) || 
                        match.blue.teams.includes(parseInt(this.teamNumber));
    
    return `
      <div class="upcoming-card ${isYourMatch ? 'your-match' : ''}">
        <div class="upcoming-card-header">
          <span class="match-number">${match.description}</span>
          <span class="match-time">Scheduled</span>
        </div>
        <div class="upcoming-card-teams">
          <div class="upcoming-alliance red">
            ${match.red.teams.map(t => `<span class="upcoming-team ${t.toString() === this.teamNumber ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join('')}
            </div>
          <span class="upcoming-vs">vs</span>
          <div class="upcoming-alliance blue">
            ${match.blue.teams.map(t => `<span class="upcoming-team ${t.toString() === this.teamNumber ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join('')}
          </div>
            </div>
          </div>
    `;
  }
  
  renderRecentResults() {
    const container = $('#recentResults');
    if (!container) return;
    
    const completed = this.matches
      .filter(m => m.completed && m.red?.total != null)
      .sort((a, b) => {
        const aNum = parseInt(a.description.match(/\d+/)?.[0] || 0);
        const bNum = parseInt(b.description.match(/\d+/)?.[0] || 0);
        return bNum - aNum;
      })
      .slice(0, 10);
    
    if (completed.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="data" data-icon-size="32"></div>
          <div class="empty-state-text">No completed matches yet</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    // Mini match cards, same style as matches page but smaller, 2 per row
    container.innerHTML = `<div class="recent-results-grid">${completed.map(match => {
      return this.renderMiniMatchCard(match);
    }).join('')}</div>`;
  }
  
  renderMiniMatchCard(match) {
    const isYourMatch = match.red.teams.includes(parseInt(this.teamNumber)) || 
                        match.blue.teams.includes(parseInt(this.teamNumber));
    
    let resultClass = '', resultText = '';
    if (match.completed && isYourMatch) {
      const onRed = match.red.teams.includes(parseInt(this.teamNumber));
      const yourScore = onRed ? match.red.total : match.blue.total;
      const oppScore = onRed ? match.blue.total : match.red.total;
      if (yourScore > oppScore) { resultClass = 'win'; resultText = 'WIN'; }
      else if (yourScore < oppScore) { resultClass = 'loss'; resultText = 'LOSS'; }
      else { resultClass = 'tie'; resultText = 'TIE'; }
    }
    
    return `
      <div class="mini-match-card ${isYourMatch ? 'your-match' : ''}">
        <div class="mini-match-header">
          <span class="match-number">${match.description.replace('Qualifier ', 'Q')}</span>
          ${resultText ? `<span class="match-result ${resultClass}">${resultText}</span>` : 
            `<span class="match-time">${match.completed ? 'DONE' : 'SCHED'}</span>`}
      </div>
        <div class="mini-match-body">
          <div class="mini-alliance red">
            <div class="mini-alliance-score red">${match.red.total ?? '-'}</div>
            <div class="mini-alliance-teams">
              ${match.red.teams.map(t => `<span class="mini-alliance-team ${t.toString() === this.teamNumber ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join('')}
            </div>
          </div>
          <div class="mini-match-vs">VS</div>
          <div class="mini-alliance blue">
            <div class="mini-alliance-score blue">${match.blue.total ?? '-'}</div>
            <div class="mini-alliance-teams">
              ${match.blue.teams.map(t => `<span class="mini-alliance-team ${t.toString() === this.teamNumber ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  renderOverviewOPR() {
    const container = $('#topOPR');
    if (!container) return;
    
    // Need to calculate OPR first if not already done
    if (this.oprData.length === 0) {
      this.calculateOPR();
    }
    
    const top8 = this.oprData.slice(0, 8);
    
    if (top8.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-lg);">
          <div class="empty-state-icon" data-icon="zap" data-icon-size="32"></div>
          <div class="empty-state-text" style="font-size: var(--text-xs);">Requires completed matches</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    container.innerHTML = top8.map(team => {
      const isHighlight = team.teamNumber.toString() === this.teamNumber;
      return `
        <div class="overview-opr-row ${isHighlight ? 'highlight' : ''}" onclick="app.viewTeamData(${team.teamNumber})">
          <div class="overview-rank-pos ${team.rank === 1 ? 'gold' : team.rank === 2 ? 'silver' : team.rank === 3 ? 'bronze' : ''}">#${team.rank}</div>
          <div class="overview-rank-team"><span class="rank-team-number">${team.teamNumber}</span>${this.getTeamName(team.teamNumber) ? `<span class="rank-team-name">· ${this.getTeamName(team.teamNumber)}</span>` : ''}</div>
          <div class="overview-opr-value">${team.opr.toFixed(1)}</div>
        </div>
      `;
    }).join('');
  }
  
  renderScoreAnalysis() {
    const container = $('#scoreAnalysis');
    if (!container) return;
    
    const completedMatches = this.matches.filter(m => 
      m.completed && m.red?.total != null && m.blue?.total != null
    );
    
    if (completedMatches.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-text">Waiting for match data</div>
        </div>
      `;
      return;
    }
    
    const allScores = completedMatches.flatMap(m => [m.red.total, m.blue.total]);
    const redScores = completedMatches.map(m => m.red.total);
    const blueScores = completedMatches.map(m => m.blue.total);
    
    const avgScore = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
    const highScore = Math.max(...allScores);
    const lowScore = Math.min(...allScores);
    const avgRed = Math.round(redScores.reduce((a, b) => a + b, 0) / redScores.length);
    const avgBlue = Math.round(blueScores.reduce((a, b) => a + b, 0) / blueScores.length);
    
    const redWins = completedMatches.filter(m => m.red.total > m.blue.total).length;
    const blueWins = completedMatches.filter(m => m.blue.total > m.red.total).length;
    const ties = completedMatches.length - redWins - blueWins;
    const redWinPct = completedMatches.length > 0 ? Math.round((redWins / completedMatches.length) * 100) : 50;
    const blueWinPct = completedMatches.length > 0 ? Math.round((blueWins / completedMatches.length) * 100) : 50;
    
    // Your team stats
    let yourTeamHTML = '';
    const myTeam = parseInt(this.teamNumber);
    if (myTeam) {
      const myMatches = completedMatches.filter(m => 
        m.red.teams.includes(myTeam) || m.blue.teams.includes(myTeam)
      );
      if (myMatches.length > 0) {
        const myWins = myMatches.filter(m => {
          const onRed = m.red.teams.includes(myTeam);
          return onRed ? m.red.total > m.blue.total : m.blue.total > m.red.total;
        }).length;
        const myAvg = Math.round(myMatches.reduce((sum, m) => {
          const onRed = m.red.teams.includes(myTeam);
          return sum + (onRed ? m.red.total : m.blue.total);
        }, 0) / myMatches.length);
        const myOPR = this.oprData.find(t => t.teamNumber === myTeam);
        
        yourTeamHTML = `
          <div class="score-section">
            <div class="score-section-title">Your Team (${this.teamNumber})</div>
            <div class="score-analysis-grid">
              <div class="score-analysis-stat">
                <div class="score-analysis-stat-value" style="color: var(--primary);">${myWins}/${myMatches.length}</div>
                <div class="score-analysis-stat-label">Record</div>
              </div>
              <div class="score-analysis-stat">
                <div class="score-analysis-stat-value">${myAvg}</div>
                <div class="score-analysis-stat-label">Avg Score</div>
              </div>
            </div>
            ${myOPR ? `
            <div class="score-analysis-grid" style="margin-top: var(--space-sm);">
              <div class="score-analysis-stat">
                <div class="score-analysis-stat-value" style="color: var(--purple);">${myOPR.opr.toFixed(1)}</div>
                <div class="score-analysis-stat-label">OPR</div>
              </div>
              <div class="score-analysis-stat">
                <div class="score-analysis-stat-value">#${myOPR.rank}</div>
                <div class="score-analysis-stat-label">OPR Rank</div>
              </div>
            </div>
            ` : ''}
          </div>
        `;
      }
    }
    
    container.innerHTML = `
      <div class="score-analysis-grid">
        <div class="score-analysis-stat">
          <div class="score-analysis-stat-value">${avgScore}</div>
          <div class="score-analysis-stat-label">Avg Score</div>
        </div>
        <div class="score-analysis-stat">
          <div class="score-analysis-stat-value" style="color: var(--success);">${highScore}</div>
          <div class="score-analysis-stat-label">High</div>
        </div>
      </div>
      <div class="score-analysis-grid" style="margin-top: var(--space-sm);">
        <div class="score-analysis-stat">
          <div class="score-analysis-stat-value" style="color: var(--danger);">${lowScore}</div>
          <div class="score-analysis-stat-label">Low</div>
        </div>
        <div class="score-analysis-stat">
          <div class="score-analysis-stat-value">${completedMatches.length}</div>
          <div class="score-analysis-stat-label">Played</div>
        </div>
      </div>
      
      <div class="score-section">
        <div class="score-section-title">Alliance Performance</div>
        <div class="score-analysis-bar">
          <div class="score-analysis-bar-header">
            <span>Red: ${avgRed}</span>
            <span>Blue: ${avgBlue}</span>
          </div>
          <div class="score-analysis-bar-track">
            <div class="score-analysis-bar-red" style="width: ${avgRed / (avgRed + avgBlue) * 100}%"></div>
            <div class="score-analysis-bar-blue" style="width: ${avgBlue / (avgRed + avgBlue) * 100}%"></div>
          </div>
        </div>
        <div class="score-analysis-bar" style="margin-top: var(--space-sm);">
          <div class="score-analysis-bar-header">
            <span>Red Wins: ${redWins}</span>
            <span>Blue Wins: ${blueWins}</span>
          </div>
          <div class="score-analysis-bar-track">
            <div class="score-analysis-bar-red" style="width: ${redWinPct}%"></div>
            <div class="score-analysis-bar-blue" style="width: ${blueWinPct}%"></div>
          </div>
        </div>
      </div>
      
      ${yourTeamHTML}
    `;
  }
  
  renderYourTeamOverview() {
    const container = $('#yourTeamOverview');
    if (!container) return;
    
    const myRank = this.rankings.find(r => r.teamNumber.toString() === this.teamNumber);
    
    if (!myRank) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-lg);">
          <div class="empty-state-text" style="font-size: var(--text-xs);">No ranking data yet</div>
        </div>
      `;
      return;
    }
    
    const total = myRank.wins + myRank.losses + myRank.ties;
    const winRate = total > 0 ? Math.round((myRank.wins / total) * 100) : 0;
    
    // Get OPR if available
    const myOPR = this.oprData.find(t => t.teamNumber.toString() === this.teamNumber);
    const mySoS = this.sosData.find(t => t.teamNumber.toString() === this.teamNumber);
    
    let oprHTML = '';
    if (myOPR) {
      oprHTML += `
        <div class="your-team-overview-opr">
          <span class="your-team-overview-opr-label">OPR</span>
          <span class="your-team-overview-opr-value">${myOPR.opr.toFixed(1)} (#${myOPR.rank})</span>
        </div>
      `;
    }
    if (mySoS) {
      const sosValue = mySoS.sos;
      const sosColor = sosValue > 2 ? 'var(--success)' : sosValue < -2 ? 'var(--danger)' : 'var(--text-secondary)';
      oprHTML += `
        <div class="your-team-overview-opr">
          <span class="your-team-overview-opr-label">Schedule</span>
          <span class="your-team-overview-opr-value" style="color: ${sosColor};">${sosValue > 0 ? '+' : ''}${sosValue.toFixed(1)}</span>
        </div>
      `;
    }
    
    container.innerHTML = `
      <div class="your-team-overview-rank">
        <div class="your-team-overview-rank-num">#${myRank.rank}</div>
        <div class="your-team-overview-rank-label">Event Rank · ${winRate}% Win Rate</div>
      </div>
      <div class="your-team-overview-stats">
        <div class="your-team-overview-stat">
          <div class="your-team-overview-stat-val wins">${myRank.wins}</div>
          <div class="your-team-overview-stat-lbl">Wins</div>
        </div>
        <div class="your-team-overview-stat">
          <div class="your-team-overview-stat-val losses">${myRank.losses}</div>
          <div class="your-team-overview-stat-lbl">Losses</div>
        </div>
        <div class="your-team-overview-stat">
          <div class="your-team-overview-stat-val">${myRank.ties}</div>
          <div class="your-team-overview-stat-lbl">Ties</div>
        </div>
      </div>
      ${oprHTML}
    `;
  }
  
  loadPageData(page) {
    switch (page) {
      case 'rankings':
        this.renderFullRankings();
        break;
      case 'matches':
        this.renderAllMatches();
        break;
      case 'teams':
        this.renderTeamsGrid();
        break;
      case 'scout':
        this.renderScoutForm();
        this.renderScoutCustomFields();
        break;
      case 'match-scout':
        this.renderMatchScoutPage();
        break;
      case 'data':
        this.renderDataBrowser();
        break;
      case 'otp':
        this.loadSubAccounts();
        break;
      case 'settings':
        this.renderCustomQuestionsManager();
        break;
      case 'profile':
        this.initCardPreviewListeners();
        this.loadProfile();
        break;
    }
  }
  
  renderFullRankings() {
    const container = $('#rankingsTable');
    const countBadge = $('#rankingsCount');
    
    if (countBadge) countBadge.textContent = `${this.rankings.length} teams`;
    if (!container) return;
    
    // Update your team stats in sidebar
    this.updateYourTeamStats();
    this.updateTopPerformers();
    this.updateEventStats();
    
    // Calculate and render OPR and SoS
    this.calculateOPR();
    this.calculateSoS();
    this.renderOPRTable();
    this.renderSoSTable();
    
    if (this.rankings.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="rankings" data-icon-size="32"></div>
          <div class="empty-state-title" style="font-size: var(--text-sm);">No rankings yet</div>
          <div class="empty-state-text" style="font-size: var(--text-xs);">Waiting for matches</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    container.innerHTML = `
      <div class="ranking-row header">
        <div>#</div>
        <div>Team</div>
        <div style="text-align:right">W</div>
        <div style="text-align:right">L</div>
        <div style="text-align:right">T</div>
        <div style="text-align:right">MP</div>
      </div>
    ` + this.rankings.map(team => {
      const isHighlight = team.teamNumber.toString() === this.teamNumber;
      return `
        <div class="ranking-row ${isHighlight ? 'highlight' : ''}" onclick="app.viewTeamData(${team.teamNumber})">
          <div class="ranking-position ${team.rank === 1 ? 'gold' : team.rank === 2 ? 'silver' : team.rank === 3 ? 'bronze' : ''}">#${team.rank}</div>
          <div class="ranking-team">
            <span class="ranking-team-number">${team.teamNumber}</span>
            ${this.getTeamName(team.teamNumber) ? `<span class="ranking-team-name">${this.getTeamName(team.teamNumber)}</span>` : ''}
          </div>
          <div class="ranking-stat wins">${team.wins}</div>
          <div class="ranking-stat losses">${team.losses}</div>
          <div class="ranking-stat">${team.ties}</div>
          <div class="ranking-stat">${team.matchesPlayed}</div>
        </div>
      `;
    }).join('');
  }
  
  // ==========================================
  // OPR (Offensive Power Rating) Calculation
  // ==========================================
  
  calculateOPR() {
    this.oprData = [];
    
    // Need completed matches with scores
    const completedMatches = this.matches.filter(m => 
      m.completed && 
      m.red?.total != null && 
      m.blue?.total != null &&
      m.red?.teams?.length > 0 &&
      m.blue?.teams?.length > 0
    );
    
    if (completedMatches.length < 3 || this.teams.length === 0) {
      return;
    }
    
    // Build team index mapping
    const teamIndex = {};
    this.teams.forEach((team, i) => {
      teamIndex[team] = i;
    });
    
    const n = this.teams.length;
    
    // Initialize matrices for least squares: (A^T * A) * x = A^T * b
    // A is match matrix, b is scores, x is OPR values
    const ATA = Array(n).fill(0).map(() => Array(n).fill(0));
    const ATb = Array(n).fill(0);
    
    // Build the system of equations
    completedMatches.forEach(match => {
      const redTeams = match.red.teams.filter(t => teamIndex[t] !== undefined);
      const blueTeams = match.blue.teams.filter(t => teamIndex[t] !== undefined);
      
      if (redTeams.length === 0 || blueTeams.length === 0) return;
      
      const redScore = match.red.total;
      const blueScore = match.blue.total;
      
      // Red alliance equation
      redTeams.forEach(t1 => {
        const i1 = teamIndex[t1];
        ATb[i1] += redScore;
        redTeams.forEach(t2 => {
          const i2 = teamIndex[t2];
          ATA[i1][i2] += 1;
        });
      });
      
      // Blue alliance equation
      blueTeams.forEach(t1 => {
        const i1 = teamIndex[t1];
        ATb[i1] += blueScore;
        blueTeams.forEach(t2 => {
          const i2 = teamIndex[t2];
          ATA[i1][i2] += 1;
        });
      });
    });
    
    // Solve using Gauss-Seidel iteration (simpler than full matrix inversion)
    const opr = Array(n).fill(0);
    const maxIterations = 100;
    const tolerance = 0.01;
    
    // Initial guess: average score per team
    const totalScores = completedMatches.reduce((sum, m) => sum + m.red.total + m.blue.total, 0);
    const avgScore = totalScores / (completedMatches.length * 2 * 3); // Assuming 3 teams per alliance
    opr.fill(avgScore);
    
    for (let iter = 0; iter < maxIterations; iter++) {
      let maxChange = 0;
      
      for (let i = 0; i < n; i++) {
        if (ATA[i][i] === 0) continue;
        
        let sum = ATb[i];
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            sum -= ATA[i][j] * opr[j];
          }
        }
        
        const newVal = sum / ATA[i][i];
        maxChange = Math.max(maxChange, Math.abs(newVal - opr[i]));
        opr[i] = newVal;
      }
      
      if (maxChange < tolerance) break;
    }
    
    // Build OPR data array
    this.teams.forEach((team, i) => {
      this.oprData.push({
        teamNumber: team,
        opr: opr[i] || 0
      });
    });
    
    // Sort by OPR (descending)
    this.oprData.sort((a, b) => b.opr - a.opr);
    
    // Add rank
    this.oprData.forEach((team, i) => {
      team.rank = i + 1;
    });
  }
  
  renderOPRTable() {
    const container = $('#oprTable');
    const countBadge = $('#oprCount');
    
    if (countBadge) countBadge.textContent = `${this.oprData.length} teams`;
    if (!container) return;
    
    if (this.oprData.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="zap" data-icon-size="32"></div>
          <div class="empty-state-title" style="font-size: var(--text-sm);">Not enough data</div>
          <div class="empty-state-text" style="font-size: var(--text-xs);">Requires completed matches</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    const maxOPR = Math.max(...this.oprData.map(t => t.opr));
    
    container.innerHTML = this.oprData.map(team => {
      const barWidth = maxOPR > 0 ? (team.opr / maxOPR * 100) : 0;
      const isHighlight = team.teamNumber.toString() === this.teamNumber;
      return `
        <div class="opr-row ${isHighlight ? 'highlight' : ''}" onclick="app.viewTeamData(${team.teamNumber})">
          <div class="ranking-position ${team.rank === 1 ? 'gold' : team.rank === 2 ? 'silver' : team.rank === 3 ? 'bronze' : ''}">#${team.rank}</div>
          <div class="ranking-team">
            <span class="ranking-team-number">${team.teamNumber}</span>
            ${this.getTeamName(team.teamNumber) ? `<span class="ranking-team-name">${this.getTeamName(team.teamNumber)}</span>` : ''}
            <div class="opr-bar" style="flex:1; margin-left: var(--space-sm);">
              <div class="opr-bar-fill" style="width: ${barWidth}%"></div>
            </div>
          </div>
          <div class="opr-value">${team.opr.toFixed(1)}</div>
        </div>
      `;
    }).join('');
  }
  
  // ==========================================
  // Strength of Schedule Calculation
  // ==========================================
  
  calculateSoS() {
    this.sosData = [];
    
    // Need OPR data first
    if (this.oprData.length === 0) return;
    
    // Build OPR lookup
    const oprLookup = {};
    this.oprData.forEach(t => {
      oprLookup[t.teamNumber] = t.opr;
    });
    
    // Calculate average OPR
    const avgOPR = this.oprData.reduce((sum, t) => sum + t.opr, 0) / this.oprData.length;
    
    // For each team, calculate their schedule strength
    this.teams.forEach(team => {
      let partnerOPRSum = 0;
      let opponentOPRSum = 0;
      let matchCount = 0;
      
      this.matches.forEach(match => {
        if (!match.completed) return;
        
        const redTeams = match.red?.teams || [];
        const blueTeams = match.blue?.teams || [];
        
        const isOnRed = redTeams.includes(team) || redTeams.includes(parseInt(team));
        const isOnBlue = blueTeams.includes(team) || blueTeams.includes(parseInt(team));
        
        if (!isOnRed && !isOnBlue) return;
        
        matchCount++;
        
        if (isOnRed) {
          // Partners are other red teams, opponents are blue teams
          redTeams.forEach(t => {
            if (t != team && oprLookup[t] !== undefined) {
              partnerOPRSum += oprLookup[t];
            }
          });
          blueTeams.forEach(t => {
            if (oprLookup[t] !== undefined) {
              opponentOPRSum += oprLookup[t];
            }
          });
        } else {
          // Partners are other blue teams, opponents are red teams
          blueTeams.forEach(t => {
            if (t != team && oprLookup[t] !== undefined) {
              partnerOPRSum += oprLookup[t];
            }
          });
          redTeams.forEach(t => {
            if (oprLookup[t] !== undefined) {
              opponentOPRSum += oprLookup[t];
            }
          });
        }
      });
      
      if (matchCount === 0) return;
      
      // SoS = (avg partner OPR - avg opponent OPR) normalized
      // Positive = lucky (good partners, weak opponents)
      // Negative = unlucky (weak partners, strong opponents)
      const avgPartnerOPR = partnerOPRSum / (matchCount * 2); // 2 partners per match
      const avgOpponentOPR = opponentOPRSum / (matchCount * 3); // 3 opponents per match
      
      // Schedule strength: how much better your partners were vs your opponents
      const sos = avgPartnerOPR - avgOpponentOPR;
      
      this.sosData.push({
        teamNumber: team,
        sos: sos,
        avgPartnerOPR: avgPartnerOPR,
        avgOpponentOPR: avgOpponentOPR,
        matchCount: matchCount
      });
    });
    
    // Sort by SoS (lucky teams at top)
    this.sosData.sort((a, b) => b.sos - a.sos);
    
    // Add rank
    this.sosData.forEach((team, i) => {
      team.rank = i + 1;
    });
  }
  
  renderSoSTable() {
    const container = $('#sosTable');
    const countBadge = $('#sosCount');
    
    if (countBadge) countBadge.textContent = `${this.sosData.length} teams`;
    if (!container) return;
    
    if (this.sosData.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="target" data-icon-size="32"></div>
          <div class="empty-state-title" style="font-size: var(--text-sm);">Not enough data</div>
          <div class="empty-state-text" style="font-size: var(--text-xs);">Requires OPR data</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    container.innerHTML = this.sosData.map(team => {
      const sosClass = team.sos > 2 ? 'lucky' : team.sos < -2 ? 'unlucky' : 'neutral';
      const sosLabel = team.sos > 2 ? 'Lucky' : team.sos < -2 ? 'Unlucky' : '';
      const isHighlight = team.teamNumber.toString() === this.teamNumber;
      return `
        <div class="sos-row ${isHighlight ? 'highlight' : ''}" onclick="app.viewTeamData(${team.teamNumber})">
          <div class="ranking-position ${team.rank === 1 ? 'gold' : team.rank === 2 ? 'silver' : team.rank === 3 ? 'bronze' : ''}">#${team.rank}</div>
          <div class="ranking-team">
            <span class="ranking-team-number">${team.teamNumber}</span>
            ${this.getTeamName(team.teamNumber) ? `<span class="ranking-team-name">${this.getTeamName(team.teamNumber)}</span>` : ''}
          </div>
          <div class="sos-value ${sosClass}">${team.sos > 0 ? '+' : ''}${team.sos.toFixed(1)}</div>
          ${sosLabel ? `<span class="sos-indicator ${sosClass}">${sosLabel}</span>` : '<span style="width:40px"></span>'}
        </div>
      `;
    }).join('');
  }
  
  updateYourTeamStats() {
    const myRank = this.rankings.find(r => r.teamNumber.toString() === this.teamNumber);
    
    const yourTeamBadge = $('#yourTeamBadge');
    const yourTeamRank = $('#yourTeamRank');
    const yourTeamWins = $('#yourTeamWins');
    const yourTeamLosses = $('#yourTeamLosses');
    const yourTeamTies = $('#yourTeamTies');
    const yourTeamWinBar = $('#yourTeamWinBar');
    const yourTeamTieBar = $('#yourTeamTieBar');
    const yourTeamRecordText = $('#yourTeamRecordText');
    const yourTeamAdvancedCard = $('#yourTeamAdvancedCard');
    const yourTeamOPR = $('#yourTeamOPR');
    const yourTeamOPRRank = $('#yourTeamOPRRank');
    const yourTeamSoS = $('#yourTeamSoS');
    const yourTeamSoSRank = $('#yourTeamSoSRank');
    
    if (yourTeamBadge) yourTeamBadge.textContent = `Team ${this.teamNumber}`;
    
    if (!myRank) {
      if (yourTeamRank) yourTeamRank.textContent = '--';
      if (yourTeamWins) yourTeamWins.textContent = '0';
      if (yourTeamLosses) yourTeamLosses.textContent = '0';
      if (yourTeamTies) yourTeamTies.textContent = '0';
      if (yourTeamWinBar) yourTeamWinBar.style.width = '0%';
      if (yourTeamTieBar) yourTeamTieBar.style.width = '0%';
      if (yourTeamRecordText) yourTeamRecordText.textContent = 'No matches played';
      if (yourTeamAdvancedCard) yourTeamAdvancedCard.style.display = 'none';
      return;
    }
    
    const total = myRank.wins + myRank.losses + myRank.ties;
    const winRate = total > 0 ? Math.round((myRank.wins / total) * 100) : 0;
    const tieRate = total > 0 ? Math.round((myRank.ties / total) * 100) : 0;
    
    if (yourTeamRank) yourTeamRank.textContent = `#${myRank.rank}`;
    if (yourTeamWins) yourTeamWins.textContent = myRank.wins;
    if (yourTeamLosses) yourTeamLosses.textContent = myRank.losses;
    if (yourTeamTies) yourTeamTies.textContent = myRank.ties;
    if (yourTeamWinBar) yourTeamWinBar.style.width = `${winRate}%`;
    if (yourTeamTieBar) yourTeamTieBar.style.width = `${tieRate}%`;
    if (yourTeamRecordText) yourTeamRecordText.textContent = `Win Rate: ${winRate}%`;
    
    // Update OPR and SoS stats
    const myOPR = this.oprData.find(t => t.teamNumber.toString() === this.teamNumber);
    const mySoS = this.sosData.find(t => t.teamNumber.toString() === this.teamNumber);
    
    if (myOPR || mySoS) {
      if (yourTeamAdvancedCard) yourTeamAdvancedCard.style.display = 'block';
      
      if (myOPR && yourTeamOPR) {
        yourTeamOPR.textContent = myOPR.opr.toFixed(1);
      }
      if (myOPR && yourTeamOPRRank) {
        yourTeamOPRRank.textContent = `#${myOPR.rank}`;
      }
      if (mySoS && yourTeamSoS) {
        const sosValue = mySoS.sos;
        yourTeamSoS.textContent = `${sosValue > 0 ? '+' : ''}${sosValue.toFixed(1)}`;
        yourTeamSoS.style.color = sosValue > 2 ? 'var(--success)' : sosValue < -2 ? 'var(--danger)' : 'var(--text-secondary)';
      }
      if (mySoS && yourTeamSoSRank) {
        yourTeamSoSRank.textContent = `#${mySoS.rank}`;
      }
    } else {
      if (yourTeamAdvancedCard) yourTeamAdvancedCard.style.display = 'none';
    }
  }
  
  updateTopPerformers() {
    const container = $('#topPerformers');
    if (!container || this.rankings.length === 0) {
      if (container) {
        container.innerHTML = '<div class="empty-state-text">No data available</div>';
      }
      return;
    }
    
    // Find top performers
    const mostWins = [...this.rankings].sort((a, b) => b.wins - a.wins)[0];
    const topOPR = this.oprData.length > 0 ? this.oprData[0] : null;
    const luckiest = this.sosData.length > 0 ? this.sosData[0] : null;
    const unluckiest = this.sosData.length > 0 ? this.sosData[this.sosData.length - 1] : null;
    
    let performersHTML = `
      <div class="top-performer">
        <div class="top-performer-medal gold">
          <span data-icon="trophy" data-icon-size="12"></span>
        </div>
        <div class="top-performer-info">
          <div class="top-performer-team">${this.teamLabel(mostWins.teamNumber)}</div>
          <div class="top-performer-stat">Most Wins (${mostWins.wins})</div>
        </div>
      </div>
    `;
    
    if (topOPR) {
      performersHTML += `
      <div class="top-performer">
          <div class="top-performer-medal" style="background: linear-gradient(135deg, var(--purple), var(--purple-light));">
            <span data-icon="zap" data-icon-size="12"></span>
          </div>
        <div class="top-performer-info">
            <div class="top-performer-team">${this.teamLabel(topOPR.teamNumber)}</div>
            <div class="top-performer-stat">Highest OPR (${topOPR.opr.toFixed(1)})</div>
        </div>
      </div>
      `;
    }
    
    if (luckiest && luckiest.sos > 2) {
      performersHTML += `
      <div class="top-performer">
          <div class="top-performer-medal" style="background: linear-gradient(135deg, var(--success), var(--success-light));">
            <span data-icon="arrowUp" data-icon-size="12"></span>
          </div>
        <div class="top-performer-info">
            <div class="top-performer-team">${this.teamLabel(luckiest.teamNumber)}</div>
            <div class="top-performer-stat">Luckiest Schedule (+${luckiest.sos.toFixed(1)})</div>
        </div>
      </div>
    `;
    }
    
    if (unluckiest && unluckiest.sos < -2) {
      performersHTML += `
        <div class="top-performer">
          <div class="top-performer-medal" style="background: linear-gradient(135deg, var(--danger), var(--danger-light));">
            <span data-icon="arrowDown" data-icon-size="12"></span>
          </div>
          <div class="top-performer-info">
            <div class="top-performer-team">${this.teamLabel(unluckiest.teamNumber)}</div>
            <div class="top-performer-stat">Toughest Schedule (${unluckiest.sos.toFixed(1)})</div>
          </div>
        </div>
      `;
    }
    
    container.innerHTML = performersHTML;
    initIcons();
  }
  
  updateEventStats() {
    const totalMatches = this.matches.length;
    const completedMatches = this.matches.filter(m => m.completed).length;
    const qualProgress = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;
    
    // Calculate average score from completed matches
    const completedWithScores = this.matches.filter(m => m.completed && m.redScore != null && m.blueScore != null);
    let avgScore = 0;
    let highScore = 0;
    
    if (completedWithScores.length > 0) {
      const allScores = completedWithScores.flatMap(m => [m.redScore, m.blueScore]);
      avgScore = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
      highScore = Math.max(...allScores);
    }
    
    const totalMatchesEl = $('#totalMatchesPlayed');
    const avgMatchScoreEl = $('#avgMatchScore');
    const highScoreEl = $('#highScore');
    const qualProgressEl = $('#qualProgress');
    
    if (totalMatchesEl) totalMatchesEl.textContent = completedMatches;
    if (avgMatchScoreEl) avgMatchScoreEl.textContent = avgScore || '--';
    if (highScoreEl) highScoreEl.textContent = highScore || '--';
    if (qualProgressEl) qualProgressEl.textContent = `${qualProgress}%`;
  }
  
  renderAllMatches() {
    // Separate matches into categories
    const upcomingMatches = this.matches.filter(m => !m.completed);
    const completedMatches = this.matches.filter(m => m.completed);
    
    // Sort completed matches by match number (most recent first)
    completedMatches.sort((a, b) => {
      const aNum = parseInt(a.description.match(/\d+/)?.[0] || 0);
      const bNum = parseInt(b.description.match(/\d+/)?.[0] || 0);
      return bNum - aNum;
    });
    
    // Sort upcoming matches by match number (soonest first)
    upcomingMatches.sort((a, b) => {
      const aNum = parseInt(a.description.match(/\d+/)?.[0] || 0);
      const bNum = parseInt(b.description.match(/\d+/)?.[0] || 0);
      return aNum - bNum;
    });
    
    // Render each section
    this.renderMatchSection('completedMatchesGrid', completedMatches, 'completedMatchesCount', 'played');
    this.renderMatchSection('upcomingMatchesGrid', upcomingMatches, 'upcomingMatchesCount', 'scheduled');
  }
  
  renderMatchSection(containerId, matches, countId, countLabel) {
    const container = $(`#${containerId}`);
    const countBadge = $(`#${countId}`);
    
    if (countBadge) countBadge.textContent = `${matches.length} ${countLabel}`;
    if (!container) return;
    
    if (matches.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    container.innerHTML = matches.map(match => this.renderMatchCard(match)).join('');
  }
  
  renderMatchCard(match) {
    const isYourMatch = match.red.teams.includes(parseInt(this.teamNumber)) || 
                        match.blue.teams.includes(parseInt(this.teamNumber));
    const yourAlliance = match.red.teams.includes(parseInt(this.teamNumber)) ? 'red' : 
                         match.blue.teams.includes(parseInt(this.teamNumber)) ? 'blue' : null;
    
    let resultClass = '';
    let resultText = '';
    if (match.completed && yourAlliance) {
      const yourScore = yourAlliance === 'red' ? match.red.total : match.blue.total;
      const oppScore = yourAlliance === 'red' ? match.blue.total : match.red.total;
      if (yourScore > oppScore) {
        resultClass = 'win';
        resultText = 'WIN';
      } else if (yourScore < oppScore) {
        resultClass = 'loss';
        resultText = 'LOSS';
      } else {
        resultClass = 'tie';
        resultText = 'TIE';
      }
    }
    
    return `
      <div class="match-card ${isYourMatch ? 'your-match' : ''}">
        <div class="match-card-header">
          <span class="match-number">${match.description}</span>
          ${resultText ? `<span class="match-result ${resultClass}">${resultText}</span>` : 
            `<span class="match-time">${match.completed ? 'Completed' : 'Scheduled'}</span>`}
        </div>
        <div class="match-card-body">
          <div class="alliance red">
            <div class="alliance-label red">Red</div>
            <div class="alliance-score red">${match.red.total ?? '-'}</div>
            <div class="alliance-teams">
              ${match.red.teams.map(t => `<span class="alliance-team ${t.toString() === this.teamNumber ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join('')}
            </div>
          </div>
          <div class="match-vs">VS</div>
          <div class="alliance blue">
            <div class="alliance-label blue">Blue</div>
            <div class="alliance-score blue">${match.blue.total ?? '-'}</div>
            <div class="alliance-teams">
              ${match.blue.teams.map(t => `<span class="alliance-team ${t.toString() === this.teamNumber ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  renderTeamsGrid(filter = '') {
    const container = $('#teamsGrid');
    const countBadge = $('#teamsCount');
    
    if (!container) return;
    
    // Ensure OPR and SoS are calculated
    if (this.oprData.length === 0 && this.matches.length > 0) {
      this.calculateOPR();
    }
    if (this.sosData.length === 0 && this.matches.length > 0) {
      this.calculateSoS();
    }
    
    // Build team data with all stats
    let teamsData = this.teams.map(teamNum => {
      const ranking = this.rankings.find(r => r.teamNumber === teamNum);
      const opr = this.oprData.find(o => o.teamNumber === teamNum);
      const sos = this.sosData.find(s => s.teamNumber === teamNum);
      
      return {
        number: teamNum,
        rank: ranking?.rank || '-',
        wins: ranking?.wins ?? '-',
        losses: ranking?.losses ?? '-',
        ties: ranking?.ties ?? '-',
        gp: ranking?.matchesPlayed ?? '-',
        opr: opr?.opr ?? null,
        oprRank: opr?.rank ?? null,
        sos: sos?.sos ?? null,
        sosRank: sos?.rank ?? null,
        sortRank: ranking?.rank ?? 999,
      };
    });
    
    // Filter
    if (filter) {
      teamsData = teamsData.filter(t => t.number.toString().includes(filter));
    }
    
    // Sort by rank
    teamsData.sort((a, b) => a.sortRank - b.sortRank);
    
    if (countBadge) countBadge.textContent = `${teamsData.length} teams`;
    
    if (teamsData.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-2xl);">
          <div class="empty-state-icon" data-icon="teams" data-icon-size="48"></div>
          <div class="empty-state-title">${filter ? 'No matching teams' : 'No teams'}</div>
          <div class="empty-state-text">${filter ? 'Try a different search' : 'Teams will appear when an event is loaded'}</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    const hasOPR = this.oprData.length > 0;
    const hasSoS = this.sosData.length > 0;
    
    container.innerHTML = `
      <table class="teams-table">
        <thead>
          <tr>
            <th class="teams-th-rank">#</th>
            <th class="teams-th-team">Team</th>
            <th class="teams-th-stat" style="color: var(--success);">W</th>
            <th class="teams-th-stat" style="color: var(--danger);">L</th>
            <th class="teams-th-stat" style="color: var(--text-muted);">T</th>
            <th class="teams-th-stat" style="color: var(--purple);">GP</th>
            ${hasOPR ? '<th class="teams-th-opr">OPR</th>' : ''}
            ${hasSoS ? '<th class="teams-th-sos">SoS</th>' : ''}
            <th class="teams-th-action"></th>
          </tr>
        </thead>
        <tbody>
          ${teamsData.map(team => {
            const isYou = team.number.toString() === this.teamNumber;
            const oprColor = team.opr != null ? (team.oprRank <= 3 ? 'var(--purple)' : 'var(--text-primary)') : 'var(--text-muted)';
            const sosVal = team.sos;
            const sosColor = sosVal != null ? (sosVal > 0.5 ? 'var(--success)' : sosVal < -0.5 ? 'var(--danger)' : 'var(--text-secondary)') : 'var(--text-muted)';
            
            return `
              <tr class="teams-row ${isYou ? 'highlight' : ''}" onclick="app.viewTeamData(${team.number})">
                <td class="teams-td-rank">
                  <span class="rank-position ${team.rank === 1 ? 'gold' : team.rank === 2 ? 'silver' : team.rank === 3 ? 'bronze' : ''}">${team.rank}</span>
                </td>
                <td class="teams-td-team">
                  <span class="teams-team-number">${team.number}</span>
                  ${this.getTeamName(team.number) ? `<span class="teams-team-name" style="color:var(--text-muted);font-size:0.85em;margin-left:var(--space-xs);">${this.getTeamName(team.number)}</span>` : ''}
                </td>
                <td class="teams-td-stat" style="color: var(--success);">${team.wins}</td>
                <td class="teams-td-stat" style="color: var(--danger);">${team.losses}</td>
                <td class="teams-td-stat" style="color: var(--text-muted);">${team.ties}</td>
                <td class="teams-td-stat" style="color: var(--purple);">${team.gp}</td>
                ${hasOPR ? `<td class="teams-td-opr" style="color: ${oprColor};">${team.opr != null ? team.opr.toFixed(1) : '-'}</td>` : ''}
                ${hasSoS ? `<td class="teams-td-sos" style="color: ${sosColor};">${sosVal != null ? (sosVal > 0 ? '+' : '') + sosVal.toFixed(1) : '-'}</td>` : ''}
                <td class="teams-td-action">
                  <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); app.viewTeamData(${team.number})">
                    <span data-icon="data" data-icon-size="14"></span>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    initIcons();
  }
  
  renderScoutForm() {
    const container = $('#scoutFormSections');
    if (!container) return;
    
    // Show read-only banner for ended events
    const scoutForm = $('#scoutForm');
    if (this._isEventEnded()) {
      const existingBanner = container.parentElement?.querySelector('.event-ended-banner');
      if (!existingBanner) {
        const banner = document.createElement('div');
        banner.className = 'event-ended-banner';
        banner.innerHTML = `
          <span class="event-ended-icon" data-icon="lock" data-icon-size="16"></span>
          <span class="event-ended-label">This event has ended — scouting form is read-only</span>
        `;
        container.parentElement?.insertBefore(banner, container);
        initIcons();
      }
      // Disable submit button
      const submitBtn = scoutForm?.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Event Ended — Read Only';
      }
    } else {
      // Remove any stale ended banner
      container.parentElement?.querySelector('.event-ended-banner')?.remove();
      const submitBtn = scoutForm?.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Scouting Data';
      }
    }
    
    const sections = [
      {
        title: 'Tele-OP Performance',
        icon: 'robot',
        fields: [
          { type: 'checkbox', label: 'Mecanum Drive Train', id: 'mecanum' },
          { type: 'slider', label: 'Driver Practice', id: 'driverPractice', min: 0, max: 3, step: 1 },
          { type: 'number', label: 'Tele-OP Balls', id: 'teleOpBalls' },
          { type: 'options', label: 'Shooting Distance', id: 'shootingDist', options: ['Near', 'Far', 'Both'] }
        ]
      },
      {
        title: 'Autonomous',
        icon: 'clock',
        fields: [
          { type: 'number', label: 'Auto Balls', id: 'autoBalls' },
          { type: 'options', label: 'Auto Shooting', id: 'autoShooting', options: ['Near', 'Far', 'Both'] },
          { type: 'number', label: 'Auto Points', id: 'autoPoints' },
          { type: 'checkbox', label: 'Leave', id: 'autoLeave' },
          { type: 'text', label: 'Auto Details', id: 'autoDetails', big: true }
        ]
      },
      // Notes are in a separate panel now
    ];
    
    container.innerHTML = sections.map(section => `
      <div class="scout-section">
        <div class="scout-section-header">
          <span class="scout-section-icon" data-icon="${section.icon}" data-icon-size="18"></span>
          <span class="scout-section-title">${section.title}</span>
        </div>
        <div class="scout-section-body">
          ${section.fields.map(field => this.renderFormField(field)).join('')}
        </div>
      </div>
    `).join('');
    
    initIcons();
  }
  
  async autofillScoutForm(teamNumber) {
    if (!teamNumber || !this.currentEvent) {
      // Reset the form if no team selected
      const form = $('#scoutForm');
      if (form) form.reset();
      this.renderScoutCustomFields();
      return;
    }
    
    try {
      const data = await api.getScoutingData(teamNumber, this.currentEvent);
      
      // Use our team's private data (has unredacted values) for autofill
      const values = data?.private_data?.data;
      if (!values || !Array.isArray(values) || values.length === 0) {
        // No existing data — clear the form
        const form = $('#scoutForm');
        if (form) form.reset();
        this.renderScoutCustomFields();
        return;
      }
      
      // Map field IDs to data array indexes (same order as handleScoutSubmit)
      const fieldIds = ['mecanum', 'driverPractice', 'teleOpBalls', 'shootingDist',
                        'autoBalls', 'autoShooting', 'autoPoints', 'autoLeave',
                        'autoDetails', 'privateNotes'];
      
      fieldIds.forEach((id, idx) => {
        const el = $(`#${id}`);
        if (!el || idx >= values.length) return;
        
        const val = values[idx];
        
        if (el.type === 'checkbox') {
          el.checked = val === true || val === 'true' || val === '1';
        } else if (el.type === 'range') {
          el.value = val;
          // Update the slider display label
          const label = $(`#${id}Value`);
          if (label) label.textContent = val;
        } else {
          el.value = val || '';
        }
      });
      
      // Also load custom question responses
      try {
        const cqData = await api.getCustomResponses(teamNumber, this.currentEvent);
        if (cqData?.questions) {
          cqData.questions.forEach(q => {
            if (q.value === null || q.value === undefined) return;
            const el = $(`#cq_${q.id}`);
            if (!el) return;
            if (el.type === 'checkbox') {
              el.checked = q.value === 'true' || q.value === '1';
            } else if (el.type === 'range') {
              el.value = q.value;
              const label = $(`#cq_${q.id}Value`);
              if (label) label.textContent = q.value;
            } else {
              el.value = q.value;
            }
          });
        }
      } catch (e) {
        // Custom questions autofill is best-effort
      }
      
      this.updateScoutPreview();
    } catch (e) {
      console.warn('Could not autofill scout form:', e);
    }
  }
  
  renderFormField(field) {
    let input = '';
    
    switch (field.type) {
      case 'checkbox':
        input = `
          <label class="checkbox-wrapper">
            <input type="checkbox" name="${field.id}" id="${field.id}">
            <span>${field.label}</span>
          </label>
        `;
        break;
        
      case 'slider':
        input = `
          <label class="form-label">${field.label}</label>
          <div class="slider-wrapper">
            <input type="range" class="slider" name="${field.id}" id="${field.id}" 
                   min="${field.min}" max="${field.max}" step="${field.step}" value="${field.min}"
                   oninput="document.getElementById('${field.id}Value').textContent = this.value">
            <span class="slider-value" id="${field.id}Value">${field.min}</span>
          </div>
        `;
        break;
        
      case 'number':
        input = `
          <label class="form-label">${field.label}</label>
          <input type="number" class="form-input" name="${field.id}" id="${field.id}" min="0">
        `;
        break;
        
      case 'options':
        input = `
          <label class="form-label">${field.label}</label>
          <select class="form-input form-select" name="${field.id}" id="${field.id}">
            <option value="">Select...</option>
            ${field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
          </select>
        `;
        break;
        
      case 'text':
        input = `
          <label class="form-label">${field.label}</label>
          <textarea class="form-input form-textarea" name="${field.id}" id="${field.id}" ${field.big ? 'rows="3"' : 'rows="2"'}></textarea>
        `;
        break;
    }
    
    return `<div class="form-group">${input}</div>`;
  }
  
  updateScoutPreview() {
    const container = $('#scoutPreview');
    if (!container) return;
    
    const formFields = $$('#scoutFormSections input, #scoutFormSections select, #scoutFormSections textarea');
    let previewHTML = '';
    
    formFields.forEach(field => {
      if (!field.name || field.type === 'hidden') return;
      
      let value = '';
      if (field.type === 'checkbox') {
        value = field.checked ? 'Yes' : 'No';
      } else if (field.type === 'range') {
        value = field.value;
      } else {
        value = field.value || '-';
      }
      
      const label = field.closest('.form-group')?.querySelector('.form-label')?.textContent || 
                   field.closest('.checkbox-wrapper')?.querySelector('span')?.textContent || field.name;
      
      previewHTML += `
        <div style="display: flex; justify-content: space-between; padding: var(--space-sm) 0; border-bottom: 1px solid var(--border-color); font-size: var(--text-sm);">
          <span style="color: var(--text-muted);">${label}</span>
          <span style="font-weight: 500;">${value}</span>
        </div>
      `;
    });
    
    container.innerHTML = previewHTML || `
      <div class="empty-state" style="padding: var(--space-xl);">
        <div class="empty-state-icon" data-icon="clipboard" data-icon-size="32"></div>
        <div class="empty-state-text">Fill the form to see preview</div>
      </div>
    `;
    initIcons();
  }
  
  async handleScoutSubmit(e) {
    e.preventDefault();
    
    if (this._isEventEnded()) {
      toast.error('This event has ended — scouting data is read-only');
      return;
    }
    
    const team = $('#scoutTeamSelect').value;
    if (!team) {
      toast.error('Please select a team');
      return;
    }
    
    if (!this.currentEvent) {
      toast.error('No event loaded');
      return;
    }
    
    const formData = [];
    const fields = ['mecanum', 'driverPractice', 'teleOpBalls', 'shootingDist', 
                   'autoBalls', 'autoShooting', 'autoPoints', 'autoLeave', 
                   'autoDetails', 'privateNotes'];
    
    fields.forEach(field => {
      const el = $(`#${field}`);
      if (el) {
        if (el.type === 'checkbox') {
          formData.push(el.checked);
        } else {
          formData.push(el.value || '');
        }
      }
    });
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }
    
    try {
      await api.addScoutingData(team, this.currentEvent, formData);
      
      // Also save custom field responses
      const customResponses = this.getCustomFieldValues();
      if (customResponses.length > 0) {
        await api.saveCustomResponses(team, this.currentEvent, customResponses).catch(err => {
          console.error('Failed to save custom responses:', err);
        });
      }
      
      toast.success('Scouting data saved!');
      e.target.reset();
      this.updateScoutPreview();
      // Re-render custom fields to reset slider values
      this.renderScoutCustomFields();
    } catch (error) {
      console.error('Failed to save scouting data:', error);
      toast.error('Failed to save data: ' + (error.message || 'Unknown error'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Scouting Data';
      }
    }
  }
  
  renderDataBrowser() {
    const container = $('#dataBrowserList');
    const countBadge = $('#dataBrowserCount');
    
    if (countBadge) countBadge.textContent = this.teams.length;
    if (!container) return;
    
    if (this.teams.length === 0) {
      container.innerHTML = `
        <div class="empty-state-text" style="padding: var(--space-lg); text-align: center;">
          No teams available
        </div>
      `;
      return;
    }
    
    // Sort teams by ranking (ranked teams first, then unranked)
    const sortedTeams = [...this.teams].sort((a, b) => {
      const rankA = this.rankings.find(r => r.teamNumber === a);
      const rankB = this.rankings.find(r => r.teamNumber === b);
      if (rankA && rankB) return rankA.rank - rankB.rank;
      if (rankA) return -1;
      if (rankB) return 1;
      return a - b;
    });
    
    container.innerHTML = sortedTeams.map(team => {
      const rank = this.rankings.find(r => r.teamNumber === team);
      return `
        <div class="data-browser-item ${this.selectedDataTeam === team ? 'active' : ''}" 
             data-team="${team}" 
             onclick="app.viewTeamData(${team})">
           <span class="data-browser-team"><span class="data-browser-team-num">${team}</span>${this.getTeamName(team) ? `<span class="data-browser-team-name">· ${this.getTeamName(team)}</span>` : ''}</span>
          ${rank ? `<span class="data-browser-rank">#${rank.rank}</span>` : ''}
        </div>
      `;
    }).join('');
  }
  
  filterDataBrowserTeams(query) {
    const items = $$('.data-browser-item');
    const lowerQuery = query.toLowerCase();
    
    items.forEach(item => {
      const teamNumber = item.dataset.team;
      const teamName = (this.getTeamName(teamNumber) || '').toLowerCase();
      item.style.display = (teamNumber.includes(lowerQuery) || teamName.includes(lowerQuery)) ? 'flex' : 'none';
    });
  }
  
  async viewTeamData(team) {
    this.selectedDataTeam = team;
    this.navigateTo('data');
    
    // Update browser selection
    $$('.data-browser-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.team) === team);
    });
    
    // Show header
    const header = $('#dataHeader');
    if (header) header.style.display = 'flex';
    
    // Update header info
    const teamRank = this.rankings.find(r => r.teamNumber === parseInt(team));
    const dataTeamAvatar = $('#dataTeamAvatar');
    const dataTeamNumber = $('#dataTeamNumber');
    const dataTeamRank = $('#dataTeamRank');
    const dataTeamRecord = $('#dataTeamRecord');
    
    if (dataTeamAvatar) dataTeamAvatar.textContent = team.toString().charAt(0);
    if (dataTeamNumber) dataTeamNumber.textContent = `Team ${team}${this.getTeamName(team) ? ' · ' + this.getTeamName(team) : ''}`;
    
    if (teamRank) {
      if (dataTeamRank) dataTeamRank.textContent = `#${teamRank.rank}`;
      if (dataTeamRecord) dataTeamRecord.textContent = `${teamRank.wins}W ${teamRank.losses}L ${teamRank.ties}T`;
    } else {
      if (dataTeamRank) dataTeamRank.textContent = '--';
      if (dataTeamRecord) dataTeamRecord.textContent = 'No record';
    }
    
    // Load scouting data from API
    await this.loadTeamScoutingData(team, teamRank);
  }
  
  async loadTeamScoutingData(team, teamRank) {
    const container = $('#dataContent');
    const statsContainer = $('#dataStatsContent');
    
    
    if (!container) return;
    
    // Show loading state
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" data-icon="refresh" data-icon-size="48" class="spin"></div>
        <div class="empty-state-title">Loading data...</div>
      </div>
    `;
    initIcons();
    
    try {
      let data;
      try {
        data = await api.getScoutingData(team, this.currentEvent);
      } catch (e) {
        data = { fields: [], private_data: null, public_data: [] };
      }
      
      // API returns { fields, private_data, public_data }
      let hasPrivateData = data.private_data && data.private_data.data && data.private_data.data.length > 0;
      let hasPublicData = data.public_data && data.public_data.length > 0;
      
      // Only generate demo scouting data for DEVDATA events
      if (!hasPrivateData && !hasPublicData && this._isDevDataEvent()) {
        data = this.generateDemoScoutingData(team);
        hasPrivateData = data.private_data && data.private_data.data && data.private_data.data.length > 0;
        hasPublicData = data.public_data && data.public_data.length > 0;
      }
      
      if (!hasPrivateData && !hasPublicData) {
        // Still try to load custom field responses even if no standard scouting data
        let customOnlyRows = '';
        try {
          const cqData = await api.getCustomResponses(team, this.currentEvent);
          if (cqData?.questions && cqData.questions.length > 0) {
            customOnlyRows = cqData.questions.map(q => {
              let displayValue = q.value ?? '-';
              let valueClass = '';
              if (q.field_type === 'boolean') {
                if (q.value === 'true') { displayValue = 'Yes'; valueClass = 'val-yes'; }
                else if (q.value === 'false') { displayValue = 'No'; valueClass = 'val-no'; }
                else { displayValue = '-'; }
              } else if ((q.field_type === 'number' || q.field_type === 'slider') && (q.value === null || q.value === '')) {
                displayValue = '-';
              } else if (!q.value) { displayValue = '-'; }
              return `<div class="data-row"><span class="data-row-label">${this._escapeHtml(q.label)}</span><span class="data-row-value ${valueClass}">${this._escapeHtml(String(displayValue))}</span></div>`;
            }).join('');
          }
        } catch (e) { /* ignore */ }
        
        if (customOnlyRows) {
          container.innerHTML = `
            <div class="data-entry data-entry-yours">
              <div class="data-entry-header">
                <div class="data-entry-title">
                  <span data-icon="star" data-icon-size="16" style="color: var(--success);"></span>
                  Your Scouting Data
                </div>
                <span class="badge" style="background: var(--success-alpha-10); color: var(--success);">Your Team</span>
              </div>
              <div class="data-entry-body">
                <div class="data-rows">
                  <div class="empty-state-text" style="padding: var(--space-sm) 0; color: var(--text-muted);">No standard fields submitted</div>
                </div>
                <div style="border-top: 1px solid var(--border-secondary); margin-top: var(--space-sm); padding-top: var(--space-sm);">
                  <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-xs);">
                    Custom Fields <span class="badge" style="background: var(--primary-alpha-10); color: var(--primary); font-size: 9px; padding: 1px 6px;">Private</span>
                  </div>
                  ${customOnlyRows}
                </div>
              </div>
            </div>
          `;
        } else {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon" data-icon="clipboard" data-icon-size="48"></div>
            <div class="empty-state-title">No scouting data</div>
            <div class="empty-state-text">Be the first to scout this team!</div>
          </div>
        `;
        }
        initIcons();
        return;
      }
      
      // Build entries array from private and public data
      const entries = [];
      if (hasPrivateData) {
        entries.push({
          data: data.private_data.data,
          scouting_team: data.private_data.scouting_team,
          isYourData: true
        });
      }
      if (hasPublicData) {
        data.public_data.forEach(entry => {
          entries.push({
            data: entry.data,
            scouting_team: entry.scouting_team,
            isYourData: false
          });
        });
      }
      
      // Pre-fetch custom field responses (private to this team)
      let customFieldRows = '';
      try {
        const cqData = await api.getCustomResponses(team, this.currentEvent);
        if (cqData?.questions && cqData.questions.length > 0) {
          customFieldRows = cqData.questions.map(q => {
            let displayValue = q.value ?? '-';
            let valueClass = '';
            
            if (q.field_type === 'boolean') {
              if (q.value === 'true') { displayValue = 'Yes'; valueClass = 'val-yes'; }
              else if (q.value === 'false') { displayValue = 'No'; valueClass = 'val-no'; }
              else { displayValue = '-'; }
            } else if (q.field_type === 'number' || q.field_type === 'slider') {
              if (q.value !== null && q.value !== '') {
                valueClass = 'val-number';
              } else {
                displayValue = '-';
              }
            } else if (!q.value) {
              displayValue = '-';
            }
            
            return `
              <div class="data-row">
                <span class="data-row-label">${this._escapeHtml(q.label)}</span>
                <span class="data-row-value ${valueClass}">${this._escapeHtml(String(displayValue))}</span>
              </div>
            `;
          }).join('');
        }
      } catch (e) {
        console.warn('Failed to load custom responses:', e);
      }
      
      // Build custom fields section with divider (only for "Your Data" card)
      const customFieldsSection = customFieldRows ? `
        <div style="border-top: 1px solid var(--border-secondary); margin-top: var(--space-sm); padding-top: var(--space-sm);">
          <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-xs);">
            Custom Fields <span class="badge" style="background: var(--primary-alpha-10); color: var(--primary); font-size: 9px; padding: 1px 6px;">Private</span>
          </div>
          ${customFieldRows}
        </div>
      ` : '';
      
      // Render scouting data entries
      const fieldLabels = data.fields || ['Mecanum Drive', 'Driver Practice', 'Tele-OP Balls', 'Shooting Dist', 
                                          'Auto Balls', 'Auto Shooting', 'Auto Points', 'Leave', 'Auto Details'];
      
      container.innerHTML = entries.map((entry, idx) => {
        const values = entry.data || [];
        const isYours = entry.isYourData;
        const sectionClass = isYours ? 'data-entry data-entry-yours' : 'data-entry data-entry-other';
        const title = isYours ? 'Your Scouting Data' : `Scouted by Team ${entry.scouting_team}`;
        
        // Separate fields into short (number/bool/option) and long (text notes)
        const shortFields = [];
        const longFields = [];
        
        fieldLabels.forEach((field, i) => {
                const value = values[i];
          // For other teams' data, skip redacted/private fields entirely
          if (!isYours && value === 'Redacted Field') return;
          
          const isLong = typeof value === 'string' && value.length > 20;
          const fieldLower = field.toLowerCase();
          const isNoteField = fieldLower.includes('note') || fieldLower.includes('detail') || fieldLower.includes('what autos');
          if (isLong || isNoteField) {
            longFields.push({ label: field, value, index: i });
          } else {
            shortFields.push({ label: field, value, index: i });
          }
        });
        
        // Render short fields as a clean table
        const shortFieldsHTML = shortFields.map(f => {
          const val = f.value;
          let displayValue, valueClass = '';
          if (typeof val === 'boolean') {
            displayValue = val ? 'Yes' : 'No';
            valueClass = val ? 'val-yes' : 'val-no';
          } else {
            displayValue = val || '-';
            if (!isNaN(val) && val !== '' && val !== '-') {
              valueClass = 'val-number';
            }
          }
                return `
            <div class="data-row">
              <span class="data-row-label">${f.label}</span>
              <span class="data-row-value ${valueClass}">${displayValue}</span>
                  </div>
                `;
        }).join('');
        
        // Render long fields as full-width text blocks (only if they have content)
        const visibleLongFields = longFields.filter(f => f.value && f.value !== 'Redacted Field');
        const longFieldsHTML = visibleLongFields.map(f => {
          return `
            <div class="data-note-block">
              <div class="data-note-label">${f.label}</div>
              <div class="data-note-value">${f.value || '<span class="text-muted">No notes</span>'}</div>
          </div>
        `;
      }).join('');
      
        if (isYours) {
          return `
            <div class="${sectionClass}">
              <div class="data-entry-header">
                <div class="data-entry-title">
                  <span data-icon="star" data-icon-size="16" style="color: var(--success);"></span>
                  ${title}
              </div>
                <span class="badge" style="background: var(--success-alpha-10); color: var(--success);">Your Team</span>
              </div>
              <div class="data-entry-body">
                <div class="data-rows">${shortFieldsHTML}</div>
                ${longFieldsHTML ? `<div class="data-notes">${longFieldsHTML}</div>` : ''}
                ${customFieldsSection}
              </div>
            </div>
          `;
        } else {
          return `
            <div class="${sectionClass}">
              <div class="data-entry-header">
                <div class="data-entry-title">${title}</div>
                <span class="badge badge-secondary">Public</span>
              </div>
              <div class="data-entry-body compact">
                <div class="data-rows-grid">${shortFieldsHTML}</div>
                ${longFieldsHTML ? `<div class="data-notes">${longFieldsHTML}</div>` : ''}
              </div>
          </div>
        `;
      }
      }).join('');
      
      initIcons();
      
    } catch (error) {
      console.error('Failed to load scouting data:', error);
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" data-icon="alertCircle" data-icon-size="48"></div>
          <div class="empty-state-title">Failed to load data</div>
          <div class="empty-state-text">${error.message || 'Please try again'}</div>
        </div>
      `;
      initIcons();
    }
    
    // Load match list and notes for the sidebar
    this.loadDataMatchNotes(team);
    
    // Stats
    if (statsContainer && teamRank) {
      statsContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-md);">
          <div style="text-align: center; padding: var(--space-md); background: var(--bg-tertiary); border-radius: var(--radius-lg);">
            <div style="font-size: var(--text-2xl); font-weight: 700; color: var(--primary);">#${teamRank.rank}</div>
            <div style="font-size: var(--text-xs); color: var(--text-muted);">Rank</div>
          </div>
          <div style="text-align: center; padding: var(--space-md); background: var(--bg-tertiary); border-radius: var(--radius-lg);">
            <div style="font-size: var(--text-2xl); font-weight: 700;">${teamRank.matchesPlayed}</div>
            <div style="font-size: var(--text-xs); color: var(--text-muted);">Matches</div>
          </div>
          <div style="text-align: center; padding: var(--space-md); background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-lg);">
            <div style="font-size: var(--text-2xl); font-weight: 700; color: var(--success);">${teamRank.wins}</div>
            <div style="font-size: var(--text-xs); color: var(--text-muted);">Wins</div>
          </div>
          <div style="text-align: center; padding: var(--space-md); background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-lg);">
            <div style="font-size: var(--text-2xl); font-weight: 700; color: var(--danger);">${teamRank.losses}</div>
            <div style="font-size: var(--text-xs); color: var(--text-muted);">Losses</div>
          </div>
        </div>
      `;
    } else if (statsContainer) {
      statsContainer.innerHTML = '<div class="empty-state-text">No ranking data</div>';
    }
  }
  
  // ==========================================
  // View Data - Match Notes
  // ==========================================
  
  async loadDataMatchNotes(team) {
    const matchListContainer = $('#dataMatchList');
    const countBadge = $('#dataMatchNotesCount');
    
    if (!matchListContainer) return;
    
    const teamNum = parseInt(team);
    
    // Find all matches this team played in
    const teamMatches = this.matches.filter(m => 
      m.red.teams.includes(teamNum) || m.blue.teams.includes(teamNum)
    ).sort((a, b) => {
      const aNum = parseInt(a.description.match(/\d+/)?.[0] || 0);
      const bNum = parseInt(b.description.match(/\d+/)?.[0] || 0);
      return bNum - aNum;
    });
    
    if (countBadge) countBadge.textContent = teamMatches.length;
    
    if (teamMatches.length === 0) {
      matchListContainer.innerHTML = `
        <div class="empty-state" style="padding: var(--space-lg);">
          <div class="empty-state-text">No matches found</div>
        </div>
      `;
      return;
    }
    
    // Load all notes for this team
    let allNotes = [];
    try {
      let matchNotesData;
      try {
        matchNotesData = await api.getMatchNotes(this.currentEvent, { team: team.toString() });
      } catch (e) {
        matchNotesData = this._isDevDataEvent() ? this.getDemoNotesForTeam(team) : { private_notes: [], public_notes: [] };
      }
      const hasRealNotes = (matchNotesData.private_notes?.length > 0 || matchNotesData.public_notes?.length > 0);
      if (!hasRealNotes && this._isDevDataEvent()) {
        matchNotesData = this.getDemoNotesForTeam(team);
      }
      allNotes = [
        ...(matchNotesData.private_notes || []).map(n => ({ ...n, isPrivate: true, isYours: true })),
        ...(matchNotesData.public_notes || []).map(n => ({ ...n, isPrivate: false, isYours: n.scouting_team === this.teamNumber })),
      ];
    } catch (e) {
      console.warn('Could not load match notes:', e);
    }
    
    // Group notes by match
    const notesByMatch = {};
    allNotes.forEach(note => {
      if (!notesByMatch[note.match_number]) notesByMatch[note.match_number] = [];
      notesByMatch[note.match_number].push(note);
    });
    
    // Render expandable match list
    matchListContainer.innerHTML = teamMatches.map(match => {
      const isRed = match.red.teams.includes(teamNum);
      const hasScore = match.red.total != null && match.blue.total != null;
      const won = hasScore && ((isRed && match.red.total > match.blue.total) || (!isRed && match.blue.total > match.red.total));
      const lost = hasScore && !won && match.red.total !== match.blue.total;
      const notes = notesByMatch[match.description] || [];
      const noteCount = notes.length;
      
      let resultBadge = '';
      let resultClass = '';
      if (hasScore) {
        if (won) { resultBadge = 'W'; resultClass = 'win'; }
        else if (lost) { resultBadge = 'L'; resultClass = 'loss'; }
        else { resultBadge = 'T'; resultClass = 'tie'; }
      }
      
      // Separate notes
      const yourPrivate = notes.filter(n => n.isPrivate && n.isYours);
      const yourPublic = notes.filter(n => !n.isPrivate && n.isYours);
      const othersPublic = notes.filter(n => !n.isPrivate && !n.isYours);
      
      const renderNotes = (notesList, label, cssClass) => {
        if (notesList.length === 0) return '';
        return `
          <div class="dmn-note-group ${cssClass}">
            <div class="dmn-note-group-label ${cssClass}">${label}</div>
            ${notesList.map(n => `
              <div class="dmn-note-entry">
                ${n.scouting_team && !n.isYours ? `<span class="dmn-note-source">Team ${n.scouting_team}</span>` : ''}
                <span class="dmn-note-text">${n.notes}</span>
              </div>
            `).join('')}
          </div>
        `;
      };
      
      const hasNotes = noteCount > 0;
      
      const allianceColor = isRed ? 'red' : 'blue';
      
      return `
        <div class="dmn-item" onclick="this.classList.toggle('expanded')">
          <div class="dmn-header">
            <span class="dmn-alliance-bar ${allianceColor}"></span>
            <div class="dmn-header-left">
              <span class="dmn-match-name">${match.description}</span>
              ${hasScore ? `
                <span class="dmn-score">
                  <span class="dmn-score-red">${match.red.total}</span>
                  <span class="dmn-score-sep">-</span>
                  <span class="dmn-score-blue">${match.blue.total}</span>
                </span>
              ` : '<span class="dmn-upcoming">Upcoming</span>'}
            </div>
            <div class="dmn-header-right">
              ${hasNotes ? `<span class="dmn-note-badge">${noteCount}</span>` : ''}
              ${resultBadge ? `<span class="dmn-result ${resultClass}">${resultBadge}</span>` : ''}
              <span class="dmn-chevron">›</span>
            </div>
          </div>
          <div class="dmn-expand">
            <div class="dmn-alliances">
              <div class="dmn-alliance red">
                <span class="dmn-alliance-teams">${match.red.teams.map(t => `<span class="${t === teamNum ? 'dmn-team-highlight' : ''}">${t}</span>`).join(' ')}</span>
              </div>
              <span class="dmn-alliance-vs">vs</span>
              <div class="dmn-alliance blue">
                <span class="dmn-alliance-teams">${match.blue.teams.map(t => `<span class="${t === teamNum ? 'dmn-team-highlight' : ''}">${t}</span>`).join(' ')}</span>
              </div>
            </div>
            ${hasNotes ? `
              <div class="dmn-notes-body">
                ${renderNotes(yourPrivate, 'Your Private', 'private')}
                ${renderNotes(yourPublic, 'Your Public', 'public')}
                ${renderNotes(othersPublic, 'Other Teams', 'others')}
              </div>
            ` : `
              <div class="dmn-no-notes">No notes for this match</div>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // Team Members (Sub-Accounts) Methods
  // ==========================================
  
  async loadSubAccounts() {
    try {
      const data = await api.listSubAccounts();
      this.subAccounts = data.sub_accounts || [];
      this.renderMemberList();
    
      // Update count badge
      const countBadge = $('#memberCount');
      if (countBadge) countBadge.textContent = this.subAccounts.length;
    } catch (error) {
      console.error('Failed to load sub accounts:', error);
      if (error.status === 403) {
        // Sub account trying to access - show different message
        const list = $('#memberList');
        if (list) {
          list.innerHTML = `
            <div class="empty-state" style="padding: var(--space-xl);">
              <div class="empty-state-icon" data-icon="alert" data-icon-size="32"></div>
              <div class="empty-state-title" style="font-size: var(--text-sm);">Main account required</div>
              <div class="empty-state-text" style="font-size: var(--text-xs);">Only the main account can manage team members</div>
            </div>
          `;
          initIcons();
        }
      } else {
        toast.error('Failed to load team members');
      }
    }
  }
  
  renderMemberList() {
    const container = $('#memberList');
    if (!container) return;
    
    if (this.subAccounts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="teams" data-icon-size="32"></div>
          <div class="empty-state-title" style="font-size: var(--text-sm);">No members yet</div>
          <div class="empty-state-text" style="font-size: var(--text-xs);">Add scouts using the form below</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    container.innerHTML = this.subAccounts.map(member => {
      const initial = member.name.charAt(0).toUpperCase();
      const teamsText = member.assigned_teams && member.assigned_teams.length > 0
        ? member.assigned_teams.join(', ')
        : 'All teams';
      const isSelected = this.selectedMemberId === member.id;
      
      return `
        <div class="member-item ${isSelected ? 'active' : ''} ${!member.is_active ? 'inactive' : ''}" 
             data-member-id="${member.id}" 
             onclick="app.selectMember(${member.id})">
          <div class="member-avatar">${initial}</div>
          <div class="member-info">
            <div class="member-name">${member.name}</div>
            <div class="member-meta">${teamsText}</div>
          </div>
          <div class="member-status-dot ${member.is_active ? 'active' : 'inactive'}"></div>
        </div>
      `;
    }).join('');
  }
  
  async selectMember(memberId) {
    this.selectedMemberId = memberId;
    const member = this.subAccounts.find(m => m.id === memberId);
    if (!member) return;
    
    // Update list selection
    $$('.member-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.memberId) === memberId);
    });
    
    // Show detail view
    const emptyView = $('#memberDetailEmpty');
    const detailView = $('#memberDetailView');
    if (emptyView) emptyView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
    
    // Populate detail
    const nameEl = $('#memberDetailName');
    const createdEl = $('#memberDetailCreated');
    const statusEl = $('#memberDetailStatus');
    const teamsEl = $('#memberDetailTeams');
    const lastLoginEl = $('#memberDetailLastLogin');
    const toggleBtn = $('#memberToggleBtn');
    
    if (nameEl) nameEl.textContent = member.name;
    if (createdEl) {
      const created = new Date(member.created_at);
      createdEl.textContent = `Added ${created.toLocaleDateString()}`;
    }
    if (statusEl) {
      statusEl.textContent = member.is_active ? 'Active' : 'Inactive';
      statusEl.className = `badge ${member.is_active ? 'badge-success' : 'badge-secondary'}`;
    }
    if (teamsEl) {
      teamsEl.textContent = member.assigned_teams && member.assigned_teams.length > 0
        ? member.assigned_teams.join(', ')
        : 'All teams';
    }
    if (lastLoginEl) {
      if (member.last_login && member.last_login !== member.created_at) {
        const lastLogin = new Date(member.last_login);
        lastLoginEl.textContent = lastLogin.toLocaleDateString() + ' ' + lastLogin.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    } else {
        lastLoginEl.textContent = 'Never';
      }
    }
    if (toggleBtn) {
      toggleBtn.innerHTML = member.is_active
        ? '<span data-icon="pause" data-icon-size="14"></span> Deactivate'
        : '<span data-icon="check" data-icon-size="14"></span> Activate';
      initIcons();
    }
    
    // Load existing credentials
    await this.loadMemberCredentials(memberId);
    
    initIcons();
  }
  
  async handleAddMember(e) {
    e.preventDefault();
    
    const nameInput = $('#newMemberName');
    const btn = $('#addMemberBtn');
    
    const name = nameInput?.value?.trim();
    if (!name) {
      toast.error('Please enter a name');
      return;
    }
    
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span data-icon="refresh" data-icon-size="16" class="spin"></span> Adding...';
    }
    
    try {
      const result = await api.createSubAccount(name, []);
      toast.success(`Added ${name} as team member`);
      
      // Clear form
      if (nameInput) nameInput.value = '';
      
      // Reload list
      await this.loadSubAccounts();
      
      // Auto-select the new member so user can immediately assign teams
      if (result && result.sub_account && result.sub_account.id) {
        this.selectMember(result.sub_account.id);
    }
    } catch (error) {
      console.error('Failed to add member:', error);
      toast.error('Failed to add member: ' + (error.message || 'Unknown error'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span data-icon="plus" data-icon-size="16"></span> Add Member';
        initIcons();
      }
    }
  }
  
  async toggleSelectedMember() {
    if (!this.selectedMemberId) return;
    const member = this.subAccounts.find(m => m.id === this.selectedMemberId);
    if (!member) return;
    
    const newState = !member.is_active;
    const btn = $('#memberToggleBtn');
    if (btn) btn.disabled = true;
    
    try {
      await api.updateSubAccount(this.selectedMemberId, { is_active: newState });
      toast.success(`${member.name} ${newState ? 'activated' : 'deactivated'}`);
      await this.loadSubAccounts();
      this.selectMember(this.selectedMemberId);
    } catch (error) {
      console.error('Failed to toggle member:', error);
      toast.error('Failed to update member');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  
  async deleteSelectedMember() {
    if (!this.selectedMemberId) return;
    const member = this.subAccounts.find(m => m.id === this.selectedMemberId);
    if (!member) return;
    
    if (!confirm(`Remove ${member.name}? This cannot be undone.`)) return;
    
    const btn = $('#memberDeleteBtn');
    if (btn) btn.disabled = true;
    
    try {
      await api.deleteSubAccount(this.selectedMemberId);
      toast.success(`${member.name} removed`);
      this.selectedMemberId = null;
      
      // Hide detail
      const emptyView = $('#memberDetailEmpty');
      const detailView = $('#memberDetailView');
      if (emptyView) emptyView.style.display = 'block';
      if (detailView) detailView.style.display = 'none';
      
      await this.loadSubAccounts();
    } catch (error) {
      console.error('Failed to delete member:', error);
      toast.error('Failed to remove member');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  
  async loadMemberCredentials(memberId) {
    const qrContainer = $('#memberQrCode');
    const otpCode = $('#memberOtpCode');
    const otpExpires = $('#memberOtpExpires');
    
    try {
      const data = await api.getSubAccountCredentials(memberId);
      
      if (data.token) {
        // Build login URL for QR code
        const loginUrl = `${window.location.origin}/code.html?token=${data.token}`;
        if (qrContainer) {
          this.generateQRCode(qrContainer, loginUrl, 180);
        }
      } else {
        if (qrContainer) {
          qrContainer.innerHTML = `
            <div class="empty-state" style="padding: var(--space-lg);">
              <div class="empty-state-text" style="font-size: var(--text-xs);">Click "Generate" to create credentials</div>
            </div>
          `;
        }
      }
      
      if (data.otp_code) {
        if (otpCode) this.renderOtpCode(otpCode, data.otp_code);
        if (otpExpires && data.expires_at) {
          const expires = new Date(data.expires_at);
          const now = new Date();
          const hoursLeft = Math.max(0, Math.round((expires - now) / 1000 / 60 / 60));
          otpExpires.textContent = hoursLeft > 0 ? `Expires in ~${hoursLeft}h` : 'Expired';
        }
      } else {
        if (otpCode) this.renderOtpCode(otpCode, '------');
        if (otpExpires) otpExpires.textContent = '';
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
      // Show empty state
      if (qrContainer) {
        qrContainer.innerHTML = `
          <div class="empty-state" style="padding: var(--space-lg);">
            <div class="empty-state-text" style="font-size: var(--text-xs);">Click "Generate" to create credentials</div>
          </div>
        `;
      }
      if (otpCode) otpCode.textContent = '------';
    }
  }
  
  async generateMemberCredentials() {
    if (!this.selectedMemberId) return;
    
    const btn = $('#memberGenCredsBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span data-icon="refresh" data-icon-size="16" class="spin"></span> Generating...';
    }
    
    try {
      const data = await api.regenerateSubAccountCredentials(this.selectedMemberId);
      
      // Update QR code
      const qrContainer = $('#memberQrCode');
      if (data.token && qrContainer) {
        const loginUrl = `${window.location.origin}/code.html?token=${data.token}`;
        this.generateQRCode(qrContainer, loginUrl, 180);
      }
      
      // Update OTP
      const otpCode = $('#memberOtpCode');
      const otpExpires = $('#memberOtpExpires');
      if (data.otp_code && otpCode) {
        this.renderOtpCode(otpCode, data.otp_code);
      }
      if (data.expires_at && otpExpires) {
        const expires = new Date(data.expires_at);
        const now = new Date();
        const hoursLeft = Math.max(0, Math.round((expires - now) / 1000 / 60 / 60));
        otpExpires.textContent = `Expires in ~${hoursLeft}h`;
      }
      
      toast.success('Credentials generated!');
    } catch (error) {
      console.error('Failed to generate credentials:', error);
      toast.error('Failed to generate credentials');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span data-icon="refresh" data-icon-size="16"></span> Generate New Credentials';
        initIcons();
      }
    }
  }
  
  renderOtpCode(container, code) {
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    // If code is placeholder, show it as-is
    if (code === '------') {
      container.textContent = code;
      return;
    }
    
    // Split code into individual digits with dash separator after 3rd digit
    const digits = code.toString().split('');
    digits.forEach((digit, index) => {
      const digitBox = document.createElement('span');
      digitBox.className = 'member-otp-digit';
      digitBox.textContent = digit;
      container.appendChild(digitBox);
      
      // Add dash separator after 3rd digit
      if (index === 2 && digits.length > 3) {
        const separator = document.createElement('span');
        separator.className = 'member-otp-separator';
        separator.textContent = '—';
        container.appendChild(separator);
      }
    });
  }
  
  copyMemberOtp() {
    const otpCode = $('#memberOtpCode');
    if (otpCode) {
      // Get the actual code from the digit spans
      const digits = Array.from(otpCode.querySelectorAll('.member-otp-digit'))
        .map(span => span.textContent)
        .join('');
      
      if (digits && digits !== '------') {
        navigator.clipboard.writeText(digits);
        toast.success('OTP code copied!');
        return;
      }
    }
    toast.error('No OTP code to copy. Generate credentials first.');
  }
  
  // ==========================================
  // Team Assignment Modal Methods
  // ==========================================
  
  openAssignTeamsModal() {
    if (!this.selectedMemberId) return;
    const member = this.subAccounts.find(m => m.id === this.selectedMemberId);
    if (!member) return;
    
    const modal = $('#assignTeamsModal');
    const nameEl = $('#assignModalMemberName');
    if (!modal) return;
    
    if (nameEl) nameEl.textContent = member.name;
    
    // Build a lookup of which teams are assigned to which members
    this.teamAssignmentMap = {};
    this.subAccounts.forEach(sa => {
      if (sa.assigned_teams && sa.assigned_teams.length > 0) {
        sa.assigned_teams.forEach(t => {
          const teamStr = t.toString();
          if (!this.teamAssignmentMap[teamStr]) {
            this.teamAssignmentMap[teamStr] = [];
          }
          this.teamAssignmentMap[teamStr].push({
            id: sa.id,
            name: sa.name,
          });
        });
      }
    });
    
    // Current member's assigned teams as a Set for quick lookup
    this.pendingAssignedTeams = new Set(
      (member.assigned_teams || []).map(t => t.toString())
    );
    
    this.renderAssignTeamsList();
    
    modal.style.display = 'flex';
    initIcons();
    
    // Focus search
    const search = $('#assignTeamSearch');
    if (search) {
      search.value = '';
      setTimeout(() => search.focus(), 100);
    }
  }
  
  closeAssignTeamsModal() {
    const modal = $('#assignTeamsModal');
    if (modal) modal.style.display = 'none';
  }
  
  renderAssignTeamsList(filter = '') {
    const container = $('#assignTeamsList');
    const countBadge = $('#assignTeamCount');
    if (!container) return;
    
    let teams = this.teams.map(t => t.toString());
    
    if (filter) {
      teams = teams.filter(t => t.includes(filter));
    }
    
    if (countBadge) countBadge.textContent = `${teams.length} teams`;
    
    if (teams.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-text">${this.teams.length === 0 ? 'No event teams loaded. Load an event first.' : 'No teams match your search.'}</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = teams.map(team => {
      const isChecked = this.pendingAssignedTeams.has(team);
      const owners = this.teamAssignmentMap[team] || [];
      const otherOwners = owners.filter(o => o.id !== this.selectedMemberId);
      
      // Find rank for this team
      const rankData = this.rankings.find(r => r.teamNumber.toString() === team);
      const rankText = rankData ? `#${rankData.rank}` : '';
      
      let ownerText = '';
      let ownerClass = '';
      if (otherOwners.length > 0) {
        ownerText = `Assigned to: ${otherOwners.map(o => o.name).join(', ')}`;
        ownerClass = 'conflict';
      }
      
      return `
        <label class="assign-team-row ${isChecked ? 'checked' : ''}" data-team="${team}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="app.toggleAssignTeam('${team}', this.checked, this)">
          <span class="assign-team-number">${team}</span>
          <span class="assign-team-owner ${ownerClass}">${ownerText}</span>
          <span class="assign-team-rank">${rankText}</span>
        </label>
      `;
    }).join('');
  }
  
  filterAssignTeams(query) {
    this.renderAssignTeamsList(query.trim());
  }
  
  toggleAssignTeam(team, checked, checkbox) {
    if (checked) {
      this.pendingAssignedTeams.add(team);
    } else {
      this.pendingAssignedTeams.delete(team);
    }
    
    // Update row styling
    const row = checkbox.closest('.assign-team-row');
    if (row) {
      row.classList.toggle('checked', checked);
    }
  }
  
  async saveAssignedTeams() {
    if (!this.selectedMemberId) return;
    
    const btn = $('#assignTeamsSaveBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span data-icon="refresh" data-icon-size="16" class="spin"></span> Saving...';
    }
    
    try {
      const assignedTeams = Array.from(this.pendingAssignedTeams);
      await api.updateSubAccount(this.selectedMemberId, { assigned_teams: assignedTeams });
      
      toast.success('Team assignments saved!');
      this.closeAssignTeamsModal();
      
      // Reload members and re-select
      await this.loadSubAccounts();
      this.selectMember(this.selectedMemberId);
    } catch (error) {
      console.error('Failed to save team assignments:', error);
      toast.error('Failed to save assignments: ' + (error.message || 'Unknown error'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span data-icon="check" data-icon-size="16"></span> Save Assignments';
        initIcons();
      }
    }
  }
  
  // ==========================================
  // Profile / Trading Card Methods
  // ==========================================
  
  async loadProfile() {
    try {
      const data = await api.getProfile();
      
      if (data.profile) {
        this.populateProfileForm(data.profile);
        this.updateProfileImages(data.profile);
        this.updateShareSection(data.profile);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      // Don't show error toast - profile might just not exist yet
    }
    
    initIcons();
  }
  
  populateProfileForm(profile) {
    // Stats
    const autoPointsLow = $('#autoPointsLow');
    const autoPointsHigh = $('#autoPointsHigh');
    const teleopPointsLow = $('#teleopPointsLow');
    const teleopPointsHigh = $('#teleopPointsHigh');
    const endgamePoints = $('#endgamePoints');
    
    if (autoPointsLow) autoPointsLow.value = profile.auto_points_low || '';
    if (autoPointsHigh) autoPointsHigh.value = profile.auto_points_high || '';
    if (teleopPointsLow) teleopPointsLow.value = profile.teleop_points_low || '';
    if (teleopPointsHigh) teleopPointsHigh.value = profile.teleop_points_high || '';
    if (endgamePoints) endgamePoints.value = profile.endgame_points || '';
    
    // Capabilities
    const canClimb = $('#canClimb');
    const canShootNear = $('#canShootNear');
    const canShootFar = $('#canShootFar');
    const canIntakeGround = $('#canIntakeGround');
    const canIntakeSource = $('#canIntakeSource');
    const climbLevel = $('#climbLevel');
    const drivetrainType = $('#drivetrainType');
    
    if (canClimb) canClimb.checked = !!profile.can_climb;
    if (canShootNear) canShootNear.checked = !!profile.can_shoot_near;
    if (canShootFar) canShootFar.checked = !!profile.can_shoot_far;
    if (canIntakeGround) canIntakeGround.checked = !!profile.can_intake_ground;
    if (canIntakeSource) canIntakeSource.checked = !!profile.can_intake_source;
    if (climbLevel) climbLevel.value = profile.climb_level || '';
    if (drivetrainType) drivetrainType.value = profile.drivetrain_type || '';
    
    // Descriptions
    const robotDescription = $('#robotDescription');
    const autoDescription = $('#autoDescription');
    const strategyNotes = $('#strategyNotes');
    const customNotes = $('#customNotes');
    const isPublic = $('#isPublic');
    
    if (robotDescription) robotDescription.value = profile.robot_description || '';
    if (autoDescription) autoDescription.value = profile.auto_description || '';
    if (strategyNotes) strategyNotes.value = profile.strategy_notes || '';
    if (customNotes) customNotes.value = profile.custom_notes || '';
    if (isPublic) isPublic.checked = profile.is_public !== 0;
    
    // Update live preview
    this.updateCardPreview();
  }
  
  initCardPreviewListeners() {
    // Clear any previous polling interval
    if (this._cardPreviewInterval) {
      clearInterval(this._cardPreviewInterval);
    }
    
    const form = $('#profileForm');
    if (!form) return;
    
    // Listen to ALL inputs, checkboxes, selects, textareas
    const handler = () => this.updateCardPreview();
    form.addEventListener('input', handler);
    form.addEventListener('change', handler);
    
    // Also listen on click for checkbox cards
    form.addEventListener('click', () => {
      setTimeout(() => this.updateCardPreview(), 50);
    });
    
    // Also listen to individual elements directly for checkboxes/selects
    form.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
    
    // Polling fallback - update every 500ms to catch anything listeners miss
    this._cardPreviewInterval = setInterval(() => {
      if ($('#page-profile')?.classList.contains('active')) {
        this.updateCardPreview();
      }
    }, 500);
  }
  
  updateCardPreview() {
    const preview = $('#cardPreview');
    if (!preview) return;
    
    // Team & event
    const teamNum = this.teamNumber || '—';
    const eventName = this.eventName || 'Event';
    
    // Rank from rankings data
    let rankText = '★ Rank —';
    if (this.rankings && this.rankings.length > 0) {
      const myTeamStr = String(this.teamNumber || '');
      const myRank = this.rankings.findIndex(r => String(r.teamNumber) === myTeamStr);
      if (myRank >= 0) rankText = `★ Rank #${myRank + 1}`;
    }
    
    // Get OPR from oprData, SoS from sosData, W/L from rankings
    let oprVal = '—', sosVal = '—', wl = '—';
    const myTeamStr = String(this.teamNumber || '');
    
    if (this.oprData && this.oprData.length > 0) {
      const myOPR = this.oprData.find(r => String(r.teamNumber) === myTeamStr);
      if (myOPR) oprVal = myOPR.opr.toFixed(1);
    }
    
    if (this.sosData && this.sosData.length > 0) {
      const mySoS = this.sosData.find(r => String(r.teamNumber) === myTeamStr);
      if (mySoS) sosVal = mySoS.sos.toFixed(2);
    }
    
    if (this.rankings && this.rankings.length > 0) {
      const myTeamRank = this.rankings.find(r => String(r.teamNumber) === myTeamStr);
      if (myTeamRank) {
        wl = `${myTeamRank.wins || 0}W-${myTeamRank.losses || 0}L-${myTeamRank.ties || 0}T`;
      }
    }
    
    // Stats from form
    const autoLow = $('#autoPointsLow')?.value || '—';
    const autoHigh = $('#autoPointsHigh')?.value || '—';
    const teleopLow = $('#teleopPointsLow')?.value || '—';
    const teleopHigh = $('#teleopPointsHigh')?.value || '—';
    const endgame = $('#endgamePoints')?.value || '—';
    
    // Capabilities
    const caps = [];
    if ($('#canClimb')?.checked) caps.push('Climb');
    if ($('#canShootNear')?.checked) caps.push('Near Shot');
    if ($('#canShootFar')?.checked) caps.push('Far Shot');
    if ($('#canIntakeGround')?.checked) caps.push('Ground Intake');
    if ($('#canIntakeSource')?.checked) caps.push('Source Intake');
    
    const climbLevel = $('#climbLevel')?.value;
    if (climbLevel) caps.push(climbLevel.charAt(0).toUpperCase() + climbLevel.slice(1) + ' Climb');
    
    const drivetrain = $('#drivetrainType')?.value;
    if (drivetrain) caps.push(drivetrain.charAt(0).toUpperCase() + drivetrain.slice(1));
    
    // Descriptions
    const robotDesc = $('#robotDescription')?.value || '';
    const autoDesc = $('#autoDescription')?.value || '';
    const strategyNotes = $('#strategyNotes')?.value || '';
    
    // Image
    let imageHTML = `
      <div class="profile-card-image-placeholder">
        <span data-icon="camera" data-icon-size="32"></span>
        <span>Robot Image</span>
      </div>
    `;
    const profilePreview = $('#profileImagePreview');
    if (profilePreview) {
      const img = profilePreview.querySelector('img');
      if (img) {
        imageHTML = `<img src="${img.src}" alt="Robot">`;
      }
    }
    
    // Build full card HTML
    preview.innerHTML = `
      <div class="profile-card-header">
        <div class="profile-card-rank">${rankText}</div>
        <div class="profile-card-team">${teamNum}</div>
        <div class="profile-card-event">${eventName}</div>
      </div>
      <div class="profile-card-image">${imageHTML}</div>
      <div class="profile-card-record">
        <span class="profile-card-record-item">${wl}</span>
        <span class="profile-card-record-item">OPR ${oprVal}</span>
        <span class="profile-card-record-item">SoS ${sosVal}</span>
      </div>
      <div class="profile-card-stats">
        <div class="profile-card-stat">
          <div class="profile-card-stat-label">Auto (Low)</div>
          <div class="profile-card-stat-value">${autoLow}</div>
        </div>
        <div class="profile-card-stat">
          <div class="profile-card-stat-label">Auto (High)</div>
          <div class="profile-card-stat-value">${autoHigh}</div>
        </div>
        <div class="profile-card-stat">
          <div class="profile-card-stat-label">Teleop (Low)</div>
          <div class="profile-card-stat-value">${teleopLow}</div>
        </div>
        <div class="profile-card-stat">
          <div class="profile-card-stat-label">Teleop (High)</div>
          <div class="profile-card-stat-value">${teleopHigh}</div>
        </div>
        <div class="profile-card-stat">
          <div class="profile-card-stat-label">Endgame</div>
          <div class="profile-card-stat-value">${endgame}</div>
        </div>
        <div class="profile-card-stat">
          <div class="profile-card-stat-label">Drivetrain</div>
          <div class="profile-card-stat-value" style="font-size: var(--text-sm);">${drivetrain ? drivetrain.charAt(0).toUpperCase() + drivetrain.slice(1) : '—'}</div>
        </div>
      </div>
      ${caps.length > 0 ? `
        <div class="profile-card-capabilities">
          ${caps.map(c => `<span class="profile-card-capability">${c}</span>`).join('')}
        </div>
      ` : ''}
      ${robotDesc ? `
        <div class="profile-card-description">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.6); margin-bottom: 4px;">Robot</div>
          ${robotDesc}
        </div>
      ` : ''}
      ${autoDesc ? `
        <div class="profile-card-description" style="margin-top: 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.6); margin-bottom: 4px;">Autonomous</div>
          ${autoDesc}
        </div>
      ` : ''}
      ${strategyNotes ? `
        <div class="profile-card-description" style="margin-top: 8px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.6); margin-bottom: 4px;">Strategy</div>
          ${strategyNotes}
        </div>
      ` : ''}
      ${!robotDesc && !autoDesc && !strategyNotes ? `
        <div class="profile-card-description" style="opacity: 0.5;">No description yet...</div>
      ` : ''}
    `;
    
    initIcons();
  }
  
  updateProfileImages(profile) {
    const preview = $('#profileImagePreview');
    const status = $('#profileImageStatus');
    
    if (!preview) return;
    
    if (profile.final_image_url) {
      preview.innerHTML = `<img src="${profile.final_image_url}" alt="Robot" class="profile-robot-image">`;
      if (status) {
        status.textContent = 'AI Processed';
        status.className = 'badge badge-success';
      }
    } else if (profile.original_image_url) {
      preview.innerHTML = `<img src="${profile.original_image_url}" alt="Robot" class="profile-robot-image">`;
      if (status) {
        status.textContent = 'Processing...';
        status.className = 'badge badge-warning';
      }
      // Poll for processing completion
      this.pollPhotoStatus();
    } else {
      preview.innerHTML = `
        <div class="profile-image-placeholder">
          <span data-icon="robot" data-icon-size="64"></span>
          <p>No robot image uploaded</p>
        </div>
      `;
      if (status) {
        status.textContent = 'No Image';
        status.className = 'badge badge-secondary';
      }
    }
  }
  
  updateShareSection(profile) {
    const urlInput = $('#profileShareUrl');
    const qrContainer = $('#profileShareQr');
    
    if (profile.profile_url) {
      if (urlInput) urlInput.value = profile.profile_url;
      if (qrContainer) {
        // Generate QR code for profile URL
        this.generateQRCode(qrContainer, profile.profile_url, 150);
      }
    }
  }
  
  async handleProfileSave(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span data-icon="refresh" data-icon-size="18" class="spin"></span> Saving...';
    }
    
    try {
      const profileData = {
        auto_points_low: parseInt($('#autoPointsLow')?.value) || 0,
        auto_points_high: parseInt($('#autoPointsHigh')?.value) || 0,
        teleop_points_low: parseInt($('#teleopPointsLow')?.value) || 0,
        teleop_points_high: parseInt($('#teleopPointsHigh')?.value) || 0,
        endgame_points: parseInt($('#endgamePoints')?.value) || 0,
        can_climb: $('#canClimb')?.checked || false,
        climb_level: $('#climbLevel')?.value || null,
        can_shoot_near: $('#canShootNear')?.checked || false,
        can_shoot_far: $('#canShootFar')?.checked || false,
        can_intake_ground: $('#canIntakeGround')?.checked || false,
        can_intake_source: $('#canIntakeSource')?.checked || false,
        drivetrain_type: $('#drivetrainType')?.value || null,
        auto_description: $('#autoDescription')?.value || null,
        robot_description: $('#robotDescription')?.value || null,
        strategy_notes: $('#strategyNotes')?.value || null,
        custom_notes: $('#customNotes')?.value || null,
        is_public: $('#isPublic')?.checked !== false,
      };
      
      const result = await api.saveProfile(profileData);
      
      toast.success('Profile saved successfully!');
      
      // Update share section with new URL
      if (result.profile_url) {
        const urlInput = $('#profileShareUrl');
        const qrContainer = $('#profileShareQr');
        
        if (urlInput) urlInput.value = result.profile_url;
        if (qrContainer) {
          this.generateQRCode(qrContainer, result.profile_url, 150);
        }
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to save profile: ' + (error.message || 'Unknown error'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span data-icon="check" data-icon-size="18"></span> Save Profile';
        initIcons();
      }
    }
  }
  
  async startPhotoUpload() {
    const qrSection = $('#profileQrSection');
    const uploadBtn = $('#profileUploadBtn');
    const qrContainer = $('#profileQrCode');
    const qrStatus = $('#profileQrStatus');
    
    if (!qrSection || !qrContainer) return;
    
    if (uploadBtn) uploadBtn.style.display = 'none';
    qrSection.style.display = 'block';
    
    try {
      const result = await api.createPhotoSession();
      
      // Generate QR code
      this.generateQRCode(qrContainer, result.upload_url, 200);
      
      if (qrStatus) {
        qrStatus.innerHTML = `
          <span class="status-dot pending"></span>
          <span>Waiting for upload...</span>
        `;
      }
      
      // Start polling for status
      this.photoUploadPollInterval = setInterval(() => this.pollPhotoStatus(), 3000);
      
    } catch (error) {
      console.error('Failed to create photo session:', error);
      toast.error('Failed to start upload session');
      this.cancelPhotoUpload();
    }
  }
  
  cancelPhotoUpload() {
    const qrSection = $('#profileQrSection');
    const uploadBtn = $('#profileUploadBtn');
    
    if (qrSection) qrSection.style.display = 'none';
    if (uploadBtn) uploadBtn.style.display = 'block';
    
    if (this.photoUploadPollInterval) {
      clearInterval(this.photoUploadPollInterval);
      this.photoUploadPollInterval = null;
    }
  }
  
  async pollPhotoStatus() {
    try {
      const result = await api.getPhotoSessionStatus();
      const qrStatus = $('#profileQrStatus');
      
      switch (result.status) {
        case 'uploading':
          if (qrStatus) {
            qrStatus.innerHTML = `
              <span class="status-dot uploading"></span>
              <span>Uploading photo...</span>
            `;
          }
          break;
          
        case 'processing':
          if (qrStatus) {
            qrStatus.innerHTML = `
              <span class="status-dot processing"></span>
              <span>AI is processing your image...</span>
            `;
          }
          break;
          
        case 'complete':
          if (qrStatus) {
            qrStatus.innerHTML = `
              <span class="status-dot complete"></span>
              <span>Image ready!</span>
            `;
          }
          toast.success('Robot image processed successfully!');
          this.cancelPhotoUpload();
          // Reload profile to show new images
          this.loadProfile();
          break;
          
        case 'failed':
          if (qrStatus) {
            qrStatus.innerHTML = `
              <span class="status-dot failed"></span>
              <span>Processing failed. Try again.</span>
            `;
          }
          toast.error('Image processing failed');
          setTimeout(() => this.cancelPhotoUpload(), 3000);
          break;
      }
    } catch (error) {
      console.error('Failed to poll photo status:', error);
    }
  }
  
  copyProfileUrl() {
    const urlInput = $('#profileShareUrl');
    if (urlInput && urlInput.value) {
      navigator.clipboard.writeText(urlInput.value);
      toast.success('Profile URL copied!');
    } else {
      toast.error('No profile URL to copy. Save your profile first.');
    }
  }
  
  generateQRCode(container, data, size = 200) {
    // Simple QR code using a public API
    // In production, you might want to use a library like qrcode.js
    container.innerHTML = `
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}" 
           alt="QR Code" 
           style="width: ${size}px; height: ${size}px; border-radius: var(--radius-lg);">
    `;
  }
  
  // ==========================================
  // Demo Data Generation
  // ==========================================
  
  generateDemoMatchNotes() {
    if (!this.matches || this.matches.length === 0) return;
    
    const completedMatches = this.matches.filter(m => m.completed);
    if (completedMatches.length === 0) return;
    
    const samplePublicNotes = [
      'Strong autonomous routine, consistently scores high in auto.',
      'Excellent driver control during teleop. Very precise placement.',
      'Struggled with intake this match. Possible mechanical issue.',
      'Great defense play, blocked opponents effectively.',
      'Consistent scoring in high baskets. One of the top scorers.',
      'Had connection issues early but recovered well mid-match.',
      'Fast cycle times, averaging about 15 seconds per cycle.',
      'Good at picking up from shared area. Rarely drops game pieces.',
      'Endgame was solid - parked and hung on the bar consistently.',
      'Alliance coordination was excellent - they communicated well.',
      'Slow start but ramped up in the second half of teleop.',
      'Missed several scoring attempts in the high goal.',
      'Very aggressive pushing - might get penalties if not careful.',
      'Reliable robot, no disconnects or failures observed.',
      'Their specimen scoring is top-tier, very fast and accurate.',
      'Quick recovery after a tipping incident. Good balance control.',
      'Effective at clearing game pieces from the field.',
      'Strategic positioning during autonomous. Smart pathing.',
      'Had some mobility issues on the right side of the field.',
      'Excellent communication with alliance partners via LED signals.',
    ];
    
    const samplePrivateNotes = [
      'Watch out for this team - they are a strong pick for eliminations.',
      'Potential alliance partner. Their auto complements ours well.',
      'Not a good fit for our alliance - overlapping strengths.',
      'Their driver seemed nervous. Might perform differently in elims.',
      'Possible first pick - consistent performance across all matches.',
      'Weakness: they can\'t score low baskets efficiently.',
      'Strong individually but poor at alliance coordination.',
      'Consider for second pick if top choices are taken.',
      'Their endgame strategy conflicts with ours - avoid pairing.',
      'Keep an eye on - might break down under pressure in elims.',
      'Backup option if our primary choices are unavailable.',
      'Good synergy with our robot capabilities. Priority alliance partner.',
    ];
    
    // Seeded random for consistent demo data
    let seed = 12345;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    
    const demoNotes = [];
    const scoutingTeam = this.teamNumber || '7890';
    
    // Pick some "other" scouting teams for realistic multi-team notes
    const otherScoutingTeams = (this.teams || []).filter(t => t.toString() !== scoutingTeam).slice(0, 5).map(t => t.toString());
    
    // Generate notes for ~80% of completed matches, with more notes per match
    for (const match of completedMatches) {
      if (rng() > 0.8) continue; // Skip fewer matches
      
      const allTeams = [...match.red.teams, ...match.blue.teams];
      
      // Add notes for 2-4 teams per match (increased from 1-3)
      const numTeamsToNote = Math.floor(rng() * 3) + 2;
      const shuffled = [...allTeams].sort(() => rng() - 0.5);
      
      for (let i = 0; i < Math.min(numTeamsToNote, shuffled.length); i++) {
        const teamNum = shuffled[i];
        
        // Your public note (~80% chance, increased from 70%)
        if (rng() < 0.8) {
          demoNotes.push({
            match_number: match.description,
            team_number: teamNum.toString(),
            notes: samplePublicNotes[Math.floor(rng() * samplePublicNotes.length)],
            is_private: false,
            scouting_team: scoutingTeam,
            created_at: new Date().toISOString(),
          });
        }
        
        // Your private note (~60% chance, increased from 40%)
        if (rng() < 0.6) {
          demoNotes.push({
            match_number: match.description,
            team_number: teamNum.toString(),
            notes: samplePrivateNotes[Math.floor(rng() * samplePrivateNotes.length)],
            is_private: true,
            scouting_team: scoutingTeam,
            created_at: new Date().toISOString(),
          });
        }
        
        // Other teams' public notes - now add 1-3 notes from different teams (increased from 0-1)
        const numOtherNotes = Math.floor(rng() * 3) + 1;
        for (let j = 0; j < numOtherNotes && otherScoutingTeams.length > 0; j++) {
          if (rng() < 0.7) {
            const otherTeam = otherScoutingTeams[Math.floor(rng() * otherScoutingTeams.length)];
            demoNotes.push({
              match_number: match.description,
              team_number: teamNum.toString(),
              notes: samplePublicNotes[Math.floor(rng() * samplePublicNotes.length)],
              is_private: false,
              scouting_team: otherTeam,
              created_at: new Date().toISOString(),
            });
          }
        }
      }
    }
    
    this.demoMatchNotes = demoNotes;
    
    // Also cache which matches have notes for the match scouting page
    this.matchScoutNotesCache = {};
    demoNotes.forEach(n => {
      this.matchScoutNotesCache[n.match_number] = true;
    });
  }
  
  getDemoNotesForTeam(teamNumber) {
    if (!this.demoMatchNotes) return { private_notes: [], public_notes: [] };
    const teamNotes = this.demoMatchNotes.filter(n => n.team_number === teamNumber.toString());
    return {
      private_notes: teamNotes.filter(n => n.is_private),
      public_notes: teamNotes.filter(n => !n.is_private),
    };
  }
  
  getDemoNotesForMatch(matchDescription) {
    if (!this.demoMatchNotes) return { private_notes: [], public_notes: [] };
    const matchNotes = this.demoMatchNotes.filter(n => n.match_number === matchDescription);
    return {
      private_notes: matchNotes.filter(n => n.is_private),
      public_notes: matchNotes.filter(n => !n.is_private),
    };
  }
  
  getDemoNotesForMatchAndTeam(matchDescription, teamNumber) {
    if (!this.demoMatchNotes) return { private_notes: [], public_notes: [] };
    const notes = this.demoMatchNotes.filter(n => 
      n.match_number === matchDescription && n.team_number === teamNumber.toString()
    );
    return {
      private_notes: notes.filter(n => n.is_private),
      public_notes: notes.filter(n => !n.is_private),
    };
  }
  
  generateDemoScoutingData(teamNumber) {
    // Generate realistic demo scouting data for a team
    let seed = parseInt(teamNumber) || 42;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    
    const fields = ['Mecanum Drive Train', 'Driver Practice', 'Tele-OP Balls', 'Shooting Distance',
                    'Auto Balls', 'Auto Shooting', 'Auto Points', 'Leave', 'What autos do they have (Near, far, how many balls)', 'Public Notes', 'Private Notes'];
    
    const shootingOptions = ['Near', 'Far', 'Both'];
    const autoDescriptions = [
      'Near side, 2 balls, very consistent',
      'Far side only, 1 ball, sometimes misses',
      'Both sides, 3 balls, strong autonomous',
      'Near side, 1 ball, basic auto',
      'Far side, 2 balls, still tuning',
      'No auto routine observed',
    ];
    const publicNoteSamples = [
      'Strong autonomous, consistent scoring',
      'Needs work on endgame but solid overall',
      'Very fast cycle times, good driver',
      'Reliable partner, communicates well',
      'Intake is slow but scoring is accurate',
      'Great defense capability when needed',
    ];
    const privateNoteSamples = [
      'Good potential alliance partner',
      'Not a strong pick - inconsistent',
      'Watch for improvements in later matches',
      'Top tier team, likely first pick',
      'Decent robot but poor driver skills',
      'Strong in endgame, average everywhere else',
    ];
    
    const scoutingTeam = this.teamNumber || '7890';
    
    // Your team's scouting data
    const privateData = [
      rng() > 0.5, // Mecanum
      Math.floor(rng() * 4).toString(), // Driver Practice 0-3
      Math.floor(rng() * 8 + 1).toString(), // Tele-OP Balls
      shootingOptions[Math.floor(rng() * 3)],
      Math.floor(rng() * 5).toString(), // Auto Balls
      shootingOptions[Math.floor(rng() * 3)],
      Math.floor(rng() * 30 + 5).toString(), // Auto Points
      rng() > 0.3, // Leave
      autoDescriptions[Math.floor(rng() * autoDescriptions.length)],
      publicNoteSamples[Math.floor(rng() * publicNoteSamples.length)], // Public Notes
      privateNoteSamples[Math.floor(rng() * privateNoteSamples.length)], // Private Notes
    ];
    
    // Another team's public data (private notes redacted)
    const publicData = [
      rng() > 0.5,
      Math.floor(rng() * 4).toString(),
      Math.floor(rng() * 8 + 1).toString(),
      shootingOptions[Math.floor(rng() * 3)],
      Math.floor(rng() * 5).toString(),
      shootingOptions[Math.floor(rng() * 3)],
      Math.floor(rng() * 30 + 5).toString(),
      rng() > 0.3,
      autoDescriptions[Math.floor(rng() * autoDescriptions.length)],
      publicNoteSamples[Math.floor(rng() * publicNoteSamples.length)], // Public Notes (visible)
      'Redacted Field', // Private Notes (hidden)
    ];
    
    // Pick a random other team for public data
    const otherTeams = this.teams.filter(t => t.toString() !== scoutingTeam);
    const otherTeam = otherTeams.length > 0 ? otherTeams[Math.floor(rng() * otherTeams.length)] : '0000';
    
    return {
      fields,
      private_data: {
        data: privateData,
        scouting_team: scoutingTeam,
      },
      public_data: rng() > 0.3 ? [{
        data: publicData,
        scouting_team: otherTeam.toString(),
      }] : [],
    };
  }

  // ==========================================
  // Match History in Scout Team Page
  // ==========================================
  
  async loadScoutTeamMatchNotes(teamNumber) {
    const section = $('#scoutMatchHistorySection');
    const container = $('#scoutMatchHistoryList');
    const countBadge = $('#scoutMatchHistoryCount');
    if (!section || !container) return;
    
    if (!teamNumber) {
      if (countBadge) countBadge.textContent = '0';
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="users" data-icon-size="32"></div>
          <div class="empty-state-text">Select a team to see their match history</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    const teamNum = parseInt(teamNumber);
    
    // Find all matches this team played in
    const teamMatches = this.matches.filter(m => 
      m.red.teams.includes(teamNum) || m.blue.teams.includes(teamNum)
    ).sort((a, b) => {
      const aNum = parseInt(a.description.match(/\d+/)?.[0] || 0);
      const bNum = parseInt(b.description.match(/\d+/)?.[0] || 0);
      return bNum - aNum; // most recent first
    });
    
    if (teamMatches.length === 0) {
      if (countBadge) countBadge.textContent = '0';
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="calendar" data-icon-size="32"></div>
          <div class="empty-state-text">No matches found for Team ${teamNumber}</div>
        </div>
      `;
      initIcons();
      return;
    }
    if (countBadge) countBadge.textContent = teamMatches.length;
    
    // Load match notes for this team
    let matchNotesData = { private_notes: [], public_notes: [] };
    try {
      matchNotesData = await api.getMatchNotes(this.currentEvent, { team: teamNumber.toString() });
    } catch (e) {
      // Only fallback to demo notes for DEVDATA events
    }
    
    // If no real notes and this is a DEVDATA event, use demo notes
    const hasRealNotes = (matchNotesData.private_notes?.length > 0 || matchNotesData.public_notes?.length > 0);
    if (!hasRealNotes && this._isDevDataEvent()) {
      matchNotesData = this.getDemoNotesForTeam(teamNum);
    }
    
    // Group notes by match
    const notesByMatch = {};
    [...(matchNotesData.private_notes || []), ...(matchNotesData.public_notes || [])].forEach(n => {
      if (!n.notes || !n.notes.trim()) return;
      if (!notesByMatch[n.match_number]) notesByMatch[n.match_number] = [];
      notesByMatch[n.match_number].push(n);
    });
    
    container.innerHTML = teamMatches.map(match => {
      const onRed = match.red.teams.includes(teamNum);
      const teamScore = onRed ? match.red.total : match.blue.total;
      const oppScore = onRed ? match.blue.total : match.red.total;
      
      let result = '';
      let resultClass = '';
      if (match.completed && teamScore !== null && oppScore !== null) {
        if (teamScore > oppScore) { result = 'W'; resultClass = 'win'; }
        else if (teamScore < oppScore) { result = 'L'; resultClass = 'loss'; }
        else { result = 'T'; resultClass = 'tie'; }
      }
      
      const notes = notesByMatch[match.description] || [];
      const hasNotes = notes.length > 0;
      
      return `
        <div class="scout-match-history-item" onclick="this.classList.toggle('expanded')">
          <div class="scout-match-history-header">
            <span class="scout-match-history-name">${match.description}</span>
            <div class="scout-match-history-scores">
              <span class="scout-match-history-red">${match.red.total ?? '-'}</span>
              <span class="scout-match-history-vs">vs</span>
              <span class="scout-match-history-blue">${match.blue.total ?? '-'}</span>
            </div>
            ${result ? `<span class="scout-match-history-result ${resultClass}">${result}</span>` : ''}
            ${hasNotes ? `<span class="scout-match-history-notes-badge">${notes.length} note${notes.length > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="scout-match-history-expand">
            ${hasNotes ? notes.map(n => `
              <div class="scout-match-note-entry">
                <div class="scout-match-note-meta">${n.is_private ? 'Private' : (n.scouting_team ? `Team ${n.scouting_team}` : 'Public')}</div>
                <div class="scout-match-note-text">${n.notes}</div>
              </div>
            `).join('') : `
              <div style="font-size: var(--text-xs); color: var(--text-muted); padding: var(--space-xs) 0;">No notes for this match. Add notes in Match Scouting.</div>
            `}
          </div>
        </div>
      `;
    }).join('');
  }
  
  // ==========================================
  // Match Scouting Methods
  // ==========================================
  
  renderMatchScoutPage() {
    this.selectedMatchScout = null;
    this.matchScoutNotesCache = {};
    this.matchScoutFilter = 'all';
    this.renderMatchScoutList();
    this.setupMatchScoutFilters();
  }
  
  setupMatchScoutFilters() {
    const filters = document.querySelectorAll('.match-scout-filter');
    filters.forEach(btn => {
      btn.addEventListener('click', () => {
        filters.forEach(f => f.classList.remove('active'));
        btn.classList.add('active');
        this.matchScoutFilter = btn.dataset.filter;
        this.renderMatchScoutList();
      });
    });
  }
  
  renderMatchScoutList() {
    const container = $('#matchScoutMatchList');
    const countBadge = $('#matchScoutCount');
    if (!container) return;
    
    let matches = [...this.matches];
    
    // Sort: completed (most recent first), then upcoming (soonest first)
    matches.sort((a, b) => {
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;
      const aNum = parseInt(a.description.match(/\d+/)?.[0] || 0);
      const bNum = parseInt(b.description.match(/\d+/)?.[0] || 0);
      return a.completed ? bNum - aNum : aNum - bNum;
    });
    
    // Filter
    if (this.matchScoutFilter === 'completed') {
      matches = matches.filter(m => m.completed);
    } else if (this.matchScoutFilter === 'upcoming') {
      matches = matches.filter(m => !m.completed);
    } else if (this.matchScoutFilter === 'noted') {
      const notedMatches = Object.keys(this.matchScoutNotesCache || {});
      matches = matches.filter(m => notedMatches.includes(m.description));
    }
    
    if (countBadge) countBadge.textContent = `${matches.length} matches`;
    
    if (matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-text">No matches found</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = matches.map(match => {
      const allTeams = [...match.red.teams, ...match.blue.teams];
      const teamsStr = allTeams.join(', ');
      const isActive = this.selectedMatchScout === match.description;
      const hasNotes = this.matchScoutNotesCache?.[match.description];
      
      return `
        <div class="match-scout-item ${isActive ? 'active' : ''}" data-match="${match.description}" onclick="app.selectMatchForScouting('${match.description}')">
          <div class="match-scout-item-info">
            <div class="match-scout-item-name">${match.description}</div>
            <div class="match-scout-item-teams">${teamsStr}</div>
          </div>
          <div class="match-scout-item-status">
            ${hasNotes ? '<span class="match-scout-item-badge has-notes">Notes</span>' : ''}
            <span class="match-scout-item-badge ${match.completed ? 'completed' : 'upcoming'}">${match.completed ? 'Done' : 'Upcoming'}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  async selectMatchForScouting(matchDescription) {
    this.selectedMatchScout = matchDescription;
    
    // Update active state in list
    document.querySelectorAll('.match-scout-item').forEach(item => {
      item.classList.toggle('active', item.dataset.match === matchDescription);
    });
    
    const match = this.matches.find(m => m.description === matchDescription);
    if (!match) return;
    
    const container = $('#matchScoutContent');
    if (!container) return;
    
    // Show loading
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-xl);">
        <div class="empty-state-text">Loading match data...</div>
      </div>
    `;
    
    // Load existing notes for this match
    let existingNotes = { private_notes: [], public_notes: [] };
    try {
      existingNotes = await api.getMatchNotes(this.currentEvent, { match: matchDescription });
    } catch (e) {
      console.warn('Could not load match notes:', e);
    }
    
    // Only fallback to demo notes for DEVDATA events
    const hasRealNotes = (existingNotes.private_notes?.length > 0 || existingNotes.public_notes?.length > 0);
    if (!hasRealNotes && this._isDevDataEvent()) {
      existingNotes = this.getDemoNotesForMatch(matchDescription);
    }
    
    // Build the match header with auto-filled data
    const resultText = match.completed ? 
      (match.red.total > match.blue.total ? 'Red Wins' : match.red.total < match.blue.total ? 'Blue Wins' : 'Tie') : 'Not Played';
    const resultClass = match.completed ?
      (match.red.total > match.blue.total ? 'color-danger' : match.red.total < match.blue.total ? 'color-primary' : 'color-text-muted') : 'color-text-muted';
    
    // All teams in the match
    const allTeams = [
      ...match.red.teams.map(t => ({ number: t, alliance: 'red' })),
      ...match.blue.teams.map(t => ({ number: t, alliance: 'blue' })),
    ];
    
    // Build note cards for each team
    const teamCards = allTeams.map(team => {
      const rankData = this.rankings.find(r => r.teamNumber === team.number);
      const rankStr = rankData ? `#${rankData.rank} · ${rankData.wins}W ${rankData.losses}L` : 'Unranked';
      const isYourTeam = team.number.toString() === this.teamNumber;
      
      // Find existing notes for this team in this match
      const privateNote = existingNotes.private_notes?.find(n => n.team_number === team.number.toString()) || null;
      const publicNote = existingNotes.private_notes?.length > 0 ? null : null; // We use user's own public note
      const publicNoteOwn = existingNotes.public_notes?.find(n => n.team_number === team.number.toString() && n.scouting_team === this.teamNumber) || null;
      const otherPublicNotes = (existingNotes.public_notes || []).filter(n => n.team_number === team.number.toString() && n.scouting_team !== this.teamNumber);
      
      return `
        <div class="match-scout-team-card">
          <div class="match-scout-team-card-header ${team.alliance}">
            <div>
              <span class="match-scout-team-card-name">Team ${team.number}${this.getTeamName(team.number) ? ' · ' + this.getTeamName(team.number) : ''} ${isYourTeam ? '(You)' : ''}</span>
            </div>
            <span class="match-scout-team-card-rank">${rankStr}</span>
          </div>
          <div class="match-scout-team-card-body">
            <div class="match-scout-note-area">
              <div class="match-scout-note-label">Public Notes</div>
              <textarea class="match-scout-note-input" 
                data-match="${matchDescription}" 
                data-team="${team.number}" 
                data-private="0"
                placeholder="Notes visible to your team...">${publicNoteOwn?.notes || ''}</textarea>
            </div>
            <div class="match-scout-note-area">
              <div class="match-scout-note-label">Private Notes</div>
              <textarea class="match-scout-note-input" 
                data-match="${matchDescription}" 
                data-team="${team.number}" 
                data-private="1"
                placeholder="Only visible to you...">${privateNote?.notes || ''}</textarea>
            </div>
            ${otherPublicNotes.length > 0 ? `
              <div class="match-scout-other-notes">
                <div class="match-scout-other-notes-title">Notes from other scouts</div>
                ${otherPublicNotes.map(n => `
                  <div style="margin-top: 4px;"><strong>Team ${n.scouting_team}:</strong> ${n.notes}</div>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="match-scout-save-row">
            <button class="btn btn-sm btn-primary" onclick="app.saveMatchTeamNotes('${matchDescription}', '${team.number}')">Save</button>
          </div>
        </div>
      `;
    }).join('');
    
    container.innerHTML = `
      <div class="match-scout-header">
        <div class="match-scout-header-top">
          <div class="match-scout-header-title">${match.description}</div>
          <span class="match-scout-header-result ${resultClass}">${resultText}</span>
        </div>
        <div class="match-scout-alliances">
          <div class="match-scout-alliance red">
            <span class="match-scout-alliance-label">Red</span>
            <span class="match-scout-alliance-score">${match.red.total ?? '-'}</span>
            <div class="match-scout-alliance-teams">
              ${match.red.teams.map(t => `<span class="match-scout-alliance-team ${t.toString() === this.teamNumber ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join('')}
            </div>
          </div>
          <div class="match-scout-alliance blue">
            <span class="match-scout-alliance-label">Blue</span>
            <span class="match-scout-alliance-score">${match.blue.total ?? '-'}</span>
            <div class="match-scout-alliance-teams">
              ${match.blue.teams.map(t => `<span class="match-scout-alliance-team ${t.toString() === this.teamNumber ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="match-scout-team-notes">
        ${teamCards}
      </div>
    `;
  }
  
  async saveMatchTeamNotes(matchDescription, teamNumber) {
    if (this._isEventEnded()) {
      toast.error('This event has ended — notes are read-only');
      return;
    }
    
    const publicTextarea = document.querySelector(`.match-scout-note-input[data-match="${matchDescription}"][data-team="${teamNumber}"][data-private="0"]`);
    const privateTextarea = document.querySelector(`.match-scout-note-input[data-match="${matchDescription}"][data-team="${teamNumber}"][data-private="1"]`);
    
    try {
      const promises = [];
      
      if (publicTextarea) {
        promises.push(api.saveMatchNote(this.currentEvent, matchDescription, teamNumber, publicTextarea.value, false));
      }
      if (privateTextarea) {
        promises.push(api.saveMatchNote(this.currentEvent, matchDescription, teamNumber, privateTextarea.value, true));
      }
      
      await Promise.all(promises);
      
      // Cache that this match has notes
      if (!this.matchScoutNotesCache) this.matchScoutNotesCache = {};
      this.matchScoutNotesCache[matchDescription] = true;
      
      toast.success(`Notes saved for Team ${teamNumber}`);
    } catch (e) {
      console.error('Failed to save match notes:', e);
      toast.error('Failed to save notes. Please try again.');
    }
  }
  
  // ===================== Event Picker =====================
  
  openEventPicker() {
    const modal = $('#eventPickerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    
    // Reset state
    this._epSeason = this._getSeasonYear();
    this._epFilter = 'today';
    this._epAllEvents = [];
    this._epSearchQuery = '';
    
    // Reset UI
    const input = $('#epSearchInput');
    if (input) input.value = '';
    
    // Populate season dropdown (current year back to 2019)
    this._populateSeasonDropdown();
    
    // Set active tab
    document.querySelectorAll('.ep-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.ep-tab[data-ep-filter="today"]')?.classList.add('active');
    
    // Hide season dropdown (only for 'all' tab)
    const seasonSelect = $('#epSeasonSelect');
    if (seasonSelect) seasonSelect.style.display = 'none';
    
    // Load today's events
    this._loadEventPickerData();
  }
  
  closeEventPicker() {
    const modal = $('#eventPickerModal');
    if (modal) modal.style.display = 'none';
  }
  
  _getSeasonYear() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 9 ? year : year - 1;
  }
  
  _populateSeasonDropdown() {
    const select = $('#epSeasonSelect');
    if (!select) return;
    
    const currentSeason = this._getSeasonYear();
    const startYear = 2019; // FTC seasons back to 2019
    
    let html = '';
    // Go from current season backwards to 2019
    for (let year = currentSeason; year >= startYear; year--) {
      html += `<option value="${year}" ${year === currentSeason ? 'selected' : ''}>${year}-${year + 1}</option>`;
    }
    select.innerHTML = html;
  }
  
  _updateSeasonLabel() {
    // Deprecated - using dropdown now
  }
  
  switchEventPickerTab(filter) {
    this._epFilter = filter;
    this._epSearchQuery = '';
    const input = $('#epSearchInput');
    if (input) input.value = '';
    
    // Update tab UI
    document.querySelectorAll('.ep-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.ep-tab[data-ep-filter="${filter}"]`)?.classList.add('active');
    
    // Show/hide season dropdown
    const seasonSelect = $('#epSeasonSelect');
    if (seasonSelect) {
      seasonSelect.style.display = filter === 'all' ? 'block' : 'none';
      seasonSelect.value = this._epSeason.toString();
    }
    
    this._loadEventPickerData();
  }
  
  changeEventPickerSeason(delta) {
    // Deprecated - using dropdown now
    this._epSeason += delta;
    this._loadEventPickerData();
  }
  
  async _loadEventPickerData() {
    const list = $('#epEventList');
    if (!list) return;
    
    list.innerHTML = `
      <div class="ep-loading">
        <div class="mobile-loading-spinner" style="width: 24px; height: 24px;"></div>
        <span>Loading events...</span>
      </div>
    `;
    
    try {
      const params = {};
      
      if (this._epFilter === 'today') {
        // Fetch current season events and we'll filter client-side for today
        params.season = this._getSeasonYear();
      } else if (this._epFilter === 'my-team') {
        params.season = this._getSeasonYear();
        if (this.teamNumber) params.team = this.teamNumber;
      } else {
        // 'all' — use the selected season
        params.season = this._epSeason;
      }
      
      if (this._epSearchQuery) {
        params.query = this._epSearchQuery;
      }
      
      const data = await api.searchEvents(params);
      this._epAllEvents = data.events || [];
      
      // Apply client-side filter for "today"
      if (this._epFilter === 'today') {
        this._epAllEvents = this._epAllEvents.filter(e => e.status === 'live' || e.status === 'upcoming');
        // Also include events from today that are marked past (just ended)
        const todayStr = new Date().toISOString().split('T')[0];
        this._epAllEvents = (data.events || []).filter(e => {
          if (e.status === 'live') return true;
          if (e.dateStart) {
            const startStr = e.dateStart.split('T')[0];
            const endStr = e.dateEnd ? e.dateEnd.split('T')[0] : startStr;
            return startStr <= todayStr && endStr >= todayStr;
          }
          return false;
        });
      }
      
      this._renderEventPickerList();
    } catch (err) {
      console.error('Event picker load error:', err);
      list.innerHTML = `<div class="ep-empty">Failed to load events. Please try again.</div>`;
    }
  }
  
  filterEventPickerList(query) {
    this._epSearchQuery = query.toLowerCase().trim();
    
    // Check for dev code
    if (query.toUpperCase() === 'DEVDATA1') {
      this._activateDevMode();
      return;
    }
    
    if (this._epFilter === 'all' || this._epFilter === 'my-team') {
      // Re-fetch from server with search param
      this._loadEventPickerData();
    } else {
      // Client-side filter for today tab
      this._renderEventPickerList();
    }
  }
  
  _activateDevMode() {
    // Create a special dev/test event
    const devEvent = {
      code: '2026devtest',
      name: 'DEV TEST EVENT - Sample Data',
      type: 'Test',
      city: 'Dev City',
      stateprov: 'TEST',
      country: 'USA',
      dateStart: new Date().toISOString(),
      dateEnd: new Date().toISOString(),
      status: 'live'
    };
    
    // Select this event
    this._selectEvent(devEvent.code, devEvent.name);
    
    toast.success('Dev mode activated - Using test event');
  }
  
  _renderEventPickerList() {
    const list = $('#epEventList');
    if (!list) return;
    
    let events = this._epAllEvents || [];
    
    // Apply client-side search for today tab
    if (this._epSearchQuery && this._epFilter === 'today') {
      const q = this._epSearchQuery;
      events = events.filter(e =>
        (e.code || '').toLowerCase().includes(q) ||
        (e.name || '').toLowerCase().includes(q) ||
        (e.city || '').toLowerCase().includes(q) ||
        (e.stateprov || '').toLowerCase().includes(q) ||
        (e.type || '').toLowerCase().includes(q)
      );
    }
    
    if (events.length === 0) {
      list.innerHTML = `<div class="ep-empty">No events found</div>`;
      return;
    }
    
    // Group by status
    const live = events.filter(e => e.status === 'live');
    const upcoming = events.filter(e => e.status === 'upcoming');
    const past = events.filter(e => e.status === 'past');
    
    let html = '';
    
    if (live.length > 0) {
      html += `<div class="ep-section-label">Live Now</div>`;
      html += live.map(e => this._renderEventPickerRow(e)).join('');
    }
    if (upcoming.length > 0) {
      html += `<div class="ep-section-label">Upcoming</div>`;
      html += upcoming.map(e => this._renderEventPickerRow(e)).join('');
    }
    if (past.length > 0) {
      html += `<div class="ep-section-label">Past Events</div>`;
      html += past.slice(0, 50).map(e => this._renderEventPickerRow(e)).join('');
      if (past.length > 50) {
        html += `<div class="ep-empty">Showing first 50 past events. Use search to find more.</div>`;
      }
    }
    
    list.innerHTML = html;
    
    // Attach click handlers
    list.querySelectorAll('.ep-event').forEach(row => {
      row.addEventListener('click', () => {
        const code = row.dataset.eventCode;
        const name = row.dataset.eventName;
        // Find the event metadata from the loaded list
        const eventMeta = this._epAllEvents.find(e => e.code === code);
        this._selectEvent(code, name, eventMeta);
      });
    });
  }
  
  _renderEventPickerRow(event) {
    const isCurrent = event.code === this.currentEvent;
    const statusClass = event.status || 'upcoming';
    
    // Format date
    let dateStr = '';
    if (event.dateStart) {
      const start = new Date(event.dateStart);
      const opts = { month: 'short', day: 'numeric' };
      dateStr = start.toLocaleDateString('en-US', opts);
      if (event.dateEnd && event.dateEnd !== event.dateStart) {
        const end = new Date(event.dateEnd);
        dateStr += ` – ${end.toLocaleDateString('en-US', opts)}`;
      }
    }
    
    // Location
    const locationParts = [event.city, event.stateprov, event.country].filter(Boolean);
    const location = locationParts.join(', ');
    
    return `
      <div class="ep-event ${isCurrent ? 'current' : ''}" data-event-code="${event.code}" data-event-name="${this._escapeHtml(event.name || event.code)}">
        <div class="ep-event-status ${statusClass}"></div>
        <div class="ep-event-info">
          <div class="ep-event-name">${this._escapeHtml(event.name || event.code)}</div>
          <div class="ep-event-meta">
            ${dateStr ? `<span>${dateStr}</span>` : ''}
            ${location ? `<span>${this._escapeHtml(location)}</span>` : ''}
            ${event.type ? `<span>${this._escapeHtml(event.type)}</span>` : ''}
          </div>
        </div>
        <div class="ep-event-code">${event.code}</div>
      </div>
    `;
  }
  
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  async _selectEvent(code, name, eventMeta) {
    this.currentEvent = code;
    this.eventName = name || code;
    storage.set('currentEvent', code);
    
    // Store event metadata for end-date / status checks
    if (eventMeta) {
      this.eventDateEnd = eventMeta.dateEnd || null;
      this.eventStatus = eventMeta.status || null;
    } else {
      this.eventDateEnd = null;
      this.eventStatus = null;
    }
    this.eventEnded = false;
    
    // Update sidebar display
    const nameEl = $('#currentEventName');
    if (nameEl) nameEl.textContent = this.eventName;
    
    // Close picker
    this.closeEventPicker();
    
    // Reload all event data
    try {
      await this.loadEventData();
      toast.success(`Switched to ${this.eventName}`);
    } catch (err) {
      console.error('Failed to load event data:', err);
      toast.error('Failed to load event data');
    }
  }
  
  // ===================== End Event Picker =====================
  
  // ===================== Custom Questions =====================
  
  async loadCustomQuestions() {
    try {
      const data = await api.listCustomQuestions();
      this.customQuestions = data.questions || [];
    } catch (e) {
      console.error('Failed to load custom questions:', e);
      this.customQuestions = [];
    }
  }
  
  async renderCustomQuestionsManager() {
    await this.loadCustomQuestions();
    const container = $('#customQuestionsList');
    if (!container) return;
    
    if (this.customQuestions.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-icon" data-icon="edit" data-icon-size="48"></div>
          <div class="empty-state-title">No custom fields yet</div>
          <div class="empty-state-text">Add boolean toggles, sliders, dropdowns, number fields, or text fields to your scouting form</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    const typeLabels = {
      boolean: 'Toggle (Yes/No)',
      slider: 'Slider',
      dropdown: 'Dropdown',
      number: 'Number',
      text: 'Text'
    };
    
    const typeColors = {
      boolean: 'var(--success)',
      slider: 'var(--primary)',
      dropdown: 'var(--warning)',
      number: 'var(--purple)',
      text: 'var(--cyan, #06b6d4)'
    };
    
    container.innerHTML = this.customQuestions.map((q, i) => {
      let configDesc = '';
      if (q.field_type === 'slider') {
        configDesc = `Range: ${q.config.min ?? 0} – ${q.config.max ?? 10}, Step: ${q.config.step ?? 1}`;
      } else if (q.field_type === 'dropdown') {
        const opts = q.config.options || [];
        configDesc = `Options: ${opts.join(', ')}`;
      }
      
      return `
        <div class="settings-row" style="align-items: center;">
          <div class="settings-row-info" style="flex: 1;">
            <h4 style="display: flex; align-items: center; gap: var(--space-sm);">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${typeColors[q.field_type] || 'var(--text-muted)'}; display: inline-block;"></span>
              ${this._escapeHtml(q.label)}
            </h4>
            <p>
              <span style="font-size: var(--text-xs); color: var(--text-muted);">${typeLabels[q.field_type] || q.field_type}</span>
              ${configDesc ? `<span style="font-size: var(--text-xs); color: var(--text-muted); margin-left: var(--space-sm);">• ${this._escapeHtml(configDesc)}</span>` : ''}
            </p>
          </div>
          <div style="display: flex; gap: var(--space-xs);">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="app.editCustomQuestion(${q.id})" title="Edit">
              <span data-icon="edit" data-icon-size="14"></span>
            </button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="app.deleteCustomQuestion(${q.id})" title="Delete" style="color: var(--danger);">
              <span data-icon="trash" data-icon-size="14"></span>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    initIcons();
  }
  
  setupCustomQuestionsListeners() {
    $('#addCustomQuestionBtn')?.addEventListener('click', () => this.showCustomQuestionForm());
    $('#cqSaveBtn')?.addEventListener('click', () => this.saveCustomQuestion());
    $('#cqCancelBtn')?.addEventListener('click', () => this.hideCustomQuestionForm());
    
    // Toggle config sections based on field type
    $('#cqFieldType')?.addEventListener('change', (e) => {
      const type = e.target.value;
      const sliderConfig = $('#cqSliderConfig');
      const dropdownConfig = $('#cqDropdownConfig');
      if (sliderConfig) sliderConfig.style.display = type === 'slider' ? 'block' : 'none';
      if (dropdownConfig) dropdownConfig.style.display = type === 'dropdown' ? 'block' : 'none';
    });
  }
  
  showCustomQuestionForm(question = null) {
    const form = $('#customQuestionForm');
    if (!form) return;
    
    form.style.display = 'block';
    
    const titleEl = $('#cqFormTitle');
    const labelInput = $('#cqLabel');
    const typeSelect = $('#cqFieldType');
    const editIdInput = $('#cqEditId');
    const sliderConfig = $('#cqSliderConfig');
    const dropdownConfig = $('#cqDropdownConfig');
    
    if (question) {
      // Edit mode
      if (titleEl) titleEl.textContent = 'Edit Custom Field';
      if (labelInput) labelInput.value = question.label;
      if (typeSelect) typeSelect.value = question.field_type;
      if (editIdInput) editIdInput.value = question.id;
      
      if (question.field_type === 'slider') {
        if (sliderConfig) sliderConfig.style.display = 'block';
        if (dropdownConfig) dropdownConfig.style.display = 'none';
        const minEl = $('#cqSliderMin');
        const maxEl = $('#cqSliderMax');
        const stepEl = $('#cqSliderStep');
        if (minEl) minEl.value = question.config.min ?? 0;
        if (maxEl) maxEl.value = question.config.max ?? 10;
        if (stepEl) stepEl.value = question.config.step ?? 1;
      } else if (question.field_type === 'dropdown') {
        if (sliderConfig) sliderConfig.style.display = 'none';
        if (dropdownConfig) dropdownConfig.style.display = 'block';
        const optionsEl = $('#cqDropdownOptions');
        if (optionsEl) optionsEl.value = (question.config.options || []).join('\n');
      } else {
        if (sliderConfig) sliderConfig.style.display = 'none';
        if (dropdownConfig) dropdownConfig.style.display = 'none';
      }
    } else {
      // Add mode
      if (titleEl) titleEl.textContent = 'Add Custom Field';
      if (labelInput) labelInput.value = '';
      if (typeSelect) typeSelect.value = '';
      if (editIdInput) editIdInput.value = '';
      if (sliderConfig) sliderConfig.style.display = 'none';
      if (dropdownConfig) dropdownConfig.style.display = 'none';
    }
    
    form.scrollIntoView({ behavior: 'smooth' });
    initIcons();
  }
  
  hideCustomQuestionForm() {
    const form = $('#customQuestionForm');
    if (form) form.style.display = 'none';
  }
  
  editCustomQuestion(id) {
    const question = this.customQuestions.find(q => q.id === id);
    if (question) {
      this.showCustomQuestionForm(question);
    }
  }
  
  async deleteCustomQuestion(id) {
    if (!confirm('Delete this custom field? All responses for this field will also be deleted.')) return;
    
    try {
      await api.deleteCustomQuestion(id);
      toast.success('Custom field deleted');
      await this.renderCustomQuestionsManager();
    } catch (e) {
      console.error('Failed to delete custom question:', e);
      toast.error('Failed to delete');
    }
  }
  
  async saveCustomQuestion() {
    const label = $('#cqLabel')?.value?.trim();
    const fieldType = $('#cqFieldType')?.value;
    const editId = $('#cqEditId')?.value;
    
    if (!label) {
      toast.error('Field label is required');
      return;
    }
    if (!fieldType) {
      toast.error('Please select a field type');
      return;
    }
    
    let config = {};
    
    if (fieldType === 'slider') {
      config = {
        min: parseFloat($('#cqSliderMin')?.value || '0'),
        max: parseFloat($('#cqSliderMax')?.value || '10'),
        step: parseFloat($('#cqSliderStep')?.value || '1'),
      };
      if (config.min >= config.max) {
        toast.error('Max must be greater than min');
        return;
      }
    } else if (fieldType === 'dropdown') {
      const optionsText = $('#cqDropdownOptions')?.value || '';
      const options = optionsText.split('\n').map(o => o.trim()).filter(o => o);
      if (options.length < 2) {
        toast.error('Please add at least 2 dropdown options');
        return;
      }
      config = { options };
    }
    
    const questionData = {
      label,
      field_type: fieldType,
      config,
      sort_order: editId ? undefined : this.customQuestions.length,
    };
    
    if (editId) {
      questionData.id = parseInt(editId);
    }
    
    try {
      await api.saveCustomQuestion(questionData);
      toast.success(editId ? 'Custom field updated' : 'Custom field added');
      this.hideCustomQuestionForm();
      await this.renderCustomQuestionsManager();
      // Refresh the scouting form if it's rendered
      this.renderScoutCustomFields();
    } catch (e) {
      console.error('Failed to save custom question:', e);
      toast.error('Failed to save');
    }
  }
  
  // ===================== Custom Fields on Scout Form =====================
  
  async renderScoutCustomFields() {
    await this.loadCustomQuestions();
    
    const section = $('#scoutCustomFieldsSection');
    const container = $('#scoutCustomFieldsContainer');
    if (!section || !container) return;
    
    if (!this.customQuestions || this.customQuestions.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    container.innerHTML = this.customQuestions.map(q => this.renderCustomFieldInput(q, 'cq_')).join('');
    initIcons();
  }
  
  renderCustomFieldInput(question, prefix = 'cq_') {
    const id = `${prefix}${question.id}`;
    
    switch (question.field_type) {
      case 'boolean':
        return `
          <div class="form-group">
            <label class="checkbox-wrapper">
              <input type="checkbox" name="${id}" id="${id}" data-cq-id="${question.id}">
              <span>${this._escapeHtml(question.label)}</span>
            </label>
          </div>
        `;
        
      case 'slider': {
        const min = question.config.min ?? 0;
        const max = question.config.max ?? 10;
        const step = question.config.step ?? 1;
        return `
          <div class="form-group">
            <label class="form-label">${this._escapeHtml(question.label)}</label>
            <div class="slider-wrapper">
              <input type="range" class="slider" name="${id}" id="${id}" data-cq-id="${question.id}"
                     min="${min}" max="${max}" step="${step}" value="${min}"
                     oninput="document.getElementById('${id}Value').textContent = this.value">
              <span class="slider-value" id="${id}Value">${min}</span>
            </div>
          </div>
        `;
      }
        
      case 'dropdown': {
        const options = question.config.options || [];
        return `
          <div class="form-group">
            <label class="form-label">${this._escapeHtml(question.label)}</label>
            <select class="form-input form-select" name="${id}" id="${id}" data-cq-id="${question.id}">
              <option value="">Select...</option>
              ${options.map(opt => `<option value="${this._escapeHtml(opt)}">${this._escapeHtml(opt)}</option>`).join('')}
            </select>
          </div>
        `;
      }
        
      case 'number':
        return `
          <div class="form-group">
            <label class="form-label">${this._escapeHtml(question.label)}</label>
            <input type="number" class="form-input" name="${id}" id="${id}" data-cq-id="${question.id}" min="0">
          </div>
        `;
        
      case 'text':
        return `
          <div class="form-group">
            <label class="form-label">${this._escapeHtml(question.label)}</label>
            <textarea class="form-input form-textarea" name="${id}" id="${id}" data-cq-id="${question.id}" rows="2"></textarea>
          </div>
        `;
        
      default:
        return '';
    }
  }
  
  getCustomFieldValues() {
    const responses = [];
    if (!this.customQuestions) return responses;
    
    this.customQuestions.forEach(q => {
      const el = $(`#cq_${q.id}`);
      if (!el) return;
      
      let value = '';
      if (q.field_type === 'boolean') {
        value = el.checked ? 'true' : 'false';
      } else if (el.type === 'range') {
        value = el.value;
      } else {
        value = el.value || '';
      }
      
      responses.push({ question_id: q.id, value });
    });
    
    return responses;
  }
  
  // ===================== End Custom Questions =====================
  
  async logout() {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    storage.remove('token');
    storage.remove('currentEvent');
    window.location.href = 'index.html';
  }
}

// Initialize app
const app = new DashboardApp();
