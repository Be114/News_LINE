const OpenAI = require('openai');
const logger = require('../utils/logger');

class Summarizer {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not found. Summarization will use fallback method.');
      this.openai = null;
    } else {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
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

      if (this.openai) {
        return await this.summarizeWithOpenAI(text, level);
      } else {
        return this.fallbackSummarize(text, level);
      }

    } catch (error) {
      logger.error('Summarization failed:', error);
      
      // Fallback to simple text truncation
      return this.fallbackSummarize(text, level);
    }
  }

  async summarizeWithOpenAI(text, level) {
    const config = this.summaryLevels[level] || this.summaryLevels.standard;
    
    const prompt = `Please summarize the following news article in exactly ${config.sentences} sentences. Make it clear, concise, and informative:\n\n${text}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a professional news summarizer. Create accurate, concise summaries that capture the key information.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: config.maxTokens,
      temperature: 0.3
    });

    const summary = response.choices[0].message.content.trim();
    
    logger.info('Successfully generated AI summary');
    return {
      summary,
      method: 'openai',
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
      if (this.openai) {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'Extract the most important keywords from the given text. Return only the keywords separated by commas, no explanations.'
            },
            {
              role: 'user',
              content: `Extract ${maxKeywords} key terms from this text:\n\n${text}`
            }
          ],
          max_tokens: 100,
          temperature: 0.1
        });

        const keywordsText = response.choices[0].message.content.trim();
        return keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 0);
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