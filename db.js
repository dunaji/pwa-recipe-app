// IndexedDB データベース管理クラス
class RecipeDB {
  constructor() {
    this.dbName = 'RecipeAppDB';
    this.dbVersion = 1;
    this.db = null;
    this.dbReady = this.initializeDB();
  }
  
  // データベースが利用可能か確認
  async ensureDBReady() {
    if (!this.db) {
      await this.dbReady;
    }
  }

  // データベースの初期化
  initializeDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('データベースのオープンに失敗しました:', event.target.error);
        reject('データベースの初期化に失敗しました');
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      // データベースのバージョンが変更されたとき、または初回作成時に呼ばれる
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // レシピ用のオブジェクトストア
        if (!db.objectStoreNames.contains('recipes')) {
          const recipeStore = db.createObjectStore('recipes', { keyPath: 'id', autoIncrement: true });
          recipeStore.createIndex('name', 'name', { unique: false });
        }

        // 買い物リスト用のオブジェクトストア
        if (!db.objectStoreNames.contains('shoppingList')) {
          const shoppingStore = db.createObjectStore('shoppingList', { keyPath: 'id', autoIncrement: true });
          shoppingStore.createIndex('type', 'type', { unique: false });
        }

        // 画像用のオブジェクトストア
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  // データの追加
  async add(storeName, data) {
    await this.ensureDBReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        console.error(`${storeName}へのデータ追加に失敗しました:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // データの取得
  async get(storeName, id) {
    await this.ensureDBReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName]);
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        console.error(`${storeName}からのデータ取得に失敗しました:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // 全データの取得
  async getAll(storeName) {
    await this.ensureDBReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName]);
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        console.error(`${storeName}からの全データ取得に失敗しました:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // データの更新
  async update(storeName, data) {
    await this.ensureDBReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        console.error(`${storeName}のデータ更新に失敗しました:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // データの削除
  async delete(storeName, id) {
    await this.ensureDBReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => {
        console.error(`${storeName}からのデータ削除に失敗しました:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // 画像の保存（Base64形式）
  async saveImage(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64Data = event.target.result;
          const id = await this.add('images', { data: base64Data, timestamp: new Date().getTime() });
          resolve(id);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
  }

  // 画像の取得
  getImage(id) {
    return this.get('images', id);
  }

  // ストレージ使用量の取得（概算）
  async getStorageUsage() {
    try {
      await this.ensureDBReady();
      const stores = ['recipes', 'shoppingList', 'images'];
      let totalSize = 0;
      
      for (const store of stores) {
        try {
          const items = await this.getAll(store);
          if (items && items.length > 0) {
            totalSize += JSON.stringify(items).length * 2; // UTF-16で計算
          }
        } catch (error) {
          console.error(`Failed to get storage usage for ${store}:`, error);
          // エラーが発生しても処理を続行
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('Error in getStorageUsage:', error);
      return 0; // エラー時は0を返す
    }
  }
}

// データベースインスタンスをエクスポート
const db = new RecipeDB();
window.recipeDB = db;

export default db;
