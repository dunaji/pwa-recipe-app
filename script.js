import { escapeHtml as escapeHtmlUtil, sumQuantities as sumQuantitiesUtil, isSeasoningItem as isSeasoningItemUtil } from './utils.js';
import { historyMethods } from './history.js';
import { shoppingMethods } from './shopping.js';
import { customItemsMethods } from './custom_items.js';
import { recipesMethods } from './recipes.js';
import { settingsMethods } from './settings.js';

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
      const customItemsRecords = shoppingLists.filter(item => item && item.type === 'customItems');
      
      // デバッグ用ログ

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

      // カスタムアイテムの処理（type='customItems' のレコードをすべてマージ。
      // 旧形式のautoIncrement idレコードと新形式のid='customItems'レコードが
      // 混在していても取りこぼさない）
      {
        try {
          const allItems = [];
          const existingIds = new Set();

          for (const record of customItemsRecords) {
            const items = Array.isArray(record.items) ? record.items : [];
            const legacy = Array.isArray(record.data) ? record.data : [];
            for (const item of [...items, ...legacy]) {
              if (!item || typeof item !== 'object') continue;
              // idが無いアイテムは重複判定できないためそのまま残す
              if (item.id == null || !existingIds.has(item.id)) {
                allItems.push(item);
                if (item.id != null) existingIds.add(item.id);
              }
            }
          }

          this.customItems = allItems;
          this.renderCustomItems();

        } catch (error) {
          console.error('カスタムアイテムの読み込み中にエラーが発生しました:', error);
          this.customItems = [];
          this.shoppingList.customItems = [];
        }
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
      console.error('ストレージ使用量の更新に失敗しました:', error);
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
      console.error('タブ切り替え中にエラーが発生しました:', error);
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

    // 買い物リスト初期化ボタン（削除範囲を選ぶメニューを開く）
    this.addEventIfExists('clear-shopping', 'click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('clear-shopping-menu');
      if (menu) menu.hidden = !menu.hidden;
    });
    this.addEventIfExists('clear-shopping-list-only', 'click', () => this.clearShoppingList(false));
    this.addEventIfExists('clear-shopping-all', 'click', () => this.clearShoppingList(true));
    // メニュー外クリックで閉じる
    document.addEventListener('click', () => {
      const menu = document.getElementById('clear-shopping-menu');
      if (menu) menu.hidden = true;
    });

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




  // 買い物を完了して、完了したアイテムを削除
  isCompletingShopping = false;
  
  




// 買い物を追加する関数（非同期化）
  // アイテムが調味料かどうかを判定するヘルパー関数
  isSeasoningItem(item) {
    return isSeasoningItemUtil(item);
  }

  // 詳細モーダル表示中は背面スクロールを禁止する
  setupDetailModalScrollLock() {
    const modal = document.getElementById('recipe-detail-modal');
    const closeBtn = document.getElementById('close-detail-modal');
    if (!modal || !closeBtn) return;

    const preventScroll = () => { document.body.style.overflow = 'hidden'; };
    const allowScroll = () => { document.body.style.overflow = ''; };

    modal.addEventListener('show', preventScroll);
    modal.addEventListener('hide', allowScroll);

    const observer = new MutationObserver(() => {
      if (modal.style.display === 'flex') preventScroll();
      else allowScroll();
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['style'] });

    closeBtn.addEventListener('click', allowScroll);
    window.addEventListener('beforeunload', allowScroll);
  }

  // HTMLエスケープ用ヘルパー関数
  escapeHtml(unsafe) {
    return escapeHtmlUtil(unsafe);
  }

  // 数量を合計するメソッド
  sumQuantities(qty1, qty2) {
    return sumQuantitiesUtil(qty1, qty2);
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

  // この重複するメソッドは削除します（IndexedDBを使用する方に統一）

  // アプリケーションの初期化
  async init() {
    try {
      // データベースの初期化が完了するまで待機
      while (!this.isInitialized) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      
      // ストレージ使用量の表示を初期化
      await this.updateStorageUsage();
      
      // ストレージが変更されたときに使用量を更新
      window.addEventListener('storage', () => {
        this.updateStorageUsage();
      });
      
      // ストレージ使用量を定期的に更新（5分ごと）
      setInterval(() => {
        this.updateStorageUsage();
      }, 5 * 60 * 1000);
      
      // その他の初期化処理
      this.setupEventListeners();
      
      this.renderRecipes();
      
      this.renderShoppingList();
      
      this.renderCustomItems();
      this.setupDetailModalScrollLock();
      this.setupDataSettings();
      
    } catch (error) {
      console.error('[ERROR] 初期化中にエラーが発生しました:', error);
      throw error;
    }
  }
}

// 分割したモジュールのメソッドをプロトタイプに合成
Object.assign(RecipeApp.prototype, historyMethods, shoppingMethods, customItemsMethods, recipesMethods, settingsMethods);

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
    
    // アプリケーションのインスタンスを作成
    const app = new RecipeApp();
    window.app = app;
    
    // データベースの初期化が完了するまで待機
    
    // データベースの初期化が完了するのを待つ
    await new Promise((resolve, reject) => {
      const checkInitialization = () => {
        if (app.isInitialized) {
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
    
    // 保存されたタブを復元
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab) {
      const tabButton = document.querySelector(`[data-tab="${savedTab}"]`);
      if (tabButton) {
        tabButton.click();
      }
      // 一度だけ実行するので削除
      localStorage.removeItem('activeTab');
    }
    
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

// Service Workerの登録（PWA/オフライン対応）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch((error) => {
        console.warn('[WARN] Service Workerの登録に失敗しました:', error);
      });
  });
}
