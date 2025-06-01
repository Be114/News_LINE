const express = require('express');
const { body, validationResult } = require('express-validator');
const fs = require('fs').promises;
const path = require('path');

const logger = require('../utils/logger');
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
    // Get log file stats if available
    const logStats = await getLogStats();
    
    res.json({
      success: true,
      data: {
        ...systemStats,
        logStats,
        services: {
          lineMessaging: lineMessaging.isConfigured() ? 'Active' : 'Not configured',
          summarizer: summarizer.openai ? 'OpenAI Active' : 'Fallback mode',
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