# Tournament Registration Feature - Implementation Summary

## Overview
This document summarizes the new tournament registration feature that allows players (captains) to register their teams for tournaments, and admins to manage these registration requests.

## Features Implemented

### 1. Player Side - Tournament Section
- **Location**: New "Tournaments" menu item in the "My Portal" section
- **Features**:
  - View tournaments categorized as:
    - **Upcoming Tournaments** (blue) - Tournaments that haven't started yet
    - **Current Tournaments** (green) - Tournaments currently in progress
    - **Past Tournaments** (gray) - Completed tournaments
  - Captain-only "Register" button on upcoming tournaments
  - All players can view tournament details
  - Non-captains see tournaments but cannot register

### 2. Captain Tournament Registration
- **Who can register**: Only team captains
- **Requirements**:
  - Must be a captain of a team
  - Must have a team assigned
  - Tournament must be "upcoming" (not started yet)
- **Process**:
  1. Captain clicks "Register" button on an upcoming tournament
  2. System validates captain status and team membership
  3. Registration request is sent to admin
  4. Captain receives confirmation message
  5. Request appears in admin's requests panel

### 3. Admin Side - Enhanced Tournament Management
- **Tournament Categorization**:
  - Tournaments now divided into Upcoming, Current, and Past sections
  - Color-coded for easy identification
- **Requests Button**:
  - Available on each upcoming tournament
  - Shows count of pending requests (e.g., "Requests (3)")
  - Opens a panel showing all registration requests for that tournament
- **Request Management**:
  - View team name, captain name, and request date
  - Accept or Reject requests
  - Accepted teams are automatically added to the tournament
  - Request status tracked (pending, accepted, rejected)

## Files Modified

### Frontend Files

#### 1. [script.js](front-end/script.js)
**New State Variables:**
- `tournamentRequests` - Array to store tournament registration requests

**New Functions:**
- `loadTournamentRequests()` - Loads all tournament registration requests from API
- `categorizeTournaments(tournamentsArray)` - Categorizes tournaments into upcoming, current, and past
- `viewTournamentRequests(tournamentId)` - Displays registration requests for a specific tournament
- `handleTournamentRequest(requestId, tournamentId, status)` - Accepts or rejects a registration request
- `registerForTournament(tournamentId)` - Allows captains to register their team for a tournament
- `renderPlayerTournaments()` - Renders tournament view for players with captain registration buttons

**Modified Functions:**
- `renderTournaments()` - Updated to show tournaments in three categories (upcoming, current, past) with requests button for admins
- `switchView(viewName)` - Added handler for "player-tournaments" view

**Event Listeners Added:**
- Close button handler for tournament requests panel

#### 2. [index (1).html](front-end/index (1).html)
**New Menu Item:**
- Added "Tournaments" button in player portal section (line 263-266)

**New Views:**
- `view-player-tournaments` - Player tournament view with categorized tournaments (line 437-449)

**New Panels:**
- `tournament-requests-panel` - Admin panel for viewing/managing registration requests (line 644-650)

### Backend Files

#### 3. [server.js](server.js)
**New API Endpoints:**

1. **POST `/api/tournament-requests`** (line 764-806)
   - Creates a new tournament registration request
   - Validates: No duplicate pending requests, team not already registered
   - Parameters: `tournamentId`, `teamName`, `captainId`

2. **GET `/api/tournament-requests`** (line 809-828)
   - Retrieves all tournament registration requests
   - Returns: request details with tournament name and captain name

3. **PUT `/api/tournament-requests/:id`** (line 831-870)
   - Updates request status (accept/reject)
   - If accepted: Automatically adds team to tournament_team table
   - Parameters: `status` ('accepted' or 'rejected')

### Database Files

#### 4. [create_tournament_registration_table.sql](db/create_tournament_registration_table.sql)
**New Table:** `tournament_registration_request`

**Columns:**
- `request_id` - Primary key (auto-increment)
- `tournament_id` - Foreign key to tournament table
- `team_name` - Foreign key to team table
- `captain_id` - Foreign key to player table
- `request_date` - Timestamp of request creation
- `status` - ENUM('pending', 'accepted', 'rejected')

**Constraints:**
- Unique constraint on (tournament_id, team_name, status) to prevent duplicate pending requests
- Foreign key constraints with CASCADE delete
- Indexes on tournament_id and team_name for performance

## Setup Instructions

### 1. Database Setup
Run the SQL script to create the required table:

```bash
mysql -u root -p football_academy < db/create_tournament_registration_table.sql
```

Or execute manually in your database client:
```sql
-- Copy and paste the contents of create_tournament_registration_table.sql
```

### 2. Testing the Feature

#### As a Player (Captain):
1. Login as a player who is a team captain
2. Navigate to "Tournaments" in the "My Portal" section
3. View upcoming tournaments
4. Click "Register" on any upcoming tournament
5. Confirm the registration request was sent

#### As an Admin:
1. Login as admin
2. Navigate to "Tournaments" section
3. Notice tournaments are now categorized (Upcoming, Current, Past)
4. Look for the "Requests" button on upcoming tournaments
5. Click "Requests" to view pending registrations
6. Accept or Reject requests
7. Verify team is added to tournament upon acceptance

## User Flow Diagram

```
CAPTAIN                          ADMIN
   |                               |
   v                               |
View Tournaments                   |
   |                               |
   v                               |
Click "Register"                   |
   |                               |
   v                               |
Request Sent -----------------> Receives Request
   |                               |
   v                               v
Confirmation Message         Views in "Requests"
                                   |
                                   v
                             Accept/Reject
                                   |
                                   v
                          Team Added to Tournament
                          (if accepted)
```

## API Reference

### POST /api/tournament-requests
Create a tournament registration request

**Request Body:**
```json
{
  "tournamentId": 1,
  "teamName": "Barcelona FC",
  "captainId": 5
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Registration request sent successfully",
  "requestId": 12
}
```

**Response (Error - Duplicate):**
```json
{
  "success": false,
  "message": "A pending request already exists for this team and tournament"
}
```

### GET /api/tournament-requests
Get all tournament registration requests

**Response:**
```json
[
  {
    "id": 12,
    "tournamentId": 1,
    "teamName": "Barcelona FC",
    "captainName": "John Doe",
    "requestDate": "2025-12-23T10:30:00.000Z",
    "status": "pending",
    "tournament_name": "Champions League 2025"
  }
]
```

### PUT /api/tournament-requests/:id
Accept or reject a registration request

**Request Body:**
```json
{
  "status": "accepted"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Request accepted"
}
```

## Technical Notes

### Tournament Categorization Logic
Tournaments are categorized based on current date vs start/end dates:
- **Upcoming**: Current date < Start date
- **Current**: Start date ≤ Current date ≤ End date
- **Past**: Current date > End date

### Security Considerations
- Captain validation happens on both frontend and backend
- Database constraints prevent duplicate registrations
- Foreign key constraints maintain referential integrity
- Status updates are validated before processing

### Performance
- Indexed queries for fast request retrieval
- Connection pooling for database efficiency
- Minimal database calls with JOIN operations

## Future Enhancements (Optional)
- Email notifications to captains when requests are accepted/rejected
- View request history in captain panel
- Withdraw registration requests
- Tournament capacity limits
- Registration deadlines
- Tournament bracket visualization

---

**Implementation Date:** December 23, 2025
**Version:** 1.0
