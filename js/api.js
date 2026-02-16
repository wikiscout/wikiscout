// WikiScout API Client

const API_BASE = 'https://prod.wikiscout.org'; // Production API - update with your API URL

class WikiScoutAPI {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config = {
      credentials: 'include',
      cache: 'no-store', // Disable caching
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      // Handle specific status codes
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        throw new APIError('Unauthorized', 401);
      }
      
      if (response.status === 501) {
        window.dispatchEvent(new CustomEvent('auth:no-team'));
        throw new APIError('No team number assigned', 501);
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new APIError(error.error || 'Request failed', response.status);
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) return null;
      
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw new APIError(error.message || 'Network error', 0);
    }
  }

  // Auth endpoints
  async login(email, password) {
    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);
    
    return this.request('/login/auth/', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set content-type for FormData
    });
  }

  async register(email, password, firstName, lastName, teamNumber) {
    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);
    formData.append('first', firstName);
    formData.append('last', lastName);
    formData.append('team', teamNumber);
    
    return this.request('/login/auth/', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  }

  async logout() {
    return this.request('/login/logout/');
  }

  async validateToken() {
    return this.request('/dashboard/validate/');
  }

  // OTP endpoints
  async getOtp() {
    return this.request('/dashboard/auth/');
  }

  async generateOtp() {
    return this.request('/dashboard/auth/', { method: 'POST' });
  }

  async regenerateOtp() {
    return this.request('/dashboard/auth/', { method: 'POST' });
  }

  async deleteOtp() {
    return this.request('/dashboard/auth/', { method: 'DELETE' });
  }

  async authenticateWithOtp(otp) {
    const formData = new FormData();
    formData.append('otp', otp);
    
    return this.request('/code/auth/', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  }

  async loginWithSubAccountOtp(otp) {
    // Use raw fetch to avoid the 401 -> auth:unauthorized redirect behavior
    const url = `${this.baseUrl}/accounts/login/otp/`;
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new APIError(data.error || 'Login failed', response.status);
    }
    return response.json();
  }

  async loginWithSubAccountToken(token) {
    // Use raw fetch to avoid the 401 -> auth:unauthorized redirect behavior
    const url = `${this.baseUrl}/accounts/login/token/`;
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new APIError(data.error || 'Login failed', response.status);
    }
    return response.json();
  }

  // Dashboard data endpoints
  async getMe() {
    return this.request('/dashboard/me/');
  }

  async getTodayEvents() {
    return this.request('/dashboard/today/');
  }

  async searchEvents({ season, team, query } = {}) {
    let url = '/dashboard/events/';
    const params = [];
    if (season) params.push(`season=${season}`);
    if (team) params.push(`team=${team}`);
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.request(url);
  }

  async getTeams(eventCode) {
    return this.request(`/dashboard/teams/?event=${eventCode}`);
  }

  async getMatches(eventCode) {
    return this.request(`/dashboard/matches/?event=${eventCode}`);
  }

  async getRankings(eventCode) {
    return this.request(`/dashboard/rankings/?event=${eventCode}`);
  }

  async getEventSchedule(eventCode) {
    return this.request(`/dashboard/event_schedule/?event=${eventCode}`);
  }

  async getTeamSchedule(eventCode) {
    return this.request(`/dashboard/team_schedule/?event=${eventCode}`);
  }

  // Scouting data
  async addScoutingData(teamNumber, eventId, data) {
    const formData = new FormData();
    formData.append('team_number', teamNumber);
    formData.append('event_id', eventId);
    formData.append('data', JSON.stringify(data));
    
    return this.request('/dashboard/add/', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  }

  async getScoutingData(teamNumber, eventCode) {
    return this.request(`/dashboard/view/?team=${teamNumber}&event=${eventCode}`);
  }

  // Match notes
  async saveMatchNote(eventCode, matchNumber, teamNumber, notes, isPrivate = false) {
    return this.request('/match-notes/save/', {
      method: 'POST',
      body: JSON.stringify({ event_code: eventCode, match_number: matchNumber, team_number: teamNumber, notes, is_private: isPrivate }),
    });
  }

  async getMatchNotes(eventCode, { match, team } = {}) {
    let url = `/match-notes/get/?event=${eventCode}`;
    if (match) url += `&match=${encodeURIComponent(match)}`;
    if (team) url += `&team=${encodeURIComponent(team)}`;
    return this.request(url);
  }

  async deleteMatchNote(noteId) {
    return this.request(`/match-notes/delete/?id=${noteId}`, { method: 'DELETE' });
  }

  // Site info
  async getSiteInfo() {
    return this.request('/activate/info');
  }

  // Profile / Trading Card endpoints
  async getProfile() {
    return this.request('/profile/get');
  }

  async saveProfile(profileData) {
    return this.request('/profile/save/', {
      method: 'POST',
      body: JSON.stringify(profileData),
    });
  }

  async createPhotoSession() {
    return this.request('/profile/photo/session', { method: 'POST' });
  }

  async getPhotoSessionStatus() {
    return this.request('/profile/photo/status');
  }

  async importProfile(profileSlug, eventCode) {
    return this.request('/profile/import/', {
      method: 'POST',
      body: JSON.stringify({ profile_slug: profileSlug, event_code: eventCode }),
    });
  }

  async getPublicProfile(slug) {
    return this.request(`/card/${slug}`);
  }

  // Sub-accounts / Team Members endpoints
  async listSubAccounts() {
    return this.request('/accounts/list');
  }

  async createSubAccount(name, assignedTeams = []) {
    return this.request('/accounts/create/', {
      method: 'POST',
      body: JSON.stringify({ name, assigned_teams: assignedTeams }),
    });
  }

  async updateSubAccount(id, updates) {
    return this.request(`/accounts/update/?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteSubAccount(id) {
    return this.request(`/accounts/delete/?id=${id}`, {
      method: 'DELETE',
    });
  }

  async getSubAccountCredentials(id) {
    return this.request(`/accounts/share/?id=${id}`);
  }

  async regenerateSubAccountCredentials(id) {
    return this.request(`/accounts/share/?id=${id}`, {
      method: 'POST',
    });
  }

  async whoami() {
    return this.request('/accounts/whoami');
  }

  // Custom Questions endpoints
  async listCustomQuestions() {
    return this.request('/custom-questions/list');
  }

  async saveCustomQuestion(questionData) {
    return this.request('/custom-questions/save/', {
      method: 'POST',
      body: JSON.stringify(questionData),
    });
  }

  async deleteCustomQuestion(id) {
    return this.request(`/custom-questions/delete/?id=${id}`, { method: 'DELETE' });
  }

  async reorderCustomQuestions(order) {
    return this.request('/custom-questions/reorder/', {
      method: 'POST',
      body: JSON.stringify({ order }),
    });
  }

  async saveCustomResponses(scoutedTeam, eventCode, responses) {
    return this.request('/custom-questions/responses/save/', {
      method: 'POST',
      body: JSON.stringify({ scouted_team: scoutedTeam, event_code: eventCode, responses }),
    });
  }

  async getCustomResponses(scoutedTeam, eventCode) {
    return this.request(`/custom-questions/responses/get/?team=${scoutedTeam}&event=${eventCode}`);
  }

  async getScoutedTeams(eventCode) {
    return this.request(`/dashboard/scouted_teams/?event=${eventCode}`);
  }
}

class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

// Create global API instance
const api = new WikiScoutAPI();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WikiScoutAPI, APIError, api };
}
