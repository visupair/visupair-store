/**
 * Account profile page client (forms, delete modal, quota hints).
 * Loaded as a real ES module — do not use `define:vars` on this script in Astro
 * or the compiler may emit raw `import` in the HTML (SyntaxError in the browser).
 */
import { authClient } from "./auth-client";
import { showVsToast } from "./vs-toast";

function messageFromAuthClientError(
  err: { message?: string; error?: unknown } | null | undefined,
): string {
  if (!err) return "";
  if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
  if (typeof err.error === "string" && err.error.trim()) return err.error.trim();
  return "";
}

function readQuotaBoot(): { email: number; password: number } {
  const el = document.getElementById("account-profile-boot");
  const email = Number.parseInt(el?.dataset.emailRemaining ?? "2", 10);
  const password = Number.parseInt(el?.dataset.passwordRemaining ?? "2", 10);
  return {
    email: Number.isFinite(email) ? email : 2,
    password: Number.isFinite(password) ? password : 2,
  };
}

let profilePageAbort: AbortController | null = null;

export function initAccountProfilePage(): void {
  profilePageAbort?.abort();
  profilePageAbort = new AbortController();
  const { signal } = profilePageAbort;

  const boot = readQuotaBoot();
  let emailChangesRemaining = boot.email;
  let passwordChangesRemaining = boot.password;

  function showPostEmailChangeQuota() {
    const hint = document.getElementById(
      "email-change-quota-hint",
    ) as HTMLParagraphElement | null;
    const submit = document.getElementById("email-submit") as HTMLButtonElement | null;
    if (!hint) return;
    emailChangesRemaining = Math.max(0, emailChangesRemaining - 1);
    if (emailChangesRemaining <= 0) {
      hint.textContent = "You have used all email changes allowed for this month.";
      hint.hidden = false;
      if (submit) submit.disabled = true;
      return;
    }
    hint.textContent =
      emailChangesRemaining === 1
        ? "You have 1 email change left this month."
        : `You have ${emailChangesRemaining} email changes left this month.`;
    hint.hidden = false;
  }

  function showPostPasswordChangeQuota() {
    const hint = document.getElementById(
      "password-change-quota-hint",
    ) as HTMLParagraphElement | null;
    const submit = document.getElementById(
      "password-submit",
    ) as HTMLButtonElement | null;
    if (!hint) return;
    passwordChangesRemaining = Math.max(0, passwordChangesRemaining - 1);
    if (passwordChangesRemaining <= 0) {
      hint.textContent = "You have used all password changes allowed for this month.";
      hint.hidden = false;
      if (submit) submit.disabled = true;
      return;
    }
    hint.textContent =
      passwordChangesRemaining === 1
        ? "You have 1 password change left this month."
        : `You have ${passwordChangesRemaining} password changes left this month.`;
    hint.hidden = false;
  }

  const profileForm = document.getElementById("profile-form") as HTMLFormElement | null;
  const profileSubmit = document.getElementById("profile-submit") as HTMLButtonElement | null;
  const avatarDisplay = document.getElementById("avatar-display") as HTMLDivElement | null;

  if (profileForm && profileSubmit) {
    profileForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();

        const formData = new FormData(profileForm);
        const rawFirst = String(formData.get("firstName") ?? "").trim();
        const rawLast = String(formData.get("lastName") ?? "").trim();
        const fullName = [rawFirst, rawLast].filter(Boolean).join(" ").trim();

        if (!rawFirst) {
          showVsToast("First name is required.", "error");
          return;
        }

        profileSubmit.disabled = true;
        profileSubmit.textContent = "Saving...";

        try {
          const result = await authClient.updateUser({
            name: fullName,
          });

          const err = (result as { error?: { message?: string } }).error;
          if (err) {
            showVsToast(
              err.message || "Could not update your profile.",
              "error",
            );
            return;
          }

          if (avatarDisplay) {
            const hasPhoto = avatarDisplay.querySelector("img.profile-avatar-photo");
            if (!hasPhoto) {
              avatarDisplay.textContent = `${rawFirst.charAt(0)}${rawLast.charAt(0)}`;
            }
          }

          showVsToast("Your name was saved.", "success");
        } catch {
          showVsToast(
            "Could not update your profile. Please try again.",
            "error",
          );
        } finally {
          profileSubmit.disabled = false;
          profileSubmit.textContent = "Save Changes";
        }
      },
      { signal },
    );
  }

  const emailForm = document.getElementById("email-form") as HTMLFormElement | null;
  const emailSubmit = document.getElementById("email-submit") as HTMLButtonElement | null;

  if (emailForm && emailSubmit) {
    emailForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();

        const formData = new FormData(emailForm);
        const email = String(formData.get("email") ?? "").trim();
        const callbackURL = `${window.location.origin}/account/profile`;

        emailSubmit.disabled = true;
        emailSubmit.textContent = "Sending…";

        try {
          const result = await authClient.changeEmail({
            newEmail: email,
            callbackURL,
          });
          const err = (result as { error?: { message?: string; error?: unknown } }).error;
          if (err) {
            let msg =
              messageFromAuthClientError(err) || "Could not start email change.";
            if (msg.toLowerCase().includes("not fresh")) {
              msg =
                "For security, sign out and sign in again, then try changing your email.";
            }
            showVsToast(msg, "error");
            return;
          }
          showVsToast(
            "Check your inbox for a link to confirm your email change. If your account already had a verified email, you’ll get a second message at the new address.",
            "success",
          );
          showPostEmailChangeQuota();
        } catch {
          showVsToast("Could not start email change. Please try again.", "error");
        } finally {
          emailSubmit.disabled = false;
          emailSubmit.textContent = "Update";
        }
      },
      { signal },
    );
  }

  const passwordForm = document.getElementById("password-form") as HTMLFormElement | null;
  const passwordSubmit = document.getElementById(
    "password-submit",
  ) as HTMLButtonElement | null;

  if (passwordForm && passwordSubmit) {
    passwordForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();

        const formData = new FormData(passwordForm);
        const currentPassword = String(formData.get("currentPassword") ?? "");
        const newPassword = String(formData.get("newPassword") ?? "");
        const confirmPassword = String(formData.get("confirmPassword") ?? "");

        if (newPassword !== confirmPassword) {
          showVsToast("New passwords do not match.", "error");
          return;
        }

        if (newPassword.length < 8) {
          showVsToast("New password must be at least 8 characters.", "error");
          return;
        }

        passwordSubmit.disabled = true;
        passwordSubmit.textContent = "Updating…";

        try {
          const result = await authClient.changePassword({
            currentPassword,
            newPassword,
            revokeOtherSessions: true,
          });
          const err = (result as { error?: { message?: string; error?: unknown } }).error;
          if (err) {
            let msg =
              messageFromAuthClientError(err) || "Could not change password.";
            const low = msg.toLowerCase();
            if (low.includes("not fresh")) {
              msg =
                "For security, sign out and sign in again, then change your password.";
            } else if (low.includes("invalid password")) {
              msg = "Current password is incorrect.";
            } else if (
              low.includes("invalid origin") ||
              (low.includes("forbidden") && low.includes("origin"))
            ) {
              msg =
                "This site’s address isn’t trusted for sign-in APIs. Open Visupair the same way you log in (don’t mix localhost and 127.0.0.1). In production, set PUBLIC_SITE_URL / BETTER_AUTH_URL to your real domain.";
            } else if (
              low.includes("credential") &&
              (low.includes("not found") || low.includes("account"))
            ) {
              msg =
                "No Visupair password is set yet. Use Forgot password on the login page with this email to create one.";
            }
            showVsToast(msg, "error");
            return;
          }
          passwordForm.reset();
          showVsToast("Your password was updated.", "success");
          showPostPasswordChangeQuota();
        } catch {
          showVsToast("Could not change password. Please try again.", "error");
        } finally {
          passwordSubmit.disabled = false;
          passwordSubmit.textContent = "Change Password";
        }
      },
      { signal },
    );
  }

  const deleteBtn = document.getElementById("delete-account-btn") as HTMLButtonElement | null;
  const deleteModal = document.getElementById("delete-account-modal");
  const deleteModalBackdrop = document.getElementById("delete-account-modal-backdrop");
  const deleteModalCancel = document.getElementById(
    "delete-account-modal-cancel",
  ) as HTMLButtonElement | null;
  const deleteModalConfirm = document.getElementById(
    "delete-account-modal-confirm",
  ) as HTMLButtonElement | null;

  let deleteModalPreviouslyFocused: HTMLElement | null = null;
  let deleteCloseTimeoutId = 0;

  function finishCloseDeleteAccountModal() {
    if (!deleteModal) return;
    window.clearTimeout(deleteCloseTimeoutId);
    deleteCloseTimeoutId = 0;
    deleteModal.classList.remove("delete-account-modal--closing");
    deleteModal.hidden = true;
    deleteModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    deleteModalPreviouslyFocused?.focus();
    deleteModalPreviouslyFocused = null;
  }

  function closeDeleteAccountModal() {
    if (!deleteModal || deleteModal.hasAttribute("hidden")) return;
    if (deleteModal.classList.contains("delete-account-modal--closing")) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishCloseDeleteAccountModal();
      return;
    }

    const dialogEl = deleteModal.querySelector(".delete-account-modal__dialog");
    deleteModal.classList.add("delete-account-modal--closing");

    const onDialogAnimEnd = (ev: AnimationEvent) => {
      if (ev.target !== dialogEl) return;
      dialogEl.removeEventListener("animationend", onDialogAnimEnd);
      window.clearTimeout(deleteCloseTimeoutId);
      deleteCloseTimeoutId = 0;
      finishCloseDeleteAccountModal();
    };

    dialogEl?.addEventListener("animationend", onDialogAnimEnd);
    deleteCloseTimeoutId = window.setTimeout(() => {
      dialogEl?.removeEventListener("animationend", onDialogAnimEnd);
      finishCloseDeleteAccountModal();
    }, 380);
  }

  function openDeleteAccountModal() {
    if (!deleteModal) return;
    window.clearTimeout(deleteCloseTimeoutId);
    deleteCloseTimeoutId = 0;
    deleteModal.classList.remove("delete-account-modal--closing");
    deleteModalPreviouslyFocused = document.activeElement as HTMLElement;
    deleteModal.hidden = false;
    deleteModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    deleteModalCancel?.focus();
  }

  if (deleteBtn) {
    deleteBtn.addEventListener(
      "click",
      () => {
        openDeleteAccountModal();
      },
      { signal },
    );
  }

  deleteModalBackdrop?.addEventListener(
    "click",
    () => {
      closeDeleteAccountModal();
    },
    { signal },
  );

  deleteModalCancel?.addEventListener(
    "click",
    () => {
      closeDeleteAccountModal();
    },
    { signal },
  );

  document.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key !== "Escape") return;
      if (!deleteModal || deleteModal.hasAttribute("hidden")) return;
      closeDeleteAccountModal();
    },
    { signal },
  );

  deleteModalConfirm?.addEventListener(
    "click",
    async () => {
      if (!deleteModalConfirm || deleteModalConfirm.disabled) return;

      deleteModalConfirm.disabled = true;
      const oldLabel = deleteModalConfirm.textContent;
      deleteModalConfirm.textContent = "Deleting…";

      try {
        const result = await (
          authClient as unknown as {
            deleteUser: (opts: {
              callbackURL: string;
            }) => Promise<{ error?: { message?: string } }>;
          }
        ).deleteUser({
          callbackURL: `${window.location.origin}/`,
        });

        const err = result?.error;
        if (err) {
          let msg = err.message || "Could not delete your account.";
          const low = msg.toLowerCase();
          if (
            low.includes("session") ||
            low.includes("not fresh") ||
            low.includes("expired")
          ) {
            msg =
              "For security, sign out, sign in again, then delete your account.";
          }
          showVsToast(msg, "error");
          return;
        }

        finishCloseDeleteAccountModal();
        showVsToast("Your account was deleted.", "success");
        window.location.href = "/";
      } catch {
        showVsToast(
          "Something went wrong. Please try again or contact support.",
          "error",
        );
      } finally {
        deleteModalConfirm.disabled = false;
        deleteModalConfirm.textContent = oldLabel ?? "Delete account";
      }
    },
    { signal },
  );

  const purchasesBtn = document.getElementById("purchases-btn") as HTMLButtonElement | null;

  if (purchasesBtn) {
    purchasesBtn.addEventListener(
      "click",
      () => {
        window.location.href = "/account/purchases";
      },
      { signal },
    );
  }
}

let astroPageLoadBound = false;

/** Call once from the profile page module script; re-binds after soft navigations via `astro:page-load`. */
export function mountAccountProfilePage(): void {
  initAccountProfilePage();
  if (!astroPageLoadBound) {
    astroPageLoadBound = true;
    document.addEventListener("astro:page-load", initAccountProfilePage);
  }
}
