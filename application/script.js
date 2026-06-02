/* =============================================================
   AutoLog — script.js
  Lógica do frontend. Backend: PHP/MySQL via fetch() em api/*
   ============================================================= */


/* =============================================================
   ESTADO GLOBAL (preenchido no boot)
   ============================================================= */
let __currentUser = null;     // dados do usuário logado, ou null


/* =============================================================
   API HELPER
   ============================================================= */

/**
 * Wrapper de fetch que retorna { ok, data, error, status }.
 * Sempre envia cookies (sessão PHP). Headers JSON automáticos.
 */
async function api(path, { method = 'GET', body = null } = {}) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' }
  };
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res, text;
  try {
    res  = await fetch(path, opts);
    text = await res.text();
  } catch (e) {
    return { ok: false, error: 'Falha de rede: ' + e.message, status: 0 };
  }

  // tenta JSON; se falhar, mostra trecho do texto bruto para debug
  try {
    const json = text ? JSON.parse(text) : {};
    return { ...json, status: res.status };
  } catch {
    const snippet = (text || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 200);
    return {
      ok: false,
      status: res.status,
      error: `Resposta inválida do servidor (HTTP ${res.status}). ${snippet ? 'Detalhe: ' + snippet : ''}`
    };
  }
}


/* =============================================================
   COMPRESSÃO DE IMAGEM (evita estourar post_max_size do PHP)
   ============================================================= */

/**
 * Redimensiona uma imagem (mantendo proporção) e devolve dataURL JPEG.
 * Defaults: lado maior 1280px, qualidade 0.82  → tipicamente < 250 KB.
 */
async function compressImage(file, maxDim = 1280, quality = 0.82) {
  if (!file) return '';
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  // SVG não precisa comprimir
  if (file.type === 'image/svg+xml') return dataUrl;

  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload  = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width  = maxDim;
    } else {
      width  = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // fundo branco para imagens com transparência (PNG) quando vira JPEG
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}


/* =============================================================
   UTILITÁRIOS GERAIS
   ============================================================= */

function formatKmDisplay(value) {
  if (!value) return '—';
  return Number(value).toLocaleString('pt-BR');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}


/* =============================================================
   MODAL DE AUTENTICAÇÃO (apenas LOGIN)
   ============================================================= */

function ensureAuthModal() {
  if (document.getElementById('auth-modal')) return;

  const tpl = document.createElement('div');
  tpl.innerHTML = `
    <div class="auth-modal" id="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div class="auth-backdrop" data-close-auth></div>

      <div class="auth-card">
        <button class="auth-close" type="button" aria-label="Fechar" data-close-auth>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>

        <div class="auth-brand">AutoLog</div>

        <h2 class="auth-title" id="auth-title">Bem-vindo de volta</h2>
        <p class="auth-sub">Faça login com seu email e senha</p>

        <div class="auth-field">
          <label>Email</label>
          <input type="email" id="login-email" placeholder="seuemail@exemplo.com" autocomplete="email">
        </div>

        <div class="auth-field">
          <label>Senha</label>
          <input type="password" id="login-senha" placeholder="••••••••" autocomplete="current-password">
        </div>

        <div class="auth-error" id="login-error"></div>

        <button class="auth-submit" type="button" onclick="handleLogin()">Entrar</button>

        <div class="auth-switch">
          Ainda não tem uma conta?
          <a href="registro.html">Registre-se</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(tpl.firstElementChild);

  document.querySelectorAll('[data-close-auth]').forEach(el => {
    el.addEventListener('click', closeAuthModal);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAuthModal();
  });

  ['login-email', 'login-senha'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
    });
  });
}

function openAuthModal() {
  ensureAuthModal();
  const m = document.getElementById('auth-modal');
  m.classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('login-email')?.focus(), 50);
}

function closeAuthModal() {
  const m = document.getElementById('auth-modal');
  if (m) m.classList.remove('show');
  document.body.style.overflow = '';
}


/* =============================================================
   AUTENTICAÇÃO — handlers
   ============================================================= */

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const err   = document.getElementById('login-error');
  err.textContent = '';

  if (!email || !senha) { err.textContent = 'Preencha email e senha.'; return; }

  const res = await api('api/auth_login.php', { method: 'POST', body: { email, senha } });

  if (!res.ok) { err.textContent = res.error || 'Falha no login.'; return; }

  const target = `perfil.html?u=${encodeURIComponent(res.data.username)}`;
  window.location.href = target;
}

async function logout() {
  await api('api/auth_logout.php', { method: 'POST' });
  window.location.href = 'index.html';
}


/* =============================================================
   NAV — Login button / User chip / Search
   ============================================================= */

function renderNavAuth() {
  const btn = document.querySelector('.btn-login');
  if (!btn) return;

  if (!__currentUser) {
    btn.textContent = 'Login';
    btn.onclick = () => openAuthModal();
    return;
  }

  const chip = document.createElement('div');
  chip.className = 'nav-user';
  chip.innerHTML = `
    <img src="${escapeHtml(__currentUser.foto_perfil)}" alt="">
    <span>@${escapeHtml(__currentUser.username)}</span>
    <button class="nav-user-edit" type="button" title="Editar perfil">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
    <button class="nav-user-logout" type="button" title="Sair">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
      </svg>
    </button>
  `;
  chip.addEventListener('click', e => {
    if (e.target.closest('.nav-user-logout')) { logout(); return; }
    if (e.target.closest('.nav-user-edit'))   { window.location.href = 'editar.html'; return; }
    window.location.href = `perfil.html?u=${encodeURIComponent(__currentUser.username)}`;
  });
  btn.replaceWith(chip);
}

function setupSearch() {
  const wrap  = document.querySelector('.nav-search');
  const input = wrap?.querySelector('input');
  if (!wrap || !input) return;

  const dd = document.createElement('div');
  dd.className = 'search-dropdown';
  dd.hidden = true;
  wrap.appendChild(dd);

  input.setAttribute('placeholder', 'Buscar @usuário…');

  let timer = null;
  async function render(query) {
    const q = query.replace(/^@/, '').trim();
    if (!q) { dd.hidden = true; dd.innerHTML = ''; return; }

    if (!__currentUser) {
      dd.innerHTML = `<div class="search-empty">Faça login para buscar usuários.</div>`;
      dd.hidden = false; return;
    }

    const res = await api(`api/users_search.php?q=${encodeURIComponent(q)}`);
    if (!res.ok) {
      dd.innerHTML = `<div class="search-empty">${escapeHtml(res.error || 'Erro na busca.')}</div>`;
      dd.hidden = false; return;
    }

    const users = res.data?.users || [];
    if (!users.length) {
      dd.innerHTML = `<div class="search-empty">Nenhum usuário encontrado para "${escapeHtml(query)}"</div>`;
      dd.hidden = false; return;
    }

    dd.innerHTML = users.map(u => `
      <a class="search-item" href="perfil.html?u=${encodeURIComponent(u.username)}">
        <img src="${escapeHtml(u.foto_perfil)}" alt="">
        <div class="search-item-info">
          <div class="search-item-name">${escapeHtml(u.nome_display)}</div>
          <div class="search-item-handle">@${escapeHtml(u.username)}</div>
        </div>
        <div class="search-item-count">${u.car_count} ${u.car_count === 1 ? 'carro' : 'carros'}</div>
      </a>
    `).join('');
    dd.hidden = false;
  }

  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => render(e.target.value), 220);
  });
  input.addEventListener('focus', e => { if (e.target.value) render(e.target.value); });

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) dd.hidden = true;
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = dd.querySelector('.search-item');
      if (first) window.location.href = first.getAttribute('href');
    }
  });
}


/* =============================================================
   PÁGINA: PERFIL  (perfil.html)
   ============================================================= */

function getTargetHandle() {
  return new URLSearchParams(window.location.search).get('u');
}

function renderProfileHeader(targetUser, isOwner) {
  const bannerImg = document.querySelector('.banner-img');
  if (bannerImg && targetUser.foto_banner) bannerImg.src = targetUser.foto_banner;

  const avatar = document.querySelector('.avatar');
  if (avatar && targetUser.foto_perfil) avatar.src = targetUser.foto_perfil;

  const nm = document.querySelector('.profile-name');
  const hd = document.querySelector('.profile-handle');
  const bi = document.querySelector('.profile-bio');
  if (nm) nm.textContent = targetUser.nome_display;
  if (hd) hd.textContent = '@' + targetUser.username;
  if (bi) bi.textContent = targetUser.sobre || 'Este usuário ainda não escreveu uma bio.';

  const btnAdd = document.querySelector('.btn-add');
  if (btnAdd) btnAdd.style.display = isOwner ? '' : 'none';

  document.title = `AutoLog — @${targetUser.username}`;
}

function renderCarsGrid(cars, isOwner) {
  const grid    = document.getElementById('cars-grid');
  const counter = document.getElementById('car-count');
  if (!grid) return;

  if (counter) counter.textContent = cars.length;

  if (!cars.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚗</div>
        <div class="empty-title">Nenhum carro ainda</div>
        <div class="empty-sub">${
          isOwner
            ? 'Clique em "Adicionar Carro" para registrar seu primeiro veículo.'
            : 'Este usuário ainda não cadastrou nenhum carro.'
        }</div>
      </div>`;
    return;
  }

  const fallback = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80';

  grid.innerHTML = cars.map((car, i) => `
    <a class="car-card" style="animation-delay: ${i * 0.07}s; text-decoration:none; color:inherit; cursor:pointer"
       href="carro.html?id=${encodeURIComponent(car.id)}">
      <div class="car-img-wrap">
        <img class="car-img"
             src="${escapeHtml(car.foto_capa || fallback)}"
             alt="${escapeHtml(car.modelo)}"
             onerror="this.src='${fallback}'"
             loading="lazy">
        <div class="car-img-overlay"></div>
        <span class="car-badge">${escapeHtml(car.motor || '—')}</span>
        ${car.quilometragem ? `<span class="car-km-badge">${formatKmDisplay(car.quilometragem)} km</span>` : ''}
      </div>
      <div class="car-body">
        <div class="car-name">${escapeHtml(car.modelo)}</div>
        <div class="car-desc">${escapeHtml(car.descricao || 'Sem descrição.')}</div>
        <div class="car-meta">
          <div class="car-tags">
            ${car.combustivel ? `<span class="tag fuel">${escapeHtml(car.combustivel)}</span>` : ''}
            ${car.cor         ? `<span class="tag">${escapeHtml(car.cor)}</span>`              : ''}
          </div>
          <span class="car-date">Cadastrado em ${escapeHtml(car.data_cadastro || '—')}</span>
        </div>
      </div>
    </a>
  `).join('');
}

async function initProfilePage() {
  if (!document.getElementById('cars-grid')) return;

  if (!__currentUser) {
    openAuthModal();
    const sec = document.querySelector('.section');
    if (sec) sec.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <div class="empty-title">Faça login para continuar</div>
        <div class="empty-sub">Você precisa estar logado para visualizar perfis e carros.</div>
      </div>`;
    return;
  }

  const handle = getTargetHandle() || __currentUser.username;

  const uRes = await api(`api/users_get.php?handle=${encodeURIComponent(handle)}`);
  if (!uRes.ok) {
    const sec = document.querySelector('.section');
    if (sec) sec.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Usuário não encontrado</div>
        <div class="empty-sub">${escapeHtml(uRes.error || 'Tente novamente.')}</div>
      </div>`;
    return;
  }

  const target  = uRes.data;
  const isOwner = target.id === __currentUser.id;
  renderProfileHeader(target, isOwner);

  const cRes = await api(`api/cars_list.php?handle=${encodeURIComponent(target.username)}`);
  if (!cRes.ok) {
    document.getElementById('cars-grid').innerHTML =
      `<div class="empty-state"><div class="empty-title">${escapeHtml(cRes.error || 'Erro')}</div></div>`;
    return;
  }
  renderCarsGrid(cRes.data.cars || [], isOwner);
}

function checkToast() {
  const toast    = document.getElementById('toast');
  const toastSub = document.getElementById('toast-sub');
  if (!toast) return;
  const msg = sessionStorage.getItem('autolog_toast');
  if (!msg) return;
  sessionStorage.removeItem('autolog_toast');
  toastSub.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4500);
}


/* =============================================================
   PÁGINA: CADASTRO DE CARRO  (cadastrocarro.html)
   ============================================================= */

/* =============================================================
   UPLOAD DE IMAGENS — buffers persistentes
   ----------------------------------------
   <input type="file"> não acumula seleções e perde o arquivo ao
   ter seu innerHTML reescrito. Esses buffers vivem no JS e são a
   FONTE DA VERDADE — os <input> servem só como porta de entrada.

   Limites: cover=1, gallery=5, post=4, avatar=1, banner=1.
   ============================================================= */

const __fileBuffers = {
  cover:   null,     // { file, dataUrl? }
  gallery: [],       // [{ file, dataUrl? }]
  post:    [],
  avatar:  null,
  banner:  null,
};

/** Lê o arquivo como dataURL (memoiza em item.dataUrl). */
function ensureDataUrl(item) {
  if (item.dataUrl) return Promise.resolve(item.dataUrl);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => { item.dataUrl = r.result; resolve(r.result); };
    r.onerror = reject;
    r.readAsDataURL(item.file);
  });
}

/* ── COVER (cadastro de carro) ─────────────────────────────── */

function handleCoverPick(input) {
  const f = input.files[0];
  if (!f) return;
  __fileBuffers.cover = { file: f };
  renderCoverPreview();
  input.value = '';  // permite re-selecionar o mesmo arquivo
}

function renderCoverPreview() {
  const box = document.getElementById('cover-box');
  if (!box) return;

  if (!__fileBuffers.cover) {
    box.classList.remove('has-preview');
    box.innerHTML = `
      <input type="file" id="cover-input" accept="image/*" onchange="handleCoverPick(this)">
      <div class="upload-icon">📸</div>
      <div class="upload-label">Foto de Exibição</div>
    `;
    return;
  }

  box.classList.add('has-preview');
  ensureDataUrl(__fileBuffers.cover).then(url => {
    box.innerHTML = `
      <input type="file" id="cover-input" accept="image/*" onchange="handleCoverPick(this)">
      <img class="preview-thumb" src="${url}" alt="Capa">
      <button type="button" class="thumb-remove cover-remove" onclick="clearCover(event)" title="Remover">×</button>
    `;
  });
}

function clearCover(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  __fileBuffers.cover = null;
  renderCoverPreview();
}

/* ── GALLERY (cadastro de carro, até 5) ────────────────────── */

function handleGalleryPick(input) {
  for (const f of Array.from(input.files)) {
    if (__fileBuffers.gallery.length >= 5) break;
    __fileBuffers.gallery.push({ file: f });
  }
  renderGalleryPreviews();
  input.value = '';
}

function renderGalleryPreviews() {
  const placeholder = document.getElementById('gallery-placeholder');
  const previews    = document.getElementById('gallery-previews');
  if (!placeholder || !previews) return;

  if (__fileBuffers.gallery.length === 0) {
    placeholder.style.display = 'flex';
    previews.style.display    = 'none';
    previews.innerHTML        = '';
    return;
  }

  placeholder.style.display = 'none';
  previews.style.display    = 'flex';
  previews.innerHTML        = '';

  __fileBuffers.gallery.forEach((item, idx) => {
    previews.appendChild(buildThumb(item, () => {
      __fileBuffers.gallery.splice(idx, 1);
      renderGalleryPreviews();
    }));
  });

  if (__fileBuffers.gallery.length < 5) {
    previews.appendChild(buildAddMore('gallery-add', 'handleGalleryPick',
      `${__fileBuffers.gallery.length}/5`, true));
  } else {
    const counter = document.createElement('div');
    counter.className = 'thumb-counter';
    counter.textContent = '5/5 (limite)';
    previews.appendChild(counter);
  }
}

/* ── POST IMAGES (modal de novo post, até 4) ───────────────── */

function handlePostImagesPick(input) {
  for (const f of Array.from(input.files)) {
    if (__fileBuffers.post.length >= 4) break;
    __fileBuffers.post.push({ file: f });
  }
  renderPostImagesPreviews();
  input.value = '';
}

function renderPostImagesPreviews() {
  const box      = document.getElementById('post-images-box');
  const previews = document.getElementById('post-images-previews');
  if (!box || !previews) return;

  if (__fileBuffers.post.length === 0) {
    box.style.display      = '';
    previews.style.display = 'none';
    previews.innerHTML     = '';
    return;
  }

  box.style.display      = 'none';   // esconde o uploader inicial
  previews.style.display = 'flex';
  previews.innerHTML     = '';

  __fileBuffers.post.forEach((item, idx) => {
    previews.appendChild(buildThumb(item, () => {
      __fileBuffers.post.splice(idx, 1);
      renderPostImagesPreviews();
    }));
  });

  if (__fileBuffers.post.length < 4) {
    previews.appendChild(buildAddMore('post-add', 'handlePostImagesPick',
      `${__fileBuffers.post.length}/4`, true));
  } else {
    const counter = document.createElement('div');
    counter.className = 'thumb-counter';
    counter.textContent = '4/4 (limite)';
    previews.appendChild(counter);
  }
}

/* ── AVATAR & BANNER (registro de usuário) ─────────────────── */

function handleAvatarPick(input) {
  const f = input.files[0];
  if (!f) return;
  __fileBuffers.avatar = { file: f };
  renderAvatarPreview();
  input.value = '';
}

function renderAvatarPreview() {
  const box = document.getElementById('avatar-box');
  if (!box) return;
  if (!__fileBuffers.avatar) {
    box.classList.remove('has-preview');
    box.innerHTML = `
      <input type="file" id="avatar-input" accept="image/*" onchange="handleAvatarPick(this)">
      <div class="upload-icon">👤</div>
      <div class="upload-label">Adicione uma<br>foto de perfil</div>
    `;
    return;
  }
  box.classList.add('has-preview');
  ensureDataUrl(__fileBuffers.avatar).then(url => {
    box.innerHTML = `
      <input type="file" id="avatar-input" accept="image/*" onchange="handleAvatarPick(this)">
      <img class="preview-thumb" src="${url}" alt="Avatar">
      <button type="button" class="thumb-remove cover-remove" onclick="clearAvatar(event)" title="Remover">×</button>
    `;
  });
}

function clearAvatar(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  __fileBuffers.avatar = null;
  renderAvatarPreview();
}

function handleBannerPick(input) {
  const f = input.files[0];
  if (!f) return;
  __fileBuffers.banner = { file: f };
  renderBannerPreview();
  input.value = '';
}

function renderBannerPreview() {
  const box = document.getElementById('banner-box');
  if (!box) return;
  if (!__fileBuffers.banner) {
    box.classList.remove('has-preview');
    box.innerHTML = `
      <input type="file" id="banner-input" accept="image/*" onchange="handleBannerPick(this)">
      <div class="upload-icon">🖼️</div>
      <div class="upload-label">Adicione um banner ao seu perfil</div>
    `;
    return;
  }
  box.classList.add('has-preview');
  ensureDataUrl(__fileBuffers.banner).then(url => {
    box.innerHTML = `
      <input type="file" id="banner-input" accept="image/*" onchange="handleBannerPick(this)">
      <img class="preview-thumb" src="${url}" alt="Banner">
      <button type="button" class="thumb-remove cover-remove" onclick="clearBanner(event)" title="Remover">×</button>
    `;
  });
}

function clearBanner(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  __fileBuffers.banner = null;
  renderBannerPreview();
}

/* ── HELPERS DE BUILD (DRY) ────────────────────────────────── */

function buildThumb(item, onRemove) {
  const wrap = document.createElement('div');
  wrap.className = 'thumb-wrap';

  const img = document.createElement('img');
  img.className = 'gallery-thumb';
  ensureDataUrl(item).then(url => img.src = url);

  const rm = document.createElement('button');
  rm.type      = 'button';
  rm.className = 'thumb-remove';
  rm.innerHTML = '×';
  rm.title     = 'Remover';
  rm.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    onRemove();
  };

  wrap.appendChild(img);
  wrap.appendChild(rm);
  return wrap;
}

function buildAddMore(idSuffix, handlerName, label, multi) {
  const inputId = `__addmore_${idSuffix}_${Date.now()}`;
  const wrap = document.createElement('label');
  wrap.className = 'thumb-add';
  wrap.htmlFor = inputId;
  wrap.innerHTML = `
    <span class="thumb-add-icon">+</span>
    <small>${label}</small>
    <input type="file" id="${inputId}" accept="image/*" ${multi ? 'multiple' : ''}
           style="display:none" onchange="${handlerName}(this)">
  `;
  return wrap;
}

/* ── ALIASES (compatibilidade com HTML antigo) ─────────────── */
const previewCover       = handleCoverPick;
const previewGallery     = handleGalleryPick;
const previewPostImages  = handlePostImagesPick;
const previewAvatar      = handleAvatarPick;
const previewBanner      = handleBannerPick;


function updateProgress() {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
  const max = document.body.scrollHeight - window.innerHeight;
  bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
}

function formatPlaca(el) {
  let v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 7);
  el.value = v;
}

function formatKm(el) {
  let v = el.value.replace(/\D/g, '');
  el.value = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function required(id) {
  const el = document.getElementById(id);
  if (!el) return true;
  const ok = el.value.trim().length > 0;
  el.classList.toggle('invalid', !ok);
  return ok;
}

function validateAllCar() {
  const fields = ['nome', 'descricao', 'placa', 'renavam',
                  'fabricante', 'ano', 'cidade', 'estado',
                  'combustivel', 'km', 'cor', 'motor', 'documentacao'];
  const results = fields.map(required);
  const chassiEl = document.getElementById('chassi');
  const chassiOk = chassiEl ? chassiEl.value.trim().length >= 11 : true;
  if (chassiEl) chassiEl.classList.toggle('invalid', !chassiOk);
  return results.every(Boolean) && chassiOk;
}

async function submitForm() {
  if (!__currentUser) { openAuthModal(); return; }

  if (!validateAllCar()) {
    const first = document.querySelector('.invalid');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const btn = document.getElementById('btn-submit');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  // capa e galeria — lidas dos buffers persistentes (não dos inputs)
  const coverFile    = __fileBuffers.cover ? __fileBuffers.cover.file : null;
  const galleryFiles = __fileBuffers.gallery.map(it => it.file);

  let foto = '';
  let fotos_extra = [];
  try {
    if (coverFile)           foto        = await compressImage(coverFile,    1280, 0.82);
    if (galleryFiles.length) fotos_extra = await Promise.all(galleryFiles.map(f => compressImage(f, 1000, 0.78)));
  } catch (e) {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    alert('Erro ao processar imagens: ' + e.message);
    return;
  }

  const payload = {
    modelo:        document.getElementById('nome').value.trim(),
    descricao:     document.getElementById('descricao').value.trim(),
    placa:         document.getElementById('placa').value.trim(),
    renavam:       document.getElementById('renavam').value.trim(),
    chassi:        document.getElementById('chassi').value.trim().toUpperCase(),
    fabricante:    document.getElementById('fabricante').value.trim(),
    ano:           parseInt(document.getElementById('ano').value, 10) || 0,
    cidade:        document.getElementById('cidade').value.trim(),
    estado:        document.getElementById('estado').value.trim().toUpperCase(),
    combustivel:   document.getElementById('combustivel').value,
    km:            document.getElementById('km').value.replace(/\./g, ''),
    cambio:        document.getElementById('cambio').value,
    cor:           document.getElementById('cor').value.trim(),
    motor:         document.getElementById('motor').value.trim(),
    documentacao:  document.getElementById('documentacao').value.trim(),
    foto,
    fotos_extra,
  };

  const res = await api('api/cars_create.php', { method: 'POST', body: payload });

  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }

  if (!res.ok) {
    alert(res.error || 'Erro ao cadastrar o carro.');
    return;
  }

  sessionStorage.setItem('autolog_toast', `${payload.modelo} adicionado com sucesso!`);
  window.location.href = `perfil.html?u=${encodeURIComponent(__currentUser.username)}`;
}

function initCadastroPage() {
  const isCadastro = document.querySelector('.page-title')?.textContent?.includes('Cadastro de Carro');
  if (!isCadastro) return;
  if (!__currentUser) openAuthModal();
  // reset buffers (caso o usuário tenha cadastrado outro carro antes)
  __fileBuffers.cover   = null;
  __fileBuffers.gallery = [];
  renderCoverPreview();
  renderGalleryPreviews();
}


/* =============================================================
   PÁGINA: REGISTRO  (registro.html)
   ============================================================= */

function formatCpfCnpj(el) {
  let v = el.value.replace(/\D/g, '');
  if (v.length <= 11) {
    v = v.replace(/(\d{3})(\d)/, '$1.$2')
         .replace(/(\d{3})(\d)/, '$1.$2')
         .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    v = v.slice(0, 14)
         .replace(/^(\d{2})(\d)/, '$1.$2')
         .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
         .replace(/\.(\d{3})(\d)/, '.$1/$2')
         .replace(/(\d{4})(\d)/, '$1-$2');
  }
  el.value = v;
}

function formatPhone(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
  } else if (v.length > 6) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
  } else if (v.length > 0) {
    v = v.replace(/^(\d{0,2})/, '($1');
  }
  el.value = v;
}

function formatCep(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.replace(/^(\d{5})(\d{1,3}).*/, '$1-$2');
  el.value = v;
}

function formatDate(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
  el.value = v;
}

async function lookupCep(el) {
  const cep = el.value.replace(/\D/g, '');
  if (cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) return;
    if (d.logradouro && !document.getElementById('rua').value)    document.getElementById('rua').value    = d.logradouro;
    if (d.bairro    && !document.getElementById('bairro').value)  document.getElementById('bairro').value = d.bairro;
    if (d.localidade&& !document.getElementById('cidade').value)  document.getElementById('cidade').value = d.localidade;
    if (d.uf        && !document.getElementById('estado').value)  document.getElementById('estado').value = d.uf;
  } catch (e) { /* ViaCEP fora do ar — ignora */ }
}

function validateRegister() {
  const ids = ['username','nome_display','nome_completo','email','senha','senha_confirma',
               'cpf_cnpj','data_nasc','telefone','cep','rua','numero','bairro','cidade','estado'];
  const results = ids.map(required);

  const u = document.getElementById('username');
  if (u && !/^[a-zA-Z0-9_.]{3,30}$/.test(u.value.trim())) {
    u.classList.add('invalid'); results.push(false);
  }
  const e = document.getElementById('email');
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.value.trim())) {
    e.classList.add('invalid'); results.push(false);
  }
  const s = document.getElementById('senha').value;
  const strong = s.length >= 8 && /[A-Z]/.test(s) && /\d/.test(s) && /[@#$!%&*?\-_.+]/.test(s);
  if (!strong) {
    document.getElementById('senha').classList.add('invalid');
    results.push(false);
  }
  const s2 = document.getElementById('senha_confirma');
  if (s !== s2.value) { s2.classList.add('invalid'); results.push(false); }

  return results.every(Boolean);
}

async function submitRegister() {
  const errBox = ensureRegError();
  errBox.textContent = '';

  if (!validateRegister()) {
    errBox.textContent = 'Por favor, revise os campos destacados.';
    const first = document.querySelector('.invalid');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const btn = document.getElementById('btn-submit');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  // imagens dos buffers persistentes (avatar redondo 512px; banner panorâmico 1280px)
  const avatarFile = __fileBuffers.avatar ? __fileBuffers.avatar.file : null;
  const bannerFile = __fileBuffers.banner ? __fileBuffers.banner.file : null;
  let foto_perfil = '';
  let foto_banner = '';
  try {
    if (avatarFile) foto_perfil = await compressImage(avatarFile, 512,  0.82);
    if (bannerFile) foto_banner = await compressImage(bannerFile, 1280, 0.78);
  } catch (e) {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    errBox.textContent = 'Erro ao processar imagens: ' + e.message;
    return;
  }

  const payload = {
    username:       document.getElementById('username').value.trim(),
    nome_display:   document.getElementById('nome_display').value.trim(),
    nome_completo:  document.getElementById('nome_completo').value.trim(),
    email:          document.getElementById('email').value.trim().toLowerCase(),
    senha:          document.getElementById('senha').value,
    senha_confirma: document.getElementById('senha_confirma').value,
    sobre:          document.getElementById('sobre').value.trim(),
    cpf_cnpj:       document.getElementById('cpf_cnpj').value,
    telefone:       document.getElementById('telefone').value,
    telefone2:      document.getElementById('telefone2').value,
    data_nasc:      document.getElementById('data_nasc').value,
    cep:            document.getElementById('cep').value,
    rua:            document.getElementById('rua').value.trim(),
    numero:         document.getElementById('numero').value.trim(),
    bairro:         document.getElementById('bairro').value.trim(),
    cidade:         document.getElementById('cidade').value.trim(),
    estado:         document.getElementById('estado').value.trim().toUpperCase(),
    foto_perfil,
    foto_banner,
  };

  const res = await api('api/auth_register.php', { method: 'POST', body: payload });

  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }

  if (!res.ok) {
    errBox.textContent = res.error || 'Erro no cadastro.';
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  sessionStorage.setItem('autolog_toast', `Bem-vindo, @${res.data.username}!`);
  window.location.href = `perfil.html?u=${encodeURIComponent(res.data.username)}`;
}

function ensureRegError() {
  let box = document.getElementById('reg-page-error');
  if (box) return box;
  box = document.createElement('div');
  box.id = 'reg-page-error';
  box.className = 'auth-error';
  box.style.margin = '12px 0';
  const submitRow = document.querySelector('.submit-row');
  if (submitRow) submitRow.parentNode.insertBefore(box, submitRow);
  return box;
}

function initRegistroPage() {
  const isRegistro = document.querySelector('.page-title')?.textContent?.includes('Registre-se');
  if (!isRegistro) return;
  // reset buffers
  __fileBuffers.avatar = null;
  __fileBuffers.banner = null;
  renderAvatarPreview();
  renderBannerPreview();
}


/* =============================================================
   PÁGINA: INDEX  (index.html)
   ============================================================= */

function initIndexPage() {
  const cta = document.getElementById('btn-enter');
  if (!cta) return;

  cta.addEventListener('click', e => {
    e.preventDefault();
    if (__currentUser) {
      window.location.href = `perfil.html?u=${encodeURIComponent(__currentUser.username)}`;
    } else {
      openAuthModal();
    }
  });
}


/* =============================================================
   PÁGINA: CARRO  (carro.html)
   ============================================================= */

const TIPO_LABELS = {
  preventiva:   'Preventiva',
  corretiva:    'Corretiva',
  estetica:     'Estética / Conservação',
  upgrade:      'Upgrade / Modificação',
  documentacao: 'Documentação / Burocracia',
};

let __carData    = null;   // { car, owner, is_owner }
let __postFilter = 'all';  // tipo atualmente filtrado
let __carouselIndex = 0;
let __selectedTipo  = null; // no modal de novo post

function getCarIdFromUrl() {
  return parseInt(new URLSearchParams(window.location.search).get('id'), 10) || 0;
}

/* ── CARROSSEL ── */
function renderCarousel(images) {
  const track = document.getElementById('carousel-track');
  const dots  = document.getElementById('carousel-dots');
  const prev  = document.getElementById('carousel-prev');
  const next  = document.getElementById('carousel-next');
  if (!track) return;

  const fallback = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1600&q=80';
  const list = images.length ? images : [fallback];

  track.innerHTML = list.map(src =>
    `<div class="carousel-slide" style="background-image:url('${escapeHtml(src).replace(/'/g, '%27')}')"></div>`
  ).join('');

  dots.innerHTML = list.map((_, i) =>
    `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Slide ${i+1}"></button>`
  ).join('');

  __carouselIndex = 0;

  function goTo(i) {
    const max = list.length;
    __carouselIndex = (i + max) % max;
    track.style.transform = `translateX(-${__carouselIndex * 100}%)`;
    dots.querySelectorAll('.carousel-dot').forEach((d, idx) => {
      d.classList.toggle('active', idx === __carouselIndex);
    });
  }

  prev.onclick = () => goTo(__carouselIndex - 1);
  next.onclick = () => goTo(__carouselIndex + 1);
  dots.querySelectorAll('.carousel-dot').forEach(d => {
    d.onclick = () => goTo(parseInt(d.dataset.i, 10));
  });

  // só mostra setas/dots se houver mais de 1 imagem
  const showNav = list.length > 1;
  prev.style.display = showNav ? '' : 'none';
  next.style.display = showNav ? '' : 'none';
  dots.style.display = showNav ? '' : 'none';

  // setas do teclado
  document.addEventListener('keydown', e => {
    if (!document.getElementById('carousel-track')) return;
    if (document.querySelector('.auth-modal.show')) return;  // não interfere com modais
    if (e.key === 'ArrowLeft')  goTo(__carouselIndex - 1);
    if (e.key === 'ArrowRight') goTo(__carouselIndex + 1);
  }, { once: true });
}

/* ── FICHA + CHIP DO DONO ── */
function renderCarHeader() {
  const { car, owner } = __carData;

  document.title = `AutoLog — ${car.modelo}`;
  document.getElementById('car-title').textContent = car.modelo;

  // descrição
  document.getElementById('car-desc').textContent = car.descricao || 'Sem descrição.';

  // ficha
  const localizacao = [car.cidade, car.estado].filter(Boolean).join(' - ');
  const specs = [
    ['Localização',  localizacao || '—'],
    ['Ano',          car.ano || '—'],
    ['Combustível',  car.combustivel || '—'],
    ['KM',           car.quilometragem ? Number(car.quilometragem).toLocaleString('pt-BR') : '—'],
    ['Câmbio',       car.cambio || '—'],
    ['Cor',          car.cor || '—'],
    ['Motor',        car.motor || '—'],
    ['Fabricante',   car.fabricante || '—'],
  ];
  // documentação só aparece para o dono (privacidade)
  if (__carData.is_owner && car.documentacao) {
    specs.push(['Documentação', car.documentacao]);
  }

  document.getElementById('spec-list').innerHTML = specs.map(([k, v]) =>
    `<li><strong>${escapeHtml(k)}</strong>${escapeHtml(String(v))}</li>`
  ).join('');

  // chip do dono
  const chip = document.getElementById('owner-chip');
  chip.href = `perfil.html?u=${encodeURIComponent(owner.username)}`;
  chip.querySelector('.owner-chip-avatar').src = owner.foto_perfil || '';
  chip.querySelector('.owner-chip-name').textContent   = owner.nome_display;
  chip.querySelector('.owner-chip-handle').textContent = '@' + owner.username;
  chip.querySelector('.owner-chip-bio').textContent    = owner.sobre || '';
}

/* ── POSTS ── */
function renderPostsList(posts) {
  const list = document.getElementById('posts-list');
  if (!list) return;

  if (!posts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-title">${__postFilter === 'all' ? 'Nenhum post ainda' : 'Nenhum post nesse filtro'}</div>
        <div class="empty-sub">${
          __carData.is_owner && __postFilter === 'all'
            ? 'Clique em "Novo Post" para registrar uma manutenção ou modificação.'
            : 'Tente outro filtro ou volte mais tarde.'
        }</div>
      </div>`;
    return;
  }

  list.innerHTML = posts.map(p => {
    const imgs = Array.isArray(p.imagens) ? p.imagens : [];
    const imgGrid = imgs.length ? `
      <div class="post-images">
        ${imgs.map(src => `<img src="${escapeHtml(src)}" alt="" loading="lazy">`).join('')}
      </div>` : '';

    return `
      <div class="post-card">
        <div class="post-head">
          <img class="post-avatar" src="${escapeHtml(p.foto_perfil || '')}" alt="">
          <div class="post-author">
            <div class="post-author-name">${escapeHtml(p.nome_display)}</div>
            <div class="post-author-handle">@${escapeHtml(p.username)}</div>
          </div>
          <span class="post-tipo-badge" data-tipo="${escapeHtml(p.tipo)}">
            <span class="filter-dot" data-dot="${escapeHtml(p.tipo)}"></span>
            ${escapeHtml(TIPO_LABELS[p.tipo] || p.tipo)}
          </span>
        </div>

        <div class="post-title">Notificação do Sistema:</div>
        <div class="post-sub">Alteração de componente registrada com sucesso.</div>

        <div class="post-body">
          <ul>
            <li><strong>Veículo:</strong> ${escapeHtml(__carData.car.modelo)}</li>
            <li><strong>Item:</strong> ${escapeHtml(p.item)} ${escapeHtml(p.modificacao ? '— ' + p.modificacao : '')}</li>
            <li><strong>Data:</strong> ${escapeHtml(p.data_post)} às ${escapeHtml(p.hora_post)}</li>
            <li><strong>Responsável:</strong> ${escapeHtml(p.responsavel)}</li>
          </ul>
        </div>

        ${imgGrid}

        <div class="post-footer">
          <button class="post-share-btn" type="button" onclick="sharePost(${p.id})" title="Compartilhar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5"  r="3"/>
              <circle cx="6"  cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function updateFilterCounts(counts) {
  document.querySelectorAll('.filter-chip [data-count]').forEach(el => {
    const k = el.getAttribute('data-count');
    el.textContent = counts[k] || 0;
  });
}

async function loadPosts() {
  const carId = __carData.car.id;
  const tipoParam = __postFilter === 'all' ? '' : `&tipo=${encodeURIComponent(__postFilter)}`;
  const res = await api(`api/posts_list.php?car_id=${carId}${tipoParam}`);
  if (!res.ok) {
    document.getElementById('posts-list').innerHTML =
      `<div class="empty-state"><div class="empty-title">${escapeHtml(res.error || 'Erro ao carregar posts')}</div></div>`;
    return;
  }
  renderPostsList(res.data.posts || []);
  updateFilterCounts(res.data.counts || {});
}

function setupPostFilters() {
  const row = document.getElementById('filter-row');
  if (!row) return;
  row.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      row.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      __postFilter = chip.dataset.tipo;
      loadPosts();
    });
  });
}

/* ── MODAL NOVO POST ── */
function openPostModal() {
  const modal = document.getElementById('post-modal');
  if (!modal) return;
  // reset
  __selectedTipo = null;
  document.querySelectorAll('.tipo-pick').forEach(b => b.classList.remove('selected'));
  ['post-item', 'post-mod', 'post-resp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('post-error').textContent = '';
  // reset buffer de imagens do post e re-renderiza vazio
  __fileBuffers.post = [];
  renderPostImagesPreviews();
  modal.hidden = false;
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closePostModal() {
  const modal = document.getElementById('post-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.hidden = true;
  document.body.style.overflow = '';
}

function setupPostModal() {
  // botões
  const btnNew = document.getElementById('btn-new-post');
  if (btnNew) btnNew.addEventListener('click', openPostModal);

  document.querySelectorAll('[data-close-post]').forEach(el => {
    el.addEventListener('click', closePostModal);
  });

  // chips de tipo
  document.querySelectorAll('.tipo-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tipo-pick').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      __selectedTipo = btn.dataset.tipo;
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePostModal();
  });
}

async function submitPost() {
  const errBox = document.getElementById('post-error');
  errBox.textContent = '';

  const item = document.getElementById('post-item').value.trim();
  const mod  = document.getElementById('post-mod').value.trim();
  const resp = document.getElementById('post-resp').value.trim();

  if (!__selectedTipo)             { errBox.textContent = 'Selecione o tipo de modificação.'; return; }
  if (!item)                       { errBox.textContent = 'Informe o item/componente.'; return; }
  if (!mod)                        { errBox.textContent = 'Descreva a modificação realizada.'; return; }
  if (!resp)                       { errBox.textContent = 'Informe o responsável.'; return; }

  const btn = document.querySelector('#post-modal .auth-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Publicando…'; }

  // imagens do buffer persistente, comprimidas
  const files = __fileBuffers.post.map(it => it.file);
  let imagens = [];
  try {
    imagens = await Promise.all(files.map(f => compressImage(f, 1000, 0.78)));
  } catch (e) {
    errBox.textContent = 'Erro ao processar imagens: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = 'Publicar'; }
    return;
  }

  const res = await api('api/posts_create.php', {
    method: 'POST',
    body: {
      car_id:      __carData.car.id,
      tipo:        __selectedTipo,
      item,
      modificacao: mod,
      responsavel: resp,
      imagens,
    }
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Publicar'; }

  if (!res.ok) {
    errBox.textContent = res.error || 'Falha ao publicar.';
    return;
  }

  closePostModal();

  // toast
  const toast    = document.getElementById('toast');
  const toastSub = document.getElementById('toast-sub');
  if (toast && toastSub) {
    toastSub.textContent = `${item} registrado em ${__carData.car.modelo}.`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  }

  // recarrega posts (mantém o filtro atual mas reseta para "Todos" se o tipo postado
  // não estiver no filtro, para o usuário ver o que acabou de publicar)
  if (__postFilter !== 'all' && __postFilter !== __selectedTipo) {
    __postFilter = 'all';
    document.querySelectorAll('.filter-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.tipo === 'all');
    });
  }
  await loadPosts();
}

/** Share API nativa (ou copy-to-clipboard como fallback) */
async function sharePost(postId) {
  const url = `${window.location.origin}${window.location.pathname}?id=${__carData.car.id}#post-${postId}`;
  const text = `Confira esta atualização do ${__carData.car.modelo} no AutoLog`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'AutoLog', text, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copiado para a área de transferência!');
    }
  } catch (e) { /* user cancelou */ }
}

/* ── INIT da página de carro ── */
async function initCarPage() {
  // só roda se tem o carousel-track (= carro.html)
  if (!document.getElementById('carousel-track')) return;

  if (!__currentUser) {
    openAuthModal();
    const page = document.querySelector('.car-page');
    if (page) page.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <div class="empty-title">Faça login para continuar</div>
        <div class="empty-sub">Você precisa estar logado para visualizar a página do carro.</div>
      </div>`;
    return;
  }

  const carId = getCarIdFromUrl();
  if (!carId) {
    document.querySelector('.car-page').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Carro não especificado</div>
        <div class="empty-sub">URL inválida — falta o parâmetro ?id=</div>
      </div>`;
    return;
  }

  const res = await api(`api/cars_get.php?id=${carId}`);
  if (!res.ok) {
    document.querySelector('.car-page').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Carro não encontrado</div>
        <div class="empty-sub">${escapeHtml(res.error || 'Tente novamente.')}</div>
      </div>`;
    return;
  }

  __carData = res.data;

  // Carrossel: capa + extras
  const images = [];
  if (__carData.car.foto_capa) images.push(__carData.car.foto_capa);
  if (Array.isArray(__carData.car.fotos_extra)) images.push(...__carData.car.fotos_extra);

  renderCarousel(images);
  renderCarHeader();

  // "Novo Post" só aparece para o dono
  const btnNew = document.getElementById('btn-new-post');
  if (btnNew) btnNew.style.display = __carData.is_owner ? '' : 'none';

  // Ações do dono (editar / excluir) — só aparecem para ele
  const actions = document.getElementById('car-owner-actions');
  if (actions) actions.style.display = __carData.is_owner ? 'flex' : 'none';
  const editLink = document.getElementById('btn-edit-car');
  if (editLink) editLink.href = `editarcarro.html?id=${__carData.car.id}`;

  setupPostFilters();
  setupPostModal();
  await loadPosts();
}


/* =============================================================
   PÁGINA: EDIÇÃO DE PERFIL  (editar.html)
   ============================================================= */

/* senha forte (compartilhado) */
function isStrongPassword(s) {
  return s.length >= 8 && /[A-Z]/.test(s) && /\d/.test(s) && /[@#$!%&*?\-_.+]/.test(s);
}

function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }

/* valida formato apenas se preenchido */
function validateOptional(id, kind) {
  const el = document.getElementById(id);
  if (!el) return true;
  const v = (el.value || '').trim();
  if (v === '') { el.classList.remove('invalid'); return true; }

  let ok = true;
  switch (kind) {
    case 'email':       ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); break;
    case 'phone':       { const d = digitsOnly(v); ok = d.length === 10 || d.length === 11; break; }
    case 'cep':         ok = digitsOnly(v).length === 8; break;
    case 'uf':          ok = /^[A-Z]{2}$/.test(v.toUpperCase()); break;
    case 'displayName': ok = v.length >= 2; break;
    case 'fullName':    ok = v.length >= 3; break;
    default: ok = true;
  }
  el.classList.toggle('invalid', !ok);
  return ok;
}

/* Helpers de formatação para exibir dados vindos do banco */
function formatDisplayPhone(d) {
  d = digitsOnly(d || '');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return d;
}
function formatDisplayCep(d) {
  d = digitsOnly(d || '');
  return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, '$1-$2') : d;
}
function formatDisplayCpfCnpj(d) {
  d = digitsOnly(d || '');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return d;
}


/* Pré-popular o formulário */
async function initEditarPage() {
  const isEditar = document.querySelector('.page-title')?.textContent?.includes('Editar Perfil');
  if (!isEditar) return;

  if (!__currentUser) {
    openAuthModal();
    return;
  }

  __fileBuffers.avatar = null;
  __fileBuffers.banner = null;

  const res = await api('api/auth_me_full.php');
  if (!res.ok) {
    alert(res.error || 'Não foi possível carregar seu perfil.');
    return;
  }

  const u = res.data || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

  set('username',      u.username);
  set('nome_display',  u.nome_display);
  set('nome_completo', u.nome_completo);
  set('email',         u.email);
  set('sobre',         u.sobre);
  set('cpf_cnpj',      formatDisplayCpfCnpj(u.cpf_cnpj));
  set('data_nasc',     u.data_nasc);
  set('telefone',      formatDisplayPhone(u.telefone));
  set('telefone2',     formatDisplayPhone(u.telefone2));
  set('cep',           formatDisplayCep(u.cep));
  set('rua',           u.rua);
  set('numero',        u.numero);
  set('bairro',        u.bairro);
  set('cidade',        u.cidade);
  set('estado',        u.estado);

  // mostrar avatar atual como preview (mas sem ocupar o buffer; só substitui se trocar)
  if (u.foto_perfil) {
    const box = document.getElementById('avatar-box');
    if (box) {
      box.classList.add('has-preview');
      box.innerHTML = `
        <input type="file" id="avatar-input" accept="image/*" onchange="handleAvatarPick(this)">
        <img class="preview-thumb" src="${escapeHtml(u.foto_perfil)}" alt="Avatar atual">
        <button type="button" class="thumb-remove cover-remove" onclick="clearAvatar(event)" title="Remover">×</button>
      `;
    }
  }
  if (u.foto_banner) {
    const box = document.getElementById('banner-box');
    if (box) {
      box.classList.add('has-preview');
      box.innerHTML = `
        <input type="file" id="banner-input" accept="image/*" onchange="handleBannerPick(this)">
        <img class="preview-thumb" src="${escapeHtml(u.foto_banner)}" alt="Banner atual">
        <button type="button" class="thumb-remove cover-remove" onclick="clearBanner(event)" title="Remover">×</button>
      `;
    }
  }
}


/* Submit da edição */
async function submitEditProfile() {
  const errBox = ensureEditError();
  errBox.textContent = '';

  // todos opcionais, mas se preenchidos precisam ser válidos
  const checks = [
    validateOptional('email',         'email'),
    validateOptional('nome_display',  'displayName'),
    validateOptional('nome_completo', 'fullName'),
    validateOptional('telefone',      'phone'),
    validateOptional('telefone2',     'phone'),
    validateOptional('cep',           'cep'),
    validateOptional('estado',        'uf'),
  ];
  if (!checks.every(Boolean)) {
    errBox.textContent = 'Há campos preenchidos com formato inválido.';
    const first = document.querySelector('.invalid');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // troca de senha (se qualquer um dos 3 foi preenchido, os 3 são obrigatórios)
  const sAtual    = document.getElementById('senha_atual').value;
  const sNova     = document.getElementById('senha_nova').value;
  const sConfirma = document.getElementById('senha_nova_confirma').value;
  const querTrocarSenha = sAtual || sNova || sConfirma;

  if (querTrocarSenha) {
    if (!sAtual)    { document.getElementById('senha_atual').classList.add('invalid'); errBox.textContent = 'Informe a senha atual.'; return; }
    if (!sNova)     { document.getElementById('senha_nova').classList.add('invalid');  errBox.textContent = 'Informe a nova senha.'; return; }
    if (!sConfirma) { document.getElementById('senha_nova_confirma').classList.add('invalid'); errBox.textContent = 'Confirme a nova senha.'; return; }
    if (!isStrongPassword(sNova)) {
      document.getElementById('senha_nova').classList.add('invalid');
      errBox.textContent = 'Nova senha fraca: mín. 8 chars, 1 maiúscula, 1 número, 1 símbolo.';
      return;
    }
    if (sNova !== sConfirma) {
      document.getElementById('senha_nova_confirma').classList.add('invalid');
      errBox.textContent = 'A confirmação não bate com a nova senha.';
      return;
    }
  }

  const btn = document.getElementById('btn-submit');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  // imagens (se houver buffer novo)
  const avatarFile = __fileBuffers.avatar?.file;
  const bannerFile = __fileBuffers.banner?.file;
  let foto_perfil_payload, foto_banner_payload;
  try {
    if (avatarFile) foto_perfil_payload = await compressImage(avatarFile, 512,  0.82);
    if (bannerFile) foto_banner_payload = await compressImage(bannerFile, 1280, 0.78);
  } catch (e) {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    errBox.textContent = 'Erro ao processar imagens: ' + e.message;
    return;
  }

  // monta payload apenas com campos preenchidos
  const payload = {};
  const valOf = id => (document.getElementById(id)?.value ?? '').trim();
  const addIfFilled = (key, id) => {
    const v = valOf(id);
    if (v !== '') payload[key] = v;
  };

  addIfFilled('nome_display',  'nome_display');
  addIfFilled('nome_completo', 'nome_completo');
  addIfFilled('email',         'email');
  addIfFilled('telefone',      'telefone');
  addIfFilled('cep',           'cep');
  addIfFilled('estado',        'estado');

  // estes podem ser limpados (vazio é válido)
  const sendIfPresent = (key, id) => {
    const el = document.getElementById(id);
    if (!el) return;
    payload[key] = (el.value || '').trim();
  };
  sendIfPresent('sobre',     'sobre');
  sendIfPresent('telefone2', 'telefone2');
  sendIfPresent('rua',       'rua');
  sendIfPresent('numero',    'numero');
  sendIfPresent('bairro',    'bairro');
  sendIfPresent('cidade',    'cidade');

  if (foto_perfil_payload !== undefined) payload.foto_perfil = foto_perfil_payload;
  if (foto_banner_payload !== undefined) payload.foto_banner = foto_banner_payload;

  if (querTrocarSenha) {
    payload.senha_atual         = sAtual;
    payload.senha_nova          = sNova;
    payload.senha_nova_confirma = sConfirma;
  }

  if (Object.keys(payload).length === 0) {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    errBox.textContent = 'Nenhuma alteração para salvar.';
    return;
  }

  const res = await api('api/auth_update.php', { method: 'POST', body: payload });

  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }

  if (!res.ok) {
    errBox.textContent = res.error || 'Erro ao salvar alterações.';
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  sessionStorage.setItem('autolog_toast', 'Perfil atualizado com sucesso!');
  window.location.href = `perfil.html?u=${encodeURIComponent(__currentUser.username)}`;
}

function ensureEditError() {
  let box = document.getElementById('edit-page-error');
  if (box) return box;
  box = document.createElement('div');
  box.id = 'edit-page-error';
  box.className = 'auth-error';
  box.style.margin = '12px 0';
  const submitRow = document.querySelector('.submit-row');
  if (submitRow) submitRow.parentNode.insertBefore(box, submitRow);
  return box;
}


/* =============================================================
   MODAL DE EXCLUSÃO DE CONTA
   ============================================================= */

function openDeleteAccountModal() {
  const modal = document.getElementById('delete-modal');
  if (!modal) return;
  goToDeleteStep1();
  document.getElementById('del-email').value = '';
  document.getElementById('del-senha').value = '';
  document.getElementById('del-confirma').checked = false;
  document.getElementById('del-error').textContent = '';
  modal.hidden = false;
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeDeleteAccountModal() {
  const modal = document.getElementById('delete-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.hidden = true;
  document.body.style.overflow = '';
}

function goToDeleteStep1() {
  document.querySelectorAll('.delete-pane').forEach(p => {
    p.hidden = p.getAttribute('data-step') !== '1';
  });
}

function goToDeleteStep2() {
  document.querySelectorAll('.delete-pane').forEach(p => {
    p.hidden = p.getAttribute('data-step') !== '2';
  });
  setTimeout(() => document.getElementById('del-email').focus(), 50);
}

async function submitDeleteAccount() {
  const errBox = document.getElementById('del-error');
  errBox.textContent = '';

  const email    = document.getElementById('del-email').value.trim();
  const senha    = document.getElementById('del-senha').value;
  const confirma = document.getElementById('del-confirma').checked;

  if (!email)    { errBox.textContent = 'Informe seu email.';  return; }
  if (!senha)    { errBox.textContent = 'Informe sua senha.';  return; }
  if (!confirma) { errBox.textContent = 'Marque a confirmação de que entendeu.'; return; }

  const btn = document.getElementById('del-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Excluindo…'; }

  const res = await api('api/auth_delete.php', {
    method: 'POST',
    body: { email, senha, confirma: true }
  });

  if (!res.ok) {
    errBox.textContent = res.error || 'Falha ao excluir a conta.';
    if (btn) { btn.disabled = false; btn.textContent = 'Excluir definitivamente'; }
    return;
  }

  __currentUser = null;
  alert('Sua conta foi excluída. Você será redirecionado para a página inicial.');
  window.location.href = 'index.html';
}

function setupDeleteModalListeners() {
  document.querySelectorAll('[data-close-delete]').forEach(el => {
    el.addEventListener('click', closeDeleteAccountModal);
  });
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('delete-modal');
    if (e.key === 'Escape' && modal && !modal.hidden) closeDeleteAccountModal();
  });
}


/* =============================================================
   PÁGINA: EDIÇÃO DE CARRO  (editarcarro.html)
   ============================================================= */

let __editCarId = null;
let __editCarSnapshot = null;   // dados originais para diff e fallback

/** Pré-popula o formulário com os dados atuais do carro. */
async function initEditarCarroPage() {
  const isEditar = document.querySelector('.page-title')?.textContent?.includes('Editar Carro');
  if (!isEditar) return;

  if (!__currentUser) { openAuthModal(); return; }

  const id = parseInt(new URLSearchParams(window.location.search).get('id'), 10);
  if (!id) {
    document.querySelector('.page').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Carro não especificado</div>
        <div class="empty-sub">URL inválida — falta o parâmetro ?id=</div>
      </div>`;
    return;
  }

  // reset buffers
  __fileBuffers.cover   = null;
  __fileBuffers.gallery = [];

  const res = await api(`api/cars_get.php?id=${id}`);
  if (!res.ok) {
    document.querySelector('.page').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Carro não encontrado</div>
        <div class="empty-sub">${escapeHtml(res.error || 'Tente novamente.')}</div>
      </div>`;
    return;
  }

  if (!res.data.is_owner) {
    document.querySelector('.page').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <div class="empty-title">Sem permissão</div>
        <div class="empty-sub">Você só pode editar carros que são seus.</div>
      </div>`;
    return;
  }

  __editCarId       = res.data.car.id;
  __editCarSnapshot = res.data.car;

  const c = res.data.car;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

  set('nome',         c.modelo);
  set('descricao',    c.descricao);
  set('placa',        c.placa);
  set('renavam',      c.renavam);
  set('chassi',       c.chassi);
  set('fabricante',   c.fabricante);
  set('ano',          c.ano);
  set('cidade',       c.cidade);
  set('estado',       c.estado);
  set('combustivel',  c.combustivel);
  set('km',           c.quilometragem ? Number(c.quilometragem).toLocaleString('pt-BR') : '');
  set('cambio',       c.cambio);
  set('cor',          c.cor);
  set('motor',        c.motor);
  set('documentacao', c.documentacao);

  // fotos: capa e galeria existentes viram itens "existing" no buffer
  if (c.foto_capa) {
    __fileBuffers.cover = { existingUrl: c.foto_capa };
    renderCoverPreviewWithExisting();
  }

  if (Array.isArray(c.fotos_extra) && c.fotos_extra.length) {
    __fileBuffers.gallery = c.fotos_extra.map(url => ({ existingUrl: url }));
    renderGalleryPreviewsWithExisting();
  }
}

/* Sobrescritas das renderizações para aceitar items "existing" (do banco)
 * misturados com items "new" (File do navegador). */

function renderCoverPreviewWithExisting() {
  const box = document.getElementById('cover-box');
  if (!box) return;
  const item = __fileBuffers.cover;
  if (!item) {
    box.classList.remove('has-preview');
    box.innerHTML = `
      <input type="file" id="cover-input" accept="image/*" onchange="handleCoverPick(this)">
      <div class="upload-icon">📸</div>
      <div class="upload-label">Foto de Exibição</div>
    `;
    return;
  }
  box.classList.add('has-preview');
  const url = item.existingUrl || '';
  if (url) {
    box.innerHTML = `
      <input type="file" id="cover-input" accept="image/*" onchange="handleCoverPick(this)">
      <img class="preview-thumb" src="${url}" alt="Capa">
      <button type="button" class="thumb-remove cover-remove" onclick="clearCover(event)" title="Remover">×</button>
    `;
  } else {
    // item novo (File) — usa o renderCoverPreview padrão
    renderCoverPreview();
  }
}

function renderGalleryPreviewsWithExisting() {
  const placeholder = document.getElementById('gallery-placeholder');
  const previews    = document.getElementById('gallery-previews');
  if (!placeholder || !previews) return;

  if (__fileBuffers.gallery.length === 0) {
    placeholder.style.display = 'flex';
    previews.style.display    = 'none';
    previews.innerHTML        = '';
    return;
  }

  placeholder.style.display = 'none';
  previews.style.display    = 'flex';
  previews.innerHTML        = '';

  __fileBuffers.gallery.forEach((item, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-wrap';

    const img = document.createElement('img');
    img.className = 'gallery-thumb';
    if (item.existingUrl) img.src = item.existingUrl;
    else ensureDataUrl(item).then(url => img.src = url);

    const rm = document.createElement('button');
    rm.type      = 'button';
    rm.className = 'thumb-remove';
    rm.innerHTML = '×';
    rm.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      __fileBuffers.gallery.splice(idx, 1);
      renderGalleryPreviewsWithExisting();
    };

    wrap.appendChild(img);
    wrap.appendChild(rm);
    previews.appendChild(wrap);
  });

  // botão "adicionar mais" se houver espaço
  if (__fileBuffers.gallery.length < 5) {
    previews.appendChild(buildAddMore('gallery-edit', 'handleGalleryPickEdit',
      `${__fileBuffers.gallery.length}/5`, true));
  } else {
    const counter = document.createElement('div');
    counter.className = 'thumb-counter';
    counter.textContent = '5/5 (limite)';
    previews.appendChild(counter);
  }
}

/* Variantes para edição (re-renderizam com a versão que suporta existentes) */
function handleCoverPickEdit(input) {
  const f = input.files[0];
  if (!f) return;
  __fileBuffers.cover = { file: f };
  // usa o renderer padrão (não tem existingUrl, então mostra o preview do file)
  renderCoverPreview();
  input.value = '';
}

function handleGalleryPickEdit(input) {
  for (const f of Array.from(input.files)) {
    if (__fileBuffers.gallery.length >= 5) break;
    __fileBuffers.gallery.push({ file: f });
  }
  renderGalleryPreviewsWithExisting();
  input.value = '';
}


/* Submit da edição */
async function submitEditCar() {
  if (!__currentUser || !__editCarId) return;

  const btn = document.getElementById('btn-submit');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }

  // validações simples (todos opcionais)
  const cep = document.getElementById('estado').value.trim().toUpperCase();
  if (cep && cep.length !== 2) {
    alert('UF inválida (use 2 letras).');
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    return;
  }

  // Processa fotos: mistura existing + new
  let fotoPayload, fotosExtraPayload;
  try {
    // capa
    if (__fileBuffers.cover === null) {
      fotoPayload = '';  // remoção explícita
    } else if (__fileBuffers.cover?.existingUrl) {
      fotoPayload = __fileBuffers.cover.existingUrl;  // mantém atual
    } else if (__fileBuffers.cover?.file) {
      fotoPayload = await compressImage(__fileBuffers.cover.file, 1280, 0.82);
    }
    // galeria
    if (Array.isArray(__fileBuffers.gallery)) {
      const list = [];
      for (const item of __fileBuffers.gallery) {
        if (item.existingUrl) list.push(item.existingUrl);
        else if (item.file)   list.push(await compressImage(item.file, 1000, 0.78));
      }
      fotosExtraPayload = list;
    }
  } catch (e) {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    alert('Erro ao processar imagens: ' + e.message);
    return;
  }

  // Monta payload só com campos preenchidos
  const payload = { car_id: __editCarId };
  const valOf = id => (document.getElementById(id)?.value ?? '').trim();
  const addIfFilled = (key, id) => {
    const v = valOf(id);
    if (v !== '') payload[key] = v;
  };
  const sendIfPresent = (key, id) => {
    const el = document.getElementById(id);
    if (!el) return;
    payload[key] = (el.value || '').trim();
  };

  addIfFilled('modelo',      'nome');
  addIfFilled('placa',       'placa');
  addIfFilled('cidade',      'cidade');
  addIfFilled('estado',      'estado');
  addIfFilled('combustivel', 'combustivel');
  addIfFilled('cor',         'cor');
  addIfFilled('motor',       'motor');

  // descrição e documentação podem ser limpadas
  sendIfPresent('descricao',    'descricao');
  sendIfPresent('documentacao', 'documentacao');
  sendIfPresent('cambio',       'cambio');

  // km: limpa máscara
  const km = valOf('km').replace(/\./g, '');
  if (km !== '') payload.km = parseInt(km, 10) || 0;

  // fotos
  if (fotoPayload !== undefined)       payload.foto = fotoPayload;
  if (fotosExtraPayload !== undefined) payload.fotos_extra = fotosExtraPayload;

  if (Object.keys(payload).length <= 1) {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    alert('Nenhuma alteração para salvar.');
    return;
  }

  const res = await api('api/cars_update.php', { method: 'POST', body: payload });
  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }

  if (!res.ok) {
    alert(res.error || 'Erro ao salvar alterações.');
    return;
  }

  sessionStorage.setItem('autolog_toast', `${__editCarSnapshot.modelo} atualizado com sucesso!`);
  window.location.href = `carro.html?id=${__editCarId}`;
}


/* =============================================================
   MODAL DE EXCLUSÃO DE CARRO
   ============================================================= */

let __deleteCarTarget = null; // { id, modelo }

/** Versão para abrir o modal a partir da página de edição (usa __editCarSnapshot) */
function openDeleteCarModal() {
  if (!__editCarSnapshot) return;
  __deleteCarTarget = { id: __editCarId, modelo: __editCarSnapshot.modelo };
  showDeleteCarModal();
}

/** Versão para abrir o modal a partir da página carro.html (usa __carData) */
function openDeleteCarModalFromPage() {
  if (!__carData || !__carData.is_owner) return;
  __deleteCarTarget = { id: __carData.car.id, modelo: __carData.car.modelo };
  showDeleteCarModal();
}

function showDeleteCarModal() {
  const modal = document.getElementById('delete-car-modal');
  if (!modal) return;

  // preenche nome do carro nas duas etapas
  const n1 = document.getElementById('delcar-name');
  const n2 = document.getElementById('delcar-name-2');
  if (n1) n1.textContent = __deleteCarTarget.modelo;
  if (n2) n2.textContent = __deleteCarTarget.modelo;

  goToDeleteCarStep1();
  document.getElementById('delcar-confirma').checked = false;
  document.getElementById('delcar-error').textContent = '';

  modal.hidden = false;
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeDeleteCarModal() {
  const modal = document.getElementById('delete-car-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.hidden = true;
  document.body.style.overflow = '';
}

function goToDeleteCarStep1() {
  document.querySelectorAll('#delete-car-modal .delete-pane').forEach(p => {
    p.hidden = p.getAttribute('data-step') !== '1';
  });
}

function goToDeleteCarStep2() {
  document.querySelectorAll('#delete-car-modal .delete-pane').forEach(p => {
    p.hidden = p.getAttribute('data-step') !== '2';
  });
}

async function submitDeleteCar() {
  if (!__deleteCarTarget) return;

  const errBox   = document.getElementById('delcar-error');
  const confirma = document.getElementById('delcar-confirma').checked;
  errBox.textContent = '';

  if (!confirma) {
    errBox.textContent = 'Marque a confirmação para continuar.';
    return;
  }

  const btn = document.getElementById('delcar-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Excluindo…'; }

  const res = await api('api/cars_delete.php', {
    method: 'POST',
    body: { car_id: __deleteCarTarget.id, confirma: true }
  });

  if (!res.ok) {
    errBox.textContent = res.error || 'Falha ao excluir o carro.';
    if (btn) { btn.disabled = false; btn.textContent = 'Excluir definitivamente'; }
    return;
  }

  // sucesso — volta para o perfil
  sessionStorage.setItem('autolog_toast', `${__deleteCarTarget.modelo} foi excluído.`);
  window.location.href = `perfil.html?u=${encodeURIComponent(__currentUser.username)}`;
}

function setupDeleteCarModalListeners() {
  document.querySelectorAll('[data-close-delete-car]').forEach(el => {
    el.addEventListener('click', closeDeleteCarModal);
  });
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('delete-car-modal');
    if (e.key === 'Escape' && modal && !modal.hidden) closeDeleteCarModal();
  });
}


/* =============================================================
   INICIALIZAÇÃO
   ============================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  ensureAuthModal();

  const me = await api('api/auth_me.php');
  __currentUser = (me.ok && me.data) ? me.data : null;

  renderNavAuth();
  setupSearch();

  initIndexPage();
  initCadastroPage();
  initRegistroPage();
  await initEditarPage();
  await initEditarCarroPage();
  await initProfilePage();
  await initCarPage();
  setupDeleteModalListeners();
  setupDeleteCarModalListeners();
  checkToast();

  window.addEventListener('scroll', updateProgress);

  document.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input',  () => el.classList.remove('invalid'));
    el.addEventListener('change', () => el.classList.remove('invalid'));
  });
});
