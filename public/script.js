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
    loadFeeds();
    loadUsers();
    loadArticles();
    
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

    // Add feed form
    document.getElementById('add-feed-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        await addFeed();
    });
}

// Load system statistics
async function loadSystemStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        
        if (data.success) {
            const stats = data.data;
            
            // Update database stats
            document.getElementById('users-count').textContent = stats.database?.total_users || '-';
            document.getElementById('feeds-count').textContent = stats.database?.total_feeds || '-';
            document.getElementById('articles-count').textContent = stats.database?.total_articles || '-';
            document.getElementById('deliveries-count').textContent = stats.database?.total_deliveries || '-';
            
            // Update service status
            updateServiceStatus('line-status', stats.services.lineMessaging);
            updateServiceStatus('summarizer-status', stats.services.summarizer);
            
            // Update scheduler status
            updateSchedulerStatus(stats.scheduler);
            
            // Update uptime
            const uptimeSeconds = stats.services.uptime;
            const uptimeHours = Math.floor(uptimeSeconds / 3600);
            const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
            document.getElementById('uptime').textContent = `${uptimeHours}時間${uptimeMinutes}分`;
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
    
    if (status.includes('Active') || status.includes('configured') || status.includes('OpenAI') || status.includes('OpenRouter')) {
        element.className = 'badge bg-success status-badge';
    } else if (status.includes('Fallback')) {
        element.className = 'badge bg-warning status-badge';
    } else {
        element.className = 'badge bg-secondary status-badge';
    }
}

// Update scheduler status
function updateSchedulerStatus(schedulerData) {
    const container = document.getElementById('scheduler-status');
    if (!schedulerData) {
        container.innerHTML = '<span class="badge bg-secondary">確認中...</span>';
        return;
    }
    
    const statusHtml = Object.entries(schedulerData)
        .map(([name, status]) => {
            const badgeClass = status.running ? 'bg-success' : 'bg-secondary';
            const displayName = {
                'feed-fetching': 'フィード取得',
                'article-delivery': '記事配信',
                'daily-cleanup': 'クリーンアップ'
            }[name] || name;
            
            return `<span class="badge ${badgeClass} me-1">${displayName}</span>`;
        })
        .join('');
    
    container.innerHTML = statusHtml;
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
                    <strong>著者:</strong> ${escapeHtml(article.author || '不明')}
                </div>
                <div class="mb-3">
                    <strong>要約 (${summary.level}):</strong><br>
                    ${escapeHtml(summary.text)}
                </div>
                <div class="mb-3">
                    <strong>方法:</strong> ${summary.method} | <strong>文字数:</strong> ${summary.wordCount}語
                </div>
                <div class="mb-3">
                    <strong>元記事文字数:</strong> ${article.contentLength?.toLocaleString() || 'N/A'}文字
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
                summaryLevel: level
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

// RSS Feed Management Functions

// Load RSS feeds
async function loadFeeds() {
    try {
        const response = await fetch('/api/admin/feeds');
        const data = await response.json();
        
        if (data.success) {
            const tableBody = document.getElementById('feeds-table');
            
            if (data.data.feeds.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="3" class="text-center text-muted">フィードが登録されていません</td>
                    </tr>
                `;
                return;
            }
            
            const feedsHtml = data.data.feeds.map(feed => {
                const lastFetched = feed.last_fetched 
                    ? new Date(feed.last_fetched).toLocaleString('ja-JP')
                    : '未取得';
                
                const statusBadge = feed.active 
                    ? '<span class="badge bg-success">有効</span>'
                    : '<span class="badge bg-secondary">無効</span>';
                
                return `
                    <tr>
                        <td>
                            <strong>${escapeHtml(feed.name)}</strong><br>
                            <small class="text-muted">${escapeHtml(feed.url)}</small>
                        </td>
                        <td>${lastFetched}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            }).join('');
            
            tableBody.innerHTML = feedsHtml;
        }
    } catch (error) {
        console.error('Failed to load feeds:', error);
        document.getElementById('feeds-table').innerHTML = `
            <tr>
                <td colspan="3" class="text-center text-danger">フィードの読み込みに失敗しました</td>
            </tr>
        `;
    }
}

// Add RSS feed
async function addFeed() {
    const form = document.getElementById('add-feed-form');
    const loadingDiv = form.querySelector('.loading');
    
    const name = document.getElementById('feed-name').value;
    const url = document.getElementById('feed-url').value;
    
    try {
        loadingDiv.style.display = 'block';
        
        const response = await fetch('/api/admin/feeds', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, url })
        });
        
        const data = await response.json();
        
        if (data.success) {
            form.reset();
            loadFeeds(); // Refresh feed list
            loadSystemStats(); // Refresh stats
            showMessage('フィードが正常に追加されました: ' + name);
        } else {
            alert(`エラー: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to add feed:', error);
        alert('フィードの追加に失敗しました');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Test RSS feed
async function testFeed() {
    const url = document.getElementById('feed-url').value;
    
    if (!url) {
        alert('RSS URLを入力してください');
        return;
    }
    
    const resultDiv = document.getElementById('feed-test-result');
    const outputDiv = document.getElementById('feed-test-output');
    
    try {
        resultDiv.style.display = 'none';
        
        const response = await fetch('/api/admin/feeds/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const articles = data.data.sampleArticles;
            
            const articlesHtml = articles.map((article, index) => `
                <div class="border-bottom pb-2 mb-2">
                    <strong>${index + 1}. ${escapeHtml(article.title)}</strong><br>
                    <small class="text-muted">${new Date(article.published_at).toLocaleString('ja-JP')}</small><br>
                    <small>${escapeHtml(article.preview)}</small>
                </div>
            `).join('');
            
            outputDiv.innerHTML = `
                <p><strong>取得成功！</strong> ${articles.length}件の記事が見つかりました。</p>
                ${articlesHtml}
            `;
            
            resultDiv.style.display = 'block';
        } else {
            alert(`エラー: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to test feed:', error);
        alert('フィードのテストに失敗しました');
    }
}

// Refresh feeds
function refreshFeeds() {
    loadFeeds();
}

// User Management Functions

// Load users
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (data.success) {
            const tableBody = document.getElementById('users-table');
            
            if (data.data.users.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center text-muted">ユーザーが登録されていません</td>
                    </tr>
                `;
                return;
            }
            
            const usersHtml = data.data.users.map(user => {
                const createdAt = new Date(user.created_at).toLocaleDateString('ja-JP');
                const statusBadge = user.active 
                    ? '<span class="badge bg-success">有効</span>'
                    : '<span class="badge bg-secondary">無効</span>';
                
                return `
                    <tr>
                        <td><code>${escapeHtml(user.line_user_id)}</code></td>
                        <td>${escapeHtml(user.display_name || '未設定')}</td>
                        <td>${escapeHtml(user.summary_level)}</td>
                        <td>${escapeHtml(user.delivery_time)}</td>
                        <td>${statusBadge}</td>
                        <td>${createdAt}</td>
                    </tr>
                `;
            }).join('');
            
            tableBody.innerHTML = usersHtml;
        }
    } catch (error) {
        console.error('Failed to load users:', error);
        document.getElementById('users-table').innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger">ユーザーの読み込みに失敗しました</td>
            </tr>
        `;
    }
}

// Refresh users
function refreshUsers() {
    loadUsers();
}

// Article Management Functions

// Load articles
async function loadArticles() {
    try {
        const response = await fetch('/api/admin/articles?limit=20');
        const data = await response.json();
        
        if (data.success) {
            const tableBody = document.getElementById('articles-table');
            
            if (data.data.articles.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-muted">記事がありません</td>
                    </tr>
                `;
                return;
            }
            
            const articlesHtml = data.data.articles.map(article => {
                const publishedAt = new Date(article.published_at).toLocaleDateString('ja-JP');
                const createdAt = new Date(article.created_at).toLocaleDateString('ja-JP');
                const summary = article.summary ? article.summary.substring(0, 100) + '...' : '未処理';
                
                return `
                    <tr>
                        <td>
                            <strong>${escapeHtml(article.title)}</strong><br>
                            <small><a href="${article.url}" target="_blank" class="text-muted">元記事を開く</a></small>
                        </td>
                        <td>${escapeHtml(article.feed_name || '不明')}</td>
                        <td>${escapeHtml(summary)}</td>
                        <td>${publishedAt}</td>
                        <td>${createdAt}</td>
                    </tr>
                `;
            }).join('');
            
            tableBody.innerHTML = articlesHtml;
        }
    } catch (error) {
        console.error('Failed to load articles:', error);
        document.getElementById('articles-table').innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger">記事の読み込みに失敗しました</td>
            </tr>
        `;
    }
}

// Refresh articles
function refreshArticles() {
    loadArticles();
}

// Scheduler Functions

// Trigger feed fetching
async function triggerFeedFetching() {
    try {
        const response = await fetch('/api/admin/scheduler/trigger-feeds', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            displaySchedulerResult(data.data);
            loadSystemStats();
            loadArticles();
        } else {
            alert(`エラー: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to trigger feed fetching:', error);
        alert('フィード取得の実行に失敗しました');
    }
}

// Trigger article delivery
async function triggerArticleDelivery() {
    try {
        const response = await fetch('/api/admin/scheduler/trigger-delivery', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            displaySchedulerResult(data.data);
            loadSystemStats();
        } else {
            alert(`エラー: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to trigger article delivery:', error);
        alert('記事配信の実行に失敗しました');
    }
}

// Trigger cleanup
async function triggerCleanup() {
    try {
        const response = await fetch('/api/admin/scheduler/trigger-cleanup', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            displaySchedulerResult(data.data);
            loadSystemStats();
        } else {
            alert(`エラー: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to trigger cleanup:', error);
        alert('クリーンアップの実行に失敗しました');
    }
}

// Display scheduler result
function displaySchedulerResult(result) {
    const container = document.getElementById('scheduler-results');
    
    const resultHtml = `
        <div class="mb-3">
            <strong>実行時刻:</strong> ${new Date().toLocaleString('ja-JP')}
        </div>
        <div class="mb-3">
            <strong>結果:</strong>
            <pre class="mt-2">${JSON.stringify(result, null, 2)}</pre>
        </div>
    `;
    
    container.innerHTML = resultHtml;
}

// Log Functions

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

// Utility Functions

// Show alert message
function showAlert(section, type, message) {
    const alertId = section + '-alert';
    const resultId = section + '-result';
    
    const alertElement = document.getElementById(alertId);
    const resultElement = document.getElementById(resultId);
    
    if (alertElement && resultElement) {
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
}

// Show simple message
function showMessage(message) {
    alert(message);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Auto-refresh stats every 30 seconds
setInterval(loadSystemStats, 30000);

// Refresh data when switching tabs
document.getElementById('pills-tab').addEventListener('shown.bs.tab', function (event) {
    const targetTab = event.target.getAttribute('data-bs-target');
    
    switch (targetTab) {
        case '#pills-feeds':
            loadFeeds();
            break;
        case '#pills-users':
            loadUsers();
            break;
        case '#pills-articles':
            loadArticles();
            break;
        case '#pills-logs':
            loadLogs();
            break;
    }
});