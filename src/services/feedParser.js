const FeedParser = require('feedparser');
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const database = require('./database');
const articleExtractor = require('./articleExtractor');
const summarizer = require('./summarizer');

class FeedParserService {
  constructor() {
    this.userAgent = 'News LINE Bot 1.0 (compatible; RSS reader)';
  }

  async parseFeed(feedUrl, feedId = null) {
    try {
      logger.info(`Parsing RSS feed: ${feedUrl}`);

      const response = await axios({
        method: 'GET',
        url: feedUrl,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/rss+xml, application/xml, text/xml'
        },
        timeout: 30000,
        responseType: 'stream'
      });

      const articles = [];
      const feedparser = new FeedParser({
        normalize: true,
        addmeta: false
      });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Feed parsing timeout'));
        }, 45000);

        feedparser.on('error', (error) => {
          clearTimeout(timeout);
          logger.error(`Feed parsing error for ${feedUrl}:`, error);
          reject(error);
        });

        feedparser.on('readable', function() {
          let item;
          while (item = this.read()) {
            const article = {
              title: item.title || 'No title',
              url: item.link || item.guid,
              description: item.description || item.summary || '',
              content: item['content:encoded'] || item.description || '',
              published_at: item.pubdate || item.date || new Date(),
              author: item.author,
              categories: item.categories || [],
              feed_id: feedId
            };

            // Clean and validate article data
            if (article.url && article.title) {
              articles.push(this.cleanArticleData(article));
            }
          }
        });

        feedparser.on('end', () => {
          clearTimeout(timeout);
          logger.info(`Successfully parsed ${articles.length} articles from ${feedUrl}`);
          resolve(articles);
        });

        response.data.pipe(feedparser);
      });

    } catch (error) {
      logger.error(`Failed to parse feed ${feedUrl}:`, error);
      throw error;
    }
  }

  cleanArticleData(article) {
    // Remove HTML tags from description and content
    const $ = cheerio.load(article.content || article.description || '');
    const cleanContent = $.text().trim();

    // Normalize date
    let publishedAt = article.published_at;
    if (typeof publishedAt === 'string') {
      publishedAt = new Date(publishedAt);
    }
    if (isNaN(publishedAt.getTime())) {
      publishedAt = new Date();
    }

    return {
      ...article,
      content: cleanContent,
      published_at: publishedAt.toISOString(),
      title: article.title.trim(),
      url: article.url.trim()
    };
  }

  async fetchAndProcessAllFeeds() {
    try {
      logger.info('Starting scheduled feed processing');
      const feeds = await database.getActiveFeeds();
      
      const results = {
        total_feeds: feeds.length,
        successful_feeds: 0,
        failed_feeds: 0,
        new_articles: 0,
        processed_articles: 0
      };

      for (const feed of feeds) {
        try {
          const articles = await this.parseFeed(feed.url, feed.id);
          
          let newArticles = 0;
          for (const articleData of articles) {
            try {
              // Check if article already exists
              const existingArticles = await this.checkArticleExists(articleData.url);
              if (existingArticles.length === 0) {
                // Save new article to database
                const savedArticle = await database.createArticle(articleData);
                newArticles++;
                
                // Process article (extract full content and summarize)
                this.processArticleAsync(savedArticle.id, articleData.url);
              }
            } catch (error) {
              logger.error(`Failed to save article ${articleData.url}:`, error);
            }
          }

          await database.updateFeedLastFetched(feed.id);
          results.successful_feeds++;
          results.new_articles += newArticles;
          
          logger.info(`Feed ${feed.name}: Found ${articles.length} articles, ${newArticles} new`);

        } catch (error) {
          logger.error(`Failed to process feed ${feed.name}:`, error);
          results.failed_feeds++;
        }
      }

      logger.info('Feed processing completed:', results);
      return results;

    } catch (error) {
      logger.error('Failed to process feeds:', error);
      throw error;
    }
  }

  async checkArticleExists(url) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT id FROM articles WHERE url = ?`;
      database.db.all(sql, [url], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async processArticleAsync(articleId, url) {
    try {
      // Extract full article content
      const extractedContent = await articleExtractor.extract(url);
      
      if (extractedContent && extractedContent.content) {
        // Generate summary and keywords
        const summaryResult = await summarizer.summarize(extractedContent.content, 'standard');
        const keywords = await summarizer.extractKeywords(extractedContent.content, 5);
        
        // Update article with summary and keywords
        await database.updateArticleSummary(
          articleId, 
          summaryResult.summary,
          keywords.join(', ')
        );
        
        logger.info(`Article ${articleId} processed successfully`);
      } else {
        logger.warn(`Failed to extract content for article ${articleId}`);
      }
    } catch (error) {
      logger.error(`Failed to process article ${articleId}:`, error);
    }
  }

  async addFeed(name, url) {
    try {
      // Validate feed URL by trying to parse it
      await this.parseFeed(url);
      
      // Save feed to database
      const feed = await database.createFeed(name, url);
      logger.info(`Feed added successfully: ${name} (${url})`);
      
      return feed;
    } catch (error) {
      logger.error(`Failed to add feed ${name}:`, error);
      throw error;
    }
  }

  async getTestFeedData(url, maxItems = 5) {
    try {
      const articles = await this.parseFeed(url);
      return articles.slice(0, maxItems).map(article => ({
        title: article.title,
        url: article.url,
        published_at: article.published_at,
        preview: article.content.substring(0, 200) + '...'
      }));
    } catch (error) {
      logger.error(`Failed to test feed ${url}:`, error);
      throw error;
    }
  }
}

module.exports = new FeedParserService();