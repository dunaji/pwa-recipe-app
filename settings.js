// settings.js - データのエクスポート/インポートなど設定系機能

export const settingsMethods = {

  // エクスポート/インポートボタンのイベント設定
  setupDataSettings() {
    this.addEventIfExists('export-data', 'click', () => this.exportData());
    this.addEventIfExists('import-data-btn', 'click', () => {
      const input = document.getElementById('import-data-file');
      if (input) input.click();
    });
    this.addEventIfExists('import-data-file', 'change', (e) => this.importData(e));
  },

  // 全データをJSONファイルとしてダウンロード
  exportData() {
    try {
      const payload = {
        app: 'natsudon-recipe-app',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          recipes: this.recipes || [],
          shoppingList: this.shoppingList || { ingredients: [], customItems: [] },
          shoppingHistory: this.shoppingHistory || [],
          customItems: this.customItems || [],
          mealPlan: this.mealPlan || []
        }
      };

      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `natsudon-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      this.showMessage('データをエクスポートしました', 'success');
    } catch (error) {
      console.error('[ERROR] データのエクスポートに失敗しました:', error);
      this.showMessage('エクスポートに失敗しました', 'error');
    }
  },

  // JSONファイルからデータを復元（全データを置き換える）
  async importData(e) {
    const file = e.target.files && e.target.files[0];
    // 同じファイルを連続で選択できるようにリセット
    e.target.value = '';
    if (!file) return;

    let payload;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch (error) {
      console.error('[ERROR] インポートファイルの読み込みに失敗しました:', error);
      this.showMessage('ファイルの読み込みに失敗しました。JSONファイルを選択してください', 'error');
      return;
    }

    const data = payload && payload.data;
    if (!data || typeof data !== 'object' ||
        !Array.isArray(data.recipes) ||
        !Array.isArray(data.shoppingHistory) ||
        !Array.isArray(data.customItems)) {
      this.showMessage('このファイルは対応していない形式です', 'error');
      return;
    }

    const sl = data.shoppingList || {};
    const ingredients = Array.isArray(sl.ingredients) ? sl.ingredients : [];
    const slCustom = Array.isArray(sl.customItems) ? sl.customItems : [];

    const counts = [
      `レシピ: ${data.recipes.length}件`,
      `買い物リスト: ${ingredients.length + slCustom.length}件`,
      `買い物履歴: ${data.shoppingHistory.length}件`,
      `その他: ${data.customItems.length}件`,
      `献立: ${Array.isArray(data.mealPlan) ? data.mealPlan.filter(id => id != null).length : 0}品`
    ].join('\n');

    if (!confirm(`現在のデータをすべて削除して、以下の内容に置き換えます。よろしいですか？\n\n${counts}`)) {
      return;
    }

    try {
      // メモリ上の状態を置き換え
      this.recipes = data.recipes;
      this.shoppingList = { ingredients, customItems: slCustom };
      this.shoppingHistory = data.shoppingHistory;
      this.customItems = data.customItems;
      // 献立は旧バックアップに無い場合があるため任意項目として扱う
      this.mealPlan = this.normalizeMealPlan(Array.isArray(data.mealPlan) ? data.mealPlan : null);
      this.selectedRecipes = new Set();
      this.selectedRecipesInfo = [];

      // IndexedDBへ保存（既存の保存関数が正規形で書き込む）
      await this.saveRecipes();
      await this.saveShoppingList();
      await this.saveShoppingHistory();
      await this.saveCustomItems();
      await this.saveMealPlan();

      // 画面を再描画
      this.renderRecipes();
      this.renderShoppingList();
      this.renderCustomItems();
      this.renderMealPlan();
      await this.updateStorageUsage();

      this.showMessage('データをインポートしました', 'success');
    } catch (error) {
      console.error('[ERROR] データのインポートに失敗しました:', error);
      this.showMessage('インポートに失敗しました', 'error');
    }
  }

};
