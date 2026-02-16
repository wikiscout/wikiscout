// WikiScout Mobile Application

class MobileApp {
  constructor() {
    this.currentEvent = null;
    this.teamNumber = null;
    this.teams = [];
    this.teamNameMap = {};     // { teamNumber: nameShort } lookup
    this.rankings = [];
    this.matches = [];
    this.currentScreen = 'rankings';
    this.isSubAccount = false;
    this.assignedTeams = [];        // team numbers this sub-account is assigned to scout
    this.scoutedTeams = [];         // team numbers already scouted at current event
    this.oprData = [];              // calculated OPR data
    this.sosData = [];              // calculated Strength of Schedule data
    this._scoutFormDirty = false;   // tracks whether user has touched the scout form
    this._scoutSubmitting = false;  // prevents double-submit
    this._offlineQueueProcessing = false; // prevents concurrent queue processing
    
    // Auto-refresh config
    this.autoRefreshInterval = 15000; // 15 seconds (overridden by server config)
    this._refreshTimer = null;
    this._silentRefreshing = false;
    
    this.init();
  }
  
  async init() {
    // Initialize icons
    initIcons();
    
    // Check authentication
    await this.checkAuth();
    
    // Setup navigation and events
    this.setupNavigation();
    this.setupEventListeners();
    
    // Load initial data
    await this.loadInitialData();
    
    // Start offline queue processor
    this._startOfflineQueueProcessor();
    
    // Start auto-refresh
    this._startAutoRefresh();
    
    // Hide loading screen
    setTimeout(() => {
      $('#loadingScreen').style.display = 'none';
    }, 500);
  }
  
  async checkAuth() {
    try {
      const result = await api.validateToken();
      if (result && result.team_number) {
        this.teamNumber = result.team_number.toString();
        this.userName = result.name || 'Team Member';
        this.isSubAccount = !!result.is_sub_account;
        this.assignedTeams = (result.assigned_teams || []).map(String);
        $('#mobileSubtitle').textContent = `Team #${this.teamNumber}`;
        
        // Show Team tab for parent accounts (not sub-accounts)
        if (!this.isSubAccount) {
          const teamNav = $('#mobileNavTeam');
          if (teamNav) teamNav.style.display = '';
        }
        return;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Allow demo mode - don't redirect, just set demo team
    }
    
    // Demo mode fallback
    this.teamNumber = '16072';
    this.userName = 'Demo User';
    $('#mobileSubtitle').textContent = `Team #${this.teamNumber} (Demo)`;
    
    // Only redirect on explicit unauthorized event
    window.addEventListener('auth:unauthorized', (e) => {
      // Check if this is not a demo mode scenario
      if (!e.detail?.allowDemo) {
        window.location.href = 'index.html';
      }
    });
  }
  
  setupNavigation() {
    $$('.mobile-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const screen = item.dataset.screen;
        this.navigateTo(screen);
      });
    });
  }
  
  navigateTo(screen) {
    // Update nav
    $$('.mobile-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.screen === screen);
    });
    
    // Update screens
    $$('.screen').forEach(s => {
      s.classList.toggle('active', s.id === `screen-${screen}`);
    });
    
    // Update title
    const titles = {
      rankings: 'Rankings',
      matches: 'Matches',
      data: 'Team Data',
      scout: 'Scout',
      team: 'Team Members'
    };
    $('#mobileTitle').textContent = titles[screen] || 'WikiScout';
    
    this.currentScreen = screen;
    this.loadScreenData(screen);

    // When switching to scout tab, carry over the team selected on the data tab
    if (screen === 'scout') {
      const dataTeam = $('#mobileTeamSelect')?.value;
      const scoutTeam = $('#mobileScoutTeam')?.value;
      if (dataTeam && !scoutTeam) {
        this._setScoutTeam(dataTeam);
      }
    }
    
    // Show/hide FAB
    $('#fabScout').style.display = screen !== 'scout' ? 'flex' : 'none';
  }
  
  setupEventListeners() {
    // Refresh button in header
    $('#mobileRefreshBtn')?.addEventListener('click', () => this.refreshData());

    // Logout button in header
    $('#mobileLogoutBtn')?.addEventListener('click', () => this.logout());
    
    // OTP button in header
    $('#mobileOtpBtn')?.addEventListener('click', () => this.openOtpSheet());
    
    // Close OTP sheet
    $('#closeOtpSheet')?.addEventListener('click', () => this.closeOtpSheet());
    $('#otpSheetOverlay')?.addEventListener('click', () => this.closeOtpSheet());
    
    // FAB
    $('#fabScout')?.addEventListener('click', () => this.navigateTo('scout'));
    
    // OTP buttons in sheet
    $('#mobileDeleteOtp')?.addEventListener('click', () => this.deleteOtp());
    $('#mobileRegenOtp')?.addEventListener('click', () => this.regenerateOtp());
    
    // Match filter pills
    this.matchFilter = 'my-team';
    document.querySelectorAll('.match-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        this.matchFilter = pill.dataset.matchFilter;
        document.querySelectorAll('.match-filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.renderMatches();
      });
    });
    
    // Match scouting sheet
    $('#closeMatchScoutSheet')?.addEventListener('click', () => this.closeMatchScoutSheet());
    $('#matchScoutOverlay')?.addEventListener('click', () => this.closeMatchScoutSheet());
    this._setupMatchScoutSheetDrag();
    
    // Team pickers — open sheet
    $('#dataTeamPickerBtn')?.addEventListener('click', () => this.openTeamPicker('data'));
    $('#scoutTeamPickerBtn')?.addEventListener('click', () => this.openTeamPicker('scout'));

    // Team picker sheet — close
    $('#teamPickerClose')?.addEventListener('click', () => this.closeTeamPicker());
    $('#teamPickerOverlay')?.addEventListener('click', () => this.closeTeamPicker());

    // Team picker search
    $('#teamPickerSearchInput')?.addEventListener('input', debounce((e) => {
      this._renderPickerList(e.target.value);
    }, 150));

    // Team picker list click
    $('#teamPickerList')?.addEventListener('click', (e) => {
      const row = e.target.closest('.team-picker-row');
      if (row) this._selectTeamFromPicker(row.dataset.team);
    });
    
    // Scout form
    $('#mobileScoutForm').addEventListener('submit', (e) => this.handleScoutSubmit(e));
    // Track when user interacts with the scout form so we don't reset it
    $('#mobileScoutForm').addEventListener('input', () => { this._scoutFormDirty = true; });
    $('#mobileScoutForm').addEventListener('change', () => { this._scoutFormDirty = true; });
    
    // Stats popup buttons
    $('#statsViewData').addEventListener('click', () => this.viewTeamDataFromStats());
    $('#statsClose').addEventListener('click', () => this.closeStatsPopup());
    $('#statsPopup').addEventListener('click', (e) => {
      if (e.target.id === 'statsPopup') this.closeStatsPopup();
    });
    
    // Event banners open event picker
    document.querySelectorAll('.event-banner').forEach(banner => {
      banner.addEventListener('click', () => this.openMobileEventPicker());
    });
    
    // Mobile Event Picker
    $('#mobileEpClose')?.addEventListener('click', () => this.closeMobileEventPicker());
    $('#mobileEventPickerModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'mobileEventPickerModal') this.closeMobileEventPicker();
    });
    
    document.querySelectorAll('.mobile-ep-tab').forEach(tab => {
      tab.addEventListener('click', () => this._switchMobileEpTab(tab.dataset.epFilter));
    });
    
    $('#mobileEpSearchInput')?.addEventListener('input', debounce((e) => {
      this._filterMobileEpList(e.target.value);
    }, 250));
    
    $('#mobileEpSeasonSelect')?.addEventListener('change', (e) => {
      this._mepSeason = parseInt(e.target.value);
      this._loadMobileEpData();
    });
    
    // Team management events
    $('#mobileAddMemberForm')?.addEventListener('submit', (e) => this.handleAddMember(e));
    $('#closeMemberDetailSheet')?.addEventListener('click', () => this.closeMemberDetail());
    $('#memberDetailOverlay')?.addEventListener('click', () => this.closeMemberDetail());
    $('#memberToggleBtn')?.addEventListener('click', () => this.toggleMember());
    $('#memberDeleteBtn')?.addEventListener('click', () => this.deleteMember());
    $('#memberGenCredsBtn')?.addEventListener('click', () => this.generateMemberCredentials());
    $('#memberShowQrBtn')?.addEventListener('click', () => this.enlargeQr());
    $('#qrEnlargeOverlay')?.addEventListener('click', () => this.closeEnlargedQr());
    $('#memberEditTeamsBtn')?.addEventListener('click', () => this.openAssignTeamsSheet());
    $('#closeAssignTeamsSheet')?.addEventListener('click', () => this.closeAssignTeamsSheet());
    $('#assignTeamsOverlay')?.addEventListener('click', () => this.closeAssignTeamsSheet());
    $('#assignTeamsSaveBtn')?.addEventListener('click', () => this.saveAssignedTeams());
    $('#assignTeamsAllToggle')?.addEventListener('change', (e) => this.toggleAllTeams(e));
    $('#assignTeamsSearch')?.addEventListener('input', (e) => this.filterAssignTeams(e));
  }
  
  async loadInitialData() {
    try {
      // Get current event
      const meData = await api.getMe().catch(err => {
        console.error('Failed to fetch /me:', err);
        return { found: false };
      });
      
      // Apply server-side config (auto-refresh interval, etc.)
      if (meData.config) {
        const interval = meData.config.mobile_refresh_interval;
        this.autoRefreshInterval = (typeof interval === 'number' && interval >= 0) ? interval : 15000;
      }

      if (meData.found && meData.event) {
        // Store all events for division grouping
        this._allTeamEvents = meData.allEvents || [];

        // Auto-select division event: if the team has multiple active events
        // where one code is a prefix of another, prefer the longer (division) code
        const activeEvents = (meData.allEvents || []).filter(e => e.status === 'live');
        if (activeEvents.length > 1) {
          // Find events sharing a common prefix (division grouping)
          const picked = this._pickDivisionEvent(activeEvents);
          this.currentEvent = picked.code;
          this.eventName = picked.name || picked.code;
        } else {
        this.currentEvent = meData.event.code;
        this.eventName = meData.event.name || this.currentEvent;
        }
        storage.set('currentEvent', this.currentEvent);
      } else {
        this.currentEvent = storage.get('currentEvent');
        this._allTeamEvents = meData.allEvents || [];
      }
      
      // Load today's events
      const todayData = await api.getTodayEvents().catch(() => ({ events: [] }));
      
      // If no events today, leave the list empty — user can pick via event picker
      if (!todayData.events) {
        todayData.events = [];
      }
      
      // Events are selected via event picker modal, no need to populate a select
      
      // If no current event but there are events today, pick the first one
      if (!this.currentEvent && todayData.events && todayData.events.length > 0) {
        this.currentEvent = todayData.events[0].code;
        this.eventName = todayData.events[0].name;
        storage.set('currentEvent', this.currentEvent);
      }
      
      // Update event banners
      this.updateEventBanners();
      
      // Load event data
      if (this.currentEvent) {
        await this.loadEventData();
      }
      
      // Load OTP
      this.loadOtp();
      
    } catch (error) {
      console.error('Failed to load initial data:', error);
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
          // This is a division event — prefer it
          return longer;
        }
      }
    }

    // No prefix relationship found — just pick the first active event
    return sorted[0];
  }
  
  updateEventBanners() {
    const name = this.eventName || this.currentEvent || 'No Event Selected';
    const code = this.currentEvent || '---';
    
    ['#rankingsEventName', '#matchesEventName', '#scoutEventName'].forEach(sel => {
      const el = $(sel);
      if (el) el.textContent = name;
    });
    
    ['#rankingsEventCode', '#matchesEventCode', '#scoutEventCode'].forEach(sel => {
      const el = $(sel);
      if (el) el.textContent = code;
    });
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

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  async loadEventData() {
    if (!this.currentEvent) return;
    
    // Reset all data before loading new event
    this.teams = [];
    this.teamNameMap = {};
    this.rankings = [];
    this.matches = [];
    
    try {
      const [teamsData, rankingsData, matchesData, scoutedData] = await Promise.all([
        api.getTeams(this.currentEvent).catch(() => ({ teams: [] })),
        api.getRankings(this.currentEvent).catch(() => ({ rankings: [] })),
        api.getMatches(this.currentEvent).catch(() => ({ matches: [] })),
        api.getScoutedTeams(this.currentEvent).catch(() => ({ scouted_teams: [] })),
      ]);
      
      // Store which teams have already been scouted
      this.scoutedTeams = (scoutedData.scouted_teams || []).map(String);
      
      // Process teams
      if (teamsData && teamsData.teams && teamsData.teams.length > 0) {
        this.teams = teamsData.teams.map(t => t.teamNumber || t);
        // Build team name lookup from API data
        teamsData.teams.forEach(t => {
          if (t.nameShort || t.nameFull) {
            this.teamNameMap[t.teamNumber || t] = t.nameShort || t.nameFull || '';
          }
        });
      } else {
        this.teams = [];
      }
      
      // Process rankings (API returns lowercase 'rankings')
      const rankings = rankingsData.rankings || rankingsData.Rankings || [];
      this.rankings = rankings.map(r => ({
        teamNumber: r.teamNumber,
        teamName: r.teamName || '',
        rank: r.rank,
        wins: r.wins || 0,
        losses: r.losses || 0,
        ties: r.ties || 0,
        matchesPlayed: r.matchesPlayed || (r.wins + r.losses + r.ties) || 0
      }));
      // Supplement name map from rankings
      rankings.forEach(r => {
        if (r.teamName && !this.teamNameMap[r.teamNumber]) {
          this.teamNameMap[r.teamNumber] = r.teamName;
        }
      });
      
      // Process matches — API returns simplified format: { red: { total, auto, foul, teams }, blue: { ... } }
      const matches = matchesData.matches || matchesData.Schedule || [];
      this.matches = matches.map(m => ({
        matchNumber: m.matchNumber,
        description: m.description || `Match ${m.matchNumber}`,
        tournamentLevel: m.tournamentLevel,
        completed: m.red?.total !== null && m.red?.total !== undefined,
        red: {
          teams: m.red?.teams || [],
          score: m.red?.total,
          auto: m.red?.auto,
          foul: m.red?.foul
        },
        blue: {
          teams: m.blue?.teams || [],
          score: m.blue?.total,
          auto: m.blue?.auto,
          foul: m.blue?.foul
        }
      }));
      
      // Only generate client-side demo data for DEVDATA events
      if (this.teams.length === 0 && this.rankings.length === 0 && this.matches.length === 0 && this._isDevDataEvent()) {
        this._generateDemoData();
      }
      
      this.calculateOPR();
      this.calculateSoS();
      this.updateEventBanners();
      this.populateTeamSelects();
      this.renderRankings();
      this.renderMatches();
      // Only render scout form if it hasn't been touched by the user
      if (!this._scoutFormDirty) {
      this.renderScoutForm();
      }
      
    } catch (error) {
      console.error('Failed to load event data:', error);
    }
  }

  // ---- Refresh & Auto-Refresh ----

  async refreshData() {
    const btn = $('#mobileRefreshBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span data-icon="refresh" data-icon-size="20" class="spin"></span>';
      initIcons();
    }

    try {
      await this.loadEventData();
      toast.success('Data refreshed');
    } catch (e) {
      toast.error('Failed to refresh data');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span data-icon="refresh" data-icon-size="20"></span>';
        initIcons();
      }
    }
  }

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
    if (this._silentRefreshing) return;

    // Only auto-refresh on data-display screens, NOT on scouting form or data view
    const refreshScreens = ['rankings', 'matches'];
    if (!refreshScreens.includes(this.currentScreen)) return;

    this._silentRefreshing = true;

    const btn = $('#mobileRefreshBtn');
    if (btn) {
      btn.innerHTML = '<span data-icon="refresh" data-icon-size="20" class="spin"></span>';
      initIcons();
    }

    try {
      await this.loadEventData();
    } catch (e) {
      console.warn('Silent refresh failed:', e);
    } finally {
      this._silentRefreshing = false;
      if (btn) {
        btn.innerHTML = '<span data-icon="refresh" data-icon-size="20"></span>';
        initIcons();
      }
    }
  }
  
  _generateDemoData() {
    // Demo teams list (mirrors the server-side demo data)
    const DEMO_TEAMS = [
      { teamNumber: 7236, name: 'Recharged Green' },
      { teamNumber: 8393, name: 'Gearheads' },
      { teamNumber: 9281, name: 'Overcharged' },
      { teamNumber: 10331, name: 'BinaryBots' },
      { teamNumber: 11115, name: 'Gluten Free' },
      { teamNumber: 11260, name: 'Up Next!' },
      { teamNumber: 12456, name: 'Circuit Breakers' },
      { teamNumber: 13201, name: 'TechnoWizards' },
      { teamNumber: 14078, name: 'Sigma Bots' },
      { teamNumber: 14523, name: 'RoboKnights' },
      { teamNumber: 15227, name: 'Mech Mayhem' },
      { teamNumber: 16072, name: 'Coyote Coders' },
      { teamNumber: 16340, name: 'Wired Warriors' },
      { teamNumber: 17305, name: 'Steel Stingers' },
      { teamNumber: 18092, name: 'Quantum Leap' },
      { teamNumber: 18456, name: 'Iron Eagles' },
      { teamNumber: 19012, name: 'Byte Force' },
      { teamNumber: 19876, name: 'Phoenix Rising' },
      { teamNumber: 20145, name: 'Titan Tech' },
      { teamNumber: 20503, name: 'NovaDroids' },
      { teamNumber: 21087, name: 'Velocity' },
      { teamNumber: 22190, name: 'Gear Grinders' },
      { teamNumber: 23456, name: 'Flash Forge' },
      { teamNumber: 24601, name: 'Robovolt' },
    ];

    this.teams = DEMO_TEAMS.map(t => t.teamNumber);

    // Seeded random for consistent demo data
    let seed = 42;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    // Generate 30 completed matches + 6 upcoming
    const teamNums = this.teams;
    const demoMatches = [];
    for (let i = 1; i <= 36; i++) {
      const sh = shuffle(teamNums);
      const isCompleted = i <= 30;
      const redAuto = isCompleted ? Math.floor(rng() * 40) + 10 : null;
      const blueAuto = isCompleted ? Math.floor(rng() * 40) + 10 : null;
      const redTeleop = isCompleted ? Math.floor(rng() * 80) + 30 : 0;
      const blueTeleop = isCompleted ? Math.floor(rng() * 80) + 30 : 0;
      const redEnd = isCompleted ? Math.floor(rng() * 30) : 0;
      const blueEnd = isCompleted ? Math.floor(rng() * 30) : 0;
      const redFoul = isCompleted ? Math.floor(rng() * 10) : null;
      const blueFoul = isCompleted ? Math.floor(rng() * 10) : null;
      const redTotal = isCompleted ? (redAuto + redTeleop + redEnd + redFoul) : null;
      const blueTotal = isCompleted ? (blueAuto + blueTeleop + blueEnd + blueFoul) : null;

      demoMatches.push({
        matchNumber: i,
        description: `Qualifier ${i}`,
        tournamentLevel: 'qual',
        completed: isCompleted,
        red: { teams: [sh[0], sh[1]], score: redTotal, auto: redAuto, foul: redFoul },
        blue: { teams: [sh[2], sh[3]], score: blueTotal, auto: blueAuto, foul: blueFoul }
      });
    }
    this.matches = demoMatches;

    // Generate rankings from match results
    const stats = {};
    teamNums.forEach(t => { stats[t] = { wins: 0, losses: 0, ties: 0, matchesPlayed: 0, totalScore: 0 }; });
    demoMatches.filter(m => m.completed).forEach(m => {
      m.red.teams.forEach(t => {
        if (!stats[t]) return;
        stats[t].matchesPlayed++;
        stats[t].totalScore += m.red.score;
        if (m.red.score > m.blue.score) stats[t].wins++;
        else if (m.red.score < m.blue.score) stats[t].losses++;
        else stats[t].ties++;
      });
      m.blue.teams.forEach(t => {
        if (!stats[t]) return;
        stats[t].matchesPlayed++;
        stats[t].totalScore += m.blue.score;
        if (m.blue.score > m.red.score) stats[t].wins++;
        else if (m.blue.score < m.red.score) stats[t].losses++;
        else stats[t].ties++;
      });
    });

    const sorted = Object.entries(stats).sort(([, a], [, b]) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.totalScore - a.totalScore;
    });

    this.rankings = sorted.map(([num, s], idx) => {
      const teamInfo = DEMO_TEAMS.find(t => t.teamNumber === parseInt(num));
      return {
        teamNumber: parseInt(num),
        teamName: teamInfo?.name || `Team ${num}`,
        rank: idx + 1,
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        matchesPlayed: s.matchesPlayed
      };
    });

    console.log('Demo data generated:', this.teams.length, 'teams,', this.rankings.length, 'rankings,', this.matches.length, 'matches');
  }

  populateTeamSelects() {
    // Update custom picker trigger labels if a value was already selected
    ['mobileTeamSelect', 'mobileScoutTeam'].forEach(hiddenId => {
      const hidden = $(`#${hiddenId}`);
      if (!hidden) return;
      const val = hidden.value;
      const triggerBtn = hiddenId === 'mobileTeamSelect' ? $('#dataTeamPickerBtn') : $('#scoutTeamPickerBtn');
      if (!triggerBtn) return;
      const textEl = triggerBtn.querySelector('.picker-trigger-text');
      if (val && this.teams.includes(parseInt(val))) {
        textEl.textContent = this.teamLabel(val);
        textEl.classList.remove('placeholder');
        this._updatePickerTriggerBadges(triggerBtn, val);
      } else {
        textEl.textContent = hiddenId === 'mobileTeamSelect' ? 'Choose team...' : 'Select Team';
        textEl.classList.add('placeholder');
        // Remove old badges
        const oldBadges = triggerBtn.querySelector('.picker-trigger-badges');
        if (oldBadges) oldBadges.remove();
      }
    });
  }

  // ─── Custom Team Picker Sheet ───────────────────────────────────

  _activePickerTarget = null; // 'data' or 'scout'

  openTeamPicker(target) {
    this._activePickerTarget = target;
    const sheet = $('#teamPickerSheet');
    const overlay = $('#teamPickerOverlay');
    if (!sheet || !overlay) return;

    // Set title
    const title = $('#teamPickerTitle');
    if (title) title.textContent = target === 'scout' ? 'Select Team to Scout' : 'Select Team';

    // Render list
    this._renderPickerList('');

    // Show
    overlay.classList.add('active');
    sheet.classList.add('active');

    // Clear search but do NOT auto-focus (avoids keyboard popping up on mobile)
    const searchInput = $('#teamPickerSearchInput');
    if (searchInput) searchInput.value = '';
  }

  closeTeamPicker() {
    const sheet = $('#teamPickerSheet');
    const overlay = $('#teamPickerOverlay');
    if (sheet) sheet.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    this._activePickerTarget = null;
  }

  _renderPickerList(query) {
    const container = $('#teamPickerList');
    if (!container) return;

    const q = (query || '').trim().toLowerCase();
    const hiddenId = this._activePickerTarget === 'scout' ? 'mobileScoutTeam' : 'mobileTeamSelect';
    const currentVal = $(`#${hiddenId}`)?.value || '';

    // Sort: assigned first, then unscouted, then scouted
    const sorted = [...this.teams].sort((a, b) => {
      const aAssigned = this.assignedTeams.includes(String(a));
      const bAssigned = this.assignedTeams.includes(String(b));
      const aScouted = this.scoutedTeams.includes(String(a));
      const bScouted = this.scoutedTeams.includes(String(b));

      // Assigned unscouted first
      if (aAssigned && !aScouted && !(bAssigned && !bScouted)) return -1;
      if (bAssigned && !bScouted && !(aAssigned && !aScouted)) return 1;
      // Then assigned scouted
      if (aAssigned && !bAssigned) return -1;
      if (bAssigned && !aAssigned) return 1;
      // Then unscouted
      if (!aScouted && bScouted) return -1;
      if (aScouted && !bScouted) return 1;
      return a - b;
    });

    const filtered = sorted.filter(t => {
      if (!q) return true;
      const name = (this.getTeamName(t) || '').toLowerCase();
      return String(t).includes(q) || name.includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="team-picker-empty">No teams found</div>';
      return;
    }

    container.innerHTML = filtered.map(t => {
      const num = String(t);
      const name = this.getTeamName(t) || '';
      const isScouted = this.scoutedTeams.includes(num);
      const isAssigned = this.isSubAccount && this.assignedTeams.includes(num);
      const isSelected = num === currentVal;

      let badges = '';
      if (isScouted) badges += '<span class="tp-pill tp-pill-scouted">Scouted</span>';
      if (isAssigned) badges += '<span class="tp-pill tp-pill-assigned">Assigned</span>';

      return `
        <div class="team-picker-row${isSelected ? ' selected' : ''}" data-team="${num}">
          <span class="team-picker-row-number">${num}</span>
          <span class="team-picker-row-name">${this._escapeHtml(name)}</span>
          <span class="team-picker-row-badges">${badges}</span>
          <span class="team-picker-row-check">✓</span>
        </div>`;
    }).join('');
  }

  _selectTeamFromPicker(teamNumber) {
    const target = this._activePickerTarget;
    this.closeTeamPicker();

    if (target === 'scout') {
      this._setScoutTeam(teamNumber);
    } else {
      // Data tab
      const hidden = $('#mobileTeamSelect');
      if (hidden) hidden.value = teamNumber;
      const triggerBtn = $('#dataTeamPickerBtn');
      if (triggerBtn) {
        const textEl = triggerBtn.querySelector('.picker-trigger-text');
        if (textEl) {
          textEl.textContent = this.teamLabel(teamNumber);
          textEl.classList.remove('placeholder');
        }
        this._updatePickerTriggerBadges(triggerBtn, teamNumber);
      }
      this.loadTeamData(teamNumber);
    }
  }

  /** Programmatically set the scout team picker value, update trigger UI, and autofill */
  _setScoutTeam(teamNumber) {
    const hidden = $('#mobileScoutTeam');
    if (hidden) hidden.value = teamNumber;

    const triggerBtn = $('#scoutTeamPickerBtn');
    if (triggerBtn) {
      const textEl = triggerBtn.querySelector('.picker-trigger-text');
      if (textEl) {
        textEl.textContent = this.teamLabel(teamNumber);
        textEl.classList.remove('placeholder');
      }
      this._updatePickerTriggerBadges(triggerBtn, teamNumber);
    }

    this._scoutFormDirty = true;
    this.autofillMobileScoutForm(teamNumber);
  }

  _updatePickerTriggerBadges(triggerBtn, teamNumber) {
    // Remove old badges container
    const oldBadges = triggerBtn.querySelector('.picker-trigger-badges');
    if (oldBadges) oldBadges.remove();

    const num = String(teamNumber);
    const isScouted = this.scoutedTeams.includes(num);
    const isAssigned = this.isSubAccount && this.assignedTeams.includes(num);

    if (!isScouted && !isAssigned) return;

    const badgesEl = document.createElement('span');
    badgesEl.className = 'picker-trigger-badges';
    if (isScouted) {
      const dot = document.createElement('span');
      dot.className = 'tp-badge tp-badge-scouted';
      dot.title = 'Already scouted';
      badgesEl.appendChild(dot);
        }
    if (isAssigned) {
      const dot = document.createElement('span');
      dot.className = 'tp-badge tp-badge-assigned';
      dot.title = 'Assigned to you';
      badgesEl.appendChild(dot);
    }
    // Insert before chevron
    const chevron = triggerBtn.querySelector('.picker-trigger-chevron');
    if (chevron) {
      triggerBtn.insertBefore(badgesEl, chevron);
    } else {
      triggerBtn.appendChild(badgesEl);
    }
  }
  
  loadScreenData(screen) {
    switch (screen) {
      case 'account':
        this.loadOtp();
        break;
      case 'rankings':
        this.renderRankings();
        break;
      case 'matches':
        this.renderMatches();
        break;
      case 'team':
        this.loadTeamMembers();
        break;
    }
  }
  
  renderRankings() {
    const container = $('#mobileRankingsList');
    if (!container) return;
    
    if (this.rankings.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" data-icon="rankings" data-icon-size="48"></div>
          <div class="empty-state-title">No Rankings</div>
          <div class="empty-state-text">Rankings will appear when data is available</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    // Build quick lookups for OPR and SoS
    const oprMap = {};
    this.oprData.forEach(o => { oprMap[o.teamNumber] = o; });
    const sosMap = {};
    this.sosData.forEach(s => { sosMap[s.teamNumber] = s; });
    const hasAdvanced = this.oprData.length > 0;
    
    container.innerHTML = this.rankings.map(team => {
      const isMyTeam = team.teamNumber.toString() === this.teamNumber;
      const opr = oprMap[team.teamNumber];
      const sos = sosMap[team.teamNumber];
      
      // Build stats pills
      let statsPills = '';
      if (hasAdvanced) {
        if (opr) {
          statsPills += `<span class="ranking-pill ranking-pill-opr">${opr.opr.toFixed(1)} OPR</span>`;
        }
        if (sos) {
          const sosClass = sos.sos > 2 ? 'sos-lucky' : sos.sos < -2 ? 'sos-unlucky' : 'sos-neutral';
          statsPills += `<span class="ranking-pill ${sosClass}">${sos.sos > 0 ? '+' : ''}${sos.sos.toFixed(1)} SoS</span>`;
        }
      }
      
      return `
      <div class="ranking-item" onclick="mobileApp.showTeamStats(${team.teamNumber})">
        <div class="ranking-position ${this.getRankClass(team.rank)}">${team.rank}</div>
        <div class="ranking-info">
          <div class="ranking-team ${isMyTeam ? 'text-primary' : ''}">
            <span class="ranking-team-num">${team.teamNumber}</span>${this.getTeamName(team.teamNumber) ? `<span class="ranking-team-name">· ${this.getTeamName(team.teamNumber)}</span>` : ''}
          </div>
          <div class="ranking-record">${team.wins}W - ${team.losses}L - ${team.ties}T · ${team.matchesPlayed} played</div>
          ${statsPills ? `<div class="ranking-pills">${statsPills}</div>` : ''}
        </div>
      </div>
    `}).join('');
  }
  
  // ===================== OPR & SoS Calculations =====================
  
  calculateOPR() {
    this.oprData = [];
    
    const completedMatches = this.matches.filter(m =>
      m.completed &&
      m.red?.score != null &&
      m.blue?.score != null &&
      m.red?.teams?.length > 0 &&
      m.blue?.teams?.length > 0
    );
    
    if (completedMatches.length < 3 || this.teams.length === 0) return;
    
    // Build team index mapping
    const teamIndex = {};
    this.teams.forEach((team, i) => { teamIndex[team] = i; });
    
    const n = this.teams.length;
    
    // Initialize matrices for least squares: (A^T * A) * x = A^T * b
    const ATA = Array(n).fill(0).map(() => Array(n).fill(0));
    const ATb = Array(n).fill(0);
    
    completedMatches.forEach(match => {
      const redTeams = match.red.teams.filter(t => teamIndex[t] !== undefined);
      const blueTeams = match.blue.teams.filter(t => teamIndex[t] !== undefined);
      
      if (redTeams.length === 0 || blueTeams.length === 0) return;
      
      const redScore = match.red.score;
      const blueScore = match.blue.score;
      
      // Red alliance equation
      redTeams.forEach(t1 => {
        const i1 = teamIndex[t1];
        ATb[i1] += redScore;
        redTeams.forEach(t2 => { ATA[i1][teamIndex[t2]] += 1; });
      });
      
      // Blue alliance equation
      blueTeams.forEach(t1 => {
        const i1 = teamIndex[t1];
        ATb[i1] += blueScore;
        blueTeams.forEach(t2 => { ATA[i1][teamIndex[t2]] += 1; });
      });
    });
    
    // Solve using Gauss-Seidel iteration
    const opr = Array(n).fill(0);
    const totalScores = completedMatches.reduce((sum, m) => sum + m.red.score + m.blue.score, 0);
    const avgScore = totalScores / (completedMatches.length * 2 * (completedMatches[0]?.red?.teams?.length || 2));
    opr.fill(avgScore);
    
    for (let iter = 0; iter < 100; iter++) {
      let maxChange = 0;
      for (let i = 0; i < n; i++) {
        if (ATA[i][i] === 0) continue;
        let sum = ATb[i];
        for (let j = 0; j < n; j++) {
          if (i !== j) sum -= ATA[i][j] * opr[j];
        }
        const newVal = sum / ATA[i][i];
        maxChange = Math.max(maxChange, Math.abs(newVal - opr[i]));
        opr[i] = newVal;
      }
      if (maxChange < 0.01) break;
    }
    
    this.teams.forEach((team, i) => {
      this.oprData.push({ teamNumber: team, opr: opr[i] || 0 });
    });
    
    this.oprData.sort((a, b) => b.opr - a.opr);
    this.oprData.forEach((team, i) => { team.rank = i + 1; });
  }
  
  calculateSoS() {
    this.sosData = [];
    if (this.oprData.length === 0) return;
    
    const oprLookup = {};
    this.oprData.forEach(t => { oprLookup[t.teamNumber] = t.opr; });
    
    this.teams.forEach(team => {
      let partnerOPRSum = 0;
      let opponentOPRSum = 0;
      let partnerCount = 0;
      let opponentCount = 0;
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
          redTeams.forEach(t => { if (t != team && oprLookup[t] !== undefined) { partnerOPRSum += oprLookup[t]; partnerCount++; } });
          blueTeams.forEach(t => { if (oprLookup[t] !== undefined) { opponentOPRSum += oprLookup[t]; opponentCount++; } });
        } else {
          blueTeams.forEach(t => { if (t != team && oprLookup[t] !== undefined) { partnerOPRSum += oprLookup[t]; partnerCount++; } });
          redTeams.forEach(t => { if (oprLookup[t] !== undefined) { opponentOPRSum += oprLookup[t]; opponentCount++; } });
        }
      });
      
      if (matchCount === 0) return;
      
      const avgPartnerOPR = partnerCount > 0 ? partnerOPRSum / partnerCount : 0;
      const avgOpponentOPR = opponentCount > 0 ? opponentOPRSum / opponentCount : 0;
      const sos = avgPartnerOPR - avgOpponentOPR;
      
      this.sosData.push({
        teamNumber: team,
        sos,
        avgPartnerOPR,
        avgOpponentOPR,
        matchCount
      });
    });
    
    this.sosData.sort((a, b) => b.sos - a.sos);
    this.sosData.forEach((team, i) => { team.rank = i + 1; });
  }
  
  renderMatches() {
    const container = $('#mobileMatchList');
    if (!container) return;
    
    if (this.matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" data-icon="matches" data-icon-size="48"></div>
          <div class="empty-state-title">No Matches</div>
          <div class="empty-state-text">Match schedule will appear when data is available</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    const myTeam = parseInt(this.teamNumber);
    let matches = [...this.matches];
    
    // Apply filter
    if (this.matchFilter === 'my-team') {
      matches = matches.filter(m =>
        m.red.teams.includes(myTeam) || m.blue.teams.includes(myTeam)
      );
    } else if (this.matchFilter === 'upcoming') {
      matches = matches.filter(m => !m.completed);
    }
    
    // Sort: upcoming first (by match number asc), then completed (by match number desc)
    matches.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.matchNumber - b.matchNumber;
    });
    
    if (matches.length === 0) {
      const msg = this.matchFilter === 'my-team'
        ? `No matches found for Team ${this.teamNumber}`
        : 'No matches match the current filter';
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" data-icon="matches" data-icon-size="48"></div>
          <div class="empty-state-title">No Matches</div>
          <div class="empty-state-text">${msg}</div>
        </div>
      `;
      initIcons();
      return;
    }
    
    // Compute WLT summary for my team
    const myMatches = this.matches.filter(m =>
      m.completed && (m.red.teams.includes(myTeam) || m.blue.teams.includes(myTeam))
    );
    let wins = 0, losses = 0, ties = 0;
    myMatches.forEach(m => {
      const isRed = m.red.teams.includes(myTeam);
      const myScore = isRed ? m.red.score : m.blue.score;
      const oppScore = isRed ? m.blue.score : m.red.score;
      if (myScore > oppScore) wins++;
      else if (myScore < oppScore) losses++;
      else ties++;
    });
    
    let html = '';
    
    // Summary chips
    if (this.matchFilter === 'my-team' && myMatches.length > 0) {
      html += `
        <div class="match-summary-bar">
          <div class="match-summary-chip wins">
            <span class="chip-count">${wins}</span> W
          </div>
          <div class="match-summary-chip losses">
            <span class="chip-count">${losses}</span> L
          </div>
          <div class="match-summary-chip">
            <span class="chip-count">${ties}</span> T
          </div>
          <div class="match-summary-chip">
            <span class="chip-count">${myMatches.length}</span> Played
          </div>
        </div>
      `;
    }
    
    // Group matches
    const upcoming = matches.filter(m => !m.completed);
    const completed = matches.filter(m => m.completed);
    
    if (upcoming.length > 0) {
      html += `<div class="match-list-section-label">Upcoming (${upcoming.length})</div>`;
      html += upcoming.map(m => this._renderMatchCard(m, myTeam)).join('');
    }
    
    if (completed.length > 0) {
      html += `<div class="match-list-section-label">Completed (${completed.length})</div>`;
      // Show most recent completed first
      html += completed.reverse().map(m => this._renderMatchCard(m, myTeam)).join('');
    }
    
    container.innerHTML = html;
    initIcons();
    
    // Wire up tap actions on match cards → open match scouting sheet
    container.querySelectorAll('.m-match-card').forEach(card => {
      card.addEventListener('click', () => {
        const matchDesc = card.querySelector('.m-match-label')?.textContent;
        if (matchDesc) this.openMatchScoutSheet(matchDesc);
      });
    });
  }
  
  _renderMatchCard(match, myTeam) {
    const isMyMatch = match.red.teams.includes(myTeam) || match.blue.teams.includes(myTeam);
    const isCompleted = match.completed;
    
    // Determine winner
    let redWin = false, blueWin = false;
    if (isCompleted && match.red.score !== null && match.blue.score !== null) {
      redWin = match.red.score > match.blue.score;
      blueWin = match.blue.score > match.red.score;
    }
    
    // For my-team filter, figure out result
    let resultClass = '';
    if (isMyMatch && isCompleted) {
      const isRed = match.red.teams.includes(myTeam);
      const myScore = isRed ? match.red.score : match.blue.score;
      const oppScore = isRed ? match.blue.score : match.red.score;
      if (myScore > oppScore) resultClass = 'my-win';
      else if (myScore < oppScore) resultClass = 'my-loss';
      else resultClass = 'my-tie';
    }
    
    // Focus team for click (prefer my team, otherwise red team 1)
    const focusTeam = isMyMatch ? myTeam : (match.red.teams[0] || match.blue.teams[0] || 0);
    
    const status = isCompleted ? 'completed' : 'upcoming';
    
    const renderTeamTags = (teams, alliance) => {
      return teams.map(t => {
        let cls = 'm-match-team-tag';
        if (t === myTeam) cls += ' highlight';
        return `<span class="${cls}">${t}</span>`;
      }).join('');
    };
    
    return `
      <div class="m-match-card ${isMyMatch ? 'my-match' : ''} ${!isCompleted ? 'upcoming' : ''} ${resultClass}" data-focus-team="${focusTeam}">
        <div class="m-match-top">
          <span class="m-match-label">${match.description || `Match ${match.matchNumber}`}</span>
          <span class="m-match-status ${status}">${isCompleted ? 'Final' : 'Upcoming'}</span>
        </div>
        <div class="m-match-body">
          <div class="m-match-alliance red">
            <div class="m-match-score ${redWin ? 'winner' : ''} ${!isCompleted ? 'pending' : ''}">
              ${isCompleted ? (match.red.score ?? '—') : '—'}
            </div>
            <div class="m-match-teams">
              ${renderTeamTags(match.red.teams, 'red')}
            </div>
          </div>
          <div class="m-match-vs">VS</div>
          <div class="m-match-alliance blue">
            <div class="m-match-score ${blueWin ? 'winner' : ''} ${!isCompleted ? 'pending' : ''}">
              ${isCompleted ? (match.blue.score ?? '—') : '—'}
            </div>
            <div class="m-match-teams">
              ${renderTeamTags(match.blue.teams, 'blue')}
            </div>
          </div>
        </div>
        ${isCompleted && match.red.auto !== null ? `
          <div class="m-match-breakdown">
            <div class="m-match-stat">
              <div class="m-match-stat-values">
                <span class="red-val">${match.red.auto ?? '—'}</span>
                <span>·</span>
                <span class="blue-val">${match.blue.auto ?? '—'}</span>
              </div>
              <div class="m-match-stat-label">Auto</div>
            </div>
            <div class="m-match-stat">
              <div class="m-match-stat-values">
                <span class="red-val">${match.red.score !== null ? (match.red.score - (match.red.auto || 0) - (match.red.foul || 0)) : '—'}</span>
                <span>·</span>
                <span class="blue-val">${match.blue.score !== null ? (match.blue.score - (match.blue.auto || 0) - (match.blue.foul || 0)) : '—'}</span>
              </div>
              <div class="m-match-stat-label">Teleop</div>
            </div>
            <div class="m-match-stat">
              <div class="m-match-stat-values">
                <span class="red-val">${match.red.foul ?? '—'}</span>
                <span>·</span>
                <span class="blue-val">${match.blue.foul ?? '—'}</span>
              </div>
              <div class="m-match-stat-label">Foul</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  // ===================== Match Scouting Sheet =====================
  
  async openMatchScoutSheet(matchDescription) {
    const match = this.matches.find(m => (m.description || `Match ${m.matchNumber}`) === matchDescription);
    if (!match) return;
    
    // Update header
    const titleEl = $('#matchScoutTitle');
    const subtitleEl = $('#matchScoutSubtitle');
    if (titleEl) titleEl.textContent = matchDescription;
    
    const resultText = match.completed
      ? (match.red.score > match.blue.score ? 'Red Wins' : match.red.score < match.blue.score ? 'Blue Wins' : 'Tie')
      : 'Upcoming';
    if (subtitleEl) subtitleEl.textContent = resultText;
    
    // Build alliance summary
    const myTeam = parseInt(this.teamNumber);
    const alliancesEl = $('#matchScoutAlliances');
    if (alliancesEl) {
      const renderTeams = (teams) => teams.map(t => 
        `<span class="${t === myTeam ? 'highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`
      ).join(' ');
      
      alliancesEl.innerHTML = `
        <div class="match-scout-alliance">
          <span class="match-scout-alliance-label red">Red</span>
          <span class="match-scout-alliance-score red">${match.completed ? (match.red.score ?? '—') : '—'}</span>
          <div class="match-scout-alliance-teams">${renderTeams(match.red.teams)}</div>
        </div>
        <span class="match-scout-vs">VS</span>
        <div class="match-scout-alliance">
          <span class="match-scout-alliance-label blue">Blue</span>
          <span class="match-scout-alliance-score blue">${match.completed ? (match.blue.score ?? '—') : '—'}</span>
          <div class="match-scout-alliance-teams">${renderTeams(match.blue.teams)}</div>
        </div>
      `;
    }
    
    // Show sheet immediately with loading state
    const teamsEl = $('#matchScoutTeams');
    if (teamsEl) {
      teamsEl.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="mobile-loading-spinner" style="width: 24px; height: 24px; margin: 0 auto var(--space-md);"></div>
          <div class="empty-state-text">Loading notes...</div>
        </div>
      `;
    }
    
    this._showMatchScoutSheet();
    
    // Load existing notes for this match
    let existingNotes = { private_notes: [], public_notes: [] };
    try {
      existingNotes = await api.getMatchNotes(this.currentEvent, { match: matchDescription });
    } catch (e) {
      console.warn('Could not load match notes:', e);
    }
    
    // Build team note cards
    const allTeams = [
      ...match.red.teams.map(t => ({ number: t, alliance: 'red' })),
      ...match.blue.teams.map(t => ({ number: t, alliance: 'blue' })),
    ];
    
    const teamCards = allTeams.map(team => {
      const rankData = this.rankings.find(r => r.teamNumber === team.number);
      const rankStr = rankData ? `#${rankData.rank} · ${rankData.wins}W ${rankData.losses}L` : 'Unranked';
      const isYourTeam = team.number.toString() === this.teamNumber;
      
      const privateNote = (existingNotes.private_notes || []).find(n => parseInt(n.team_number) === team.number) || null;
      const publicNoteOwn = (existingNotes.public_notes || []).find(
        n => parseInt(n.team_number) === team.number && n.scouting_team === this.teamNumber
      ) || null;
      const otherPublicNotes = (existingNotes.public_notes || []).filter(
        n => parseInt(n.team_number) === team.number && n.scouting_team !== this.teamNumber
      );
      
      return `
        <div class="ms-team-card">
          <div class="ms-team-card-header ${team.alliance}">
            <div class="ms-team-card-name">
              Team ${team.number}${this.getTeamName(team.number) ? ' · ' + this.getTeamName(team.number) : ''}
              ${isYourTeam ? '<span class="ms-team-you-badge">YOU</span>' : ''}
            </div>
            <span class="ms-team-card-rank">${rankStr}</span>
          </div>
          <div class="ms-team-card-body">
            <div class="ms-note-area">
              <div class="ms-note-label">Public Notes</div>
              <textarea class="ms-note-input" 
                data-match="${matchDescription}" 
                data-team="${team.number}" 
                data-private="0"
                placeholder="Notes visible to your team..."
                rows="2">${publicNoteOwn?.notes || ''}</textarea>
            </div>
            <div class="ms-note-area">
              <div class="ms-note-label">Private Notes</div>
              <textarea class="ms-note-input" 
                data-match="${matchDescription}" 
                data-team="${team.number}" 
                data-private="1"
                placeholder="Only visible to you..."
                rows="2">${privateNote?.notes || ''}</textarea>
            </div>
            ${otherPublicNotes.length > 0 ? `
              <div class="ms-other-notes">
                <div class="ms-other-notes-title">Notes from other scouts</div>
                ${otherPublicNotes.map(n => `
                  <div style="margin-top: 4px;"><strong>Team ${n.scouting_team}:</strong> ${n.notes}</div>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="ms-save-row">
            <button class="ms-save-btn" onclick="mobileApp.saveMatchTeamNotes('${matchDescription}', '${team.number}', this)">Save</button>
          </div>
        </div>
      `;
    }).join('');
    
    if (teamsEl) teamsEl.innerHTML = teamCards;
  }
  
  async saveMatchTeamNotes(matchDescription, teamNumber, btnEl) {
    const publicTextarea = document.querySelector(`.ms-note-input[data-match="${matchDescription}"][data-team="${teamNumber}"][data-private="0"]`);
    const privateTextarea = document.querySelector(`.ms-note-input[data-match="${matchDescription}"][data-team="${teamNumber}"][data-private="1"]`);
    
    try {
      const promises = [];
      
      if (publicTextarea && publicTextarea.value.trim()) {
        promises.push(api.saveMatchNote(this.currentEvent, matchDescription, teamNumber, publicTextarea.value, false));
      }
      if (privateTextarea && privateTextarea.value.trim()) {
        promises.push(api.saveMatchNote(this.currentEvent, matchDescription, teamNumber, privateTextarea.value, true));
      }
      
      if (promises.length === 0) {
        toast.info('Enter some notes first');
        return;
      }
      
      await Promise.all(promises);
      
      // Visual feedback
      if (btnEl) {
        btnEl.textContent = 'Saved ✓';
        btnEl.classList.add('saved');
        setTimeout(() => {
          btnEl.textContent = 'Save';
          btnEl.classList.remove('saved');
        }, 2000);
      }
      
      toast.success(`Notes saved for Team ${teamNumber}`);
    } catch (e) {
      console.error('Failed to save match notes:', e);
      toast.error('Failed to save notes');
    }
  }
  
  _showMatchScoutSheet() {
    $('#matchScoutSheet')?.classList.add('open');
    $('#matchScoutOverlay')?.classList.add('active');
    document.body.style.overflow = 'hidden';
    initIcons();
  }
  
  closeMatchScoutSheet() {
    const sheet = $('#matchScoutSheet');
    if (sheet) {
      sheet.classList.remove('open', 'dragging');
      sheet.style.transform = '';
    }
    $('#matchScoutOverlay')?.classList.remove('active');
    document.body.style.overflow = '';
  }

  _setupMatchScoutSheetDrag() {
    const sheet = $('#matchScoutSheet');
    const handle = $('#matchScoutDragHandle');
    const header = sheet?.querySelector('.match-scout-sheet-header');
    if (!sheet) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const onTouchStart = (e) => {
      // Only initiate drag if the sheet is scrolled to the top
      if (sheet.scrollTop > 5) return;
      startY = e.touches[0].clientY;
      currentY = 0;
      isDragging = true;
      sheet.classList.add('dragging');
    };

    const onTouchMove = (e) => {
      if (!isDragging) return;
      currentY = e.touches[0].clientY - startY;
      if (currentY < 0) currentY = 0; // Don't allow dragging up
      if (currentY > 0) {
        e.preventDefault(); // Prevent scrolling while dragging down
        sheet.style.transform = `translateY(${currentY}px)`;
        // Fade overlay proportionally
        const overlay = $('#matchScoutOverlay');
        if (overlay) {
          const progress = Math.min(currentY / 300, 1);
          overlay.style.opacity = 1 - progress;
        }
      }
    };

    const onTouchEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      sheet.classList.remove('dragging');
      sheet.style.transform = '';
      const overlay = $('#matchScoutOverlay');
      if (overlay) overlay.style.opacity = '';

      // If dragged more than 120px or 30% of sheet height, dismiss
      const threshold = Math.min(120, sheet.offsetHeight * 0.3);
      if (currentY > threshold) {
        this.closeMatchScoutSheet();
      }
    };

    // Attach to handle and header for easy grab area
    [handle, header].forEach(el => {
      if (!el) return;
      el.addEventListener('touchstart', onTouchStart, { passive: true });
    });

    // Move and end on sheet itself so dragging anywhere works after start
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd, { passive: true });
  }
  
  // ===================== Match Notes in Team Data View =====================
  
  async loadTeamMatchNotes(team, container) {
    const teamNum = parseInt(team);
    
    // Find all matches this team played in
    const teamMatches = this.matches.filter(m => 
      m.red.teams.includes(teamNum) || m.blue.teams.includes(teamNum)
    ).sort((a, b) => {
      const aNum = parseInt((a.description || '').match(/\d+/)?.[0] || a.matchNumber || 0);
      const bNum = parseInt((b.description || '').match(/\d+/)?.[0] || b.matchNumber || 0);
      return bNum - aNum;
    });
    
    if (teamMatches.length === 0) return;
    
    // Load notes for this team
    let allNotes = [];
    try {
      const matchNotesData = await api.getMatchNotes(this.currentEvent, { team: team.toString() });
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
    
    const totalNotes = allNotes.length;
    
    // Build the match notes section
    const matchItems = teamMatches.map(match => {
      const desc = match.description || `Match ${match.matchNumber}`;
      const isRed = match.red.teams.includes(teamNum);
      const hasScore = match.red.score != null && match.blue.score != null;
      const won = hasScore && ((isRed && match.red.score > match.blue.score) || (!isRed && match.blue.score > match.red.score));
      const lost = hasScore && !won && match.red.score !== match.blue.score;
      const notes = notesByMatch[desc] || [];
      const noteCount = notes.length;
      
      let resultBadge = '';
      let resultClass = '';
      if (hasScore) {
        if (won) { resultBadge = 'W'; resultClass = 'win'; }
        else if (lost) { resultBadge = 'L'; resultClass = 'loss'; }
        else { resultBadge = 'T'; resultClass = 'tie'; }
      }
      
      const yourPrivate = notes.filter(n => n.isPrivate && n.isYours);
      const yourPublic = notes.filter(n => !n.isPrivate && n.isYours);
      const othersPublic = notes.filter(n => !n.isPrivate && !n.isYours);
      
      const renderNotes = (notesList, label, cssClass) => {
        if (notesList.length === 0) return '';
        return `
          <div class="mn-note-group">
            <div class="mn-note-group-label ${cssClass}">${label}</div>
            ${notesList.map(n => `
              <div class="mn-note-entry">
                ${n.scouting_team && !n.isYours ? `<span class="mn-note-source">Team ${n.scouting_team}</span>` : ''}
                ${n.notes}
              </div>
            `).join('')}
          </div>
        `;
      };
      
      const allianceColor = isRed ? 'red' : 'blue';
      
      return `
        <div class="mn-item" onclick="this.classList.toggle('expanded')">
          <div class="mn-header">
            <span class="mn-alliance-bar ${allianceColor}"></span>
            <div class="mn-header-left">
              <span class="mn-match-name">${desc}</span>
              ${hasScore ? `
                <span class="mn-score">
                  <span class="mn-score-red">${match.red.score}</span>
                  <span class="mn-score-sep">-</span>
                  <span class="mn-score-blue">${match.blue.score}</span>
                </span>
              ` : '<span class="mn-upcoming">Upcoming</span>'}
            </div>
            <div class="mn-header-right">
              ${noteCount > 0 ? `<span class="mn-note-badge">${noteCount}</span>` : ''}
              ${resultBadge ? `<span class="mn-result ${resultClass}">${resultBadge}</span>` : ''}
              <span class="mn-chevron">›</span>
            </div>
          </div>
          <div class="mn-expand">
            <div class="mn-alliances">
              <div class="mn-alliance red">
                ${match.red.teams.map(t => `<span class="${t === teamNum ? 'mn-team-highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join(' ')}
              </div>
              <span class="mn-alliance-vs">vs</span>
              <div class="mn-alliance blue">
                ${match.blue.teams.map(t => `<span class="${t === teamNum ? 'mn-team-highlight' : ''}" title="${this.getTeamName(t)}">${t}</span>`).join(' ')}
              </div>
            </div>
            ${noteCount > 0 ? `
              <div class="mn-notes-body">
                ${renderNotes(yourPrivate, 'Your Private', 'private')}
                ${renderNotes(yourPublic, 'Your Public', 'public')}
                ${renderNotes(othersPublic, 'Other Teams', 'others')}
              </div>
            ` : `
              <div class="mn-no-notes">No notes for this match</div>
            `}
            <button class="mn-add-note-btn" onclick="event.stopPropagation(); mobileApp.openMatchScoutSheet('${desc}')">
              + Add Notes
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    container.insertAdjacentHTML('beforeend', `
      <div class="match-notes-section">
        <div class="match-notes-header">
          <div class="match-notes-title">Match Notes</div>
          ${totalNotes > 0 ? `<span class="match-notes-count">${totalNotes}</span>` : ''}
        </div>
        <div class="match-notes-list">
          ${matchItems}
        </div>
      </div>
    `);
  }
  
  showTeamStats(teamNumber) {
    const team = this.rankings.find(r => r.teamNumber === teamNumber);
    if (!team) return;
    
    // Populate popup
    $('#statsTeamTitle').textContent = `Team ${teamNumber}`;
    $('#statsTeamName').textContent = this.getTeamName(teamNumber) || team.teamName || '';
    $('#statsWins').textContent = team.wins;
    $('#statsTies').textContent = team.ties;
    $('#statsLosses').textContent = team.losses;
    $('#statsPlayed').textContent = `Matches Played: ${team.matchesPlayed}`;
    
    // Populate OPR & SoS advanced stats
    const oprEntry = this.oprData.find(o => o.teamNumber == teamNumber);
    const sosEntry = this.sosData.find(s => s.teamNumber == teamNumber);
    const advancedEl = $('#statsAdvanced');
    
    if (oprEntry || sosEntry) {
      if (advancedEl) advancedEl.style.display = '';
      
      if (oprEntry) {
        $('#statsOPR').textContent = oprEntry.opr.toFixed(1);
        $('#statsOPRRank').textContent = `#${oprEntry.rank} of ${this.oprData.length}`;
      } else {
        $('#statsOPR').textContent = '—';
        $('#statsOPRRank').textContent = '';
      }
      
      // Calculate average score per match
      const teamMatches = this.matches.filter(m => m.completed && (
        m.red.teams.includes(teamNumber) || m.blue.teams.includes(teamNumber) ||
        m.red.teams.includes(parseInt(teamNumber)) || m.blue.teams.includes(parseInt(teamNumber))
      ));
      if (teamMatches.length > 0) {
        const totalScore = teamMatches.reduce((sum, m) => {
          const isRed = m.red.teams.includes(teamNumber) || m.red.teams.includes(parseInt(teamNumber));
          return sum + (isRed ? m.red.score : m.blue.score);
        }, 0);
        $('#statsAvgScore').textContent = (totalScore / teamMatches.length).toFixed(1);
      } else {
        $('#statsAvgScore').textContent = '—';
      }
      
      if (sosEntry) {
        const sosVal = sosEntry.sos;
        const sosEl = $('#statsSoS');
        sosEl.textContent = `${sosVal > 0 ? '+' : ''}${sosVal.toFixed(1)}`;
        sosEl.className = 'stats-advanced-value ' + (sosVal > 2 ? 'sos-lucky' : sosVal < -2 ? 'sos-unlucky' : 'sos-neutral');
        const label = sosVal > 2 ? 'Easy' : sosVal < -2 ? 'Hard' : 'Fair';
        $('#statsSoSLabel').textContent = label;
      } else {
        $('#statsSoS').textContent = '—';
        $('#statsSoSLabel').textContent = '';
      }
    } else {
      if (advancedEl) advancedEl.style.display = 'none';
    }
    
    // Load match history
    this.loadMatchHistory(teamNumber);
    
    // Store current team for view data button
    this.statsTeamNumber = teamNumber;
    
    // Show popup
    $('#statsPopup').classList.add('active');
  }
  
  loadMatchHistory(teamNumber) {
    const container = $('#statsMatchList');
    
    // Filter matches for this team from already loaded matches
    const teamMatches = this.matches.filter(m => 
      m.red.teams.includes(teamNumber) || m.blue.teams.includes(teamNumber)
    ).filter(m => m.completed); // Only show completed matches
    
    // Sort by match number ascending (chronological)
    teamMatches.sort((a, b) => a.matchNumber - b.matchNumber);
    
    if (teamMatches.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl);">
          <div class="empty-state-title">No Matches</div>
          <div class="empty-state-text">No match history available</div>
        </div>
      `;
      return;
    }
    
    // Build scroll-snap match card UI (inspired by old WikiScout)
    container.innerHTML = `<div class="match-results-scroll">${teamMatches.map((match, index) => {
      const isRed = match.red.teams.includes(teamNumber);
      const teamAlliance = isRed ? 'red' : 'blue';
      const oppAlliance = isRed ? 'blue' : 'red';
      const teamScore = match[teamAlliance].score;
      const oppScore = match[oppAlliance].score;
      const result = teamScore > oppScore ? 'win' : (teamScore < oppScore ? 'loss' : 'tie');
      
      return `
        <div class="match-result-item ${result}" data-index="${index}">
          <div class="match-result-label">${match.description}</div>
          <div class="match-result-scores">
            <span class="${teamAlliance}-score">${teamScore ?? '-'}</span>
            <span class="match-result-dash">—</span>
            <span class="${oppAlliance}-score">${oppScore ?? '-'}</span>
          </div>
          <div class="match-result-details">
            <div class="match-result-value ${teamAlliance}-alliance">${match[teamAlliance].teams.join(' ')}</div>
            <div class="match-result-vs">VS</div>
            <div class="match-result-value ${oppAlliance}-alliance">${match[oppAlliance].teams.join(' ')}</div>
          </div>
          <div class="match-result-details">
            <div class="match-result-value">${match[teamAlliance].auto ?? '-'}</div>
            <div class="match-result-label-sm">Auto</div>
            <div class="match-result-value">${match[oppAlliance].auto ?? '-'}</div>
          </div>
          <div class="match-result-details">
            <div class="match-result-value">${match[teamAlliance].foul ?? '-'}</div>
            <div class="match-result-label-sm">Foul</div>
            <div class="match-result-value">${match[oppAlliance].foul ?? '-'}</div>
          </div>
        </div>
      `;
    }).join('')}</div>`;
    
    // Add click-to-snap behaviour
    container.querySelectorAll('.match-result-item').forEach(item => {
      item.addEventListener('click', () => {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }
  
  closeStatsPopup() {
    $('#statsPopup').classList.remove('active');
  }
  
  viewTeamDataFromStats() {
    this.closeStatsPopup();
    this.loadTeamData(this.statsTeamNumber);
  }
  
  getRankClass(rank) {
    if (rank === 1) return 'first';
    if (rank === 2) return 'second';
    if (rank === 3) return 'third';
    return 'default';
  }
  
  async loadTeamData(team) {
    const container = $('#mobileTeamData');
    if (!container) return;
    
    // Update select
    $('#mobileTeamSelect').value = team;
    
    // Navigate to data screen if not there
    if (this.currentScreen !== 'data') {
      this.navigateTo('data');
    }
    
    // Show loading state
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" data-icon="refresh" data-icon-size="48"></div>
        <div class="empty-state-title">Loading...</div>
      </div>
    `;
    initIcons();
    
    try {
      const data = await api.getScoutingData(team, this.currentEvent);
      
      if (!data.private_data?.data?.length && !data.public_data?.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon" data-icon="data" data-icon-size="48"></div>
            <div class="empty-state-title">No Data</div>
            <div class="empty-state-text">No scouting data for Team ${team}</div>
          </div>
        `;
        initIcons();
        return;
      }
      
      // Find team rank
      const teamRank = this.rankings.find(r => r.teamNumber === parseInt(team));
      
      let html = '';
      
      // Team header
      html += `
        <div class="team-view-header">
          <div class="team-view-number">${team}</div>
          <div class="team-view-info">
            <h2>Team ${team}${this.getTeamName(team) ? ' · ' + this.getTeamName(team) : ''}</h2>
            <div class="team-view-badges">
              <span class="badge badge-secondary">#${teamRank?.rank || 'N/A'}</span>
              <span class="badge badge-primary">${teamRank ? `${teamRank.wins}W` : 'N/A'}</span>
            </div>
          </div>
          <div class="team-view-actions">
            <button class="btn btn-ghost btn-sm" onclick="mobileApp.showTeamStats(${team})">
              <span data-icon="history" data-icon-size="16"></span>
            </button>
          </div>
        </div>
      `;
      
      // Pre-fetch custom field responses (private to this team)
      let customFieldRows = '';
      try {
        const cqData = await api.getCustomResponses(team, this.currentEvent);
        if (cqData?.questions && cqData.questions.length > 0) {
          customFieldRows = cqData.questions.map(q => {
            let displayValue = q.value ?? '-';
            if (q.field_type === 'boolean') {
              if (q.value === 'true') displayValue = 'Yes';
              else if (q.value === 'false') displayValue = 'No';
              else displayValue = '-';
            } else if ((q.field_type === 'number' || q.field_type === 'slider') && (q.value === null || q.value === '')) {
              displayValue = '-';
            } else if (!q.value) { displayValue = '-'; }
            return `
              <div class="data-row">
                <span class="data-row-label">${q.label}</span>
                <span class="data-row-value ${this.formatValue(displayValue).isCheck ? 'check' : ''}">${this.formatValue(displayValue).display}</span>
              </div>
            `;
          }).join('');
        }
      } catch (e) {
        console.warn('Failed to load custom responses:', e);
      }
      
      const customFieldsSection = customFieldRows ? `
        <div style="border-top: 1px solid var(--border-color, rgba(255,255,255,0.1)); margin-top: 8px; padding-top: 8px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            Custom Fields <span class="badge badge-primary" style="font-size: 9px; padding: 1px 6px;">Private</span>
          </div>
          ${customFieldRows}
        </div>
      ` : '';
      
      // Your data - highlighted section
      if (data.private_data?.data?.length) {
        html += `
          <div class="data-section my-data">
            <div class="data-section-header">
              <span class="data-section-title">Scouting Data</span>
            </div>
            <div class="data-section-body">
              ${data.fields.map((field, i) => `
                <div class="data-row">
                  <span class="data-row-label">${field}</span>
                  <span class="data-row-value ${this.formatValue(data.private_data.data[i]).isCheck ? 'check' : ''}">
                    ${this.formatValue(data.private_data.data[i]).display}
                  </span>
                </div>
              `).join('')}
              ${customFieldsSection}
            </div>
          </div>
        `;
      } else if (customFieldRows) {
        // No standard data but has custom fields — show them in a card
        html += `
          <div class="data-section my-data">
            <div class="data-section-header">
              <span class="data-section-title">Scouting Data</span>
            </div>
            <div class="data-section-body">
              <div style="padding: 8px 0; color: var(--text-muted); font-size: 13px;">No standard fields submitted</div>
              ${customFieldsSection}
            </div>
          </div>
        `;
      }
      
      // Divider between your data and other data
      if ((data.private_data?.data?.length || customFieldRows) && data.public_data?.length) {
        html += `<div class="data-divider">Other Teams' Data</div>`;
      }
      
      // Other data - less prominent
      if (data.public_data?.length) {
        data.public_data.forEach(entry => {
          html += `
            <div class="data-section other-data">
              <div class="data-section-header">
                <span class="data-section-title">Scouted by Team ${entry.scouting_team}</span>
              </div>
              <div class="data-section-body">
                ${data.fields.map((field, i) => `
                  <div class="data-row">
                    <span class="data-row-label">${field}</span>
                    <span class="data-row-value">${this.formatValue(entry.data[i]).display}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        });
      }
      
      container.innerHTML = html;
      
      // Also load match notes for this team
      this.loadTeamMatchNotes(team, container);
      
    } catch (error) {
      toast.error('Failed to load team data');
      console.error(error);
    }
  }
  
  formatValue(value) {
    if (value === true || value === 'true') {
      return { display: 'Yes', isCheck: true };
    }
    if (value === false || value === 'false') {
      return { display: 'No', isCheck: false };
    }
    return { display: value || '-', isCheck: false };
  }
  
  renderScoutForm() {
    const container = $('#mobileFormFields');
    if (!container) return;
    
    const formConfig = [
      { type: 'header', label: 'Tele-OP' },
      { type: 'checkbox', label: 'Mecanum Drive Train', id: 'mecanum' },
      { type: 'slider', label: 'Driver Practice', id: 'driverPractice', min: 0, max: 3, step: 1 },
      { type: 'number', label: 'Tele-OP Balls', id: 'teleOpBalls' },
      { type: 'options', label: 'Shooting Distance', id: 'shootingDist', options: ['Near', 'Far', 'Both'] },
      { type: 'header', label: 'Autonomous' },
      { type: 'number', label: 'Auto Balls', id: 'autoBalls' },
      { type: 'options', label: 'Auto Shooting', id: 'autoShooting', options: ['Near', 'Far', 'Both'] },
      { type: 'number', label: 'Auto Points', id: 'autoPoints' },
      { type: 'checkbox', label: 'Leave', id: 'autoLeave' },
      { type: 'text', label: 'Auto Details', id: 'autoDetails', big: true, description: 'Describe their autonomous routines' },
      { type: 'text', label: 'Private Notes', id: 'privateNotes', big: true, description: 'Only your team can see this' }
    ];
    
    let currentSection = null;
    let sectionFields = [];
    let html = '';
    
    formConfig.forEach((field, index) => {
      if (field.type === 'header') {
        // Close previous section
        if (currentSection && sectionFields.length) {
          html += `
            <div class="scout-form-section">
              <div class="scout-form-header">${currentSection}</div>
              <div class="scout-form-fields">${sectionFields.join('')}</div>
            </div>
          `;
        }
        currentSection = field.label;
        sectionFields = [];
        return;
      }
      
      let input = '';
      
      switch (field.type) {
        case 'checkbox':
          input = `
            <div class="scout-field">
              <div class="scout-field-row">
                <label class="scout-field-label">${field.label}</label>
                <input type="checkbox" class="checkbox" name="${field.id}" id="m${field.id}">
              </div>
            </div>
          `;
          break;
          
        case 'slider':
          input = `
            <div class="scout-field">
              <label class="scout-field-label">${field.label}</label>
              <div class="slider-wrapper">
                <input type="range" class="slider" name="${field.id}" id="m${field.id}" 
                       min="${field.min}" max="${field.max}" step="${field.step}" value="${field.min}"
                       oninput="document.getElementById('m${field.id}Value').textContent = this.value">
                <span class="slider-value" id="m${field.id}Value">${field.min}</span>
              </div>
            </div>
          `;
          break;
          
        case 'number':
          input = `
            <div class="scout-field">
              <label class="scout-field-label">${field.label}</label>
              <input type="number" class="form-input" name="${field.id}" id="m${field.id}" min="0" inputmode="numeric">
            </div>
          `;
          break;
          
        case 'options':
          input = `
            <div class="scout-field">
              <label class="scout-field-label">${field.label}</label>
              <select class="form-input form-select" name="${field.id}" id="m${field.id}">
                <option value="">Select...</option>
                ${field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
              </select>
            </div>
          `;
          break;
          
        case 'text':
          input = `
            <div class="scout-field">
              <label class="scout-field-label">${field.label}</label>
              ${field.description ? `<span class="scout-field-hint">${field.description}</span>` : ''}
              <textarea class="form-input form-textarea" name="${field.id}" id="m${field.id}" 
                        rows="${field.big ? 3 : 2}"></textarea>
            </div>
          `;
          break;
      }
      
      sectionFields.push(input);
    });
    
    // Close last section
    if (currentSection && sectionFields.length) {
      html += `
        <div class="scout-form-section">
          <div class="scout-form-header">${currentSection}</div>
          <div class="scout-form-fields">${sectionFields.join('')}</div>
        </div>
      `;
    }
    
    container.innerHTML = html;
    
    // Render custom fields after the standard form
    this.renderMobileCustomFields();
  }
  
  async autofillMobileScoutForm(teamNumber) {
    if (!teamNumber || !this.currentEvent) return;
    try {
      const [data, customResponses] = await Promise.all([
        api.getScoutingData(teamNumber, this.currentEvent).catch(() => null),
        api.getCustomResponses(teamNumber, this.currentEvent).catch(() => null),
      ]);

      // Fill standard fields
      if (data && data.private_data && data.private_data.data) {
        const formData = data.private_data.data;
        const fields = ['mecanum', 'driverPractice', 'teleOpBalls', 'shootingDist',
                        'autoBalls', 'autoShooting', 'autoPoints', 'autoLeave',
                        'autoDetails', 'privateNotes'];
        fields.forEach((fieldId, i) => {
          const el = $(`#m${fieldId}`);
          if (el && formData[i] !== undefined) {
            if (el.type === 'checkbox') {
              el.checked = (formData[i] === true || formData[i] === 'true');
            } else if (el.type === 'range') {
              el.value = formData[i];
              const valSpan = $(`#m${fieldId}Value`);
              if (valSpan) valSpan.textContent = formData[i];
            } else {
              el.value = formData[i];
            }
          }
        });
      }

      // Fill custom fields
      if (customResponses && customResponses.questions) {
        customResponses.questions.forEach(q => {
          const el = $(`#mcq_${q.id}`);
          if (el && q.value !== null) {
            if (q.field_type === 'boolean') {
              el.checked = (q.value === 'true');
            } else if (el.type === 'range') {
              el.value = q.value;
              const valSpan = $(`#mcq_${q.id}Value`);
              if (valSpan) valSpan.textContent = q.value;
            } else {
              el.value = q.value;
            }
          }
        });
      }
    } catch (e) {
      console.warn('Mobile autofill failed:', e);
    }
  }
  
  async handleScoutSubmit(e) {
    e.preventDefault();
    
    // Prevent double-submit
    if (this._scoutSubmitting) return;
    
    const team = $('#mobileScoutTeam').value;
    if (!team || !this.currentEvent) {
      toast.error('Select a team first');
      return;
    }
    
    const submitBtn = $('#mobileScoutSubmitBtn');
    const submitText = submitBtn?.querySelector('.scout-submit-text');
    const submitLoading = submitBtn?.querySelector('.scout-submit-loading');
    
    // Show loading state
    this._scoutSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.style.display = 'none';
    if (submitLoading) submitLoading.style.display = 'inline-flex';
    
    const fields = ['mecanum', 'driverPractice', 'teleOpBalls', 'shootingDist',
                   'autoBalls', 'autoShooting', 'autoPoints', 'autoLeave',
                   'autoDetails', 'privateNotes'];
    
    const formData = fields.map(field => {
      const el = $(`#m${field}`);
      if (el) {
        return el.type === 'checkbox' ? el.checked : (el.value || '');
      }
      return '';
    });
    
    // Collect custom field values before any reset
    const customResponses = this.getMobileCustomFieldValues();
    
    // Build the entry with a timestamp for ordering
    const entry = {
      team,
      event: this.currentEvent,
      formData,
      customResponses,
      timestamp: Date.now(),
    };
    
    // Retry logic for reliability (quick retries)
    const MAX_RETRIES = 2;
    let saved = false;
    let lastError = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES && !saved; attempt++) {
    try {
      await api.addScoutingData(team, this.currentEvent, formData);
        saved = true;
      } catch (error) {
        lastError = error;
        console.error(`Scout data save attempt ${attempt + 1} failed:`, error);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }
    
    if (saved) {
      // Also save custom responses
      if (customResponses.length > 0) {
        try {
          await api.saveCustomResponses(team, this.currentEvent, customResponses);
        } catch (err) {
          // Queue custom responses for retry
          this._queueOfflineEntry({ ...entry, type: 'custom_only' });
          console.error('Custom responses queued for retry:', err);
        }
      }
      toast.success(`Data saved for Team ${team}!`);
      // Add to scouted teams list so the picker updates
      if (!this.scoutedTeams.includes(String(team))) {
        this.scoutedTeams.push(String(team));
      }
    } else {
      // Queue the full entry for background retry
      this._queueOfflineEntry({ ...entry, type: 'full' });
      toast.warning(`Saved offline — will auto-sync for Team ${team}`);
      console.error('All immediate attempts failed, queued for retry:', lastError);
    }
    
    // Always reset the form so the user can keep scouting
      e.target.reset();
    // Reset the hidden input and trigger button for team picker
    const hiddenTeam = $('#mobileScoutTeam');
    if (hiddenTeam) hiddenTeam.value = '';
    const scoutTrigger = $('#scoutTeamPickerBtn');
    if (scoutTrigger) {
      const trigText = scoutTrigger.querySelector('.picker-trigger-text');
      if (trigText) { trigText.textContent = 'Select Team'; trigText.classList.add('placeholder'); }
      const oldBadges = scoutTrigger.querySelector('.picker-trigger-badges');
      if (oldBadges) oldBadges.remove();
    }
      $$('.slider-value').forEach(el => el.textContent = '0');
    this._scoutFormDirty = false;
    this.renderMobileCustomFields();
    
    // Restore button state
    this._scoutSubmitting = false;
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.style.display = '';
    if (submitLoading) submitLoading.style.display = 'none';
  }

  // ===================== Offline Save Queue =====================

  _getOfflineQueue() {
    try {
      return JSON.parse(localStorage.getItem('wikiscout_offline_queue') || '[]');
    } catch {
      return [];
    }
  }

  _saveOfflineQueue(queue) {
    try {
      localStorage.setItem('wikiscout_offline_queue', JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to write offline queue to localStorage:', e);
    }
  }

  _queueOfflineEntry(entry) {
    const queue = this._getOfflineQueue();
    
    // Deduplicate: if there's already a queued entry for the same team+event,
    // only keep the newer one (higher timestamp)
    const existingIdx = queue.findIndex(
      q => q.team === entry.team && q.event === entry.event && q.type === entry.type
    );
    if (existingIdx !== -1) {
      if (queue[existingIdx].timestamp >= entry.timestamp) {
        // Existing entry is newer or same — don't overwrite
        return;
      }
      queue.splice(existingIdx, 1);
    }
    
    queue.push(entry);
    this._saveOfflineQueue(queue);
    this._updateOfflineQueueBadge();
  }

  _updateOfflineQueueBadge() {
    const queue = this._getOfflineQueue();
    let badge = $('#offlineQueueBadge');
    if (queue.length > 0) {
      if (!badge) {
        // Create a small floating badge to show pending items
        badge = document.createElement('div');
        badge.id = 'offlineQueueBadge';
        badge.style.cssText = `
          position: fixed; top: 8px; right: 8px; z-index: 9999;
          background: var(--warning, #f59e0b); color: #000;
          font-size: 11px; font-weight: 700;
          padding: 4px 10px; border-radius: 999px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          pointer-events: none;
        `;
        document.body.appendChild(badge);
      }
      badge.textContent = `${queue.length} pending`;
      badge.style.display = '';
    } else if (badge) {
      badge.style.display = 'none';
    }
  }

  _startOfflineQueueProcessor() {
    // Process immediately on start, then every 10 seconds
    this._processOfflineQueue();
    this._offlineQueueTimer = setInterval(() => this._processOfflineQueue(), 10000);
    
    // Also process when coming back online
    window.addEventListener('online', () => {
      console.log('[OfflineQueue] Network restored, processing queue...');
      this._processOfflineQueue();
    });
    
    // Show badge on load if there are pending items
    this._updateOfflineQueueBadge();
  }

  async _processOfflineQueue() {
    if (this._offlineQueueProcessing) return;
    
    const queue = this._getOfflineQueue();
    if (queue.length === 0) return;
    
    this._offlineQueueProcessing = true;
    
    // Sort by timestamp ascending — process oldest first
    queue.sort((a, b) => a.timestamp - b.timestamp);
    
    const remaining = [];
    
    for (const entry of queue) {
      // Before pushing, check if there's a more recent entry for the same team+event
      // already in the remaining queue (which would have been successfully saved already).
      // If so, skip the older one.
      const hasNewerInQueue = queue.some(
        q => q !== entry && q.team === entry.team && q.event === entry.event
             && q.type === entry.type && q.timestamp > entry.timestamp
      );
      if (hasNewerInQueue) {
        console.log(`[OfflineQueue] Skipping stale entry for Team ${entry.team} (newer version exists)`);
        continue; // Drop this older entry
      }
      
      try {
        if (entry.type === 'full') {
          await api.addScoutingData(entry.team, entry.event, entry.formData);
          // Also push custom responses if any
          if (entry.customResponses && entry.customResponses.length > 0) {
            await api.saveCustomResponses(entry.team, entry.event, entry.customResponses).catch(() => {});
          }
        } else if (entry.type === 'custom_only') {
          await api.saveCustomResponses(entry.team, entry.event, entry.customResponses);
        }
        
        // Success!
        toast.success(`Data saved for Team ${entry.team}`);
        console.log(`[OfflineQueue] Successfully synced entry for Team ${entry.team}`);
      } catch (e) {
        console.warn(`[OfflineQueue] Retry failed for Team ${entry.team}:`, e);
        remaining.push(entry); // Keep for next attempt
      }
    }
    
    this._saveOfflineQueue(remaining);
    this._updateOfflineQueueBadge();
    this._offlineQueueProcessing = false;
  }
  
  async loadOtp() {
    try {
      const data = await api.getOtp();
      this.displayOtp(data.code || '------');
    } catch (error) {
      console.error('Failed to load OTP:', error);
      this.displayOtp('------');
    }
  }
  
  displayOtp(code) {
    const container = $('#mobileOtpDigits');
    if (!container) return;
    
    // Ensure code is 6 digits
    const digits = (code || '------').slice(0, 6).split('');
    const digitElements = container.querySelectorAll('.otp-digit');
    
    // Fill all 6 digit boxes (querySelectorAll only gets .otp-digit elements, not the dash)
    digits.forEach((digit, i) => {
      if (digitElements[i]) {
        digitElements[i].textContent = digit || '-';
        digitElements[i].classList.toggle('filled', digit && digit !== '-');
      }
    });
  }
  
  async regenerateOtp() {
    try {
      const data = await api.generateOtp();
      this.displayOtp(data.code);
      toast.success('New code generated');
    } catch (error) {
      toast.error('Failed to generate');
    }
  }
  
  async deleteOtp() {
    try {
      await api.deleteOtp();
      this.displayOtp('------');
      toast.success('Code deleted');
    } catch (error) {
      toast.error('Failed to delete');
    }
  }
  
  openOtpSheet() {
    $('#otpSheet')?.classList.add('open');
    $('#otpSheetOverlay')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  
  closeOtpSheet() {
    $('#otpSheet')?.classList.remove('open');
    $('#otpSheetOverlay')?.classList.remove('active');
    document.body.style.overflow = '';
  }
  
  async logout() {
    try {
      await api.logout();
    } catch (e) {}
    storage.clear();
    window.location.href = 'index.html';
  }
  
  // ===================== Mobile Event Picker =====================
  
  openMobileEventPicker() {
    const modal = $('#mobileEventPickerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    
    this._mepSeason = this._getSeasonYear();
    this._mepFilter = 'today';
    this._mepAllEvents = [];
    this._mepSearchQuery = '';
    
    const input = $('#mobileEpSearchInput');
    if (input) input.value = '';
    
    this._populateMobileSeasonDropdown();
    
    document.querySelectorAll('.mobile-ep-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.mobile-ep-tab[data-ep-filter="today"]')?.classList.add('active');
    
    const seasonSelect = $('#mobileEpSeasonSelect');
    if (seasonSelect) seasonSelect.style.display = 'none';
    
    this._loadMobileEpData();
    if (typeof initIcons === 'function') initIcons();
  }
  
  closeMobileEventPicker() {
    const modal = $('#mobileEventPickerModal');
    if (modal) modal.style.display = 'none';
  }
  
  _getSeasonYear() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 9 ? year : year - 1;
  }
  
  _populateMobileSeasonDropdown() {
    const select = $('#mobileEpSeasonSelect');
    if (!select) return;
    
    const currentSeason = this._getSeasonYear();
    const startYear = 2019;
    
    let html = '';
    for (let year = currentSeason; year >= startYear; year--) {
      html += `<option value="${year}" ${year === currentSeason ? 'selected' : ''}>${year}-${year + 1}</option>`;
    }
    select.innerHTML = html;
  }
  
  _updateMepSeasonLabel() {
    // Deprecated
  }
  
  _switchMobileEpTab(filter) {
    this._mepFilter = filter;
    this._mepSearchQuery = '';
    const input = $('#mobileEpSearchInput');
    if (input) input.value = '';
    
    document.querySelectorAll('.mobile-ep-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.mobile-ep-tab[data-ep-filter="${filter}"]`)?.classList.add('active');
    
    const seasonSelect = $('#mobileEpSeasonSelect');
    if (seasonSelect) {
      seasonSelect.style.display = filter === 'all' ? 'block' : 'none';
      seasonSelect.value = this._mepSeason.toString();
    }
    
    this._loadMobileEpData();
  }
  
  _changeMobileEpSeason(delta) {
    // Deprecated
    this._mepSeason += delta;
    this._loadMobileEpData();
  }
  
  async _loadMobileEpData() {
    const list = $('#mobileEpEventList');
    if (!list) return;
    
    list.innerHTML = '<div class="mobile-ep-loading">Loading events...</div>';
    
    try {
      const params = {};
      
      if (this._mepFilter === 'today') {
        params.season = this._getSeasonYear();
      } else if (this._mepFilter === 'my-team') {
        params.season = this._getSeasonYear();
        if (this.teamNumber) params.team = this.teamNumber;
      } else {
        params.season = this._mepSeason;
      }
      
      if (this._mepSearchQuery) {
        params.query = this._mepSearchQuery;
      }
      
      const data = await api.searchEvents(params);
      this._mepAllEvents = data.events || [];
      
      if (this._mepFilter === 'today') {
        const todayStr = new Date().toISOString().split('T')[0];
        this._mepAllEvents = (data.events || []).filter(e => {
          if (e.status === 'live') return true;
          if (e.dateStart) {
            const startStr = e.dateStart.split('T')[0];
            const endStr = e.dateEnd ? e.dateEnd.split('T')[0] : startStr;
            return startStr <= todayStr && endStr >= todayStr;
          }
          return false;
        });
      }
      
      this._renderMobileEpList();
    } catch (err) {
      console.error('Mobile EP load error:', err);
      list.innerHTML = '<div class="mobile-ep-empty">Failed to load events.</div>';
    }
  }
  
  _filterMobileEpList(query) {
    this._mepSearchQuery = query.toLowerCase().trim();
    
    // Check for dev code
    if (query.toUpperCase() === 'DEVDATA1') {
      this._activateMobileDevMode();
      return;
    }
    
    if (this._mepFilter === 'all' || this._mepFilter === 'my-team') {
      this._loadMobileEpData();
    } else {
      this._renderMobileEpList();
    }
  }
  
  _activateMobileDevMode() {
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
    this._selectMobileEvent(devEvent.code, devEvent.name);
    
    toast.success('Dev mode activated - Using test event');
  }
  
  _renderMobileEpList() {
    const list = $('#mobileEpEventList');
    if (!list) return;
    
    let events = this._mepAllEvents || [];
    
    if (this._mepSearchQuery && this._mepFilter === 'today') {
      const q = this._mepSearchQuery;
      events = events.filter(e =>
        (e.code || '').toLowerCase().includes(q) ||
        (e.name || '').toLowerCase().includes(q) ||
        (e.city || '').toLowerCase().includes(q) ||
        (e.stateprov || '').toLowerCase().includes(q)
      );
    }
    
    if (events.length === 0) {
      list.innerHTML = '<div class="mobile-ep-empty">No events found</div>';
      return;
    }
    
    const live = events.filter(e => e.status === 'live');
    const upcoming = events.filter(e => e.status === 'upcoming');
    const past = events.filter(e => e.status === 'past');
    
    let html = '';
    
    if (live.length > 0) {
      html += '<div class="mobile-ep-section">Live Now</div>';
      html += live.map(e => this._renderMobileEpRow(e)).join('');
    }
    if (upcoming.length > 0) {
      html += '<div class="mobile-ep-section">Upcoming</div>';
      html += upcoming.map(e => this._renderMobileEpRow(e)).join('');
    }
    if (past.length > 0) {
      html += '<div class="mobile-ep-section">Past Events</div>';
      html += past.slice(0, 50).map(e => this._renderMobileEpRow(e)).join('');
    }
    
    list.innerHTML = html;
    
    list.querySelectorAll('.mobile-ep-event').forEach(row => {
      row.addEventListener('click', () => {
        const code = row.dataset.eventCode;
        const name = row.dataset.eventName;
        this._selectMobileEvent(code, name);
      });
    });
  }
  
  _renderMobileEpRow(event) {
    const isCurrent = event.code === this.currentEvent;
    const statusClass = event.status || 'upcoming';
    
    let dateStr = '';
    if (event.dateStart) {
      const start = new Date(event.dateStart);
      dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (event.dateEnd && event.dateEnd !== event.dateStart) {
        const end = new Date(event.dateEnd);
        dateStr += ` – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      }
    }
    
    const locationParts = [event.city, event.stateprov].filter(Boolean);
    const location = locationParts.join(', ');
    const meta = [dateStr, location, event.type].filter(Boolean).join(' · ');
    
    const eName = event.name || event.code;
    const div = document.createElement('div');
    div.textContent = eName;
    const escapedName = div.innerHTML;
    
    return `
      <div class="mobile-ep-event ${isCurrent ? 'current' : ''}" data-event-code="${event.code}" data-event-name="${escapedName}">
        <div class="mobile-ep-dot ${statusClass}"></div>
        <div class="mobile-ep-info">
          <div class="mobile-ep-name">${escapedName}</div>
          ${meta ? `<div class="mobile-ep-meta">${meta}</div>` : ''}
        </div>
        <div class="mobile-ep-code">${event.code}</div>
      </div>
    `;
  }
  
  // ===================== Custom Fields =====================
  
  async loadCustomQuestions() {
    try {
      const data = await api.listCustomQuestions();
      this.customQuestions = data.questions || [];
    } catch (e) {
      console.error('Failed to load custom questions:', e);
      this.customQuestions = [];
    }
  }
  
  async renderMobileCustomFields() {
    await this.loadCustomQuestions();
    
    const section = $('#mobileCustomFieldsSection');
    const container = $('#mobileCustomFieldsContainer');
    if (!section || !container) return;
    
    if (!this.customQuestions || this.customQuestions.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    container.innerHTML = this.customQuestions.map(q => this._renderMobileCustomField(q)).join('');
  }
  
  _renderMobileCustomField(question) {
    const id = `mcq_${question.id}`;
    
    switch (question.field_type) {
      case 'boolean':
        return `
          <div class="scout-field">
            <div class="scout-field-row">
              <label class="scout-field-label">${question.label}</label>
              <input type="checkbox" class="checkbox" name="${id}" id="${id}" data-cq-id="${question.id}">
            </div>
          </div>
        `;
        
      case 'slider': {
        const min = question.config.min ?? 0;
        const max = question.config.max ?? 10;
        const step = question.config.step ?? 1;
        return `
          <div class="scout-field">
            <label class="scout-field-label">${question.label}</label>
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
          <div class="scout-field">
            <label class="scout-field-label">${question.label}</label>
            <select class="form-input form-select" name="${id}" id="${id}" data-cq-id="${question.id}">
              <option value="">Select...</option>
              ${options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
            </select>
          </div>
        `;
      }
        
      case 'number':
        return `
          <div class="scout-field">
            <label class="scout-field-label">${question.label}</label>
            <input type="number" class="form-input" name="${id}" id="${id}" data-cq-id="${question.id}" min="0" inputmode="numeric">
          </div>
        `;
        
      case 'text':
        return `
          <div class="scout-field">
            <label class="scout-field-label">${question.label}</label>
            <textarea class="form-input form-textarea" name="${id}" id="${id}" data-cq-id="${question.id}" rows="2"></textarea>
          </div>
        `;
        
      default:
        return '';
    }
  }
  
  getMobileCustomFieldValues() {
    const responses = [];
    if (!this.customQuestions) return responses;
    
    this.customQuestions.forEach(q => {
      const el = $(`#mcq_${q.id}`);
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
  
  // ===================== End Custom Fields =====================
  
  // ==========================================
  // Team Members (Sub-Accounts) Methods
  // ==========================================

  async loadTeamMembers() {
    try {
      const data = await api.listSubAccounts();
      this.subAccounts = data.sub_accounts || [];
      this.renderTeamMembers();
      
      const countEl = $('#mobileTeamMemberCount');
      if (countEl) countEl.textContent = this.subAccounts.length;
    } catch (error) {
      console.error('Failed to load team members:', error);
      const list = $('#mobileTeamMemberList');
      if (list) {
        if (error.status === 403) {
          list.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon" data-icon="alert" data-icon-size="48"></div>
              <div class="empty-state-title">Access Denied</div>
              <div class="empty-state-text">Only the main account can manage team members</div>
            </div>
          `;
        } else {
          list.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon" data-icon="alert" data-icon-size="48"></div>
              <div class="empty-state-title">Error</div>
              <div class="empty-state-text">Failed to load team members</div>
            </div>
          `;
        }
        initIcons();
      }
    }
  }

  renderTeamMembers() {
    const container = $('#mobileTeamMemberList');
    if (!container) return;

    if (this.subAccounts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" data-icon="teams" data-icon-size="48"></div>
          <div class="empty-state-title">No Members</div>
          <div class="empty-state-text">Add scouts to your team to get started</div>
        </div>
      `;
      initIcons();
      return;
    }

    container.innerHTML = this.subAccounts.map(member => {
      const initial = member.name.charAt(0).toUpperCase();
      const teamsText = member.assigned_teams && member.assigned_teams.length > 0
        ? `Teams: ${member.assigned_teams.join(', ')}`
        : 'All teams';
      
      return `
        <div class="tm-card ${!member.is_active ? 'inactive' : ''}" onclick="mobileApp.openMemberDetail(${member.id})">
          <div class="tm-avatar">${initial}</div>
          <div class="tm-info">
            <div class="tm-name">${this._escapeHtml(member.name)}</div>
            <div class="tm-meta">${teamsText}</div>
          </div>
          <div class="tm-status-dot ${member.is_active ? 'active' : 'inactive'}"></div>
        </div>
      `;
    }).join('');
  }

  async handleAddMember(e) {
    e.preventDefault();
    
    const nameInput = $('#mobileNewMemberName');
    const btn = $('#mobileAddMemberBtn');
    const name = nameInput?.value?.trim();
    
    if (!name) {
      toast.error('Please enter a name');
      return;
    }
    
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="mobile-loading-spinner" style="width:14px;height:14px;border-width:2px;"></span>';
    }
    
    try {
      await api.createSubAccount(name, []);
      toast.success(`Added ${name}`);
      if (nameInput) nameInput.value = '';
      await this.loadTeamMembers();
    } catch (error) {
      console.error('Failed to add member:', error);
      toast.error('Failed to add member');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span data-icon="plus" data-icon-size="16"></span> Add';
        initIcons();
      }
    }
  }

  openMemberDetail(memberId) {
    const member = (this.subAccounts || []).find(m => m.id === memberId);
    if (!member) return;
    
    this._selectedMemberId = memberId;
    
    // Populate sheet
    const nameEl = $('#memberDetailSheetName');
    if (nameEl) nameEl.textContent = member.name;
    
    const statusEl = $('#memberDetailStatus');
    if (statusEl) {
      statusEl.textContent = member.is_active ? 'Active' : 'Inactive';
      statusEl.style.color = member.is_active ? 'var(--success, #22c55e)' : 'var(--text-muted)';
    }
    
    const createdEl = $('#memberDetailCreated');
    if (createdEl) {
      try {
        createdEl.textContent = new Date(member.created_at).toLocaleDateString();
      } catch { createdEl.textContent = '—'; }
    }
    
    const lastLoginEl = $('#memberDetailLastLogin');
    if (lastLoginEl) {
      if (member.last_login && member.last_login !== member.created_at) {
        const d = new Date(member.last_login);
        lastLoginEl.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      } else {
        lastLoginEl.textContent = 'Never';
      }
    }
    
    // Assigned teams display
    const teamsEl = $('#memberDetailTeams');
    if (teamsEl) {
      teamsEl.textContent = member.assigned_teams && member.assigned_teams.length > 0
        ? member.assigned_teams.join(', ')
        : 'All teams';
    }
    
    // Reset QR state
    this._memberLoginUrl = null;
    const qrBtn = $('#memberShowQrBtn');
    if (qrBtn) qrBtn.disabled = true;
    
    // Toggle button text
    const toggleBtn = $('#memberToggleBtn');
    if (toggleBtn) {
      toggleBtn.innerHTML = member.is_active
        ? '<span data-icon="pause" data-icon-size="14"></span> Deactivate'
        : '<span data-icon="check" data-icon-size="14"></span> Activate';
      initIcons();
    }
    
    // Load credentials
    this.loadMemberCredentials(memberId);
    
    // Open sheet
    const sheet = $('#memberDetailSheet');
    const overlay = $('#memberDetailOverlay');
    if (sheet) sheet.classList.add('open');
    if (overlay) overlay.classList.add('active');
  }

  closeMemberDetail() {
    const sheet = $('#memberDetailSheet');
    const overlay = $('#memberDetailOverlay');
    if (sheet) sheet.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    this._selectedMemberId = null;
  }

  async toggleMember() {
    if (!this._selectedMemberId) return;
    const member = (this.subAccounts || []).find(m => m.id === this._selectedMemberId);
    if (!member) return;
    
    const btn = $('#memberToggleBtn');
    if (btn) btn.disabled = true;
    
    try {
      const newState = !member.is_active;
      await api.updateSubAccount(this._selectedMemberId, { is_active: newState });
      toast.success(`${member.name} ${newState ? 'activated' : 'deactivated'}`);
      await this.loadTeamMembers();
      // Re-open with updated data
      this.openMemberDetail(this._selectedMemberId);
    } catch (error) {
      console.error('Failed to toggle member:', error);
      toast.error('Failed to update member');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async deleteMember() {
    if (!this._selectedMemberId) return;
    const member = (this.subAccounts || []).find(m => m.id === this._selectedMemberId);
    if (!member) return;
    
    if (!confirm(`Remove ${member.name}? This cannot be undone.`)) return;
    
    const btn = $('#memberDeleteBtn');
    if (btn) btn.disabled = true;
    
    try {
      await api.deleteSubAccount(this._selectedMemberId);
      toast.success(`${member.name} removed`);
      this.closeMemberDetail();
      await this.loadTeamMembers();
    } catch (error) {
      console.error('Failed to delete member:', error);
      toast.error('Failed to remove member');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async loadMemberCredentials(memberId) {
    const otpContainer = $('#memberDetailOtp');
    const expiryEl = $('#memberDetailOtpExpiry');
    const qrBtn = $('#memberShowQrBtn');
    
    try {
      const data = await api.getSubAccountCredentials(memberId);
      
      if (data.otp_code) {
        this._renderMemberOtp(otpContainer, data.otp_code);
        if (expiryEl && data.expires_at) {
          const expires = new Date(data.expires_at);
          const now = new Date();
          const hoursLeft = Math.max(0, Math.round((expires - now) / 1000 / 60 / 60));
          expiryEl.textContent = hoursLeft > 0 ? `Expires in ~${hoursLeft}h` : 'Expired';
        }
      } else {
        this._renderMemberOtp(otpContainer, '------');
        if (expiryEl) expiryEl.textContent = '';
      }
      
      // Enable QR button if token available
      if (data.token) {
        this._memberLoginUrl = `${window.location.origin}/code.html?token=${data.token}`;
        if (qrBtn) qrBtn.disabled = false;
      } else {
        this._memberLoginUrl = null;
        if (qrBtn) qrBtn.disabled = true;
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
      this._renderMemberOtp(otpContainer, '------');
      if (expiryEl) expiryEl.textContent = 'Click Generate to create credentials';
      this._memberLoginUrl = null;
      if (qrBtn) qrBtn.disabled = true;
    }
  }

  _renderMemberOtp(container, code) {
    if (!container) return;
    const digits = (code || '------').replace(/[^0-9a-zA-Z]/g, '').split('');
    while (digits.length < 6) digits.push('-');
    
    const left = digits.slice(0, 3);
    const right = digits.slice(3, 6);
    
    container.innerHTML = `
      <div class="otp-digits" style="margin-bottom: var(--space-sm);">
        ${left.map(d => `<div class="otp-digit ${d !== '-' ? 'filled' : ''}">${d}</div>`).join('')}
        <div class="otp-dash">-</div>
        ${right.map(d => `<div class="otp-digit ${d !== '-' ? 'filled' : ''}">${d}</div>`).join('')}
      </div>
    `;
  }

  async generateMemberCredentials() {
    if (!this._selectedMemberId) return;
    
    const btn = $('#memberGenCredsBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="mobile-loading-spinner" style="width:14px;height:14px;border-width:2px;"></span> Generating...';
    }
    
    try {
      const data = await api.regenerateSubAccountCredentials(this._selectedMemberId);
      
      if (data.otp_code) {
        this._renderMemberOtp($('#memberDetailOtp'), data.otp_code);
        const expiryEl = $('#memberDetailOtpExpiry');
        if (expiryEl && data.expires_at) {
          const expires = new Date(data.expires_at);
          const now = new Date();
          const hoursLeft = Math.max(0, Math.round((expires - now) / 1000 / 60 / 60));
          expiryEl.textContent = hoursLeft > 0 ? `Expires in ~${hoursLeft}h` : 'Expired';
        }
      }
      
      // Enable QR button
      if (data.token) {
        this._memberLoginUrl = `${window.location.origin}/code.html?token=${data.token}`;
        const qrBtn = $('#memberShowQrBtn');
        if (qrBtn) qrBtn.disabled = false;
      }
      
      toast.success('Credentials generated');
    } catch (error) {
      console.error('Failed to generate credentials:', error);
      toast.error('Failed to generate credentials');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span data-icon="key" data-icon-size="14"></span> Generate';
        initIcons();
      }
    }
  }

  // QR enlarge/close
  enlargeQr() {
    if (!this._memberLoginUrl) return;
    const overlay = $('#qrEnlargeOverlay');
    const content = $('#qrEnlargeContent');
    if (overlay && content) {
      content.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(this._memberLoginUrl)}" alt="QR Code">`;
      overlay.style.display = 'flex';
    }
  }

  closeEnlargedQr() {
    const overlay = $('#qrEnlargeOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  // --- Assign Teams Sheet ---
  openAssignTeamsSheet() {
    if (!this._selectedMemberId) return;
    const member = (this.subAccounts || []).find(m => m.id === this._selectedMemberId);
    if (!member) return;

    const assignedSet = new Set((member.assigned_teams || []).map(String));
    const isAll = assignedSet.size === 0;

    // Build the team list from event rankings data
    const allTeams = (this.rankings || []).map(r => ({
      number: String(r.teamNumber),
      name: this.getTeamName(r.teamNumber) || '',
    }));

    // If there are no rankings, fall back to any teams we know about
    if (allTeams.length === 0 && this.teams) {
      Object.entries(this.teams).forEach(([num, info]) => {
        allTeams.push({ number: String(num), name: info.name || info.nameShort || '' });
      });
    }

    // Sort numerically
    allTeams.sort((a, b) => parseInt(a.number) - parseInt(b.number));
    this._assignTeamsList = allTeams;

    // Set "All" toggle
    const allToggle = $('#assignTeamsAllToggle');
    if (allToggle) allToggle.checked = isAll;

    // Clear search
    const searchInput = $('#assignTeamsSearch');
    if (searchInput) searchInput.value = '';

    // Render checklist
    this._renderAssignTeamsList(allTeams, assignedSet, isAll);

    // Show sheet
    const sheet = $('#assignTeamsSheet');
    const overlay = $('#assignTeamsOverlay');
    if (sheet) sheet.classList.add('open');
    if (overlay) overlay.classList.add('active');
  }

  closeAssignTeamsSheet() {
    const sheet = $('#assignTeamsSheet');
    const overlay = $('#assignTeamsOverlay');
    if (sheet) sheet.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  _renderAssignTeamsList(teams, assignedSet, isAll) {
    const container = $('#assignTeamsList');
    if (!container) return;

    if (teams.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-lg);">
          <div class="empty-state-text">No teams available. Load event data first.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = teams.map(t => {
      const checked = isAll || assignedSet.has(t.number) ? 'checked' : '';
      const disabled = isAll ? 'disabled' : '';
      return `
        <label class="at-team-item" data-team="${t.number}">
          <input type="checkbox" value="${t.number}" ${checked} ${disabled}>
          <span class="at-team-num">${t.number}</span>
          <span class="at-team-name">${t.name}</span>
        </label>
      `;
    }).join('');
  }

  toggleAllTeams(e) {
    const isAll = e.target.checked;
    const checkboxes = document.querySelectorAll('#assignTeamsList input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = isAll;
      cb.disabled = isAll;
    });
  }

  filterAssignTeams(e) {
    const query = (e.target.value || '').toLowerCase().trim();
    const items = document.querySelectorAll('#assignTeamsList .at-team-item');
    items.forEach(item => {
      const num = item.dataset.team || '';
      const name = (item.querySelector('.at-team-name')?.textContent || '').toLowerCase();
      const match = !query || num.includes(query) || name.includes(query);
      item.style.display = match ? '' : 'none';
    });
  }

  async saveAssignedTeams() {
    if (!this._selectedMemberId) return;
    const btn = $('#assignTeamsSaveBtn');
    const allToggle = $('#assignTeamsAllToggle');
    const isAll = allToggle?.checked;

    let teams = [];
    if (!isAll) {
      const checkboxes = document.querySelectorAll('#assignTeamsList input[type="checkbox"]:checked');
      teams = Array.from(checkboxes).map(cb => cb.value);
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    try {
      await api.updateSubAccount(this._selectedMemberId, { assigned_teams: isAll ? [] : teams });
      toast.success('Assigned teams updated');

      // Update display on detail sheet
      const teamsEl = $('#memberDetailTeams');
      if (teamsEl) {
        teamsEl.textContent = teams.length > 0 && !isAll
          ? teams.join(', ')
          : 'All teams';
      }

      // Update the member in local data
      const member = (this.subAccounts || []).find(m => m.id === this._selectedMemberId);
      if (member) {
        member.assigned_teams = isAll ? [] : teams;
      }

      this.closeAssignTeamsSheet();
      await this.loadTeamMembers();
    } catch (error) {
      console.error('Failed to update teams:', error);
      toast.error('Failed to update assigned teams');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    }
  }

  async _selectMobileEvent(code, name) {
    this.currentEvent = code;
    this.eventName = name || code;
    storage.set('currentEvent', code);
    
    // Update banners
    this.updateEventBanners();
    
    this.closeMobileEventPicker();
    
    try {
      await this.loadEventData();
      toast.success(`Switched to ${this.eventName}`);
    } catch (err) {
      console.error('Failed to load event data:', err);
      toast.error('Failed to load event data');
    }
  }
}

// Initialize
const mobileApp = new MobileApp();
