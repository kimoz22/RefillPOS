import { loginUser } from "../data/users.js";

export function renderLogin(root, onLogin) {
  root.innerHTML = `
    <main class="login-page">
      <section class="login-card" aria-labelledby="login-title">
        <div class="login-brand">
          <span class="brand-mark" aria-hidden="true">◉</span>
          <span class="brand-copy"><strong>ClearSpring</strong><small>REFILL STATION</small></span>
        </div>
        <h1 id="login-title">Welcome back</h1>
        <p class="login-subtitle">Sign in to continue to your workspace.</p>
        <form id="login-form">
          <label class="field-label" for="login-username">Username</label>
          <input class="form-input full-input" id="login-username" name="username" autocomplete="username" required autofocus>
          <label class="field-label" for="login-password">Password</label>
          <input class="form-input full-input" id="login-password" name="password" type="password" autocomplete="current-password" required>
          <p class="login-error" id="login-error" role="alert" hidden></p>
          <button class="btn login-submit" type="submit">Sign in</button>
        </form>
      </section>
    </main>`;

  const form = root.querySelector("#login-form");
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (form.dataset.submitting === "true") return;
    form.dataset.submitting = "true";
    const submit = form.querySelector('[type="submit"]');
    const error = root.querySelector("#login-error");
    submit.disabled = true;
    submit.textContent = "Signing in…";
    error.hidden = true;
    (async () => {
      const values = new FormData(form);
      try {
        const result = await loginUser(values.get("username"), values.get("password"));
        onLogin(result.user);
      } catch (cause) {
      console.error("Could not start the demo login session.", cause);
        error.textContent = cause.message || "Unable to sign in. Check the server connection and try again.";
        if (cause.message?.includes("Incorrect username or password")) {
          error.textContent = "Username or password is incorrect.";
        }
        submit.disabled = false;
        submit.textContent = "Sign in";
        delete form.dataset.submitting;
      }
    })();
  });
}
