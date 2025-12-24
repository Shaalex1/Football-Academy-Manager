-- Create tournament_registration_request table for managing team registration requests to tournaments

CREATE TABLE IF NOT EXISTS tournament_registration_request (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  team_name VARCHAR(100) NOT NULL,
  captain_id INT NOT NULL,
  request_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
  FOREIGN KEY (tournament_id) REFERENCES tournament(tournament_id) ON DELETE CASCADE,
  FOREIGN KEY (team_name) REFERENCES team(team_name) ON DELETE CASCADE,
  FOREIGN KEY (captain_id) REFERENCES player(player_id) ON DELETE CASCADE,
  UNIQUE KEY unique_pending_request (tournament_id, team_name, status)
);

-- Add index for faster queries
CREATE INDEX idx_tournament_status ON tournament_registration_request(tournament_id, status);
CREATE INDEX idx_team_status ON tournament_registration_request(team_name, status);
