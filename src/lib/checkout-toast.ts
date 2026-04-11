/**
 * Theme-aware error toast (red accent), slides in from the right.
 * Used for checkout/shipping validation instead of `alert()`.
 */
export function showCheckoutToast(
  message: string,
  title: string = "Payment failed",
): void {
  if (typeof document === "undefined") return;

  document.getElementById("vs-checkout-toast")?.remove();

  if (!document.getElementById("vs-toast-styles")) {
    const s = document.createElement("style");
    s.id = "vs-toast-styles";
    s.textContent = `
      #vs-checkout-toast {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 9999;
        max-width: 400px;
        width: calc(100vw - 48px);
        background: var(--surface);
        border: 1px solid rgba(239,68,68,0.2);
        border-left: 4px solid #ef4444;
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-dropdown);
        padding: 16px 16px 16px 14px;
        font-family: var(--font-family);
        animation: vsToastIn 0.34s cubic-bezier(0.16, 1, 0.3, 1);
        transition: opacity 0.2s;
      }
      @keyframes vsToastIn {
        from {
          transform: translateX(calc(100% + 32px));
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      .vs-toast-inner {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .vs-toast-icon {
        color: #ef4444;
        flex-shrink: 0;
        margin-top: 1px;
        line-height: 0;
      }
      .vs-toast-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .vs-toast-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--foreground);
        line-height: 1.3;
      }
      .vs-toast-msg {
        font-size: 13px;
        color: var(--foreground);
        opacity: 0.65;
        line-height: 1.45;
        word-break: break-word;
      }
      .vs-toast-close {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--foreground);
        opacity: 0.45;
        padding: 0;
        flex-shrink: 0;
        line-height: 0;
        transition: opacity 0.15s;
        align-self: flex-start;
        margin-top: 1px;
      }
      .vs-toast-close:hover { opacity: 0.9; }
      @media (max-width: 480px) {
        #vs-checkout-toast {
          bottom: 20px;
          right: 16px;
          left: 16px;
          width: auto;
          max-width: none;
        }
      }
    `;
    document.head.appendChild(s);
  }

  const toast = document.createElement("div");
  toast.id = "vs-checkout-toast";
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");

  const inner = document.createElement("div");
  inner.className = "vs-toast-inner";

  const iconWrap = document.createElement("div");
  iconWrap.className = "vs-toast-icon";
  iconWrap.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`;

  const body = document.createElement("div");
  body.className = "vs-toast-body";
  const titleEl = document.createElement("span");
  titleEl.className = "vs-toast-title";
  titleEl.textContent = title;
  const msgEl = document.createElement("span");
  msgEl.className = "vs-toast-msg";
  msgEl.textContent = message;
  body.append(titleEl, msgEl);

  const closeBtn = document.createElement("button");
  closeBtn.className = "vs-toast-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close notification");
  closeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;

  inner.append(iconWrap, body, closeBtn);
  toast.append(inner);
  document.body.appendChild(toast);

  const dismiss = () => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 220);
  };
  closeBtn.addEventListener("click", dismiss);
  setTimeout(dismiss, 7000);
}
