const cron = require('node-cron');
const logger = require('../utils/logger');
const database = require('./database');
const feedParser = require('./feedParser');
const lineMessaging = require('./lineMessaging');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) {
      logger.warn('Scheduler already initialized');
      return;
    }

    try {
      // Schedule RSS feed fetching every hour
      this.scheduleJob('feed-fetching', '0 * * * *', async () => {
        logger.info('Starting scheduled RSS feed fetching');
        try {
          await feedParser.fetchAndProcessAllFeeds();
        } catch (error) {
          logger.error('Scheduled feed fetching failed:', error);
        }
      });

      // Schedule article delivery every 30 minutes
      this.scheduleJob('article-delivery', '*/30 * * * *', async () => {
        logger.info('Starting scheduled article delivery');
        try {
          await this.deliverArticlesToUsers();
        } catch (error) {
          logger.error('Scheduled article delivery failed:', error);
        }
      });

      // Schedule daily cleanup at 2 AM
      this.scheduleJob('daily-cleanup', '0 2 * * *', async () => {
        logger.info('Starting daily cleanup');
        try {
          await this.performDailyCleanup();
        } catch (error) {
          logger.error('Daily cleanup failed:', error);
        }
      });

      this.isInitialized = true;
      logger.info('Scheduler initialized with all jobs');

    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
    }
  }

  scheduleJob(name, cronExpression, taskFunction) {
    try {
      if (this.jobs.has(name)) {
        logger.warn(`Job ${name} already exists, destroying old job`);
        this.jobs.get(name).destroy();
      }

      const job = cron.schedule(cronExpression, taskFunction, {
        scheduled: true,
        timezone: 'Asia/Tokyo'
      });

      this.jobs.set(name, job);
      logger.info(`Scheduled job '${name}' with cron expression: ${cronExpression}`);

    } catch (error) {
      logger.error(`Failed to schedule job ${name}:`, error);
    }
  }

  async deliverArticlesToUsers() {
    try {
      logger.info('Starting article delivery to users');

      // Get all active users
      const users = await this.getActiveUsers();
      logger.info(`Found ${users.length} active users`);

      const deliveryResults = {
        total_users: users.length,
        successful_deliveries: 0,
        failed_deliveries: 0,
        total_articles_sent: 0
      };

      for (const user of users) {
        try {
          // Check if it's the right time to deliver for this user
          if (!this.isDeliveryTime(user)) {
            continue;
          }

          // Get recent articles for user's subscriptions
          const articles = await this.getArticlesForUser(user);
          
          if (articles.length === 0) {
            logger.info(`No new articles for user ${user.line_user_id}`);
            continue;
          }

          // Group articles and send
          const success = await this.sendArticlesToUser(user, articles);
          
          if (success) {
            deliveryResults.successful_deliveries++;
            deliveryResults.total_articles_sent += articles.length;
          } else {
            deliveryResults.failed_deliveries++;
          }

        } catch (error) {
          logger.error(`Failed to deliver articles to user ${user.line_user_id}:`, error);
          deliveryResults.failed_deliveries++;
        }
      }

      logger.info('Article delivery completed:', deliveryResults);
      return deliveryResults;

    } catch (error) {
      logger.error('Failed to deliver articles to users:', error);
      throw error;
    }
  }

  async getActiveUsers() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM users WHERE active = 1`;
      database.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  isDeliveryTime(user) {
    const now = new Date();
    const userTime = new Date(now.toLocaleString("en-US", {timeZone: user.timezone || "Asia/Tokyo"}));
    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    
    // Parse user's delivery time (format: "HH:MM")
    const [deliveryHour, deliveryMinute] = user.delivery_time.split(':').map(Number);
    
    // Check if current time is within 30 minutes of delivery time
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const deliveryTotalMinutes = deliveryHour * 60 + deliveryMinute;
    
    const timeDiff = Math.abs(currentTotalMinutes - deliveryTotalMinutes);
    
    return timeDiff <= 30; // Within 30 minutes of delivery time
  }

  async getArticlesForUser(user) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT DISTINCT a.*, f.name as feed_name 
        FROM articles a
        JOIN rss_feeds f ON a.feed_id = f.id
        JOIN user_subscriptions s ON f.id = s.feed_id
        LEFT JOIN delivery_history d ON a.id = d.article_id AND d.user_id = ?
        WHERE s.user_id = ? 
          AND s.active = 1 
          AND a.processed = 1 
          AND a.summary IS NOT NULL
          AND a.published_at > datetime('now', '-24 hours')
          AND d.id IS NULL
        ORDER BY a.published_at DESC
        LIMIT 5
      `;
      
      database.db.all(sql, [user.id, user.id], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async sendArticlesToUser(user, articles) {
    try {
      const messages = [];
      
      // Create header message
      const headerText = `📰 今日のニュース (${articles.length}件)\n━━━━━━━━━━━━━━━━`;
      messages.push({ type: 'text', text: headerText });

      // Add each article
      for (const article of articles) {
        const articleText = this.formatArticleMessage(article);
        messages.push({ type: 'text', text: articleText });
        
        // Record delivery attempt
        await database.recordDelivery(user.id, article.id, 'sent');
      }

      // Send messages via LINE
      await lineMessaging.sendMessages(user.line_user_id, messages);
      
      logger.info(`Successfully sent ${articles.length} articles to user ${user.line_user_id}`);
      return true;

    } catch (error) {
      logger.error(`Failed to send articles to user ${user.line_user_id}:`, error);
      
      // Record failed deliveries
      for (const article of articles) {
        await database.recordDelivery(user.id, article.id, 'failed', error.message);
      }
      
      return false;
    }
  }

  formatArticleMessage(article) {
    const title = article.title;
    const source = article.feed_name || 'ニュース';
    const summary = article.summary || '要約が利用できません';
    const keywords = article.keywords ? `🏷️ ${article.keywords}` : '';
    const url = article.url;
    
    const publishedDate = new Date(article.published_at);
    const timeStr = publishedDate.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `📄 ${title}

⏰ ${timeStr} | 📡 ${source}

📝 ${summary}

${keywords}

🔗 ${url}

━━━━━━━━━━━━━━━━`;
  }

  async performDailyCleanup() {
    try {
      logger.info('Starting daily cleanup tasks');

      // Clean old articles (older than 30 days)
      const cleanupResults = await this.cleanupOldData();
      
      // Generate daily stats
      const stats = await database.getStats();
      
      logger.info('Daily cleanup completed:', {
        cleanup_results: cleanupResults,
        current_stats: stats
      });

    } catch (error) {
      logger.error('Daily cleanup failed:', error);
    }
  }

  async cleanupOldData() {
    return new Promise((resolve, reject) => {
      const queries = [
        // Delete old delivery history (older than 90 days)
        `DELETE FROM delivery_history WHERE delivered_at < datetime('now', '-90 days')`,
        
        // Delete old unprocessed articles (older than 7 days)
        `DELETE FROM articles WHERE processed = 0 AND created_at < datetime('now', '-7 days')`,
        
        // Delete old processed articles (older than 30 days)
        `DELETE FROM articles WHERE processed = 1 AND created_at < datetime('now', '-30 days')`
      ];

      const results = {};
      let completed = 0;

      queries.forEach((sql, index) => {
        database.db.run(sql, [], function(err) {
          if (err) {
            logger.error(`Cleanup query ${index} failed:`, err);
            results[`query_${index}_error`] = err.message;
          } else {
            results[`query_${index}_deleted`] = this.changes;
          }
          
          completed++;
          if (completed === queries.length) {
            resolve(results);
          }
        });
      });
    });
  }

  // Manual trigger methods for testing
  async triggerFeedFetching() {
    logger.info('Manually triggered feed fetching');
    return await feedParser.fetchAndProcessAllFeeds();
  }

  async triggerArticleDelivery() {
    logger.info('Manually triggered article delivery');
    return await this.deliverArticlesToUsers();
  }

  async triggerCleanup() {
    logger.info('Manually triggered cleanup');
    return await this.performDailyCleanup();
  }

  // Job management methods
  startJob(name) {
    const job = this.jobs.get(name);
    if (job) {
      job.start();
      logger.info(`Started job: ${name}`);
    } else {
      logger.error(`Job not found: ${name}`);
    }
  }

  stopJob(name) {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    } else {
      logger.error(`Job not found: ${name}`);
    }
  }

  getJobStatus() {
    const status = {};
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.running || false,
        scheduled: true
      };
    }
    return status;
  }

  destroy() {
    for (const [name, job] of this.jobs) {
      job.destroy();
      logger.info(`Destroyed job: ${name}`);
    }
    this.jobs.clear();
    this.isInitialized = false;
  }
}

module.exports = new Scheduler();