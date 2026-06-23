const API = '/api';

const state = {
  user: null,
  needsSetup: false,
  files: [],
  currentParentId: null,
  breadcrumbs: [{ id: null, name: '全部文件' }],
  loading: true,
  uploading: false,
  error: '',
};

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });

  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error?.message || '请求失败');
    }
    return data.data;
  }

  if (!res.ok) throw new Error('请求失败');
  return res;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function icon(isFolder) {
  if (isFolder) {
    return `<svg class="h-5 w-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>`;
  }
  return `<svg class="h-5 w-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
}

function setError(msg) {
  state.error = msg;
  render();
}

function clearError() {
  state.error = '';
}

async function init() {
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

    if (state.user) {
      await loadFiles();
    }
  } catch (err) {
    setError(err.message);
  } finally {
    state.loading = false;
    render();
  }
}

async function loadFiles() {
  const query = state.currentParentId ? `?parentId=${state.currentParentId}` : '';
  const data = await api(`/files${query}`);
  state.files = data.files;
}

async function handleSetup(e) {
  e.preventDefault();
  clearError();
  const form = e.target;
  try {
    const data = await api('/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
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
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
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
  } catch {
    /* ignore */
  }
  state.user = null;
  state.files = [];
  state.currentParentId = null;
  state.breadcrumbs = [{ id: null, name: '全部文件' }];
  render();
}

async function openFolder(id, name) {
  state.currentParentId = id;
  state.breadcrumbs.push({ id, name });
  await loadFiles();
  render();
}

async function navigateTo(index) {
  const crumb = state.breadcrumbs[index];
  state.breadcrumbs = state.breadcrumbs.slice(0, index + 1);
  state.currentParentId = crumb.id;
  await loadFiles();
  render();
}

async function createFolder() {
  const name = prompt('请输入文件夹名称');
  if (!name?.trim()) return;
  clearError();
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
  clearError();
  render();

  try {
    for (const file of fileList) {
      const formData = new FormData();
      formData.append('file', file);
      if (state.currentParentId) {
        formData.append('parentId', state.currentParentId);
      }
      await api('/files/upload', { method: 'POST', body: formData });
    }
    await loadFiles();
  } catch (err) {
    setError(err.message);
  } finally {
    state.uploading = false;
    render();
  }
}

async function renameFile(id, currentName) {
  const name = prompt('重命名', currentName);
  if (!name?.trim() || name.trim() === currentName) return;
  clearError();
  try {
    await api(`/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: name.trim() }),
    });
    await loadFiles();
    render();
  } catch (err) {
    setError(err.message);
  }
}

async function deleteFile(id, name, isFolder) {
  const label = isFolder ? '文件夹' : '文件';
  if (!confirm(`确定删除${label}「${name}」吗？`)) return;
  clearError();
  try {
    await api(`/files/${id}`, { method: 'DELETE' });
    await loadFiles();
    render();
  } catch (err) {
    setError(err.message);
  }
}

function downloadFile(id) {
  window.open(`${API}/files/${id}/download`, '_blank');
}

function renderAuth() {
  const isSetup = state.needsSetup;
  return `
    <div class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div class="mb-8 text-center">
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-slate-900">CloudDisk</h1>
          <p class="mt-2 text-sm text-slate-500">${isSetup ? '首次使用，请创建管理员账号' : '登录你的网盘'}</p>
        </div>
        ${state.error ? `<div class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">${state.error}</div>` : ''}
        <form onsubmit="return false" id="auth-form" class="space-y-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">用户名</label>
            <input class="input" name="username" required minlength="2" placeholder="请输入用户名" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">密码</label>
            <input class="input" type="password" name="password" required minlength="6" placeholder="至少 6 位" />
          </div>
          <button type="submit" class="btn-primary w-full">${isSetup ? '创建并进入' : '登录'}</button>
        </form>
      </div>
    </div>
  `;
}

function renderFileList() {
  if (state.files.length === 0) {
    return `
      <div class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-slate-400">
        <svg class="mb-3 h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <p class="text-sm">暂无文件，拖拽或点击上传</p>
      </div>
    `;
  }

  const rows = state.files
    .map(
      (f) => `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="px-4 py-3">
          <button
            class="flex items-center gap-3 text-left ${f.isFolder ? 'font-medium text-slate-900 hover:text-brand-600' : 'text-slate-700'}"
            data-action="${f.isFolder ? 'open' : 'download'}"
            data-id="${f.id}"
            data-name="${f.name.replace(/"/g, '&quot;')}"
          >
            ${icon(f.isFolder)}
            <span>${f.name}</span>
          </button>
        </td>
        <td class="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">${f.isFolder ? '—' : formatBytes(f.size)}</td>
        <td class="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">${formatDate(f.createdAt)}</td>
        <td class="px-4 py-3 text-right">
          <div class="flex justify-end gap-1">
            <button class="btn-secondary px-2 py-1 text-xs" data-action="rename" data-id="${f.id}" data-name="${f.name.replace(/"/g, '&quot;')}">重命名</button>
            <button class="btn-danger px-2 py-1 text-xs" data-action="delete" data-id="${f.id}" data-name="${f.name.replace(/"/g, '&quot;')}" data-folder="${f.isFolder}">删除</button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table class="w-full">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">名称</th>
            <th class="hidden px-4 py-3 font-medium sm:table-cell">大小</th>
            <th class="hidden px-4 py-3 font-medium md:table-cell">创建时间</th>
            <th class="px-4 py-3 font-medium text-right">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderMain() {
  const crumbs = state.breadcrumbs
    .map(
      (c, i) =>
        `<button class="text-sm ${i === state.breadcrumbs.length - 1 ? 'font-medium text-slate-900' : 'text-brand-600 hover:underline'}" data-crumb="${i}">${c.name}</button>`
    )
    .join('<span class="mx-2 text-slate-300">/</span>');

  return `
    <div class="min-h-screen">
      <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
              </svg>
            </div>
            <div>
              <h1 class="text-lg font-bold text-slate-900">CloudDisk</h1>
              <p class="text-xs text-slate-500">轻量个人网盘</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="hidden text-sm text-slate-600 sm:inline">${state.user.username}</span>
            <button id="logout-btn" class="btn-secondary">退出</button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 py-6">
        ${state.error ? `<div class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">${state.error}</div>` : ''}

        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav class="flex flex-wrap items-center">${crumbs}</nav>
          <div class="flex gap-2">
            <button id="newfolder-btn" class="btn-secondary">新建文件夹</button>
            <label class="btn-primary cursor-pointer">
              ${state.uploading ? '上传中...' : '上传文件'}
              <input id="file-input" type="file" multiple class="hidden" ${state.uploading ? 'disabled' : ''} />
            </label>
          </div>
        </div>

        <div id="drop-zone">${renderFileList()}</div>
      </main>
    </div>
  `;
}

function render() {
  const app = document.getElementById('app');
  if (state.loading) {
    app.innerHTML = `<div class="flex min-h-screen items-center justify-center text-slate-500">加载中...</div>`;
    return;
  }

  if (!state.user) {
    app.innerHTML = renderAuth();
    const form = document.getElementById('auth-form');
    form.addEventListener('submit', state.needsSetup ? handleSetup : handleLogin);
    return;
  }

  app.innerHTML = renderMain();
  bindMainEvents();
}

function bindMainEvents() {
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('newfolder-btn').addEventListener('click', createFolder);

  document.querySelectorAll('[data-crumb]').forEach((el) => {
    el.addEventListener('click', () => navigateTo(Number(el.dataset.crumb)));
  });

  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => {
      const { action, id, name, folder } = el.dataset;
      if (action === 'open') openFolder(id, name);
      else if (action === 'download') downloadFile(id);
      else if (action === 'rename') renameFile(id, name);
      else if (action === 'delete') deleteFile(id, name, folder === 'true');
    });
  });

  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', (e) => {
    uploadFiles([...e.target.files]);
    e.target.value = '';
  });

  const dropZone = document.getElementById('drop-zone');
  ['dragenter', 'dragover'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('ring-2', 'ring-brand-500', 'ring-offset-2');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('ring-2', 'ring-brand-500', 'ring-offset-2');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    uploadFiles([...e.dataTransfer.files]);
  });
}

init();
