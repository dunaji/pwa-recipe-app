// mealplan.js - 献立モード機能モジュール
// 実日付で献立（1日1品）を管理し、材料をまとめて買い物リストに反映する
// 日付が過ぎると自動的に表示窓が進み、過去の献立は消える

export const mealPlanMethods = {

  MEAL_PLAN_DAYS: 7,

  // 日付ユーティリティ
  _mealPlanToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },
  _mealPlanAddDays(base, n) {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  },
  _mealPlanDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  _mealPlanParseDate(str) {
    if (!str || typeof str !== 'string') return null;
    const [y, m, d] = str.split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  },

  // 献立データを正規化
  // 新形式: [{date:'YYYY-MM-DD', recipeId}] / 旧形式: [recipeId|null, ...]（位置=今日からの日数）
  // 返り値は今日以降のエントリのみ（過去分は除去）
  normalizeMealPlan(data) {
    const today = this._mealPlanToday();
    const entries = [];
    const seenDates = new Set();

    const raw = Array.isArray(data) ? data : [];
    raw.forEach((item, idx) => {
      if (item && typeof item === 'object' && item.date) {
        // 新形式
        const date = this._mealPlanParseDate(item.date);
        if (!date || date < today) return; // 過去は捨てる
        const dateStr = this._mealPlanDateStr(date);
        if (seenDates.has(dateStr)) return;
        seenDates.add(dateStr);
        entries.push({ date: dateStr, recipeId: item.recipeId != null ? item.recipeId : null });
      } else if (item != null) {
        // 旧形式（IDのみの配列）: 位置を今日からの日数として変換
        const date = this._mealPlanAddDays(today, idx);
        const dateStr = this._mealPlanDateStr(date);
        if (seenDates.has(dateStr)) return;
        seenDates.add(dateStr);
        entries.push({ date: dateStr, recipeId: item });
      }
    });

    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  },

  // 指定日の献立エントリを取得（なければ作って返す）
  _mealPlanEntryFor(dateStr) {
    if (!Array.isArray(this.mealPlan)) this.mealPlan = [];
    let entry = this.mealPlan.find(e => e.date === dateStr);
    if (!entry) {
      entry = { date: dateStr, recipeId: null };
      this.mealPlan.push(entry);
      this.mealPlan.sort((a, b) => a.date.localeCompare(b.date));
    }
    return entry;
  },

  // IndexedDBのshoppingListストアに献立を保存（type='mealPlan'、スキーマ変更なし）
  async saveMealPlan() {
    // 保存前に過去分を除去
    this.mealPlan = this.normalizeMealPlan(this.mealPlan);

    const record = {
      type: 'mealPlan',
      data: { entries: this.mealPlan },
      timestamp: new Date().getTime()
    };

    const transaction = window.recipeDB.db.transaction(['shoppingList'], 'readwrite');
    const store = transaction.objectStore('shoppingList');

    const existing = await new Promise((resolve, reject) => {
      const req = store.index('type').get('mealPlan');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (existing) record.id = existing.id;

    await new Promise((resolve, reject) => {
      const req = existing ? store.put(record) : store.add(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  // 日付ラベル（今日/明日/M/D(曜)）
  mealPlanDayLabel(dateStr, index) {
    if (index === 0) return '今日';
    if (index === 1) return '明日';
    const d = this._mealPlanParseDate(dateStr);
    if (!d) return dateStr;
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`;
  },

  // 献立タブの描画（今日から7日分）
  renderMealPlan() {
    const container = document.getElementById('meal-plan-days');
    if (!container) return;
    if (!Array.isArray(this.mealPlan)) {
      this.mealPlan = this.normalizeMealPlan(null);
    }

    const today = this._mealPlanToday();
    const plannedCount = this.mealPlan.filter(e => e.recipeId != null).length;
    const addBtn = document.getElementById('meal-plan-add-shopping');
    if (addBtn) addBtn.disabled = plannedCount === 0;

    let html = '';
    for (let i = 0; i < this.MEAL_PLAN_DAYS; i++) {
      const date = this._mealPlanAddDays(today, i);
      const dateStr = this._mealPlanDateStr(date);
      const entry = this.mealPlan.find(e => e.date === dateStr);
      const recipeId = entry ? entry.recipeId : null;
      const recipe = recipeId != null
        ? this.recipes.find(r => String(r.id) === String(recipeId))
        : null;
      const name = recipe ? recipe.name : (recipeId != null ? '（削除されたレシピ）' : '');
      const label = this.mealPlanDayLabel(dateStr, i);

      html += `
        <div class="meal-day ${recipeId != null ? 'assigned' : ''}" data-date="${dateStr}">
          <div class="meal-day-date">${label}</div>
          <div class="meal-day-recipe">${name ? this.escapeHtml(name) : '<span class="meal-day-empty">タップして選択</span>'}</div>
          ${recipeId != null ? `<button type="button" class="meal-day-clear" data-date="${dateStr}" title="割り当てを解除">×</button>` : ''}
        </div>
      `;
    }
    container.innerHTML = html;
  },

  // レシピ選択モーダルを開く
  openMealPicker(dateStr) {
    this.mealPickerDate = dateStr;

    const subtitle = document.getElementById('meal-picker-subtitle');
    if (subtitle) subtitle.textContent = `${this.mealPlanDayLabel(dateStr)} のレシピ`;

    const list = document.getElementById('meal-picker-list');
    if (!list) return;

    if (this.recipes.length === 0) {
      list.innerHTML = '<p class="meal-picker-empty">レシピがありません。先にレシピを登録してください。</p>';
    } else {
      list.innerHTML = this.recipes.map(r => `
        <button type="button" class="meal-picker-item" data-recipe-id="${this.escapeHtml(String(r.id))}">
          <span class="meal-picker-item-name">${this.escapeHtml(r.name)}</span>
          ${r.category ? `<span class="recipe-category-badge">${this.escapeHtml(r.category)}</span>` : ''}
        </button>
      `).join('');
    }

    const modal = document.getElementById('meal-picker-modal');
    if (modal) modal.style.display = 'flex';
  },

  hideMealPicker() {
    const modal = document.getElementById('meal-picker-modal');
    if (modal) modal.style.display = 'none';
    this.mealPickerDate = null;
  },

  // 日付にレシピを割り当てる
  async assignMealRecipe(recipeId) {
    if (!this.mealPickerDate) return;
    const entry = this._mealPlanEntryFor(this.mealPickerDate);
    entry.recipeId = recipeId;
    this.hideMealPicker();
    try {
      await this.saveMealPlan();
      this.renderMealPlan();
    } catch (error) {
      console.error('[ERROR] 献立の保存に失敗しました:', error);
      this.showMessage('献立の保存に失敗しました', 'error');
    }
  },

  // 1日分の割り当てを解除
  async clearMealDay(dateStr) {
    if (!Array.isArray(this.mealPlan)) return;
    const entry = this.mealPlan.find(e => e.date === dateStr);
    if (entry) entry.recipeId = null;
    this.mealPlan = this.mealPlan.filter(e => e.recipeId != null);
    try {
      await this.saveMealPlan();
      this.renderMealPlan();
    } catch (error) {
      console.error('[ERROR] 献立の保存に失敗しました:', error);
      this.showMessage('献立の保存に失敗しました', 'error');
    }
  },

  // 献立をすべてクリア
  async clearMealPlan() {
    if (!Array.isArray(this.mealPlan) || this.mealPlan.length === 0) return;
    if (!confirm('献立をすべてクリアしますか？')) return;
    this.mealPlan = [];
    try {
      await this.saveMealPlan();
      this.renderMealPlan();
      this.showMessage('献立をクリアしました');
    } catch (error) {
      console.error('[ERROR] 献立の保存に失敗しました:', error);
      this.showMessage('献立のクリアに失敗しました', 'error');
    }
  },

  // 献立の材料を買い物リストに反映（材料は献立内容で置き換え。数量倍率は×1固定）
  async addMealPlanToShopping() {
    if (!Array.isArray(this.mealPlan)) return;

    const recipeIds = [...new Set(
      this.mealPlan.filter(e => e.recipeId != null).map(e => e.recipeId)
    )];
    if (recipeIds.length === 0) {
      this.showMessage('献立が登録されていません', 'error');
      return;
    }

    const plannedRecipes = recipeIds
      .map(id => this.recipes.find(r => String(r.id) === String(id)))
      .filter(Boolean);

    if (plannedRecipes.length === 0) {
      this.showMessage('献立のレシピが見つかりません', 'error');
      return;
    }

    // 既存の材料リストを献立の内容で置き換える（その他・カスタム項目は保持）
    const customItems = [...(this.shoppingList.customItems || [])];
    this.shoppingList = { ingredients: [], customItems };

    // 数量倍率セレクトを一時的に×1にして追加（献立はまとめ買い前提のため）
    const multSelect = document.getElementById('shopping-multiplier');
    const prevValue = multSelect ? multSelect.value : null;
    if (multSelect) multSelect.value = '1';

    try {
      for (const recipe of plannedRecipes) {
        const allIngredients = recipe.ingredients || [];

        const ingredients = allIngredients
          .filter(ing => !ing.type || ing.type === 'ingredient')
          .map(ingredient => ({
            ...ingredient,
            recipeName: recipe.name,
            recipeId: recipe.id,
            type: 'ingredient'
          }));
        if (ingredients.length > 0) {
          await this.addToShoppingList(ingredients, recipe.name, recipe.id, false);
        }

        const seasonings = allIngredients
          .filter(ing => ing.type === 'seasoning' || ing.isSeasoning)
          .map(seasoning => ({
            ...seasoning,
            recipeName: recipe.name,
            recipeId: recipe.id,
            isSeasoning: true,
            type: 'seasoning'
          }));
        if (seasonings.length > 0) {
          await this.addToShoppingList(seasonings, recipe.name, recipe.id, true);
        }
      }
    } finally {
      if (multSelect && prevValue !== null) multSelect.value = prevValue;
    }

    this.showMessage(`${plannedRecipes.length}品の材料で買い物リストを更新しました`);
    this.switchTab('shopping');
  },

  // 献立関連のイベントリスナー設定
  setupMealPlanEvents() {
    // 日付行のクリック（レシピ選択 or 解除）
    const daysContainer = document.getElementById('meal-plan-days');
    if (daysContainer) {
      daysContainer.addEventListener('click', (e) => {
        const clearBtn = e.target.closest('.meal-day-clear');
        if (clearBtn) {
          e.stopPropagation();
          this.clearMealDay(clearBtn.dataset.date);
          return;
        }
        const dayEl = e.target.closest('.meal-day');
        if (dayEl) {
          this.openMealPicker(dayEl.dataset.date);
        }
      });
    }

    this.addEventIfExists('meal-plan-add-shopping', 'click', () => this.addMealPlanToShopping());
    this.addEventIfExists('clear-meal-plan', 'click', () => this.clearMealPlan());
    this.addEventIfExists('close-meal-picker', 'click', () => this.hideMealPicker());

    // モーダル背景クリックで閉じる
    const modal = document.getElementById('meal-picker-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.hideMealPicker();
      });
    }

    // レシピ選択リストのクリック（イベントデリゲーション）
    const pickerList = document.getElementById('meal-picker-list');
    if (pickerList) {
      pickerList.addEventListener('click', (e) => {
        const item = e.target.closest('.meal-picker-item');
        if (item) {
          this.assignMealRecipe(item.dataset.recipeId);
        }
      });
    }
  }

};
