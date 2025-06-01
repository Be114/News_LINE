const logger = require('../utils/logger');

class Summarizer {
  constructor() {
    if (!process.env.OPENROUTER_API_KEY) {
      logger.warn('OpenRouter API key not found. Summarization will use fallback method.');
      this.apiAvailable = false;
    } else {
      this.apiAvailable = true;
      this.apiKey = process.env.OPENROUTER_API_KEY;
      this.siteUrl = process.env.OPENROUTER_SITE_URL || 'https://news-line-app.com';
      this.siteName = process.env.OPENROUTER_SITE_NAME || 'News LINE';
    }

    this.summaryLevels = {
      brief: { sentences: 2, maxTokens: 150 },
      standard: { sentences: 4, maxTokens: 300 },
      detailed: { sentences: 8, maxTokens: 500 }
    };
  }

  async summarize(text, level = 'standard') {
    try {
      logger.info(`Summarizing text with level: ${level}`);

      if (!text || text.trim().length === 0) {
        throw new Error('No text provided for summarization');
      }

      if (this.apiAvailable) {
        return await this.summarizeWithOpenRouter(text, level);
      } else {
        return this.fallbackSummarize(text, level);
      }

    } catch (error) {
      logger.error('Summarization failed:', error);
      
      // Fallback to simple text truncation
      return this.fallbackSummarize(text, level);
    }
  }

  async summarizeWithOpenRouter(text, level) {
    const config = this.summaryLevels[level] || this.summaryLevels.standard;
    
    const prompt = `Please summarize the following news article in exactly ${config.sentences} sentences. Make it clear, concise, and informative:\n\n${text}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": this.siteUrl,
        "X-Title": this.siteName,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "google/gemini-2.5-flash-preview-05-20",
        "messages": [
          {
            "role": "system",
            "content": "You are a professional news summarizer. Create accurate, concise summaries that capture the key information."
          },
          {
            "role": "user",
            "content": prompt
          }
        ],
        "max_tokens": config.maxTokens,
        "temperature": 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const summary = data.choices[0].message.content.trim();
    
    logger.info('Successfully generated AI summary with Gemini 2.5 Flash');
    return {
      summary,
      method: 'openrouter-gemini',
      level,
      wordCount: summary.split(' ').length
    };
  }

  fallbackSummarize(text, level) {
    logger.info('Using fallback summarization method');
    
    const config = this.summaryLevels[level] || this.summaryLevels.standard;
    
    // Split text into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length === 0) {
      return {
        summary: 'No content available for summarization.',
        method: 'fallback',
        level,
        wordCount: 0
      };
    }

    // Take first sentences up to the limit
    const selectedSentences = sentences.slice(0, config.sentences);
    const summary = selectedSentences.join('. ').trim();

    return {
      summary: summary + (summary.endsWith('.') ? '' : '.'),
      method: 'fallback',
      level,
      wordCount: summary.split(' ').length
    };
  }

  async extractKeywords(text, maxKeywords = 5) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    try {
      if (this.apiAvailable) {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "HTTP-Referer": this.siteUrl,
            "X-Title": this.siteName,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            "model": "google/gemini-2.5-flash-preview-05-20",
            "messages": [
              {
                "role": "system",
                "content": "Extract the most important keywords from the given text. Return only the keywords separated by commas, no explanations."
              },
              {
                "role": "user",
                "content": `Extract ${maxKeywords} key terms from this text:\n\n${text}`
              }
            ],
            "max_tokens": 100,
            "temperature": 0.1
          })
        });

        if (response.ok) {
          const data = await response.json();
          const keywordsText = data.choices[0].message.content.trim();
          return keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 0);
        }
      }
    } catch (error) {
      logger.error('Keyword extraction failed:', error);
    }

    // Fallback keyword extraction
    return this.fallbackExtractKeywords(text, maxKeywords);
  }

  fallbackExtractKeywords(text, maxKeywords) {
    // Simple keyword extraction based on word frequency
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const stopWords = new Set([
      'this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 
      'were', 'said', 'each', 'which', 'their', 'time', 'would', 'there',
      'could', 'other', 'after', 'first', 'well', 'many', 'some', 'what',
      'when', 'where', 'much', 'should', 'very', 'through', 'just', 'being'
    ]);

    const wordCount = {};
    words.forEach(word => {
      if (!stopWords.has(word)) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });

    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }
}

module.exports = new Summarizer();