// mealplan.js - 献立モード機能モジュール
// 7日分の献立（1日1品）を登録し、材料をまとめて買い物リストに追加する

export const mealPlanMethods = {

  MEAL_PLAN_DAYS: 7,

  // 献立データを7枠に正規化（recipeId or null の配列）
  normalizeMealPlan(data) {
    const ids = Array.isArray(data) ? data : [];
    const plan = [];
    for (let i = 0; i < this.MEAL_PLAN_DAYS; i++) {
      const id = ids[i];
      plan.push(id != null ? id : null);
    }
    return plan;
  },

  // IndexedDBのshoppingListストアに献立を保存（type='mealPlan'、スキーマ変更なし）
  async saveMealPlan() {
    const record = {
      type: 'mealPlan',
      data: { recipes: this.mealPlan || [] },
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

  // 献立関連のイベントリスナー設定
  setupMealPlanEvents() {
    // 日付行のクリック（レシピ選択 or 解除）
    const daysContainer = document.getElementById('meal-plan-days');
    if (daysContainer) {
      daysContainer.addEventListener('click', (e) => {
        const clearBtn = e.target.closest('.meal-day-clear');
        if (clearBtn) {
          e.stopPropagation();
          this.clearMealDay(parseInt(clearBtn.dataset.day, 10));
          return;
        }
        const dayEl = e.target.closest('.meal-day');
        if (dayEl) {
          this.openMealPicker(parseInt(dayEl.dataset.day, 10));
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
  },

  // 日付ラベル（今日/明日/M/D(曜)）
  mealPlanDayLabel(index) {
    const d = new Date();
    d.setDate(d.getDate() + index);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    if (index === 0) return '今日';
    if (index === 1) return '明日';
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`;
  },

  // 献立タブの描画
  renderMealPlan() {
    const container = document.getElementById('meal-plan-days');
    if (!container) return;
    if (!Array.isArray(this.mealPlan)) {
      this.mealPlan = this.normalizeMealPlan(null);
    }

    const plannedCount = this.mealPlan.filter(id => id != null).length;
    const addBtn = document.getElementById('meal-plan-add-shopping');
    if (addBtn) addBtn.disabled = plannedCount === 0;

    container.innerHTML = this.mealPlan.map((recipeId, i) => {
      const recipe = recipeId != null ? this.recipes.find(r => String(r.id) === String(recipeId)) : null;
      const name = recipe ? recipe.name : (recipeId != null ? '（削除されたレシピ）' : '');
      const label = this.mealPlanDayLabel(i);
      return `
        <div class="meal-day ${recipeId != null ? 'assigned' : ''}" data-day="${i}">
          <div class="meal-day-date">${label}</div>
          <div class="meal-day-recipe">${name ? this.escapeHtml(name) : '<span class="meal-day-empty">タップして選択</span>'}</div>
          ${recipeId != null ? `<button type="button" class="meal-day-clear" data-day="${i}" title="割り当てを解除">×</button>` : ''}
        </div>
      `;
    }).join('');
  },

  // レシピ選択モーダルを開く
  openMealPicker(dayIndex) {
    this.mealPickerDay = dayIndex;

    const subtitle = document.getElementById('meal-picker-subtitle');
    if (subtitle) subtitle.textContent = `${this.mealPlanDayLabel(dayIndex)} のレシピ`;

    const list = document.getElementById('meal-picker-list');
    if (!list) return;

    if (this.recipes.length === 0) {
      list.innerHTML = '<p class="meal-picker-empty">レシピがありません。先にレシピを登録してください。</p>';
    } else {
      list.innerHTML = this.recipes.map(r => `
        <button type="button" class="meal-picker-item" data-recipe-id="${r.id}">
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
    this.mealPickerDay = null;
  },

  // 日付にレシピを割り当てる
  async assignMealRecipe(recipeId) {
    if (this.mealPickerDay == null) return;
    this.mealPlan[this.mealPickerDay] = recipeId;
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
  async clearMealDay(dayIndex) {
    if (!Array.isArray(this.mealPlan)) return;
    this.mealPlan[dayIndex] = null;
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
    if (!Array.isArray(this.mealPlan) || this.mealPlan.every(id => id == null)) return;
    if (!confirm('献立をすべてクリアしますか？')) return;
    this.mealPlan = this.normalizeMealPlan(null);
    try {
      await this.saveMealPlan();
      this.renderMealPlan();
      this.showMessage('献立をクリアしました');
    } catch (error) {
      console.error('[ERROR] 献立の保存に失敗しました:', error);
      this.showMessage('献立のクリアに失敗しました', 'error');
    }
  },

  // 献立の材料を買い物リストに追加（既存リストは消さず追加。数量倍率は×1固定）
  async addMealPlanToShopping() {
    if (!Array.isArray(this.mealPlan)) return;

    const recipeIds = [...new Set(this.mealPlan.filter(id => id != null))];
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

    this.showMessage(`${plannedRecipes.length}品の材料を買い物リストに追加しました`);
    this.switchTab('shopping');
  }

};
