/**
 * Site toast notifications (checkout / course / profile).
 * Same visuals as CourseDetail — injects #vs-toast-styles once.
 */
export function showVsToast(
  message: string,
  type: "error" | "success" = "error",
): void {
  document.getElementById("vs-checkout-toast")?.remove();

  if (!document.getElementById("vs-toast-styles")) {
    const s = document.createElement("style");
    s.id = "vs-toast-styles";
    s.textContent = `
                #vs-checkout-toast {
                    position: fixed; bottom: 28px; right: 28px; z-index: 9999;
                    max-width: 400px; width: calc(100vw - 48px);
                    background: var(--surface);
                    border: 1px solid rgba(239,68,68,0.2);
                    border-left: 4px solid #ef4444;
                    border-radius: var(--radius-xl);
                    box-shadow: var(--shadow-dropdown);
                    padding: 16px 16px 16px 14px;
                    font-family: var(--font-family);
                    animation: vsToastIn 0.28s cubic-bezier(.4,0,.2,1);
                    transition: opacity 0.2s;
                }
                #vs-checkout-toast.toast-success {
                    border-color: rgba(34,197,94,0.2);
                    border-left-color: #22c55e;
                }
                @keyframes vsToastIn {
                    from { transform: translateY(14px) scale(0.97); opacity: 0; }
                    to   { transform: translateY(0) scale(1); opacity: 1; }
                }
                .vs-toast-inner { display: flex; align-items: flex-start; gap: 12px; }
                .vs-toast-icon  { flex-shrink: 0; margin-top: 1px; line-height: 0; }
                .vs-toast-body  { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
                .vs-toast-title { font-size: 14px; font-weight: 600; color: var(--foreground); line-height: 1.3; }
                .vs-toast-msg   { font-size: 13px; color: var(--foreground); opacity: 0.65; line-height: 1.45; word-break: break-word; }
                .vs-toast-close { background: none; border: none; cursor: pointer; color: var(--foreground); opacity: 0.45; padding: 0; flex-shrink: 0; line-height: 0; transition: opacity 0.15s; align-self: flex-start; margin-top: 1px; }
                .vs-toast-close:hover { opacity: 0.9; }
                @media (max-width: 480px) {
                    #vs-checkout-toast { bottom: 20px; right: 16px; left: 16px; width: auto; }
                }
            `;
    document.head.appendChild(s);
  }

  const isSuccess = type === "success";
  const toast = document.createElement("div");
  toast.id = "vs-checkout-toast";
  if (isSuccess) toast.classList.add("toast-success");
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
            <div class="vs-toast-inner">
                <div class="vs-toast-icon" style="color: ${isSuccess ? "#22c55e" : "#ef4444"}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        ${
                          isSuccess
                            ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                            : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
                        }
                    </svg>
                </div>
                <div class="vs-toast-body">
                    <span class="vs-toast-title">${isSuccess ? "Success" : "Error"}</span>
                    <span class="vs-toast-msg"></span>
                </div>
                <button type="button" class="vs-toast-close" aria-label="Close notification">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
  toast.querySelector(".vs-toast-msg")!.textContent = message;
  document.body.appendChild(toast);

  const dismiss = () => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 220);
  };
  toast.querySelector(".vs-toast-close")?.addEventListener("click", dismiss);
  setTimeout(dismiss, 7000);
}
