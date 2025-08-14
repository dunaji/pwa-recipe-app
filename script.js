// レシピ管理アプリ全体を制御するクラス
class RecipeApp {
  // 並び順の状態
  recipeSortMode = "popular"; // デフォルトはよく作る順
  recipeSortOrder = "desc"; // デフォルトは降順
  db = null;
  isInitialized = false;
  editingRecipeId = null; // 編集モード用のID

  // アプリ起動時に一度だけ実行される初期化処理
  constructor() {
    this.initDB().then(() => {
      this.isInitialized = true;

    }).catch(error => {

    });
    
    // 初期値の設定
    this.recipes = [];
    this.shoppingList = { ingredients: [], customItems: [] };
    this.shoppingHistory = [];
    this.customItems = [];
    this.selectedRecipes = new Set();
    this.selectedRecipesInfo = []; // 選択されたレシピの情報を保持する配列
  }

  // IndexedDBの初期化
  async initDB() {
    try {

      
      // データベース接続が確立されるまで待機
      if (!window.recipeDB || !window.recipeDB.db) {
        await new Promise((resolve) => {
          const checkDB = () => {
            if (window.recipeDB && window.recipeDB.db) {

              resolve();
            } else {

              setTimeout(checkDB, 100);
            }
          };
          checkDB();
        });
      }
      
      // 既存のlocalStorageからデータを移行
      await this.migrateFromLocalStorage();
      
      // データベースからデータを読み込む
      await this.loadAllData();
      
      console.log('[DEBUG] データベースの初期化が完了しました');
    } catch (error) {

      throw error;
    }
  }

  // localStorageからIndexedDBへのデータ移行
  async migrateFromLocalStorage() {
    // 移行済みフラグを確認
    const isMigrated = localStorage.getItem('migratedToIndexedDB');
    if (isMigrated) {

      return;
    }


    
    try {
      // レシピの移行
      const recipes = JSON.parse(localStorage.getItem("recipes") || '[]');
      if (recipes.length > 0) {

        for (const recipe of recipes) {
          try {
            await window.recipeDB.add('recipes', recipe);
          } catch (error) {

            throw error;
          }
        }
      }

      // 買い物リストの移行
      let shoppingList = [];
      try {
        const stored = localStorage.getItem("shoppingList");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            shoppingList = parsed;
          } else if (parsed && typeof parsed === 'object') {
            shoppingList = parsed.ingredients || [];
            if (parsed.customItems && Array.isArray(parsed.customItems)) {
              shoppingList = [...shoppingList, ...parsed.customItems];
            }
          }
        }
      } catch (e) {

        throw e;
      }

      if (shoppingList.length > 0) {

        await window.recipeDB.add('shoppingList', { 
          type: 'shoppingList',
          data: shoppingList,
          timestamp: new Date().getTime()
        });
      }

      // 買い物履歴の移行
      const shoppingHistory = JSON.parse(localStorage.getItem("shoppingHistory") || '[]');
      if (shoppingHistory.length > 0) {

        await window.recipeDB.add('shoppingList', {
          type: 'history',
          data: shoppingHistory,
          timestamp: new Date().getTime()
        });
      }

      // カスタムアイテムの移行
      const customItems = JSON.parse(localStorage.getItem("customItems") || '[]');
      if (customItems.length > 0) {

        await window.recipeDB.add('shoppingList', {
          type: 'customItems',
          data: customItems,
          timestamp: new Date().getTime()
        });
      }

      // 移行完了後、localStorageをクリア

      localStorage.removeItem('recipes');
      localStorage.removeItem('shoppingList');
      localStorage.removeItem('shoppingHistory');
      localStorage.removeItem('customItems');
      
      // 移行完了フラグを設定
      localStorage.setItem('migratedToIndexedDB', 'true');

    } catch (error) {

      throw error;
    }
  }

  // データベースから全データを読み込む
  async loadAllData() {

    
    // データベース接続が確立されていることを確認
    if (!window.recipeDB || !window.recipeDB.db) {

      throw new Error('データベース接続が確立されていません');
    }

    // トランザクションを開始する前にストアの存在を確認
    const db = window.recipeDB.db;
    if (!db.objectStoreNames.contains('recipes') || !db.objectStoreNames.contains('shoppingList')) {

      throw new Error('必要なオブジェクトストアが見つかりません');
    }
    
    try {
      // トランザクションを開始して一貫性を確保
      const transaction = db.transaction(['recipes', 'shoppingList'], 'readonly');
      const recipeStore = transaction.objectStore('recipes');
      const shoppingListStore = transaction.objectStore('shoppingList');
      
      // レシピの読み込み
      const recipes = await new Promise((resolve, reject) => {
        const request = recipeStore.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new Error('レシピの読み込みに失敗しました'));
      });
      
      // レシピデータを正規化してcookCountを確実に初期化
      this.recipes = recipes.map(recipe => ({
        ...recipe,
        cookCount: typeof recipe.cookCount === 'number' ? recipe.cookCount : 0
      }));
      

      this.recipes.forEach(recipe => {

      });

      // 買い物リスト関連データの読み込み
      const shoppingLists = await new Promise((resolve, reject) => {
        const request = shoppingListStore.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new Error('買い物リストデータの読み込みに失敗しました'));
      });
      

      
      // データを型に応じて分類
      const shoppingListData = shoppingLists.find(item => item && item.type === 'shoppingList');
      const historyData = shoppingLists.find(item => item && item.type === 'history');
      const customItemsData = shoppingLists.find(item => item && item.type === 'customItems');

      // 買い物リストの初期化
      this.shoppingList = { ingredients: [], customItems: [] };
      
      // 買い物リストデータの正規化とマージ
      if (shoppingListData && shoppingListData.data) {
        try {
          // データの正規化処理
          const normalizeItems = (data) => {
            if (!data) return [];
            
            // 配列の場合はそのまま返す（既にフラット化されている想定）
            if (Array.isArray(data)) {
              return data.filter(item => item && typeof item === 'object');
            }
            
            // オブジェクトの場合は値を抽出
            if (typeof data === 'object') {
              return Object.values(data)
                .flat()
                .filter(item => item && typeof item === 'object');
            }
            
            return [];
          };

          // データを正規化して有効なアイテムのみを抽出
          const normalizedItems = normalizeItems(shoppingListData.data);

          
          // 材料とカスタムアイテムを分類
          this.shoppingList.ingredients = normalizedItems.filter(item => !item.isCustom);
          this.shoppingList.customItems = normalizedItems.filter(item => item.isCustom);
          

          
        } catch (error) {

          // エラーが発生した場合は空のリストを設定
          this.shoppingList = { ingredients: [], customItems: [] };
        }
      }

      // カスタムアイテムの処理
      if (customItemsData) {
        try {
          // 新しい形式（items プロパティに配列として格納）に対応
          const customItems = Array.isArray(customItemsData.items) 
            ? customItemsData.items 
            : [];
          
          // 古い形式（data プロパティ）の互換性維持
          const legacyCustomItems = (customItemsData.data && Array.isArray(customItemsData.data))
            ? customItemsData.data
            : [];
          
          // 重複を避けてマージ（新しい形式を優先）
          const allItems = [...customItems];
          const existingIds = new Set(allItems.map(item => item.id));
          
          for (const item of legacyCustomItems) {
            if (item && item.id && !existingIds.has(item.id)) {
              allItems.push(item);
              existingIds.add(item.id);
            }
          }
          
          // カスタムアイテムを設定
          this.customItems = allItems;
          

          
          // 買い物リスト内のカスタムアイテムは別々に管理するため、ここでは更新しない
          // 買い物リストに追加するには明示的な操作が必要
          
        } catch (error) {

          this.customItems = [];
          this.shoppingList.customItems = [];
        }
      } else {
        this.customItems = [];
        this.shoppingList.customItems = [];
      }

      // 買い物履歴の設定
      this.shoppingHistory = (historyData && historyData.data) || [];



      return {
        recipes: this.recipes.length,
        ingredients: this.shoppingList.ingredients.length,
        customItems: this.customItems.length,
        history: this.shoppingHistory.length
      };
    } catch (error) {

      throw error;
    }
  }

  // レシピを保存
  async saveRecipe(recipe) {
    try {
      if (recipe.id) {
        // 既存のレシピを更新
        await window.recipeDB.update('recipes', recipe);
        const index = this.recipes.findIndex(r => r.id === recipe.id);
        if (index !== -1) {
          this.recipes[index] = recipe;
        } else {
          this.recipes.push(recipe);
        }
      } else {
        // 新しいレシピを追加
        const newId = await window.recipeDB.add('recipes', recipe);
        recipe.id = newId;
        this.recipes.push(recipe);
      }
      this.renderRecipes();
      return recipe;
    } catch (error) {
      console.error('レシピの保存中にエラーが発生しました:', error);
      throw error;
    }
  }

  // レシピを削除（同期版）
  deleteRecipe(id) {
    if (confirm("このレシピを削除しますか？")) {
      // 非同期で削除を実行
      this._deleteRecipeAsync(id).then(() => {
        this.recipes = this.recipes.filter((recipe) => recipe.id !== id);
        this.selectedRecipes.delete(id);
        this.saveRecipes();
        this.renderRecipes();
        this.updateShoppingButton();
        this.showMessage("レシピを削除しました");
      }).catch(error => {
        console.error('レシピの削除中にエラーが発生しました:', error);
        this.showMessage("レシピの削除中にエラーが発生しました", "error");
      });
    }
  }

  // レシピを削除（非同期処理のみを行うプライベートメソッド）
  async _deleteRecipeAsync(recipeId) {
    await window.recipeDB.delete('recipes', recipeId);
  }

  // すべてのレシピを削除
  async deleteAllRecipes() {
    if (!confirm('すべてのレシピを削除してもよろしいですか？\nこの操作は元に戻せません。')) {
      return;
    }

    try {
      // データベースからすべてのレシピを削除
      const transaction = window.recipeDB.db.transaction(['recipes'], 'readwrite');
      const store = transaction.objectStore('recipes');
      const clearRequest = store.clear();

      await new Promise((resolve, reject) => {
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = (event) => reject(event.target.error);
      });

      // メモリ上のレシピをクリア
      this.recipes = [];
      this.selectedRecipes.clear();
      
      // UIを更新
      this.renderRecipes();
      this.updateShoppingButton();
      this.showMessage('すべてのレシピを削除しました');
    } catch (error) {
      console.error('レシピの一括削除中にエラーが発生しました:', error);
      this.showMessage('レシピの削除中にエラーが発生しました', 'error');
    }
  }

  // 買い物リストを保存
  async saveShoppingList() {

    
    // トランザクションを開始
    const transaction = window.recipeDB.db.transaction(['shoppingList'], 'readwrite');
    const store = transaction.objectStore('shoppingList');
    
    try {
      // 既存の買い物リストを取得
      const request = store.index('type').get('shoppingList');
      
      const existingData = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('買い物リストの取得に失敗しました'));
      });
      
      // 保存するデータを準備
      const dataToSave = {
        type: 'shoppingList',
        data: {
          // 配列をフラット化して重複を削除
          ingredients: [...new Set(
            (Array.isArray(this.shoppingList.ingredients) 
              ? this.shoppingList.ingredients.flat() 
              : []
            ).map(item => JSON.stringify(item)) // オブジェクトを文字列化して重複を検出
          )].map(str => JSON.parse(str)), // 元のオブジェクトに戻す
          
          // カスタムアイテムも同様に処理
          customItems: [...new Set(
            (this.shoppingList.customItems || []).map(item => JSON.stringify(item))
          )].map(str => JSON.parse(str))
        },
        timestamp: new Date().getTime()
      };
      
      // 既存のIDがあれば引き継ぐ
      if (existingData) {
        dataToSave.id = existingData.id;
      }
      
      // 保存処理
      const saveRequest = existingData 
        ? store.put(dataToSave)
        : store.add(dataToSave);
      
      await new Promise((resolve, reject) => {
        saveRequest.onsuccess = () => {

          resolve();
        };
        saveRequest.onerror = (event) => {

          reject(new Error('買い物リストの保存に失敗しました'));
        };
      });
      

      return true;
      
    } catch (error) {

      // トランザクションを中止
      transaction.abort();
      throw error; // エラーを再スローして呼び出し元で処理できるようにする
    }
  }

  // 買い物履歴を保存
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
  }

  // カスタムアイテムを保存
  async saveCustomItems() {
    try {
      // 既存のカスタムアイテムを取得
      const shoppingLists = await window.recipeDB.getAll('shoppingList');
      const existingCustomItems = shoppingLists.find(item => item.type === 'customItems');
      
      // 保存するデータ
      const itemsToSave = {
        type: 'customItems',
        data: this.customItems,
        timestamp: new Date().getTime()
      };

      if (existingCustomItems) {
        // 既存のカスタムアイテムを更新
        itemsToSave.id = existingCustomItems.id;
        await window.recipeDB.update('shoppingList', itemsToSave);
      } else {
        // 新しいカスタムアイテムを追加
        await window.recipeDB.add('shoppingList', itemsToSave);
      }
    } catch (error) {
      console.error('カスタムアイテムの保存中にエラーが発生しました:', error);
      throw error;
    }
  }

  // ストレージ使用量を計算して表示する関数
  async updateStorageUsage() {
    try {
      const usage = await window.recipeDB.getStorageUsage();
      
      // ストレージの合計容量（IndexedDBはブラウザによって異なるが、一般的に50MB以上）
      const totalStorage = 50 * 1024 * 1024; // 50MB in bytes
      
      // 使用率を計算
      const usagePercent = (usage / totalStorage * 100).toFixed(1);
      
      // 使用量を適切な単位で表示
      let displaySize;
      if (usage < 1024) {
        displaySize = `${usage} B`;
      } else if (usage < 1024 * 1024) {
        displaySize = `${(usage / 1024).toFixed(1)} KB`;
      } else {
        displaySize = `${(usage / (1024 * 1024)).toFixed(2)} MB`;
      }
      
      // 表示を更新
      const usageElement = document.getElementById('storage-usage');
      if (usageElement) {
        usageElement.textContent = `${displaySize} (${usagePercent}%)`;
        
        // 使用率に応じて色を変更
        if (parseFloat(usagePercent) > 80) {
          usageElement.style.color = '#e53935'; // 赤: 80%超
        } else if (parseFloat(usagePercent) > 50) {
          usageElement.style.color = '#ff9800'; // オレンジ: 50%超
        } else {
          usageElement.style.color = '#43a047'; // 緑: 50%以下
        }
      }
      
      return { usage, totalStorage };
    } catch (error) {

      throw error;
    }
    try {
      // localStorageの全データを取得してサイズを計算
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        // キーと値の長さをバイト数として加算
        totalSize += key.length + (value ? value.length * 2 : 0);
      }
      
      // ストレージの合計容量（5MBが一般的）
      const totalStorage = 5 * 1024 * 1024; // 5MB in bytes
      
      // 使用率を計算
      const usagePercent = (totalSize / totalStorage * 100).toFixed(1);
      
      // 使用量を適切な単位で表示
      let displaySize;
      if (totalSize < 1024) {
        displaySize = `${totalSize} B`;
      } else if (totalSize < 1024 * 1024) {
        displaySize = `${(totalSize / 1024).toFixed(1)} KB`;
      } else {
        displaySize = `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      }
      
      // 表示を更新
      const usageElement = document.getElementById('storage-usage');
      if (usageElement) {
        usageElement.textContent = `${displaySize} (${usagePercent}%)`;
        
        // 使用率に応じて色を変更
        if (parseFloat(usagePercent) > 80) {
          usageElement.style.color = '#e53935'; // 赤: 80%超
        } else if (parseFloat(usagePercent) > 50) {
          usageElement.style.color = '#ff9800'; // オレンジ: 50%超
        } else {
          usageElement.style.color = '#43a047'; // 緑: 50%以下
        }
      }
    } catch (error) {

    }
  }



  // アプリの初期表示やイベント登録などをまとめて実行
  init() {
    this.setupEventListeners();
    
    // カスタムアイテムをcustomItemsに追加（初期化時のみ）
    // 買い物リストへの追加は行わない（明示的な操作が必要）
    this.saveCustomItems();
    
    this.renderRecipes();
    this.renderShoppingList();
    this.renderShoppingHistory();
    this.setupCustomItems();
    this.setupClearButton(); 
    this.updateShoppingButton();
    this.updateCompleteShoppingButton();
    this.renderCustomItems();
    
    // 初期タブをアクティブに
    this.switchTab('register');
  }

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
  }

  // すべてのカスタムアイテムを削除
  async clearAllCustomItems() {
    if (this.customItems.length === 0) {
      this.showMessage('削除するアイテムがありません', 'info');
      return;
    }

    if (!confirm('登録されているすべてのカスタムアイテムを削除しますか？この操作は元に戻せません。')) {
      return;
    }

    try {
      // IndexedDBからカスタムアイテムを削除
      if (window.recipeDB && window.recipeDB.db) {
        const transaction = window.recipeDB.db.transaction(['shoppingList'], 'readwrite');
        const store = transaction.objectStore('shoppingList');
        
        // カスタムアイテムの削除
        const deleteRequest = store.delete('customItems');
        
        await new Promise((resolve, reject) => {
          deleteRequest.onsuccess = resolve;
          deleteRequest.onerror = () => reject(new Error('カスタムアイテムの削除に失敗しました'));
        });
      }
      
      // メモリ上のカスタムアイテムをすべて削除
      this.customItems = [];
      
      // 買い物リストからもカスタムアイテムを削除
      if (this.shoppingList && this.shoppingList.customItems) {
        this.shoppingList.customItems = [];
        await this.saveShoppingList();
      }
      
      // 表示を更新
      this.renderCustomItems();
      if (this.renderShoppingList) {
        this.renderShoppingList();
      }
      
      this.showMessage('すべてのカスタムアイテムを削除しました', 'success');
      
    } catch (error) {
      console.error('カスタムアイテムの削除中にエラーが発生しました:', error);
      this.showMessage('カスタムアイテムの削除中にエラーが発生しました', 'error');
    }
  }

  // カスタムアイテムを保存
  async saveCustomItems() {
    if (!window.recipeDB || !window.recipeDB.db) {
      console.error('データベースが初期化されていません');
      return;
    }

    try {
      // IndexedDBに保存
      const transaction = window.recipeDB.db.transaction(['shoppingList'], 'readwrite');
      const store = transaction.objectStore('shoppingList');
      
      // 既存のカスタムアイテムを削除
      const clearRequest = store.delete('customItems');
      
      clearRequest.onsuccess = () => {
        // 新しいカスタムアイテムを追加
        const addRequest = store.add({
          id: 'customItems',
          type: 'customItems',
          items: this.customItems,
          updatedAt: new Date().toISOString()
        });
        
        addRequest.onsuccess = () => {

        };
        
        addRequest.onerror = (event) => {

        };
      };
      
      clearRequest.onerror = (event) => {

      };
    } catch (error) {
      console.error('カスタムアイテムの保存中にエラーが発生しました:', error);
    }
  }

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
        this.shoppingList = this.shoppingList.filter(item => !item.isCustom);
        this.saveShoppingList();
      }
      
      // 表示を更新
      this.renderCustomItems();
      this.renderShoppingList();
      
      this.showMessage('すべてのその他を削除しました', 'success');
    }
  }

  // タブ切り替え処理
  switchTab(tabName) {


    
    try {
      // すべてのタブコンテンツを非表示
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      // すべてのタブボタンからactiveクラスを削除
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      
      // 選択されたタブをアクティブに
      const selectedTabContent = document.getElementById(tabName);
      const selectedTabButton = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
      
      if (selectedTabContent) selectedTabContent.classList.add('active');
      if (selectedTabButton) selectedTabButton.classList.add('active');
      
      // タブ固有の処理
      if (tabName === 'custom-items') {
        this.renderCustomItems();
      } else if (tabName === 'shopping') {
        this.renderShoppingList();
      } else if (tabName === 'recipes') {
        this.renderRecipes();
      }
    } catch (error) {

    }
  }

  // イベントリスナーを設定する前に要素の存在を確認するヘルパー関数
  addEventIfExists(elementId, eventType, callback) {
    if (typeof callback !== 'function') {

      return false;
    }
    
    const element = document.getElementById(elementId);
    if (element) {
      element.addEventListener(eventType, callback.bind(this));
      return true;
    }
    return false;
  }

  // 画面上の各種ボタンやフォームにイベント（クリックや入力）を登録
  setupEventListeners() {
    // タブ切り替え（イベントデリゲーションを使用）
    document.addEventListener('click', (e) => {
      const tabButton = e.target.closest('.tab-btn');
      if (tabButton && tabButton.dataset.tab) {
        e.preventDefault();
        this.switchTab(tabButton.dataset.tab);
      }
      
      // カスタムアイテムの削除ボタン（イベントデリゲーション）
      const removeButton = e.target.closest('.btn-remove');
      if (removeButton) {
        const itemId = removeButton.closest('.custom-item')?.dataset?.id;
        if (itemId) {
          this.removeCustomItem(itemId);
        }
      }
      
      // カスタムアイテムのチェックボックス（イベントデリゲーション）
      const customCheckbox = e.target.closest('.custom-item .recipe-checkbox');
      if (customCheckbox) {
        const itemId = customCheckbox.value;
        const item = this.customItems.find(item => item.id === itemId);
        if (item) {
          item.completed = customCheckbox.checked;
          this.saveCustomItems();
        }
      }
    });

    // メモ用写真アップロードのイベントリスナー
    const notePhotoUpload = document.getElementById('note-photo-upload');
    const notePhotoInput = document.getElementById('note-photo-input');
    const removeNotePhotoBtn = document.getElementById('remove-note-photo');
    
    // 既存のイベントリスナーを削除してから追加
    if (notePhotoUpload) {
      notePhotoUpload.removeEventListener('click', this.handleNotePhotoUploadClick);
      this.handleNotePhotoUploadClick = () => {
        if (notePhotoInput) notePhotoInput.click();
      };
      notePhotoUpload.addEventListener('click', this.handleNotePhotoUploadClick);
    }

    if (notePhotoInput) {
      notePhotoInput.removeEventListener('change', this.handleNotePhotoUpload);
      notePhotoInput.addEventListener('change', (e) => this.handleNotePhotoUpload(e));
    }

    if (removeNotePhotoBtn) {
      removeNotePhotoBtn.removeEventListener('click', this.removeNotePhoto);
      removeNotePhotoBtn.addEventListener('click', () => this.removeNotePhoto());
    }

    // 並び替えセレクトボックス
    this.addEventIfExists('recipe-sort-select', 'change', (e) => {
      this.recipeSortMode = e.target.value;
      this.renderRecipes();
    });

    // 昇順降順セレクトボックス
    this.addEventIfExists('recipe-sort-order', 'change', (e) => {
      this.recipeSortOrder = e.target.value;
      this.renderRecipes();
    });

    // レシピフォーム
    this.addEventIfExists('recipe-form', 'submit', (e) => {
      e.preventDefault();
      if (this.editingRecipeId) {
        this.saveEditedRecipe();
      } else {
        this.addRecipe()
      }
    })

    // 材料追加
    this.addEventIfExists('add-ingredient', 'click', (e) => this.addIngredientRow(e));

    // 調味料追加
    this.addEventIfExists('add-seasoning', 'click', (e) => this.addSeasoningRow(e));

    // 写真アップロード
    const photoUpload = document.getElementById('photo-upload');
    const photoInput = document.getElementById('photo-input');
    const removePhotoBtn = document.getElementById('remove-photo');
    
    // 既存のイベントリスナーを削除してから追加
    if (photoUpload) {
      photoUpload.removeEventListener('click', this.handlePhotoUploadClick);
      this.handlePhotoUploadClick = () => {
        if (photoInput) photoInput.click();
      };
      photoUpload.addEventListener('click', this.handlePhotoUploadClick);
    }

    if (photoInput) {
      photoInput.removeEventListener('change', this.handlePhotoUpload);
      photoInput.addEventListener('change', (e) => this.handlePhotoUpload(e));
    }

    if (removePhotoBtn) {
      removePhotoBtn.removeEventListener('click', this.removePhoto);
      removePhotoBtn.addEventListener('click', () => this.removePhoto());
    }

    // 買い物リストに追加
    this.addEventIfExists('add-to-shopping', 'click', () => this.addSelectedToShopping());

    // 買い物リスト初期化ボタン
    this.addEventIfExists('clear-shopping', 'click', () => this.clearShoppingList());

    // 買い物完了ボタン
    const completeButton = document.getElementById('complete-shopping');
    if (completeButton) {
      completeButton.removeEventListener('click', this.completeShopping);
      completeButton.addEventListener('click', () => {

        this.completeShopping();
      });
    }

    // 買い物履歴ボタン
    this.addEventIfExists('show-all-history', 'click', () => this.showHistoryModal());

    // 履歴モーダルを閉じる
    this.addEventIfExists('close-history-modal', 'click', () => this.hideHistoryModal());

    // すべての履歴を削除
    this.addEventIfExists('clear-all-history', 'click', () => this.clearAllHistory());
    
    // ストレージ使用量表示のトグルはinitializeAppで設定済み
  }

  // 材料と調味料の削除ボタンの表示/非表示を更新する関数
  updateRemoveButtons() {
    // 材料の削除ボタンを更新
    const ingredientRows = document.querySelectorAll('#ingredients-container .ingredient-row');
    ingredientRows.forEach((row, index) => {
      const removeBtn = row.querySelector('.btn-remove-ingredient');
      if (removeBtn) {
        removeBtn.style.display = ingredientRows.length > 1 ? 'flex' : 'none';
      }
    });

    // 調味料の削除ボタンを更新
    const seasoningRows = document.querySelectorAll('#seasonings-container .ingredient-row');
    seasoningRows.forEach((row, index) => {
      const removeBtn = row.querySelector('.btn-remove-ingredient');
      if (removeBtn) {
        removeBtn.style.display = seasoningRows.length > 1 ? 'flex' : 'none';
      }
    });
  }

  // 材料の入力行を新しく追加する関数
  addIngredientRow() {
    const container = document.getElementById("ingredients-container")
    const row = document.createElement("div")
    row.className = "ingredient-row"

    row.innerHTML = `
            <input type="text" placeholder="材料名" class="ingredient-name" required>
            <input type="text" placeholder="数量" class="ingredient-quantity">
            <button type="button" class="btn-remove-ingredient">
                <i class="fas fa-times"></i>
            </button>
        `

    // 削除ボタンのイベントリスナー
    row.querySelector(".btn-remove-ingredient").addEventListener("click", () => {
      row.remove()
      this.updateRemoveButtons()
    })

    container.appendChild(row)
    this.updateRemoveButtons()
    
    // 追加した行の入力フィールドにフォーカス
    const newInput = row.querySelector(".ingredient-name")
    if (newInput) {
      newInput.focus()
    }
  }

  // 調味料の入力行を新しく追加する関数
  addSeasoningRow() {
    const container = document.getElementById("seasonings-container");
    const row = document.createElement("div");
    row.className = "ingredient-row";

    // 調味料用の行を生成（削除ボタン付き）
    row.innerHTML = `
      <input type="text" placeholder="調味料名" class="ingredient-name">
      <input type="text" placeholder="数量" class="ingredient-quantity">
      <button type="button" class="btn-remove-ingredient">
        <i class="fas fa-times"></i>
      </button>
    `;

    // 削除ボタンのイベントリスナー
    const removeBtn = row.querySelector(".btn-remove-ingredient");
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        row.remove();
        this.updateRemoveButtons();
      });
    }

    container.appendChild(row);
    this.updateRemoveButtons();
    
    // 追加した行の入力フィールドにフォーカス
    const newInput = row.querySelector(".ingredient-name");
    if (newInput) {
      newInput.focus();
    }
  }

  // 材料行の削除ボタンの表示・非表示を切り替える関数
  updateRemoveButtons() {
    // 材料の削除ボタン
    const ingredientRows = document.querySelectorAll("#ingredients-container .ingredient-row")
    ingredientRows.forEach((row, index) => {
      const removeBtn = row.querySelector(".btn-remove-ingredient")
      if (removeBtn) {  
        if (ingredientRows.length > 1) {
          removeBtn.style.display = "flex"
        } else {
          removeBtn.style.display = "none"
        }
      }
    })

    // 調味料の削除ボタン
    const seasoningRows = document.querySelectorAll("#seasonings-container .ingredient-row")
    seasoningRows.forEach((row, index) => {
      const removeBtn = row.querySelector(".btn-remove-ingredient")
      if (removeBtn) {  
        if (seasoningRows.length > 1) {
          removeBtn.style.display = "flex"
        } else {
          removeBtn.style.display = "none"
        }
      }
    })
  }

  // 写真ファイルが選択されたときの処理（リサイズや圧縮もここで実施）
  async handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) {
      // ファイルが選択されなかった場合は何もしない
      e.target.value = '';  // 入力をリセット
      return;
    }

    const TARGET_SIZE = 100 * 1024; // 100KB
    const MAX_WIDTH = 600; // 幅を小さくしてファイルサイズ削減
    const INITIAL_QUALITY = 0.6; // 初期品質を下げる

    const compressImage = (img, width, height, quality) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', quality);
    };

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const img = new Image();
      img.src = ev.target.result;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // 初期サイズが100KB以下の場合はそのまま表示
      if (file.size <= TARGET_SIZE) {
        document.getElementById("preview-image").src = ev.target.result;
        document.getElementById("photo-upload").style.display = "none";
        document.getElementById("photo-preview").style.display = "block";
        return;
      }

      // リサイズ
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round(height * (MAX_WIDTH / width));
        width = MAX_WIDTH;
      }

      // 段階的に品質を下げて圧縮
      let quality = INITIAL_QUALITY;
      let result = '';
      let compressedSize = 0;
      
      // 100KB以下になるまで圧縮を試みる
      do {
        result = compressImage(img, width, height, quality);
        compressedSize = Math.round((result.length * 3) / 4); // Base64サイズからバイト数を計算
        
        if (compressedSize <= TARGET_SIZE) break;
        
        // 品質を下げる（最低0.2まで）
        quality = Math.max(0.2, quality - 0.1);
        
        // それでも大きい場合はさらに幅を小さくする
        if (quality <= 0.2 && compressedSize > TARGET_SIZE) {
          width = Math.round(width * 0.9);
          height = Math.round(height * 0.9);
          quality = 0.5; // 幅を小さくしたら品質を少し戻す
        }
      } while (compressedSize > TARGET_SIZE && width > 200); // 最小幅200pxまで

      // 結果を表示
      const previewImage = document.getElementById("preview-image");
      const photoUpload = document.getElementById("photo-upload");
      const photoPreview = document.getElementById("photo-preview");
      
      // 画像が読み込まれるのを待ってから表示を切り替える
      const newImg = new Image();
      newImg.onload = () => {
        previewImage.src = result;
        photoUpload.style.display = "none";
        photoPreview.style.display = "block";
        previewImage.style.display = "block";
      };
      newImg.onerror = () => {
        console.error("画像の読み込みに失敗しました");
        // エラー時はアップロードエリアを表示したままにする
        photoUpload.style.display = "flex";
        photoPreview.style.display = "none";
        this.showMessage("画像の読み込みに失敗しました", "error");
      };
      newImg.src = result;
    };
    reader.readAsDataURL(file);
  }

  // メモ用写真のアップロード処理
  async handleNotePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) {
      // ファイルが選択されなかった場合は何もしない
      e.target.value = '';  // 入力をリセット
      return;
    }

    // 画像ファイルかどうかチェック
    if (!file.type.match('image.*')) {
      this.showMessage('画像ファイルを選択してください', 'error');
      e.target.value = '';  // 入力をリセット
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 画像をリサイズしてBase64に変換
        const canvas = document.createElement('canvas');
        const maxWidth = 800;
        const maxHeight = 800;
        let width = img.width;
        let height = img.height;

        // リサイズ計算
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 画像を表示
        const preview = document.getElementById('note-preview-image');
        const notePhotoPreview = document.getElementById('note-photo-preview');
        const notePhotoUpload = document.getElementById('note-photo-upload');
        
        if (preview && notePhotoPreview && notePhotoUpload) {
          // 画像が読み込まれるのを待ってから表示を切り替える
          const noteImg = new Image();
          noteImg.onload = () => {
            preview.src = canvas.toDataURL('image/jpeg', 0.8);
            notePhotoPreview.style.display = 'block';
            notePhotoUpload.style.display = 'none';
            preview.style.display = 'block';
          };
          noteImg.onerror = () => {
            console.error("メモ用画像の読み込みに失敗しました");
            // エラー時はアップロードエリアを表示したままにする
            notePhotoUpload.style.display = 'flex';
            notePhotoPreview.style.display = 'none';
            this.showMessage("メモ用画像の読み込みに失敗しました", "error");
          };
          noteImg.src = canvas.toDataURL('image/jpeg', 0.8);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 写真プレビューとファイル選択をリセットする処理
  removePhoto() {
    const photoInput = document.getElementById("photo-input");
    if (photoInput) {
      // 既存のイベントリスナーを削除
      const newInput = photoInput.cloneNode(true);
      photoInput.parentNode.replaceChild(newInput, photoInput);
      // 新しいイベントリスナーを追加
      newInput.addEventListener('change', (e) => this.handlePhotoUpload(e));
      
      // 入力をリセット
      newInput.value = "";
      
      // プレビューをリセット
      const previewImage = document.getElementById("preview-image");
      if (previewImage) {
        previewImage.src = "";
      }
    }
    
    // UIの表示を更新
    const photoUpload = document.getElementById("photo-upload");
    const photoPreview = document.getElementById("photo-preview");
    
    if (photoUpload) photoUpload.style.display = "flex";
    if (photoPreview) photoPreview.style.display = "none";
  }

  // メモ用写真を削除
  removeNotePhoto() {
    const notePhotoInput = document.getElementById('note-photo-input');
    if (notePhotoInput) {
      // 入力をリセット
      notePhotoInput.value = '';
      
      // プレビューをリセット
      const notePreviewImage = document.getElementById('note-preview-image');
      if (notePreviewImage) {
        notePreviewImage.src = '';
      }
    }
    
    // UIの表示を更新
    const notePhotoPreview = document.getElementById('note-photo-preview');
    const notePhotoUpload = document.getElementById('note-photo-upload');
    
    if (notePhotoUpload) notePhotoUpload.style.display = 'flex';
    if (notePhotoPreview) notePhotoPreview.style.display = 'none';
  }

  // レシピを新規登録する処理
  addRecipe() {
    const name = document.getElementById("recipe-name").value.trim();
    const notes = document.getElementById("recipe-notes").value.trim();
    
    // 材料を取得
    const ingredientRows = document.querySelectorAll("#ingredients-container .ingredient-row");
    const ingredients = [];
    
    ingredientRows.forEach((row) => {
      const ingredientName = row.querySelector(".ingredient-name").value.trim();
      const quantity = row.querySelector(".ingredient-quantity").value.trim();
      
      if (ingredientName) {
        ingredients.push({ 
          name: ingredientName, 
          quantity: quantity || "",
          type: 'ingredient' // 材料であることを示す
        });
      }
    });
    
    // 調味料を取得
    const seasoningRows = document.querySelectorAll("#seasonings-container .ingredient-row");
    const seasonings = [];
    
    seasoningRows.forEach((row) => {
      const nameInput = row.querySelector(".ingredient-name");
      const qtyInput = row.querySelector(".ingredient-quantity");
      
      if (nameInput) {
        const seasoningName = nameInput.value.trim();
        const quantity = qtyInput ? qtyInput.value.trim() : "";
        
        if (seasoningName) {
          seasonings.push({
            name: seasoningName,
            quantity: quantity,
            type: 'seasoning' // 調味料であることを示す
          });
        }
      }
    });
    
    // バリデーション
    if (!name || (ingredients.length === 0 && seasonings.length === 0)) {
      this.showMessage("料理名と材料または調味料のいずれかは必須です。", "error");
      return;
    }
    
    // メイン画像の処理
    let imgSrc = "";
    const previewImage = document.getElementById("preview-image");
    if (previewImage && previewImage.src && previewImage.style.display !== "none") {
      imgSrc = previewImage.src;
    }

    // メモ用画像の処理
    let noteImgSrc = "";
    const notePreviewImage = document.getElementById("note-preview-image");
    if (notePreviewImage && notePreviewImage.src && notePreviewImage.style.display !== "none") {
      noteImgSrc = notePreviewImage.src;
    }

    // 新しいレシピオブジェクトを作成
    const newRecipe = {
      id: Date.now().toString(),
      name: name,
      ingredients: [...ingredients, ...seasonings], // 材料と調味料を結合
      notes: notes,
      image: imgSrc,
      noteImage: noteImgSrc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cookedCount: 0,
      favorite: false
    };

    // お気に入りプロパティの初期化
    this.recipes.forEach(r => {
      if (typeof r.favorite === 'undefined') r.favorite = false;
    });

    // レシピを追加
    this.recipes.push(newRecipe);
    this.saveRecipes();
    this.renderRecipes();
    this.resetForm();

    // 成功メッセージ
    this.showMessage("レシピが登録されました！", "success");
  }

  // レシピ登録フォームを初期状態に戻す処理
  resetForm() {
    this.editingRecipeId = null; // 編集モードをリセット
    
    // フォームをリセット
    const form = document.getElementById("recipe-form");
    if (form) {
      form.reset();
    }
    
    // 材料入力欄をリセット（1行だけ残す）
    const ingredientsContainer = document.getElementById("ingredients-container");
    if (ingredientsContainer) {
      ingredientsContainer.innerHTML = `
        <div class="ingredient-row">
          <input type="text" placeholder="材料名" class="ingredient-name" required>
          <input type="text" placeholder="数量" class="ingredient-quantity">
          <button type="button" class="add-ingredient btn-icon">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      `;
      
      // 材料追加ボタンにイベントリスナーを設定
      const addIngredientBtn = ingredientsContainer.querySelector('.add-ingredient');
      if (addIngredientBtn) {
        addIngredientBtn.addEventListener('click', () => this.addIngredientRow());
      }
    }

    // 調味料入力欄をリセット（1行だけ残す）
    const seasoningsContainer = document.getElementById("seasonings-container");
    if (seasoningsContainer) {
      seasoningsContainer.innerHTML = `
        <div class="ingredient-row">
          <input type="text" placeholder="調味料名" class="ingredient-name">
          <input type="text" placeholder="数量" class="ingredient-quantity">
          <button type="button" class="add-seasoning btn-icon">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      `;
      
      // 調味料追加ボタンにイベントリスナーを設定
      const addSeasoningBtn = seasoningsContainer.querySelector('.add-seasoning');
      if (addSeasoningBtn) {
        addSeasoningBtn.addEventListener('click', () => this.addSeasoningRow());
      }
    }
    
    // メイン画像のリセット
    const photoInput = document.getElementById("photo-input");
    const photoUpload = document.getElementById("photo-upload");
    const photoPreview = document.getElementById("photo-preview");
    const previewImage = document.getElementById("preview-image");
    
    // 画像プレビューを完全にリセット
    if (previewImage) {
      previewImage.src = "";
      previewImage.style.display = "none";
    }
    
    // ファイル入力をリセット（クローンを作成して置き換え）
    if (photoInput) {
      const newInput = photoInput.cloneNode(true);
      photoInput.parentNode.replaceChild(newInput, photoInput);
      newInput.value = "";
      newInput.addEventListener('change', (e) => this.handlePhotoUpload(e));
    }
    
    // アップロードエリアとプレビューエリアの表示をリセット
    if (photoUpload) {
      photoUpload.style.display = "flex";
    }
    if (photoPreview) {
      photoPreview.style.display = "none";
    }
  
    // メモ用画像を完全にリセット
    const notePhotoInput = document.getElementById('note-photo-input');
    const notePhotoUpload = document.getElementById('note-photo-upload');
    const notePhotoPreview = document.getElementById('note-photo-preview');
    const notePreviewImage = document.getElementById('note-preview-image');
    
    // 画像プレビューをリセット
    if (notePreviewImage) {
      notePreviewImage.src = '';
      notePreviewImage.style.display = 'none';
    }
    
    // ファイル入力をリセット
    if (notePhotoInput) {
      const newInput = notePhotoInput.cloneNode(true);
      notePhotoInput.parentNode.replaceChild(newInput, notePhotoInput);
      newInput.value = '';
      newInput.addEventListener('change', (e) => this.handleNotePhotoUpload(e));
    }
    
    // アップロードエリアとプレビューエリアの表示をリセット
    if (notePhotoUpload) {
      notePhotoUpload.style.display = 'flex';
    }
    if (notePhotoPreview) {
      notePhotoPreview.style.display = 'none';
    }
    
    // 送信ボタンのリセット
    const submitButton = document.querySelector(".btn-primary");
    if (submitButton) {
      submitButton.textContent = "レシピを登録";
      // 既存のイベントリスナーを削除して新しいものを追加
      const newButton = submitButton.cloneNode(true);
      submitButton.parentNode.replaceChild(newButton, submitButton);
      newButton.addEventListener("click", (e) => {
        e.preventDefault();
        this.addRecipe();
      });
    }
    
    // キャンセルボタンを非表示
    const cancelButton = document.getElementById("cancel-edit");
    if (cancelButton) {
      cancelButton.style.display = "none";
    }
    
    // フォームタイトルをリセット
    const formTitle = document.getElementById("register-title");
    if (formTitle) {
      formTitle.innerHTML = '<i class="fas fa-pen-to-square"></i> レシピ登録';
    }
    
    // 削除ボタンの表示/非表示を更新
    this.updateRemoveButtons();
    
    // イベントリスナーを再設定
    this.setupEventListeners();
    
    // スクロールをトップに移動
    window.scrollTo(0, 0);
    
    // グローバル変数をリセット（もしあれば）
    if (window.noteImgSrc) {
      window.noteImgSrc = null;
    }
  }

  // 編集をキャンセルする処理
  cancelEdit() {
    if (confirm("編集をキャンセルしますか？入力中の内容は破棄されます。")) {
      this.resetForm();
      // レシピ一覧タブに切り替え
      this.switchTab("recipes");
    }
  }

  // レシピ一覧を画面に表示する処理
  renderRecipes() {

    let container = document.getElementById("recipes-container")

    if (this.recipes.length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <p>まだレシピが登録されていません</p>
                </div>
            `;
      return;
    }

    // 並び替え用配列
    let sortedRecipes = [...this.recipes];
    
    // 並び替え
    // 降順: 数値が大きい順（上から下へ大きい順）、昇順: 数値が小さい順（上から下へ小さい順）
    const sortOrder = this.recipeSortOrder === 'desc' ? 1 : -1;
    
    if (this.recipeSortMode === "popular") {
      sortedRecipes.sort((a, b) => {
        const countA = a.cookCount || 0;
        const countB = b.cookCount || 0;
        
        if (countA !== countB) {
          return (countB - countA) * sortOrder;
        }
        
        // 調理回数が同じ場合は作成日が新しい順（降順）
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    } else if (this.recipeSortMode === "createdAt") {
      sortedRecipes.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        // 降順（新しい順）がデフォルト
        return (dateB - dateA) * sortOrder;
      });
    } else if (this.recipeSortMode === "name") {
      sortedRecipes.sort((a, b) => {
        const nameA = a.name || "";
        const nameB = b.name || "";
        return nameA.localeCompare(nameB, "ja") * sortOrder;
      });
    } else if (this.recipeSortMode === "favorite") {
      sortedRecipes.sort((a, b) => {
        if (a.favorite === b.favorite) return 0;
        return (b.favorite ? 1 : -1) * sortOrder;
      });
    }

    container.innerHTML = sortedRecipes
      .map((recipe) => {
        // Use cookCount if available, otherwise default to 0
        const count = recipe.cookCount || 0;
        const countHtml = `
          <div class="recipe-count" style="display:flex;flex-direction:column;align-items:flex-end;font-size:0.88em;color:#ff9800;margin-bottom:0.2em;line-height:1.15;">
            <span style='font-weight:bold;'>調理</span>
            <span>${count}回</span>
          </div>`;
        
        return `
          <div class="recipe-item ${this.selectedRecipes.has(recipe.id) ? "selected" : ""}" data-id="${recipe.id}" style="width: 100%;">
            <div class="recipe-header" style="display: flex; align-items: flex-start; width: 100%;">
              <input type="checkbox" class="recipe-checkbox" ${this.selectedRecipes.has(recipe.id) ? "checked" : ""} style="margin-top: 0.5em;">
              <div class="recipe-content" style="flex: 1; margin-left: 10px; width: calc(100% - 40px);">
                <div style="display: flex; align-items: center; margin-bottom: 10px; width: 100%;">
                  <div class="recipe-name" style="font-size: 1.4em; font-weight: 600; color: #333; margin-right: 10px;">${recipe.name}</div>
                  <button class="btn-detail" data-id="${recipe.id}" style="font-size: 0.93em; color: #2196f3; background: none; border: none; cursor: pointer; white-space: nowrap; padding: 0 8px;">詳細</button>
                </div>
                <div class="recipe-ingredients" style="display:none;margin-bottom:10px;">
                  ${recipe.ingredients.map(ing => `<span class="ingredient-badge">${ing.name} ${ing.quantity}</span>`).join("")}
                </div>
                ${recipe.image ? `<img src="${recipe.image}" alt="${recipe.name}" class="recipe-image" style="width:100%;max-width:300px;height:auto;border-radius:8px;margin-top:5px;">` : ""}
              </div>
              <div class="recipe-actions">
                <button class="btn-favorite" data-id="${recipe.id}">
                  <i class="${recipe.favorite ? 'fas fa-star' : 'far fa-star'}"></i>
                </button>
                <button class="btn-edit" data-id="${recipe.id}">
                  <i class="fas fa-pen"></i>
                </button>
                <button class="btn-delete" data-id="${recipe.id}">
                  <i class="fas fa-trash"></i>
                </button>
                ${countHtml}
              </div>
            </div>
          </div>
        `;
      })
      .join("")

    // 古いイベントリスナーを削除
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
    container = newContainer;
    
    // 買い物リスト追加ボタンの表示状態を更新
    this.updateShoppingButton();
    
    // チェックボックスの変更イベントを処理
    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('recipe-checkbox')) {
        e.stopPropagation(); // イベントの伝播を停止
        e.preventDefault(); // デフォルトのチェックボックスの動作を防ぐ
        
        const recipeItem = e.target.closest('.recipe-item');
        if (recipeItem) {
          const recipeId = recipeItem.dataset.id;

          this.toggleRecipeSelection(recipeId);
        }
      }
    }, true); // キャプチャリングフェーズでイベントを処理

    // その他のボタンクリックを処理
    container.addEventListener('click', (e) => {
      // チェックボックスの場合は何もしない（changeイベントで処理する）
      if (e.target.classList.contains('recipe-checkbox') || e.target.closest('.recipe-checkbox')) {
        return;
      }
      
      const target = e.target.closest('.btn-detail, .btn-favorite, .btn-edit, .btn-delete, .fa-star, .fa-pen, .fa-trash');
      if (!target) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const recipeItem = target.closest('.recipe-item');
      if (!recipeItem) return;
      
      const recipeId = recipeItem.dataset.id;
      const recipe = this.recipes.find(r => r.id === recipeId);
      if (!recipe) return;
        

        
        // 詳細ボタンの処理
        if (target.classList.contains('btn-detail') || target.closest('.btn-detail')) {
        // モーダルにデータをセット
        document.getElementById("modal-recipe-title").textContent = recipe.name;
        
        // 材料と調味料を分離
        const ingredients = (recipe.ingredients || []).filter(i => !i.type || i.type !== 'seasoning');
        const seasonings = (recipe.ingredients || []).filter(i => i.type === 'seasoning');
        
        // 材料リストを作成
        const ingUl = document.getElementById("modal-recipe-ingredients");
        ingUl.innerHTML = ingredients
          .map(i => `<li>・${this.escapeHtml(i.name)}${i.quantity ? ` (${this.escapeHtml(i.quantity)})` : ''}</li>`)
          .join('');
          
        // 調味料リストを作成（調味料がある場合のみ表示）
        const seasoningUl = document.getElementById("modal-recipe-seasonings");
        const seasoningSection = document.getElementById("seasoning-section");
        
        if (seasonings.length > 0) {
          seasoningUl.innerHTML = seasonings
            .map(s => `<li>・${this.escapeHtml(s.name)}${s.quantity ? ` (${this.escapeHtml(s.quantity)})` : ''}</li>`)
            .join('');
          seasoningSection.style.display = 'block';
        } else {
          seasoningSection.style.display = 'none';
        }
        
        // メモをセット（改行を反映）
        const notesElement = document.getElementById("modal-recipe-notes");
        notesElement.innerHTML = recipe.notes ? this.escapeHtml(recipe.notes).replace(/\n/g, '<br>') : '特になし';
        
        // メモ用画像を表示
        const notePhotoContainer = document.getElementById('modal-note-photo');
        if (recipe.noteImage) {
          notePhotoContainer.innerHTML = `
            <div style="margin-top: 15px; text-align: center;">
              <h3 style="margin-bottom: 8px; color: #ff9800; font-size: 1.1em;">添付写真</h3>
              <img src="${recipe.noteImage}" style="max-width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            </div>
          `;
        } else {
          notePhotoContainer.innerHTML = '';
        }
        
        // 編集ボタンのイベントを設定
        const editButton = document.getElementById('edit-recipe-button');
        if (editButton) {
          editButton.onclick = () => this.editRecipe(recipe.id);
        }
        
        // 買い物リストに追加ボタンのイベントを設定
        const addToShoppingButton = document.getElementById('add-to-shopping-from-detail');
        if (addToShoppingButton) {
          addToShoppingButton.onclick = () => {
            this.addToShoppingList(recipe.ingredients, recipe.name, recipe.id);
            this.showMessage('買い物リストに追加しました', 'success');
          };
        }
        
        // 調味料セクションの表示設定（トグル機能は削除）
        
        // モーダルを表示
        document.getElementById('recipe-detail-modal').style.display = 'block';
        document.body.style.overflow = 'hidden';
        return;
      }
      
      // お気に入りボタンの処理
      if (target.classList.contains('btn-favorite') || target.closest('.btn-favorite') || target.classList.contains('fa-star')) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFavorite(recipeId);
        return;
      }
      
      // 編集ボタンの処理
      if (target.classList.contains('btn-edit') || target.closest('.btn-edit') || target.classList.contains('fa-pen')) {
        e.preventDefault();
        e.stopPropagation();
        this.editRecipe(recipeId);
        return;
      }
      
      // 削除ボタンの処理
      if (target.classList.contains('btn-delete') || target.closest('.btn-delete') || target.classList.contains('fa-trash')) {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('このレシピを削除しますか？')) {
          this._deleteRecipeAsync(recipeId).then(() => {
            this.recipes = this.recipes.filter((recipe) => recipe.id !== recipeId);
            this.selectedRecipes.delete(recipeId);
            this.saveRecipes();
            this.renderRecipes();
            this.updateShoppingButton();
            this.showMessage("レシピを削除しました");
            // 詳細モーダルを閉じる
            document.getElementById('recipe-detail-modal').style.display = 'none';
            document.body.style.overflow = 'auto';
          }).catch(error => {

            this.showMessage("レシピの削除中にエラーが発生しました", "error");
          });
        }
        return;
      }
    });
    // モーダル閉じるボタン
    const closeDetailBtn = document.getElementById("close-detail-modal");
    if (closeDetailBtn) {
      closeDetailBtn.onclick = () => {
        document.getElementById("recipe-detail-modal").style.display = "none";
      };
    }
  }

  // レシピを編集する処理
  editRecipe(id) {
    const recipe = this.recipes.find(r => r.id === id);
    if (!recipe) return;
    
    // 編集モードを設定
    this.editingRecipeId = id;
    
    // フォームにレシピデータをセット
    document.getElementById("recipe-name").value = recipe.name || "";
    document.getElementById("recipe-notes").value = recipe.notes || "";
    
    // 見出しを「レシピ編集」に変更し、編集アイコンを追加（紫に設定）
    const formTitle = document.getElementById("register-title");
    if (formTitle) {
      formTitle.innerHTML = '<i class="fas fa-edit" style="color: #9c27b0;"></i> レシピ編集';
    }
    
    // 材料をセット
    const ingredientsContainer = document.getElementById("ingredients-container");
    ingredientsContainer.innerHTML = ""; // 既存の行をクリア
    
    // 調味料をセット
    const seasoningsContainer = document.getElementById("seasonings-container");
    seasoningsContainer.innerHTML = ""; // 既存の行をクリア
    
    // 材料と調味料を分けて処理
    const ingredients = (recipe.ingredients || []).filter(item => !item.type || item.type === 'ingredient');
    const seasonings = (recipe.ingredients || []).filter(item => item.type === 'seasoning');
    
    // 材料と調味料が両方空の場合はデフォルトで1行ずつ追加
    if (ingredients.length === 0 && seasonings.length === 0) {
      this.addIngredientRow();
      this.addSeasoningRow();
      return;
    }
    
    // 材料を追加
    if (ingredients.length > 0) {
      ingredients.forEach((ing, index) => {
        const row = document.createElement("div");
        row.className = "ingredient-row";
        
        // 1行目はプラスボタン、2行目以降は削除ボタンを表示
        const isFirstRow = index === 0;
        
        row.innerHTML = `
          <input type="text" placeholder="材料名" class="ingredient-name" value="${this.escapeHtml(ing.name)}" required>
          <input type="text" placeholder="数量" class="ingredient-quantity" value="${this.escapeHtml(ing.quantity || '')}">
          ${isFirstRow ? `
            <button type="button" class="btn-icon add-ingredient">
              <i class="fas fa-plus"></i>
            </button>
          ` : `
            <button type="button" class="btn-remove-ingredient">
              <i class="fas fa-times"></i>
            </button>
          `}
        `;
        
        // 削除ボタンのイベントリスナー
        const removeBtn = row.querySelector(".btn-remove-ingredient");
        if (removeBtn) {
          removeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            row.remove();
            this.updateRemoveButtons();
          });
        }
        
        // 追加ボタンのイベントリスナー（1行目のみ）
        if (isFirstRow) {
          const addBtn = row.querySelector(".add-ingredient");
          if (addBtn) {
            addBtn.addEventListener("click", () => {
              this.addIngredientRow();
            });
          }
        }
        
        ingredientsContainer.appendChild(row);
      });
    } else {
      // 材料が1つもない場合は1行追加
      this.addIngredientRow();
    }
    
    // 削除ボタンの表示/非表示を更新
    this.updateRemoveButtons();
    
    // 調味料を追加
    if (seasonings.length > 0) {
      seasonings.forEach((seasoning, index) => {
        const row = document.createElement("div");
        row.className = "ingredient-row";
        
        // 1行目はプラスボタン、2行目以降は削除ボタンを表示
        const isFirstRow = index === 0;
        
        row.innerHTML = `
          <input type="text" placeholder="調味料名" class="ingredient-name" value="${this.escapeHtml(seasoning.name || '')}">
          <input type="text" placeholder="数量" class="ingredient-quantity" value="${this.escapeHtml(seasoning.quantity || '')}">
          ${isFirstRow ? `
            <button type="button" class="btn-icon add-seasoning">
              <i class="fas fa-plus"></i>
            </button>
          ` : `
            <button type="button" class="btn-remove-ingredient">
              <i class="fas fa-times"></i>
            </button>
          `}
        `;
        
        // 削除ボタンのイベントリスナー
        const removeBtn = row.querySelector(".btn-remove-ingredient");
        if (removeBtn) {
          removeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            row.remove();
            this.updateRemoveButtons();
          });
        }
        
        // 追加ボタンのイベントリスナー（1行目のみ）
        if (isFirstRow) {
          const addBtn = row.querySelector(".add-seasoning");
          if (addBtn) {
            addBtn.addEventListener("click", () => {
              this.addSeasoningRow();
            });
          }
        }
        
        seasoningsContainer.appendChild(row);
      });
    } else if (ingredients.length === 0) {
      // 材料も調味料もない場合のみ調味料の行を追加
      this.addSeasoningRow();
    }
    
    // 削除ボタンの表示/非表示を更新
    this.updateRemoveButtons();

    // メイン写真の要素を取得
    const previewImage = document.getElementById("preview-image");
    const photoUpload = document.getElementById("photo-upload");
    const photoPreview = document.getElementById("photo-preview");
    const photoInput = document.getElementById("photo-input");
    
    // 画像入力フィールドをリセット（前回の選択をクリア）
    if (photoInput) {
      photoInput.value = "";
    }
    
    // レシピに画像がある場合、プレビューを表示
    if (recipe && recipe.image && recipe.image.trim() !== '') {
      previewImage.src = recipe.image;
      photoUpload.style.display = "none";
      photoPreview.style.display = "block";
      
      // プレビュー画像の表示を確実にする
      previewImage.style.display = "block";
    } else {
      // 画像がない場合はアップロードエリアを表示
      previewImage.src = "";
      photoUpload.style.display = "flex";
      photoPreview.style.display = "none";
      
      // 画像入力フィールドのイベントリスナーを再設定
      if (photoInput) {
        const newInput = photoInput.cloneNode(true);
        photoInput.parentNode.replaceChild(newInput, photoInput);
        newInput.addEventListener('change', (e) => this.handlePhotoUpload(e));
      }
    }

    // メモ用写真の要素を取得
    const notePreviewImage = document.getElementById("note-preview-image");
    const notePhotoUpload = document.getElementById("note-photo-upload");
    const notePhotoPreview = document.getElementById("note-photo-preview");
    const notePhotoInput = document.getElementById("note-photo-input");
    
    // メモ用画像入力をリセット
    if (notePhotoInput) {
      notePhotoInput.value = "";
    }
    
    // メモ用画像がある場合、プレビューを表示
    if (recipe && recipe.noteImage && recipe.noteImage.trim() !== '') {
      notePreviewImage.src = recipe.noteImage;
      notePhotoUpload.style.display = "none";
      notePhotoPreview.style.display = "block";
      
      // プレビュー画像の表示を確実にする
      notePreviewImage.style.display = "block";
    } else {
      // 画像がない場合はアップロードエリアを表示
      notePreviewImage.src = "";
      notePhotoUpload.style.display = "flex";
      notePhotoPreview.style.display = "none";
      
      // 画像入力フィールドのイベントリスナーを再設定
      if (notePhotoInput) {
        const newInput = notePhotoInput.cloneNode(true);
        notePhotoInput.parentNode.replaceChild(newInput, notePhotoInput);
        newInput.addEventListener('change', (e) => this.handleNotePhotoUpload(e));
      }
    }

    // ボタン文言変更
    const submitButton = document.querySelector(".btn-primary");
    if (submitButton) {
      submitButton.textContent = "レシピを編集保存";
      // 既存のイベントリスナーを削除
      const newButton = submitButton.cloneNode(true);
      submitButton.parentNode.replaceChild(newButton, submitButton);
      // 新しいイベントリスナーを追加
      newButton.addEventListener("click", (e) => {
        e.preventDefault();
        if (this.editingRecipeId) {
          this.saveEditedRecipe();
        } else {
          this.addRecipe();
        }
      });
    }

    // 登録タブに切り替え
    this.switchTab("register");
  }

  // 画像付きでレシピを保存する共通メソッド
  saveRecipeWithImage(imgSrc, noteImgSrc, recipeIndex, name, ingredients, seasonings) {
    // 既存のレシピデータを取得
    const existingRecipe = this.recipes[recipeIndex];
    
    this.recipes[recipeIndex] = {
      ...existingRecipe,
      name,
      ingredients: [...ingredients, ...seasonings],
      notes: document.getElementById("recipe-notes").value.trim(),
      image: imgSrc,
      noteImage: noteImgSrc,
      updatedAt: new Date().toISOString()
    };

    // データベースに保存してから再描画
    this.saveRecipes()
      .then(() => {
        this.renderRecipes();
        this.resetForm();
        this.showMessage("レシピを更新しました！", "success");
        
        // 編集モードを解除
        this.editingRecipeId = null;
        
        // 一覧タブに切り替え
        this.switchTab("list");
        
        // ページをリロードして最新の状態を表示
        setTimeout(() => {
          window.location.reload();
        }, 500); // メッセージ表示後にリロード
      })
      .catch(error => {
        console.error('レシピの保存中にエラーが発生しました:', error);
        this.showMessage("レシピの保存中にエラーが発生しました。", "error");
      });
  }

  // 編集保存処理
  saveEditedRecipe() {
    const name = document.getElementById("recipe-name").value.trim();
    
    // 材料を取得
    const ingredientRows = document.querySelectorAll("#ingredients-container .ingredient-row");
    const ingredients = [];
    ingredientRows.forEach((row) => {
      const nameInput = row.querySelector(".ingredient-name");
      const quantityInput = row.querySelector(".ingredient-quantity");
      
      if (nameInput && quantityInput) {
        const ingredientName = nameInput.value.trim();
        const quantity = quantityInput.value.trim();
        
        if (ingredientName) {
          ingredients.push({ 
            name: ingredientName, 
            quantity: quantity,
            type: 'ingredient'
          });
        }
      }
    });
    
    // 調味料を取得
    const seasoningRows = document.querySelectorAll("#seasonings-container .ingredient-row");
    const seasonings = [];
    seasoningRows.forEach((row) => {
      const nameInput = row.querySelector(".ingredient-name");
      const quantityInput = row.querySelector(".ingredient-quantity");
      
      if (nameInput && quantityInput) {
        const seasoningName = nameInput.value.trim();
        const quantity = quantityInput.value.trim();
        
        if (seasoningName) {
          seasonings.push({
            name: seasoningName,
            quantity: quantity,
            type: 'seasoning'
          });
        }
      }
    });

    // バリデーション
    if (!name || (ingredients.length === 0 && seasonings.length === 0)) {
      this.showMessage("料理名と材料または調味料のいずれかは必須です。", "error");
      return;
    }

    // 確認ダイアログ
    if (!confirm("この内容で編集を完了しますか？")) {
      return;
    }

    // レシピを取得してインデックスを確認（新規登録の場合は-1のまま進む）
    let recipeIndex = -1;
    if (this.editingRecipeId) {
      recipeIndex = this.recipes.findIndex(r => r.id === this.editingRecipeId);
      if (recipeIndex === -1) {
        this.showMessage("編集するレシピが見つかりませんでした。", "error");
        return;
      }
    }
    
    // 画像の処理
    const photoInput = document.getElementById("photo-input");
    const previewImage = document.getElementById("preview-image");
    const photoUpload = document.getElementById("photo-upload");
    
    // メイン画像が削除された場合
    if (photoUpload.style.display === "flex" && !photoInput.files[0]) {
      // 画像が削除された場合、空文字を設定
      this.processNoteImageAndSave(recipeIndex, name, ingredients, seasonings, "");
      return;
    }
    
    // 新しい画像がアップロードされた場合の処理は、後続の処理に任せる
    if (photoInput.files[0]) {
      // 処理を続行
    }

    // DOM要素の取得（既に宣言済みの変数を除く）
    const photoPreview = document.getElementById("photo-preview");
    const notePreviewImage = document.getElementById("note-preview-image");
    const notePhotoPreview = document.getElementById("note-photo-preview");
    const notePhotoUpload = document.getElementById("note-photo-upload");
    const notePhotoInput = document.getElementById("note-photo-input");
    
    // 現在のレシピを取得
    const currentRecipe = this.recipes[recipeIndex];
    
    // 画像の状態を初期化
    let imgSrc = currentRecipe.image || "";
    let noteImgSrc = currentRecipe.noteImage || "";
    
    // 新しいメイン画像がアップロードされた場合
    if (photoInput?.files?.[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        imgSrc = e.target.result;
        // メイン画像の処理が完了したら、メモ用画像の処理に進む
        this.processNoteImageAndSave(recipeIndex, name, ingredients, seasonings, imgSrc);
      };
      reader.readAsDataURL(photoInput.files[0]);
      return;
    } 
    // 既存のメイン画像をそのまま使用する場合
    else if (previewImage?.src && !previewImage.src.endsWith('image-placeholder.png')) {
      imgSrc = previewImage.src;
    }
    // メイン画像が削除された場合
    else if (photoUpload?.style.display === "flex") {
      imgSrc = "";
    }
    
    // メモ用画像の処理に進む
    this.processNoteImageAndSave(recipeIndex, name, ingredients, seasonings, imgSrc);
  }

  // メモ用画像の処理用のヘルパーメソッド
  processNoteImageAndSave(recipeIndex, name, ingredients, seasonings, imgSrc) {
    const notePreviewImage = document.getElementById("note-preview-image");
    const notePhotoInput = document.getElementById("note-photo-input");
    const notePhotoUpload = document.getElementById("note-photo-upload");
    const notePhotoPreview = document.getElementById("note-photo-preview");
    
    // メモ用画像が削除された場合
    if (notePhotoUpload?.style.display === "flex" && (!notePhotoInput?.files?.[0] || notePhotoInput.files.length === 0)) {
      // プレビューを非表示にしてから保存
      if (notePhotoPreview) notePhotoPreview.style.display = "none";
      if (notePhotoUpload) notePhotoUpload.style.display = "flex";
      this.saveRecipeWithImage(imgSrc, "", recipeIndex, name, ingredients, seasonings);
      return;
    }
    
    // 新しいメモ用画像がアップロードされた場合
    if (notePhotoInput?.files?.[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const noteImgSrc = e.target.result;
        this.saveRecipeWithImage(imgSrc, noteImgSrc, recipeIndex, name, ingredients, seasonings);
      };
      reader.readAsDataURL(notePhotoInput.files[0]);
      return;
    } 
    // 既存のメモ用画像をそのまま使用する場合
    else if (notePreviewImage?.src && !notePhotoInput?.files?.[0]) {
      const noteImgSrc = notePreviewImage.src;
      this.saveRecipeWithImage(imgSrc, noteImgSrc, recipeIndex, name, ingredients, seasonings);
    } else {
      // メモ用画像に変更がない場合
      this.saveRecipeWithImage(imgSrc, this.recipes[recipeIndex]?.noteImage || "", recipeIndex, name, ingredients, seasonings);
    }
  }

  // チェックボックスのイベントハンドリング関数
  toggleRecipeSelection(recipeId) {
    if (!recipeId) {

      return;
    }
    
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) {

      return;
    }
    
    if (this.selectedRecipes.has(recipeId)) {
      // レシピを選択解除
      this.selectedRecipes.delete(recipeId);
      this.selectedRecipesInfo = this.selectedRecipesInfo.filter(info => info.id !== recipeId);
    } else {
      // レシピを選択
      this.selectedRecipes.add(recipeId);
      // すでに存在しない場合のみ追加
      if (!this.selectedRecipesInfo.some(info => info.id === recipeId)) {
        this.selectedRecipesInfo.push({
          id: recipeId,
          name: recipe.name
        });
      }
    }
    
    // 即座にチェックボックスの状態を反映
    const checkbox = document.querySelector(`.recipe-item[data-id="${recipeId}"] .recipe-checkbox`);
    if (checkbox) {
      checkbox.checked = this.selectedRecipes.has(recipeId);
    }
    
    // デバッグ用ログ

    
    this.updateShoppingButton();
  }

  // 買い物リスト追加ボタンの表示を更新する関数
  updateShoppingButton() {
    const addToShoppingBtn = document.getElementById('add-to-shopping');
    if (addToShoppingBtn) {
      addToShoppingBtn.style.display = this.selectedRecipes.size > 0 ? 'block' : 'none';
    }
  }

  // 詳細モーダルのイベントリスナーを設定
  setupDetailModal() {
    const modal = document.getElementById('recipe-detail-modal');
    if (!modal) return;

    // モーダルを閉じるボタン
    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    // モーダルの外側をクリックして閉じる
    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  // レシピを削除する処理
  deleteRecipe(id) {
    if (confirm("このレシピを削除しますか？")) {
      this.recipes = this.recipes.filter((recipe) => recipe.id !== id)
      this.selectedRecipes.delete(id)
      this.saveRecipes()
      this.renderRecipes()
      this.updateShoppingButton()
    }
  }

  // 選択中のレシピの材料を買い物リストに追加する処理
  addSelectedToShopping() {

    
    // 選択されたレシピを取得
    const selectedRecipes = this.recipes.filter(recipe => this.selectedRecipes.has(recipe.id));

    
    // デバッグ用: 選択されたレシピの情報を表示


    if (selectedRecipes.length === 0) {
      this.showMessage("レシピが選択されていません。", "error");
      return false;
    }

    // 新しいshoppingList構造を初期化（存在しない場合）
    if (!this.shoppingList.ingredients) this.shoppingList.ingredients = [];
    if (!this.shoppingList.customItems) this.shoppingList.customItems = [];
    
    // カスタムアイテムはそのまま保持し、材料リストのみをクリア
    const customItems = [...this.shoppingList.customItems];
    this.shoppingList = {
      ingredients: [],
      customItems: customItems
    };
    
    let added = false;
    
    // 各レシピの材料と調味料を買い物リストに追加
    selectedRecipes.forEach(recipe => {

      
      // 材料を追加
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        const ingredients = recipe.ingredients
          .filter(ing => !ing.type || ing.type === 'ingredient')
          .map(ingredient => ({
            ...ingredient,
            recipeName: recipe.name,
            recipeId: recipe.id,
            type: 'ingredient'
          }));
          

        const wasAdded = this.addToShoppingList(
          ingredients,
          recipe.name,
          recipe.id,
          false  // 材料であることを明示
        );

        added = added || wasAdded;
      } else {

      }

      // 調味料を追加


    const seasonings = recipe.ingredients
      .filter(ing => {
        const isSeasoning = ing.type === 'seasoning' || ing.isSeasoning;

        return isSeasoning;
      })
      .map(seasoning => {
        const mapped = {
          ...seasoning,
          recipeName: recipe.name,
          recipeId: recipe.id,
          isSeasoning: true,  // 明示的に isSeasoning フラグを設定
          type: 'seasoning'   // type も明示的に設定
        };

        return mapped;
      });
      

      
      if (seasonings.length > 0) {
        

        
        const wasAdded = this.addToShoppingList(
          seasonings,
          recipe.name,
          recipe.id,
          true  // 調味料であることを明示
        );
        

        added = added || wasAdded;
      } else {

      }
    });

    // 買い物リストを保存
    this.saveShoppingList();
    
    // 選択をクリア
    this.selectedRecipes.clear();
    this.updateShoppingButton();
    this.renderRecipes();
    
    // 買い物リストを再描画
    this.renderShoppingList();
    
    // アイテムが追加された場合のみタブを切り替え
    if (added) {
      this.switchTab('shopping');
      this.showMessage("買い物リストを更新しました。", "success");
    }
  }

  // 買い物リストを画面に表示する処理
  renderShoppingList() {
    
    const shoppingListEl = document.getElementById('shopping-container'); 
    if (!shoppingListEl) {

      return;
    }

    const totalItems = (this.shoppingList.ingredients?.length || 0) + (this.shoppingList.customItems?.length || 0);
    if (totalItems === 0) {
      shoppingListEl.innerHTML = '<p class="empty-message">リストにアイテムがありません</p>';
      return;
    }

    // 全アイテムを結合
    const allItems = [
      ...(this.shoppingList.ingredients || []),
      ...(this.shoppingList.customItems || [])
    ];
    
    // 選択されたレシピを表示するセクションのHTMLを構築
    let selectedRecipesHtml = '';
    if (this.selectedRecipesInfo.length > 0) {
      selectedRecipesHtml = `
        <div class="selected-recipes">
          <h3>選択したレシピ</h3>
          <div class="recipe-tags">
            ${this.selectedRecipesInfo.map(recipeInfo => 
              `<span class="recipe-tag" data-id="${recipeInfo.id}">
                ${this.escapeHtml(recipeInfo.name)}
              </span>`
            ).join('')}
          </div>
        </div>
      `;
    } else {
      // 選択されたレシピがない場合、アイテムからレシピ名を収集して表示
      const recipeNameSet = new Set();
      const recipeNames = [];
      
      allItems.forEach(item => {
        if (item.recipeName && !recipeNameSet.has(item.recipeName)) {
          recipeNames.push(item.recipeName);
          recipeNameSet.add(item.recipeName);
        }
      });
      
      if (recipeNames.length > 0) {
        selectedRecipesHtml = `
          <div class="selected-recipes">
            <h3>選択したレシピ</h3>
            <div class="recipe-tags">
              ${recipeNames.map(name => 
                `<span class="recipe-tag">
                  ${this.escapeHtml(name)}
                </span>`
              ).join('')}
            </div>
          </div>
        `;
      }
    }

    // アイテムをカテゴリ別に分離（カテゴリ別に分離する前のデータをログに出力）

    
    const regularItems = (this.shoppingList.ingredients || []).filter(item => {
      const isRegular = !item.isSeasoning;

      return isRegular;
    });
    
    const seasoningItems = (this.shoppingList.ingredients || []).filter(item => {
      const isSeasoning = item.isSeasoning;

      return isSeasoning;
    });
    
    const customItems = this.shoppingList.customItems || [];
    
    let html = `
      <div class="shopping-list-container">
        ${selectedRecipesHtml || ''}
        <div class="shopping-list-content">
    `;

    // 1. 材料セクション
    if (regularItems.length > 0) {
      html += `
        <div class="shopping-section">
          <h3 class="section-title">材料</h3>
          <div class="ingredients-list">
            ${regularItems.map(item => `
              <div class="shopping-item ${item.completed ? 'completed' : ''}" data-id="${item.id}" data-custom="false">
                <div class="item-checkbox-container">
                  <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
                  <span class="checkmark"></span>
                </div>
                <span class="item-name">${this.escapeHtml(item.name)}</span>
                ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
                <button class="btn-remove" data-id="${item.id}" data-custom="false">×</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 2. 調味料セクション
    if (seasoningItems.length > 0) {
      html += `
        <div class="shopping-section seasoning-section collapsed">
          <div class="section-header">
            <h3>調味料</h3>
<span class="toggle-icon">
  <svg width="1.5em" height="1.5em" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
</span>
          </div>
          <div class="section-content">
            <div class="ingredients-list">
              ${seasoningItems.map(item => `
                <div class="shopping-item ${item.completed ? 'completed' : ''}" data-id="${item.id}" data-custom="false" data-seasoning="true">
                  <label class="item-checkbox-container">
                    <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                  </label>
                  <span class="item-name">${this.escapeHtml(item.name)}</span>
                  ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
                  <button class="btn-remove" data-id="${item.id}" data-custom="false">×</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // 3. その他セクション
    if (this.shoppingList.customItems && this.shoppingList.customItems.length > 0) {
      // タイムスタンプでソート（新しいものから表示）
      const sortedCustomItems = [...this.shoppingList.customItems].sort((a, b) => 
        (b.timestamp || 0) - (a.timestamp || 0)
      );

      html += `
        <div class="shopping-section custom-items" id="custom-items-section">
          <h3 class="section-title">その他</h3>
          <div class="ingredients-list" id="custom-items-list">
            ${sortedCustomItems.map((item, index) => `
                <div class="shopping-item ${item.completed ? 'completed' : ''}" 
                     data-id="${item.id}" 
                     data-custom="true"
                     data-index="${index}">
                  <div class="item-checkbox-container">
                    <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                  </div>
                  <span class="item-name">${this.escapeHtml(item.name)}</span>
                  ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
                  <button class="btn-remove" data-id="${item.id}" data-custom="true">×</button>
                </div>
              `).join('')}
          </div>
        </div>
      `;
    }

    html += `</div>`; // .shopping-list-container の閉じタグ

    // 通常の材料セクションが空の場合の表示
    if (regularItems.length === 0 && seasoningItems.length === 0) {
      html += `
        <div class="shopping-section ingredients">
          <h3 class="section-title">材料</h3>
          <p class="empty-section">材料が追加されていません</p>
        </div>`;
    }

    html += '</div>';
    shoppingListEl.innerHTML = html;

    // 調味料セクションの表示切り替えイベントを設定
    this.setupSeasoningSectionToggles();

    // チェックボックスのイベントリスナーを設定
    document.querySelectorAll('.item-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const itemId = e.target.closest('.shopping-item').dataset.id;
        this.toggleShoppingItem(itemId);
      });
    });
  }

  // 調味料セクションの表示/非表示を切り替える
  toggleSeasoningSection = (e) => {
    // トグルアイコンまたはその親要素がクリックされた場合に処理
    const header = e.target.closest('.section-header');
    if (!header) return;
    
    const section = header.closest('.shopping-section');
    if (section) {
      section.classList.toggle('collapsed');
    }
  }

  // 調味料セクションのトグルイベントを設定
  setupSeasoningSectionToggles() {
    document.querySelectorAll('.seasoning-section .section-header').forEach(header => {
      header.removeEventListener('click', this.toggleSeasoningSection);
      header.addEventListener('click', this.toggleSeasoningSection);
    });

    // 削除ボタンのイベントリスナー
    document.querySelectorAll('.btn-remove').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = e.currentTarget.dataset.id;
        this.deleteShoppingItem(itemId);
      });
    });

    // カスタムアイテム一括削除ボタンのイベントリスナー
    const clearCustomBtn = document.querySelector('.btn-clear-custom');
    if (clearCustomBtn) {
      clearCustomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearAllCustomItems();
      });
    }

      // 買い物完了ボタンのイベントリスナーはsetupEventListenersで登録済みのため削除
  }

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
  }

  // 買い物リストのチェックボックスON/OFFで完了状態を切り替える
  toggleShoppingItem(itemId) {
    // すべてのアイテムを検索
    const allItems = [...(this.shoppingList.ingredients || []), ...(this.shoppingList.customItems || [])];
    const item = allItems.find((item) => item.id === itemId || item.name.toLowerCase() === itemId.toLowerCase());

    if (item) {
      // アイテムの完了状態をトグル
      item.completed = !item.completed;

      // カスタムアイテムの場合は、カスタムアイテムリストも更新
      if (item.isCustom) {
        const customItem = this.customItems.find((i) => i.id === item.id);
        if (customItem) {
          customItem.completed = item.completed;
          this.saveCustomItems();
        }
      }

      // 状態を保存してUIを更新
      this.saveShoppingList();
      this.updateCompleteShoppingButton();

      // チェックボックスの状態を更新
      const checkbox = document.querySelector(`.shopping-item[data-id="${item.id}"] .item-checkbox`);
      if (checkbox) {
        checkbox.checked = item.completed;
      }
    } else {

    }
  }

  deleteShoppingItem(id) {
    // カスタムアイテムと材料から該当するアイテムを削除
    this.shoppingList.ingredients = this.shoppingList.ingredients.filter(item => item.id !== id && item.name.toLowerCase() !== id.toLowerCase());
    this.shoppingList.customItems = this.shoppingList.customItems.filter(item => item.id !== id && item.name.toLowerCase() !== id.toLowerCase());
    
    this.saveShoppingList();
    this.renderShoppingList();
  }

  // カスタムアイテムの初期設定
  setupCustomItems() {
    // カスタムアイテムフォームの送信イベント
    const form = document.getElementById('custom-item-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addCustomItem();
      });
    }

    // 初期表示
    this.renderCustomItems();
  }

  // カスタムアイテム一覧を表示
  renderCustomItems() {
    const container = document.getElementById('custom-items-list');
    if (!container) return;
    
    if (this.customItems.length === 0) {
      container.innerHTML = '<p class="empty-message">登録されたアイテムはありません</p>';
      return;
    }
    
    container.innerHTML = `
      <div class="custom-items-header">
        <h3>登録済みのカスタムアイテム</h3>
        <button id="clear-all-custom-items" class="btn-clear-all" title="すべてのカスタムアイテムを削除">
          <i class="fas fa-trash-alt"></i> すべて削除
        </button>
      </div>
      <div class="custom-items-container">
        ${this.customItems.map(item => `
          <div class="custom-item" data-id="${item.id}">
            <input type="checkbox" class="recipe-checkbox" value="${item.id}" ${item.completed ? 'checked' : ''}>
            <div class="item-details">
              <span class="item-name">${this.escapeHtml(item.name)}</span>
              ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
            </div>
            <button class="btn-remove" onclick="app.removeCustomItem('${item.id}')">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `).join('')}
      </div>`;
      
    // 一括削除ボタンのイベントリスナーを設定
    const clearAllButton = document.getElementById('clear-all-custom-items');
    if (clearAllButton) {
      clearAllButton.addEventListener('click', () => this.clearAllCustomItems());
    }
  }

  // HTMLエスケープ用ヘルパー関数
  escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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
  }

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
      // カスタムアイテムリストに追加
      this.customItems.push(newItem);
      
      // IndexedDBに保存
      if (window.recipeDB && window.recipeDB.db) {
        await this.saveCustomItems();
      }
      
      // フォームをリセット
      nameInput.value = '';
      quantityInput.value = '';
      
      // 再描画
      this.renderCustomItems();
      
      // メッセージを表示
      this.showMessage('カスタムアイテムを追加しました', 'success');
      
    } catch (error) {

      this.showMessage('カスタムアイテムの追加中にエラーが発生しました', 'error');
      
      // エラーが発生した場合は追加したアイテムを元に戻す
      this.customItems = this.customItems.filter(item => item.id !== newItem.id);
    }
  }

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
      // 買い物リストのcustomItemsが未初期化の場合は初期化
      if (!this.shoppingList.customItems) {
        this.shoppingList.customItems = [];
      }
      
      // 追加されたかどうかのフラグ
      let added = false;
      
      // 選択されたアイテムを買い物リストに追加
      for (const item of selectedItems) {
        // 既存のアイテムをIDまたは名前でチェック（大文字小文字を区別しない）
        const existingItem = this.shoppingList.customItems.find(
          i => i.id === item.id || i.name.toLowerCase() === item.name.toLowerCase()
        );
        
        if (!existingItem) {
          // 新しいアイテムを追加
          this.shoppingList.customItems.push(item);
          added = true;
        }
      }
      
      if (added) {
        // IndexedDBに保存
        if (window.recipeDB && window.recipeDB.db) {
          await this.saveShoppingList();
        }
        this.renderShoppingList();
        this.showMessage('選択したアイテムを買い物リストに追加しました', 'success');
      } else {
        this.showMessage('選択したアイテムは既に買い物リストに追加されています', 'info');
      }
      
      // チェックを外す
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
      
      // カスタムアイテム一覧を再描画（チェックボックスを更新）
      this.renderCustomItems();
      
    } catch (error) {

      this.showMessage('買い物リストへの追加中にエラーが発生しました', 'error');
    }
  }

  // 買い物を完了して、完了したアイテムを削除
  isCompletingShopping = false;
  
  async completeShopping() {
    // 既に処理中であれば何もしない
    if (this.isCompletingShopping) {
      return;
    }
    
    // 処理中フラグを設定
    this.isCompletingShopping = true;
    
    try {
      // 1. チェックボックスから直接チェック状態を取得
      const checkedItems = [];
      const checkboxes = document.querySelectorAll('input[type="checkbox"].item-checkbox:checked');

    // 2. チェックされたアイテムを収集
    checkboxes.forEach((checkbox) => {
      const itemElement = checkbox.closest('.shopping-item');
      if (!itemElement) return;

      const itemId = itemElement.dataset.id;
      const isCustomItem = itemElement.dataset.custom === 'true';
      const itemName = itemElement.querySelector('.item-name')?.textContent || 'アイテム';
      const itemQuantity = itemElement.querySelector('.item-quantity')?.textContent || '';
      const recipeId = itemElement.dataset.recipeId;

      checkedItems.push({
        id: itemId,
        name: itemName,
        quantity: itemQuantity,
        isCustom: isCustomItem,
        recipeId: recipeId
      });
    });

    if (checkedItems.length === 0) {
      this.showMessage('完了するアイテムを選択してください', 'error');
      return;
    }

    // 3. チェックされたアイテムを削除して、削除されたアイテムを収集
    const removedItems = [];
    const removedCustomItems = [];
    const historyItems = [];
    const recipeIds = new Map(); // レシピIDとその出現回数を保持するマップ

      checkedItems.forEach(item => {
        if (item.isCustom) {
          // カスタムアイテムの削除
          const customItemIndex = this.customItems.findIndex(ci => ci.id === item.id);
          if (customItemIndex !== -1) {
            const removedItem = this.customItems[customItemIndex];
            removedCustomItems.push(removedItem);
            
            // 履歴用のアイテムを追加
            historyItems.push({
              id: removedItem.id,
              name: removedItem.name,
              quantity: removedItem.quantity || '',
              unit: removedItem.unit || '',
              isCustom: true,
              isSeasoning: false
            });
            
            this.customItems.splice(customItemIndex, 1);
          }
          
          // shoppingList.customItemsからも削除
          if (this.shoppingList.customItems) {
            const shoppingListIndex = this.shoppingList.customItems.findIndex(ci => ci.id === item.id);
            if (shoppingListIndex !== -1) {
              this.shoppingList.customItems.splice(shoppingListIndex, 1);
            }
          }
        } else {
          // 通常の買い物アイテムの削除
          const itemIndex = this.shoppingList.ingredients.findIndex(i => i.id === item.id);
          if (itemIndex !== -1) {
            const removedItem = this.shoppingList.ingredients[itemIndex];
            removedItems.push(removedItem);
            
            // レシピIDを記録（あれば）
            if (removedItem.recipeId) {
              // 既に同じレシピIDが記録されている場合はカウントを増やす
              const currentCount = recipeIds.get(removedItem.recipeId) || 0;
              recipeIds.set(removedItem.recipeId, currentCount + 1);

            }
            
            // 履歴用のアイテムを追加（isSeasoningフラグを保持）
            historyItems.push({
              id: removedItem.id,
              name: removedItem.name,
              quantity: removedItem.quantity || '',
              unit: removedItem.unit || '',
              recipeName: removedItem.recipeName || '',
              isCustom: false,
              isSeasoning: removedItem.isSeasoning || false
            });
            
            this.shoppingList.ingredients.splice(itemIndex, 1);
          }
        }
      });

      // 4. レシピの調理回数を更新（削除されたアイテムからレシピIDを収集）
      const updatedRecipes = new Set();
      const recipeIdsFromItems = new Set();
      
      // 削除されたアイテムからレシピIDを収集
      removedItems.forEach(item => {
        if (item.recipeId) {
          recipeIdsFromItems.add(item.recipeId);
        }
      });
      
      // 選択されたレシピからもレシピIDを収集
      const recipeIdsFromSelection = new Set(
        this.selectedRecipesInfo.map(info => info.id).filter(Boolean)
      );
      
      // 両方のソースからユニークなレシピIDを取得
      const allRecipeIds = new Set([...recipeIdsFromItems, ...recipeIdsFromSelection]);
      
      // ユニークなレシピIDごとに1回だけカウントを更新
      for (const recipeId of allRecipeIds) {
        if (updatedRecipes.has(recipeId)) continue; // 既に更新済みの場合はスキップ
        
        const recipe = this.recipes.find(r => r.id === recipeId);
        if (!recipe) {
          console.warn(`[WARNING] レシピID ${recipeId} が見つかりませんでした`);
          continue;
        }
        
        // レシピのcookCountが未定義の場合は0で初期化
        if (typeof recipe.cookCount !== 'number') {
          recipe.cookCount = 0;
        }
        
        // 調理回数を1増やす（1回の買い物で1回とカウント）
        recipe.cookCount += 1;
        updatedRecipes.add(recipeId);
        
        console.log(`[DEBUG] レシピID ${recipeId} (${recipe.name || '不明'}) の調理回数を更新: ${recipe.cookCount}`);
      }
      
      // 5. 履歴エントリを作成
      const historyEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        items: historyItems,
        totalItems: historyItems.length,
        // 選択されたレシピの情報を追加（重複を除く）
        selectedRecipes: Array.from(updatedRecipes).map(recipeId => {
          const recipe = this.recipes.find(r => r.id === recipeId) || 
                        this.selectedRecipesInfo.find(r => r.id === recipeId);
          return {
            id: recipeId,
            name: recipe ? recipe.name : '不明なレシピ'
          };
        })
      };

      // 6. レシピの保存（変更がある場合のみ）
      if (updatedRecipes.size > 0) {
        try {
          console.log('[DEBUG] レシピの調理回数を保存します');
          await this.saveRecipes();
          console.log('[DEBUG] レシピの保存が完了しました');
        } catch (error) {
          console.error('[ERROR] レシピの保存中にエラーが発生しました:', error);
          // エラーをスローせずに処理を続行
        }
      }
      
      // 7. カスタムアイテムを保存（変更がある場合のみ）
      if (removedCustomItems.length > 0) {
        await this.saveCustomItems();
      }

      // 8. 買い物リストを保存
      await this.saveShoppingList();

      // 9. 履歴に追加（アイテムがある場合のみ）
      if (historyItems.length > 0) {
        try {
          this.shoppingHistory.unshift(historyEntry);
          
          // 履歴を保存（最大100件まで保持）
          if (this.shoppingHistory.length > 100) {
            this.shoppingHistory = this.shoppingHistory.slice(0, 100);
          }
          
          await this.saveShoppingHistory();
        } catch (error) {
          console.error('[ERROR] 買い物履歴の保存に失敗しました:', error);
          // エラーが発生したら履歴から削除
          this.shoppingHistory = this.shoppingHistory.filter(h => h.id !== historyEntry.id);
          // エラーをスローせずに処理を続行
        }
      }

      // 10. チェックボックスのチェックをクリア
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });

      // 11. 選択レシピ情報をクリア
      this.selectedRecipesInfo = [];
      this.selectedRecipes.clear();
      
      // 12. UIを一度だけ更新
      this.renderRecipes();
      this.renderShoppingList();
      this.renderCustomItems();
      this.updateCompleteShoppingButton();
      
      // 13. 完了メッセージを表示
      this.showMessage('買い物お疲れさまでした！', 'success');
      console.log('[DEBUG] completeShopping メソッドが正常に完了しました');
    } catch (error) {
      console.error('[ERROR] 買い物完了処理中にエラーが発生しました:', error);
      this.showMessage('処理中にエラーが発生しました: ' + error.message, 'error');
    } finally {
      // 処理中フラグをリセット
      this.isCompletingShopping = false;
      console.log('[DEBUG] 処理中フラグをリセットしました');
    }
  }

  
  // 買い物リストを初期化する関数
  clearShoppingList() {
    if (confirm("買い物リストをクリアしますか？レシピから追加したアイテムのみ削除されます。")) {
      // カスタムアイテムを除くアイテムのみをクリア
      this.shoppingList.ingredients = [];
      this.saveShoppingList();
      this.renderShoppingList();
      this.showMessage('買い物リストをクリアしました', 'success');
    }
  }

  // レシピデータをIndexedDBに保存
  saveRecipeToDB() {
    // 実装は後で追加
  }
  
  // shoppingList.customItemsからも削除
  removeFromShoppingListCustomItems(item) {
    if (!this.shoppingList.customItems) return;
    const shoppingListIndex = this.shoppingList.customItems.findIndex(ci => ci.id === item.id);
    if (shoppingListIndex !== -1) {
      this.shoppingList.customItems.splice(shoppingListIndex, 1);
    }
  }
  
  // 買い物リストからアイテムを削除するメソッド
  async removeFromShoppingList(item) {
    const itemIndex = this.shoppingList.ingredients.findIndex(i => i.id === item.id);
    if (itemIndex === -1) return;

    const removedItem = this.shoppingList.ingredients[itemIndex];
    const removedItems = [removedItem];
    const recipeIds = new Map();
    
    // レシピIDを記録（あれば）
    if (removedItem.recipeId) {
      // 既に同じレシピIDが記録されている場合はカウントを増やす
      const currentCount = recipeIds.get(removedItem.recipeId) || 0;
      recipeIds.set(removedItem.recipeId, currentCount + 1);
    }
    
    // 履歴用のアイテムを追加
    const historyItems = [];
    historyItems.push({
      id: removedItem.id,
      name: removedItem.name,
      quantity: removedItem.quantity || '',
      unit: removedItem.unit || '',
      recipeName: removedItem.recipeName || '',
      isCustom: false
    });
    
    // アイテムを削除
    this.shoppingList.ingredients.splice(itemIndex, 1);
    
    // レシピの調理回数を更新（削除されたアイテムからレシピIDを収集）
    const updatedRecipes = new Set();
    const recipeIdsFromItems = new Set();
    
    // 削除されたアイテムからレシピIDを収集
    removedItems.forEach(item => {
      if (item.recipeId) {
        recipeIdsFromItems.add(item.recipeId);
      }
    });
    
    // 選択されたレシピからもレシピIDを収集
    const recipeIdsFromSelection = new Set(
      this.selectedRecipesInfo.map(info => info.id).filter(Boolean)
    );
    
    // 両方のソースからユニークなレシピIDを取得
    const allRecipeIds = new Set([...recipeIdsFromItems, ...recipeIdsFromSelection]);
    
    // ユニークなレシピIDごとに1回だけカウントを更新
    for (const recipeId of allRecipeIds) {
      if (updatedRecipes.has(recipeId)) continue; // 既に更新済みの場合はスキップ
      
      const recipe = this.recipes.find(r => r.id === recipeId);
      if (!recipe) {
        console.warn(`[WARNING] レシピID ${recipeId} が見つかりませんでした`);
        continue;
      }
  
  // レシピのcookCountが未定義の場合は0で初期化
  if (typeof recipe.cookCount !== 'number') {
    recipe.cookCount = 0;
  }
  
  // 調理回数を1増やす（1回の買い物で1回とカウント）
  recipe.cookCount += 1;
  updatedRecipes.add(recipeId);
  
  console.log(`[DEBUG] レシピID ${recipeId} (${recipe.name || '不明'}) の調理回数を更新: ${recipe.cookCount}`);
}

// 5. 履歴エントリを作成
const historyEntry = {
  id: Date.now().toString(),
  date: new Date().toISOString(),
  items: historyItems,
  totalItems: historyItems.length,
  // 選択されたレシピの情報を追加（重複を除く）
  selectedRecipes: Array.from(updatedRecipes).map(recipeId => {
    const recipe = this.recipes.find(r => r.id === recipeId) || 
                  this.selectedRecipesInfo.find(r => r.id === recipeId);
    return {
      id: recipeId,
      name: recipe ? recipe.name : '不明なレシピ'
    };
  })
};

// 6. レシピの保存（変更がある場合のみ）
if (updatedRecipes.size > 0) {
  try {
    console.log('[DEBUG] レシピの調理回数を保存します');
    await this.saveRecipes();
    console.log('[DEBUG] レシピの保存が完了しました');
  } catch (error) {
    console.error('[ERROR] レシピの保存中にエラーが発生しました:', error);
    // エラーをスローせずに処理を続行
  }
}

// 7. カスタムアイテムを保存（変更がある場合のみ）
if (removedCustomItems.length > 0) {
  await this.saveCustomItems();
}

// 8. 買い物リストを保存
await this.saveShoppingList();

// 9. 履歴に追加（アイテムがある場合のみ）
if (historyItems.length > 0) {
  try {
    this.shoppingHistory.unshift(historyEntry);
    
    // 履歴を保存（最大100件まで保持）
    if (this.shoppingHistory.length > 100) {
      this.shoppingHistory = this.shoppingHistory.slice(0, 100);
    }
    
    await this.saveShoppingHistory();
    console.log('[DEBUG] 買い物履歴を保存しました:', historyEntry);
  } catch (error) {
    console.error('[ERROR] 買い物履歴の保存に失敗しました:', error);
    // エラーが発生したら履歴から削除
    this.shoppingHistory = this.shoppingHistory.filter(h => h.id !== historyEntry.id);
    // エラーをスローせずに処理を続行
  }
  
  // 10. チェックボックスのチェックをクリア
  const checkboxes = document.querySelectorAll('.shopping-item-checkbox');
  checkboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });

  // 11. 選択レシピ情報をクリア
  this.selectedRecipesInfo = [];
  this.selectedRecipes.clear();
    
  // 12. UIを一度だけ更新
  this.renderRecipes();
  this.renderShoppingList();
  this.renderCustomItems();
  }
}

  updateCompleteShoppingButton() {
    // ボタンの状態を更新する処理を実装
  }

  // 完了メッセージを表示
  showCompleteMessage() {
    this.showMessage('買い物お疲れさまでした！', 'success');
  }

  // エラーメッセージを表示
  showErrorMessage(error) {
    this.showMessage('処理中にエラーが発生しました: ' + error.message, 'error');
  }

  // 買い物リストを初期化する関数
  clearShoppingList() {
    if (confirm("買い物リストをクリアしますか？レシピから追加したアイテムのみ削除されます。")) {
      // カスタムアイテムを除くアイテムのみをクリア
      this.shoppingList.ingredients = [];
      this.saveShoppingList();
      this.renderShoppingList();
      this.showMessage('買い物リストをクリアしました', 'success');
    }
  }

  // レシピデータをIndexedDBに保存
  async saveRecipes() {
    if (!window.recipeDB || !window.recipeDB.db) {
      console.error('データベースが初期化されていません');
      return;
    }
    
    const transaction = window.recipeDB.db.transaction(['recipes'], 'readwrite');
    const store = transaction.objectStore('recipes');
    
    try {
      // 既存の全レシピを取得
      const allRecipes = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => {
          console.error('レシピの取得に失敗しました:', e);
          resolve([]); // エラー時は空配列を返して処理を続行
        };
      });
      
      // 既存のレシピを削除
      await Promise.all(
        allRecipes.map(recipe => 
          new Promise((resolve, reject) => {
            const request = store.delete(recipe.id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => {
              console.warn(`[WARN] レシピID ${recipe.id} の削除に失敗しました:`, e);
              resolve(); // 削除に失敗しても処理を続行
            };
          })
        )
      );
      
      // 新しいレシピを追加
      for (const recipe of this.recipes) {
        // cookCountが未定義の場合は0に設定
        if (typeof recipe.cookCount === 'undefined') {
          recipe.cookCount = 0;
        }
        
        // レシピを追加（既に存在する場合は上書き）
        await new Promise((resolve, reject) => {
          const request = store.put(recipe);
          request.onsuccess = () => resolve();
          request.onerror = (e) => {
            console.error(`[ERROR] レシピID ${recipe.id} の保存に失敗しました:`, e);
            reject(e);
          };
        });
      }
      
      // トランザクションが完了したことを確認
      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => {
          console.error('トランザクション中にエラーが発生しました:', e);
          reject(e);
        };
      });
      
      console.log('[DEBUG] レシピの保存が完了しました');
      return true;
    } catch (error) {
      console.error('[ERROR] レシピの保存中にエラーが発生しました:', error);
      // トランザクションがまだアクティブな場合は中止
      if (transaction.state === 'active') {
        transaction.abort();
        console.warn('[WARN] トランザクションを中止しました');
      }
      throw error; // 呼び出し元でエラーハンドリングできるように再スロー
    }
  }



  // 数量を合算する関数
  sumQuantities(quantity1, quantity2) {
    // 両方空の場合は空文字を返す
    if (!quantity1 && !quantity2) return '';
    // 片方だけ値がある場合はその値を返す
    if (!quantity1) return quantity2;
    if (!quantity2) return quantity1;
    
    // 両方の数量を文字列に変換して「+」でつなぐ
    return `${quantity1}+${quantity2}`;
  }

// 買い物を追加する関数（非同期化）
  async addToShoppingList(ingredients, recipeName = null, recipeId = null, isSeasoning = false) {
    // 各材料にisSeasoningプロパティを設定
    ingredients = ingredients.map(ing => ({
      ...ing,
      isSeasoning: ing.isSeasoning !== undefined ? ing.isSeasoning : isSeasoning
    }));

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return false;
    }

    // 新しいshoppingList構造を初期化（存在しない場合）
    this.shoppingList.ingredients = this.shoppingList.ingredients || [];
    this.shoppingList.customItems = this.shoppingList.customItems || [];

    let added = false;
    const timestamp = Date.now();

    // 正規化関数
    const normalizeString = (str) => str ? str.toString().trim().toLowerCase() : '';

    for (const ingredient of ingredients) {
      const isItemCustom = Boolean(ingredient.isCustom);
      const targetArray = isItemCustom ? this.shoppingList.customItems : this.shoppingList.ingredients;
      const normalizedIngredientName = normalizeString(ingredient.name);
      let existingItemIndex = -1;
      const itemSeasoning = ingredient.isSeasoning !== undefined ? ingredient.isSeasoning : isSeasoning;

      if (isItemCustom) {
        existingItemIndex = targetArray.findIndex(item => 
          normalizeString(item.name) === normalizedIngredientName && item.isCustom === true
        );
      } else {
        existingItemIndex = targetArray.findIndex(item => {
          if (item.isCustom) return false;
          const nameMatch = normalizeString(item.name) === normalizedIngredientName;
          const seasoningMatch = Boolean(item.isSeasoning) === Boolean(itemSeasoning);
          return (itemSeasoning && item.isSeasoning) ? nameMatch : (nameMatch && seasoningMatch);
        });
      }

      if (existingItemIndex !== -1) {
        const existingItem = targetArray[existingItemIndex];
        
        if (!existingItem.recipeIds) {
          existingItem.recipeIds = [];
          existingItem.recipeNames = [];
          
          if (existingItem.recipeId) {
            existingItem.recipeIds.push(existingItem.recipeId);
            existingItem.recipeNames.push(existingItem.recipeName || '未分類');
          }
        }

        if (recipeId) {
          if (!Array.isArray(existingItem.recipeIds)) existingItem.recipeIds = [];
          if (!Array.isArray(existingItem.recipeNames)) existingItem.recipeNames = [];
          
          const recipeIndex = existingItem.recipeIds.indexOf(recipeId);
          if (recipeIndex === -1) {
            existingItem.recipeIds.push(recipeId);
            existingItem.recipeNames.push(recipeName || '未分類');
          } else if (recipeName && existingItem.recipeNames[recipeIndex] !== recipeName) {
            existingItem.recipeNames[recipeIndex] = recipeName;
          }
        }

        if (ingredient.quantity !== undefined && ingredient.quantity !== '') {
          existingItem.quantity = this.sumQuantities(
            existingItem.quantity || '',
            ingredient.quantity
          );
        }

        targetArray[existingItemIndex] = existingItem;
        added = true;
      } else {
        const newItem = {
          ...ingredient,
          id: ingredient.id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: ingredient.name,
          quantity: ingredient.quantity || '',
          isCustom: isItemCustom,
          recipeId: ingredient.recipeId || recipeId,
          recipeName: ingredient.recipeName || recipeName,
          isSeasoning: ingredient.isSeasoning || isSeasoning || false,
          completed: Boolean(ingredient.completed),
          timestamp: ingredient.timestamp || timestamp
        };

        if (newItem.recipeId) {
          newItem.recipeIds = [newItem.recipeId];
          newItem.recipeNames = [newItem.recipeName || '未分類'];
        } else {
          newItem.recipeIds = [];
          newItem.recipeNames = [];
        }

        targetArray.push(newItem);
        added = true;
      }
    }

    if (added) {
      try {
        await this.saveShoppingList();
        await this.renderShoppingList();
      } catch (error) {
        console.error('買い物リストの更新中にエラーが発生しました:', error);
        throw error;
      }
    }

    return added;
  }

  // 「買い物完了」ボタンの有効/無効を切り替える
  updateCompleteShoppingButton() {
    const completeButton = document.getElementById('complete-shopping');
    if (!completeButton) return;
    
    // 買い物リストが空の場合はボタンを無効化
    if (this.shoppingList.length === 0) {
      completeButton.disabled = true;
      completeButton.textContent = '買い物完了';
      return;
    }
    
    // すべてのアイテムを結合して処理
    const allItems = [...(this.shoppingList.ingredients || []), ...(this.shoppingList.customItems || [])];
    
    // チェックされたアイテムの数をカウント
    const completedCount = allItems.filter(item => item && item.completed).length;
    const totalCount = allItems.length;
    
    // ボタンの状態を更新（すべてチェックされている場合のみ有効）
    completeButton.disabled = completedCount !== totalCount;
    completeButton.textContent = '買い物完了';
    
    // ボタンのクラスを更新して視覚的なフィードバックを提供
    if (completedCount === totalCount) {
      completeButton.classList.add('all-completed');
    } else {
      completeButton.classList.remove('all-completed');
    }
  }

  // 履歴アイテムのレンダリング用ヘルパー関数
  renderHistoryItem(item) {
    const name = item.name || '名称不明';
    const quantity = item.quantity ? ` ${item.quantity}` : '';
    const unit = item.unit && item.unit !== 'undefined' ? item.unit : '';
    return `
      <li class="history-item">
        <span class="item-name">${this.escapeHtml(name)}</span>
        <span class="item-quantity">${quantity}${unit}</span>
      </li>`;
  }

  // 履歴を表示
  renderShoppingHistory() {
    console.log('[DEBUG] Rendering shopping history. Current history:', this.shoppingHistory);
    
    const historyList = document.getElementById('history-modal-list');
    if (!historyList) {
      console.error('[ERROR] History list element not found');
      return;
    }

    if (!Array.isArray(this.shoppingHistory) || this.shoppingHistory.length === 0) {
      console.log('[DEBUG] No history to display');
      historyList.innerHTML = '<p class="empty-message">履歴がありません</p>';
      return;
    }

    try {
      historyList.innerHTML = this.shoppingHistory.map(history => {
        try {
          console.log('[DEBUG] Processing history entry:', history);
          
          // 日付の処理
          const date = history.date ? new Date(history.date) : new Date();
          const formattedDate = history.date 
            ? `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
            : '日付不明';
          
          // アイテムの処理
          const items = Array.isArray(history.items) ? history.items : [];
          console.log('[DEBUG] History items:', items);
          
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
  }

  // アイテムが調味料かどうかを判定するヘルパー関数
  isSeasoningItem(item) {
    // isSeasoningフラグがある場合はそれを使用（明示的にtrue/falseが設定されている場合のみ）
    if (item.isSeasoning === true || item.isSeasoning === false) {
      return item.isSeasoning;
    }
    
    // 互換性のため、名前からも判定
    const name = (item.name || '').toLowerCase();
    const seasoningKeywords = [
      '塩', 'こしょう', '醤油', 'みりん', '酒', '砂糖', '酢', '油', 'オイル', 
      'ソース', 'ケチャップ', 'マヨネーズ', 'みそ', 'だし', 'スパイス', '胡椒', 
      'わさび', 'からし', 'はちみつ', 'メープルシロップ', 'ソース', 'めんつゆ', 
      'ポン酢', 'ごま油', 'ラー油', '豆板醤', '甜麺醤', 'オイスターソース', 
      'ウスターソース', '中濃ソース', 'とんかつソース', 'おろしポン酢', 'ぽん酢',
      'ぽんず', 'ポンズ', 'ぽんず', 'めんつゆ', '麺つゆ', 'だしの素', '顆粒だし',
      'コンソメ', 'ブイヨン', 'ガーリックパウダー', 'バジル', 'オレガノ', 'タイム',
      'ローズマリー', 'パセリ', 'バジリコ', 'シナモン', 'ナツメグ', 'クミン', 'コリアンダー',
      'ターメリック', 'カレー粉', 'チリパウダー', 'パプリカパウダー', 'ガーリックチップ',
      'ガーリックソルト', 'ハーブソルト', '岩塩', '粗挽き胡椒', 'ブラックペッパー',
      'ホワイトペッパー', '赤唐辛子', '七味唐辛子', '一味唐辛子', '山椒', 'わさび',
      'からし', 'マスタード', '粒マスタード', 'ケチャップ', 'ウスターソース', 'とんかつソース',
      'お好みソース', 'デミグラスソース', '焼肉のたれ', 'すき焼きのたれ', 'めんつゆ',
      '白だし', '和風だし', '中華だし', '鶏がらスープの素', 'コンソメキューブ',
      'ブイヨンキューブ', '顆粒コンソメ', '顆粒和風だし', '顆粒中華だし', '粉末だし',
      '粉末和風だし', '粉末中華だし', '粉末コンソメ', '粉末ブイヨン', '粉末ガーリック',
      '粉末にんにく', '粉末しょうが', '粉末玉ねぎ', '粉末にんじん', '粉末ねぎ', '粉末パセリ',
      '粉末バジル', '粉末オレガノ', '粉末タイム', '粉末ローズマリー', '粉末セージ',
      '粉末クミン', '粉末コリアンダー', '粉末ターメリック', '粉末カレー', '粉末チリ',
      '粉末パプリカ', '粉末ガーリックパウダー', '粉末にんにくパウダー', '粉末しょうがパウダー',
      '粉末玉ねぎパウダー', '粉末にんじんパウダー', '粉末ねぎパウダー', '粉末パセリパウダー',
      '粉末バジルパウダー', '粉末オレガノパウダー', '粉末タイムパウダー', '粉末ローズマリーパウダー',
      '粉末セージパウダー', '粉末クミンパウダー', '粉末コリアンダーパウダー', '粉末ターメリックパウダー',
      '粉末カレーパウダー', '粉末チリパウダー', '粉末パプリカパウダー', '粉末ガーリックソルト',
      '粉末ハーブソルト', '粉末岩塩', '粉末粗挽き胡椒', '粉末ブラックペッパー', '粉末ホワイトペッパー',
      '粉末赤唐辛子', '粉末七味唐辛子', '粉末一味唐辛子', '粉末山椒', '粉末わさび', '粉末からし',
      '粉末マスタード', '粉末ケチャップ', '粉末ウスターソース', '粉末とんかつソース', '粉末お好みソース',
      '粉末デミグラスソース', '粉末焼肉のたれ', '粉末すき焼きのたれ', '粉末めんつゆ', '粉末白だし',
      '粉末和風だし', '粉末中華だし', '粉末鶏がらスープの素', '粉末コンソメキューブ', '粉末ブイヨンキューブ',
      '粉末顆粒コンソメ', '粉末顆粒和風だし', '粉末顆粒中華だし', '顆粒和風だし', '顆粒中華だし',
      '顆粒コンソメ', '顆粒ブイヨン', '顆粒ガーリック', '顆粒にんにく', '顆粒しょうが', '顆粒玉ねぎ',
      '顆粒にんじん', '顆粒ねぎ', '顆粒パセリ', '顆粒バジル', '顆粒オレガノ', '顆粒タイム',
      '顆粒ローズマリー', '顆粒セージ', '顆粒クミン', '顆粒コリアンダー', '顆粒ターメリック', '顆粒カレー',
      '顆粒チリ', '顆粒パプリカ', '顆粒ガーリックパウダー', '顆粒にんにくパウダー', '顆粒しょうがパウダー',
      '顆粒玉ねぎパウダー', '顆粒にんじんパウダー', '顆粒ねぎパウダー', '顆粒パセリパウダー',
      '顆粒バジルパウダー', '顆粒オレガノパウダー', '顆粒タイムパウダー', '顆粒ローズマリーパウダー',
      '顆粒セージパウダー', '顆粒クミンパウダー', '顆粒コリアンダーパウダー', '顆粒ターメリックパウダー',
      '顆粒カレーパウダー', '顆粒チリパウダー', '顆粒パプリカパウダー', '顆粒ガーリックソルト',
      '顆粒ハーブソルト', '顆粒岩塩', '顆粒粗挽き胡椒', '顆粒ブラックペッパー', '顆粒ホワイトペッパー',
      '顆粒赤唐辛子', '顆粒七味唐辛子', '顆粒一味唐辛子', '顆粒山椒', '顆粒わさび', '顆粒からし',
      '顆粒マスタード', '顆粒ケチャップ', '顆粒ウスターソース', '顆粒とんかつソース', '顆粒お好みソース',
      '顆粒デミグラスソース', '顆粒焼肉のたれ', '顆粒すき焼きのたれ', '顆粒めんつゆ', '顆粒白だし',
      '顆粒和風だし', '顆粒中華だし', '顆粒鶏がらスープの素', '顆粒コンソメキューブ', '顆粒ブイヨンキューブ'
    ];
    
    // 調味料キーワードに一致するか確認
    const isSeasoning = seasoningKeywords.some(keyword => name.includes(keyword.toLowerCase()));
    
    // デバッグ用ログ
    if (isSeasoning) {
      console.log(`[DEBUG] 調味料と判定: ${name} (${item.name})`);
    }
    
    return isSeasoning;
  }

  // 履歴を削除
  removeHistoryEntry(historyId) {
    // 型を統一して比較（数値と文字列の両方に対応）
    const idToRemove = typeof historyId === 'string' ? parseInt(historyId, 10) : historyId;
    console.log('[DEBUG] Removing history entry. ID:', idToRemove, 'Type:', typeof idToRemove);
    console.log('[DEBUG] Current history before removal:', this.shoppingHistory);
    
    this.shoppingHistory = this.shoppingHistory.filter(entry => {
      const entryId = typeof entry.id === 'string' ? parseInt(entry.id, 10) : entry.id;
      return entryId !== idToRemove;
    });
    
    console.log('[DEBUG] History after removal:', this.shoppingHistory);
    this.saveShoppingHistory();
    this.renderShoppingHistory();
    this.showMessage('履歴を削除しました', 'success');
  }

  // すべての履歴を削除
  clearAllHistory() {
    if (confirm('すべての買い物履歴を削除しますか？この操作は元に戻せません。')) {
      this.shoppingHistory = [];
      this.saveShoppingHistory();
      this.renderShoppingHistory();
      this.showMessage('すべての履歴を削除しました', 'success');
    }
  }

  // お気に入り切り替え
  toggleFavorite(id) {
    const idx = this.recipes.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.recipes[idx].favorite = !this.recipes[idx].favorite;
      this.saveRecipes();
      this.renderRecipes();
    }
  }
  
  // カスタムアイテムを削除するメソッド（重複のため削除）
  
  // カスタムアイテムをレンダリングするメソッド
  renderCustomItems() {
    const container = document.getElementById('custom-items-list');
    if (!container) return;
    
    if (this.customItems.length === 0) {
      container.innerHTML = '<p class="empty-message">登録されたアイテムがありません</p>';
      return;
    }
    
    container.innerHTML = `
      <div class="custom-items-container">
        ${this.customItems.map(item => `
          <div class="custom-item" data-id="${item.id}">
            <input type="checkbox" class="recipe-checkbox" value="${item.id}" ${item.completed ? 'checked' : ''}>
            <div class="item-details">
              <div class="item-name">${this.escapeHtml(item.name)}</div>
              ${item.quantity ? `<div class="item-quantity">${this.escapeHtml(item.quantity)}</div>` : ''}
            </div>
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
  }
  
  // HTMLエスケープ用ヘルパー関数
  escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 数量を合計するメソッド
  sumQuantities(qty1, qty2) {
    console.log('[DEBUG] sumQuantities called with:', { qty1, qty2 });
    
    // どちらかが空の場合は、空でない方の数量を返す
    if (!qty1 || qty1.trim() === '') return qty2;
    if (!qty2 || qty2.trim() === '') return qty1;
    
    // 両方が数値として解釈可能な場合、数値として加算
    const num1 = parseFloat(qty1);
    const num2 = parseFloat(qty2);
    
    if (!isNaN(num1) && !isNaN(num2)) {
      // 元の文字列が数値として完全に一致する場合のみ数値として処理
      if (num1.toString() === qty1.trim() && num2.toString() === qty2.trim()) {
        const result = (num1 + num2).toString();
        console.log('[DEBUG] 数値として加算:', { qty1, qty2, result });
        return result;
      }
    }
    
      // 同じ文字列の場合は「+」で連結
    if (qty1.trim() === qty2.trim()) {
      // 既に「+」が含まれている場合は、そのまま連結
      if (qty1.includes('+')) {
        const result = `${qty1}+${qty2}`;
        console.log('[DEBUG] 同じ文字列（+付き）を連結:', { qty1, qty2, result });
        return result;
      }
      // 同じ文字列の場合は「+」で連結
      const result = `${qty1}+${qty2}`;
      console.log('[DEBUG] 同じ文字列を「+」で連結:', { qty1, qty2, result });
      return result;
    }
    
    // 異なる文字列の場合は「+」で連結
    const result = `${qty1}+${qty2}`;
    console.log('[DEBUG] 文字列として連結:', { qty1, qty2, result });
    return result;
  }

  // トーストメッセージを画面下部に表示する汎用関数
  showMessage(message, type = "") {
    // 既存トーストがあれば削除
    let toast = document.getElementById('toast-message');
    if (toast) toast.remove();
    
    // 新しいトーストを作成
    toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.className = 'toast-message';
    
    // タイプに応じたクラスを追加
    if (type === "success") {
      toast.classList.add("toast-success");
    } else if (type === "error") {
      toast.classList.add("toast-error");
    }
    
    // メッセージを設定して表示
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // アニメーション用のクラスを追加
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);
    
    // 一定時間後に非表示にして削除
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => { 
        if (toast && toast.parentNode) {
          toast.remove(); 
        }
      }, 400);
    }, 1800);
  }

  // 履歴モーダルを表示
  showHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (!modal) return;
    
    this.renderShoppingHistory();
    modal.style.display = 'flex';
    modal.dispatchEvent(new Event('show'));
  }

  // 履歴モーダルを非表示
  hideHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (!modal) return;
    
    modal.style.display = 'none';
    modal.dispatchEvent(new Event('hide'));
  }

  // この重複するメソッドは削除します（IndexedDBを使用する方に統一）

  // アプリケーションの初期化
  async init() {
    console.log('[DEBUG] init() 開始');
    try {
      // データベースの初期化が完了するまで待機
      while (!this.isInitialized) {
        console.log('[DEBUG] データベースの初期化を待機中...');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log('[DEBUG] データベースの初期化が完了しました');
      
      // ストレージ使用量の表示を初期化
      console.log('[DEBUG] ストレージ使用量の初期化を開始');
      await this.updateStorageUsage();
      
      // ストレージが変更されたときに使用量を更新
      window.addEventListener('storage', () => {
        console.log('[DEBUG] ストレージ変更を検知、使用量を更新します');
        this.updateStorageUsage();
      });
      
      // ストレージ使用量を定期的に更新（5分ごと）
      setInterval(() => {
        console.log('[DEBUG] 定期ストレージ使用量更新を実行');
        this.updateStorageUsage();
      }, 5 * 60 * 1000);
      
      // その他の初期化処理
      console.log('[DEBUG] イベントリスナーを設定します');
      this.setupEventListeners();
      
      console.log('[DEBUG] レシピ一覧をレンダリングします');
      this.renderRecipes();
      
      console.log('[DEBUG] 買い物リストをレンダリングします');
      this.renderShoppingList();
      
      console.log('[DEBUG] カスタムアイテムをレンダリングします');
      this.renderCustomItems();
      
      console.log('[DEBUG] 初期化処理が完了しました');
    } catch (error) {
      console.error('[ERROR] 初期化中にエラーが発生しました:', error);
      throw error;
    }
  }
}

// ストレージ使用量表示のトグル機能
function toggleStorageUsage() {
  const storageUsage = document.getElementById('storage-usage');
  if (storageUsage.style.display === 'none' || !storageUsage.style.display) {
    storageUsage.style.display = 'inline';
    // 表示時に最新の使用量を取得して表示
    if (window.app && window.app.updateStorageUsage) {
      window.app.updateStorageUsage();
    }
  } else {
    storageUsage.style.display = 'none';
  }
}

// アプリケーションの初期化後にイベントリスナーを設定
async function initializeApp() {
  try {
    console.log('[DEBUG] アプリケーションの初期化を開始します');
    
    // アプリケーションのインスタンスを作成
    const app = new RecipeApp();
    window.app = app;
    
    // データベースの初期化が完了するまで待機
    console.log('[DEBUG] データベースの初期化を待機中...');
    
    // データベースの初期化が完了するのを待つ
    await new Promise((resolve, reject) => {
      const checkInitialization = () => {
        if (app.isInitialized) {
          console.log('[DEBUG] データベースの初期化が完了しました');
          resolve();
        } else {
          // 初期化が完了していない場合は少し待って再試行
          setTimeout(checkInitialization, 100);
        }
      };
      
      // 一定時間待っても初期化が完了しない場合はエラー
      const timeout = setTimeout(() => {
        reject(new Error('データベースの初期化がタイムアウトしました'));
      }, 5000); // 5秒でタイムアウト
      
      checkInitialization();
    });
    
    // アプリケーションの初期化を実行
    console.log('[DEBUG] アプリケーションの初期化を開始します');
    await app.init();
    
    // 買い物リストを表示
    if (app.renderShoppingList) {
      app.renderShoppingList();
      

    } else {
      console.error('[ERROR] renderShoppingList メソッドが見つかりません');
    }
    
    // ストレージ使用量表示ボタンにイベントリスナーを設定
    const storageStatus = document.getElementById('storage-status');
    if (storageStatus) {
      storageStatus.addEventListener('click', toggleStorageUsage);
    }
    
    // ゴミ箱ボタンのイベントリスナーを設定
    app.setupClearButton();
    
    // すべてのレシピを削除ボタンのイベントリスナーを設定
    const deleteAllRecipesBtn = document.getElementById('delete-all-recipes');
    if (deleteAllRecipesBtn) {
      deleteAllRecipesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        app.deleteAllRecipes();
      });
    }
    
    // キャンセルボタンのイベントリスナーを設定
    const cancelButton = document.getElementById('cancel-edit');
    if (cancelButton) {
      cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        app.cancelEdit();
      });
    }
    
    // その他フォームのサブミットを防止し、カスタムハンドラを設定
    const customItemForm = document.getElementById('custom-item-form');
    if (customItemForm) {
      customItemForm.addEventListener('submit', (e) => {
        e.preventDefault(); // フォームのデフォルトの送信を防止
        
        // フォームの値を取得
        const itemName = document.getElementById('item-name').value.trim();
        const itemQuantity = document.getElementById('item-quantity').value.trim();
        
        if (!itemName) {
          alert('アイテム名を入力してください');
          return;
        }
        
        // カスタムアイテムを追加
        app.addCustomItem({
          id: Date.now().toString(),
          name: itemName,
          quantity: itemQuantity || '',
          completed: false
        });
        
        // フォームをリセット
        customItemForm.reset();
      });
    }
    
    console.log('[DEBUG] アプリケーションの初期化が完了しました');
  } catch (error) {
    console.error('[ERROR] アプリケーションの初期化に失敗しました:', error);
    
    // ユーザーにエラーを表示
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = 'アプリケーションの初期化に失敗しました。ページを再読み込みしてください。';
    errorMessage.style.color = 'red';
    errorMessage.style.padding = '20px';
    errorMessage.style.textAlign = 'center';
    document.body.insertBefore(errorMessage, document.body.firstChild);
  }
}

// アプリケーションを初期化
window.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});
