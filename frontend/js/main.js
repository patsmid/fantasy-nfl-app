// main.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { showSuccess, showError, showConfirm } from "../components/alerts.js";

// ==========================
// Supabase client
// ==========================
const supabase = createClient("https://cdmesdcgkcvogbgzqobt.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbWVzZGNna2N2b2diZ3pxb2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjM3ODIsImV4cCI6MjA2NzEzOTc4Mn0.QODh_sgbLeqNzYkXp8Ng3HflGaqBw5rf_sZHxanpZH8");

// ==========================
// sidebar
// ==========================
async function loadSidebar(username, role) {
  const sidebar = document.getElementById("sidebar");
  const sidebarMobile = document.getElementById("sidebarMobileContent");

  try {
    const response = await fetch(
      `https://fantasy-nfl-backend.onrender.com/api/admin/menu/${username}`
    );

    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        showError("Usuario inválido. Por favor ingresa un usuario válido.");
        await logout();
        return;
      }
      throw new Error(
        `No se pudo obtener el menú (status: ${response.status})`
      );
    }

    const menuTree = await response.json();

    if (menuTree.error === "USERNAME_INVALID") {
      showError("Usuario inválido. Por favor intenta de nuevo.");
      await logout();
      return;
    }

    // -------------------------------
    // Renderizado normal del sidebar
    // -------------------------------
    const sidebarHTML = renderSidebar(menuTree);

    sidebar.innerHTML = `
      <div class="flock-logo d-none d-lg-block">🏈 Fantasy NFL</div>
      ${sidebarHTML}
      <div id="sidebar-user-block" class="mt-auto" style="margin-top: 1rem;">
        <div style="padding:0.75rem 0.5rem;border-top:1px solid rgba(255,255,255,0.03);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem">
            <div>
              <div style="font-weight:600">${username}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary)">${role}</div>
            </div>
            <button id="logoutBtn" class="btn btn-accent" style="white-space:nowrap">Cerrar sesión</button>
          </div>
        </div>
      </div>
    `;

    if (sidebarMobile) {
      sidebarMobile.innerHTML = `
        <div class="flock-logo">🏈 Fantasy NFL</div>
        ${sidebarHTML}
        <div style="padding:0.75rem;border-top:1px solid rgba(255,255,255,0.03);margin-top:1rem">
          <div style="display:flex;gap:0.75rem;align-items:center;justify-content:space-between">
            <div>
              <div style="font-weight:600">${username}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary)">${role}</div>
            </div>
            <button id="logoutBtnMobile" class="btn btn-accent">Cerrar sesión</button>
          </div>
        </div>
      `;
    }

    activateSidebarLinks();

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    const logoutBtnMobile = document.getElementById("logoutBtnMobile");
    if (logoutBtnMobile) logoutBtnMobile.addEventListener("click", logout);

    if (Array.isArray(menuTree) && menuTree.length > 0) {
      const firstView =
        menuTree[0].view || menuTree[0].children?.[0]?.view || "config";
      await loadView(firstView);
      setActiveSidebarItem(firstView);
    } else {
      console.warn("Menu vacío o no válido recibido del backend.");
      const content = document.getElementById("content-container");
      if (content)
        content.innerHTML = `<div class="container py-4"><div class="card p-3">No hay elementos de menú para este usuario.</div></div>`;
    }
  } catch (error) {
    console.error("Error cargando sidebar:", error);
    showError("Error cargando menú. Revisa la consola para más detalles.");
  }
}

function renderSidebar(menuTree) {
  const ul = document.createElement("ul");
  ul.className = "nav flex-column flock-nav";

  for (const item of menuTree) {
    const li = document.createElement("li");
    li.className = "nav-item";

    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren) {
      const submenuId = `submenu-${item.id}`;
      li.innerHTML = `
        <a href="#" class="nav-link d-flex justify-content-between align-items-center" data-bs-toggle="collapse" data-bs-target="#${submenuId}">
          <span><i class="bi ${item.icon}"></i> ${item.title}</span>
          <i class="bi bi-caret-down-fill small"></i>
        </a>
        <ul class="nav flex-column ms-3 collapse" id="${submenuId}">
          ${item.children
            .map(
              (child) => `
            <li class="nav-item">
              <a href="#" class="nav-link" data-view="${child.view}">
                <i class="bi ${child.icon}"></i> <span>${child.title}</span>
              </a>
            </li>
          `
            )
            .join("")}
        </ul>
      `;
    } else {
      li.innerHTML = `
        <a href="#" class="nav-link" data-view="${item.view}">
          <i class="bi ${item.icon}"></i>
          <span>${item.title}</span>
        </a>
      `;
    }

    ul.appendChild(li);
  }

  return ul.outerHTML;
}

function activateSidebarLinks() {
  const links = document.querySelectorAll(
    "#sidebar [data-view], #sidebarMobileContent [data-view]"
  );
  links.forEach((link) => {
    link.replaceWith(link.cloneNode(true));
  });

  const freshLinks = document.querySelectorAll(
    "#sidebar [data-view], #sidebarMobileContent [data-view]"
  );
  freshLinks.forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const view = link.getAttribute("data-view");
      await loadView(view);
      setActiveSidebarItem(view);

      const sidebarMobileEl = document.getElementById("sidebarMobile");
      const bsOffcanvas = bootstrap.Offcanvas.getInstance(sidebarMobileEl);
      if (bsOffcanvas) bsOffcanvas.hide();
    });
  });

  const toggleBtn = document.getElementById("toggle-sidebar");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const offcanvas = new bootstrap.Offcanvas("#sidebarMobile");
      offcanvas.show();
    });
  }
}

// ==========================
// views
// ==========================
async function loadView(viewName) {
  if (!viewName) return;
  try {
    const viewModule = await import(`./views/${viewName}.js`);
    if (viewModule && typeof viewModule.default === "function") {
      await viewModule.default();
    } else {
      console.warn(`Módulo de vista "${viewName}" sin export default() válido.`);
    }
  } catch (error) {
    console.error(`Error cargando vista ${viewName}:`, error);
    const content = document.getElementById("content-container");
    if (content)
      content.innerHTML = `<div class="container py-4"><div class="card p-3">No se pudo cargar la vista "${viewName}". Revisa la consola.</div></div>`;
  }
}

function setActiveSidebarItem(viewName) {
  document.querySelectorAll("[data-view]").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("data-view") === viewName);
  });
}

// ==========================
// auth helpers
// ==========================
async function logout() {
  await supabase.auth.signOut();
  localStorage.clear();
  window.location.href = "/login.html";
}

// ==========================
// init
// ==========================
document.addEventListener("DOMContentLoaded", async () => {
  const { data, error } = await supabase.auth.getSession();
  if (!data.session) {
    if (!window.location.pathname.endsWith("/login.html")) {
      window.location.href = "/login.html";
    }
    return;
  }

  // obtenemos perfil
  const { data: profile, error: errProfile } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", data.session.user.id)
    .single();

  if (errProfile) {
    showError("No se pudo cargar el perfil");
    console.error(errProfile);
    await logout();
    return;
  }

  const username = profile.username;
  const role = profile.role;

  await loadSidebar(username, role);

  // Botón de toggle para escritorio
  const toggleDesktopBtn = document.getElementById("toggle-sidebar-desktop");
  const sidebarIcon = document.getElementById("sidebar-icon");

  if (toggleDesktopBtn) {
    toggleDesktopBtn.addEventListener("click", () => {
      const sidebar = document.getElementById("sidebar");
      const content = document.getElementById("content-container");
      const topbar = document.querySelector(".navbar.flock-topbar");

      sidebar.classList.toggle("sidebar-hidden");

      if (sidebar.classList.contains("sidebar-hidden")) {
        content.style.marginLeft = "0";
        topbar.style.left = "0";

        if (sidebarIcon) {
          sidebarIcon.classList.remove("bi-arrow-left");
          sidebarIcon.classList.add("bi-list");
        }

        toggleDesktopBtn.classList.remove("sidebar-open");
      } else {
        content.style.marginLeft = "250px";
        topbar.style.left = "250px";

        if (sidebarIcon) {
          sidebarIcon.classList.remove("bi-list");
          sidebarIcon.classList.add("bi-arrow-left");
        }

        toggleDesktopBtn.classList.add("sidebar-open");
      }
    });
  }
});
