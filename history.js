// history.js - script.js から分割された機能モジュール

// RecipeApp.prototype に Object.assign で合成される

export const historyMethods = {

  async saveShoppingHistory() {
    try {

      
      // 既存の履歴を取得
      const shoppingLists = await window.recipeDB.getAll('shoppingList');
      const existingHistory = shoppingLists.find(item => item.type === 'history');
      
      // 保存するデータ
      const historyToSave = {
        type: 'history',
        data: this.shoppingHistory,
        timestamp: new Date().getTime()
      };

      if (existingHistory) {
        // 既存の履歴を更新
        historyToSave.id = existingHistory.id;
        await window.recipeDB.update('shoppingList', historyToSave);
      } else {
        // 新しい履歴を追加
        await window.recipeDB.add('shoppingList', historyToSave);
      }
      

      return true;
    } catch (error) {

      throw error;
    }
  },

  renderHistoryItem(item) {
    const name = item.name || '名称不明';
    const quantity = item.quantity ? ` ${item.quantity}` : '';
    const unit = item.unit && item.unit !== 'undefined' ? item.unit : '';
    return `
      <li class="history-item">
        <span class="item-name">${this.escapeHtml(name)}</span>
        <span class="item-quantity">${quantity}${unit}</span>
      </li>`;
  },

  renderShoppingHistory() {
    
    const historyList = document.getElementById('history-modal-list');
    if (!historyList) {
      console.error('[ERROR] History list element not found');
      return;
    }

    if (!Array.isArray(this.shoppingHistory) || this.shoppingHistory.length === 0) {
      historyList.innerHTML = '<p class="empty-message">履歴がありません</p>';
      return;
    }

    try {
      historyList.innerHTML = this.shoppingHistory.map(history => {
        try {
          
          // 日付の処理
          const date = history.date ? new Date(history.date) : new Date();
          const formattedDate = history.date 
            ? `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
            : '日付不明';
          
          // アイテムの処理
          const items = Array.isArray(history.items) ? history.items : [];
          
          // 選択されたレシピを表示するセクション
          let recipeNamesHTML = '';
          
          // 履歴エントリにselectedRecipesが含まれている場合はそれを使用
          if (history.selectedRecipes && history.selectedRecipes.length > 0) {
            recipeNamesHTML = `
              <div class="selected-recipes">
                <h4>選択したレシピ</h4>
                <div class="recipe-tags">
                  ${history.selectedRecipes.map(recipe => `
                    <span class="recipe-tag" data-id="${recipe.id}">${this.escapeHtml(recipe.name)}</span>
                  `).join('')}
                </div>
              </div>
            `;
          } else {
            // 互換性のため、古い形式のデータもサポート
            const recipeNames = [];
            items.forEach(item => {
              if (item.recipeName && !recipeNames.includes(item.recipeName)) {
                recipeNames.push(item.recipeName);
              }
            });
            
            if (recipeNames.length > 0) {
              recipeNamesHTML = `
                <div class="selected-recipes">
                  <h4>選択したレシピ</h4>
                  <div class="recipe-tags">
                    ${recipeNames.map(name => `
                      <span class="recipe-tag">${this.escapeHtml(name)}</span>
                    `).join('')}
                  </div>
                </div>
              `;
            }
          }
          
          // アイテムを通常アイテムと調味料に分ける（isSeasoningフラグを優先）
          const regularItems = items.filter(item => !(item.isSeasoning || this.isSeasoningItem(item)));
          const seasoningItems = items.filter(item => item.isSeasoning || this.isSeasoningItem(item));

          // 通常アイテムの表示
          const regularItemsHTML = regularItems.length > 0 ? `
            <div class="history-category regular-items">
              <h4>購入したアイテム</h4>
              <ul class="history-items">
                ${regularItems.map(item => this.renderHistoryItem(item)).join('')}
              </ul>
            </div>
          ` : '';

          // 調味料の表示
          const seasoningHTML = seasoningItems.length > 0 ? `
            <div class="history-category seasonings">
              <h4>調味料</h4>
              <ul class="history-items">
                ${seasoningItems.map(item => this.renderHistoryItem(item)).join('')}
              </ul>
            </div>
          ` : '';

          return `
            <div class="history-card">
              <div class="history-header">
                <button class="accordion-toggle" data-id="${history.id || ''}">
                  <span class="history-date">${formattedDate}</span>
                  <span class="accordion-icon">
                    <i class="fas fa-chevron-down"></i>
                  </span>
                </button>
                <button class="btn-delete-history" data-id="${history.id || ''}">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
              <div class="accordion-content">
                ${recipeNamesHTML}
                <div class="history-items-container">
                  ${regularItemsHTML}
                  ${seasoningHTML}
                </div>
              </div>
            </div>`;
        } catch (error) {
          console.error('[ERROR] Error rendering history entry:', error, history);
          return '';
        }
      }).join('');

      // 削除ボタンのイベントリスナーを設定
    document.querySelectorAll('.btn-delete-history').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const historyId = e.currentTarget.dataset.id;
        if (historyId) {
          this.removeHistoryEntry(historyId);
        }
      });
    });
    
    // アコーディオントグルボタンのイベントリスナーを設定
    document.querySelectorAll('.accordion-toggle').forEach(button => {
      // 既存のイベントリスナーを削除
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      
      newButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // クリックされたボタンの親要素（.history-card）を取得
        const card = newButton.closest('.history-card');
        if (card) {
          // アコーディオンコンテンツを取得
          const content = card.querySelector('.accordion-content');
          if (content) {
            // アコーディオンの開閉を切り替え
            const isExpanding = !content.classList.contains('active');
            
            // アニメーション用に高さを設定
            if (isExpanding) {
              // 一度autoにして高さを取得してからアニメーション
              content.style.maxHeight = 'none';
              const height = content.scrollHeight + 'px';
              content.style.maxHeight = '0';
              
              // リフローを強制
              content.offsetHeight;
              
              // アニメーション開始
              content.style.maxHeight = height;
            } else {
              content.style.maxHeight = '0';
            }
            
            // アクティブクラスの切り替え
            content.classList.toggle('active', isExpanding);
            
            // アイコンの向きを変更
            const icon = newButton.querySelector('.accordion-icon i');
            if (icon) {
              if (isExpanding) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
              } else {
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
              }
            }
          }
        }
      });
    });
    
    // ゴミ箱ボタンのイベントリスナーを設定
    document.querySelectorAll('.btn-delete-history').forEach(button => {
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      
      newButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const historyId = newButton.dataset.id;
        if (historyId) {
          this.removeHistoryEntry(historyId);
        }
      });
      
      // 初期状態では閉じた状態にする
      const content = button.nextElementSibling;
      if (content && content.classList.contains('accordion-content')) {
        content.style.maxHeight = '0';
        content.classList.remove('active');
      }
    });
      
    } catch (error) {
      console.error('[ERROR] Error rendering shopping history:', error);
      historyList.innerHTML = '<p class="error-message">履歴の表示中にエラーが発生しました</p>';
    }
  },

  removeHistoryEntry(historyId) {
    // 型を統一して比較（数値と文字列の両方に対応）
    const idToRemove = typeof historyId === 'string' ? parseInt(historyId, 10) : historyId;
    
    this.shoppingHistory = this.shoppingHistory.filter(entry => {
      const entryId = typeof entry.id === 'string' ? parseInt(entry.id, 10) : entry.id;
      return entryId !== idToRemove;
    });
    
    this.saveShoppingHistory();
    this.renderShoppingHistory();
    this.showMessage('履歴を削除しました', 'success');
  },

  clearAllHistory() {
    if (confirm('すべての買い物履歴を削除しますか？この操作は元に戻せません。')) {
      this.shoppingHistory = [];
      this.saveShoppingHistory();
      this.renderShoppingHistory();
      this.showMessage('すべての履歴を削除しました', 'success');
    }
  },

  showHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (!modal) return;
    
    this.renderShoppingHistory();
    modal.style.display = 'flex';
    modal.dispatchEvent(new Event('show'));
  },

  hideHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (!modal) return;
    
    modal.style.display = 'none';
    modal.dispatchEvent(new Event('hide'));
  },

};
