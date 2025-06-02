const express = require('express');
const { body, validationResult } = require('express-validator');
const fs = require('fs').promises;
const path = require('path');

const logger = require('../utils/logger');
const database = require('../services/database');
const scheduler = require('../services/scheduler');
const feedParser = require('../services/feedParser');
const lineMessaging = require('../services/lineMessaging');
const summarizer = require('../services/summarizer');

const router = express.Router();

// Simple in-memory storage for MVP (replace with database in future phases)
let systemStats = {
  totalArticlesProcessed: 0,
  totalMessagesSent: 0,
  systemStartTime: new Date().toISOString(),
  lastProcessedArticle: null
};

// GET /api/admin/stats
// Get system statistics
router.get('/stats', async (req, res) => {
  try {
    // Get database stats
    const dbStats = await database.getStats();
    
    // Get log file stats if available
    const logStats = await getLogStats();
    
    // Get scheduler status
    const jobStatus = scheduler.getJobStatus();
    
    res.json({
      success: true,
      data: {
        ...systemStats,
        database: dbStats,
        scheduler: jobStatus,
        logStats,
        services: {
          lineMessaging: lineMessaging.isConfigured() ? 'Active' : 'Not configured',
          summarizer: 'OpenRouter/Gemini Active',
          database: 'SQLite Active',
          scheduler: 'Active',
          uptime: Math.floor((Date.now() - new Date(systemStats.systemStartTime).getTime()) / 1000)
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
      message: error.message
    });
  }
});

// POST /api/admin/test-article
// Test article processing
router.post('/test-article',
  [
    body('url')
      .isURL({ protocols: ['http', 'https'] })
      .withMessage('Valid URL is required'),
    body('summaryLevel')
      .optional()
      .isIn(['brief', 'standard', 'detailed'])
      .withMessage('Summary level must be brief, standard, or detailed')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { url, summaryLevel = 'standard' } = req.body;

      logger.info(`Admin testing article processing: ${url}`);

      // Import services here to avoid circular dependency
      const articleExtractor = require('../services/articleExtractor');
      
      // Test article extraction
      const article = await articleExtractor.extractFromUrl(url);
      
      // Test summarization
      const summary = await summarizer.summarize(article.content, summaryLevel);
      
      // Update stats
      systemStats.totalArticlesProcessed++;
      systemStats.lastProcessedArticle = {
        url,
        title: article.title,
        processedAt: new Date().toISOString()
      };

      res.json({
        success: true,
        data: {
          article: {
            title: article.title,
            url: article.url,
            contentLength: article.content.length,
            author: article.author,
            publishDate: article.publishDate
          },
          summary: {
            text: summary.summary,
            level: summary.level,
            method: summary.method,
            wordCount: summary.wordCount
          },
          processing: {
            extractionTime: 'N/A', // Could add timing in future
            summarizationTime: 'N/A',
            totalTime: 'N/A'
          }
        }
      });

    } catch (error) {
      logger.error('Admin article test failed:', error);
      res.status(500).json({
        success: false,
        error: 'Article test failed',
        message: error.message
      });
    }
  }
);

// POST /api/admin/test-line
// Test LINE messaging
router.post('/test-line',
  [
    body('userId')
      .notEmpty()
      .withMessage('LINE user ID is required'),
    body('message')
      .optional()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must be between 1 and 2000 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      if (!lineMessaging.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'LINE messaging not configured'
        });
      }

      const { userId, message = 'これはNews LINEからのテストメッセージです。🤖' } = req.body;

      logger.info(`Admin testing LINE messaging to user: ${userId}`);

      const result = await lineMessaging.client.pushMessage(userId, {
        type: 'text',
        text: message
      });

      // Update stats
      systemStats.totalMessagesSent++;

      res.json({
        success: true,
        data: {
          userId,
          message,
          sentAt: new Date().toISOString(),
          messageLength: message.length
        }
      });

    } catch (error) {
      logger.error('Admin LINE test failed:', error);
      res.status(500).json({
        success: false,
        error: 'LINE test failed',
        message: error.message
      });
    }
  }
);

// GET /api/admin/logs
// Get recent logs
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level || 'all';

    const logs = await getRecentLogs(limit, level);

    res.json({
      success: true,
      data: {
        logs,
        count: logs.length,
        filters: { limit, level },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve logs',
      message: error.message
    });
  }
});

// POST /api/admin/update-stats
// Update system statistics (for admin use)
router.post('/update-stats',
  [
    body('articlesProcessed').optional().isInt({ min: 0 }),
    body('messagesSent').optional().isInt({ min: 0 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { articlesProcessed, messagesSent } = req.body;

      if (articlesProcessed !== undefined) {
        systemStats.totalArticlesProcessed = articlesProcessed;
      }
      if (messagesSent !== undefined) {
        systemStats.totalMessagesSent = messagesSent;
      }

      logger.info('Admin updated system statistics');

      res.json({
        success: true,
        data: systemStats
      });

    } catch (error) {
      logger.error('Failed to update stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update statistics',
        message: error.message
      });
    }
  }
);

// Helper function to get log statistics
async function getLogStats() {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const files = await fs.readdir(logsDir).catch(() => []);
    
    const stats = {};
    for (const file of files) {
      try {
        const filePath = path.join(logsDir, file);
        const stat = await fs.stat(filePath);
        stats[file] = {
          size: stat.size,
          modified: stat.mtime.toISOString()
        };
      } catch (error) {
        // Ignore file stat errors
      }
    }

    return stats;
  } catch (error) {
    return {};
  }
}

// RSS Feed Management Endpoints

// GET /api/admin/feeds
// Get all RSS feeds
router.get('/feeds', async (req, res) => {
  try {
    const feeds = await database.getAllFeeds();
    res.json({
      success: true,
      data: {
        feeds,
        count: feeds.length
      }
    });
  } catch (error) {
    logger.error('Failed to get feeds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feeds',
      message: error.message
    });
  }
});

// POST /api/admin/feeds
// Add new RSS feed
router.post('/feeds',
  [
    body('name').notEmpty().withMessage('Feed name is required'),
    body('url').isURL().withMessage('Valid URL is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { name, url } = req.body;
      const feed = await feedParser.addFeed(name, url);
      
      res.json({
        success: true,
        data: feed,
        message: 'Feed added successfully'
      });
    } catch (error) {
      logger.error('Failed to add feed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add feed',
        message: error.message
      });
    }
  }
);

// POST /api/admin/feeds/test
// Test RSS feed parsing
router.post('/feeds/test',
  [
    body('url').isURL().withMessage('Valid URL is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { url } = req.body;
      const testData = await feedParser.getTestFeedData(url, 3);
      
      res.json({
        success: true,
        data: {
          url,
          sampleArticles: testData,
          count: testData.length
        }
      });
    } catch (error) {
      logger.error('Failed to test feed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test feed',
        message: error.message
      });
    }
  }
);

// Scheduler Management Endpoints

// POST /api/admin/scheduler/trigger-feeds
// Manually trigger feed fetching
router.post('/scheduler/trigger-feeds', async (req, res) => {
  try {
    const results = await scheduler.triggerFeedFetching();
    res.json({
      success: true,
      data: results,
      message: 'Feed fetching triggered successfully'
    });
  } catch (error) {
    logger.error('Failed to trigger feed fetching:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger feed fetching',
      message: error.message
    });
  }
});

// POST /api/admin/scheduler/trigger-delivery
// Manually trigger article delivery
router.post('/scheduler/trigger-delivery', async (req, res) => {
  try {
    const results = await scheduler.triggerArticleDelivery();
    res.json({
      success: true,
      data: results,
      message: 'Article delivery triggered successfully'
    });
  } catch (error) {
    logger.error('Failed to trigger article delivery:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger article delivery',
      message: error.message
    });
  }
});

// POST /api/admin/scheduler/trigger-cleanup
// Manually trigger cleanup
router.post('/scheduler/trigger-cleanup', async (req, res) => {
  try {
    const results = await scheduler.triggerCleanup();
    res.json({
      success: true,
      data: results,
      message: 'Cleanup triggered successfully'
    });
  } catch (error) {
    logger.error('Failed to trigger cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger cleanup',
      message: error.message
    });
  }
});

// User Management Endpoints

// GET /api/admin/users
// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({
      success: true,
      data: {
        users,
        count: users.length
      }
    });
  } catch (error) {
    logger.error('Failed to get users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users',
      message: error.message
    });
  }
});

// GET /api/admin/articles
// Get recent articles
router.get('/articles', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const articles = await database.getRecentArticles(limit);
    res.json({
      success: true,
      data: {
        articles,
        count: articles.length,
        limit
      }
    });
  } catch (error) {
    logger.error('Failed to get articles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve articles',
      message: error.message
    });
  }
});

// Helper function to get all users
async function getAllUsers() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, line_user_id, display_name, summary_level, delivery_time, timezone, active, created_at FROM users ORDER BY created_at DESC`;
    database.db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Helper function to get log statistics
async function getLogStats() {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const files = await fs.readdir(logsDir).catch(() => []);
    
    const stats = {};
    for (const file of files) {
      try {
        const filePath = path.join(logsDir, file);
        const stat = await fs.stat(filePath);
        stats[file] = {
          size: stat.size,
          modified: stat.mtime.toISOString()
        };
      } catch (error) {
        // Ignore file stat errors
      }
    }

    return stats;
  } catch (error) {
    return {};
  }
}

// Helper function to get recent logs
async function getRecentLogs(limit = 100, level = 'all') {
  try {
    const logFile = path.join(process.cwd(), 'logs', 'combined.log');
    const content = await fs.readFile(logFile, 'utf8').catch(() => '');
    
    const lines = content.split('\n')
      .filter(line => line.trim())
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line, level: 'unknown', timestamp: new Date().toISOString() };
        }
      });

    if (level !== 'all') {
      return lines.filter(log => log.level === level);
    }

    return lines;
  } catch (error) {
    return [];
  }
}

module.exports = router;