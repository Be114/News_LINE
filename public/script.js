// News LINE Admin Interface JavaScript

// Update current time
function updateTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleString('ja-JP');
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    updateTime();
    setInterval(updateTime, 1000);
    
    loadSystemStats();
    loadLogs();
    
    // Setup form handlers
    setupFormHandlers();
});

// Setup form event handlers
function setupFormHandlers() {
    // Article test form
    document.getElementById('article-test-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        await testArticle();
    });

    // LINE test form
    document.getElementById('line-test-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        await testLineMessage();
    });

    // Complete test form
    document.getElementById('complete-test-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        await testCompleteProcess();
    });
}

// Load system statistics
async function loadSystemStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        
        if (data.success) {
            const stats = data.data;
            
            // Update counters
            document.getElementById('articles-count').textContent = stats.totalArticlesProcessed;
            document.getElementById('messages-count').textContent = stats.totalMessagesSent;
            
            // Update service status
            updateServiceStatus('line-status', stats.services.lineMessaging);
            updateServiceStatus('summarizer-status', stats.services.summarizer);
        }
    } catch (error) {
        console.error('Failed to load system stats:', error);
        showAlert('complete', 'danger', 'システム統計の読み込みに失敗しました');
    }
}

// Update service status badge
function updateServiceStatus(elementId, status) {
    const element = document.getElementById(elementId);
    element.textContent = status;
    
    if (status.includes('Active') || status.includes('configured') || status.includes('OpenAI')) {
        element.className = 'badge bg-success status-badge';
    } else if (status.includes('Fallback')) {
        element.className = 'badge bg-warning status-badge';
    } else {
        element.className = 'badge bg-secondary status-badge';
    }
}

// Test article processing
async function testArticle() {
    const form = document.getElementById('article-test-form');
    const loadingDiv = form.querySelector('.loading');
    const resultDiv = document.getElementById('article-result');
    const outputDiv = document.getElementById('article-output');
    
    const url = document.getElementById('article-url').value;
    const level = document.getElementById('summary-level').value;
    
    try {
        loadingDiv.style.display = 'block';
        resultDiv.style.display = 'none';
        
        const response = await fetch('/api/admin/test-article', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url, summaryLevel: level })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const { article, summary } = data.data;
            
            outputDiv.innerHTML = `
                <div class="mb-3">
                    <strong>タイトル:</strong> ${escapeHtml(article.title)}
                </div>
                <div class="mb-3">
                    <strong>著者:</strong> ${escapeHtml(article.author)}
                </div>
                <div class="mb-3">
                    <strong>要約 (${summary.level}):</strong><br>
                    ${escapeHtml(summary.text)}
                </div>
                <div class="mb-3">
                    <strong>方法:</strong> ${summary.method} | <strong>文字数:</strong> ${summary.wordCount}語
                </div>
                <div class="mb-3">
                    <strong>元記事文字数:</strong> ${article.contentLength.toLocaleString()}文字
                </div>
            `;
            
            resultDiv.style.display = 'block';
            loadSystemStats(); // Refresh stats
        } else {
            showAlert('article', 'danger', `エラー: ${data.message}`);
        }
    } catch (error) {
        console.error('Article test failed:', error);
        showAlert('article', 'danger', '記事処理テストに失敗しました');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Test LINE message
async function testLineMessage() {
    const form = document.getElementById('line-test-form');
    const loadingDiv = form.querySelector('.loading');
    
    const userId = document.getElementById('line-user-id').value;
    const message = document.getElementById('test-message').value;
    
    try {
        loadingDiv.style.display = 'block';
        
        const response = await fetch('/api/admin/test-line', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId, message })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('line', 'success', `メッセージが正常に送信されました (${data.data.messageLength}文字)`);
            loadSystemStats(); // Refresh stats
        } else {
            showAlert('line', 'danger', `エラー: ${data.message}`);
        }
    } catch (error) {
        console.error('LINE test failed:', error);
        showAlert('line', 'danger', 'LINEメッセージ送信テストに失敗しました');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Test complete process
async function testCompleteProcess() {
    const form = document.getElementById('complete-test-form');
    const loadingDiv = form.querySelector('.loading');
    
    const url = document.getElementById('complete-url').value;
    const userId = document.getElementById('complete-user-id').value;
    const level = document.getElementById('complete-level').value;
    const useFlexMessage = document.getElementById('use-flex-message').checked;
    
    try {
        loadingDiv.style.display = 'block';
        
        const response = await fetch('/api/articles/process-and-send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                url, 
                lineUserId: userId, 
                summaryLevel: level,
                useFlexMessage
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const { article, summary, lineDelivery } = data.data;
            showAlert('complete', 'success', 
                `完全処理が成功しました！<br>
                <strong>記事:</strong> ${escapeHtml(article.title)}<br>
                <strong>要約:</strong> ${summary.level} (${summary.wordCount}語)<br>
                <strong>LINE配信:</strong> 成功`
            );
            loadSystemStats(); // Refresh stats
        } else {
            showAlert('complete', 'danger', `エラー: ${data.message}`);
        }
    } catch (error) {
        console.error('Complete process test failed:', error);
        showAlert('complete', 'danger', '完全処理テストに失敗しました');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Load system logs
async function loadLogs() {
    try {
        const response = await fetch('/api/admin/logs?limit=50');
        const data = await response.json();
        
        if (data.success) {
            const logsContainer = document.getElementById('logs-container');
            
            if (data.data.logs.length === 0) {
                logsContainer.innerHTML = '<div class="text-muted text-center">ログがありません</div>';
                return;
            }
            
            const logsHtml = data.data.logs
                .reverse() // Show newest first
                .map(log => {
                    const timestamp = new Date(log.timestamp).toLocaleString('ja-JP');
                    const levelClass = log.level || 'info';
                    return `
                        <div class="log-entry ${levelClass}">
                            <small class="text-muted">${timestamp} [${log.level?.toUpperCase() || 'INFO'}]</small><br>
                            ${escapeHtml(log.message)}
                        </div>
                    `;
                })
                .join('');
            
            logsContainer.innerHTML = logsHtml;
        }
    } catch (error) {
        console.error('Failed to load logs:', error);
        document.getElementById('logs-container').innerHTML = 
            '<div class="text-danger text-center">ログの読み込みに失敗しました</div>';
    }
}

// Refresh logs
function refreshLogs() {
    loadLogs();
}

// Show alert message
function showAlert(section, type, message) {
    const alertId = section + '-alert';
    const resultId = section + '-result';
    
    const alertElement = document.getElementById(alertId);
    const resultElement = document.getElementById(resultId);
    
    alertElement.className = `alert alert-${type}`;
    alertElement.innerHTML = message;
    
    resultElement.style.display = 'block';
    
    // Auto-hide success alerts after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            resultElement.style.display = 'none';
        }, 5000);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-refresh stats every 30 seconds
setInterval(loadSystemStats, 30000);