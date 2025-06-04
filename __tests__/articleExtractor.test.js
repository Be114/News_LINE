const axios = require('axios');
const articleExtractor = require('../src/services/articleExtractor');

jest.mock('axios');

describe('articleExtractor.extractFromUrl', () => {
  it('parses title and content from HTML', async () => {
    const longText = 'Hello world '.repeat(10); // length 110
    axios.get.mockResolvedValue({ data: `<html><body><h1>My Title</h1><article><p>${longText}</p></article></body></html>` });
    const article = await articleExtractor.extractFromUrl('http://example.com');
    expect(article.title).toBe('My Title');
    expect(article.content).toContain('Hello world');
  });

  it('throws error for invalid URL', async () => {
    await expect(articleExtractor.extractFromUrl('invalid')).rejects.toThrow('Invalid URL');
  });
});
