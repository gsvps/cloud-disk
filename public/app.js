const API = '/api';
const SITE = {
  github: 'https://github.com/gsvps/cloud-disk',
  website: 'https://www.gsvps.com',
  telegram: 'https://t.me/gsvpscom',
};

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
  page: 'files',
  settingsTab: 'account',
  registrationOpen: true,
  adminUsers: [],
  adminGroups: [],
  adminSettings: null,
  settingsLoading: false,
  editingUserId: null,
  editingGroupId: null,
  showUserForm: false,
  showGroupForm: false,
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
        const reg = await api('/auth/register-status');
        state.registrationOpen = reg.registrationOpen;
      } catch {
        state.registrationOpen = true;
      }
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

function renderPreviewBody(info, mime, fullscreen = false) {
  const frameClass = fullscreen ? 'preview-frame' : 'h-[70vh] w-full border-0';
  const mediaClass = fullscreen ? 'preview-media' : 'max-h-[70vh] w-full object-contain';
  if (info.mode === 'office') {
    return `<iframe src="${esc(info.embedUrl)}" class="${frameClass}"></iframe>`;
  }
  const url = info.url;
  if ((mime || '').startsWith('image/')) {
    return `<div class="flex h-full w-full items-center justify-center p-4"><img src="${url}" class="${mediaClass}" alt="" /></div>`;
  }
  if ((mime || '').startsWith('video/')) {
    return `<div class="flex h-full w-full items-center justify-center bg-black p-4"><video src="${url}" controls class="max-h-full max-w-full"></video></div>`;
  }
  if ((mime || '').startsWith('audio/')) {
    return `<div class="flex h-full w-full items-center justify-center p-8"><audio src="${url}" controls class="w-full max-w-xl"></audio></div>`;
  }
  return `<iframe src="${url}" class="${frameClass}"></iframe>`;
}

function renderFooter() {
  return `<footer class="site-footer">
    <div class="mx-auto max-w-6xl px-4 py-5 text-center text-sm">
      <p class="mb-2 text-xs text-slate-400">CloudDisk · 轻量协作网盘</p>
      <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <a href="${SITE.website}" target="_blank" rel="noopener noreferrer">官网 www.gsvps.com</a>
        <span class="hidden text-slate-300 sm:inline">·</span>
        <a href="${SITE.telegram}" target="_blank" rel="noopener noreferrer">交流群 t.me/gsvpscom</a>
        <span class="hidden text-slate-300 sm:inline">·</span>
        <a href="${SITE.github}" target="_blank" rel="noopener noreferrer">GitHub 仓库</a>
      </div>
    </div>
  </footer>`;
}

function renderAppHeader(subtitle = '多人协作 · 分享 · 预览 · 编辑', extra = '') {
  return `<header class="site-header">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
      <div class="flex items-center gap-3">
        <div class="logo-badge">☁</div>
        <div>
          <h1 class="text-lg font-bold tracking-tight text-slate-900">CloudDisk</h1>
          <p class="text-xs text-slate-500">${subtitle}</p>
        </div>
      </div>
      ${extra}
    </div>
  </header>`;
}

function userInitial(name) {
  return esc((name || '?').charAt(0).toUpperCase());
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
      <h3 class="mb-1 text-lg font-semibold text-slate-900">分享已创建</h3>
      <p class="mb-4 text-sm text-slate-500">文件：${esc(m.fileName)}</p>
        <label class="text-xs text-slate-500">分享链接</label>
        <input class="input mb-2" readonly value="${esc(m.result.url)}" onclick="this.select()" />
        ${m.result.directUrl ? `<label class="text-xs text-slate-500">直链下载</label><input class="input mb-4" readonly value="${esc(m.result.directUrl)}" onclick="this.select()" />` : ''}
        <button class="btn-primary w-full" id="modal-close">关闭</button>
      </div></div>`;
    }
    return `<div class="modal-backdrop"><div class="modal">
      <h3 class="mb-1 text-lg font-semibold text-slate-900">创建分享</h3>
      <p class="mb-4 truncate text-sm text-slate-500">${esc(m.fileName)}</p>
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
      <h3 class="mb-1 text-lg font-semibold text-slate-900">协作管理</h3>
      <p class="mb-4 truncate text-sm text-slate-500">${esc(m.fileName)}</p>
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
      return `<div class="modal-backdrop modal-backdrop-full">
        <div class="modal-fullscreen items-center justify-center">
          <div class="flex flex-col items-center gap-3 text-slate-500">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"></div>
            <p>加载预览...</p>
          </div>
        </div>
      </div>`;
    }
    const body = renderPreviewBody(m.previewInfo, m.mime, true);
    return `<div class="modal-backdrop modal-backdrop-full">
      <div class="modal-fullscreen">
        <div class="modal-fullscreen-header">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-brand-600">预览</p>
            <h3 class="truncate font-semibold text-slate-900">${esc(m.fileName)}</h3>
          </div>
          <button id="modal-close" class="btn-secondary shrink-0">关闭</button>
        </div>
        <div class="modal-fullscreen-body">${body}</div>
      </div>
    </div>`;
  }

  if (m.type === 'edit') {
    if (m.loading) {
      return `<div class="modal-backdrop modal-backdrop-full">
        <div class="modal-fullscreen items-center justify-center">
          <div class="flex flex-col items-center gap-3 text-slate-500">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"></div>
            <p>加载中...</p>
          </div>
        </div>
      </div>`;
    }
    return `<div class="modal-backdrop modal-backdrop-full">
      <div class="modal-fullscreen">
        <div class="modal-fullscreen-header">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-brand-600">在线编辑</p>
            <h3 class="truncate font-semibold text-slate-900">${esc(m.fileName)}</h3>
          </div>
          <div class="flex shrink-0 gap-2">
            <button id="modal-close" class="btn-secondary">取消</button>
            <button id="save-edit" class="btn-primary">保存</button>
          </div>
        </div>
        <div class="modal-fullscreen-body flex flex-col">
          <textarea id="edit-content" class="edit-textarea flex-1">${esc(m.content)}</textarea>
        </div>
      </div>
    </div>`;
  }
  return '';
}

function isAdmin() {
  return state.user?.role === 'admin' || state.user?.permissions?.canAdmin;
}

async function openSettings(tab = 'account') {
  state.page = 'settings';
  state.settingsTab = tab;
  state.error = '';
  clearError();
  await loadSettingsData();
}

function backToFiles() {
  state.page = 'files';
  state.editingUserId = null;
  state.editingGroupId = null;
  state.showUserForm = false;
  state.showGroupForm = false;
  clearError();
  render();
}

async function loadSettingsData() {
  if (isAdmin()) {
    state.settingsLoading = true;
    render();
  }
  try {
    if (isAdmin()) {
      const [settings, usersData, groupsData] = await Promise.all([
        api('/admin/settings'),
        api('/admin/users'),
        api('/admin/groups'),
      ]);
      state.adminSettings = settings;
      state.registrationOpen = settings.registrationOpen;
      state.adminUsers = usersData.users;
      state.adminGroups = groupsData.groups;
    }
  } catch (err) {
    setError(err.message);
  } finally {
    state.settingsLoading = false;
    render();
  }
}

async function savePassword(form) {
  await api('/user/password', {
    method: 'PUT',
    body: JSON.stringify({
      oldPassword: form.oldPassword.value,
      newPassword: form.newPassword.value,
    }),
  });
  form.reset();
  alert('密码已更新');
}

async function saveRegistrationSetting(open) {
  await api('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ registrationOpen: open }),
  });
  state.adminSettings = { registrationOpen: open };
  state.registrationOpen = open;
  render();
}

async function submitNewUser(form) {
  await api('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      username: form.username.value.trim(),
      password: form.password.value,
      role: form.role.value,
      groupId: form.role.value === 'admin' ? null : form.groupId.value || 'grp_default',
      status: form.status.value,
    }),
  });
  state.showUserForm = false;
  await loadSettingsData();
}

async function submitEditUser(form, userId) {
  const body = {
    username: form.username.value.trim(),
    role: form.role.value,
    groupId: form.role.value === 'admin' ? null : form.groupId.value || 'grp_default',
    status: form.status.value,
  };
  if (form.password.value) body.password = form.password.value;
  await api(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) });
  state.editingUserId = null;
  await loadSettingsData();
}

async function deleteAdminUser(userId, username) {
  if (!confirm(`确定删除用户「${username}」？`)) return;
  await api(`/admin/users/${userId}`, { method: 'DELETE' });
  await loadSettingsData();
}

async function submitNewGroup(form) {
  await api('/admin/groups', {
    method: 'POST',
    body: JSON.stringify({
      name: form.name.value.trim(),
      description: form.description.value.trim() || undefined,
      canUpload: form.canUpload.checked,
      canShare: form.canShare.checked,
      canCollab: form.canCollab.checked,
      canAdmin: form.canAdmin.checked,
    }),
  });
  state.showGroupForm = false;
  await loadSettingsData();
}

async function submitEditGroup(form, groupId) {
  await api(`/admin/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: form.name.value.trim(),
      description: form.description.value.trim() || undefined,
      canUpload: form.canUpload.checked,
      canShare: form.canShare.checked,
      canCollab: form.canCollab.checked,
      canAdmin: form.canAdmin.checked,
    }),
  });
  state.editingGroupId = null;
  await loadSettingsData();
}

async function deleteAdminGroup(groupId, name) {
  if (!confirm(`确定删除用户组「${name}」？组内用户将移至默认用户组。`)) return;
  await api(`/admin/groups/${groupId}`, { method: 'DELETE' });
  await loadSettingsData();
}

function roleLabel(role) {
  return role === 'admin' ? '管理员' : '普通用户';
}

function statusLabel(status) {
  return status === 'disabled' ? '已禁用' : '正常';
}

function renderGroupOptions(selectedId, includeEmpty = false) {
  const opts = (state.adminGroups || []).map(
    (g) => `<option value="${esc(g.id)}" ${g.id === selectedId ? 'selected' : ''}>${esc(g.name)}</option>`
  );
  return `${includeEmpty ? '<option value="">无</option>' : ''}${opts.join('')}`;
}

function renderUserForm(user = null) {
  const isEdit = !!user;
  const id = user?.id || '';
  return `<form id="${isEdit ? `edit-user-form-${id}` : 'new-user-form'}" class="card mb-4 space-y-3 p-4">
    <h4 class="font-semibold text-slate-900">${isEdit ? '编辑用户' : '新建用户'}</h4>
    <div class="grid gap-3 sm:grid-cols-2">
      <div><label class="label">用户名</label><input class="input" name="username" required minlength="2" value="${esc(user?.username || '')}" /></div>
      <div><label class="label">${isEdit ? '新密码（留空不改）' : '密码'}</label><input class="input" type="password" name="password" ${isEdit ? '' : 'required minlength="6"'} placeholder="${isEdit ? '留空则不修改' : '至少 6 位'}" /></div>
      <div><label class="label">角色</label><select class="input" name="role"><option value="user" ${user?.role !== 'admin' ? 'selected' : ''}>普通用户</option><option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>管理员</option></select></div>
      <div><label class="label">用户组</label><select class="input" name="groupId">${renderGroupOptions(user?.groupId || 'grp_default')}</select></div>
      <div><label class="label">状态</label><select class="input" name="status"><option value="active" ${user?.status !== 'disabled' ? 'selected' : ''}>正常</option><option value="disabled" ${user?.status === 'disabled' ? 'selected' : ''}>禁用</option></select></div>
    </div>
    <div class="flex gap-2">
      <button type="submit" class="btn-primary">${isEdit ? '保存' : '创建用户'}</button>
      <button type="button" class="btn-secondary" data-cancel-user-form>取消</button>
    </div>
  </form>`;
}

function renderGroupForm(group = null) {
  const isEdit = !!group;
  const id = group?.id || '';
  const readonlyName = group?.id === 'grp_default';
  return `<form id="${isEdit ? `edit-group-form-${id}` : 'new-group-form'}" class="card mb-4 space-y-3 p-4">
    <h4 class="font-semibold text-slate-900">${isEdit ? '编辑用户组' : '新建用户组'}</h4>
    <div class="grid gap-3 sm:grid-cols-2">
      <div><label class="label">组名称</label><input class="input" name="name" required value="${esc(group?.name || '')}" ${readonlyName ? 'readonly' : ''} /></div>
      <div><label class="label">描述</label><input class="input" name="description" value="${esc(group?.description || '')}" placeholder="可选" /></div>
    </div>
    <div class="flex flex-wrap gap-4 text-sm">
      <label class="flex items-center gap-2"><input type="checkbox" name="canUpload" ${group?.canUpload !== false ? 'checked' : ''} /> 允许上传</label>
      <label class="flex items-center gap-2"><input type="checkbox" name="canShare" ${group?.canShare !== false ? 'checked' : ''} /> 允许分享</label>
      <label class="flex items-center gap-2"><input type="checkbox" name="canCollab" ${group?.canCollab !== false ? 'checked' : ''} /> 允许协作</label>
      <label class="flex items-center gap-2"><input type="checkbox" name="canAdmin" ${group?.canAdmin ? 'checked' : ''} /> 管理后台</label>
    </div>
    <div class="flex gap-2">
      <button type="submit" class="btn-primary">${isEdit ? '保存' : '创建用户组'}</button>
      <button type="button" class="btn-secondary" data-cancel-group-form>取消</button>
    </div>
  </form>`;
}

function renderSettingsAccount() {
  return `<div class="card p-6">
    <h3 class="mb-1 text-lg font-semibold">修改密码</h3>
    <p class="mb-4 text-sm text-slate-500">修改当前登录账号的密码</p>
    <form id="password-form" class="max-w-md space-y-3">
      <div><label class="label">原密码</label><input class="input" type="password" name="oldPassword" required /></div>
      <div><label class="label">新密码</label><input class="input" type="password" name="newPassword" required minlength="6" placeholder="至少 6 位" /></div>
      <button type="submit" class="btn-primary">更新密码</button>
    </form>
    <div class="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
      <p><span class="font-medium">当前账号：</span>${esc(state.user.username)}</p>
      <p class="mt-1"><span class="font-medium">角色：</span>${roleLabel(state.user.role)}</p>
      ${state.user.groupName ? `<p class="mt-1"><span class="font-medium">用户组：</span>${esc(state.user.groupName)}</p>` : ''}
    </div>
  </div>`;
}

function renderSettingsSystem() {
  const open = state.adminSettings?.registrationOpen ?? state.registrationOpen;
  return `<div class="card p-6">
    <h3 class="mb-1 text-lg font-semibold">系统设置</h3>
    <p class="mb-4 text-sm text-slate-500">控制是否允许新用户自行注册</p>
    <label class="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
      <input type="checkbox" id="registration-open" ${open ? 'checked' : ''} class="h-4 w-4" />
      <span><span class="font-medium">开放注册</span><br /><span class="text-sm text-slate-500">关闭后登录页将隐藏注册入口，仅管理员可新建用户</span></span>
    </label>
  </div>`;
}

function renderSettingsUsers() {
  const editing = state.adminUsers.find((u) => u.id === state.editingUserId);
  const rows = state.adminUsers
    .map(
      (u) => `<tr>
        <td class="px-4 py-3 font-medium">${esc(u.username)}</td>
        <td class="px-4 py-3 text-sm">${roleLabel(u.role)}</td>
        <td class="px-4 py-3 text-sm">${esc(u.groupName || '—')}</td>
        <td class="px-4 py-3 text-sm">${statusLabel(u.status)}</td>
        <td class="px-4 py-3"><div class="flex justify-end gap-1">
          <button class="btn-secondary px-2 py-1 text-xs" data-edit-user="${u.id}">编辑</button>
          ${u.id !== state.user.id ? `<button class="btn-danger px-2 py-1 text-xs" data-del-user="${u.id}" data-username="${esc(u.username)}">删除</button>` : ''}
        </div></td>
      </tr>`
    )
    .join('');

  return `<div>
    <div class="mb-4 flex items-center justify-between gap-3">
      <div><h3 class="text-lg font-semibold">用户管理</h3><p class="text-sm text-slate-500">新建、编辑用户与权限分配</p></div>
      <button class="btn-primary" id="show-user-form-btn" ${state.showUserForm ? 'disabled' : ''}>新建用户</button>
    </div>
    ${state.showUserForm ? renderUserForm() : ''}
    ${editing ? renderUserForm(editing) : ''}
    <div class="card overflow-x-auto">
      <table class="file-table w-full text-left"><thead><tr>
        <th class="px-4 py-3">用户名</th><th class="px-4 py-3">角色</th><th class="px-4 py-3">用户组</th><th class="px-4 py-3">状态</th><th class="px-4 py-3 text-right">操作</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400">暂无用户</td></tr>'}</tbody></table>
    </div>
  </div>`;
}

function renderSettingsGroups() {
  const editing = state.adminGroups.find((g) => g.id === state.editingGroupId);
  const rows = state.adminGroups
    .map((g) => {
      const perms = [
        g.canUpload && '上传',
        g.canShare && '分享',
        g.canCollab && '协作',
        g.canAdmin && '管理',
      ]
        .filter(Boolean)
        .join(' · ') || '无';
      return `<tr>
        <td class="px-4 py-3 font-medium">${esc(g.name)}</td>
        <td class="px-4 py-3 text-sm text-slate-500">${esc(g.description || '—')}</td>
        <td class="px-4 py-3 text-sm">${esc(perms)}</td>
        <td class="px-4 py-3"><div class="flex justify-end gap-1">
          <button class="btn-secondary px-2 py-1 text-xs" data-edit-group="${g.id}">编辑</button>
          ${g.id !== 'grp_default' ? `<button class="btn-danger px-2 py-1 text-xs" data-del-group="${g.id}" data-name="${esc(g.name)}">删除</button>` : ''}
        </div></td>
      </tr>`;
    })
    .join('');

  return `<div>
    <div class="mb-4 flex items-center justify-between gap-3">
      <div><h3 class="text-lg font-semibold">用户组</h3><p class="text-sm text-slate-500">批量管理用户权限策略</p></div>
      <button class="btn-primary" id="show-group-form-btn" ${state.showGroupForm ? 'disabled' : ''}>新建用户组</button>
    </div>
    ${state.showGroupForm ? renderGroupForm() : ''}
    ${editing && !state.showGroupForm ? renderGroupForm(editing) : ''}
    <div class="card overflow-x-auto">
      <table class="file-table w-full text-left"><thead><tr>
        <th class="px-4 py-3">名称</th><th class="px-4 py-3">描述</th><th class="px-4 py-3">权限</th><th class="px-4 py-3 text-right">操作</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`;
}

function renderSettings() {
  const tabs = [{ id: 'account', label: '账号安全', admin: false }];
  if (isAdmin()) {
    tabs.push(
      { id: 'system', label: '系统设置', admin: true },
      { id: 'users', label: '用户管理', admin: true },
      { id: 'groups', label: '用户组', admin: true }
    );
  }

  const nav = tabs
    .map(
      (t) =>
        `<button class="settings-nav-item ${state.settingsTab === t.id ? 'settings-nav-active' : ''}" data-settings-tab="${t.id}">${t.label}</button>`
    )
    .join('');

  let panel = '';
  if (state.settingsLoading && isAdmin()) {
    panel = '<div class="card p-8 text-center text-slate-500">加载设置...</div>';
  } else if (state.settingsTab === 'account') panel = renderSettingsAccount();
  else if (state.settingsTab === 'system') panel = renderSettingsSystem();
  else if (state.settingsTab === 'users') panel = renderSettingsUsers();
  else if (state.settingsTab === 'groups') panel = renderSettingsGroups();

  return `<div class="flex min-h-screen flex-col">
    ${renderAppHeader('系统设置', `<div class="flex items-center gap-2">
      <button id="back-files-btn" class="btn-secondary">返回文件</button>
      <button id="logout-btn" class="btn-secondary">退出</button>
    </div>`)}
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      ${state.error ? `<div class="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">${esc(state.error)}</div>` : ''}
      <div class="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav class="settings-nav">${nav}</nav>
        <div>${panel}</div>
      </div>
    </main>
    ${renderFooter()}
  </div>`;
}

function renderAuth() {
  const cardInner = state.needsSetup
    ? `<h1 class="mb-2 text-center text-2xl font-bold text-slate-900">CloudDisk 初始化</h1>
      <p class="mb-6 text-center text-sm text-slate-500">创建第一个管理员账号</p>`
    : `<div class="mb-6 flex flex-col items-center">
        <div class="logo-badge mb-3 h-14 w-14 text-2xl">☁</div>
        <h1 class="text-2xl font-bold text-slate-900">CloudDisk</h1>
        <p class="mt-1 text-sm text-slate-500">多人协作网盘</p>
      </div>`;

  const authActions = state.needsSetup
    ? `<button type="submit" class="btn-primary w-full">创建并进入</button>`
    : `<div class="flex gap-2 pt-1">
        <button type="button" id="auth-login-btn" class="btn-primary flex-1">登录</button>
        <button type="button" id="auth-register-btn" class="btn-secondary flex-1" ${state.registrationOpen ? '' : 'disabled title="当前未开放注册"'}>注册</button>
      </div>
      ${!state.registrationOpen ? '<p class="text-center text-xs text-slate-400">注册已关闭，请联系管理员开通账号</p>' : ''}`;

  return `<div class="flex min-h-screen flex-col">
    <div class="flex flex-1 items-center justify-center p-4">
      <div class="auth-card">
        ${cardInner}
        ${state.error ? `<div class="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">${esc(state.error)}</div>` : ''}
        <form id="auth-form" class="space-y-4">
          <div><label class="label">用户名</label><input class="input" name="username" required placeholder="请输入用户名" minlength="2" /></div>
          <div><label class="label">密码</label><input class="input" type="password" name="password" required placeholder="至少 6 位" minlength="6" /></div>
          ${authActions}
        </form>
      </div>
    </div>
    ${renderFooter()}
  </div>`;
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

  const rows = state.files.length
    ? state.files
        .map(
          (f) => `<tr>
      <td class="px-4 py-3"><button class="flex items-center gap-2.5 text-left ${f.isFolder ? 'font-semibold text-slate-800 hover:text-brand-600' : 'text-slate-700 hover:text-brand-600'}" data-action="${f.isFolder ? 'open' : 'previewable-open'}" data-id="${f.id}" data-name="${esc(f.name)}" data-preview="${f.previewable}" data-mime="${esc(f.mimeType || '')}"><span class="text-lg">${f.isFolder ? '📁' : '📄'}</span><span class="truncate">${esc(f.name)}</span></button></td>
      <td class="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">${f.isFolder ? '—' : formatBytes(f.size)}</td>
      <td class="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">${formatDate(f.createdAt)}</td>
      <td class="px-4 py-3"><div class="flex flex-wrap justify-end gap-1.5">${renderFileActions(f)}</div></td></tr>`
        )
        .join('')
    : '';

  const emptyState = `<div class="flex flex-col items-center justify-center px-6 py-16 text-center">
    <div class="mb-4 text-5xl opacity-40">📂</div>
    <p class="font-medium text-slate-600">暂无文件</p>
    <p class="mt-1 text-sm text-slate-400">${state.scope === 'mine' ? '上传文件或新建文件夹开始使用' : '还没有人与你共享文件'}</p>
  </div>`;

  return `<div class="flex min-h-screen flex-col">
    ${renderAppHeader('多人协作 · 分享 · 预览 · 编辑', `<div class="flex items-center gap-2 sm:gap-3">
      <div class="user-pill"><span class="user-avatar">${userInitial(state.user.username)}</span><span class="hidden sm:inline">${esc(state.user.username)}</span></div>
      <button id="settings-btn" class="btn-secondary">设置</button>
      <button id="logout-btn" class="btn-secondary">退出</button>
    </div>`)}
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      ${state.error ? `<div class="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">${esc(state.error)}</div>` : ''}
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div class="scope-tabs">
          <button class="scope-tab ${state.scope === 'mine' ? 'scope-tab-active' : ''}" data-scope="mine">我的文件</button>
          <button class="scope-tab ${state.scope === 'shared' ? 'scope-tab-active' : ''}" data-scope="shared">与我共享</button>
        </div>
        ${state.scope === 'mine' && state.user.permissions?.canUpload !== false ? `<div class="flex gap-2">
          <button id="newfolder-btn" class="btn-secondary">新建文件夹</button>
          <label class="btn-primary cursor-pointer">${state.uploading ? '上传中...' : '上传文件'}<input id="file-input" type="file" multiple class="hidden" /></label>
        </div>` : ''}
      </div>
      <div class="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white/60 px-4 py-2.5 text-sm shadow-sm">
        <span class="text-slate-400">路径</span>
        <nav class="flex flex-wrap items-center">${crumbs}</nav>
      </div>
      <div id="drop-zone" class="card">
        ${rows ? `<div class="overflow-x-auto"><table class="file-table w-full text-left"><thead><tr>
          <th class="px-4 py-3">名称</th>
          <th class="hidden px-4 py-3 sm:table-cell">大小</th>
          <th class="hidden px-4 py-3 md:table-cell">创建时间</th>
          <th class="px-4 py-3 text-right">操作</th>
        </tr></thead><tbody>${rows}</tbody></table></div>` : emptyState}
      </div>
    </main>
    ${renderFooter()}
    ${renderModal()}
  </div>`;
}

function renderShareFolderView() {
  const info = state.shareInfo;
  const token = state.sharePage;
  const q = state.shareAccessToken ? `?accessToken=${encodeURIComponent(state.shareAccessToken)}` : '';

  if (state.sharePreviewFile) {
    const f = state.sharePreviewFile;
    if (f.loading) {
      return `<div class="flex min-h-screen flex-col">
        <div class="flex flex-1 items-center justify-center">
          <div class="flex flex-col items-center gap-3 text-slate-500">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"></div>
            <p>加载预览...</p>
          </div>
        </div>
        ${renderFooter()}
      </div>`;
    }
    const preview = info.allowPreview ? renderPreviewBody(f.previewInfo, f.mimeType, true) : '';
    const downloadUrl = `${API}/share/${token}/files/${f.id}/download${q}`;
    return `<div class="fixed inset-0 z-40 flex flex-col bg-white">
      <div class="modal-fullscreen-header">
        <div class="min-w-0">
          <button class="mb-1 text-sm text-brand-600 hover:underline" id="share-back-folder">← 返回文件夹</button>
          <h1 class="truncate text-lg font-semibold">${esc(f.name)}</h1>
        </div>
        ${info.allowDownload ? `<a class="btn-primary shrink-0" href="${downloadUrl}" target="_blank">下载</a>` : ''}
      </div>
      <div class="modal-fullscreen-body">${preview}</div>
    </div>`;
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

  return `<div class="flex min-h-screen flex-col">
    ${renderAppHeader('外链分享', '')}
    <main class="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <div class="mb-5">
        <h1 class="text-xl font-bold text-slate-900">📁 ${esc(info.name)}</h1>
        <p class="mt-1 text-sm text-slate-500">文件夹分享 · 浏览并下载内容</p>
      </div>
      <div class="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white/60 px-4 py-2.5 text-sm shadow-sm">
        <span class="text-slate-400">路径</span>
        <nav class="flex flex-wrap items-center">${crumbs}</nav>
      </div>
      <div class="card overflow-x-auto">
        <table class="file-table w-full text-left"><thead><tr>
          <th class="px-4 py-3">名称</th>
          <th class="px-4 py-3">大小</th>
          <th class="px-4 py-3 text-right">操作</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="3" class="px-6 py-16 text-center text-slate-400">空文件夹</td></tr>'}</tbody></table>
      </div>
    </main>
    ${renderFooter()}
  </div>`;
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
      preview = `<iframe src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}" class="preview-frame min-h-[60vh]"></iframe>`;
    } else if ((info.mimeType || '').startsWith('image/')) {
      preview = `<div class="flex min-h-[40vh] items-center justify-center rounded-xl bg-slate-50 p-4"><img src="${previewUrl}" class="preview-media" alt="" /></div>`;
    } else if (info.previewable) {
      preview = `<iframe src="${previewUrl}" class="preview-frame min-h-[60vh] w-full rounded-xl border border-slate-200"></iframe>`;
    }
  }

  return `<div class="flex min-h-screen flex-col">
    ${renderAppHeader('外链分享', '')}
    <main class="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <div class="card p-6">
        <h1 class="mb-1 text-xl font-bold text-slate-900">${esc(info.name)}</h1>
        <p class="mb-5 text-sm text-slate-500">${formatBytes(info.size)} · ${info.mimeType || '未知类型'}</p>
        ${preview}
        <div class="mt-5 flex flex-wrap gap-2">
          ${info.allowDownload ? `<a class="btn-primary" href="${downloadUrl}" target="_blank">下载</a>` : ''}
          ${info.allowEdit ? `<button class="btn-secondary" id="share-edit-btn">在线编辑</button>` : ''}
        </div>
      </div>
    </main>
    ${renderFooter()}
  </div>`;
}

function renderSharePageView() {
  const info = state.shareInfo;
  if (state.shareError) {
    return `<div class="flex min-h-screen flex-col">
      <div class="flex flex-1 items-center justify-center p-4"><p class="rounded-xl bg-red-50 px-4 py-3 text-red-600">${esc(state.shareError)}</p></div>
      ${renderFooter()}
    </div>`;
  }
  if (!info) {
    return `<div class="flex min-h-screen flex-col">
      <div class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"></div>
        <p>加载中...</p>
      </div>
      ${renderFooter()}
    </div>`;
  }
  if (info.expired) {
    return `<div class="flex min-h-screen flex-col">
      <div class="flex flex-1 items-center justify-center"><p class="text-red-500">分享已过期</p></div>
      ${renderFooter()}
    </div>`;
  }

  if (state.shareNeedsPassword) {
    return `<div class="flex min-h-screen flex-col">
      <div class="flex flex-1 items-center justify-center p-4">
        <div class="auth-card">
          <div class="mb-4 flex justify-center"><div class="logo-badge">🔗</div></div>
          <h2 class="mb-1 text-center text-lg font-semibold">${esc(info.name)}</h2>
          <p class="mb-6 text-center text-sm text-slate-500">此分享需要密码</p>
          <form id="share-pwd-form" class="space-y-3">
            <input class="input" type="password" name="password" required placeholder="请输入分享密码" />
            <button class="btn-primary w-full">验证并进入</button>
          </form>
        </div>
      </div>
      ${renderFooter()}
    </div>`;
  }

  if (info.isFolder) return renderShareFolderView();
  return renderShareFileView();
}

function render() {
  const app = document.getElementById('app');
  if (state.loading) {
    app.innerHTML = `<div class="flex min-h-screen flex-col">
      <div class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"></div>
        <p>加载中...</p>
      </div>
      ${renderFooter()}
    </div>`;
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
  if (state.page === 'settings') {
    app.innerHTML = renderSettings();
    bindSettingsEvents();
    return;
  }
  app.innerHTML = renderMain();
  bindMainEvents();
}

function bindAuthEvents() {
  document.getElementById('auth-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.needsSetup) handleSetup(e);
  });
  document.getElementById('auth-login-btn')?.addEventListener('click', () => {
    const form = document.getElementById('auth-form');
    if (!form || state.needsSetup) return;
    handleLogin({ preventDefault: () => {}, target: form });
  });
  document.getElementById('auth-register-btn')?.addEventListener('click', () => {
    if (!state.registrationOpen) return;
    const form = document.getElementById('auth-form');
    if (!form || state.needsSetup) return;
    handleRegister({ preventDefault: () => {}, target: form });
  });
}

function bindSettingsEvents() {
  document.getElementById('back-files-btn')?.addEventListener('click', backToFiles);
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.querySelectorAll('[data-settings-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      state.settingsTab = el.dataset.settingsTab;
      state.editingUserId = null;
      state.editingGroupId = null;
      clearError();
      render();
    });
  });
  document.getElementById('password-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    savePassword(e.target).catch((err) => alert(err.message));
  });
  document.getElementById('registration-open')?.addEventListener('change', (e) => {
    saveRegistrationSetting(e.target.checked).catch((err) => alert(err.message));
  });
  document.getElementById('show-user-form-btn')?.addEventListener('click', () => {
    state.showUserForm = true;
    state.editingUserId = null;
    render();
  });
  document.getElementById('show-group-form-btn')?.addEventListener('click', () => {
    state.showGroupForm = true;
    state.editingGroupId = null;
    render();
  });
  document.querySelectorAll('[data-cancel-user-form]').forEach((el) => {
    el.addEventListener('click', () => {
      state.showUserForm = false;
      state.editingUserId = null;
      render();
    });
  });
  document.querySelectorAll('[data-cancel-group-form]').forEach((el) => {
    el.addEventListener('click', () => {
      state.showGroupForm = false;
      state.editingGroupId = null;
      render();
    });
  });
  document.getElementById('new-user-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitNewUser(e.target).catch((err) => alert(err.message));
  });
  document.querySelectorAll('[id^="edit-user-form-"]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const userId = form.id.replace('edit-user-form-', '');
      submitEditUser(form, userId).catch((err) => alert(err.message));
    });
  });
  document.querySelectorAll('[data-edit-user]').forEach((el) => {
    el.addEventListener('click', () => {
      state.editingUserId = el.dataset.editUser;
      state.showUserForm = false;
      render();
    });
  });
  document.querySelectorAll('[data-del-user]').forEach((el) => {
    el.addEventListener('click', () =>
      deleteAdminUser(el.dataset.delUser, el.dataset.username).catch((err) => alert(err.message))
    );
  });
  document.getElementById('new-group-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitNewGroup(e.target).catch((err) => alert(err.message));
  });
  document.querySelectorAll('[id^="edit-group-form-"]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const groupId = form.id.replace('edit-group-form-', '');
      submitEditGroup(form, groupId).catch((err) => alert(err.message));
    });
  });
  document.querySelectorAll('[data-edit-group]').forEach((el) => {
    el.addEventListener('click', () => {
      state.editingGroupId = el.dataset.editGroup;
      state.showGroupForm = false;
      render();
    });
  });
  document.querySelectorAll('[data-del-group]').forEach((el) => {
    el.addEventListener('click', () =>
      deleteAdminGroup(el.dataset.delGroup, el.dataset.name).catch((err) => alert(err.message))
    );
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
  document.getElementById('settings-btn')?.addEventListener('click', () => openSettings('account').catch((err) => alert(err.message)));
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
    ['dragenter', 'dragover'].forEach((evt) => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('drop-zone-active'); }));
    ['dragleave', 'drop'].forEach((evt) => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('drop-zone-active'); }));
    dropZone.addEventListener('drop', (e) => uploadFiles([...e.dataTransfer.files]));
  }
}

initApp();
