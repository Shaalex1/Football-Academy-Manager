const mariadb = require("mariadb");
require('dotenv').config();

// Create connection pool with environment variables
const pool = mariadb.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "football_academy",
  port: parseInt(process.env.DB_PORT) || 3306,
  connectionLimit: 5
});

module.exports = Object.freeze({ pool: pool });
