const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '../../data/news_line.db');
    this.init();
  }

  init() {
    try {
      // Ensure data directory exists
      const fs = require('fs');
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Database connection failed:', err);
        } else {
          logger.info('Connected to SQLite database');
          this.createTables();
        }
      });
    } catch (error) {
      logger.error('Database initialization failed:', error);
    }
  }

  createTables() {
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        line_user_id TEXT UNIQUE NOT NULL,
        display_name TEXT,
        summary_level TEXT DEFAULT 'standard',
        delivery_time TEXT DEFAULT '08:00',
        timezone TEXT DEFAULT 'Asia/Tokyo',
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // RSS feeds table
      `CREATE TABLE IF NOT EXISTS rss_feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        active BOOLEAN DEFAULT 1,
        last_fetched DATETIME,
        fetch_interval INTEGER DEFAULT 3600,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // User subscriptions table
      `CREATE TABLE IF NOT EXISTS user_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        feed_id INTEGER NOT NULL,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (feed_id) REFERENCES rss_feeds (id) ON DELETE CASCADE,
        UNIQUE(user_id, feed_id)
      )`,

      // Articles table
      `CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER,
        title TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        content TEXT,
        summary TEXT,
        keywords TEXT,
        published_at DATETIME,
        processed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_id) REFERENCES rss_feeds (id) ON DELETE SET NULL
      )`,

      // Delivery history table
      `CREATE TABLE IF NOT EXISTS delivery_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        article_id INTEGER NOT NULL,
        delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'sent',
        error_message TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
      )`,

      // System settings table
      `CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    tables.forEach((sql, index) => {
      this.db.run(sql, (err) => {
        if (err) {
          logger.error(`Failed to create table ${index + 1}:`, err);
        } else {
          logger.info(`Table ${index + 1} created or verified successfully`);
        }
      });
    });

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_line_id ON users(line_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url)',
      'CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at)',
      'CREATE INDEX IF NOT EXISTS idx_delivery_user_id ON delivery_history(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON user_subscriptions(user_id)'
    ];

    indexes.forEach(sql => {
      this.db.run(sql, (err) => {
        if (err) {
          logger.error('Failed to create index:', err);
        }
      });
    });
  }

  // User management methods
  async createUser(lineUserId, displayName = null) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO users (line_user_id, display_name) VALUES (?, ?)`;
      this.db.run(sql, [lineUserId, displayName], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, line_user_id: lineUserId });
        }
      });
    });
  }

  async getUserByLineId(lineUserId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM users WHERE line_user_id = ?`;
      this.db.get(sql, [lineUserId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async updateUserSettings(lineUserId, settings) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      if (settings.summary_level) {
        fields.push('summary_level = ?');
        values.push(settings.summary_level);
      }
      if (settings.delivery_time) {
        fields.push('delivery_time = ?');
        values.push(settings.delivery_time);
      }
      if (settings.timezone) {
        fields.push('timezone = ?');
        values.push(settings.timezone);
      }
      if (settings.active !== undefined) {
        fields.push('active = ?');
        values.push(settings.active ? 1 : 0);
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(lineUserId);

      const sql = `UPDATE users SET ${fields.join(', ')} WHERE line_user_id = ?`;
      this.db.run(sql, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // RSS feed methods
  async createFeed(name, url) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO rss_feeds (name, url) VALUES (?, ?)`;
      this.db.run(sql, [name, url], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, name, url });
        }
      });
    });
  }

  async getAllFeeds() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM rss_feeds ORDER BY name`;
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getActiveFeeds() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM rss_feeds WHERE active = 1 ORDER BY name`;
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async updateFeedLastFetched(feedId) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE rss_feeds SET last_fetched = CURRENT_TIMESTAMP WHERE id = ?`;
      this.db.run(sql, [feedId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Article methods
  async createArticle(article) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO articles (feed_id, title, url, content, published_at) 
                   VALUES (?, ?, ?, ?, ?)`;
      this.db.run(sql, [
        article.feed_id,
        article.title,
        article.url,
        article.content,
        article.published_at
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  async updateArticleSummary(articleId, summary, keywords) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE articles SET summary = ?, keywords = ?, processed = 1 WHERE id = ?`;
      this.db.run(sql, [summary, keywords, articleId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async getUnprocessedArticles(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM articles WHERE processed = 0 ORDER BY published_at DESC LIMIT ?`;
      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getRecentArticles(limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT a.*, f.name as feed_name 
                   FROM articles a 
                   LEFT JOIN rss_feeds f ON a.feed_id = f.id 
                   WHERE a.processed = 1 
                   ORDER BY a.published_at DESC 
                   LIMIT ?`;
      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Subscription methods
  async createSubscription(userId, feedId) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO user_subscriptions (user_id, feed_id) VALUES (?, ?)`;
      this.db.run(sql, [userId, feedId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  async getUserSubscriptions(userId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT f.* FROM rss_feeds f 
                   JOIN user_subscriptions s ON f.id = s.feed_id 
                   WHERE s.user_id = ? AND s.active = 1`;
      this.db.all(sql, [userId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Delivery history methods
  async recordDelivery(userId, articleId, status = 'sent', errorMessage = null) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO delivery_history (user_id, article_id, status, error_message) 
                   VALUES (?, ?, ?, ?)`;
      this.db.run(sql, [userId, articleId, status, errorMessage], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  // Statistics methods
  async getStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as total_users FROM users WHERE active = 1',
        'SELECT COUNT(*) as total_feeds FROM rss_feeds WHERE active = 1',
        'SELECT COUNT(*) as total_articles FROM articles',
        'SELECT COUNT(*) as total_deliveries FROM delivery_history',
        'SELECT COUNT(*) as recent_articles FROM articles WHERE created_at > datetime("now", "-7 days")'
      ];

      const stats = {};
      let completed = 0;

      queries.forEach((sql, index) => {
        this.db.get(sql, [], (err, row) => {
          if (err) {
            logger.error(`Stats query ${index} failed:`, err);
          } else {
            Object.assign(stats, row);
          }
          completed++;
          if (completed === queries.length) {
            resolve(stats);
          }
        });
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          logger.error('Error closing database:', err);
        } else {
          logger.info('Database connection closed');
        }
      });
    }
  }
}

module.exports = new Database();