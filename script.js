// レシピ管理アプリ全体を制御するクラス
class RecipeApp {
  // アプリ起動時に一度だけ実行される初期化処理
  constructor() {
    this.recipes = JSON.parse(localStorage.getItem("recipes")) || []
    this.shoppingList = JSON.parse(localStorage.getItem("shoppingList")) || []
    this.shoppingHistory = JSON.parse(localStorage.getItem("shoppingHistory")) || []
    this.selectedRecipes = new Set()

    this.init()
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

    // レシピフォーム
    document.getElementById("recipe-form").addEventListener("submit", (e) => {
      e.preventDefault()
      this.addRecipe()
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

    // 画像が未選択の場合はnullをセット
    let imgSrc = document.getElementById("preview-image").src;
    if (!imgSrc || imgSrc.startsWith('data:') === false && imgSrc.indexOf('http') !== 0) {
      imgSrc = null;
    }
    if (document.getElementById("photo-preview").style.display === "none") {
      imgSrc = null;
    }
    const recipe = {
      id: Date.now(),
      name: name,
      ingredients: ingredients,
      image: imgSrc,
      createdAt: new Date().toISOString(),
    }

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
            `
      return
    }

    container.innerHTML = this.recipes
      .map(
        (recipe) => `
            <div class="recipe-item ${this.selectedRecipes.has(recipe.id) ? "selected" : ""}" data-id="${recipe.id}">
                <div class="recipe-header">
                    <input type="checkbox" class="recipe-checkbox" ${this.selectedRecipes.has(recipe.id) ? "checked" : ""}>
                    <div class="recipe-content">
                        ${recipe.image ? `<img src="${recipe.image}" alt="${recipe.name}" class="recipe-image">` : ""}
                        <div class="recipe-name">${recipe.name}</div>
                        <div class="recipe-ingredients">
                            ${recipe.ingredients
                              .map((ing) => `<span class="ingredient-badge">${ing.name} ${ing.quantity}</span>`)
                              .join("")}
                        </div>
                    </div>
                    <button class="btn-delete" onclick="app.deleteRecipe(${recipe.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `,
      )
      .join("")

    // チェックボックスのイベントリスナー
    container.querySelectorAll(".recipe-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const recipeId = Number.parseInt(e.target.closest(".recipe-item").dataset.id)
        this.toggleRecipeSelection(recipeId)
      })
    })
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
    // 選択中のレシピ名を記録
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
      date: now.toLocaleString(),
      items: this.shoppingList.map(item => ({ name: item.name, quantity: item.quantity })),
      recipes: this.shoppingListRecipes || []
    };
    this.shoppingHistory.unshift(historyEntry);
    this.saveShoppingHistory();
    this.renderShoppingHistory();
    // リスト初期化
    this.shoppingList = [];
    this.saveShoppingList();
    this.renderShoppingList();
    this.showMessage("買い物お疲れさまでした！", "success");
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

  // 買い物履歴のドロップダウン表示・履歴詳細のアラート表示
  renderShoppingHistory() {
    const area = document.getElementById("shopping-history-area");
    if (!area) return;
    if (!this.shoppingHistory.length) {
      area.innerHTML = '<span style="color:#bbb;">履歴なし</span>';
      return;
    }
    area.innerHTML = `<select id="history-select" class="history-select">
      <option value="">履歴を見る</option>
      ${this.shoppingHistory.map((h, i) => `<option value="${i}">${h.date}（${h.items.length}件）${h.recipes && h.recipes.length ? ' [' + h.recipes.join('、') + ']' : ''}</option>`).join("")}
      <option value="__clear__">--- 履歴をすべて削除 ---</option>
    </select>`;
    document.getElementById("history-select").addEventListener("change", (e) => {
      const idx = e.target.value;
      if (idx === "") return;
      if (idx === "__clear__") {
        if (confirm("履歴をすべて削除しますか？")) {
          this.shoppingHistory = [];
          this.saveShoppingHistory();
          this.renderShoppingHistory();
          this.showMessage("履歴を削除しました");
        }
        e.target.value = "";
        return;
      }
      const hist = this.shoppingHistory[idx];
      let msg = `【${hist.date}】\n`;
      if (hist.recipes && hist.recipes.length) {
        msg += `料理: ${hist.recipes.join('、')}\n`;
      }
      msg += hist.items.map(it => `・${it.name}（${it.quantity}）`).join("\n");
      alert(msg);
      e.target.value = "";
    });
  }


}

// アプリケーションのインスタンスを作成し、初期化処理を実行
const app = new RecipeApp()

