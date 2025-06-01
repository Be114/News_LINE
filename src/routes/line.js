const express = require('express');
const { middleware } = require('@line/bot-sdk');
const { body, validationResult } = require('express-validator');

const lineMessaging = require('../services/lineMessaging');
const articleExtractor = require('../services/articleExtractor');
const summarizer = require('../services/summarizer');
const logger = require('../utils/logger');

const router = express.Router();

// LINE webhook middleware (only if LINE is configured)
const lineMiddleware = lineMessaging.isConfigured() ? 
  middleware({
    channelSecret: process.env.LINE_CHANNEL_SECRET
  }) : 
  (req, res, next) => {
    logger.warn('LINE webhook received but LINE is not configured');
    res.status(503).json({ error: 'LINE not configured' });
  };

// POST /api/line/webhook
// Handle LINE webhook events
router.post('/webhook', lineMiddleware, async (req, res) => {
  try {
    const events = req.body.events;
    
    if (!events || events.length === 0) {
      return res.status(200).send('OK');
    }

    logger.info(`Received ${events.length} LINE events`);

    // Process events
    const results = await lineMessaging.handleWebhook(events);

    // Process any URL messages for automatic summarization
    for (const event of events) {
      if (event.type === 'message' && 
          event.message.type === 'text' && 
          isUrl(event.message.text)) {
        
        // Process article in background
        processArticleFromLineMessage(event)
          .catch(error => logger.error('Background article processing failed:', error));
      }
    }

    res.status(200).send('OK');

  } catch (error) {
    logger.error('LINE webhook error:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
});

// POST /api/line/send-message
// Send message to LINE user (for testing/admin use)
router.post('/send-message',
  [
    body('userId')
      .notEmpty()
      .withMessage('User ID is required'),
    body('message')
      .notEmpty()
      .withMessage('Message is required')
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

      const { userId, message } = req.body;

      const result = await lineMessaging.client.pushMessage(userId, {
        type: 'text',
        text: message
      });

      logger.info(`Test message sent to LINE user: ${userId}`);

      res.json({
        success: true,
        data: {
          userId,
          messageLength: message.length,
          sentAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to send test message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send message',
        message: error.message
      });
    }
  }
);

// GET /api/line/config
// Get LINE configuration status
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      configured: lineMessaging.isConfigured(),
      features: {
        messaging: lineMessaging.isConfigured(),
        webhook: lineMessaging.isConfigured(),
        flexMessages: lineMessaging.isConfigured()
      },
      timestamp: new Date().toISOString()
    }
  });
});

// Background function to process articles from LINE messages
async function processArticleFromLineMessage(event) {
  try {
    const { message, source, replyToken } = event;
    const url = message.text.trim();
    const userId = source.userId;

    logger.info(`Processing article from LINE message: ${url}`);

    // Extract and summarize article
    const article = await articleExtractor.extractFromUrl(url);
    const summary = await summarizer.summarize(article.content, 'standard');

    // Send summary back to user
    await lineMessaging.sendFlexSummary(userId, article, summary);

    logger.info(`Successfully processed and sent article summary to ${userId}`);

  } catch (error) {
    logger.error('Failed to process article from LINE message:', error);
    
    // Send error message to user
    try {
      await lineMessaging.client.pushMessage(event.source.userId, {
        type: 'text',
        text: '申し訳ございません。記事の処理中にエラーが発生しました。URLが正しいか確認してもう一度お試しください。'
      });
    } catch (sendError) {
      logger.error('Failed to send error message to user:', sendError);
    }
  }
}

// Helper function to check if text is a URL
function isUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = router;