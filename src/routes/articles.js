const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const articleExtractor = require('../services/articleExtractor');
const summarizer = require('../services/summarizer');
const lineMessaging = require('../services/lineMessaging');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for article processing
const articleLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 article requests per 15 minutes
  message: 'Too many article requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// POST /api/articles/extract
// Extract article content from URL
router.post('/extract', 
  articleLimit,
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
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { url, summaryLevel = 'standard' } = req.body;

      logger.info(`Processing article extraction request for: ${url}`);

      // Extract article content
      const article = await articleExtractor.extractFromUrl(url);

      // Generate summary
      const summary = await summarizer.summarize(article.content, summaryLevel);

      // Extract keywords
      const keywords = await summarizer.extractKeywords(article.content);

      const result = {
        article: {
          ...article,
          keywords
        },
        summary,
        processedAt: new Date().toISOString()
      };

      logger.info(`Successfully processed article: ${article.title}`);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Article extraction failed:', error);
      res.status(500).json({
        success: false,
        error: 'Article extraction failed',
        message: error.message
      });
    }
  }
);

// POST /api/articles/summarize
// Summarize provided text
router.post('/summarize',
  articleLimit,
  [
    body('text')
      .isLength({ min: 50 })
      .withMessage('Text must be at least 50 characters long'),
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

      const { text, summaryLevel = 'standard' } = req.body;

      logger.info('Processing text summarization request');

      const summary = await summarizer.summarize(text, summaryLevel);
      const keywords = await summarizer.extractKeywords(text);

      res.json({
        success: true,
        data: {
          summary,
          keywords,
          originalLength: text.length,
          processedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Text summarization failed:', error);
      res.status(500).json({
        success: false,
        error: 'Summarization failed',
        message: error.message
      });
    }
  }
);

// POST /api/articles/process-and-send
// Extract, summarize, and send to LINE
router.post('/process-and-send',
  articleLimit,
  [
    body('url')
      .isURL({ protocols: ['http', 'https'] })
      .withMessage('Valid URL is required'),
    body('lineUserId')
      .notEmpty()
      .withMessage('LINE user ID is required'),
    body('summaryLevel')
      .optional()
      .isIn(['brief', 'standard', 'detailed'])
      .withMessage('Summary level must be brief, standard, or detailed'),
    body('useFlexMessage')
      .optional()
      .isBoolean()
      .withMessage('useFlexMessage must be a boolean')
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

      const { 
        url, 
        lineUserId, 
        summaryLevel = 'standard',
        useFlexMessage = false
      } = req.body;

      logger.info(`Processing article for LINE delivery to user: ${lineUserId}`);

      // Check if LINE messaging is configured
      if (!lineMessaging.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'LINE messaging not configured',
          message: 'LINE API credentials are not set up'
        });
      }

      // Extract article content
      const article = await articleExtractor.extractFromUrl(url);

      // Generate summary
      const summary = await summarizer.summarize(article.content, summaryLevel);

      // Send to LINE
      const lineResult = useFlexMessage 
        ? await lineMessaging.sendFlexSummary(lineUserId, article, summary)
        : await lineMessaging.sendSummary(lineUserId, article, summary);

      if (!lineResult.success) {
        throw new Error(`LINE delivery failed: ${lineResult.error}`);
      }

      logger.info(`Successfully processed and sent article to LINE user: ${lineUserId}`);

      res.json({
        success: true,
        data: {
          article: {
            title: article.title,
            url: article.url
          },
          summary: {
            text: summary.summary,
            level: summary.level,
            wordCount: summary.wordCount
          },
          lineDelivery: lineResult,
          processedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Article processing and delivery failed:', error);
      res.status(500).json({
        success: false,
        error: 'Processing and delivery failed',
        message: error.message
      });
    }
  }
);

// GET /api/articles/health
// Health check for article processing services
router.get('/health', (req, res) => {
  const health = {
    articleExtractor: 'OK',
    summarizer: summarizer.openai ? 'OpenAI configured' : 'Fallback mode',
    lineMessaging: lineMessaging.isConfigured() ? 'Configured' : 'Not configured',
    timestamp: new Date().toISOString()
  };

  res.json({
    success: true,
    health
  });
});

module.exports = router;