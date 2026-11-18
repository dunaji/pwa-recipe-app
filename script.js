import { escapeHtml as escapeHtmlUtil, sumQuantities as sumQuantitiesUtil, isSeasoningItem as isSeasoningItemUtil } from './utils.js';
import { historyMethods } from './history.js';
import { shoppingMethods } from './shopping.js';
import { customItemsMethods } from './custom_items.js';

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




// 買い物を追加する関数（非同期化）
  // アイテムが調味料かどうかを判定するヘルパー関数
  isSeasoningItem(item) {
    return isSeasoningItemUtil(item);
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
      
    } catch (error) {
      console.error('[ERROR] 初期化中にエラーが発生しました:', error);
      throw error;
    }
  }
}

// 分割したモジュールのメソッドをプロトタイプに合成
Object.assign(RecipeApp.prototype, historyMethods, shoppingMethods, customItemsMethods);

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
