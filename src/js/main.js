/**
 * ===========================================
 * メインナビゲーション機能
 * ===========================================
 */

// ハンバーガーメニューの要素を取得
const navToggle = document.getElementById("navToggle");
const navMenu = document.getElementById("navMenu");

// ハンバーガーメニューのクリックイベント
// トグルボタンとメニューの表示/非表示を切り替え
navToggle.addEventListener("click", () => {
  navToggle.classList.toggle("active");
  navMenu.classList.toggle("active");
});

// メニュー内のリンクをクリックした時の処理
// モバイルでメニューを開いた状態でリンクを押すと自動でメニューを閉じる
document.querySelectorAll(".nav-menu a").forEach((link) => {
  link.addEventListener("click", () => {
    navToggle.classList.remove("active");
    navMenu.classList.remove("active");
  });
});

/**
 * ===========================================
 * スムーススクロール機能
 * ===========================================
 */

// アンカーリンク（#で始まるhref）に対してスムーススクロールを適用
// 例: <a href="#about">About</a> をクリックすると #about セクションまでスムーズに移動
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault(); // デフォルトのジャンプ動作を無効化

    const targetId = this.getAttribute("href");
    const targetSection = document.querySelector(targetId);

    // 対象の要素が存在する場合のみスクロール実行
    if (targetSection) {
      targetSection.scrollIntoView({
        behavior: "smooth", // スムーズなスクロール
        block: "start", // セクションの上端に合わせる
      });
    }
  });
});

/**
 * ===========================================
 * スクロール連動アニメーション
 * ===========================================
 */

// Intersection Observer の設定
// 要素が画面に入ったタイミングでアニメーションを発火
const observerOptions = {
  threshold: 0.1, // 要素の10%が見えたら発火
  rootMargin: "0px 0px -50px 0px", // 下から50px手前で発火（早めに開始）
};

// 要素が画面に入った時の処理
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      // 少し遅延させてからアニメーション開始（自然な演出）
      entry.target.style.animationDelay = "0.2s";
      entry.target.classList.add("fade-in");
    }
  });
}, observerOptions);

/**
 * ===========================================
 * ヘッダー背景の動的変更
 * ===========================================
 */

// スクロール時にヘッダーの背景透明度を変更
// 少しスクロールすると背景が濃くなり、視認性を向上
window.addEventListener("scroll", () => {
  const header = document.querySelector(".header");

  if (window.scrollY > 50) {
    // 50px以上スクロールした場合：背景を濃く
    header.style.background = "rgba(247, 247, 247, 0.98)";
  } else {
    // トップ付近：背景を薄く
    header.style.background = "rgba(247, 247, 247, 0.95)";
  }
});

/**
 * ===========================================
 * 初期化処理（DOM読み込み完了後）
 * ===========================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // ローディング画面を非表示にする
  // ※ HTMLに #loading 要素がある場合のみ実行
  const loading = document.getElementById("loading");
  if (loading) {
    loading.style.display = "none";
  }

  // fade-in クラスを持つ全ての要素を監視対象に追加
  // ページ読み込み時に一度だけ実行
  document.querySelectorAll(".fade-in").forEach((el) => {
    observer.observe(el);
  });
});

/**
 * ===========================================
 * 追加のフェードイン要素監視
 * ===========================================
 */

// fade-element クラスも監視対象に追加
// ※ fade-in と fade-element の両方に対応
document.querySelectorAll(".fade-element").forEach((el) => {
  observer.observe(el);
});

/**
 * ===========================================
 * 使用方法・注意事項
 * ===========================================
 *
 * 【必要なHTML要素】
 * - #navToggle: ハンバーガーメニューボタン
 * - #navMenu: ナビゲーションメニュー
 * - .nav-menu a: メニュー内のリンク
 * - .header: ヘッダー要素
 * - .fade-in または .fade-element: アニメーション対象要素
 *
 * 【必要なCSS】
 * - .active クラスのスタイル定義
 * - .fade-in アニメーションの定義
 * - ヘッダーの背景スタイル
 *
 * 【動作確認項目】
 * 1. ハンバーガーメニューの開閉
 * 2. メニュークリック時の自動閉じ
 * 3. アンカーリンクのスムーススクロール
 * 4. スクロール時のフェードイン
 * 5. ヘッダー背景の変化
 */
