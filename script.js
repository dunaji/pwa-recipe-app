// レシピ管理アプリ全体を制御するクラス
class RecipeApp {
  // 並び順の状態
  recipeSortMode = "popular"; // デフォルトはよく作る順
  recipeSortOrder = "desc"; // デフォルトは降順

  // アプリ起動時に一度だけ実行される初期化処理
  constructor() {
    this.recipes = JSON.parse(localStorage.getItem("recipes")) || []
    this.shoppingList = JSON.parse(localStorage.getItem("shoppingList")) || []
    this.shoppingHistory = JSON.parse(localStorage.getItem("shoppingHistory")) || []
    this.selectedRecipes = new Set()


  }

  // アプリの初期表示やイベント登録などをまとめて実行
  init() {
    this.setupEventListeners()
    this.renderRecipes()
    this.renderShoppingList()
    this.renderShoppingHistory()
    this.updateShoppingButton()
    this.updateCompleteShoppingButton()
  }

  // 画面上の各種ボタンやフォームにイベント（クリックや入力）を登録
  setupEventListeners() {
    // タブ切り替え
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.switchTab(e.target.closest(".tab-btn").dataset.tab)
      })
    })

    // 並び替えセレクトボックス
    document.getElementById("recipe-sort-select").addEventListener("change", (e) => {
      this.recipeSortMode = e.target.value;
      this.renderRecipes();
    });
    // 昇順降順セレクトボックス
    document.getElementById("recipe-sort-order").addEventListener("change", (e) => {
      this.recipeSortOrder = e.target.value;
      this.renderRecipes();
    });

    // レシピフォーム
    document.getElementById("recipe-form").addEventListener("submit", (e) => {
      e.preventDefault()
      if (this.editingRecipeId) {
        this.saveEditedRecipe()
      } else {
        this.addRecipe()
      }
    })

    // 材料追加
    document.getElementById("add-ingredient").addEventListener("click", () => {
      this.addIngredientRow()
    })

    // 写真アップロード
    document.getElementById("photo-upload").addEventListener("click", () => {
      document.getElementById("photo-input").click()
    })

    document.getElementById("photo-input").addEventListener("change", (e) => {
      this.handlePhotoUpload(e)
    })

    document.getElementById("remove-photo").addEventListener("click", () => {
      this.removePhoto()
    })

    // 買い物リストに追加
    document.getElementById("add-to-shopping").addEventListener("click", () => {
      this.addSelectedToShopping()
    })

    // 買い物リスト初期化ボタン
    document.getElementById("clear-shopping").addEventListener("click", () => {
      this.clearShoppingList()
    })


    // 買い物完了ボタン
    document.getElementById("complete-shopping").addEventListener("click", () => {
      this.completeShoppingList()
    })
  }

  // タブの切り替え（登録・レシピ・買い物）を行う関数
  switchTab(tabName) {
    // タブボタンの状態更新
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active")
    })
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active")

    // タブコンテンツの表示切り替え
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active")
    })
    document.getElementById(tabName).classList.add("active")
    // レシピタブ切り替え時は必ず最新表示
    if (tabName === "recipes") this.renderRecipes();
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
                <i class="fas fa-minus"></i>
            </button>
        `

    // 削除ボタンのイベントリスナー
    row.querySelector(".btn-remove-ingredient").addEventListener("click", () => {
      row.remove()
      this.updateRemoveButtons()
    })

    container.appendChild(row)
    this.updateRemoveButtons()
  }

  // 材料行の削除ボタンの表示・非表示を切り替える関数
  updateRemoveButtons() {
    const rows = document.querySelectorAll(".ingredient-row")
    rows.forEach((row, index) => {
      const removeBtn = row.querySelector(".btn-remove-ingredient")
      if (rows.length > 1) {
        removeBtn.style.display = "flex"
      } else {
        removeBtn.style.display = "none"
      }
    })
  }

  // 写真ファイルが選択されたときの処理（リサイズや圧縮もここで実施）
  handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file) return;

    const MAX_SIZE = 1048576; // 1MB
    const MAX_WIDTH = 800;
    const JPEG_QUALITY = 0.7;

    // サイズが大きい場合もメッセージは出さず自動対応

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // サイズが小さい場合はそのまま
        if (file.size <= MAX_SIZE) {
          document.getElementById("preview-image").src = ev.target.result;
          document.getElementById("photo-upload").style.display = "none";
          document.getElementById("photo-preview").style.display = "block";
          return;
        }
        // サイズが大きい場合はリサイズ・圧縮
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width));
          width = MAX_WIDTH;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        document.getElementById("preview-image").src = compressedDataUrl;
        document.getElementById("photo-upload").style.display = "none";
        document.getElementById("photo-preview").style.display = "block";
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 写真プレビューとファイル選択をリセットする処理
  removePhoto() {
    document.getElementById("photo-input").value = ""
    document.getElementById("photo-upload").style.display = "block"
    document.getElementById("photo-preview").style.display = "none"
  }

  // レシピを新規登録する処理
  addRecipe() {
  // 新規作成時はfavorite: false

  // ...
  // favoriteは新規作成時はfalse

    const name = document.getElementById("recipe-name").value.trim()
    const ingredientRows = document.querySelectorAll(".ingredient-row")
    const ingredients = []

    ingredientRows.forEach((row) => {
      const ingredientName = row.querySelector(".ingredient-name").value.trim()
      const quantity = row.querySelector(".ingredient-quantity").value.trim()

      if (ingredientName) {
        ingredients.push({ name: ingredientName, quantity: quantity || "" })
      }
    })

    if (!name || ingredients.length === 0) {
      alert("料理名と材料を入力してください。")
      return
    }

    // 確認クッション
    if (!confirm("この内容でレシピを登録しますか？")) {
      return;
    }

    let imgSrc = document.getElementById("preview-image").src;
    if (!imgSrc || imgSrc.startsWith('data:') === false && imgSrc.indexOf('http') !== 0) {
      imgSrc = null;
    }
    if (document.getElementById("photo-preview").style.display === "none") {
      imgSrc = null;
    }
    const notes = document.getElementById("recipe-notes").value.trim();
    const recipe = {
      id: Date.now(),
      name: name,
      ingredients: ingredients,
      image: imgSrc,
      notes: notes,
      createdAt: new Date().toISOString(),
      favorite: false,
    }

    this.recipes.forEach(r => {
      if (typeof r.favorite === 'undefined') r.favorite = false;
    });

    this.recipes.push(recipe)
    this.saveRecipes()
    this.renderRecipes()
    this.resetForm()

    // 成功メッセージ
    this.showMessage("レシピが登録されました！", "success");
  }

  // レシピ登録フォームを初期状態に戻す処理
  resetForm() {
    document.getElementById("recipe-form").reset()
    document.getElementById("recipe-notes").value = "";
    this.editingRecipeId = null;
    document.querySelector(".btn-primary").textContent = "レシピを登録";
    // 見出しを「レシピ登録」に戻す
    const title = document.getElementById('register-title');
    if (title) title.textContent = 'レシピ登録';
    // 編集モード用クラス除去
    const registerTab = document.getElementById('register');
    if (registerTab) registerTab.classList.remove('editing-mode');

    // 材料行を1つにリセット
    const container = document.getElementById("ingredients-container")
    container.innerHTML = `
            <div class="ingredient-row">
                <input type="text" placeholder="材料名" class="ingredient-name" required>
                <input type="text" placeholder="数量" class="ingredient-quantity">
                <button type="button" class="btn-remove-ingredient" style="display: none;">
                    <i class="fas fa-minus"></i>
                </button>
            </div>
        `

    // 写真をリセット
    this.removePhoto()
  }

  // レシピ一覧を画面に表示する処理
  renderRecipes() {

    const container = document.getElementById("recipes-container")

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
    // 作成回数集計（常に）
    let recipeCounts = {};
    this.shoppingHistory.forEach(hist => {
      const ids = hist.recipeIds || hist.recipes || [];
      ids.forEach(id => {
        recipeCounts[id] = (recipeCounts[id] || 0) + 1;
      });
    });
    // 並び替え
    if (this.recipeSortMode === "popular") {
      sortedRecipes.sort((a, b) => {
        const countA = recipeCounts[a.id] || 0;
        const countB = recipeCounts[b.id] || 0;
        if (countA !== countB) return this.recipeSortOrder === "desc" ? countB - countA : countA - countB;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    } else if (this.recipeSortMode === "new") {
      sortedRecipes.sort((a, b) => (b.createdAt || 0) > (a.createdAt || 0) ? 1 : -1);
    } else if (this.recipeSortMode === "name") {
      sortedRecipes.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));
    } else if (this.recipeSortMode === "favorite") {
      sortedRecipes.sort((a, b) => (b.favorite === a.favorite) ? 0 : b.favorite ? 1 : -1);
    }
    if (this.recipeSortOrder === "asc") {
      sortedRecipes.reverse();
    }

    container.innerHTML = sortedRecipes
      .map((recipe) => {
        const count = recipeCounts[recipe.id] || 0;
        let countHtml = `<div class="recipe-count" style="display:flex;flex-direction:column;align-items:flex-end;font-size:0.88em;color:#ff9800;margin-bottom:0.2em;line-height:1.15;">
  <span style='font-weight:bold;'>調理数</span>
  <span>${count}回</span>
</div>`;
        return `
          <div class="recipe-item ${this.selectedRecipes.has(recipe.id) ? "selected" : ""}" data-id="${recipe.id}">
            <div class="recipe-header">
              <input type="checkbox" class="recipe-checkbox" ${this.selectedRecipes.has(recipe.id) ? "checked" : ""}>
              <div class="recipe-content">
                ${recipe.image ? `<img src="${recipe.image}" alt="${recipe.name}" class="recipe-image">` : ""}
                <div style="display:flex;align-items:center;gap:0.7em;">
                  <div class="recipe-name">${recipe.name}</div>
                  <button class="btn-detail" style="font-size:0.93em; color:#2196f3; background:none; border:none; cursor:pointer;">詳細</button>
                </div>
                <div class="recipe-ingredients" style="display:none;">
                  ${recipe.ingredients.map(ing => `<span class="ingredient-badge">${ing.name} ${ing.quantity}</span>`).join("")}
                </div>
              </div>
              <div class="recipe-actions">
                <button class="btn-favorite" onclick="app.toggleFavorite(${recipe.id})">
                  <i class="${recipe.favorite ? 'fas fa-star' : 'far fa-star'}"></i>
                </button>
                <button class="btn-edit" onclick="app.editRecipe(${recipe.id})">
                  <i class="fas fa-pen"></i>
                </button>
                <button class="btn-delete" onclick="app.deleteRecipe(${recipe.id})">
                  <i class="fas fa-trash"></i>
                </button>
                ${countHtml}
              </div>
            </div>
          </div>
        `;
      })
      .join("")

    // チェックボックスのイベントリスナー
    container.querySelectorAll(".recipe-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const recipeId = Number.parseInt(e.target.closest(".recipe-item").dataset.id)
        this.toggleRecipeSelection(recipeId)
      })
    })
    // 詳細ボタンのイベントリスナー
    container.querySelectorAll(".btn-detail").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const recipeId = Number(btn.closest('.recipe-item').dataset.id);
        const recipe = this.recipes.find(r => r.id === recipeId);
        if (!recipe) return;
        // モーダル表示
        document.getElementById("modal-recipe-title").textContent = recipe.name;
        // 写真は詳細モーダルに表示しない
        const thumbDiv = document.getElementById("modal-recipe-image");
        thumbDiv.innerHTML = "";
        const ingUl = document.getElementById("modal-recipe-ingredients");
        ingUl.innerHTML = (recipe.ingredients || []).map(i => `<li>${i.name} ${i.quantity ? '('+i.quantity+')' : ''}</li>`).join('');
        document.getElementById("modal-recipe-notes").textContent = recipe.notes || '';
        document.getElementById("recipe-detail-modal").style.display = "flex";
      });
    });
    // モーダル閉じるボタン
    const closeDetailBtn = document.getElementById("close-detail-modal");
    if (closeDetailBtn) {
      closeDetailBtn.onclick = () => {
        document.getElementById("recipe-detail-modal").style.display = "none";
      };
    }
  }

  // レシピ編集フォームに値をセットし、編集モードにする
  editRecipe(id) {
    const recipe = this.recipes.find(r => r.id === id);
    if (!recipe) return;
    this.editingRecipeId = id;
    // 見出しを「レシピを編集」に
    const title = document.getElementById('register-title');
    if (title) title.textContent = 'レシピを編集';
    // 編集モード用クラス付与
    const registerTab = document.getElementById('register');
    if (registerTab) registerTab.classList.add('editing-mode');
    document.getElementById("recipe-name").value = recipe.name;
    document.getElementById("recipe-notes").value = recipe.notes || "";
    // 材料行をセット
    const container = document.getElementById("ingredients-container");
    container.innerHTML = "";
    recipe.ingredients.forEach((ing, idx) => {
      const row = document.createElement("div");
      row.className = "ingredient-row";
      row.innerHTML = `
        <input type="text" placeholder="材料名" class="ingredient-name" required value="${ing.name}">
        <input type="text" placeholder="数量" class="ingredient-quantity" value="${ing.quantity}">
        <button type="button" class="btn-remove-ingredient" style="${idx === 0 && recipe.ingredients.length === 1 ? 'display: none;' : 'display: flex;'}">
          <i class="fas fa-minus"></i>
        </button>
      `;
      row.querySelector(".btn-remove-ingredient").addEventListener("click", () => {
        row.remove();
        this.updateRemoveButtons();
      });
      container.appendChild(row);
    });
    this.updateRemoveButtons();
    // 写真
    if (recipe.image) {
      document.getElementById("preview-image").src = recipe.image;
      document.getElementById("photo-upload").style.display = "none";
      document.getElementById("photo-preview").style.display = "block";
    } else {
      this.removePhoto();
    }
    // ボタン文言変更
    document.querySelector(".btn-primary").textContent = "レシピを編集保存";
    // 登録タブに切り替え
    this.switchTab && this.switchTab("register");
  }

  // 編集保存処理
  saveEditedRecipe() {
    const name = document.getElementById("recipe-name").value.trim();
    const ingredientRows = document.querySelectorAll(".ingredient-row");
    const ingredients = [];
    ingredientRows.forEach((row) => {
      const ingredientName = row.querySelector(".ingredient-name").value.trim();
      const quantity = row.querySelector(".ingredient-quantity").value.trim();
      if (ingredientName) {
        ingredients.push({ name: ingredientName, quantity: quantity || "" });
      }
    });
    if (!name || ingredients.length === 0) {
      alert("料理名と材料を入力してください。");
      return;
    }
    // 確認クッション
    if (!confirm("この内容で編集を完了しますか？")) {
      return;
    }
    let imgSrc = document.getElementById("preview-image").src;
    if (!imgSrc || imgSrc.startsWith('data:') === false && imgSrc.indexOf('http') !== 0) {
      imgSrc = null;
    }
    if (document.getElementById("photo-preview").style.display === "none") {
      imgSrc = null;
    }
    const notes = document.getElementById("recipe-notes").value.trim();
    // 上書き
    const idx = this.recipes.findIndex(r => r.id === this.editingRecipeId);
    if (idx === -1) return;
    this.recipes[idx] = {
      ...this.recipes[idx],
      name,
      ingredients,
      image: imgSrc,
      notes
    };
    this.saveRecipes();
    this.renderRecipes();
    this.resetForm();
    this.editingRecipeId = null;
    this.showMessage && this.showMessage("レシピを編集保存しました！", "success");
  }

  // レシピの選択・非選択を切り替える関数
  toggleRecipeSelection(recipeId) {
    if (this.selectedRecipes.has(recipeId)) {
      this.selectedRecipes.delete(recipeId)
    } else {
      this.selectedRecipes.add(recipeId)
    }

    this.renderRecipes()
    this.updateShoppingButton()
  }

  // 「買い物リストに追加」ボタンの表示・非表示を切り替える
  updateShoppingButton() {
    const button = document.getElementById("add-to-shopping")
    if (this.selectedRecipes.size > 0) {
      button.style.display = "block"
    } else {
      button.style.display = "none"
    }
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
    // 買い物リストを初期化
    this.shoppingList = [];
    // 選択中のレシピID・名前を記録
    this.shoppingListRecipeIds = this.recipes
      .filter(r => this.selectedRecipes.has(r.id))
      .map(r => r.id);
    this.shoppingListRecipes = this.recipes
      .filter(r => this.selectedRecipes.has(r.id))
      .map(r => r.name);
    // 選択した料理名を上部に表示
    const recipeNames = this.shoppingListRecipes;
    const recipeArea = document.getElementById("shopping-selected-recipes");
    if (recipeArea) {
      if (recipeNames.length) {
        recipeArea.textContent = "選択した料理: " + recipeNames.join("、");
        recipeArea.style.display = "block";
      } else {
        recipeArea.textContent = "";
        recipeArea.style.display = "none";
      }
    }
    const selectedRecipeIds = Array.from(this.selectedRecipes)
    const selectedRecipeObjects = this.recipes.filter((recipe) => selectedRecipeIds.includes(recipe.id))

    selectedRecipeObjects.forEach((recipe) => {
      recipe.ingredients.forEach((ingredient) => {
        // 既存のアイテムをチェック（材料名は小文字比較）
        const existingItem = this.shoppingList.find((item) => item.name.toLowerCase() === ingredient.name.toLowerCase())

        if (!existingItem) {
          this.shoppingList.push({
            id: Date.now() + Math.random(),
            name: ingredient.name,
            quantity: ingredient.quantity,
            completed: false,
          })
        } else {
          // 数量が両方とも数字なら合計
          const isNumOld = !isNaN(existingItem.quantity) && existingItem.quantity !== ''
          const isNumNew = !isNaN(ingredient.quantity) && ingredient.quantity !== ''
          if (isNumOld && isNumNew) {
            existingItem.quantity = String(Number(existingItem.quantity) + Number(ingredient.quantity))
          } else {
            // どちらかが数字でなければ「+」で連結（重複しないように）
            if (existingItem.quantity && ingredient.quantity && existingItem.quantity !== ingredient.quantity) {
              // すでに含まれていなければ追加
              const parts = existingItem.quantity.split('+')
              if (!parts.includes(ingredient.quantity)) {
                existingItem.quantity += '+' + ingredient.quantity
              }
            }
          }
        }
      })
    })

    this.selectedRecipes.clear()
    this.saveShoppingList()
    this.renderRecipes()
    this.renderShoppingList()
    this.updateShoppingButton()

    this.showMessage("買い物リストを作成しました！", "success");
  }

  // 買い物リストを画面に表示する処理
  renderShoppingList() {
    const container = document.getElementById("shopping-container")
    const recipeArea = document.getElementById("shopping-selected-recipes");
    if (recipeArea) {
      if (this.shoppingListRecipes && this.shoppingListRecipes.length) {
        recipeArea.innerHTML = '<span class="shopping-recipes-highlight">選択した料理: ' + this.shoppingListRecipes.map(n => `<span>${n}</span>`).join('、') + '</span>';
        recipeArea.style.display = "block";
        recipeArea.style.color = "#39e600";
        recipeArea.style.fontWeight = "bold";
        recipeArea.style.fontSize = "1.08rem";
        recipeArea.style.letterSpacing = "0.02em";
        recipeArea.style.textShadow = "0 0 2px #bfff99, 0 0 8px #fff";
      } else {
        recipeArea.innerHTML = "";
        recipeArea.style.display = "none";
        recipeArea.style.color = null;
        recipeArea.style.fontWeight = null;
        recipeArea.style.fontSize = null;
        recipeArea.style.letterSpacing = null;
        recipeArea.style.textShadow = null;
      }
    }

    if (this.shoppingList.length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shopping-cart"></i>
                    <p>買い物リストは空です</p>
                </div>
            `
      this.updateCompleteShoppingButton();
      return
    }

    container.innerHTML = `
            ${this.shoppingList
              .map(
                (item) => `
                <div class="shopping-item ${item.completed ? "completed" : ""}" data-id="${item.id}">
                    <input type="checkbox" class="shopping-checkbox" ${item.completed ? "checked" : ""}>
                    <div class="shopping-content">
                        <span class="shopping-name ${item.completed ? "completed" : ""}">${item.name}</span>
                        <span class="shopping-quantity">${item.quantity}</span>
                    </div>
                    <button class="btn-delete" onclick="app.deleteShoppingItem(${item.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `,
              )
              .join("")}
        `

    // チェックボックスのイベントリスナー
    container.querySelectorAll(".shopping-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const itemId = Number.parseFloat(e.target.closest(".shopping-item").dataset.id)
        this.toggleShoppingItem(itemId)
        this.updateCompleteShoppingButton();
      })
    })
    this.updateCompleteShoppingButton();
  }

  // 買い物リストのチェックボックスON/OFFで完了状態を切り替える
  toggleShoppingItem(itemId) {
    const item = this.shoppingList.find((item) => item.id === itemId)
    if (item) {
      item.completed = !item.completed
      this.saveShoppingList()
      this.renderShoppingList()
    }
  }

  deleteShoppingItem(id) {
    this.shoppingList = this.shoppingList.filter((item) => item.id !== id)
    this.saveShoppingList()
    this.renderShoppingList()
  }

  // レシピデータをlocalStorageに保存
  saveRecipes() {
    localStorage.setItem("recipes", JSON.stringify(this.recipes))
  }

  // 買い物リストをlocalStorageに保存
  saveShoppingList() {
    localStorage.setItem("shoppingList", JSON.stringify(this.shoppingList))
  }

  // 買い物リストをすべて削除する処理
  clearShoppingList() {
    // 料理名表示をクリア
    const recipeArea = document.getElementById("shopping-selected-recipes");
    if (recipeArea) {
      recipeArea.textContent = "";
      recipeArea.style.display = "none";
    }
    if (confirm("買い物リストをすべて削除しますか？")) {
      this.shoppingList = [];
      this.shoppingListRecipes = [];
      this.saveShoppingList();
      this.renderShoppingList();
      this.showMessage("買い物リストを初期化しました");
    }
  }

  // 買い物リストの全チェック完了時の処理（履歴保存・リスト初期化）
  completeShoppingList() {
    // 料理名表示をクリア
    const recipeArea = document.getElementById("shopping-selected-recipes");
    if (recipeArea) {
      recipeArea.textContent = "";
      recipeArea.style.display = "none";
    }
    // 全てチェックされているか
    if (!this.shoppingList.every(item => item.completed)) {
      this.showMessage("すべての項目にチェックを入れてください");
      return;
    }
    // 履歴保存・リスト初期化を自動で実行
    const now = new Date();
    const historyEntry = {
      date: now.toLocaleDateString(), // 時間なしで日付のみ
      items: this.shoppingList.map(item => ({ name: item.name, quantity: item.quantity })),
      recipeNames: this.shoppingListRecipes || [],
      recipeIds: this.shoppingListRecipeIds || []
    };
    this.shoppingHistory.unshift(historyEntry);
    this.saveShoppingHistory();
    this.renderShoppingHistory();
    // リスト初期化
    this.shoppingList = [];
    this.shoppingListRecipes = [];
    this.saveShoppingList();
    this.renderShoppingList();
    this.showMessage("買い物お疲れさまでした！", "success");
    this.renderShoppingHistory();
  }

  // 「買い物完了」ボタンの有効/無効を切り替える
  updateCompleteShoppingButton() {
    const btn = document.getElementById("complete-shopping");
    if (!btn) return;
    if (!this.shoppingList.length) {
      btn.disabled = true;
      return;
    }
    // 全てのcompleted=trueなら有効化
    btn.disabled = !this.shoppingList.every(item => item.completed);
  }

  // トーストメッセージを画面下部に表示する汎用関数
  showMessage(message, type = "") {
    // 既存トーストがあれば削除
    let toast = document.getElementById('toast-message');
    if (toast) toast.remove();
    toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.className = 'toast-message';
    if(type === "success") toast.classList.add("toast-success");
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => { toast.remove(); }, 400);
    }, 1800);
  }

  // 買い物履歴をlocalStorageに保存
  saveShoppingHistory() {
    localStorage.setItem("shoppingHistory", JSON.stringify(this.shoppingHistory));
  }

  // 買い物履歴をlocalStorageから読み込む
  loadShoppingHistory() {
    const data = localStorage.getItem("shoppingHistory");
    this.shoppingHistory = data ? JSON.parse(data) : [];
  }

  // 買い物履歴のドロップダウン表示・履歴詳細のアラート表示＋モーダル全件表示
  renderShoppingHistory() {
    // 履歴が空の場合は「履歴なし」表示
    const area = document.getElementById("shopping-history-area");
    if (!area) return;
    // 履歴サマリー部分だけを更新するためのspanを用意
    let summary = area.querySelector('#history-summary');
    if (!summary) {
      summary = document.createElement('span');
      summary.id = 'history-summary';
      area.insertBefore(summary, area.firstChild);
    }
    if (!this.shoppingHistory.length) {
      summary.innerHTML = '';
      return;
    }
    // すべて表示ボタン（HTMLはindex.htmlで既に配置済み）
    const showAllBtn = document.getElementById("show-all-history");
    if (showAllBtn) {
      showAllBtn.onclick = () => {
        const modal = document.getElementById("history-modal");
        const list = document.getElementById("history-modal-list");
        if (modal && list) {
          // 履歴リストのみ描画（ゴミ箱ボタンはHTMLに配置済み）
          list.innerHTML = this.shoppingHistory.map((hist, i) =>
            `<div class="history-modal-row" data-idx="${i}" style="display:flex;align-items:center;justify-content:space-between;padding:0.5em 0; border-bottom:1px solid #eee;">
              <div class="history-info" style="flex:1;min-width:0;cursor:pointer;">
                <span style="font-size:0.98em; font-weight:600;">${hist.date}</span>
                <span style="color:#ff9800; font-size:0.93em; margin-left:0.5em;">${hist.recipeNames && hist.recipeNames.length ? hist.recipeNames.join('、') : ''}</span>
              </div>
            </div>`
          ).join("");
          // すべて削除ボタンのイベント（HTML側のボタンに付与）
          const delAllBtn = document.getElementById('btn-delete-all-history');
          if (delAllBtn) {
            delAllBtn.onclick = () => {
              if (confirm('本当にすべての買い物履歴を削除しますか？')) {
                this.shoppingHistory = [];
                this.saveShoppingHistory();
                this.renderShoppingHistory();
                showAllBtn.click();
              }
            };
          }
          // 各行クリックで詳細（.history-info のみに付与）
          list.querySelectorAll('.history-info').forEach(row => {
            row.onclick = (e) => {
              const idx = row.parentElement.getAttribute('data-idx');
              const hist = this.shoppingHistory[idx];
              let msg = `【${hist.date}】\n`;
              if (hist.recipeNames && hist.recipeNames.length) {
                msg += `料理: ${hist.recipeNames.join('、')}\n`;
              }
              msg += hist.items.map(it => `・${it.name}（${it.quantity}）`).join("\n");
              alert(msg);
            };
          });
          modal.style.display = "flex";
        }
      };
    }
    // モーダル閉じる
    const closeBtn = document.getElementById("close-history-modal");
    if (closeBtn) {
      closeBtn.onclick = () => {
        const modal = document.getElementById("history-modal");
        if (modal) modal.style.display = "none";
      };
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
}

// アプリケーションのインスタンスを作成し、初期化処理を実行
const app = new RecipeApp()
window.app = app
app.init()
