const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class ArticleExtractor {
  constructor() {
    this.timeout = 10000; // 10 seconds
  }

  async extractFromUrl(url) {
    try {
      logger.info(`Extracting article from URL: ${url}`);

      // Validate URL
      if (!this.isValidUrl(url)) {
        throw new Error('Invalid URL provided');
      }

      // Fetch HTML content
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract article content
      const article = this.extractContent($);

      logger.info(`Successfully extracted article: ${article.title}`);
      return article;

    } catch (error) {
      logger.error(`Failed to extract article from ${url}:`, error);
      throw new Error(`Article extraction failed: ${error.message}`);
    }
  }

  extractContent($) {
    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .advertisement, .ads, .social-share').remove();

    // Try different selectors for title
    const title = this.extractTitle($);
    
    // Try different selectors for content
    const content = this.extractMainContent($);
    
    // Extract metadata
    const metadata = this.extractMetadata($);

    return {
      title: title || 'No title found',
      content: content || 'No content found',
      url: metadata.url || '',
      publishDate: metadata.publishDate || new Date().toISOString(),
      author: metadata.author || 'Unknown',
      description: metadata.description || ''
    };
  }

  extractTitle($) {
    const titleSelectors = [
      'h1',
      '.article-title',
      '.entry-title',
      '.post-title',
      'title'
    ];

    for (const selector of titleSelectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim()) {
        return element.text().trim();
      }
    }

    return null;
  }

  extractMainContent($) {
    const contentSelectors = [
      '.article-content',
      '.entry-content',
      '.post-content',
      '.content',
      'article',
      '.main-content',
      '#content'
    ];

    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length) {
        // Get text content and clean it up
        let text = element.text().trim();
        if (text.length > 100) { // Minimum content length
          return this.cleanText(text);
        }
      }
    }

    // Fallback: try to get content from paragraphs
    const paragraphs = $('p').map((i, el) => $(el).text().trim()).get();
    const content = paragraphs.filter(p => p.length > 20).join('\n\n');
    
    return content.length > 100 ? this.cleanText(content) : null;
  }

  extractMetadata($) {
    return {
      url: $('meta[property="og:url"]').attr('content') || 
           $('link[rel="canonical"]').attr('href') || '',
      description: $('meta[property="og:description"]').attr('content') || 
                  $('meta[name="description"]').attr('content') || '',
      author: $('meta[name="author"]').attr('content') || 
             $('meta[property="article:author"]').attr('content') || '',
      publishDate: $('meta[property="article:published_time"]').attr('content') || 
                  $('meta[name="publish-date"]').attr('content') || 
                  $('time[datetime]').attr('datetime') || ''
    };
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n\n') // Clean up line breaks
      .trim();
  }

  isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }
}

module.exports = new ArticleExtractor();