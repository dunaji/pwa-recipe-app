// shopping.js - script.js から分割された機能モジュール
import { getShoppingCategory, normalizeIngredientKey } from './utils.js';

// RecipeApp.prototype に Object.assign で合成される

export const shoppingMethods = {

  // 買い物アイテムがどのレシピ用かのラベルを返す（複数レシピで合算された場合は「・」区切り）
  _shoppingItemRecipeLabel(item) {
    let names = Array.isArray(item.recipeNames) && item.recipeNames.length > 0
      ? item.recipeNames
      : (item.recipeName ? [item.recipeName] : []);
    names = names.filter(n => n && n !== '未分類');
    return names.length > 0 ? `（${names.join('・')}）` : '';
  },

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
  },

  // 買い物リスト追加ボタンの表示を更新する関数
  updateShoppingButton() {
    const visible = this.selectedRecipes.size > 0 ? 'block' : 'none';
    const addToShoppingBtn = document.getElementById('add-to-shopping');
    if (addToShoppingBtn) {
      addToShoppingBtn.style.display = visible;
    }
    const multiplierSelect = document.getElementById('shopping-multiplier');
    if (multiplierSelect) {
      multiplierSelect.style.display = visible;
      multiplierSelect.classList.toggle('hidden', this.selectedRecipes.size === 0);
    }
  },

  // 買い物リスト追加時の数量倍率を取得（デフォルト×1）
  getShoppingMultiplier() {
    const select = document.getElementById('shopping-multiplier');
    const value = select ? parseFloat(select.value) : 1;
    return isNaN(value) || value <= 0 ? 1 : value;
  },

  // 材料の数量文字列に倍率表記を付与（×1の場合はそのまま）
  applyQuantityMultiplier(ingredients, multiplier) {
    if (!multiplier || multiplier === 1) return ingredients;
    const suffix = '×' + (Number.isInteger(multiplier) ? multiplier : multiplier);
    return ingredients.map(ing => ({
      ...ing,
      quantity: ing.quantity ? `${ing.quantity}${suffix}` : suffix
    }));
  },

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
    
    // 選択されたレシピ情報をクリア
    this.selectedRecipesInfo = [];

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
  },

  // 買い物リストを画面に表示する処理
  renderShoppingList() {
    
    const shoppingListEl = document.getElementById('shopping-container'); 
    if (!shoppingListEl) {

      return;
    }

    // 調味料セクションの開閉状態を記録（再描画で閉じないようにする）
    const seasoningEl = shoppingListEl.querySelector('.seasoning-section');
    if (seasoningEl) {
      this._seasoningSectionOpen = !seasoningEl.classList.contains('collapsed');
    }

    const totalItems = (this.shoppingList.ingredients?.length || 0) + (this.shoppingList.customItems?.length || 0);
    if (totalItems === 0) {
      shoppingListEl.innerHTML = '<p class="empty-message">リストにアイテムがありません</p>';
      return;
    }

    // 全アイテムを結合（過去データにネスト配列が残る場合に備えてフラット化）
    const allItems = [
      ...(this.shoppingList.ingredients || []).flat(),
      ...(this.shoppingList.customItems || []).flat()
    ];

    // IDがない・重複しているアイテムに一意のIDを補完（チェック状態の誤爆防止）
    const seenIds = new Set();
    let idsFixed = false;
    allItems.forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (!item.id || seenIds.has(String(item.id))) {
        item.id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        idsFixed = true;
      }
      seenIds.add(String(item.id));
    });
    if (idsFixed) {
      this.saveShoppingList();
    }
    
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
    
    // 完了済みは各セクション内で下に表示するためのソート
    const byCompletion = (a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
    regularItems.sort(byCompletion);

    const seasoningItems = (this.shoppingList.ingredients || []).filter(item => {
      const isSeasoning = item.isSeasoning;

      return isSeasoning;
    });
    seasoningItems.sort(byCompletion);
    
    const customItems = this.shoppingList.customItems || [];
    
    let html = `
      <div class="shopping-list-container">
        ${selectedRecipesHtml || ''}
        <div class="shopping-list-content">
    `;

    // 1. 材料セクション（カテゴリ別にグループ化）
    if (regularItems.length > 0) {
      const CATEGORY_ORDER = ['🥬 野菜・果物', '🐟 魚介類', '🥩 肉類', '🥚 卵・乳製品・大豆製品', '🍞 主食・粉類', '🥫 乾物・加工食品', 'その他'];
      const grouped = {};
      regularItems.forEach(item => {
        const cat = getShoppingCategory(item.name);
        (grouped[cat] = grouped[cat] || []).push(item);
      });

      CATEGORY_ORDER.forEach(cat => {
        const items = grouped[cat];
        if (!items || items.length === 0) return;
        html += `
          <div class="shopping-section">
            <h3 class="section-title shopping-category-title">${cat}</h3>
            <div class="ingredients-list">
              ${items.map(item => `
                <div class="shopping-item ${item.completed ? 'completed' : ''}" data-id="${item.id}" data-custom="false">
                  <div class="item-line1">
                    <label class="item-checkbox-container">
                      <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
                      <span class="checkmark"></span>
                    </label>
                    <span class="item-name">${this.escapeHtml(item.name)}</span>
                    ${this._shoppingItemRecipeLabel(item) ? `<button type="button" class="btn-recipes-toggle" title="使うレシピ">▸</button>` : ''}
                  </div>
                  <div class="item-line2">
                    ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
                    <button class="btn-remove" data-id="${item.id}" data-custom="false">×</button>
                  </div>
                  ${this._shoppingItemRecipeLabel(item) ? `<div class="item-recipes" hidden>${this.escapeHtml(this._shoppingItemRecipeLabel(item))}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      });
    }

    // 2. 調味料セクション
    if (seasoningItems.length > 0) {
      html += `
        <div class="shopping-section seasoning-section${this._seasoningSectionOpen ? '' : ' collapsed'}">
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
                  <div class="item-line1">
                    <label class="item-checkbox-container">
                      <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
                      <span class="checkmark"></span>
                    </label>
                    <span class="item-name">${this.escapeHtml(item.name)}</span>
                    ${this._shoppingItemRecipeLabel(item) ? `<button type="button" class="btn-recipes-toggle" title="使うレシピ">▸</button>` : ''}
                  </div>
                  <div class="item-line2">
                    ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
                    <button class="btn-remove" data-id="${item.id}" data-custom="false">×</button>
                  </div>
                  ${this._shoppingItemRecipeLabel(item) ? `<div class="item-recipes" hidden>${this.escapeHtml(this._shoppingItemRecipeLabel(item))}</div>` : ''}
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
        (a.completed ? 1 : 0) - (b.completed ? 1 : 0) || (b.timestamp || 0) - (a.timestamp || 0)
      );

      html += `
        <div class="shopping-section custom-items" id="custom-items-section">
          <h3 class="section-title">その他</h3>
          <div class="ingredients-list" id="shopping-custom-items-list">
            ${sortedCustomItems.map((item, index) => `
                <div class="shopping-item ${item.completed ? 'completed' : ''}" 
                     data-id="${item.id}" 
                     data-custom="true"
                     data-index="${index}">
                  <div class="item-line1">
                    <label class="item-checkbox-container">
                      <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
                      <span class="checkmark"></span>
                    </label>
                    <span class="item-name">${this.escapeHtml(item.name)}</span>
                  </div>
                  <div class="item-line2">
                    ${item.quantity ? `<span class="item-quantity">${this.escapeHtml(item.quantity)}</span>` : ''}
                    <button class="btn-remove" data-id="${item.id}" data-custom="true">×</button>
                  </div>
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

    // レシピ名の表示/非表示トグル
    shoppingListEl.querySelectorAll('.btn-recipes-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.currentTarget.closest('.shopping-item');
        const recipes = item.querySelector('.item-recipes');
        if (!recipes) return;
        const open = recipes.hidden;
        recipes.hidden = !open;
        e.currentTarget.textContent = open ? '▾' : '▸';
        e.currentTarget.classList.toggle('open', open);
      });
    });

    // チェックボックスのイベントリスナーを設定（買い物リスト内に限定）
    shoppingListEl.querySelectorAll('.item-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const itemEl = e.target.closest('.shopping-item');
        if (!itemEl) return;
        this.toggleShoppingItem(itemEl.dataset.id, e.target.checked, itemEl);
      });
    });
  },

  // 調味料セクションのトグルイベントを設定
  setupSeasoningSectionToggles() {
    const container = document.getElementById('shopping-container');
    if (!container) return;

    container.querySelectorAll('.seasoning-section .section-header').forEach(header => {
      header.removeEventListener('click', this.toggleSeasoningSection);
      header.addEventListener('click', this.toggleSeasoningSection);
    });

    // 削除ボタンのイベントリスナー（買い物リスト内に限定）
    container.querySelectorAll('.btn-remove').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = e.currentTarget.dataset.id;
        this.deleteShoppingItem(itemId);
      });
    });

    // カスタムアイテム一括削除ボタンのイベントリスナー（重複バインド防止）
    const clearCustomBtn = document.querySelector('.btn-clear-custom');
    if (clearCustomBtn && !clearCustomBtn.dataset.bound) {
      clearCustomBtn.dataset.bound = '1';
      clearCustomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearAllCustomItems();
      });
    }

      // 買い物完了ボタンのイベントリスナーはsetupEventListenersで登録済みのため削除
  },

  // すべてのアイテムのチェック状態を一括変更
  async setAllShoppingItems(checked) {
    const allItems = [...(this.shoppingList.ingredients || []), ...(this.shoppingList.customItems || [])];
    if (allItems.length === 0) return;

    allItems.forEach(item => { item.completed = checked; });
    // その他タブ側のマスターデータも同期
    (this.customItems || []).forEach(ci => { ci.completed = checked; });

    try {
      await this.saveShoppingList();
      await this.saveCustomItems();
      this.renderShoppingList();
      this.updateCompleteShoppingButton();
    } catch (error) {
      console.error('[ERROR] チェック状態の一括更新に失敗しました:', error);
      this.showMessage('更新に失敗しました', 'error');
    }
  },

  // 買い物リストのチェックボックスON/OFFで完了状態を切り替える
  toggleShoppingItem(itemId, checked, itemEl) {
    // すべてのアイテムを検索（過去データのネスト配列・ID欠損に備える）
    const allItems = [
      ...(this.shoppingList.ingredients || []).flat(),
      ...(this.shoppingList.customItems || []).flat()
    ];
    const item = allItems.find((it) => it && typeof it === 'object' && (
      String(it.id) === String(itemId) ||
      (it.name && String(it.name).toLowerCase() === String(itemId).toLowerCase())
    ));

    if (item) {
      // チェックボックスの実状態に同期（多重発火・二重トグルを防止）
      item.completed = typeof checked === 'boolean' ? checked : !item.completed;

      // カスタムアイテムの場合は、カスタムアイテムリストも更新
      if (item.isCustom) {
        const customItem = this.customItems.find((i) => String(i.id) === String(item.id));
        if (customItem) {
          customItem.completed = item.completed;
          this.saveCustomItems();
        }
      }

      // 状態を保存してUIを更新（全再描画はせず対象行だけ更新して副作用を防ぐ）
      this.saveShoppingList();
      this.updateCompleteShoppingButton();
      if (itemEl && itemEl.isConnected) {
        itemEl.classList.toggle('completed', item.completed);
        const list = itemEl.closest('.ingredients-list');
        if (list) {
          if (item.completed) {
            list.appendChild(itemEl); // 完了はセクション末尾へ
          } else {
            // 未完了に戻した場合は最初の完了済みの前へ（無ければ先頭）
            const firstCompleted = [...list.querySelectorAll('.shopping-item')]
              .find(el => el !== itemEl && el.classList.contains('completed'));
            if (firstCompleted) list.insertBefore(itemEl, firstCompleted);
            else list.prepend(itemEl);
          }
        }
      }
    } else {

    }
  },

  deleteShoppingItem(id) {
    // カスタムアイテムと材料から該当するアイテムを削除
    this.shoppingList.ingredients = this.shoppingList.ingredients.filter(item => item.id !== id && item.name.toLowerCase() !== id.toLowerCase());
    this.shoppingList.customItems = this.shoppingList.customItems.filter(item => item.id !== id && item.name.toLowerCase() !== id.toLowerCase());
    
    this.saveShoppingList();
    this.renderShoppingList();
  },

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
        // 最終調理日時を記録（「久しぶりに作ろう」用）
        recipe.lastCookedAt = new Date().toISOString();
        updatedRecipes.add(recipeId);
        
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
          await this.saveRecipes();
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
    } catch (error) {
      console.error('[ERROR] 買い物完了処理中にエラーが発生しました:', error);
      this.showMessage('処理中にエラーが発生しました: ' + error.message, 'error');
    } finally {
      // 処理中フラグをリセット
      this.isCompletingShopping = false;
    }
  },

  // 買い物リストを初期化する関数
  // includeCustom=true の場合は「その他」タブから追加したアイテムも削除する
  clearShoppingList(includeCustom = false) {
    const menu = document.getElementById('clear-shopping-menu');
    if (menu) menu.hidden = true;

    const target = includeCustom ? '買い物リストとその他' : '買い物リスト';
    const confirmMsg = includeCustom
      ? "買い物リストとその他のアイテムをすべて削除しますか？この操作は元に戻せません。"
      : "買い物リストをクリアしますか？その他から追加したアイテムは残ります。";

    if (confirm(confirmMsg)) {
      this.shoppingList.ingredients = [];
      if (includeCustom) {
        this.shoppingList.customItems = [];
      }
      this.saveShoppingList();
      this.renderShoppingList();
      this.renderCustomItems();
      this.showMessage(`${target}をクリアしました`, 'success');
    }
  },

  async addToShoppingList(ingredients, recipeName = null, recipeId = null, isSeasoning = false) {
    // 各材料にisSeasoningプロパティを設定
    ingredients = ingredients.map(ing => ({
      ...ing,
      isSeasoning: ing.isSeasoning !== undefined ? ing.isSeasoning : isSeasoning
    }));

    // 数量に倍率表記を付与（例: 200g → 200g×2）
    ingredients = this.applyQuantityMultiplier(ingredients, this.getShoppingMultiplier());

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return false;
    }

    // 新しいshoppingList構造を初期化（存在しない場合）
    this.shoppingList.ingredients = this.shoppingList.ingredients || [];
    this.shoppingList.customItems = this.shoppingList.customItems || [];

    let added = false;
    const timestamp = Date.now();

    // 材料名の正規化（同義語・表記ゆれを統合してマージ判定する）
    const normalizeString = (str) => normalizeIngredientKey(str);

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
  },

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
    
    // 進捗表示を更新
    const progressEl = document.getElementById('shopping-progress');
    if (progressEl) {
      progressEl.textContent = totalCount > 0 ? `${completedCount}/${totalCount} チェック済み` : '';
    }

    // ボタンの状態を更新（すべてチェックされている場合のみ有効）
    completeButton.disabled = completedCount !== totalCount;
    completeButton.textContent = '買い物完了';
    
    // ボタンのクラスを更新して視覚的なフィードバックを提供
    if (completedCount === totalCount) {
      completeButton.classList.add('all-completed');
    } else {
      completeButton.classList.remove('all-completed');
    }
  },

};
