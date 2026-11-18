// recipes.js - script.js から分割されたレシピ機能モジュール

// RecipeApp.prototype に Object.assign で合成される

export const recipesMethods = {

  // レシピを削除（非同期処理のみを行うプライベートメソッド）
  async _deleteRecipeAsync(recipeId) {
    await window.recipeDB.delete('recipes', recipeId);
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  // 編集をキャンセルする処理
  cancelEdit() {
    if (confirm("編集をキャンセルしますか？入力中の内容は破棄されます。")) {
      this.resetForm();
      // レシピ一覧タブに切り替え
      this.switchTab("recipes");
    }
  },

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
          <div class="recipe-count recipe-cook-count">
            <span class="recipe-cook-count-label">調理</span>
            <span>${count}回</span>
          </div>`;
        
        return `
          <div class="recipe-item recipe-item-full ${this.selectedRecipes.has(recipe.id) ? "selected" : ""}" data-id="${recipe.id}">
            <div class="recipe-header">
              <input type="checkbox" class="recipe-checkbox recipe-checkbox-card" ${this.selectedRecipes.has(recipe.id) ? "checked" : ""}>
              <div class="recipe-content recipe-content-card">
                <div class="recipe-title-row">
                  <div class="recipe-name recipe-card-name">${recipe.name}</div>
                  <button class="btn-detail btn-detail-link" data-id="${recipe.id}">詳細</button>
                </div>
                <div class="recipe-ingredients recipe-ingredients-hidden">
                  ${recipe.ingredients.map(ing => `<span class="ingredient-badge">${ing.name} ${ing.quantity}</span>`).join("")}
                </div>
                ${recipe.image ? `<img src="${recipe.image}" alt="${recipe.name}" class="recipe-image recipe-card-img">` : ""}
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
            <div class="modal-note-image-section">
              <h3 class="modal-note-image-title">添付写真</h3>
              <img src="${recipe.noteImage}" class="modal-note-image">
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
  },

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
      formTitle.innerHTML = '<i class="fas fa-edit edit-icon-purple"></i> レシピ編集';
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  // お気に入り切り替え
  toggleFavorite(id) {
    const idx = this.recipes.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.recipes[idx].favorite = !this.recipes[idx].favorite;
      this.saveRecipes();
      this.renderRecipes();
    }
  },

};
