import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.PORTAL_CONFIG || {};
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function show(selector) {
  const el = $(selector);
  if (el) el.classList.remove("hidden");
}

function toast(message, isError = false) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = `status ${isError ? "status--danger" : "status--success"}`;
  el.classList.remove("hidden");
  clearTimeout(window.__portalToast);
  window.__portalToast = setTimeout(() => el.classList.add("hidden"), 4500);
}

function siteUrl() {
  return config.SITE_URL || window.location.origin;
}

function isProtectedPage() {
  return document.body.dataset.authRequired === "true";
}

async function requireAuth() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }
  return data.session;
}

async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl().replace(/\/$/, "")}/app.html`
    }
  });
  if (error) throw error;
}

async function getUserBundle() {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return null;

  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || null
  }, { onConflict: "id" });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { user, profile, project };
}

function humanizeStatus(status) {
  const map = {
    setup_in_progress: "Setup in progress",
    waiting_on_client: "Waiting on you",
    designing: "In design",
    review: "Ready for review",
    launch_ready: "Launch ready",
    complete: "Complete"
  };
  return map[status] || "In progress";
}

async function loadTasks(projectId) {
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  return data || [];
}

async function loadMessages(projectId) {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(6);

  return data || [];
}

async function refreshUploads(projectId) {
  const list = $("#uploads-list");
  if (!list) return;

  const { data } = await supabase
    .from("uploads")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (!data || !data.length) {
    list.innerHTML = `<li>No files uploaded yet.</li>`;
    return;
  }

  list.innerHTML = data.map((row) => `
    <li>
      <strong>${row.file_name}</strong>
      <p>${row.category}${row.notes ? ` · ${row.notes}` : ""}</p>
    </li>
  `).join("");
}

async function initLogin() {
  const form = $("#login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#email").value.trim();

    try {
      $("#login-submit").disabled = true;
      await sendMagicLink(email);
      show("#login-success");
      setText("#login-status", `We sent a secure link to ${email}.`);
      toast("Your secure link is on its way.");
    } catch (error) {
      toast(error.message || "Could not send your sign-in link.", true);
    } finally {
      $("#login-submit").disabled = false;
    }
  });
}

async function initProtectedPage() {
  if (!isProtectedPage()) return;
  const session = await requireAuth();
  if (!session) return;

  const bundle = await getUserBundle();
  if (!bundle) return;

  const { user, profile, project } = bundle;
  const name = profile?.full_name || user.email?.split("@")[0] || "there";

  setText("[data-user-name]", name);
  setText("[data-project-name]", project?.project_name || "Your portal");
  setText("[data-project-status]", humanizeStatus(project?.status || "setup_in_progress"));
  setText("[data-launch-date]", project?.target_launch_date || "To be scheduled");
  setText("[data-user-email]", user.email || "");

  if ($("#dashboard-tasks") && project?.id) {
    const tasks = await loadTasks(project.id);
    $("#dashboard-tasks").innerHTML = tasks.map((task) => `
      <li>
        <strong>${task.title}</strong>
        <p>${task.description || ""}</p>
      </li>
    `).join("");
  }

  if ($("#project-messages") && project?.id) {
    const messages = await loadMessages(project.id);
    $("#project-messages").innerHTML = messages.map((msg) => `
      <li>
        <strong>${new Date(msg.created_at).toLocaleDateString()}</strong>
        <p>${msg.body}</p>
      </li>
    `).join("");
  }

  const uploadForm = $("#upload-form");
  if (uploadForm && project?.id) {
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = $("#upload-file").files[0];
      const category = $("#upload-category").value;
      const notes = $("#upload-notes").value.trim();

      if (!file) {
        toast("Choose a file first.", true);
        return;
      }

      const path = `${user.id}/${category}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;

      try {
        $("#upload-submit").disabled = true;

        const { error: uploadError } = await supabase.storage
          .from("client-uploads")
          .upload(path, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from("uploads").insert({
          project_id: project.id,
          file_name: file.name,
          storage_path: path,
          category,
          notes,
          uploaded_by: user.id
        });

        if (dbError) throw dbError;

        uploadForm.reset();
        toast("File uploaded.");
        await refreshUploads(project.id);
      } catch (error) {
        toast(error.message || "Upload failed.", true);
      } finally {
        $("#upload-submit").disabled = false;
      }
    });

    await refreshUploads(project.id);
  }

  const logoutButtons = $$(".js-logout");
  logoutButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "login.html";
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await initLogin();
  await initProtectedPage();
});
