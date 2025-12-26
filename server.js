const express = require("express");
const app = express();
const cors = require("cors");
const mariadb = require("mariadb");
const bodyParser = require("body-parser");
const path = require("path");
require('dotenv').config();

BigInt.prototype.toJSON = function() { return this.toString() }

const port = process.env.PORT || 3000;
const db = require("./db/db.js");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cors());

// Serve static files from the front-end folder
app.use(express.static(path.join(__dirname, 'front-end')));

async function withConnection(handler) {
  let conn;
  try {
    conn = await db.pool.getConnection();
    return await handler(conn);
  } finally {
    if (conn) conn.release();
  }
}
// ==================== AUTHENTICATION ====================

const DEMO_ADMIN = { email: "admin@academy.com", password: "123456", name: "Admin User" };

app.post("/api/auth/admin/login", async (req, res) => {
  const { email, password } = req.body;
  
  if (email === DEMO_ADMIN.email && password === DEMO_ADMIN.password) {
    return res.json({ success: true, user: { name: DEMO_ADMIN.name, role: "admin" } });
  }
  
  res.status(401).json({ success: false, message: "Invalid credentials" });
});

// Player Login
app.post("/api/auth/player/login", async (req, res) => {
  const { email, password } = req.body;
  
  return withConnection(async (conn) => {
    const rows = await conn.query(
      "SELECT player_id, first_name, last_name, position, email FROM player WHERE email = ? AND password = ?",   
      [email, password]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    
    const player = rows[0];
    // Get team membership
    const membership = await conn.query(
      "SELECT team_name, role FROM player_team_membership WHERE player_id = ? AND end_date > NOW() ORDER BY start_date DESC LIMIT 1",
      [player.player_id]
    );
    
    res.json({ 
      success: true, 
      user: { 
        id: player.player_id,
        name: `${player.first_name} ${player.last_name}`,
        role: "player",
        teamName: membership.length > 0 ? membership[0].team_name : null,
        isCaptain: membership.length > 0 && membership[0].role === 'Captain',
        position: player.position,
        email: player.email
      } 
    });
  });
});

// REPLACE the Player Signup endpoint in your server.js with this:

app.post("/api/auth/player/signup", async (req, res) => {
  const { firstName, lastName, email, password, age, position, height, weight, injury, fitness, nationality, shirtNumber } = req.body;
  
  if (!firstName || !email || !password || injury === "") {
    return res.status(400).json({ success: false, message: "Fill all fields" });
  }
  
  if (injury !== "none") {
    return res.status(400).json({ success: false, message: "Eligibility Failed: Cannot register with active major injury" });
  }
  
  if (fitness < 7) {
    return res.status(400).json({ success: false, message: "Eligibility Failed: Fitness level too low (minimum: 7)" });
  }
  
  return withConnection(async (conn) => {
    try {
      // Check if email already exists
      const existingUser = await conn.query(
        "SELECT email FROM player WHERE email = ?",
        [email]
      );
      
      if (existingUser.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: "This email is already registered" 
        });
      }
      
     
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - (age || 18));
      
      await conn.query(
        "INSERT INTO player (first_name, last_name, position, date_of_birth, nationality, height, weight, shirt_number, email, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName || "", position, birthDate, nationality || "Lebanese", height || 175, weight || 70, shirtNumber || 10, email, password]
      );
      
      res.json({ 
        success: true, 
        user: { 
          
          name: `${firstName} ${lastName || ""}`,
          role: "player",
          position,
          email,
          isCaptain: false,
          teamName: null
        } 
      });
    } catch (error) {
      console.error("Signup error:", error);
      
      // Handle database errors
      if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
        return res.status(400).json({ 
          success: false, 
          message: "This email is already registered" 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: "An error occurred during registration. Please try again." 
      });
    }
  });
});

// ==================== PLAYERS ====================

app.get("/api/players", async (req, res) => {
  const { teamName, search } = req.query;
  
  return withConnection(async (conn) => {
    let query = `
      SELECT p.*, ptm.team_name, ptm.start_date as membership_start, ptm.role
      FROM player p
      LEFT JOIN player_team_membership ptm ON p.player_id = ptm.player_id 
        AND ptm.end_date > NOW()
      WHERE 1=1
    `;
    const params = [];
    
    if (teamName) {
      query += " AND ptm.team_name = ?";
      params.push(teamName);
    }
    
    if (search) {
      query += " AND (p.first_name LIKE ? OR p.last_name LIKE ?)";
      params.push(`${search}%`, `${search}%`);
    }

    const rows = await conn.query(query, params);
    
    // Get injuries and stats for each player
    const players = await Promise.all(rows.map(async (p) => {
      const injuries = await conn.query(
        "SELECT * FROM injury WHERE player_id = ? AND recovery_date > NOW()",
        [p.player_id]
      );
      
      // Get goals and assists from match events
      const goals = await conn.query(
        "SELECT COUNT(*) as count FROM match_event WHERE player_id = ? AND event_type = 'goal'",
        [p.player_id]
      );
      
      const assists = await conn.query(
        "SELECT COUNT(*) as count FROM match_event WHERE player_id = ? AND event_type = 'assist'",
        [p.player_id]
      );
      
      return {
        id: p.player_id,
        name: `${p.first_name} ${p.last_name || ""}`,
        firstName: p.first_name,
        lastName: p.last_name,
        position: p.position,
        teamName: p.team_name,
        playerRole: p.role,
        hasInjury: injuries.length > 0,
        goals: goals[0].count,
        assists: assists[0].count,
        height: p.height,
        weight: p.weight,
        shirtNumber: p.shirt_number,
        nationality: p.nationality,
        dateOfBirth: p.date_of_birth,
        email: p.email
      };
    }));
    
    res.json(players);
  });
});

app.get("/api/players/:id", async (req, res) => {
  return withConnection(async (conn) => {
    const rows = await conn.query(
      "SELECT * FROM player WHERE player_id = ?",
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: "Player not found" });
    }
    
    const player = rows[0];
    const membership = await conn.query(
      "SELECT * FROM player_team_membership WHERE player_id = ? AND end_date > NOW()",
      [player.player_id]
    );
    
    const injuries = await conn.query(
      "SELECT * FROM injury WHERE player_id = ?",
      [player.player_id]
    );
    
    // Get goals and assists
    const goals = await conn.query(
      "SELECT COUNT(*) as count FROM match_event WHERE player_id = ? AND event_type = 'goal'",
      [player.player_id]
    );
    
    const assists = await conn.query(
      "SELECT COUNT(*) as count FROM match_event WHERE player_id = ? AND event_type = 'assist'",
      [player.player_id]
    );
    
    res.json({
      id: player.player_id,
      firstName: player.first_name,
      lastName: player.last_name,
      position: player.position,
      dateOfBirth: player.date_of_birth,
      nationality: player.nationality,
      height: player.height,
      weight: player.weight,
      shirtNumber: player.shirt_number,
      email: player.email,
      teamName: membership.length > 0 ? membership[0].team_name : null,
      role: membership.length > 0 ? membership[0].role : null,
      contractType: membership.length > 0 ? membership[0].contract_type : null,
      goals: goals[0].count,
      assists: assists[0].count,
      injuries: injuries.map(i => ({
        id: i.injury_id,
        description: i.injury_disc,
        date: i.injury_date,
        severity: i.injury_severity,
        recoveryDate: i.recovery_date
      }))
    });
  });
});

app.post("/api/players", async (req, res) => {
  const { firstName, lastName, position, teamName, dateOfBirth, nationality, height, weight, shirtNumber, email, password } = req.body;
  
  return withConnection(async (conn) => {
   
    
    await conn.query(
      "INSERT INTO player (first_name, last_name, position, date_of_birth, nationality, height, weight, shirt_number, email, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [firstName, lastName || "", position, dateOfBirth || new Date(), nationality || "Lebanese", height || 175, weight || 70, shirtNumber || 10, email || `player${playerId}@demo.com`, password || "123"]
    );
    
    if (teamName) {
      await conn.query(
        "INSERT INTO player_team_membership (team_name, start_date, end_date, contract_type, role) VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 'Professional', 'Player')",
        [teamName]
      );
    }
    
    res.json({ success: true, playerId });
  });
});

app.delete("/api/players/:id", async (req, res) => {
  return withConnection(async (conn) => {
    await conn.query("DELETE FROM player WHERE player_id = ?", [req.params.id]);
    res.json({ success: true });
  });
});

app.put("/api/players/:id", async (req, res) => {
  const { goals, assists, height, weight, shirtNumber } = req.body;
  
  return withConnection(async (conn) => {
    const updates = [];
    const params = [];
    
    if (height !== undefined) { updates.push("height = ?"); params.push(height); }
    if (weight !== undefined) { updates.push("weight = ?"); params.push(weight); }
    if (shirtNumber !== undefined) { updates.push("shirt_number = ?"); params.push(shirtNumber); }
    
    if (updates.length > 0) {
      params.push(req.params.id);
      await conn.query(
        `UPDATE player SET ${updates.join(", ")} WHERE player_id = ?`,
        params
      );
    }
    
    res.json({ success: true });
  });
});

// ==================== TEAMS ====================

app.get("/api/teams", async (req, res) => {
  const { search } = req.query;
  
  return withConnection(async (conn) => {
    let query = "SELECT * FROM team WHERE 1=1";
    const params = [];
    
    if (search) {
      query += " AND team_name LIKE ?";
      params.push(`%${search}%`);
    }
    
    const rows = await conn.query(query, params);
    
    const teams = await Promise.all(rows.map(async (t) => {
      const members = await conn.query(
        "SELECT COUNT(*) as count FROM player_team_membership WHERE team_name = ? AND end_date > NOW()",
        [t.team_name]
      );
      
      return {
        name: t.team_name,
        foundedYear: t.founded_year,
        city: t.city,
        playerCount: members[0].count
      };
    }));
    
    res.json(teams);
  });
});

app.get("/api/teams/:name", async (req, res) => {
  return withConnection(async (conn) => {
    const rows = await conn.query(
      "SELECT * FROM team WHERE team_name = ?",
      [req.params.name]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Team not found" });
    }

    const team = rows[0];

    const players = await conn.query(`
      SELECT p.player_id, p.first_name, p.last_name, p.position, p.shirt_number, ptm.role
      FROM player p
      JOIN player_team_membership ptm ON p.player_id = ptm.player_id
      WHERE ptm.team_name = ? AND ptm.end_date > NOW()
    `, [team.team_name]);

    // Get team statistics
    const matches = await conn.query(`
      SELECT COUNT(*) as count FROM matches
      WHERE (guest_team_name = ? OR host_team_name = ?) and match_date < NOW()
    `, [team.team_name, team.team_name]);

    // Get wins 
    const wins = await conn.query(`
      SELECT COUNT(*) as count FROM matches
      WHERE (host_team_name = ? AND host_team_score > guest_team_score)
         OR (guest_team_name = ? AND guest_team_score > host_team_score)
    `, [team.team_name, team.team_name]);

    // Get tournaments
    const tournaments = await conn.query(`
      SELECT t.tournament_id, t.tournament_name, t.start_date, t.end_date, t.city, trr.status
      FROM tournament_registration_request trr
      JOIN tournament t ON trr.tournament_id = t.tournament_id
      WHERE trr.team_name = ? AND trr.status = 'accepted'
      ORDER BY t.start_date DESC
    `, [team.team_name]);

    res.json({
      name: team.team_name,
      foundedYear: team.founded_year,
      city: team.city,
      matchesPlayed: matches[0].count,
      wins: wins[0].count,
      tournaments: tournaments.map(t => ({
        id: t.tournament_id,
        name: t.tournament_name,
        startDate: t.start_date,
        endDate: t.end_date,
        city: t.city
      })),
      players: players.map(p => ({
        id: p.player_id,
        name: `${p.first_name} ${p.last_name || ""}`,
        position: p.position,
        shirtNumber: p.shirt_number,
        role: p.role
      }))
    });
  });
});

// Add a new team (Admin only)
app.post("/api/teams", async (req, res) => {
  const { name, foundedYear, city } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: "Team name is required" });
  }

  return withConnection(async (conn) => {
    try {
      // Check if team already exists
      const existing = await conn.query(
        "SELECT * FROM team WHERE team_name = ?",
        [name]
      );

      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: "Team already exists" });
      }

      await conn.query(
        "INSERT INTO team (team_name, founded_year, city) VALUES (?, ?, ?)",
        [name, foundedYear || new Date().getFullYear(), city || ""]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error creating team:", error);
      res.status(500).json({ success: false, message: "Failed to create team" });
    }
  });
});

// Delete a team (Admin only)
app.delete("/api/teams/:name", async (req, res) => {
  return withConnection(async (conn) => {
    try {
      // Check if team has active members
      const members = await conn.query(
        "SELECT COUNT(*) as count FROM player_team_membership WHERE team_name = ? AND end_date > NOW()",
        [req.params.name]
      );

      if (members[0].count > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete team with active members. Remove all players first."
        });
      }

      await conn.query("DELETE FROM team WHERE team_name = ?", [req.params.name]);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ success: false, message: "Failed to delete team" });
    }
  });
});

// Set captain for a team
app.put("/api/teams/:name/captain", async (req, res) => {
  const { playerId } = req.body;
  const teamName = req.params.name;

  return withConnection(async (conn) => {
    // Remove captain role from all players in this team
    await conn.query(
      "UPDATE player_team_membership SET role = 'Player' WHERE team_name = ? AND end_date > NOW()",
      [teamName]
    );

    // Set new captain
    await conn.query(
      "UPDATE player_team_membership SET role = 'Captain' WHERE player_id = ? AND team_name = ? AND end_date > NOW()",
      [playerId, teamName]
    );

    res.json({ success: true });
  });
});

// Leave team
app.post("/api/teams/leave", async (req, res) => {
  const { playerId } = req.body;

  return withConnection(async (conn) => {
    await conn.query(
      "UPDATE player_team_membership SET end_date = NOW() WHERE player_id = ? AND end_date > NOW()",
      [playerId]
    );

    res.json({ success: true });
  });
});

// Remove player from team (Captain only)
app.post("/api/teams/remove-player", async (req, res) => {
  const { playerId, captainId, teamName } = req.body;

  return withConnection(async (conn) => {
    // Verify captain status
    const captain = await conn.query(
      "SELECT * FROM player_team_membership WHERE player_id = ? AND team_name = ? AND role = 'Captain' AND end_date > NOW()",
      [captainId, teamName]
    );

    if (captain.length === 0) {
      return res.status(403).json({ success: false, message: "Only team captains can remove players" });
    }

    // Don't allow captain to remove themselves
    if (playerId === captainId) {
      return res.status(400).json({ success: false, message: "Captains cannot remove themselves" });
    }

    // Remove player
    await conn.query(
      "UPDATE player_team_membership SET end_date = NOW() WHERE player_id = ? AND team_name = ? AND end_date > NOW()",
      [playerId, teamName]
    );

    res.json({ success: true, message: "Player removed from team" });
  });
});

// ==================== TEAM JOIN REQUESTS ====================

// REPLACE the POST /api/team-requests endpoint in your server.js with this:

app.post("/api/team-requests", async (req, res) => {
  const { playerId, teamName } = req.body;
  
  return withConnection(async (conn) => {
    // Check if player already in a team
    const existing = await conn.query(
      "SELECT * FROM player_team_membership WHERE player_id = ? AND end_date > NOW()",
      [playerId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "You are already in a team" });
    }
    
    // Check if team has any players
    const teamPlayers = await conn.query(
      "SELECT COUNT(*) as count FROM player_team_membership WHERE team_name = ? AND end_date > NOW()",
      [teamName]
    );
    
    const teamIsEmpty = teamPlayers[0].count === 0;
    
    // If team is empty, add player directly as captain (no request needed)
    if (teamIsEmpty) {
      await conn.query(
        "INSERT INTO player_team_membership ( player_id, team_name, start_date, end_date, contract_type, role) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 'Professional', 'Captain')",
        [ playerId, teamName]
      );
      
      return res.json({ 
        success: true, 
        message: "You have been added to the team as captain!",
        autoCaptain: true 
      });
    }
    
    // Team has players - check if captain exists
    const captains = await conn.query(
      "SELECT COUNT(*) as count FROM player_team_membership WHERE team_name = ? AND role = 'Captain' AND end_date > NOW()",
      [teamName]
    );
    
    const hasCaptain = captains[0].count > 0;
    
    if (!hasCaptain) {
      // Team has players but no captain - add as captain
      await conn.query(
        "INSERT INTO player_team_membership (player_id, team_name, start_date, end_date, contract_type, role) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 'Professional', 'Captain')",
        [playerId, teamName]
      );
      
      return res.json({ 
        success: true, 
        message: "You have been added to the team as captain!",
        autoCaptain: true 
      });
    }
    
    // Team has captain - create normal request
    const existingRequest = await conn.query(
      "SELECT * FROM team_join_request WHERE player_id = ? AND team_name = ? AND status = 'pending'",
      [playerId, teamName]
    );
    
    if (existingRequest.length > 0) {
      return res.status(400).json({ success: false, message: "Request already sent" });
    }
    
    
    await conn.query(
      "INSERT INTO team_join_request (player_id, team_name, request_date, status) VALUES (?, ?, NOW(), 'pending')",
      [playerId, teamName]
    );
    
    res.json({ 
      success: true, 
      message: "Registration request sent to team captain!",
      autoCaptain: false 
    });
  });
});

// Get requests for teams where player is captain
app.get("/api/team-requests/:playerId", async (req, res) => {
  return withConnection(async (conn) => {
    // Get teams where this player is captain
    const captainTeams = await conn.query(
      "SELECT team_name FROM player_team_membership WHERE player_id = ? AND role = 'Captain' AND end_date > NOW()",
      [req.params.playerId]
    );
    
    if (captainTeams.length === 0) {
      return res.json([]);
    }
    
    const teamNames = captainTeams.map(t => t.team_name);
    
    const requests = await conn.query(
      `SELECT tr.*, p.first_name, p.last_name, p.position, p.shirt_number 
       FROM team_join_request tr
       JOIN player p ON tr.player_id = p.player_id
       WHERE tr.team_name IN (?) AND tr.status = 'pending'
       ORDER BY tr.request_date DESC`,
      [teamNames]
    );
    
    res.json(requests.map(r => ({
      id: r.request_id,
      playerId: r.player_id,
      playerName: `${r.first_name} ${r.last_name}`,
      position: r.position,
      shirtNumber: r.shirt_number,
      teamName: r.team_name,
      requestDate: r.request_date,
      status: r.status
    })));
  });
});

// Accept/Reject request
app.put("/api/team-requests/:id", async (req, res) => {
  const { status } = req.body; // 'accepted' or 'rejected'
  
  return withConnection(async (conn) => {
    const request = await conn.query(
      "SELECT * FROM team_join_request WHERE request_id = ?",
      [req.params.id]
    );
    
    if (request.length === 0) {
      return res.status(404).json({ message: "Request not found" });
    }
    
    const { player_id, team_name } = request[0]; //destructure to get player_id and team_name
                                                // destructure is used to extract values from objects or arrays
                                                // here we extract player_id and team_name from the request object
                                                // the request[0] contains the first row of the result set from the query
    
    if (status === 'accepted') {
      // Add player to team
      const membershipId = Date.now();
      await conn.query(
        "INSERT INTO player_team_membership (player_id, team_name, start_date, end_date, contract_type, role) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 'Professional', 'Player')",
        [player_id, team_name]
      );
    }
    
    // Update request status
    await conn.query(
      "UPDATE team_join_request SET status = ? WHERE request_id = ?",
      [status, req.params.id]
    );
    
    res.json({ success: true });
  });
});

// ==================== TOURNAMENTS ====================

app.get("/api/tournaments", async (req, res) => {
  return withConnection(async (conn) => {
    const tournaments = await conn.query("SELECT * FROM tournament ORDER BY start_date DESC");
    
    const result = await Promise.all(tournaments.map(async (t) => {
      const matches = await conn.query(
        "SELECT COUNT(*) as count FROM matches WHERE tournament_id = ?",
        [t.tournament_id]
      );
      
      const teams = await conn.query(
        "SELECT COUNT(*) as count FROM tournament_registration_request WHERE tournament_id = ? AND status = 'accepted'",
        [t.tournament_id]
      );
      
      return {
        id: t.tournament_id,
        name: t.tournament_name,
        city: t.city,
        startDate: t.start_date,
        endDate: t.end_date,
        firstPrize: t.first_prize,
        secondPrize: t.second_prize,
        matchCount: matches[0].count,
        teamCount: teams[0].count
      };
    }));
    
    res.json(result);
  });
});

app.get("/api/tournaments/:id", async (req, res) => {
  return withConnection(async (conn) => {
    const tournament = await conn.query(
      "SELECT * FROM tournament WHERE tournament_id = ?",
      [req.params.id]
    );
    
    if (tournament.length === 0) {
      return res.status(404).json({ message: "Tournament not found" });
    }
    
    const matchesRaw = await conn.query(
      "SELECT * FROM matches WHERE tournament_id = ? ORDER BY match_date",
      [req.params.id]
    );

    // Map matches - team names are now stored directly in the table
    const matches = matchesRaw.map(m => ({
      id: m.match_id,
      date: m.match_date,
      stadium: m.stadium,
      hostTeamName: m.host_team_name || "TBD",
      guestTeamName: m.guest_team_name || "TBD",
      hostScore: m.host_team_score || 0,
      guestScore: m.guest_team_score || 0
    }));

    const teams = await conn.query(
      "SELECT trr.*, t.city FROM tournament_registration_request trr JOIN team t ON trr.team_name = t.team_name WHERE trr.tournament_id = ? AND trr.status = 'accepted' ORDER BY trr.points DESC",
      [req.params.id]
    );

    res.json({
      ...tournament[0],
      id: tournament[0].tournament_id,
      name: tournament[0].tournament_name,
      matches: matches,
      teams: teams.map(t => ({
        name: t.team_name,
        points: t.points,
        city: t.city
      }))
    });
  });
});

app.post("/api/tournaments", async (req, res) => {
  const { name, city, startDate, endDate, firstPrize, secondPrize } = req.body;
  
  return withConnection(async (conn) => {
    
    
    await conn.query(
      "INSERT INTO tournament (tournament_name, city, start_date, end_date, first_prize, second_prize) VALUES (?, ?, ?, ?, ?, ?)",
      [name, city, startDate, endDate, firstPrize, secondPrize]
    );

    res.json({ success: true });
  });
});

app.delete("/api/tournaments/:id", async (req, res) => {
  return withConnection(async (conn) => {
    await conn.query("DELETE FROM tournament WHERE tournament_id = ?", [req.params.id]);
    res.json({ success: true });
  });
});

// ==================== TOURNAMENT REGISTRATION REQUESTS ====================

// Create a tournament registration request
app.post("/api/tournament-requests", async (req, res) => {
  const { tournamentId, teamName, captainId } = req.body;

  return withConnection(async (conn) => {
    // Check if request already exists
    const existing = await conn.query(
      "SELECT * FROM tournament_registration_request WHERE tournament_id = ? AND team_name = ? AND status = 'pending'",
      [tournamentId, teamName]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "A pending request already exists for this team and tournament"
      });
    }

    // Check if team is already registered in tournament
    const alreadyRegistered = await conn.query(
      "SELECT * FROM tournament_registration_request WHERE tournament_id = ? AND team_name = ?",
      [tournamentId, teamName]
    );

    if (alreadyRegistered.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Your team is already registered in this tournament"
      });
    }

    // Create the request
    const result = await conn.query(
      "INSERT INTO tournament_registration_request (tournament_id, team_name, captain_id, request_date, status) VALUES (?, ?, ?, NOW(), 'pending')",
      [tournamentId, teamName, captainId]
    );

    res.json({
      success: true,
      message: "Registration request sent successfully",
      requestId: Number(result.insertId)
    });
  });
});

// Get all tournament registration requests
app.get("/api/tournament-requests", async (_req, res) => {
  return withConnection(async (conn) => {
    const requests = await conn.query(`
      SELECT
        trr.request_id as id,
        trr.tournament_id as tournamentId,
        trr.team_name as teamName,
        trr.request_date as requestDate,
        trr.status,
        t.tournament_name,
        CONCAT(p.first_name, ' ', p.last_name) as captainName
      FROM tournament_registration_request trr
      JOIN tournament t ON trr.tournament_id = t.tournament_id
      LEFT JOIN player p ON trr.captain_id = p.player_id
      ORDER BY trr.request_date DESC
    `);

    res.json(requests);
  });
});

// Update tournament registration request status (accept/reject)
app.put("/api/tournament-requests/:id", async (req, res) => {
  const { status } = req.body; // 'accepted' or 'rejected'

  return withConnection(async (conn) => {
    const request = await conn.query(
      "SELECT * FROM tournament_registration_request WHERE request_id = ?",
      [req.params.id]
    );

    if (request.length === 0) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    // Update request status (points are already in the table with default 0)
    await conn.query(
      "UPDATE tournament_registration_request SET status = ? WHERE request_id = ?",
      [status, req.params.id]
    );

    res.json({ success: true, message: `Request ${status}` });
  });
});

// Remove team from tournament (delete registration)
app.delete("/api/tournament-requests/:id", async (req, res) => {
  return withConnection(async (conn) => {
    await conn.query(
      "DELETE FROM tournament_registration_request WHERE request_id = ?",
      [req.params.id]
    );

    res.json({ success: true, message: "Team removed from tournament" });
  });
});

// ==================== MATCHES ====================

app.get("/api/matches", async (req, res) => {
  const { teamName, search, tournamentId } = req.query;

  return withConnection(async (conn) => {
    let query = "SELECT * FROM matches WHERE 1=1";
    const params = [];

    if (teamName) {
      query += " AND (host_team_name = ? OR guest_team_name = ?)";
      params.push(teamName, teamName);
    }

    if (tournamentId) {
      query += " AND tournament_id = ?";
      params.push(tournamentId);
    }

    if (search) {
      query += " AND stadium LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY match_date DESC";

    const rows = await conn.query(query, params);

    const matches = await Promise.all(rows.map(async (m) => {
      const events = await conn.query(
        "SELECT * FROM match_event WHERE match_id = ?",
        [m.match_id]
      );

      return {
        id: m.match_id,
        date: m.match_date,
        stadium: m.stadium,
        hostTeamName: m.host_team_name || "TBD",
        guestTeamName: m.guest_team_name || "TBD",
        hostScore: m.host_team_score || 0,
        guestScore: m.guest_team_score || 0,
        tournamentId: m.tournament_id,
        isPast: new Date(m.match_date) < new Date(),
        events: events.map(e => ({
          id: e.event_id,
          type: e.event_type,
          time: e.event_time,
          playerId: e.player_id
        }))
      };
    }));

    res.json(matches);
  });
});

app.get("/api/matches/:id/events", async (req, res) => {
  return withConnection(async (conn) => {
    const events = await conn.query(
      `SELECT me.*, p.first_name, p.last_name
       FROM match_event me
       JOIN player p ON me.player_id = p.player_id
       WHERE me.match_id = ?
       ORDER BY me.event_time`,
      [req.params.id]
    );

    res.json(events.map(e => ({
      id: e.event_id,
      type: e.event_type,
      time: e.event_time,
      playerId: e.player_id,
      playerName: `${e.first_name} ${e.last_name}`
    })));
  });
});

app.post("/api/matches/:id/events", async (req, res) => {
  const { playerId, eventType, eventTime } = req.body;

  return withConnection(async (conn) => {
    // Validate player exists
    const player = await conn.query(
      "SELECT * FROM player WHERE player_id = ?",
      [playerId]
    );

    if (player.length === 0) {
      return res.status(400).json({ success: false, message: "Player not found" });
    }

    // Get match details
    const match = await conn.query(
      "SELECT * FROM matches WHERE match_id = ?",
      [req.params.id]
    );

    if (match.length === 0) {
      return res.status(400).json({ success: false, message: "Match not found" });
    }

    const matchData = match[0];

    // Insert the event
    await conn.query(
      "INSERT INTO match_event (match_id, player_id, event_type, event_time) VALUES (?, ?, ?, ?)",
      [req.params.id, playerId, eventType, eventTime]
    );

    // If event type is "goal", check if we need to increment team score
    if (eventType.toLowerCase() === "goal") {
      // Determine which team the player belongs to
      const playerTeam = await conn.query(
        "SELECT team_name FROM player Natural Join player_team_membership WHERE player_id = ?",
        [playerId]
      );

      if (playerTeam.length > 0) {
        const teamName = playerTeam[0].team_name;

        // Count total goal events for this team in this match
        const goalCount = await conn.query(
          `SELECT COUNT(*) as count FROM match_event me
           JOIN player p JOIN player_team_membership ptm ON me.player_id = p.player_id AND p.player_id = ptm.player_id
           WHERE me.match_id = ? AND ptm.team_name = ? AND me.event_type = 'goal'`,
          [req.params.id, teamName]
        );

        const totalGoals = goalCount[0].count;

        // Check if this team is host or guest and get current score
        if (teamName === matchData.host_team_name) {
          const currentScore = matchData.host_team_score || 0;

          // Increment score if current score <= total goal events
          if (currentScore < totalGoals) {
            await conn.query(
              "UPDATE matches SET host_team_score = ? WHERE match_id = ?",
              [totalGoals, req.params.id]
            );
          }
        } else if (teamName === matchData.guest_team_name) {
          const currentScore = matchData.guest_team_score || 0;

          // Increment score if current score <= total goal events
          if (currentScore < totalGoals) {
            await conn.query(
              "UPDATE matches SET guest_team_score = ? WHERE match_id = ?",
              [totalGoals, req.params.id]
            );
          }
        }

        // Recalculate tournament points if this is a tournament match
        if (matchData.tournament_id) {
          await recalculateTournamentPoints(conn, matchData.tournament_id);
        }
      }
    }

    res.json({ success: true, message: "Event added successfully" });
  });
});

app.delete("/api/matches/:matchId/events/:eventId", async (req, res) => {
  return withConnection(async (conn) => {
    await conn.query("DELETE FROM match_event WHERE event_id = ?", [req.params.eventId]);
    res.json({ success: true });
  });
});

app.post("/api/matches", async (req, res) => { //this is to create a match
  const { hostTeamName, guestTeamName, stadium, matchDate, tournamentId } = req.body;
  
  return withConnection(async (conn) => {
    // Validate team names
    const hostTeam = await conn.query("SELECT * FROM team WHERE team_name = ?", [hostTeamName]);
    const guestTeam = await conn.query("SELECT * FROM team WHERE team_name = ?", [guestTeamName]);
    
    if (hostTeam.length === 0) {
      return res.status(400).json({ success: false, message: `Team "${hostTeamName}" does not exist` });
    }
    
    if (guestTeam.length === 0) {
      return res.status(400).json({ success: false, message: `Team "${guestTeamName}" does not exist` });
    }
    
    const matchId = Date.now();

    // Insert match with team names directly
    await conn.query(
      "INSERT INTO matches (match_date, stadium, host_team_name, guest_team_name, tournament_id, host_team_score, guest_team_score) VALUES (?, ?, ?, ?, ?, 0, 0)",
      [matchDate, stadium, hostTeamName, guestTeamName, tournamentId || null]
    );

    res.json({ success: true, matchId });
  });
});

app.delete("/api/matches/:id", async (req, res) => {
  return withConnection(async (conn) => {
    await conn.query("DELETE FROM matches WHERE match_id = ?", [req.params.id]);
    res.json({ success: true });
  });
});

app.put("/api/matches/:id", async (req, res) => {
  const { stadium, matchDate, hostScore, guestScore } = req.body;

  return withConnection(async (conn) => {
    const updates = [];
    const params = [];

    if (stadium) { updates.push("stadium = ?"); params.push(stadium); }
    if (matchDate) { updates.push("match_date = ?"); params.push(matchDate); }
    if (hostScore !== undefined) { updates.push("host_team_score = ?"); params.push(hostScore); }
    if (guestScore !== undefined) { updates.push("guest_team_score = ?"); params.push(guestScore); }

    if (updates.length > 0) {
      params.push(req.params.id);
      await conn.query(
        `UPDATE matches SET ${updates.join(", ")} WHERE match_id = ?`,
        params
      );

      // If scores were updated, recalculate tournament points
      if (hostScore !== undefined && guestScore !== undefined) {
        // Get match details
        const match = await conn.query(
          "SELECT * FROM matches WHERE match_id = ?",
          [req.params.id]
        );

        if (match.length > 0 && match[0].tournament_id) {
          const tournamentId = match[0].tournament_id;

          // Calculate wins for all teams in the tournament
          await recalculateTournamentPoints(conn, tournamentId);
        }
      }
    }

    res.json({ success: true });
  });
});

// Helper function to recalculate tournament points based on wins
async function recalculateTournamentPoints(conn, tournamentId) {
  // Get all teams in the tournament
  const teams = await conn.query(
    "SELECT DISTINCT team_name FROM tournament_registration_request WHERE tournament_id = ? AND status = 'accepted'",
    [tournamentId]
  );

  // For each team, count wins and update points (3 points per win)
  for (const team of teams) {
    const wins = await conn.query(
      `SELECT COUNT(*) as count FROM matches
       WHERE tournament_id = ?
       AND ((host_team_name = ? AND host_team_score > guest_team_score)
            OR (guest_team_name = ? AND guest_team_score > host_team_score))`,
      [tournamentId, team.team_name, team.team_name]
    );

    const points = wins[0].count * 3; // 3 points per win

    await conn.query(
      "UPDATE tournament_registration_request SET points = ? WHERE tournament_id = ? AND team_name = ?",
      [points, tournamentId, team.team_name]
    );
  }
}

// ==================== STATISTICS ====================

app.get("/api/statistics", async (req, res) => {
  return withConnection(async (conn) => {
    try {
      console.log("Starting statistics endpoint...");

      // Total goals and assists
      console.log("Fetching total goals and assists...");
      const totalGoals = await conn.query("SELECT COUNT(*) as total FROM match_event WHERE event_type = 'goal'");
      const totalAssists = await conn.query("SELECT COUNT(*) as total FROM match_event WHERE event_type = 'assist'");
      console.log("Total goals and assists fetched successfully");

      // Top scorers
      console.log("Fetching top scorers...");
      const topScorers = await conn.query(`
        SELECT p.player_id, p.first_name, p.last_name, ptm.team_name, COUNT(me.event_id) as goals
        FROM player p
        LEFT JOIN player_team_membership ptm ON p.player_id = ptm.player_id AND ptm.end_date > NOW()
        LEFT JOIN match_event me ON p.player_id = me.player_id AND me.event_type = 'goal'
        GROUP BY p.player_id, p.first_name, p.last_name, ptm.team_name
        ORDER BY goals DESC
        LIMIT 10
      `);
      console.log("Top scorers fetched successfully");

      // Top assisters
      console.log("Fetching top assisters...");
      const topAssisters = await conn.query(`
        SELECT p.player_id, p.first_name, p.last_name, ptm.team_name, COUNT(me.event_id) as assists
        FROM player p
        LEFT JOIN player_team_membership ptm ON p.player_id = ptm.player_id AND ptm.end_date > NOW()
        LEFT JOIN match_event me ON p.player_id = me.player_id AND me.event_type = 'assist'
        GROUP BY p.player_id, p.first_name, p.last_name, ptm.team_name
        ORDER BY assists DESC
        LIMIT 10
      `);
      console.log("Top assisters fetched successfully");

      // Team leaderboard - Get all teams with their wins, losses, and draws
      console.log("Fetching team leaderboard...");
      const allTeams = await conn.query("SELECT team_name FROM team");
      console.log(`Found ${allTeams.length} teams`);

      const teamLeaderboard = [];

      for (const team of allTeams) {
        console.log(`Processing team: ${team.team_name}`);

        // Count wins
        const wins = await conn.query(
          `SELECT COUNT(*) as count FROM matches
           WHERE (host_team_name = ? AND host_team_score > guest_team_score)
              OR (guest_team_name = ? AND guest_team_score > host_team_score)`,
          [team.team_name, team.team_name]
        );

        // Count losses
        const losses = await conn.query(
          `SELECT COUNT(*) as count FROM matches
           WHERE (host_team_name = ? AND host_team_score < guest_team_score)
              OR (guest_team_name = ? AND guest_team_score < host_team_score)`,
          [team.team_name, team.team_name]
        );

        // Count draws
        const draws = await conn.query(
          `SELECT COUNT(*) as count FROM matches
           WHERE (host_team_name = ? OR guest_team_name = ?)
              AND host_team_score = guest_team_score
              AND match_date < NOW()`,
          [team.team_name, team.team_name]
        );

        // Count player count
        const playerCount = await conn.query(
          "SELECT COUNT(*) as count FROM player_team_membership WHERE team_name = ? AND end_date > NOW()",
          [team.team_name]
        );

        const teamData = {
          teamName: team.team_name,
          wins: Number(wins[0].count),
          losses: Number(losses[0].count),
          draws: Number(draws[0].count),
          playerCount: Number(playerCount[0].count)
        };
        console.log(`Team ${team.team_name}: wins=${teamData.wins} (type: ${typeof teamData.wins})`);
        teamLeaderboard.push(teamData);
      }

      // Sort teams by wins (descending)
      console.log("About to sort. First team wins type:", typeof teamLeaderboard[0]?.wins);
      teamLeaderboard.sort((a, b) => b.wins - a.wins);
      console.log("Team leaderboard processed successfully");

      console.log("Sending statistics response");
      res.json({
        totalGoals: Number(totalGoals[0].total) || 0,
        totalAssists: Number(totalAssists[0].total) || 0,
        topScorers: topScorers.map(p => ({
          id: p.player_id,
          name: `${p.first_name} ${p.last_name || ""}`,
          goals: Number(p.goals),
          teamName: p.team_name
        })),
        topAssisters: topAssisters.map(p => ({
          id: p.player_id,
          name: `${p.first_name} ${p.last_name || ""}`,
          assists: Number(p.assists),
          teamName: p.team_name
        })),
        teamStats: teamLeaderboard
      });
    } catch (error) {
      console.error("Statistics endpoint error:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({
        success: false,
        message: "Failed to fetch statistics",
        error: error.message,
        stack: error.stack
      });
    }
  });
});

// ==================== SETTINGS ====================

app.put("/api/settings/password", async (req, res) => {
  const { playerId, currentPassword, newPassword } = req.body;

  return withConnection(async (conn) => {
    const rows = await conn.query(
      "SELECT * FROM player WHERE player_id = ? AND password = ?",
      [playerId, currentPassword]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    await conn.query(
      "UPDATE player SET password = ? WHERE player_id = ?",
      [newPassword, playerId]
    );

    res.json({ success: true });
  });
});

// Serve index.html for any non-API routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'front-end', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port : ${port}`);
});