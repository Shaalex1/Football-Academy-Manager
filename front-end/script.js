// API Base URL - automatically detects production vs local
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? "http://localhost:3000/api"
  : "/api"; // In production, use relative path

// ==================== STATE ====================
let currentMode = "admin-login";
let currentUser = null;
let isPlayerMode = false;
let players = [];
let teams = [];
let matches = [];
let tournaments = [];
let teamRequests = [];
let tournamentRequests = [];

// ==================== API HELPERS ====================

async function apiCall(endpoint, method = "GET", body = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  
  if (body) options.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
  } catch (err) {
    console.error("API Error:", err);
    throw err;
  }
}

// ==================== DATA LOADING ====================

async function loadPlayers(teamName = null, search = "") {
  const params = new URLSearchParams();
  if (teamName) params.append("teamName", teamName);
  if (search) params.append("search", search);
  
  players = await apiCall(`/players?${params}`);
  return players;
}

async function loadTeams(search = "") {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  
  teams = await apiCall(`/teams?${params}`);
  return teams;
}

async function loadMatches(teamName = null, search = "", tournamentId = null) {
  const params = new URLSearchParams();
  if (teamName) params.append("teamName", teamName);
  if (search) params.append("search", search);
  if (tournamentId) params.append("tournamentId", tournamentId);
  
  matches = await apiCall(`/matches?${params}`);
  return matches;
}

async function loadTournaments() {
  tournaments = await apiCall("/tournaments");
  return tournaments;
}

async function loadTournamentRequests() {
  tournamentRequests = await apiCall("/tournament-requests");
  return tournamentRequests;
}

function categorizeTournaments(tournamentsArray) {
  const now = new Date();
  const upcoming = [];
  const current = [];
  const past = [];

  tournamentsArray.forEach(t => {
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);

    if (now < start) {
      upcoming.push(t);
    } else if (now >= start && now <= end) {
      current.push(t);
    } else {
      past.push(t);
    }
  });

  return { upcoming, current, past };
}

async function loadTeamRequests() {
  if (currentUser && currentUser.isCaptain) {
    teamRequests = await apiCall(`/team-requests/${currentUser.id}`);
  }
  return teamRequests;
}

// ==================== AUTHENTICATION ====================

async function handleUnifiedLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  const errorLabel = document.getElementById("login-error");
  
  try {
    const endpoint = currentMode === "admin-login" ? "/auth/admin/login" : "/auth/player/login";
    const result = await apiCall(endpoint, "POST", { email, password });
    
    if (result.success) {
      loginSuccess(result.user);
    }
  } catch (err) {
    errorLabel.textContent = err.message || "Invalid credentials";
  }
}

// REPLACE the handlePlayerSignup function in your script.js with this:

async function handlePlayerSignup(e) {
  e.preventDefault();
  
  const firstName = document.getElementById("signup-firstname").value;
  const lastName = document.getElementById("signup-lastname").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  const age = Number(document.getElementById("signup-age").value);
  const position = document.getElementById("signup-position").value;
  const height = Number(document.getElementById("signup-height").value);
  const weight = Number(document.getElementById("signup-weight").value);
  const injury = document.getElementById("signup-injury").value;
  const fitness = Number(document.getElementById("signup-fitness").value);
  const nationality = document.getElementById("signup-nationality").value;
  const shirtNumber = Number(document.getElementById("signup-shirt-number").value);
  
  const errorLabel = document.getElementById("signup-error");
  errorLabel.textContent = ""; // Clear previous errors
  errorLabel.style.color = "#ef4444"; // Reset to error color
  
  try {
    const result = await apiCall("/auth/player/signup", "POST", {
      firstName, lastName, email, password, age, position, height, weight, 
      injury, fitness, nationality, shirtNumber
    });
    
    if (result.success) {
      // Show success message
      errorLabel.style.color = "#4ade80"; // Green color
      errorLabel.textContent = "✓ Account created successfully! Logging you in...";
      
      // Wait a moment for user to see the message
      setTimeout(() => {
        loginSuccess(result.user);
      }, 1500);
    }
  } catch (err) {
    // Better error messages
    let errorMessage = err.message;
    
    // Check for specific error types
    if (errorMessage.includes("Duplicate entry") || errorMessage.includes("email")) {
      errorMessage = "❌ This email is already registered. Please use a different email or try logging in.";
    } else if (errorMessage.includes("injury")) {
      errorMessage = "❌ " + errorMessage;
    } else if (errorMessage.includes("fitness")) {
      errorMessage = "❌ " + errorMessage;
    } else if (errorMessage.includes("Fill all fields")) {
      errorMessage = "❌ Please fill in all required fields.";
    } else {
      errorMessage = "❌ Registration failed: " + errorMessage;
    }
    
    errorLabel.textContent = errorMessage;
  }
}

function loginSuccess(user) {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("logged-user-email").textContent = 
    `${user.name} (${user.role === "player" ? "Player" : "Admin"})`;
  
  currentUser = user;
  isPlayerMode = user.role === "player";
  
  togglePlayerModeUI();
  switchView(isPlayerMode ? "my-info" : "dashboard");
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`mode-${mode}-btn`).classList.add("active");
  
  document.getElementById("unified-login-form").classList.add("hidden");
  document.getElementById("player-signup-form").classList.add("hidden");
  
  if (mode === "admin-login") {
    document.getElementById("unified-login-form").classList.remove("hidden");
    document.getElementById("login-submit-text").textContent = "Sign In (Admin)";
  } else if (mode === "player-login") {
    document.getElementById("unified-login-form").classList.remove("hidden");
    document.getElementById("login-submit-text").textContent = "Sign In (Player)";
  } else if (mode === "player-signup") {
    document.getElementById("player-signup-form").classList.remove("hidden");
  }
  
  document.querySelectorAll(".error-text").forEach(e => e.textContent = "");
}

// ==================== SETTINGS ====================

function initializeSettings() {
  const savedColor = localStorage.getItem("theme-color");
  if (savedColor) {
    const picker = document.getElementById("theme-color-picker");
    const pickerPlayer = document.getElementById("theme-color-picker-player");
    if(picker) picker.value = savedColor;
    if(pickerPlayer) pickerPlayer.value = savedColor;
    applyThemeColor(savedColor);
  }
}

function applyThemeColor(hex) {
  const root = document.documentElement;
  let r = 0, g = 0, b = 0;
  if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }

  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.25)`);
  root.style.setProperty("--accent-strong", `rgba(${r}, ${g}, ${b}, 0.35)`);
  root.style.setProperty("--border", hex);
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const messageEl = document.getElementById("password-change-message");
  
  if (newPassword !== confirmPassword) {
    messageEl.textContent = "New passwords don't match";
    return;
  }
  
  try {
    await apiCall("/settings/password", "PUT", {
      playerId: currentUser.id,
      currentPassword,
      newPassword
    });
    messageEl.textContent = "Password changed successfully!";
    messageEl.style.color = "#4ade80";
    e.target.reset();
  } catch (err) {
    messageEl.textContent = err.message;
  }
}

async function handleChangePasswordPlayer(e) {
  e.preventDefault();
  const currentPassword = document.getElementById("current-password-player").value;
  const newPassword = document.getElementById("new-password-player").value;
  const confirmPassword = document.getElementById("confirm-password-player").value;
  const messageEl = document.getElementById("password-change-message-player");
  
  if (newPassword !== confirmPassword) {
    messageEl.textContent = "New passwords don't match";
    return;
  }
  
  try {
    await apiCall("/settings/password", "PUT", {
      playerId: currentUser.id,
      currentPassword,
      newPassword
    });
    messageEl.textContent = "Password changed successfully!";
    messageEl.style.color = "#4ade80";
    e.target.reset();
  } catch (err) {
    messageEl.textContent = err.message;
  }
}
// PART 2 - VIEW RENDERING FUNCTIONS

// ==================== VIEW RENDERING ====================

async function renderDashboard() {
  await loadPlayers(isPlayerMode ? currentUser.teamName : null);
  await loadTeams();

  document.getElementById("stat-total-players").textContent = players.length;
  document.getElementById("stat-total-teams").textContent = teams.length;

  const tbody = document.getElementById("dashboard-teams-body");
  tbody.innerHTML = "";

  const teamsToShow = isPlayerMode && currentUser.teamName
    ? teams.filter(t => t.name === currentUser.teamName)
    : teams;

  teamsToShow.forEach(t => {
    const count = players.filter(p => p.teamName === t.name).length;
    tbody.innerHTML += `<tr>
      <td>${t.name}</td>
      <td>${count}</td>
      <td>${t.city || "-"}</td>
    </tr>`;
  });
}

async function renderMyInfo() {
  if (!isPlayerMode || !currentUser) return;
  
  try {
    const playerData = await apiCall(`/players/${currentUser.id}`);
    
    document.getElementById("my-info-content").innerHTML = `
      <div class="player-card-main">
        <div class="player-name-row">
          <span>${playerData.firstName} ${playerData.lastName}</span>
          <span class="badge blue">${playerData.teamName || "No Team"}</span>
          ${playerData.role === 'Captain' ? '<span class="badge" style="background:rgba(234, 179, 8, 0.2); border-color:#eab308; color:#facc15;">Captain</span>' : ''}
        </div>
        <div class="player-meta">
          Position: ${playerData.position} | Shirt: #${playerData.shirtNumber}
        </div>
        <div style="margin-top:1rem; border-top:1px solid #333; padding-top:1rem;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; font-size:0.9rem;">
            <div>Goals: <span style="color:#4ade80">${playerData.goals || 0}</span></div>
            <div>Assists: <span style="color:#60a5fa">${playerData.assists || 0}</span></div>
            <div>Height: ${playerData.height} cm</div>
            <div>Weight: ${playerData.weight} kg</div>
            <div>Nationality: ${playerData.nationality}</div>
            <div>Email: ${playerData.email}</div>
          </div>
          ${playerData.injuries && playerData.injuries.length > 0 ? `
          <div style="margin-top:1rem;">
            <strong>Active Injuries:</strong>
            ${playerData.injuries.map(i => `
              <div style="font-size:0.85rem; color:#ef4444; margin-top:0.3rem;">
                ${i.description} (${i.severity || "Unknown"}) - Recovery: ${new Date(i.recoveryDate).toLocaleDateString()}
              </div>
            `).join('')}
          </div>
          ` : '<div style="margin-top:1rem; color:#4ade80;">No active injuries</div>'}
          ${playerData.teamName ? `
          <div style="margin-top:1rem;">
            <button class="btn-small" style="background:#ef4444; border-color:#dc2626;" onclick="leaveTeam()">Leave Team</button>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Error loading player info:", err);
  }
}

async function leaveTeam() {
  if (!confirm("Are you sure you want to leave your team?")) return;
  
  try {
    await apiCall("/teams/leave", "POST", { playerId: currentUser.id });
    currentUser.teamName = null;
    alert("You have left the team successfully");
    renderMyInfo();
    renderTeamInfo();
  } catch (err) {
    alert("Error leaving team: " + err.message);
  }
}
window.leaveTeam = leaveTeam;

async function renderTeamInfo() {
  if (!isPlayerMode || !currentUser || !currentUser.teamName) {
    document.getElementById("team-info-content").innerHTML = `
      <div class="muted-text">You are not currently assigned to a team.</div>
    `;
    return;
  }

  try {
    const teamData = await apiCall(`/teams/${currentUser.teamName}`);

    // Categorize tournaments
    const now = new Date();
    const upcomingTournaments = teamData.tournaments ? teamData.tournaments.filter(t => new Date(t.startDate) > now) : [];
    const currentTournaments = teamData.tournaments ? teamData.tournaments.filter(t => new Date(t.startDate) <= now && new Date(t.endDate) >= now) : [];
    const pastTournaments = teamData.tournaments ? teamData.tournaments.filter(t => new Date(t.endDate) < now) : [];

    document.getElementById("team-info-content").innerHTML = `
      <div style="padding: 1rem;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
          <div><strong>Team:</strong> ${teamData.name}</div>
          <div><strong>City:</strong> ${teamData.city}</div>
          <div><strong>Founded:</strong> ${teamData.foundedYear}</div>
          <div><strong>Players:</strong> ${teamData.players.length}</div>
          <div><strong>Wins:</strong> ${teamData.wins || 0}</div>
          <div><strong>Matches Played:</strong> ${teamData.matchesPlayed || 0}</div>
          <div><strong>Win Rate:</strong> ${teamData.matchesPlayed > 0 ? ((teamData.wins / teamData.matchesPlayed) * 100).toFixed(1) + '%' : '0%'}</div>
        </div>

        <hr style="border:0; border-top:1px solid #333; margin:1rem 0;">
        <h5>Tournaments:</h5>

        ${currentTournaments.length > 0 ? `
          <h6 style="color:#22c55e; margin-top:0.5rem; margin-bottom:0.3rem;">Current Tournaments</h6>
          <div class="tag-row" style="margin-bottom:1rem;">
            ${currentTournaments.map(t => `
              <span class="tag" style="background:rgba(34, 197, 94, 0.2); border-color:#22c55e;">
                ${t.name} (${t.city})
              </span>
            `).join('')}
          </div>
        ` : ''}

        ${upcomingTournaments.length > 0 ? `
          <h6 style="color:#60a5fa; margin-top:0.5rem; margin-bottom:0.3rem;">Upcoming Tournaments</h6>
          <div class="tag-row" style="margin-bottom:1rem;">
            ${upcomingTournaments.map(t => `
              <span class="tag" style="background:rgba(96, 165, 250, 0.2); border-color:#60a5fa;">
                ${t.name} (${new Date(t.startDate).toLocaleDateString()})
              </span>
            `).join('')}
          </div>
        ` : ''}

        ${pastTournaments.length > 0 ? `
          <h6 style="color:#94a3b8; margin-top:0.5rem; margin-bottom:0.3rem;">Past Tournaments</h6>
          <div class="tag-row" style="margin-bottom:1rem;">
            ${pastTournaments.map(t => `
              <span class="tag" style="background:rgba(148, 163, 184, 0.2); border-color:#94a3b8; color:#94a3b8;">
                ${t.name} (${new Date(t.endDate).toLocaleDateString()})
              </span>
            `).join('')}
          </div>
        ` : ''}

        ${!teamData.tournaments || teamData.tournaments.length === 0 ? `
          <div class="muted-text" style="margin-top:0.5rem;">Not enrolled in any tournaments.</div>
        ` : ''}

        <hr style="border:0; border-top:1px solid #333; margin:1rem 0;">
        <h5>Team Roster:</h5>
        ${currentUser.isCaptain ? `
          <div class="tag-row" style="margin-top:0.5rem;">
            ${teamData.players.map(p => `
              <div style="display:flex; align-items:center; gap:0.5rem; background:#1a1a1a; padding:0.5rem; border-radius:4px; margin-bottom:0.5rem;">
                <span style="flex:1;">#${p.shirtNumber} ${p.name} (${p.position}) ${p.role === 'Captain' ? '⭐' : ''}</span>
                ${p.role !== 'Captain' ? `<button class="btn-small" style="background:#ef4444; border-color:#dc2626; font-size:0.7rem; padding:2px 8px;" onclick="removePlayerFromTeam(${p.id})">Remove</button>` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="tag-row" style="margin-top:0.5rem;">
            ${teamData.players.map(p => `
              <span class="tag">#${p.shirtNumber} ${p.name} (${p.position}) ${p.role === 'Captain' ? '⭐' : ''}</span>
            `).join('')}
          </div>
        `}
      </div>
    `;
  } catch (err) {
    console.error("Error loading team info:", err);
  }
}

async function removePlayerFromTeam(playerId) {
  if (!confirm("Are you sure you want to remove this player from the team?")) return;

  try {
    await apiCall("/teams/remove-player", "POST", {
      playerId,
      captainId: currentUser.id,
      teamName: currentUser.teamName
    });

    alert("Player removed from team!");
    renderTeamInfo();
  } catch (err) {
    alert("Error: " + err.message);
  }
}
window.removePlayerFromTeam = removePlayerFromTeam;

async function renderTeamsTable(filter = "") {
  await loadTeams(filter);

  const body = document.getElementById("teams-table-body");
  body.innerHTML = "";

  let teamsToShow = teams;

  teamsToShow.forEach(team => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${team.name}</td>
      <td>${team.city}</td>
      <td>${team.playerCount}</td>
    `;
    const tdAction = document.createElement("td");
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn-small";
    viewBtn.textContent = "View";
    viewBtn.onclick = () => showTeamDetails(team);
    tdAction.appendChild(viewBtn);

    if (isPlayerMode) {
      const registerBtn = document.createElement("button");
      registerBtn.className = "btn-small";
      registerBtn.textContent = "Register";
      registerBtn.style.marginLeft = "5px";
      registerBtn.onclick = () => registerToTeam(team.name);
      tdAction.appendChild(registerBtn);
    } else {
      // Admin mode - add delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-small";
      deleteBtn.textContent = "Delete";
      deleteBtn.style.marginLeft = "5px";
      deleteBtn.style.backgroundColor="#ef4444";
      deleteBtn.onclick = () => deleteTeam(team.name);
      tdAction.appendChild(deleteBtn);
    }

    tr.appendChild(tdAction);
    body.appendChild(tr);
  });
}

async function registerToTeam(teamName) {
  if (currentUser.teamName) {
    alert("You are already registered in a team. Please leave your current team first.");
    return;
  }
  
  try {
    await apiCall("/team-requests", "POST", {
      playerId: currentUser.id,
      teamName: teamName
    });
    alert("Registration request sent to team captain!");
  } catch (err) {
    alert(err.message);
  }
}
window.registerToTeam = registerToTeam;

async function showTeamDetails(team) {
  const panel = document.getElementById("team-detail-panel");
  document.getElementById("team-detail-title").textContent = team.name;
  
  const details = await apiCall(`/teams/${team.name}`);
  
  let content = `
    <div style="padding: 1rem;">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
        <div><strong>City:</strong> ${details.city}</div>
        <div><strong>Founded:</strong> ${details.foundedYear}</div>
        <div><strong>Players:</strong> ${details.players.length}</div>
      </div>
      <hr style="border:0; border-top:1px solid #333; margin:1rem 0;">
      <h5>Roster:</h5>
  `;
  
  if (!isPlayerMode) {
    // Admin view - show players with captain controls
    content += `<div style="margin-top:0.5rem;">`;
    details.players.forEach(p => {
      content += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; border-bottom:1px solid #333;">
          <span>#${p.shirtNumber} ${p.name} (${p.position}) - ${p.role}</span>
          ${p.role !== 'Captain' ? `<button class="btn-small" onclick="setCaptain('${team.name}', ${p.id})">Make Captain</button>` : '<span class="badge" style="background:rgba(234, 179, 8, 0.2); border-color:#eab308;">Captain</span>'}
        </div>
      `;
    });
    content += `</div>`;
  } else {
    // Player view - simple roster
    content += `
      <div class="tag-row">
        ${details.players.map(p => `<span class="tag">#${p.shirtNumber} ${p.name} (${p.position}) ${p.role === 'Captain' ? '⭐' : ''}</span>`).join('')}
      </div>
    `;
  }
  
  content += `</div>`;
  
  document.getElementById("team-detail-content").innerHTML = content;
  panel.classList.remove("hidden");
}

async function setCaptain(teamName, playerId) {
  try {
    await apiCall(`/teams/${teamName}/captain`, "PUT", { playerId });
    alert("Captain updated successfully!");
    showTeamDetails({ name: teamName });
  } catch (err) {
    alert("Error setting captain: " + err.message);
  }
}
window.setCaptain = setCaptain;

async function deleteTeam(teamName) {
  if (!confirm(`Are you sure you want to delete the team "${teamName}"?`)) {
    return;
  }

  try {
    await apiCall(`/teams/${teamName}`, "DELETE");
    alert("Team deleted successfully!");
    await renderTeamsTable();
  } catch (err) {
    alert("Error deleting team: " + err.message);
  }
}
window.deleteTeam = deleteTeam;

async function renderPlayerTeamsTable(filter = "") {
  await loadTeams(filter);
  
  const body = document.getElementById("player-teams-table-body");
  body.innerHTML = "";
  
  teams.forEach(team => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${team.name}</td>
      <td>${team.city}</td>
      <td>${team.playerCount}</td>
    `;
    const tdAction = document.createElement("td");
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn-small";
    viewBtn.textContent = "View";
    viewBtn.onclick = () => showTeamDetails(team);
    tdAction.appendChild(viewBtn);
    
    const registerBtn = document.createElement("button");
    registerBtn.className = "btn-small";
    registerBtn.textContent = "Register";
    registerBtn.style.marginLeft = "5px";
    registerBtn.onclick = () => registerToTeam(team.name);
    tdAction.appendChild(registerBtn);
    
    tr.appendChild(tdAction);
    body.appendChild(tr);
  });
}

async function renderTeamRequests() {
  if (!currentUser.isCaptain) {
    document.getElementById("requests-content").innerHTML = `
      <div class="muted-text">You are not a team captain.</div>
    `;
    return;
  }
  
  await loadTeamRequests();
  
  const container = document.getElementById("requests-content");
  
  if (teamRequests.length === 0) {
    container.innerHTML = `<div class="muted-text">No pending requests.</div>`;
    return;
  }
  
  container.innerHTML = teamRequests.map(req => `
    <div class="match-card" style="margin-bottom:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${req.playerName}</strong> - ${req.position} #${req.shirtNumber}
          <div class="muted-text" style="font-size:0.8rem;">Team: ${req.teamName} | ${new Date(req.requestDate).toLocaleDateString()}</div>
        </div>
        <div>
          <button class="btn-small" style="background:#22c55e; border-color:#16a34a; margin-right:5px;" onclick="handleRequest(${req.id}, 'accepted')">Accept</button>
          <button class="btn-small" style="background:#ef4444; border-color:#dc2626;" onclick="handleRequest(${req.id}, 'rejected')">Reject</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function handleRequest(requestId, status) {
  try {
    await apiCall(`/team-requests/${requestId}`, "PUT", { status });
    alert(`Request ${status}!`);
    renderTeamRequests();
  } catch (err) {
    alert("Error: " + err.message);
  }
}
window.handleRequest = handleRequest;

// PART 3 - MATCHES, TOURNAMENTS, AND PLAYERS

async function renderPlayersTable(filter = "") {
  await loadPlayers(isPlayerMode ? currentUser.teamName : null, filter);
  
  const body = document.getElementById("players-table-body");
  body.innerHTML = "";
  
  players.forEach((p, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${p.name} ${p.hasInjury ? '<span class="badge" style="background:rgba(239, 68, 68, 0.2); border-color:#ef4444; color:#fca5a5;">Injured</span>' : ''}</td>
      <td>${p.position}</td>
      <td>${p.goals || 0}</td>
      <td>${p.assists || 0}</td>
    `;
    const tdActions = document.createElement("td");
    
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn-small";
    viewBtn.textContent = "View";
    viewBtn.style.marginRight = "5px";
    viewBtn.onclick = () => showPlayerDetail(p);
    
    tdActions.appendChild(viewBtn);
    
    if (!isPlayerMode) {
      const delBtn = document.createElement("button");
      delBtn.className = "btn-small";
      delBtn.textContent = "Delete";
      delBtn.style.color = "#ef4444";
      delBtn.onclick = async () => {
        if (confirm("Delete player?")) {
          await apiCall(`/players/${p.id}`, "DELETE");
          renderPlayersTable();
        }
      };
      tdActions.appendChild(delBtn);
    }
    
    tr.appendChild(tdActions);
    body.appendChild(tr);
  });
}

async function showPlayerDetail(player) {
  const panel = document.getElementById("player-detail-panel");
  const tableContainer = document.getElementById("players-table-container");
  const content = document.getElementById("player-detail-content");
  
  const details = await apiCall(`/players/${player.id}`);
  
  tableContainer.classList.add("hidden");
  panel.classList.remove("hidden");
  
  content.innerHTML = `
    <div class="player-card-main">
      <div class="player-name-row">
        <span>${player.name}</span>
        <span class="badge blue">${player.teamName || "No Team"}</span>
        ${player.playerRole === 'Captain' ? '<span class="badge" style="background:rgba(234, 179, 8, 0.2); border-color:#eab308; color:#facc15;">Captain</span>' : ''}
      </div>
      <div class="player-meta">
        Pos: ${player.position} | Shirt: #${player.shirtNumber} | ${player.nationality}
      </div>
      <div style="margin-top:1rem; border-top:1px solid #333; padding-top:1rem;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; font-size:0.9rem;">
          <div>Goals: <span style="color:#4ade80">${player.goals}</span></div>
          <div>Assists: <span style="color:#60a5fa">${player.assists}</span></div>
          <div>Height: ${player.height} cm</div>
          <div>Weight: ${player.weight} kg</div>
        </div>
        ${details.injuries && details.injuries.length > 0 ? `
        <div style="margin-top:1rem;">
          <strong>Injuries:</strong>
          ${details.injuries.map(i => `
            <div style="font-size:0.85rem; color:#ef4444;">
              ${i.description} - Recovery: ${new Date(i.recoveryDate).toLocaleDateString()}
            </div>
          `).join('')}
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

async function renderMatchesView(filter = "") {
  await loadMatches(isPlayerMode ? currentUser.teamName : null, filter);
  
  const upcomingContainer = document.getElementById("upcoming-matches-container");
  const pastContainer = document.getElementById("past-matches-container");
  
  const upcomingMatches = matches.filter(m => !m.isPast);
  const pastMatches = matches.filter(m => m.isPast);
  
  // Upcoming matches
  if (upcomingMatches.length === 0) {
    upcomingContainer.innerHTML = "<div class='muted-text'>No upcoming matches.</div>";
  } else {
    upcomingContainer.innerHTML = upcomingMatches.map(match => `
      <div class="match-card">
        <div class="match-meta" style="justify-content:space-between;">
          <strong>${match.hostTeamName} vs ${match.guestTeamName}</strong>
          ${!isPlayerMode ? `<button class="btn-small" style="background:#ef4444; border-color:#dc2626;" onclick="deleteMatch(${match.id})">Delete</button>` : ''}
        </div>
        <div class="match-meta">
          📅 ${new Date(match.date).toLocaleString()} @ ${match.stadium}
        </div>
      </div>
    `).join('');
  }
  
  // Past matches
  if (pastMatches.length === 0) {
    pastContainer.innerHTML = "<div class='muted-text'>No past matches.</div>";
  } else {
    pastContainer.innerHTML = pastMatches.map(match => `
      <div class="match-card">
        <div class="match-meta" style="justify-content:space-between;">
          <div>
            <strong>${match.hostTeamName} ${match.hostScore} - ${match.guestScore} ${match.guestTeamName}</strong>
            <div class="muted-text" style="font-size:0.8rem;">
              📅 ${new Date(match.date).toLocaleString()} @ ${match.stadium}
            </div>
          </div>
          <div>
            <button class="btn-small" onclick="viewMatchEvents(${match.id})">View Events</button>
            ${!isPlayerMode ? `<button class="btn-small" onclick="editMatchScore(${match.id})" style="margin-left:5px;">Edit</button>` : ''}
            ${!isPlayerMode ? `<button class="btn-small" style="background:#ef4444; border-color:#dc2626; margin-left:5px;" onclick="deleteMatch(${match.id})">Delete</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }
}

async function deleteMatch(matchId) {
  if (!confirm("Are you sure you want to delete this match?")) return;
  
  try {
    await apiCall(`/matches/${matchId}`, "DELETE");
    alert("Match deleted successfully!");
    renderMatchesView();
  } catch (err) {
    alert("Error deleting match: " + err.message);
  }
}
window.deleteMatch = deleteMatch;

async function viewMatchEvents(matchId) {
  try {
    const match = matches.find(m => m.id === matchId);
    const events = await apiCall(`/matches/${matchId}/events`);

    const panel = document.getElementById("match-events-panel");
    const content = document.getElementById("match-events-content");

    let html = '';

    // Add event form for admins
    if (!isPlayerMode && match) {
      html += `
        <div style="background:#1a1a1a; padding:1rem; border-radius:8px; margin-bottom:1rem;">
          <h4 style="margin-top:0;">Add Match Event</h4>
          <form id="add-event-form" style="display:grid; gap:0.5rem;">
            <select id="add-event-player" class="input" required>
              <option value="">Select Player</option>
            </select>
            <select id="add-event-type" class="input" required>
              <option value="">Select Event Type</option>
              <option value="goal">Goal</option>
              <option value="assist">Assist</option>
            </select>
            <input type="number" id="add-event-time" class="input" placeholder="Minute" min="1" max="120" required>
            <button type="submit" class="btn-small" style="background:#22c55e; border-color:#16a34a;">Add Event</button>
          </form>
        </div>
      `;

      // Load players from both teams
      setTimeout(async () => {
        try {
          const hostPlayers = await apiCall(`/players?teamName=${encodeURIComponent(match.hostTeamName)}`);
          const guestPlayers = await apiCall(`/players?teamName=${encodeURIComponent(match.guestTeamName)}`);

          const playerSelect = document.getElementById("add-event-player");
          if (playerSelect) {
            playerSelect.innerHTML = '<option value="">Select Player</option>';

            if (hostPlayers.length > 0) {
              playerSelect.innerHTML += `<optgroup label="${match.hostTeamName}">`;
              hostPlayers.forEach(p => {
                playerSelect.innerHTML += `<option value="${p.id}">${p.name} (#${p.shirtNumber || 'N/A'})</option>`;
              });
              playerSelect.innerHTML += '</optgroup>';
            }

            if (guestPlayers.length > 0) {
              playerSelect.innerHTML += `<optgroup label="${match.guestTeamName}">`;
              guestPlayers.forEach(p => {
                playerSelect.innerHTML += `<option value="${p.id}">${p.name} (#${p.shirtNumber || 'N/A'})</option>`;
              });
              playerSelect.innerHTML += '</optgroup>';
            }
          }

          const form = document.getElementById("add-event-form");
          if (form) {
            form.onsubmit = async (e) => {
              e.preventDefault();
              await addMatchEvent(matchId);
            };
          }
        } catch (err) {
          console.error("Error loading players:", err);
        }
      }, 100);
    }

    // Display events
    if (events.length === 0) {
      html += "<div class='muted-text'>No events recorded for this match.</div>";
    } else {
      html += events.map(e => `
        <div style="padding:0.5rem; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${e.time}'</strong> - ${e.type.toUpperCase()} by ${e.playerName}
          </div>
          ${!isPlayerMode ? `<button class="btn-small" style="background:#ef4444; border-color:#dc2626; font-size:0.7rem; padding:2px 8px;" onclick="deleteMatchEvent(${matchId}, ${e.id})">Delete</button>` : ''}
        </div>
      `).join('');
    }

    content.innerHTML = html;
    panel.classList.remove("hidden");
  } catch (err) {
    alert("Error loading match events: " + err.message);
  }
}
window.viewMatchEvents = viewMatchEvents;

async function addMatchEvent(matchId) {
  const playerId = document.getElementById("add-event-player").value;
  const eventType = document.getElementById("add-event-type").value;
  const eventTime = document.getElementById("add-event-time").value;

  if (!playerId || !eventType || !eventTime) {
    alert("Please fill all fields");
    return;
  }

  try {
    await apiCall(`/matches/${matchId}/events`, "POST", {
      playerId: Number(playerId),
      eventType,
      eventTime: Number(eventTime)
    });

    alert("Event added successfully!");
    document.getElementById("add-event-form").reset();
    viewMatchEvents(matchId);
  } catch (err) {
    alert("Error adding event: " + err.message);
  }
}
window.addMatchEvent = addMatchEvent;

async function deleteMatchEvent(matchId, eventId) {
  if (!confirm("Delete this event?")) return;

  try {
    await apiCall(`/matches/${matchId}/events/${eventId}`, "DELETE");
    alert("Event deleted!");
    viewMatchEvents(matchId);
  } catch (err) {
    alert("Error: " + err.message);
  }
}
window.deleteMatchEvent = deleteMatchEvent;

async function createMatch(event) {
  event.preventDefault();
  const hostTeamName = document.getElementById("create-match-host").value.trim();
  const guestTeamName = document.getElementById("create-match-guest").value.trim();
  const stadium = document.getElementById("create-match-stadium").value;
  const datetime = document.getElementById("create-match-datetime").value;
  const tournamentId = document.getElementById("create-match-tournament").value;
  
  if (!hostTeamName || !guestTeamName || !stadium || !datetime) {
    alert("Please fill all required fields");
    return;
  }
  
  try {
    await apiCall("/matches", "POST", {
      hostTeamName,
      guestTeamName,
      stadium,
      matchDate: datetime,
      tournamentId: tournamentId || null
    });
    
    alert("Match created successfully!");
    document.getElementById("create-match-form").reset();
    document.getElementById("create-match-panel").classList.add("hidden");
    renderMatchesView();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function editMatchScore(matchId) {
  const match = matches.find(m => m.id === matchId);
  if (!match) return;
  
  document.getElementById("edit-match-stadium").value = match.stadium;
  document.getElementById("edit-match-datetime").value = new Date(match.date).toISOString().slice(0, 16);
  document.getElementById("edit-match-host-score").value = match.hostScore ?? "";
  document.getElementById("edit-match-guest-score").value = match.guestScore ?? "";
  document.getElementById("edit-match-form").dataset.matchId = matchId;
  
  document.getElementById("edit-match-panel").classList.remove("hidden");
}
window.editMatchScore = editMatchScore;

async function updateMatch(e) {
  e.preventDefault();
  const id = Number(e.target.dataset.matchId);
  
  const stadium = document.getElementById("edit-match-stadium").value;
  const datetime = document.getElementById("edit-match-datetime").value;
  const hostScore = document.getElementById("edit-match-host-score").value;
  const guestScore = document.getElementById("edit-match-guest-score").value;
  
  try {
    await apiCall(`/matches/${id}`, "PUT", {
      stadium,
      matchDate: datetime,
      hostScore: Number(hostScore),
      guestScore: Number(guestScore)
    });
    
    alert("Match updated successfully!");
    document.getElementById("edit-match-panel").classList.add("hidden");
    renderMatchesView();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function renderTournaments() {
  await loadTournaments();
  if (!isPlayerMode) {
    await loadTournamentRequests();
  }

  const container = document.getElementById("tournaments-list-container");

  if (tournaments.length === 0) {
    container.innerHTML = "<div class='muted-text'>No tournaments found.</div>";
    return;
  }

  const { upcoming, current, past } = categorizeTournaments(tournaments);

  let html = '';

  // Upcoming Tournaments
  html += '<h4 style="margin-top:1rem; color:#60a5fa;">Upcoming Tournaments</h4>';
  if (upcoming.length === 0) {
    html += "<div class='muted-text' style='margin-bottom:1rem;'>No upcoming tournaments.</div>";
  } else {
    html += upcoming.map(t => {
      const requestsForTournament = !isPlayerMode ? tournamentRequests.filter(req => req.tournamentId === t.id && req.status === 'pending') : [];
      return `
        <div class="match-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${t.name}</strong>
              <div class="muted-text" style="font-size:0.85rem;">
                📍 ${t.city} | ${new Date(t.startDate).toLocaleDateString()} - ${new Date(t.endDate).toLocaleDateString()}
              </div>
              <div class="muted-text" style="font-size:0.8rem;">
                🏆 1st: ${t.firstPrize} | 2nd: ${t.secondPrize} | ${t.matchCount || 0} matches | ${t.teamCount || 0} teams
              </div>
            </div>
            <div style="display:flex; gap:5px;">
              <button class="btn-small" onclick="viewTournamentDetails(${t.id})">View</button>
              ${!isPlayerMode ? `<button class="btn-small" style="background:#3b82f6; border-color:#2563eb;" onclick="viewTournamentRequests(${t.id})">Requests ${requestsForTournament.length > 0 ? '(' + requestsForTournament.length + ')' : ''}</button>` : ''}
              ${!isPlayerMode ? `<button class="btn-small" style="background:#ef4444; border-color:#dc2626;" onclick="deleteTournament(${t.id})">Delete</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Current Tournaments
  html += '<h4 style="margin-top:1.5rem; color:#22c55e;">Current Tournaments</h4>';
  if (current.length === 0) {
    html += "<div class='muted-text' style='margin-bottom:1rem;'>No current tournaments.</div>";
  } else {
    html += current.map(t => `
      <div class="match-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${t.name}</strong>
            <div class="muted-text" style="font-size:0.85rem;">
              📍 ${t.city} | ${new Date(t.startDate).toLocaleDateString()} - ${new Date(t.endDate).toLocaleDateString()}
            </div>
            <div class="muted-text" style="font-size:0.8rem;">
              🏆 1st: ${t.firstPrize} | 2nd: ${t.secondPrize} | ${t.matchCount || 0} matches | ${t.teamCount || 0} teams
            </div>
          </div>
          <div>
            <button class="btn-small" onclick="viewTournamentDetails(${t.id})">View</button>
            ${!isPlayerMode ? `<button class="btn-small" style="background:#ef4444; border-color:#dc2626; margin-left:5px;" onclick="deleteTournament(${t.id})">Delete</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  // Past Tournaments
  html += '<h4 style="margin-top:1.5rem; color:#94a3b8;">Past Tournaments</h4>';
  if (past.length === 0) {
    html += "<div class='muted-text'>No past tournaments.</div>";
  } else {
    html += past.map(t => `
      <div class="match-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${t.name}</strong>
            <div class="muted-text" style="font-size:0.85rem;">
              📍 ${t.city} | ${new Date(t.startDate).toLocaleDateString()} - ${new Date(t.endDate).toLocaleDateString()}
            </div>
            <div class="muted-text" style="font-size:0.8rem;">
              🏆 1st: ${t.firstPrize} | 2nd: ${t.secondPrize} | ${t.matchCount || 0} matches | ${t.teamCount || 0} teams
            </div>
          </div>
          <div>
            <button class="btn-small" onclick="viewTournamentDetails(${t.id})">View</button>
            ${!isPlayerMode ? `<button class="btn-small" style="background:#ef4444; border-color:#dc2626; margin-left:5px;" onclick="deleteTournament(${t.id})">Delete</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  container.innerHTML = html;
}

async function viewTournamentDetails(tournamentId) {
  try {
    const tournament = await apiCall(`/tournaments/${tournamentId}`);
    const panel = document.getElementById("tournament-detail-panel");
    const content = document.getElementById("tournament-detail-content");
    
    content.innerHTML = `
      <div style="padding:1rem;">
        <h4>${tournament.tournament_name}</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin:1rem 0;">
          <div><strong>City:</strong> ${tournament.city}</div>
          <div><strong>Dates:</strong> ${new Date(tournament.start_date).toLocaleDateString()} - ${new Date(tournament.end_date).toLocaleDateString()}</div>
          <div><strong>1st Prize:</strong> ${tournament.first_prize}</div>
          <div><strong>2nd Prize:</strong> ${tournament.second_prize}</div>
        </div>
        <hr style="border:0; border-top:1px solid #333; margin:1rem 0;">
        <h5>Matches (${tournament.matches ? tournament.matches.length : 0})</h5>
        ${!tournament.matches || tournament.matches.length === 0 ? '<div class="muted-text">No matches scheduled yet.</div>' :
          tournament.matches.map(m => `
            <div style="padding:0.5rem; border-bottom:1px solid #333;">
              📅 ${new Date(m.date).toLocaleString()} @ ${m.stadium}
              <br><strong>${m.hostTeamName || "TBD"}</strong> ${m.hostScore || 0} - ${m.guestScore || 0} <strong>${m.guestTeamName || "TBD"}</strong>
            </div>
          `).join('')
        }
        <hr style="border:0; border-top:1px solid #333; margin:1rem 0;">
        <h5>Teams (${tournament.teams ? tournament.teams.length : 0})</h5>
        ${!tournament.teams || tournament.teams.length === 0 ? '<div class="muted-text">No teams registered yet.</div>' :
        `<div class="tag-row">
          ${tournament.teams.map(t => `<span class="tag">${t.name} (${t.points} pts)</span>`).join('')}
        </div>`
        }
      </div>
    `;
    
    panel.classList.remove("hidden");
  } catch (err) {
    alert("Error loading tournament: " + err.message);
  }
}
window.viewTournamentDetails = viewTournamentDetails;

async function createTournament(e) {
  e.preventDefault();
  
  const name = document.getElementById("create-tournament-name").value;
  const city = document.getElementById("create-tournament-city").value;
  const startDate = document.getElementById("create-tournament-start").value;
  const endDate = document.getElementById("create-tournament-end").value;
  const firstPrize = document.getElementById("create-tournament-1st").value;
  const secondPrize = document.getElementById("create-tournament-2nd").value;
  
  if (!name || !city || !startDate || !endDate || !firstPrize || !secondPrize) {
    alert("Please fill all fields");
    return;
  }
  
  try {
    await apiCall("/tournaments", "POST", {
      name, city, startDate, endDate, firstPrize, secondPrize
    });
    
    alert("Tournament created successfully!");
    document.getElementById("create-tournament-form").reset();
    document.getElementById("create-tournament-panel").classList.add("hidden");
    renderTournaments();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteTournament(id) {
  if (!confirm("Are you sure you want to delete this tournament?")) return;

  try {
    await apiCall(`/tournaments/${id}`, "DELETE");
    alert("Tournament deleted!");
    renderTournaments();
  } catch (err) {
    alert("Error: " + err.message);
  }
}
window.deleteTournament = deleteTournament;

async function viewTournamentRequests(tournamentId) {
  try {
    const requests = tournamentRequests.filter(req => req.tournamentId === tournamentId);
    const tournament = tournaments.find(t => t.id === tournamentId);

    const panel = document.getElementById("tournament-requests-panel");
    const content = document.getElementById("tournament-requests-content");
    document.getElementById("tournament-requests-title").textContent = `Requests for ${tournament ? tournament.name : 'Tournament'}`;

    if (requests.length === 0) {
      content.innerHTML = "<div class='muted-text'>No registration requests for this tournament.</div>";
    } else {
      content.innerHTML = requests.map(req => `
        <div class="match-card" style="margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${req.teamName}</strong> ${req.captainName ? `(Captain: ${req.captainName})` : ''}
              <div class="muted-text" style="font-size:0.8rem;">
                Requested: ${new Date(req.requestDate).toLocaleDateString()}
              </div>
              ${req.status !== 'pending' ? `<div class="muted-text" style="font-size:0.8rem; color:${req.status === 'accepted' ? '#22c55e' : '#ef4444'};">Status: ${req.status.toUpperCase()}</div>` : ''}
            </div>
            <div>
              ${req.status === 'pending' ? `
                <button class="btn-small" style="background:#22c55e; border-color:#16a34a; margin-right:5px;" onclick="handleTournamentRequest(${req.id}, ${tournamentId}, 'accepted')">Accept</button>
                <button class="btn-small" style="background:#ef4444; border-color:#dc2626; margin-right:5px;" onclick="handleTournamentRequest(${req.id}, ${tournamentId}, 'rejected')">Reject</button>
              ` : ''}
              <button class="btn-small" style="background:#dc2626; border-color:#991b1b;" onclick="removeTournamentTeam(${req.id}, ${tournamentId})">Remove</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    panel.classList.remove("hidden");
  } catch (err) {
    alert("Error loading tournament requests: " + err.message);
  }
}
window.viewTournamentRequests = viewTournamentRequests;

async function removeTournamentTeam(requestId, tournamentId) {
  if (!confirm("Are you sure you want to remove this team from the tournament?")) return;

  try {
    await apiCall(`/tournament-requests/${requestId}`, "DELETE");
    alert("Team removed from tournament!");
    await loadTournamentRequests();
    viewTournamentRequests(tournamentId);
    renderTournaments();
  } catch (err) {
    alert("Error: " + err.message);
  }
}
window.removeTournamentTeam = removeTournamentTeam;

async function handleTournamentRequest(requestId, tournamentId, status) {
  try {
    await apiCall(`/tournament-requests/${requestId}`, "PUT", { status });
    alert(`Request ${status}!`);
    await loadTournamentRequests();
    viewTournamentRequests(tournamentId);
    renderTournaments();
  } catch (err) {
    alert("Error: " + err.message);
  }
}
window.handleTournamentRequest = handleTournamentRequest;

async function registerForTournament(tournamentId) {
  if (!currentUser.isCaptain) {
    alert("Only team captains can register for tournaments.");
    return;
  }

  if (!currentUser.teamName) {
    alert("You must be in a team to register for a tournament.");
    return;
  }

  try {
    await apiCall("/tournament-requests", "POST", {
      tournamentId: tournamentId,
      teamName: currentUser.teamName,
      captainId: currentUser.id
    });
    alert("Tournament registration request sent to admin!");
    renderPlayerTournaments();
  } catch (err) {
    alert("Error: " + err.message);
  }
}
window.registerForTournament = registerForTournament;

async function renderPlayerTournaments() {
  await loadTournaments();

  const container = document.getElementById("player-tournaments-list-container");

  if (tournaments.length === 0) {
    container.innerHTML = "<div class='muted-text'>No tournaments found.</div>";
    return;
  }

  const { upcoming, current, past } = categorizeTournaments(tournaments);

  let html = '';

  // Upcoming Tournaments
  html += '<h4 style="margin-top:1rem; color:#60a5fa;">Upcoming Tournaments</h4>';
  if (upcoming.length === 0) {
    html += "<div class='muted-text' style='margin-bottom:1rem;'>No upcoming tournaments.</div>";
  } else {
    html += upcoming.map(t => `
      <div class="match-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${t.name}</strong>
            <div class="muted-text" style="font-size:0.85rem;">
              📍 ${t.city} | ${new Date(t.startDate).toLocaleDateString()} - ${new Date(t.endDate).toLocaleDateString()}
            </div>
            <div class="muted-text" style="font-size:0.8rem;">
              🏆 1st: ${t.firstPrize} | 2nd: ${t.secondPrize} | ${t.matchCount || 0} matches | ${t.teamCount || 0} teams
            </div>
          </div>
          <div style="display:flex; gap:5px;">
            <button class="btn-small" onclick="viewTournamentDetails(${t.id})">View</button>
            ${currentUser.isCaptain ? `<button class="btn-small" style="background:#22c55e; border-color:#16a34a;" onclick="registerForTournament(${t.id})">Register</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  // Current Tournaments
  html += '<h4 style="margin-top:1.5rem; color:#22c55e;">Current Tournaments</h4>';
  if (current.length === 0) {
    html += "<div class='muted-text' style='margin-bottom:1rem;'>No current tournaments.</div>";
  } else {
    html += current.map(t => `
      <div class="match-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${t.name}</strong>
            <div class="muted-text" style="font-size:0.85rem;">
              📍 ${t.city} | ${new Date(t.startDate).toLocaleDateString()} - ${new Date(t.endDate).toLocaleDateString()}
            </div>
            <div class="muted-text" style="font-size:0.8rem;">
              🏆 1st: ${t.firstPrize} | 2nd: ${t.secondPrize} | ${t.matchCount || 0} matches | ${t.teamCount || 0} teams
            </div>
          </div>
          <div>
            <button class="btn-small" onclick="viewTournamentDetails(${t.id})">View</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Past Tournaments
  html += '<h4 style="margin-top:1.5rem; color:#94a3b8;">Past Tournaments</h4>';
  if (past.length === 0) {
    html += "<div class='muted-text'>No past tournaments.</div>";
  } else {
    html += past.map(t => `
      <div class="match-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${t.name}</strong>
            <div class="muted-text" style="font-size:0.85rem;">
              📍 ${t.city} | ${new Date(t.startDate).toLocaleDateString()} - ${new Date(t.endDate).toLocaleDateString()}
            </div>
            <div class="muted-text" style="font-size:0.8rem;">
              🏆 1st: ${t.firstPrize} | 2nd: ${t.secondPrize} | ${t.matchCount || 0} matches | ${t.teamCount || 0} teams
            </div>
          </div>
          <div>
            <button class="btn-small" onclick="viewTournamentDetails(${t.id})">View</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  container.innerHTML = html;
}

async function createTeam(e) {
  e.preventDefault();

  const name = document.getElementById("add-team-name").value.trim();
  const city = document.getElementById("add-team-city").value.trim();
  const foundedYear = document.getElementById("add-team-founded").value;

  if (!name || !city || !foundedYear) {
    alert("Please fill all fields");
    return;
  }

  try {
    await apiCall("/teams", "POST", {
      name,
      city,
      foundedYear: parseInt(foundedYear)
    });

    alert("Team created successfully!");
    document.getElementById("add-team-form").reset();
    document.getElementById("add-team-panel").classList.add("hidden");
    await renderTeamsTable();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function renderStatistics() {
  const stats = await apiCall("/statistics");
  
  document.getElementById("stat-total-goals").textContent = stats.totalGoals;
  document.getElementById("stat-total-assists").textContent = stats.totalAssists;
  
  if (stats.topScorers.length > 0) {
    const top = stats.topScorers[0];
    document.getElementById("stat-top-scorer").textContent = top.name;
    document.getElementById("stat-top-scorer-goals").textContent = `Goals: ${top.goals}`;
  }
  
  if (stats.topAssisters.length > 0) {
    const top = stats.topAssisters[0];
    document.getElementById("stat-top-assister").textContent = top.name;
    document.getElementById("stat-top-assister-assists").textContent = `Assists: ${top.assists}`;
  }
  
  const goalsBody = document.getElementById("goals-leaderboard-body");
  if (goalsBody) {
    goalsBody.innerHTML = "";
    stats.topScorers.slice(0, 5).forEach((p, i) => {
      goalsBody.innerHTML += `<tr>
        <td>${i + 1}</td>
        <td>${p.name}</td>
        <td>${p.teamName || "-"}</td>
        <td>${p.goals}</td>
      </tr>`;
    });
  }
  
  const assistsBody = document.getElementById("assists-leaderboard-body");
  if (assistsBody) {
    assistsBody.innerHTML = "";
    stats.topAssisters.slice(0, 5).forEach((p, i) => {
      assistsBody.innerHTML += `<tr>
        <td>${i + 1}</td>
        <td>${p.name}</td>
        <td>${p.teamName || "-"}</td>
        <td>${p.assists}</td>

      </tr>`;
    });
  }
  
  const teamBody = document.getElementById("team-stats-body");
  if (teamBody) {
    teamBody.innerHTML = "";
    stats.teamStats.forEach((t, i) => {
      teamBody.innerHTML += `<tr>
        <td>${i + 1}</td>
        <td>${t.teamName}</td>
        <td>${t.wins}</td>
        <td>${t.losses}</td>
        <td>${t.draws}</td>
        <td>${t.playerCount}</td>
      </tr>`;
    });
  }
}

async function addPlayer(e) {
  e.preventDefault();
  const firstName = document.getElementById("add-player-firstname").value;
  const lastName = document.getElementById("add-player-lastname").value;
  const teamName = document.getElementById("add-player-team").value;
  const position = document.getElementById("add-player-position").value;
  
  if (!firstName || !position) return;
  
  await apiCall("/players", "POST", {
    firstName,
    lastName,
    position,
    teamName: teamName || null
  });
  
  document.getElementById("add-player-panel").classList.add("hidden");
  document.getElementById("add-player-form").reset();
  renderPlayersTable();
}

// REPLACE the togglePlayerModeUI function in your script.js with this:

function togglePlayerModeUI() {
  // Get all navigation sections
  const allSections = document.querySelectorAll('.sidebar > div');
  
  // Admin sections: indices 1 (Overview), 2 (Academy), 3 (Statistics), 4 (Settings)
  // Player sections: indices 5 (My Portal), 6 (Captain), 7 (Statistics), 8 (Settings)
  
  if (isPlayerMode) {
    // HIDE admin-only sections
    allSections.forEach((section, index) => {
      // Hide: Overview (1), Academy (2), Settings (4)
      if (index === 1 || index === 2 || index === 4) {
        section.style.display = "none";
      }
      // Show: My Portal (5), Statistics (7), Settings (8)
      if (index === 5 || index === 7 || index === 8) {
        section.style.display = "";
      }
      // Show Captain section (6) only if player is captain
      if (index === 6) {
        section.style.display = currentUser.isCaptain ? "" : "none";
      }
      // Hide admin Statistics (3) but it's same view so we keep it hidden
      if (index === 3) {
        section.style.display = "none";
      }
    });
    
    document.getElementById("logo-subtitle").textContent = "Player Portal";
    
    // Hide admin action buttons
    const createMatchBtn = document.getElementById("toggle-create-match");
    const addPlayerBtn = document.getElementById("toggle-add-player");
    const createTournamentBtn = document.getElementById("toggle-create-tournament");
    const addTeamBtn = document.getElementById("toggle-add-team");
    if (createMatchBtn) createMatchBtn.style.display = "none";
    if (addPlayerBtn) addPlayerBtn.style.display = "none";
    if (createTournamentBtn) createTournamentBtn.style.display = "none";
    if (addTeamBtn) addTeamBtn.style.display = "none";
  } else {
    // SHOW admin sections, HIDE player sections
    allSections.forEach((section, index) => {
      // Show: Overview (1), Academy (2), Statistics (3), Settings (4)
      if (index === 1 || index === 2 || index === 3 || index === 4) {
        section.style.display = "";
      }
      // Hide: My Portal (5), Captain (6), Player Statistics (7), Player Settings (8)
      if (index === 5 || index === 6 || index === 7 || index === 8) {
        section.style.display = "none";
      }
    });
    
    document.getElementById("logo-subtitle").textContent = "League Admin";
    
    // Show admin action buttons
    const createMatchBtn = document.getElementById("toggle-create-match");
    const addPlayerBtn = document.getElementById("toggle-add-player");
    const createTournamentBtn = document.getElementById("toggle-create-tournament");
    const addTeamBtn = document.getElementById("toggle-add-team");
    if (createMatchBtn) createMatchBtn.style.display = "";
    if (addPlayerBtn) addPlayerBtn.style.display = "";
    if (createTournamentBtn) createTournamentBtn.style.display = "";
    if (addTeamBtn) addTeamBtn.style.display = "";
  }
} 

async function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-button-main").forEach(b => b.classList.remove("active"));
  document.getElementById("team-detail-panel").classList.add("hidden");
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");
  
  const btn = document.querySelector(`.nav-button-main[data-view="${viewName}"]`);
  if (btn) btn.classList.add("active");
  
  if (viewName === "dashboard") await renderDashboard();
  if (viewName === "my-info") await renderMyInfo();
  if (viewName === "team-info") await renderTeamInfo();
  if (viewName === "player-teams") await renderPlayerTeamsTable();
  if (viewName === "player-tournaments") await renderPlayerTournaments();
  if (viewName === "requests") await renderTeamRequests();
  if (viewName === "players") await renderPlayersTable();
  if (viewName === "teams") await renderTeamsTable();
  if (viewName === "matches") await renderMatchesView();
  if (viewName === "tournaments") await renderTournaments();
  if (viewName === "statistics") await renderStatistics();
  if (viewName === "settings" || viewName === "player-settings") initializeSettings();
}

// ==================== INITIALIZATION ====================

document.addEventListener("DOMContentLoaded", () => {
  initializeSettings();
  
  // Auth listeners
  document.getElementById("unified-login-form").addEventListener("submit", handleUnifiedLogin);
  document.getElementById("player-signup-form").addEventListener("submit", handlePlayerSignup);
  
  document.getElementById("mode-admin-login-btn").addEventListener("click", () => setMode("admin-login"));
  document.getElementById("mode-player-login-btn").addEventListener("click", () => setMode("player-login"));
  document.getElementById("mode-player-signup-btn").addEventListener("click", () => setMode("player-signup"));
  
  // Global search
  const globalSearch = document.getElementById("global-search");
  if (globalSearch) {
    globalSearch.addEventListener("input", (e) => {
      const query = e.target.value;
      const activeView = document.querySelector(".view.active");
      if (activeView) {
        if (activeView.id === "view-players") renderPlayersTable(query);
        if (activeView.id === "view-teams") renderTeamsTable(query);
        if (activeView.id === "view-player-teams") renderPlayerTeamsTable(query);
        if (activeView.id === "view-matches") renderMatchesView(query);
      }
    });
  }
  
  // Navigation
  document.querySelectorAll(".nav-button-main").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  
  document.getElementById("logout-btn").addEventListener("click", () => location.reload());
  
  // Detail panels
  const closePlayerBtn = document.getElementById("close-player-detail");
  if (closePlayerBtn) {
    closePlayerBtn.addEventListener("click", () => {
      document.getElementById("player-detail-panel").classList.add("hidden");
      document.getElementById("players-table-container").classList.remove("hidden");
    });
  }
  
  const closeTeamBtn = document.getElementById("close-team-detail");
  if (closeTeamBtn) {
    closeTeamBtn.addEventListener("click", () => {
      document.getElementById("team-detail-panel").classList.add("hidden");
    });
  }
  
  const closeMatchEventsBtn = document.getElementById("close-match-events");
  if (closeMatchEventsBtn) {
    closeMatchEventsBtn.addEventListener("click", () => {
      document.getElementById("match-events-panel").classList.add("hidden");
    });
  }
  
  const closeTournamentBtn = document.getElementById("close-tournament-detail");
  if (closeTournamentBtn) {
    closeTournamentBtn.addEventListener("click", () => {
      document.getElementById("tournament-detail-panel").classList.add("hidden");
    });
  }

  const closeTournamentRequestsBtn = document.getElementById("close-tournament-requests");
  if (closeTournamentRequestsBtn) {
    closeTournamentRequestsBtn.addEventListener("click", () => {
      document.getElementById("tournament-requests-panel").classList.add("hidden");
    });
  }

  // Match creation
  const toggleCreateMatch = document.getElementById("toggle-create-match");
  if (toggleCreateMatch) {
    toggleCreateMatch.addEventListener("click", async () => {
      const panel = document.getElementById("create-match-panel");
      panel.classList.toggle("hidden");
      
      if (!panel.classList.contains("hidden")) {
        await loadTournaments();
        const select = document.getElementById("create-match-tournament");
        select.innerHTML = '<option value="">No Tournament</option>';
        tournaments.forEach(t => {
          select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });
      }
    });
  }
  
  document.getElementById("cancel-create-match").addEventListener("click", () => {
    document.getElementById("create-match-panel").classList.add("hidden");
  });
  document.getElementById("create-match-form").addEventListener("submit", createMatch);
  
  document.getElementById("cancel-edit-match").addEventListener("click", () => {
    document.getElementById("edit-match-panel").classList.add("hidden");
  });
  document.getElementById("edit-match-form").addEventListener("submit", updateMatch);
  
  // Tournament creation
  const toggleCreateTournament = document.getElementById("toggle-create-tournament");
  if (toggleCreateTournament) {
    toggleCreateTournament.addEventListener("click", () => {
      document.getElementById("create-tournament-panel").classList.toggle("hidden");
    });
  }
  
  const cancelCreateTournament = document.getElementById("cancel-create-tournament");
  if (cancelCreateTournament) {
    cancelCreateTournament.addEventListener("click", () => {
      document.getElementById("create-tournament-panel").classList.add("hidden");
    });
  }
  
  const createTournamentForm = document.getElementById("create-tournament-form");
  if (createTournamentForm) {
    createTournamentForm.addEventListener("submit", createTournament);
  }

  // Team creation
  const toggleAddTeam = document.getElementById("toggle-add-team");
  if (toggleAddTeam) {
    toggleAddTeam.addEventListener("click", () => {
      document.getElementById("add-team-panel").classList.toggle("hidden");
    });
  }

  const cancelAddTeam = document.getElementById("cancel-add-team");
  if (cancelAddTeam) {
    cancelAddTeam.addEventListener("click", () => {
      document.getElementById("add-team-panel").classList.add("hidden");
    });
  }

  const addTeamForm = document.getElementById("add-team-form");
  if (addTeamForm) {
    addTeamForm.addEventListener("submit", createTeam);
  }

  // Theme customization
  const themePicker = document.getElementById("theme-color-picker");
  if (themePicker) {
    themePicker.addEventListener("input", (e) => {
      applyThemeColor(e.target.value);
      localStorage.setItem("theme-color", e.target.value);
    });
  }
  
  const themePickerPlayer = document.getElementById("theme-color-picker-player");
  if (themePickerPlayer) {
    themePickerPlayer.addEventListener("input", (e) => {
      applyThemeColor(e.target.value);
      localStorage.setItem("theme-color", e.target.value);
    });
  }
  
  const resetThemeBtn = document.getElementById("reset-theme");
  if (resetThemeBtn) {
    resetThemeBtn.addEventListener("click", () => {
      const defaultColor = "#22c55e";
      if(themePicker) themePicker.value = defaultColor;
      applyThemeColor(defaultColor);
      localStorage.setItem("theme-color", defaultColor);
    });
  }
  
  const resetThemeBtnPlayer = document.getElementById("reset-theme-player");
  if (resetThemeBtnPlayer) {
    resetThemeBtnPlayer.addEventListener("click", () => {
      const defaultColor = "#22c55e";
      if(themePickerPlayer) themePickerPlayer.value = defaultColor;
      applyThemeColor(defaultColor);
      localStorage.setItem("theme-color", defaultColor);
    });
  }
  
  // Password change
  const changePasswordForm = document.getElementById("change-password-form");
  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", handleChangePassword);
  }
  
  const changePasswordFormPlayer = document.getElementById("change-password-form-player");
  if (changePasswordFormPlayer) {
    changePasswordFormPlayer.addEventListener("submit", handleChangePasswordPlayer);
  }
  
  // Add player
  const addPlayerToggle = document.getElementById("toggle-add-player");
  if (addPlayerToggle) {
    addPlayerToggle.addEventListener("click", async () => {
      const panel = document.getElementById("add-player-panel");
      panel.classList.toggle("hidden");
      
      if (!panel.classList.contains("hidden")) {
        await loadTeams();
        const s = document.getElementById("add-player-team");
        s.innerHTML = '<option value="">Select Team...</option>';
        teams.forEach(t => s.innerHTML += `<option value="${t.name}">${t.name}</option>`);
      }
    });
  }
  
  const addPlayerForm = document.getElementById("add-player-form");
  if (addPlayerForm) {
    addPlayerForm.addEventListener("submit", addPlayer);
  }
});