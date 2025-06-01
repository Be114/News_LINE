const { Client } = require('@line/bot-sdk');
const logger = require('../utils/logger');

class LineMessagingService {
  constructor() {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_CHANNEL_SECRET) {
      logger.warn('LINE API credentials not found. LINE messaging will be disabled.');
      this.client = null;
      this.config = null;
    } else {
      this.config = {
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
        channelSecret: process.env.LINE_CHANNEL_SECRET
      };
      this.client = new Client(this.config);
    }
  }

  async sendSummary(userId, article, summary) {
    if (!this.client) {
      logger.warn('LINE client not initialized. Cannot send message.');
      return { success: false, error: 'LINE client not configured' };
    }

    try {
      logger.info(`Sending summary to LINE user: ${userId}`);

      const message = this.formatSummaryMessage(article, summary);
      
      await this.client.pushMessage(userId, message);
      
      logger.info(`Successfully sent summary to LINE user: ${userId}`);
      return { success: true, messageId: `${Date.now()}` };

    } catch (error) {
      logger.error(`Failed to send LINE message to ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }

  formatSummaryMessage(article, summary) {
    const { title, url } = article;
    const { summary: summaryText, level, wordCount } = summary;

    // Create a rich message with flex message or simple text
    const messageText = `📰 ${title}\n\n📝 要約 (${level}):\n${summaryText}\n\n🔗 元記事: ${url}\n\n📊 文字数: ${wordCount}語`;

    return {
      type: 'text',
      text: messageText
    };
  }

  async sendFlexSummary(userId, article, summary) {
    if (!this.client) {
      logger.warn('LINE client not initialized. Cannot send flex message.');
      return { success: false, error: 'LINE client not configured' };
    }

    try {
      const flexMessage = this.createFlexSummaryMessage(article, summary);
      
      await this.client.pushMessage(userId, flexMessage);
      
      logger.info(`Successfully sent flex summary to LINE user: ${userId}`);
      return { success: true, messageId: `${Date.now()}` };

    } catch (error) {
      logger.error(`Failed to send LINE flex message to ${userId}:`, error);
      // Fallback to simple text message
      return await this.sendSummary(userId, article, summary);
    }
  }

  createFlexSummaryMessage(article, summary) {
    const { title, url, publishDate } = article;
    const { summary: summaryText, level, wordCount } = summary;

    return {
      type: 'flex',
      altText: `📰 ${title}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📰 News Summary',
              weight: 'bold',
              color: '#1DB446',
              size: 'sm'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: title,
              weight: 'bold',
              size: 'lg',
              wrap: true
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: summaryText,
                  wrap: true,
                  color: '#666666',
                  size: 'sm'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'uri',
                label: '元記事を読む',
                uri: url
              }
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: `要約レベル: ${level} | 文字数: ${wordCount}語`,
                  color: '#aaaaaa',
                  size: 'xs',
                  flex: 1
                }
              ]
            }
          ]
        }
      }
    };
  }

  async handleWebhook(events) {
    if (!this.client) {
      logger.warn('LINE client not initialized. Cannot handle webhook.');
      return [];
    }

    const results = [];

    for (const event of events) {
      try {
        const result = await this.handleEvent(event);
        results.push(result);
      } catch (error) {
        logger.error('Error handling LINE event:', error);
        results.push({ success: false, error: error.message });
      }
    }

    return results;
  }

  async handleEvent(event) {
    const { type, replyToken, source } = event;

    switch (type) {
      case 'message':
        return await this.handleMessageEvent(event);
      case 'follow':
        return await this.handleFollowEvent(event);
      case 'unfollow':
        return await this.handleUnfollowEvent(event);
      default:
        logger.info(`Unhandled event type: ${type}`);
        return { success: true, message: 'Event ignored' };
    }
  }

  async handleMessageEvent(event) {
    const { message, replyToken, source } = event;
    
    if (message.type !== 'text') {
      return { success: true, message: 'Non-text message ignored' };
    }

    const userMessage = message.text.toLowerCase();
    let replyMessage;

    if (userMessage.includes('help') || userMessage.includes('ヘルプ')) {
      replyMessage = this.getHelpMessage();
    } else if (userMessage.includes('summary') || userMessage.includes('要約')) {
      replyMessage = {
        type: 'text',
        text: '記事のURLを送信してください。自動的に要約してお送りします。\n\n使用方法:\nhttps://example.com/news-article'
      };
    } else if (this.isUrl(userMessage)) {
      // This would trigger article processing
      replyMessage = {
        type: 'text',
        text: '記事を処理中です。少々お待ちください...'
      };
    } else {
      replyMessage = this.getDefaultMessage();
    }

    await this.client.replyMessage(replyToken, replyMessage);
    return { success: true, message: 'Reply sent' };
  }

  async handleFollowEvent(event) {
    const { replyToken } = event;
    
    const welcomeMessage = {
      type: 'text',
      text: 'News LINEへようこそ！🎉\n\nニュース記事のURLを送信すると、自動的に要約してお送りします。\n\n「ヘルプ」と送信すると使い方を確認できます。'
    };

    await this.client.replyMessage(replyToken, welcomeMessage);
    return { success: true, message: 'Welcome message sent' };
  }

  async handleUnfollowEvent(event) {
    logger.info(`User unfollowed: ${event.source.userId}`);
    return { success: true, message: 'User unfollowed' };
  }

  getHelpMessage() {
    return {
      type: 'text',
      text: '📖 News LINE ヘルプ\n\n🔗 記事URL送信\nニュース記事のURLを送信すると要約をお送りします。\n\n💬 コマンド\n• 「ヘルプ」- このメッセージを表示\n• 「要約」- 使用方法を確認\n\n📧 お問い合わせ\n何かご不明な点がございましたら、サポートまでお問い合わせください。'
    };
  }

  getDefaultMessage() {
    return {
      type: 'text',
      text: 'こんにちは！👋\n\nニュース記事のURLを送信してください。自動的に要約してお送りします。\n\n「ヘルプ」と送信すると詳しい使い方を確認できます。'
    };
  }

  isUrl(text) {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  }

  isConfigured() {
    return this.client !== null;
  }
}

module.exports = new LineMessagingService();