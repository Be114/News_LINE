const { Client } = require('@line/bot-sdk');
const logger = require('../utils/logger');
const database = require('./database');
const articleExtractor = require('./articleExtractor');
const summarizer = require('./summarizer');

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
    const userId = source.userId;
    
    if (message.type !== 'text') {
      return { success: true, message: 'Non-text message ignored' };
    }

    const userMessage = message.text.trim();
    let replyMessage;

    try {
      // Ensure user exists in database
      await this.ensureUserExists(userId);

      // Handle different message types
      if (userMessage.includes('ヘルプ') || userMessage.toLowerCase().includes('help')) {
        replyMessage = this.getHelpMessage();
      } else if (userMessage.includes('設定')) {
        replyMessage = await this.getSettingsMessage(userId);
      } else if (userMessage.includes('購読')) {
        replyMessage = await this.getSubscriptionMessage(userId);
      } else if (userMessage.startsWith('配信時間 ')) {
        const time = userMessage.replace('配信時間 ', '').trim();
        replyMessage = await this.updateDeliveryTime(userId, time);
      } else if (userMessage.startsWith('要約レベル ')) {
        const level = userMessage.replace('要約レベル ', '').trim();
        replyMessage = await this.updateSummaryLevel(userId, level);
      } else if (this.isUrl(userMessage)) {
        // Process article URL immediately
        replyMessage = await this.processArticleUrl(userId, userMessage);
      } else {
        replyMessage = this.getDefaultMessage();
      }

    } catch (error) {
      logger.error(`Error handling message from ${userId}:`, error);
      replyMessage = {
        type: 'text',
        text: 'エラーが発生しました。しばらくしてからもう一度お試しください。'
      };
    }

    await this.client.replyMessage(replyToken, replyMessage);
    return { success: true, message: 'Reply sent' };
  }

  async handleFollowEvent(event) {
    const { replyToken, source } = event;
    const userId = source.userId;
    
    try {
      // Register new user in database
      await this.ensureUserExists(userId);
      
      const welcomeMessage = {
        type: 'text',
        text: 'News LINEへようこそ！🎉\n\nニュース記事のURLを送信すると、自動的に要約してお送りします。\n\n📋 基本機能:\n• 記事URL送信 → 即座に要約\n• 「設定」→ 配信設定の確認・変更\n• 「ヘルプ」→ 詳しい使い方\n\n自動配信機能もご利用いただけます！'
      };

      await this.client.replyMessage(replyToken, welcomeMessage);
      logger.info(`New user registered: ${userId}`);
      
    } catch (error) {
      logger.error(`Error handling follow event for ${userId}:`, error);
    }
    
    return { success: true, message: 'Welcome message sent' };
  }

  async handleUnfollowEvent(event) {
    const userId = event.source.userId;
    
    try {
      // Deactivate user in database
      await database.updateUserSettings(userId, { active: false });
      logger.info(`User deactivated: ${userId}`);
    } catch (error) {
      logger.error(`Error handling unfollow event for ${userId}:`, error);
    }
    
    return { success: true, message: 'User unfollowed' };
  }

  getHelpMessage() {
    return {
      type: 'text',
      text: '📖 News LINE ヘルプ\n\n🔗 即座に記事要約\nニュース記事のURLを送信すると日本語で要約をお送りします。\n\n⚙️ 設定コマンド\n• 「設定」- 現在の設定を確認\n• 「配信時間 08:00」- 配信時間を変更\n• 「要約レベル standard」- 要約の詳細度を変更\n  (brief/standard/detailed)\n\n📡 自動配信\n定期的にニュースをお届けします。\n\n💬 その他のコマンド\n• 「ヘルプ」- このメッセージを表示\n• 「購読」- 購読中のフィードを確認\n\n📧 お困りの際はサポートまでお問い合わせください。'
    };
  }

  getDefaultMessage() {
    return {
      type: 'text',
      text: 'こんにちは！👋\n\nニュース記事のURLを送信してください。自動的に要約してお送りします。\n\n📋 利用可能なコマンド:\n• 「ヘルプ」- 詳しい使い方\n• 「設定」- 配信設定の確認・変更\n\nお気軽にお試しください！'
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

  // User management methods
  async ensureUserExists(userId) {
    try {
      let user = await database.getUserByLineId(userId);
      if (!user) {
        user = await database.createUser(userId);
        logger.info(`Created new user: ${userId}`);
      }
      return user;
    } catch (error) {
      logger.error(`Failed to ensure user exists ${userId}:`, error);
      throw error;
    }
  }

  async getSettingsMessage(userId) {
    try {
      const user = await database.getUserByLineId(userId);
      if (!user) {
        return {
          type: 'text',
          text: 'ユーザー情報が見つかりません。'
        };
      }

      const settingsText = `⚙️ 現在の設定\n\n🕐 配信時間: ${user.delivery_time}\n📝 要約レベル: ${user.summary_level}\n🌍 タイムゾーン: ${user.timezone}\n📡 自動配信: ${user.active ? '有効' : '無効'}\n\n💡 設定を変更するには:\n• 「配信時間 09:00」\n• 「要約レベル detailed」\nのように送信してください。`;

      return {
        type: 'text',
        text: settingsText
      };
    } catch (error) {
      logger.error(`Failed to get settings for ${userId}:`, error);
      return {
        type: 'text',
        text: '設定の取得に失敗しました。'
      };
    }
  }

  async getSubscriptionMessage(userId) {
    try {
      const user = await database.getUserByLineId(userId);
      if (!user) {
        return {
          type: 'text',
          text: 'ユーザー情報が見つかりません。'
        };
      }

      const subscriptions = await database.getUserSubscriptions(user.id);
      
      if (subscriptions.length === 0) {
        return {
          type: 'text',
          text: '📡 現在購読中のフィードはありません。\n\n管理者によってRSSフィードが追加されると、自動的に配信が開始されます。'
        };
      }

      const subscriptionList = subscriptions.map((feed, index) => 
        `${index + 1}. ${feed.name}\n   🔗 ${feed.url}`
      ).join('\n\n');

      return {
        type: 'text',
        text: `📡 購読中のフィード (${subscriptions.length}件)\n\n${subscriptionList}`
      };
    } catch (error) {
      logger.error(`Failed to get subscriptions for ${userId}:`, error);
      return {
        type: 'text',
        text: '購読情報の取得に失敗しました。'
      };
    }
  }

  async updateDeliveryTime(userId, time) {
    try {
      // Validate time format (HH:MM)
      if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        return {
          type: 'text',
          text: '⚠️ 時間の形式が正しくありません。\n\n例: 「配信時間 08:30」\n(24時間形式でHH:MM)'
        };
      }

      await database.updateUserSettings(userId, { delivery_time: time });
      
      return {
        type: 'text',
        text: `✅ 配信時間を ${time} に設定しました。\n\n毎日この時間頃にニュースをお届けします。`
      };
    } catch (error) {
      logger.error(`Failed to update delivery time for ${userId}:`, error);
      return {
        type: 'text',
        text: '配信時間の設定に失敗しました。'
      };
    }
  }

  async updateSummaryLevel(userId, level) {
    try {
      const validLevels = ['brief', 'standard', 'detailed'];
      if (!validLevels.includes(level)) {
        return {
          type: 'text',
          text: '⚠️ 要約レベルが正しくありません。\n\n利用可能なレベル:\n• brief (簡潔)\n• standard (標準)\n• detailed (詳細)\n\n例: 「要約レベル standard」'
        };
      }

      await database.updateUserSettings(userId, { summary_level: level });
      
      const levelNames = {
        brief: '簡潔',
        standard: '標準', 
        detailed: '詳細'
      };

      return {
        type: 'text',
        text: `✅ 要約レベルを「${levelNames[level]}」に設定しました。\n\n今後の要約はこのレベルでお送りします。`
      };
    } catch (error) {
      logger.error(`Failed to update summary level for ${userId}:`, error);
      return {
        type: 'text',
        text: '要約レベルの設定に失敗しました。'
      };
    }
  }

  async processArticleUrl(userId, url) {
    try {
      // Get user settings for summary level
      const user = await database.getUserByLineId(userId);
      const summaryLevel = user ? user.summary_level : 'standard';

      // Send initial processing message
      await this.client.pushMessage(userId, {
        type: 'text',
        text: '📄 記事を処理中です...\n少々お待ちください。'
      });

      // Extract article content
      const extractedContent = await articleExtractor.extract(url);
      
      if (!extractedContent || !extractedContent.content) {
        return {
          type: 'text',
          text: '❌ 記事の内容を取得できませんでした。\n\nURLを確認して再度お試しください。'
        };
      }

      // Generate summary
      const summaryResult = await summarizer.summarize(extractedContent.content, summaryLevel);
      const keywords = await summarizer.extractKeywords(extractedContent.content, 5);

      // Format and send response
      const article = {
        title: extractedContent.title || 'タイトル不明',
        url: url
      };

      const response = this.formatSummaryMessage(article, summaryResult);
      
      // Add keywords if available
      if (keywords && keywords.length > 0) {
        response.text += `\n\n🏷️ キーワード: ${keywords.join(', ')}`;
      }

      return response;

    } catch (error) {
      logger.error(`Failed to process article URL for ${userId}:`, error);
      return {
        type: 'text',
        text: '❌ 記事の処理中にエラーが発生しました。\n\nしばらくしてから再度お試しください。'
      };
    }
  }

  // Method for sending multiple messages (used by scheduler)
  async sendMessages(userId, messages) {
    if (!this.client) {
      throw new Error('LINE client not configured');
    }

    try {
      await this.client.pushMessage(userId, messages);
      logger.info(`Successfully sent ${messages.length} messages to ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send messages to ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = new LineMessagingService();