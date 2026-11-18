// custom_items.js - script.js から分割された機能モジュール

// RecipeApp.prototype に Object.assign で合成される

export const customItemsMethods = {

  // 一括削除ボタンのセットアップ
  setupClearButton() {
    const clearButton = document.getElementById('clear-custom-items');

    if (clearButton) {
      clearButton.addEventListener('click', (e) => {

        e.preventDefault();
        e.stopPropagation(); // イベントの伝搬を防ぐ
        this.clearAllCustomItems();
      });
    } else {

    }
  },

  // カスタムアイテムを保存
  // type='customItems' のレコードをすべて削除してから正規形で1件だけ書く。
  // （旧形式のautoIncrement idレコードが残っていると読み込み時に二重化するため）
  async saveCustomItems() {
    if (!window.recipeDB || !window.recipeDB.db) {
      console.error('データベースが初期化されていません');
      return;
    }

    const transaction = window.recipeDB.db.transaction(['shoppingList'], 'readwrite');
    const store = transaction.objectStore('shoppingList');

    try {
      // 既存のカスタムアイテムレコードをすべて取得して削除
      const existing = await new Promise((resolve, reject) => {
        const request = store.index('type').getAll('customItems');
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new Error('カスタムアイテムの取得に失敗しました'));
      });

      for (const record of existing) {
        await new Promise((resolve, reject) => {
          const request = store.delete(record.id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error('カスタムアイテムの削除に失敗しました'));
        });
      }

      // 正規形で保存
      await new Promise((resolve, reject) => {
        const request = store.add({
          id: 'customItems',
          type: 'customItems',
          items: this.customItems,
          updatedAt: new Date().toISOString()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('カスタムアイテムの保存に失敗しました'));
      });
    } catch (error) {
      console.error('カスタムアイテムの保存中にエラーが発生しました:', error);
      transaction.abort();
    }
  },

  // その他をすべて削除
  clearAllCustomItems() {
    if (this.customItems.length === 0) {
      this.showMessage('削除するアイテムがありません', 'info');
      return;
    }

    if (confirm('登録されているすべてのその他を削除しますか？買い物リスト内のその他も削除されます。この操作は元に戻せません。')) {
      // その他をすべて削除
      this.customItems = [];
      this.saveCustomItems();
      
      // 買い物リストからもその他を削除
      if (this.shoppingList) {
        this.shoppingList.customItems = [];
        this.saveShoppingList();
      }
      
      // 表示を更新（少し遅延させて確実に反映させる）
      setTimeout(() => {
        this.renderCustomItems();
        this.renderShoppingList();
        this.showMessage('すべてのその他を削除しました', 'success');
        
        // 現在のタブを再描画
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
          const activeTabId = activeTab.id;
          this.switchTab(activeTabId);
        }
      }, 50);
    }
  },

  // カスタムアイテムを削除
  async removeCustomItem(id) {
    try {
      // カスタムアイテムから削除
      this.customItems = this.customItems.filter((item) => item.id !== id);
      
      // IndexedDBから削除
      if (window.recipeDB && window.recipeDB.db) {
        // カスタムアイテム一覧を更新
        await this.saveCustomItems();
        
        // 買い物リストからも削除
        if (this.shoppingList && this.shoppingList.customItems) {
          this.shoppingList.customItems = this.shoppingList.customItems.filter(item => item.id !== id);
          await this.saveShoppingList();
        }
      } else {
        // IndexedDBが利用できない場合はメモリ上のみ更新
        if (this.shoppingList && this.shoppingList.customItems) {
          this.shoppingList.customItems = this.shoppingList.customItems.filter(item => item.id !== id);
        }
      }
      
      // 再描画
      this.renderCustomItems();
      this.renderShoppingList();
      
    } catch (error) {
      console.error('カスタムアイテムの削除中にエラーが発生しました:', error);
      this.showMessage('カスタムアイテムの削除中にエラーが発生しました', 'error');
    }
  },

  // カスタムアイテムを追加
  async addCustomItem() {
    const nameInput = document.getElementById('item-name');
    const quantityInput = document.getElementById('item-quantity');

    const name = nameInput.value.trim();
    const quantity = quantityInput.value.trim();

    if (!name) {
      this.showMessage('アイテム名を入力してください', 'error');
      return;
    }

    // 重複チェック（大文字小文字を区別せず、前後の空白を無視）
    const normalizedNewName = name.toLowerCase().trim();
    const isDuplicate = this.customItems.some(item => 
      item.name.toLowerCase().trim() === normalizedNewName
    );

    if (isDuplicate) {
      this.showMessage(`「${name}」はすでに登録されています`, 'error');
      return;
    }

    // 新しいカスタムアイテムを作成
    const newItem = {
      id: 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      name: name,
      quantity: quantity || '',
      isCustom: true,
      completed: false,
      timestamp: Date.now()
    };

    try {
      // カスタムアイテムを追加
      this.customItems.push(newItem);
      
      // データベースに保存
      if (window.recipeDB && window.recipeDB.db) {
        await this.saveCustomItems();
      }
      
      // フォームをリセット
      nameInput.value = '';
      quantityInput.value = '';
      
      // 成功メッセージを表示
      this.showMessage('カスタムアイテムを追加しました', 'success');
      
      // 少し待ってからページをリロード
      setTimeout(() => {
        // リロード前にタブの状態をlocalStorageに保存
        localStorage.setItem('activeTab', 'custom-items');
        location.reload();
      }, 500);
      
    } catch (error) {
      console.error('カスタムアイテムの追加中にエラーが発生しました:', error);
      this.showMessage('カスタムアイテムの追加中にエラーが発生しました', 'error');
      this.customItems = this.customItems.filter(item => item.id !== newItem.id);
    }
  },

  // 選択されたカスタムアイテムを買い物リストに追加
  async addSelectedCustomItemsToShoppingList() {
    const container = document.querySelector('.custom-items-container');
    if (!container) return;

    const checkboxes = container.querySelectorAll('.custom-item .recipe-checkbox:checked');
    if (checkboxes.length === 0) {
      this.showMessage('追加するアイテムを選択してください', 'error');
      return;
    }

    // 選択されたアイテムを取得
    const selectedItems = [];
    const itemIds = [];

    checkboxes.forEach((checkbox) => {
      const itemId = checkbox.value;
      itemIds.push(itemId);
      const item = this.customItems.find((item) => item.id === itemId);
      if (item) {
        selectedItems.push({
          ...item,
          completed: false,
          timestamp: Date.now()
        });
      }
    });

    if (selectedItems.length === 0) {
      this.showMessage('有効なアイテムが見つかりませんでした', 'error');
      return;
    }

    try {
      // 既存の買い物リストcustomItemsを保持しつつ、未登録のものだけ追加
      if (!Array.isArray(this.shoppingList.customItems)) {
        this.shoppingList.customItems = [];
      }
      for (const item of selectedItems) {
        const exists = this.shoppingList.customItems.some(
          existing => existing.id === item.id || existing.name.toLowerCase() === item.name.toLowerCase()
        );
        if (!exists) {
          this.shoppingList.customItems.push(item);
        }
      }
      
      // IndexedDBに保存
      if (window.recipeDB && window.recipeDB.db) {
        await this.saveShoppingList();
      }
      this.showMessage('買い物リストを更新しました', 'success');
      
      // チェックを外す
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
      
      // カスタムアイテム一覧を再描画（チェックボックスを更新）
      this.renderCustomItems();
      
      // 買い物リストを再描画
      this.renderShoppingList();
      
    } catch (error) {
      console.error('買い物リストへの追加中にエラーが発生しました:', error);
      this.showMessage('買い物リストへの追加中にエラーが発生しました', 'error');
    }
  },

  // カスタムアイテムをレンダリングするメソッド
  renderCustomItems() {
    const container = document.getElementById('custom-items-list');
    if (!container) return;
    
    // デバッグ用ログ
    
    if (this.customItems.length === 0) {
      container.innerHTML = '<p class="empty-message">登録されたアイテムがありません</p>';
      return;
    }
    
    container.innerHTML = `
      <div class="custom-items-container">
        ${this.customItems.map(item => `
          <div class="custom-item" data-id="${item.id}">
            <input type="checkbox" class="recipe-checkbox" value="${item.id}" ${item.completed ? 'checked' : ''}>
            <span class="item-name">${this.escapeHtml(item.name)}</span>
            ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
            <button class="btn-remove" onclick="app.removeCustomItem('${item.id}')">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `).join('')}
        <div class="custom-items-actions">
          <button id="add-selected-items" class="btn-primary" style="margin-top: 1em; width: 100%;">
            選択した物を'リスト'に追加
          </button>
        </div>
      </div>`;
      
    // 追加ボタンのイベントリスナーを設定
    const addButton = document.getElementById('add-selected-items');
    if (addButton) {
      addButton.addEventListener('click', () => this.addSelectedCustomItemsToShoppingList());
    }
  },

};
