/**
 * ===========================================
 * WebGL 3Dモデルローダー カスタム要素
 * ===========================================
 *
 * 【概要】
 * Three.jsを使用してGLTF形式の3DモデルをWebページに埋め込むためのカスタム要素
 * シャドウDOMを使用してスタイルの分離を実現し、タッチデバイス対応も含む
 *
 * 【主な機能】
 * - GLTF/GLBモデルの読み込みと表示
 * - モバイル/タッチデバイス対応（横スワイプでモデル回転）
 * - 自動回転機能
 * - 透明背景対応
 * - レスポンシブ対応
 * - アニメーション再生
 */

// Three.jsコアとアドオンのインポート
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * ===========================================
 * WebGLモデルローダー カスタム要素クラス
 * ===========================================
 */
class WebGLModelLoader extends HTMLElement {
  constructor() {
    super();

    // シャドウDOMを作成（スタイルの分離のため）
    this.attachShadow({ mode: "open" });

    // シャドウDOM内のHTML構造とスタイルを定義
    // タッチデバイス対応のためのタッチアクション制御も含む
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
        .model-container {
          width: 100%;
          height: 100%;
          overflow: hidden;
          /* タッチ操作の制御 - 縦スクロールとピンチズームを許可 */
          touch-action: pan-y pinch-zoom;
          /* テキスト選択を無効化（3D操作の邪魔を防ぐ） */
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          -khtml-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
        .model-container canvas {
          /* Canvas固有のタッチ制御 - 後でJavaScriptで動的に変更 */
          touch-action: manipulation;
          pointer-events: auto;
        }
      </style>
      <div class="model-container"></div>
    `;

    /**
     * ===========================================
     * Three.js関連プロパティの初期化
     * ===========================================
     */
    this.scene = null; // 3Dシーン
    this.camera = null; // カメラ
    this.renderer = null; // WebGLレンダラー
    this.controls = null; // OrbitControls（現在は無効化）
    this.model = null; // 読み込んだ3Dモデル
    this.animationMixer = null; // アニメーション制御
    this.clock = new THREE.Clock(); // アニメーション用タイマー

    /**
     * ===========================================
     * 表示制御プロパティ
     * ===========================================
     */
    this.isAutoRotate = false; // 自動回転フラグ
    this.rotateSpeed = 0.005; // 回転速度
    this.isInitialized = false; // 初期化完了フラグ

    /**
     * ===========================================
     * タッチ操作関連プロパティ
     * ===========================================
     */
    this.isTouchDevice = "ontouchstart" in window; // タッチデバイス判定
    this.touchStartX = 0; // タッチ開始時のX座標
    this.touchStartY = 0; // タッチ開始時のY座標
    this.touchThreshold = 15; // タッチ判定の閾値（ピクセル単位）
    this.isHorizontalPan = false; // 横方向パン操作中フラグ
    this.touchMoveStarted = false; // タッチ移動開始フラグ

    // アニメーションループ関数のthisバインド（重要：コールバック内でthisを使用するため）
    this.animate = this.animate.bind(this);
  }

  /**
   * ===========================================
   * カスタム要素ライフサイクル：接続時
   * ===========================================
   * HTML要素がDOMに追加されたときに実行される
   */
  connectedCallback() {
    // コンテナ要素の取得
    this.container = this.shadowRoot.querySelector(".model-container");

    /**
     * HTML属性から設定値を読み取り
     * 例: <webgl-model-loader model-url="model.glb" width="400px" height="300px">
     */
    this.width = this.getAttribute("width") || "100%";
    this.height = this.getAttribute("height") || "300px";
    this.modelUrl = this.getAttribute("model-url") || "";
    this.backgroundColor = this.getAttribute("background") || "transparent";
    this.isAutoRotate = this.hasAttribute("auto-rotate");
    this.rotateSpeed = parseFloat(this.getAttribute("rotate-speed") || "0.005");
    this.modelScale = parseFloat(this.getAttribute("scale") || "1.0");

    // コンテナのサイズ設定
    this.container.style.width = this.width;
    this.container.style.height = this.height;

    // Three.jsシーンの初期化
    this.initScene();

    // 3Dモデルのロード（URLが指定されている場合）
    if (this.modelUrl) {
      this.loadModel(this.modelUrl);
    }

    // ウィンドウリサイズ対応
    window.addEventListener("resize", this.onWindowResize.bind(this));

    // タッチデバイス用のイベント設定
    this.setupTouchEvents();
  }

  /**
   * ===========================================
   * カスタム要素ライフサイクル：切断時
   * ===========================================
   * HTML要素がDOMから削除されたときに実行される
   * メモリリークを防ぐためのクリーンアップ処理
   */
  disconnectedCallback() {
    // イベントリスナーの削除
    window.removeEventListener("resize", this.onWindowResize.bind(this));

    // WebGLリソースの解放
    if (this.renderer) {
      this.renderer.dispose();
    }

    // 3Dシーンのリソース解放
    if (this.scene) {
      this.disposeScene(this.scene);
    }
  }

  /**
   * ===========================================
   * タッチイベント制御の設定
   * ===========================================
   * モバイルデバイスでの操作性を向上させるための処理
   * 横スワイプ：3Dモデル回転、縦スワイプ：ページスクロール
   */
  setupTouchEvents() {
    // タッチデバイス以外は処理をスキップ
    if (!this.isTouchDevice) return;

    const canvas = this.renderer.domElement;

    // Canvas要素に縦スクロールのみ許可するタッチアクションを設定
    canvas.style.touchAction = "pan-y";

    /**
     * タッチ開始時の処理
     * 初期位置を記録し、フラグをリセット
     */
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          // シングルタッチのみ処理
          this.touchStartX = e.touches[0].clientX;
          this.touchStartY = e.touches[0].clientY;
          this.isHorizontalPan = false;
          this.touchMoveStarted = false;
        }
      },
      { passive: true } // パフォーマンス向上のため
    );

    /**
     * タッチ移動時の処理
     * 移動方向を判定し、横方向なら3Dモデル操作、縦方向ならスクロール
     */
    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 1) {
          const touchX = e.touches[0].clientX;
          const touchY = e.touches[0].clientY;

          // 移動距離を計算
          const deltaX = Math.abs(touchX - this.touchStartX);
          const deltaY = Math.abs(touchY - this.touchStartY);

          // 最初の移動時のみ方向を判定（一度決まったら変更しない）
          if (
            !this.touchMoveStarted &&
            (deltaX > this.touchThreshold || deltaY > this.touchThreshold)
          ) {
            this.touchMoveStarted = true;

            // 横方向の動きが明確に大きい場合のみ3Dモデル操作として認識
            // 条件：横移動が縦移動の2倍以上 かつ 閾値を超えている
            if (deltaX > deltaY * 2 && deltaX > this.touchThreshold) {
              this.isHorizontalPan = true;
              // ブラウザのデフォルト動作（スクロール等）を停止
              e.preventDefault();
              e.stopPropagation();
              // 3Dモデルの手動回転処理
              this.handleHorizontalPan(touchX - this.touchStartX);
            } else {
              // 縦方向の動き（ページスクロール）として認識
              this.isHorizontalPan = false;
              // ブラウザのスクロール処理を妨げない
            }
          } else if (this.touchMoveStarted && this.isHorizontalPan) {
            // 既に横方向操作として認識されている場合は継続処理
            e.preventDefault();
            e.stopPropagation();
            this.handleHorizontalPan(touchX - this.touchStartX);
          }
        }
      },
      { passive: false } // preventDefault()を使用するためfalse
    );

    /**
     * タッチ終了時の処理
     * フラグをリセットして次の操作に備える
     */
    canvas.addEventListener(
      "touchend",
      (e) => {
        this.isHorizontalPan = false;
        this.touchMoveStarted = false;
      },
      { passive: true }
    );

    /**
     * タッチキャンセル時の処理
     * システムによるタッチ中断時の処理
     */
    canvas.addEventListener(
      "touchcancel",
      (e) => {
        this.isHorizontalPan = false;
        this.touchMoveStarted = false;
      },
      { passive: true }
    );
  }

  /**
   * ===========================================
   * 横方向パンによるモデル回転処理
   * ===========================================
   * タッチデバイスでの横スワイプ操作をモデルの回転に変換
   */
  handleHorizontalPan(deltaX) {
    if (!this.model) return;

    // 回転速度の調整（感度調整可能）
    const rotationSpeed = 0.01;

    // Y軸回転（左右回転）を適用
    this.model.rotation.y += deltaX * rotationSpeed;

    // 継続的な操作のためにタッチ開始位置を更新
    // 注意：event変数を直接参照しているがglobalなeventオブジェクトを想定
    // より安全な実装では引数として座標を渡すべき
    this.touchStartX = event.touches[0].clientX;
  }

  /**
   * ===========================================
   * 3Dシーンリソースの解放
   * ===========================================
   * メモリリークを防ぐためのクリーンアップ処理
   */
  disposeScene(scene) {
    scene.traverse((object) => {
      // ジオメトリ（形状データ）の解放
      if (object.geometry) {
        object.geometry.dispose();
      }

      // マテリアル（材質データ）の解放
      if (object.material) {
        if (Array.isArray(object.material)) {
          // 複数マテリアルの場合
          object.material.forEach((material) => material.dispose());
        } else {
          // 単一マテリアルの場合
          object.material.dispose();
        }
      }
    });
  }

  /**
   * ===========================================
   * 属性変更時のコールバック
   * ===========================================
   * HTML属性が動的に変更された際の処理
   * 例：element.setAttribute('background', 'red');
   */
  attributeChangedCallback(name, oldValue, newValue) {
    // 初期化前は処理をスキップ
    if (!this.isInitialized) return;

    switch (name) {
      case "model-url":
        // モデルURLが変更された場合、新しいモデルをロード
        if (newValue !== oldValue && newValue) {
          this.loadModel(newValue);
        }
        break;

      case "background":
        // 背景色の変更
        if (this.scene) {
          if (newValue === "transparent" || newValue === "") {
            this.scene.background = null; // 透明背景
          } else {
            this.scene.background = new THREE.Color(newValue || "#000000");
          }
        }
        break;

      case "auto-rotate":
        // 自動回転の有効/無効切り替え
        this.isAutoRotate = this.hasAttribute("auto-rotate");
        break;

      case "rotate-speed":
        // 回転速度の変更
        this.rotateSpeed = parseFloat(newValue || "0.005");
        break;

      case "scale":
        // モデルスケールの変更
        const scale = parseFloat(newValue || "1.0");
        if (this.model) {
          this.model.scale.set(scale, scale, scale);
        }
        break;
    }
  }

  /**
   * ===========================================
   * 監視する属性の定義
   * ===========================================
   * これらの属性が変更されたときにattributeChangedCallbackが呼ばれる
   */
  static get observedAttributes() {
    return ["model-url", "background", "auto-rotate", "rotate-speed", "scale"];
  }

  /**
   * ===========================================
   * Three.js WebGLシーンの初期化
   * ===========================================
   * 3D描画に必要な基本要素を設定
   */
  initScene() {
    // コンテナの実際のサイズを取得
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // 3Dシーンの作成
    this.scene = new THREE.Scene();

    // 背景設定（透明 or 指定色）
    if (this.backgroundColor === "transparent" || this.backgroundColor === "") {
      this.scene.background = null; // 透明背景
    } else {
      this.scene.background = new THREE.Color(this.backgroundColor);
    }

    // パースペクティブカメラの作成
    // 引数：視野角45度、アスペクト比、近クリップ面、遠クリップ面
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 3); // 初期位置

    // WebGLレンダラーの作成（透明背景対応）
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, // アンチエイリアス有効
      alpha: true, // 透明背景を有効化
      premultipliedAlpha: false, // 透明度の処理方法を調整
    });

    // レンダラーの基本設定
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio); // 高DPI対応
    this.renderer.outputEncoding = THREE.sRGBEncoding; // 色空間設定
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // トーンマッピング
    this.renderer.toneMappingExposure = 1; // 露出設定
    this.renderer.setClearColor(0x000000, 0); // 透明な背景を設定

    // レンダラーのCanvas要素をコンテナに追加
    this.container.appendChild(this.renderer.domElement);

    /**
     * 照明の設定
     * 3Dモデルを適切に照らすための光源
     */
    // 環境光（全体を均等に照らす）
    const ambientLight = new THREE.AmbientLight(0xffffff, 2);
    this.scene.add(ambientLight);

    // 平行光源（太陽光のような指向性のある光）
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(-3, 0, -2);
    this.scene.add(directionalLight);

    /**
     * OrbitControls（カメラ制御）の設定
     * 現在はコメントアウト（タッチデバイス対応のため手動制御に変更）
     */
    // this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // this.controls.enableDamping = true;    // 慣性効果
    // this.controls.dampingFactor = 0.05;    // 慣性の強さ
    // this.controls.enableZoom = false;      // ズーム無効化
    // this.controls.minPolarAngle = Math.PI / 2; // 縦回転制限
    // this.controls.maxPolarAngle = Math.PI / 2;
    // if (this.isTouchDevice) {
    //   this.controls.enabled = false;       // タッチデバイスでは無効化
    // }

    // 初期化完了フラグを設定
    this.isInitialized = true;

    // アニメーションループの開始
    this.animate();
  }

  /**
   * ===========================================
   * 3Dモデルのロード処理
   * ===========================================
   * GLTF/GLB形式の3Dモデルファイルを読み込み
   */
  loadModel(url) {
    // GLTFローダーの作成
    const loader = new GLTFLoader();

    // モデルファイルの読み込み
    loader.load(
      url,
      // 読み込み成功時のコールバック
      (gltf) => {
        // 既存のモデルがあれば削除（メモリリーク防止）
        if (this.model) {
          this.scene.remove(this.model);
        }

        // 新しいモデルの取得
        this.model = gltf.scene;

        // モデルのスケール（大きさ）設定
        const scale = parseFloat(this.getAttribute("scale") || "1.0");
        this.model.scale.set(scale, scale, scale);

        // シーンにモデルを追加
        this.scene.add(this.model);

        /**
         * モデルの中心位置調整
         * 読み込んだモデルを画面中央に配置
         */
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        this.model.position.sub(center); // モデルを中心に移動

        /**
         * カメラ位置の自動調整
         * モデルのサイズに応じてカメラ距離を調整
         */
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // 余裕を持たせる

        this.camera.position.z = cameraZ;

        /**
         * アニメーションの設定
         * GLTFファイルにアニメーションデータが含まれている場合に再生
         */
        if (gltf.animations && gltf.animations.length > 0) {
          this.animationMixer = new THREE.AnimationMixer(this.model);
          const animation = gltf.animations[0]; // 最初のアニメーションを使用
          const action = this.animationMixer.clipAction(animation);
          action.play(); // アニメーション開始
        }

        // モデルロード完了をカスタムイベントで通知
        // 外部のJavaScriptがこのイベントを監視できる
        this.dispatchEvent(
          new CustomEvent("model-loaded", {
            bubbles: true, // イベントバブリング有効
            composed: true, // シャドウDOM境界を越える
            detail: { model: this.model }, // モデル情報を含む
          })
        );
      },

      // 読み込み進捗のコールバック
      (xhr) => {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        console.log(`モデル読み込み進捗: ${Math.round(percentComplete)}%`);
      },

      // 読み込みエラーのコールバック
      (error) => {
        console.error("モデルの読み込みに失敗しました:", error);

        // エラーをカスタムイベントで通知
        this.dispatchEvent(
          new CustomEvent("model-error", {
            bubbles: true,
            composed: true,
            detail: { error },
          })
        );
      }
    );
  }

  /**
   * ===========================================
   * アニメーションループ
   * ===========================================
   * 毎フレーム実行される描画処理
   * 60FPS（理想）で実行される
   */
  animate() {
    // 次のフレームでもこの関数を呼び出すようにブラウザに要求
    requestAnimationFrame(this.animate);

    /**
     * デスクトップ用コントロールの更新
     * 現在はOrbitControlsが無効化されているためコメントアウト
     */
    // if (this.controls && !this.isTouchDevice) {
    //   this.controls.update();
    // }

    /**
     * モデルの自動回転処理
     * auto-rotate属性が設定されている場合に実行
     */
    if (this.isAutoRotate && this.model) {
      this.model.rotation.y += this.rotateSpeed;
    }

    /**
     * GLTFアニメーションの更新
     * モデルに含まれるアニメーション（歩行、回転等）の再生
     */
    if (this.animationMixer) {
      this.animationMixer.update(this.clock.getDelta());
    }

    /**
     * シーンのレンダリング（描画）
     * 3Dシーンを2D画面に投影して表示
     */
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * ===========================================
   * ウィンドウリサイズ対応
   * ===========================================
   * ブラウザウィンドウのサイズ変更に対応
   */
  onWindowResize() {
    if (!this.camera || !this.renderer) return;

    // 新しいコンテナサイズを取得
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // カメラのアスペクト比を更新
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // レンダラーのサイズを更新
    this.renderer.setSize(width, height);
  }

  /**
   * ===========================================
   * パブリックメソッド：カメラリセット
   * ===========================================
   * 外部から呼び出し可能なカメラ位置リセット機能
   * 使用例：document.querySelector('webgl-model-loader').resetCamera();
   */
  resetCamera() {
    if (!this.camera) return;

    // カメラ位置を初期状態にリセット
    this.camera.position.set(0, 0, 5);

    // モデルがロードされている場合は、そのサイズに合わせて調整
    if (this.model) {
      const box = new THREE.Box3().setFromObject(this.model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = this.camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5; // 余裕を持たせる

      this.camera.position.z = cameraZ;
    }
  }
}

/**
 * ===========================================
 * カスタム要素の登録
 * ===========================================
 * HTMLで<webgl-model-loader>タグとして使用可能にする
 */
customElements.define("webgl-model-loader", WebGLModelLoader);

/**
 * ===========================================
 * 使用方法・実装ガイド
 * ===========================================
 *
 * 【HTML使用例】
 * <webgl-model-loader
 *   model-url="path/to/model.glb"
 *   width="400px"
 *   height="300px"
 *   background="transparent"
 *   auto-rotate
 *   rotate-speed="0.01"
 *   scale="1.5">
 * </webgl-model-loader>
 *
 * 【属性一覧】
 * - model-url: GLTFモデルファイルのパス
 * - width/height: 表示サイズ
 * - background: 背景色（'transparent'で透明）
 * - auto-rotate: 自動回転を有効化（属性の存在で判定）
 * - rotate-speed: 回転速度（数値）
 * - scale: モデルの拡大縮小率
 *
 * 【イベント監視例】
 * element.addEventListener('model-loaded', (e) => {
 *   console.log('モデル読み込み完了', e.detail.model);
 * });
 *
 * element.addEventListener('model-error', (e) => {
 *   console.error('読み込みエラー', e.detail.error);
 * });
 *
 * 【メソッド呼び出し例】
 * element.resetCamera(); // カメラ位置をリセット
 *
 * 【開発時の注意点】
 * 1. GLTFモデルファイルは同一オリジンまたはCORS対応サーバーに配置
 * 2. モバイルでの操作性向上のため横スワイプ対応を実装済み
 * 3. メモリリーク防止のためdisconnectedCallbackでリソース解放
 * 4. Three.jsのバージョンアップ時はインポートパスの確認が必要
 * 5. 大きなモデルファイルの場合は読み込み進捗表示の実装を推奨
 *
 * 【パフォーマンス最適化】
 * - モデルファイルサイズの最適化（Dracoエンコーディング等）
 * - 不要なアニメーションやテクスチャの除去
 * - LOD（Level of Detail）の実装検討
 * - インスタンシングによる同一モデルの効率的な複製
 */
