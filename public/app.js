const API = '/api';

const state = {
  user: null,
  needsSetup: false,
  authMode: 'login',
  files: [],
  scope: 'mine',
  currentParentId: null,
  breadcrumbs: [{ id: null, name: '全部文件' }],
  loading: true,
  uploading: false,
  error: '',
  modal: null,
  sharePage: null,
  shareAccessToken: null,
  shareFolderBreadcrumbs: [],
  shareFiles: [],
  sharePreviewFile: null,
};

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  if (state.shareAccessToken) {
    headers['X-Share-Access'] = state.shareAccessToken;
  }

  const res = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers });

  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || '请求失败');
    return data.data;
  }
  if (!res.ok) throw new Error('请求失败');
  return res;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('zh-CN');
}

function setError(msg) {
  state.error = msg;
  render();
}

function clearError() {
  state.error = '';
}

function closeModal() {
  state.modal = null;
  render();
}

async function loadFiles() {
  const params = new URLSearchParams();
  if (state.currentParentId) params.set('parentId', state.currentParentId);
  if (state.scope === 'shared') params.set('scope', 'shared');
  const q = params.toString() ? `?${params}` : '';
  const data = await api(`/files${q}`);
  state.files = data.files;
}

async function initApp() {
  const shareMatch = location.pathname.match(/^\/s\/([^/]+)/);
  if (shareMatch) {
    state.sharePage = shareMatch[1];
    state.loading = false;
    render();
    return;
  }

  try {
    const setup = await api('/auth/setup-status');
    state.needsSetup = setup.needsSetup;
    if (!state.needsSetup) {
      try {
        const me = await api('/user/me');
        state.user = me.user;
      } catch {
        state.user = null;
      }
    }
    if (state.user) await loadFiles();
  } catch (err) {
    setError(err.message);
  } finally {
    state.loading = false;
    render();
  }
}

async function handleSetup(e) {
  e.preventDefault();
  clearError();
  const form = e.target;
  try {
    const data = await api('/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ username: form.username.value, password: form.password.value }),
    });
    state.user = data.user;
    state.needsSetup = false;
    await loadFiles();
    render();
  } catch (err) {
    setError(err.message);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  clearError();
  const form = e.target;
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: form.username.value, password: form.password.value }),
    });
    state.user = data.user;
    await loadFiles();
    render();
  } catch (err) {
    setError(err.message);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  clearError();
  const form = e.target;
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: form.username.value, password: form.password.value }),
    });
    state.user = data.user;
    await loadFiles();
    render();
  } catch (err) {
    setError(err.message);
  }
}

async function handleLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {}
  state.user = null;
  state.files = [];
  state.scope = 'mine';
  state.currentParentId = null;
  state.breadcrumbs = [{ id: null, name: '全部文件' }];
  render();
}

async function switchScope(scope) {
  state.scope = scope;
  state.currentParentId = null;
  state.breadcrumbs = [{ id: null, name: scope === 'shared' ? '与我共享' : '全部文件' }];
  await loadFiles();
  render();
}

async function openFolder(id, name) {
  state.currentParentId = id;
  state.breadcrumbs.push({ id, name });
  await loadFiles();
  render();
}

async function navigateTo(index) {
  state.breadcrumbs = state.breadcrumbs.slice(0, index + 1);
  state.currentParentId = state.breadcrumbs[index].id;
  await loadFiles();
  render();
}

async function createFolder() {
  const name = prompt('请输入文件夹名称');
  if (!name?.trim()) return;
  try {
    await api('/files/folders', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), parentId: state.currentParentId }),
    });
    await loadFiles();
    render();
  } catch (err) {
    setError(err.message);
  }
}

async function uploadFiles(fileList) {
  if (!fileList.length) return;
  state.uploading = true;
  render();
  try {
    for (const file of fileList) {
      const fd = new FormData();
      fd.append('file', file);
      if (state.currentParentId) fd.append('parentId', state.currentParentId);
      await api('/files/upload', { method: 'POST', body: fd });
    }
    await loadFiles();
  } catch (err) {
    setError(err.message);
  } finally {
    state.uploading = false;
    render();
  }
}

function downloadFile(id) {
  window.open(`${API}/files/${id}/download`, '_blank');
}

function openShareModal(id, name, isFolder) {
  state.modal = { type: 'share', fileId: id, fileName: name, isFolder: !!isFolder };
  render();
}

function renderPreviewBody(info, mime) {
  if (info.mode === 'office') {
    return `<iframe src="${esc(info.embedUrl)}" class="h-[70vh] w-full"></iframe>`;
  }
  const url = info.url;
  if ((mime || '').startsWith('image/')) return `<img src="${url}" class="max-h-[70vh] w-full object-contain" />`;
  if ((mime || '').startsWith('video/')) return `<video src="${url}" controls class="w-full"></video>`;
  if ((mime || '').startsWith('audio/')) return `<audio src="${url}" controls class="w-full"></audio>`;
  if (mime === 'application/pdf') return `<iframe src="${url}" class="h-[70vh] w-full"></iframe>`;
  return `<iframe src="${url}" class="h-[70vh] w-full"></iframe>`;
}

function openCollabModal(id, name) {
  state.modal = { type: 'collab', fileId: id, fileName: name, collaborators: [] };
  api(`/files/${id}/collaborators`)
    .then((d) => {
      if (state.modal?.fileId === id) {
        state.modal.collaborators = d.collaborators;
        render();
      }
    })
    .catch(() => {});
  render();
}

function openPreviewModal(id, name, mime) {
  state.modal = { type: 'preview', fileId: id, fileName: name, mime, loading: true };
  render();
  api(`/files/${id}/preview-info`)
    .then((d) => {
      if (state.modal?.fileId === id && state.modal?.type === 'preview') {
        state.modal.previewInfo = d;
        state.modal.loading = false;
        render();
      }
    })
    .catch((err) => {
      alert(err.message);
      closeModal();
    });
}

function openEditModal(id, name) {
  state.modal = { type: 'edit', fileId: id, fileName: name, content: '', loading: true };
  render();
  api(`/files/${id}/content`)
    .then((d) => {
      if (state.modal?.fileId === id) {
        state.modal.content = d.content;
        state.modal.loading = false;
        render();
      }
    })
    .catch((err) => {
      setError(err.message);
      closeModal();
    });
}

async function submitShare(form) {
  const data = await api('/shares', {
    method: 'POST',
    body: JSON.stringify({
      fileId: state.modal.fileId,
      password: form.password.value || undefined,
      expiresInHours: Number(form.expires.value) || undefined,
      allowPreview: form.allowPreview.checked,
      allowEdit: form.allowEdit?.checked ?? false,
      allowDownload: form.allowDownload.checked,
      directLink: form.directLink?.checked ?? false,
      maxDownloads: form.maxDownloads.value ? Number(form.maxDownloads.value) : undefined,
    }),
  });
  state.modal.result = data.share;
  render();
}

async function submitCollab(form) {
  await api(`/files/${state.modal.fileId}/collaborators`, {
    method: 'POST',
    body: JSON.stringify({
      username: form.username.value.trim(),
      permission: form.permission.value,
    }),
  });
  const d = await api(`/files/${state.modal.fileId}/collaborators`);
  state.modal.collaborators = d.collaborators;
  form.username.value = '';
  render();
}

async function removeCollab(collaboratorId) {
  await api(`/files/${state.modal.fileId}/collaborators/${collaboratorId}`, { method: 'DELETE' });
  const d = await api(`/files/${state.modal.fileId}/collaborators`);
  state.modal.collaborators = d.collaborators;
  render();
}

async function loadShareFolderFiles(parentId) {
  const params = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
  const data = await api(`/share/${state.sharePage}/files${params}`);
  state.shareFiles = data.files;
}

async function openShareFolder(id, name) {
  if (!state.shareFolderBreadcrumbs.length) {
    state.shareFolderBreadcrumbs = [{ id: null, name: state.shareInfo.name }];
  }
  state.shareFolderBreadcrumbs.push({ id, name });
  state.sharePreviewFile = null;
  await loadShareFolderFiles(id);
  render();
}

async function navigateShareFolder(index) {
  state.shareFolderBreadcrumbs = state.shareFolderBreadcrumbs.slice(0, index + 1);
  const parentId = state.shareFolderBreadcrumbs[index].id;
  state.sharePreviewFile = null;
  await loadShareFolderFiles(parentId);
  render();
}

async function openShareFilePreview(file) {
  state.sharePreviewFile = { ...file, loading: true };
  render();
  try {
    const info = await api(`/share/${state.sharePage}/files/${file.id}/preview-info`);
    state.sharePreviewFile = { ...file, previewInfo: info, loading: false };
  } catch (err) {
    state.sharePreviewFile = null;
    alert(err.message);
  }
  render();
}

async function saveEditContent() {
  const ta = document.getElementById('edit-content');
  await api(`/files/${state.modal.fileId}/content`, {
    method: 'PUT',
    body: JSON.stringify({ content: ta.value }),
  });
  closeModal();
  await loadFiles();
  render();
}

async function initSharePage() {
  const token = state.sharePage;
  try {
    const info = await api(`/share/${token}`);
    state.shareInfo = info;
    if (info.requiresPassword && !state.shareAccessToken) {
      state.shareNeedsPassword = true;
    } else if (!info.requiresPassword) {
      const access = await api(`/share/${token}/access`, { method: 'POST', body: '{}' });
      state.shareAccessToken = access.accessToken;
    }
    if (!info.requiresPassword && info.isFolder) {
      state.shareFolderBreadcrumbs = [{ id: null, name: info.name }];
      await loadShareFolderFiles(null);
    }
  } catch (err) {
    state.shareError = err.message;
  }
  render();
}

async function verifySharePassword(form) {
  const access = await api(`/share/${state.sharePage}/access`, {
    method: 'POST',
    body: JSON.stringify({ password: form.password.value }),
  });
  state.shareAccessToken = access.accessToken;
  state.shareNeedsPassword = false;
  if (state.shareInfo?.isFolder) {
    state.shareFolderBreadcrumbs = [{ id: null, name: state.shareInfo.name }];
    await loadShareFolderFiles(null);
  }
  render();
}

function renderModal() {
  if (!state.modal) return '';
  const m = state.modal;

  if (m.type === 'share') {
    if (m.result) {
      return `<div class="modal-backdrop"><div class="modal">
        <h3 class="mb-3 text-lg font-semibold">分享已创建</h3>
        <p class="mb-2 text-sm text-slate-600">文件：${esc(m.fileName)}</p>
        <label class="text-xs text-slate-500">分享链接</label>
        <input class="input mb-2" readonly value="${esc(m.result.url)}" onclick="this.select()" />
        ${m.result.directUrl ? `<label class="text-xs text-slate-500">直链下载</label><input class="input mb-4" readonly value="${esc(m.result.directUrl)}" onclick="this.select()" />` : ''}
        <button class="btn-primary w-full" id="modal-close">关闭</button>
      </div></div>`;
    }
    return `<div class="modal-backdrop"><div class="modal">
      <h3 class="mb-3 text-lg font-semibold">创建分享 · ${esc(m.fileName)}</h3>
      <form id="share-form" class="space-y-3">
        <div><label class="label">分享密码（可选）</label><input class="input" name="password" type="password" placeholder="留空则无需密码" /></div>
        <div><label class="label">有效期</label><select class="input" name="expires">
          <option value="24">1 天</option><option value="168">7 天</option><option value="720">30 天</option><option value="0">永久</option>
        </select></div>
        <div><label class="label">下载次数上限（可选）</label><input class="input" name="maxDownloads" type="number" min="1" placeholder="不限" /></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="allowPreview" checked /> 允许预览</label>
        ${m.isFolder ? '<p class="text-xs text-slate-500">文件夹分享可在分享页浏览子目录并下载文件</p>' : ''}
        ${m.isFolder ? '' : '<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="allowEdit" /> 允许在线编辑</label>'}
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="allowDownload" checked /> 允许下载</label>
        ${m.isFolder ? '' : '<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="directLink" /> 直链（无密码时可外链下载）</label>'}
        <div class="flex gap-2"><button type="button" class="btn-secondary flex-1" id="modal-close">取消</button><button type="submit" class="btn-primary flex-1">创建</button></div>
      </form>
    </div></div>`;
  }

  if (m.type === 'collab') {
    const list = (m.collaborators || [])
      .map(
        (c) =>
          `<li class="flex items-center justify-between py-1 text-sm"><span>${esc(c.username)} · ${c.permission === 'edit' ? '可编辑' : '只读'}</span><button class="text-red-500" data-rm-collab="${c.id}">移除</button></li>`
      )
      .join('');
    return `<div class="modal-backdrop"><div class="modal">
      <h3 class="mb-3 text-lg font-semibold">协作 · ${esc(m.fileName)}</h3>
      <form id="collab-form" class="mb-4 space-y-2">
        <div class="relative">
          <input class="input" id="collab-username" name="username" placeholder="搜索用户名" required autocomplete="off" />
          <div id="collab-suggestions" class="absolute z-10 mt-1 hidden max-h-40 w-full overflow-auto rounded-lg border bg-white shadow-lg"></div>
        </div>
        <select class="input" name="permission"><option value="view">只读</option><option value="edit">可编辑</option></select>
        <button type="submit" class="btn-primary w-full">添加协作者</button>
      </form>
      <ul class="border-t pt-2">${list || '<li class="text-sm text-slate-400">暂无协作者</li>'}</ul>
      <button class="btn-secondary mt-4 w-full" id="modal-close">关闭</button>
    </div></div>`;
  }

  if (m.type === 'preview') {
    if (m.loading) {
      return `<div class="modal-backdrop"><div class="modal modal-lg"><p>加载预览...</p></div></div>`;
    }
    const body = renderPreviewBody(m.previewInfo, m.mime);
    return `<div class="modal-backdrop"><div class="modal modal-lg"><div class="mb-2 flex items-center justify-between"><h3 class="font-semibold">${esc(m.fileName)}</h3><button id="modal-close" class="btn-secondary">关闭</button></div>${body}</div></div>`;
  }

  if (m.type === 'edit') {
    if (m.loading) return `<div class="modal-backdrop"><div class="modal modal-lg"><p>加载中...</p></div></div>`;
    return `<div class="modal-backdrop"><div class="modal modal-lg">
      <div class="mb-2 flex items-center justify-between"><h3 class="font-semibold">编辑 · ${esc(m.fileName)}</h3><button id="modal-close" class="btn-secondary">关闭</button></div>
      <textarea id="edit-content" class="input h-96 font-mono text-sm">${esc(m.content)}</textarea>
      <button id="save-edit" class="btn-primary mt-3 w-full">保存</button>
    </div></div>`;
  }
  return '';
}

function renderAuth() {
  if (state.needsSetup) {
    return `<div class="flex min-h-screen items-center justify-center p-4"><div class="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
      <h1 class="mb-6 text-center text-2xl font-bold">CloudDisk 初始化</h1>
      ${state.error ? `<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">${esc(state.error)}</div>` : ''}
      <form id="auth-form" class="space-y-4"><input class="input" name="username" required placeholder="管理员用户名" minlength="2" />
      <input class="input" type="password" name="password" required placeholder="密码" minlength="6" />
      <button class="btn-primary w-full">创建并进入</button></form></div></div>`;
  }

  return `<div class="flex min-h-screen items-center justify-center p-4"><div class="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
    <h1 class="mb-2 text-center text-2xl font-bold">CloudDisk</h1>
    <p class="mb-6 text-center text-sm text-slate-500">多人协作网盘</p>
    <div class="mb-4 flex rounded-lg bg-slate-100 p-1">
      <button class="flex-1 rounded-md py-2 text-sm ${state.authMode === 'login' ? 'bg-white shadow' : ''}" data-auth-mode="login">登录</button>
      <button class="flex-1 rounded-md py-2 text-sm ${state.authMode === 'register' ? 'bg-white shadow' : ''}" data-auth-mode="register">注册</button>
    </div>
    ${state.error ? `<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">${esc(state.error)}</div>` : ''}
    <form id="auth-form" class="space-y-4">
      <input class="input" name="username" required placeholder="用户名" minlength="2" />
      <input class="input" type="password" name="password" required placeholder="密码" minlength="6" />
      <button class="btn-primary w-full">${state.authMode === 'login' ? '登录' : '注册'}</button>
    </form></div></div>`;
}

function renderFileActions(f) {
  const btns = [];
  if (f.isFolder) {
    if (f.owned) {
      btns.push(`<button class="btn-secondary px-2 py-1 text-xs" data-action="share" data-id="${f.id}" data-name="${esc(f.name)}" data-folder="1">分享</button>`);
      btns.push(`<button class="btn-secondary px-2 py-1 text-xs" data-action="collab" data-id="${f.id}" data-name="${esc(f.name)}">协作</button>`);
    }
    return btns.join('');
  }
  if (f.previewable) btns.push(`<button class="btn-secondary px-2 py-1 text-xs" data-action="preview" data-id="${f.id}" data-name="${esc(f.name)}" data-mime="${esc(f.mimeType || '')}">预览</button>`);
  if (f.editable && (f.permission === 'owner' || f.permission === 'edit')) btns.push(`<button class="btn-secondary px-2 py-1 text-xs" data-action="edit" data-id="${f.id}" data-name="${esc(f.name)}">编辑</button>`);
  btns.push(`<button class="btn-secondary px-2 py-1 text-xs" data-action="download" data-id="${f.id}">下载</button>`);
  if (f.owned) {
    btns.push(`<button class="btn-secondary px-2 py-1 text-xs" data-action="share" data-id="${f.id}" data-name="${esc(f.name)}">分享</button>`);
    btns.push(`<button class="btn-secondary px-2 py-1 text-xs" data-action="collab" data-id="${f.id}" data-name="${esc(f.name)}">协作</button>`);
  }
  if (f.permission === 'owner' || f.permission === 'edit') {
    btns.push(`<button class="btn-secondary px-2 py-1 text-xs" data-action="rename" data-id="${f.id}" data-name="${esc(f.name)}">重命名</button>`);
  }
  if (f.permission === 'owner') {
    btns.push(`<button class="btn-danger px-2 py-1 text-xs" data-action="delete" data-id="${f.id}" data-name="${esc(f.name)}" data-folder="${f.isFolder}">删除</button>`);
  }
  return btns.join('');
}

function renderMain() {
  const crumbs = state.breadcrumbs
    .map((c, i) => `<button class="text-sm ${i === state.breadcrumbs.length - 1 ? 'font-medium text-slate-900' : 'text-brand-600 hover:underline'}" data-crumb="${i}">${esc(c.name)}</button>`)
    .join('<span class="mx-2 text-slate-300">/</span>');

  const rows = state.files
    .map(
      (f) => `<tr class="border-b hover:bg-slate-50">
      <td class="px-4 py-3"><button class="flex items-center gap-2 text-left ${f.isFolder ? 'font-medium hover:text-brand-600' : ''}" data-action="${f.isFolder ? 'open' : 'previewable-open'}" data-id="${f.id}" data-name="${esc(f.name)}" data-preview="${f.previewable}" data-mime="${esc(f.mimeType || '')}">${f.isFolder ? '📁' : '📄'} ${esc(f.name)}</button></td>
      <td class="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">${f.isFolder ? '—' : formatBytes(f.size)}</td>
      <td class="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">${formatDate(f.createdAt)}</td>
      <td class="px-4 py-3"><div class="flex flex-wrap justify-end gap-1">${renderFileActions(f)}</div></td></tr>`
    )
    .join('');

  return `<div class="min-h-screen bg-slate-50">
    <header class="border-b bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
      <div><h1 class="text-lg font-bold">CloudDisk</h1><p class="text-xs text-slate-500">多人协作 · 分享 · 预览 · 编辑</p></div>
      <div class="flex items-center gap-3"><span class="text-sm">${esc(state.user.username)}</span><button id="logout-btn" class="btn-secondary">退出</button></div>
    </div></header>
    <main class="mx-auto max-w-6xl px-4 py-6">
      ${state.error ? `<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">${esc(state.error)}</div>` : ''}
      <div class="mb-4 flex flex-wrap gap-2">
        <button class="${state.scope === 'mine' ? 'btn-primary' : 'btn-secondary'}" data-scope="mine">我的文件</button>
        <button class="${state.scope === 'shared' ? 'btn-primary' : 'btn-secondary'}" data-scope="shared">与我共享</button>
      </div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav>${crumbs}</nav>
        ${state.scope === 'mine' ? `<div class="flex gap-2"><button id="newfolder-btn" class="btn-secondary">新建文件夹</button>
          <label class="btn-primary cursor-pointer">${state.uploading ? '上传中...' : '上传'}<input id="file-input" type="file" multiple class="hidden" /></label></div>` : ''}
      </div>
      <div id="drop-zone" class="overflow-hidden rounded-xl border bg-white">${rows || '<p class="p-8 text-center text-slate-400">暂无文件</p>'}</div>
    </main>${renderModal()}</div>`;
}

function renderShareFolderView() {
  const info = state.shareInfo;
  const token = state.sharePage;
  const q = state.shareAccessToken ? `?accessToken=${encodeURIComponent(state.shareAccessToken)}` : '';

  if (state.sharePreviewFile) {
    const f = state.sharePreviewFile;
    if (f.loading) {
      return `<div class="mx-auto max-w-4xl p-6"><p>加载预览...</p></div>`;
    }
    const preview = info.allowPreview ? renderPreviewBody(f.previewInfo, f.mimeType) : '';
    const downloadUrl = `${API}/share/${token}/files/${f.id}/download${q}`;
    return `<div class="mx-auto max-w-4xl p-6">
      <button class="mb-4 text-sm text-brand-600 hover:underline" id="share-back-folder">← 返回文件夹</button>
      <h1 class="mb-2 text-xl font-bold">${esc(f.name)}</h1>
      <p class="mb-4 text-sm text-slate-500">${formatBytes(f.size)} · ${f.mimeType || '未知类型'}</p>
      ${preview}
      <div class="mt-4 flex flex-wrap gap-2">
        ${info.allowDownload ? `<a class="btn-primary" href="${downloadUrl}" target="_blank">下载</a>` : ''}
      </div></div>`;
  }

  const crumbs = state.shareFolderBreadcrumbs
    .map(
      (c, i) =>
        `<button class="text-sm ${i === state.shareFolderBreadcrumbs.length - 1 ? 'font-medium text-slate-900' : 'text-brand-600 hover:underline'}" data-share-crumb="${i}">${esc(c.name)}</button>`
    )
    .join('<span class="mx-2 text-slate-300">/</span>');

  const rows = (state.shareFiles || [])
    .map((f) => {
      if (f.isFolder) {
        return `<tr class="border-b hover:bg-slate-50"><td class="px-4 py-3"><button class="font-medium hover:text-brand-600" data-share-open="${f.id}" data-share-name="${esc(f.name)}">📁 ${esc(f.name)}</button></td><td class="px-4 py-3 text-sm text-slate-500">—</td><td></td></tr>`;
      }
      const actions = [];
      if (info.allowPreview && f.previewable) {
        actions.push(`<button class="btn-secondary px-2 py-1 text-xs" data-share-preview="${f.id}" data-share-fname="${esc(f.name)}" data-share-mime="${esc(f.mimeType || '')}">预览</button>`);
      }
      if (info.allowDownload) {
        actions.push(`<a class="btn-secondary px-2 py-1 text-xs" href="${API}/share/${token}/files/${f.id}/download${q}" target="_blank">下载</a>`);
      }
      return `<tr class="border-b hover:bg-slate-50"><td class="px-4 py-3">📄 ${esc(f.name)}</td><td class="px-4 py-3 text-sm text-slate-500">${formatBytes(f.size)}</td><td class="px-4 py-3"><div class="flex justify-end gap-1">${actions.join('')}</div></td></tr>`;
    })
    .join('');

  return `<div class="mx-auto max-w-4xl p-6">
    <h1 class="mb-2 text-xl font-bold">📁 ${esc(info.name)}</h1>
    <p class="mb-4 text-sm text-slate-500">文件夹分享 · 浏览并下载内容</p>
    <nav class="mb-4">${crumbs}</nav>
    <div class="overflow-hidden rounded-xl border bg-white">
      <table class="w-full text-left"><thead><tr class="border-b bg-slate-50 text-sm text-slate-500"><th class="px-4 py-2">名称</th><th class="px-4 py-2">大小</th><th class="px-4 py-2 text-right">操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" class="p-8 text-center text-slate-400">空文件夹</td></tr>'}</tbody></table>
    </div></div>`;
}

function renderShareFileView() {
  const info = state.shareInfo;
  const token = state.sharePage;
  const q = state.shareAccessToken ? `?accessToken=${encodeURIComponent(state.shareAccessToken)}` : '';
  const previewUrl = `${API}/share/${token}/preview${q}`;
  const downloadUrl = `${API}/share/${token}/download${q}`;

  let preview = '';
  if (info.allowPreview) {
    if (info.previewMode === 'office' && info.previewable) {
      preview = `<iframe src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}" class="h-96 w-full"></iframe>`;
    } else if ((info.mimeType || '').startsWith('image/')) {
      preview = `<img src="${previewUrl}" class="max-h-96 w-full object-contain" />`;
    } else if (info.previewable) {
      preview = `<iframe src="${previewUrl}" class="h-96 w-full"></iframe>`;
    }
  }

  return `<div class="mx-auto max-w-3xl p-6">
    <h1 class="mb-2 text-xl font-bold">${esc(info.name)}</h1>
    <p class="mb-4 text-sm text-slate-500">${formatBytes(info.size)} · ${info.mimeType || '未知类型'}</p>
    ${preview}
    <div class="mt-4 flex flex-wrap gap-2">
      ${info.allowDownload ? `<a class="btn-primary" href="${downloadUrl}" target="_blank">下载</a>` : ''}
      ${info.allowEdit ? `<button class="btn-secondary" id="share-edit-btn">在线编辑</button>` : ''}
    </div></div>`;
}

function renderSharePageView() {
  const info = state.shareInfo;
  if (state.shareError) return `<div class="flex min-h-screen items-center justify-center"><p class="text-red-500">${esc(state.shareError)}</p></div>`;
  if (!info) return `<div class="flex min-h-screen items-center justify-center"><p>加载中...</p></div>`;
  if (info.expired) return `<div class="flex min-h-screen items-center justify-center"><p class="text-red-500">分享已过期</p></div>`;

  if (state.shareNeedsPassword) {
    return `<div class="flex min-h-screen items-center justify-center p-4"><div class="w-full max-w-md rounded-xl border bg-white p-6">
      <h2 class="mb-4 text-lg font-semibold">${esc(info.name)}</h2>
      <p class="mb-4 text-sm text-slate-500">此分享需要密码</p>
      <form id="share-pwd-form" class="space-y-3"><input class="input" type="password" name="password" required placeholder="分享密码" />
      <button class="btn-primary w-full">验证</button></form></div></div>`;
  }

  if (info.isFolder) return renderShareFolderView();
  return renderShareFileView();
}

function render() {
  const app = document.getElementById('app');
  if (state.loading) {
    app.innerHTML = '<div class="flex min-h-screen items-center justify-center">加载中...</div>';
    return;
  }
  if (state.sharePage) {
    app.innerHTML = renderSharePageView();
    bindSharePageEvents();
    if (!state.shareInfo && !state.shareError) initSharePage();
    return;
  }
  if (!state.user) {
    app.innerHTML = renderAuth();
    bindAuthEvents();
    return;
  }
  app.innerHTML = renderMain();
  bindMainEvents();
}

function bindAuthEvents() {
  document.getElementById('auth-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.needsSetup) handleSetup(e);
    else if (state.authMode === 'register') handleRegister(e);
    else handleLogin(e);
  });
  document.querySelectorAll('[data-auth-mode]').forEach((el) => {
    el.addEventListener('click', () => {
      state.authMode = el.dataset.authMode;
      clearError();
      render();
    });
  });
}

function bindSharePageEvents() {
  document.getElementById('share-pwd-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    verifySharePassword(e.target).catch((err) => alert(err.message));
  });
  document.getElementById('share-edit-btn')?.addEventListener('click', async () => {
    const d = await api(`/share/${state.sharePage}/content`);
    const content = prompt('编辑内容', d.content);
    if (content === null) return;
    await api(`/share/${state.sharePage}/content`, { method: 'PUT', body: JSON.stringify({ content }) });
    alert('已保存');
  });
  document.getElementById('share-back-folder')?.addEventListener('click', () => {
    state.sharePreviewFile = null;
    render();
  });
  document.querySelectorAll('[data-share-crumb]').forEach((el) => {
    el.addEventListener('click', () => navigateShareFolder(Number(el.dataset.shareCrumb)).catch((err) => alert(err.message)));
  });
  document.querySelectorAll('[data-share-open]').forEach((el) => {
    el.addEventListener('click', () =>
      openShareFolder(el.dataset.shareOpen, el.dataset.shareName).catch((err) => alert(err.message))
    );
  });
  document.querySelectorAll('[data-share-preview]').forEach((el) => {
    el.addEventListener('click', () =>
      openShareFilePreview({
        id: el.dataset.sharePreview,
        name: el.dataset.shareFname,
        mimeType: el.dataset.shareMime,
        size: 0,
        previewable: true,
      }).catch((err) => alert(err.message))
    );
  });
}

let collabSearchTimer = null;

function bindCollabAutocomplete() {
  const input = document.getElementById('collab-username');
  const list = document.getElementById('collab-suggestions');
  if (!input || !list) return;

  input.addEventListener('input', () => {
    clearTimeout(collabSearchTimer);
    const q = input.value.trim();
    if (q.length < 1) {
      list.innerHTML = '';
      list.classList.add('hidden');
      return;
    }
    collabSearchTimer = setTimeout(async () => {
      try {
        const exclude = (state.modal?.collaborators || []).map((c) => c.userId).join(',');
        const d = await api(
          `/user/search?q=${encodeURIComponent(q)}${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ''}`
        );
        list.innerHTML = d.users
          .map(
            (u) =>
              `<button type="button" class="collab-suggest w-full px-3 py-2 text-left text-sm hover:bg-slate-100" data-username="${esc(u.username)}">${esc(u.username)}</button>`
          )
          .join('');
        list.classList.toggle('hidden', !d.users.length);
        list.querySelectorAll('.collab-suggest').forEach((btn) => {
          btn.addEventListener('mousedown', (e) => e.preventDefault());
          btn.addEventListener('click', () => {
            input.value = btn.dataset.username;
            list.innerHTML = '';
            list.classList.add('hidden');
          });
        });
      } catch {
        list.classList.add('hidden');
      }
    }, 200);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => list.classList.add('hidden'), 150);
  });
  input.addEventListener('focus', () => {
    if (list.innerHTML) list.classList.remove('hidden');
  });
}

function bindMainEvents() {
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('newfolder-btn')?.addEventListener('click', createFolder);
  document.querySelectorAll('[data-scope]').forEach((el) => el.addEventListener('click', () => switchScope(el.dataset.scope)));
  document.querySelectorAll('[data-crumb]').forEach((el) => el.addEventListener('click', () => navigateTo(Number(el.dataset.crumb))));

  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', async () => {
      const { action, id, name, folder, mime, preview } = el.dataset;
      if (action === 'open') openFolder(id, name);
      else if (action === 'previewable-open') {
        if (preview === 'true') openPreviewModal(id, name, mime);
        else downloadFile(id);
      } else if (action === 'download') downloadFile(id);
      else if (action === 'preview') openPreviewModal(id, name, mime);
      else if (action === 'edit') openEditModal(id, name);
      else if (action === 'share') openShareModal(id, name, folder === '1');
      else if (action === 'collab') openCollabModal(id, name);
      else if (action === 'rename') {
        const n = prompt('重命名', name);
        if (n?.trim()) {
          await api(`/files/${id}`, { method: 'PATCH', body: JSON.stringify({ name: n.trim() }) });
          await loadFiles();
          render();
        }
      } else if (action === 'delete') {
        if (confirm(`删除「${name}」？`)) {
          await api(`/files/${id}`, { method: 'DELETE' });
          await loadFiles();
          render();
        }
      }
    });
  });

  document.getElementById('file-input')?.addEventListener('change', (e) => {
    uploadFiles([...e.target.files]);
    e.target.value = '';
  });

  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('share-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitShare(e.target).catch((err) => alert(err.message));
  });
  document.getElementById('collab-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCollab(e.target).catch((err) => alert(err.message));
  });
  document.querySelectorAll('[data-rm-collab]').forEach((el) => {
    el.addEventListener('click', () => removeCollab(el.dataset.rmCollab).catch((err) => alert(err.message)));
  });
  bindCollabAutocomplete();
  document.getElementById('save-edit')?.addEventListener('click', () => saveEditContent().catch((err) => alert(err.message)));

  const dropZone = document.getElementById('drop-zone');
  if (dropZone && state.scope === 'mine') {
    ['dragenter', 'dragover'].forEach((evt) => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('ring-2', 'ring-brand-500'); }));
    ['dragleave', 'drop'].forEach((evt) => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('ring-2', 'ring-brand-500'); }));
    dropZone.addEventListener('drop', (e) => uploadFiles([...e.dataTransfer.files]));
  }
}

initApp();
