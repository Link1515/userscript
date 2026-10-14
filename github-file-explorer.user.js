// ==UserScript==
// @name         GitHub Material File Icons
// @namespace    GitHub
// @version      0.2.2
// @description  Material file icons and a collapsible repository file tree for GitHub.
// @match        https://github.com/*/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @connect      cdn.jsdelivr.net
// ==/UserScript==

const MATERIAL_ICON_THEME_VERSION = '5.38.1';

const materialIcons = (() => {
  'use strict';

  const MATERIAL_ICON_MANIFEST_URL =
    'https://cdn.jsdelivr.net/npm/' +
    `material-icon-theme@${MATERIAL_ICON_THEME_VERSION}/` +
    'dist/material-icons.json';
  const MAX_MANIFEST_LENGTH = 2 * 1024 * 1024;
  const MAX_ICON_SVG_LENGTH = 256 * 1024;
  const ICON_DATA_URL_PREFIX = 'data:image/svg+xml,';
  const MAX_ICON_DATA_URL_LENGTH =
    ICON_DATA_URL_PREFIX.length + MAX_ICON_SVG_LENGTH * 9;
  const FILE_LIST_SELECTOR =
    '[data-testid="directory-content"] .react-directory-row, ' +
    'file-tree .js-tree-node[data-tree-entry-type]';
  const FILE_LIST_CONTAINER_SELECTOR =
    '[data-testid="directory-content"], file-tree';
  const STORAGE = {
    prefix: 'github-material-file-icons:',
    manifest:
      `github-material-file-icons:manifest:${
        MATERIAL_ICON_THEME_VERSION
      }`,
    icon: `github-material-file-icons:icon:${
      MATERIAL_ICON_THEME_VERSION
    }`,
  };
  let cacheControls = null;
  let cacheStatus = null;
  let cacheStatusTimer = 0;
  let cacheStatusIdle = 0;
  let themePromise = null;

  installStyles();
  waitForSupportedFileList();

  function waitForSupportedFileList() {
    if (isSupportedFileList()) {
      initialize();

      return;
    }

    if (!document.documentElement) {
      document.addEventListener(
        'DOMContentLoaded',
        waitForSupportedFileList,
        { once: true },
      );

      return;
    }

    const observer = new MutationObserver((records) => {
      if (!records.some((record) => {
        if (
          record.target.nodeType === 1 &&
          record.target.closest('#fjt-sidebar')
        ) return false;
        return Array.from(record.addedNodes).some(containsFileList);
      })) return;

      if (!isSupportedFileList()) return;

      observer.disconnect();
      initialize();
    });

    observer.observe(
      document.documentElement,
      {
        childList: true,
        subtree: true,
      },
    );
  }

  function isSupportedFileList() {
    return Boolean(document.querySelector(FILE_LIST_SELECTOR));
  }

  function containsFileList(node) {
    return node.nodeType === 1 && node.id !== 'fjt-sidebar' && (
      node.matches(FILE_LIST_SELECTOR) ||
      Boolean(node.querySelector(FILE_LIST_SELECTOR))
    );
  }

  function initialize() {
    installCacheControls();

    loadMaterialIconTheme().then((theme) => {
      if (!theme) {
        return;
      }

      applyMaterialIcons(theme);

      observeFileList(theme);
    });
  }

  function installCacheControls() {
    const directoryContent = document.querySelector(
      '[data-testid="directory-content"]',
    );
    const filesPanel = directoryContent?.parentElement?.parentElement;

    if (!filesPanel) return;

    if (cacheControls) {
      if (cacheControls.nextElementSibling !== filesPanel) {
        filesPanel.before(cacheControls);
      }

      return;
    }

    const controls =
      document.createElement('div');

    controls.className =
      'gmi-cache-controls';

    const label =
      document.createElement('span');

    label.className =
      'gmi-cache-status';

    label.setAttribute(
      'aria-live',
      'polite',
    );

    const button =
      document.createElement('button');

    button.className =
      'gmi-cache-clear';

    button.type = 'button';
    button.textContent = '清除圖示快取';

    button.addEventListener(
      'click',
      () => clearCache(button),
    );

    controls.append(
      label,
      button,
    );

    filesPanel.before(controls);
    cacheControls = controls;
    cacheStatus = label;

    cacheStatus.textContent = '圖示快取：計算中…';
    scheduleCacheStatusUpdate();
  }

  function clearCache(button) {
    const summary =
      getCacheSummary();

    if (!summary.entries) return;

    if (
      !confirm(
        `清除 ${formatBytes(summary.bytes)} 的 Material Icon 快取？`,
      )
    ) {
      return;
    }

    button.disabled = true;

    for (const key of getCacheKeys()) {
      GM_deleteValue(key);
    }

    button.disabled = false;
    updateCacheStatus();
  }

  function getCacheKeys() {
    return GM_listValues()
      .filter(
        (key) => key.startsWith(STORAGE.prefix),
      );
  }

  function getCacheSummary() {
    let bytes = 0;
    const encoder = new TextEncoder();

    const keys =
      getCacheKeys();

    for (const key of keys) {
      bytes += encoder.encode(String(GM_getValue(key, ''))).byteLength;
    }

    return {
      entries: keys.length,
      bytes,
    };
  }

  function updateCacheStatus() {
    if (!cacheStatus?.isConnected) return;

    const summary =
      getCacheSummary();

    cacheStatus.textContent =
      `圖示快取：${formatBytes(summary.bytes)} ` +
      `(${summary.entries} 項)`;
  }

  function scheduleCacheStatusUpdate() {
    if (!cacheStatus?.isConnected) return;

    clearTimeout(cacheStatusTimer);
    if (cacheStatusIdle) {
      window.cancelIdleCallback?.(cacheStatusIdle);
      cacheStatusIdle = 0;
    }

    cacheStatusTimer = setTimeout(
      () => {
        if (window.requestIdleCallback) {
          cacheStatusIdle = window.requestIdleCallback(
            () => {
              cacheStatusIdle = 0;
              updateCacheStatus();
            },
            { timeout: 2000 },
          );
        } else {
          updateCacheStatus();
        }
      },
      300,
    );
  }

  function formatBytes(bytes) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ['KiB', 'MiB', 'GiB'];
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)) - 1,
      units.length - 1,
    );

    return `${
      (bytes / (1024 ** (index + 1)))
        .toFixed(1)
    } ${units[index]}`;
  }

  function observeFileList(theme) {
    let timer = 0;

    const observer = new MutationObserver((records) => {
      if (!records.some(isFileListMutation)) return;

      clearTimeout(timer);

      timer = setTimeout(
        () => {
          installCacheControls();
          applyMaterialIcons(theme);
        },
        50,
      );
    });

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
      },
    );
  }

  function isFileListMutation(record) {
    if (
      record.target.nodeType === 1 &&
      record.target.closest('#fjt-sidebar')
    ) return false;

    const changedNodes = [
      ...record.addedNodes,
      ...record.removedNodes,
    ];

    if (
      changedNodes.length &&
      changedNodes.every((node) =>
        node.nodeType === 1 &&
        node.classList.contains('gmi-icon')
      )
    ) {
      return false;
    }

    if (
      record.target.nodeType === 1 &&
      record.target.closest(FILE_LIST_CONTAINER_SELECTOR)
    ) {
      return true;
    }

    return Array.from(record.addedNodes).some((node) =>
      node.nodeType === 1 &&
      node.id !== 'fjt-sidebar' && (
        node.matches(FILE_LIST_CONTAINER_SELECTOR) ||
        Boolean(node.querySelector(FILE_LIST_CONTAINER_SELECTOR))
      )
    );
  }

  function applyMaterialIcons(theme) {
    for (const row of getFileRows()) {
      const name =
        row.nameElement.textContent.trim();

      if (!name) continue;

      if (
        row.nativeIcon.classList.contains(
          'gmi-fallback-icon',
        )
      ) {
        continue;
      }

      const icon =
        ensureMaterialIcon(row.nativeIcon);

      const fileKind = row.isDirectory
        ? 'directory'
        : row.isSubmodule
          ? 'submodule'
          : 'file';
      const fileKey = `${fileKind}:${name}`;

      if (icon.dataset.gmiFile === fileKey) continue;

      icon.dataset.gmiFile = fileKey;

      setMaterialIcon(
        icon,
        resolveIconName(
          name,
          row.isDirectory,
          row.isSubmodule,
          theme,
        ),
        theme,
        row.nativeIcon,
      );
    }
  }

  function getFileRows() {
    const directoryRows = Array.from(document.querySelectorAll(
      '[data-testid="directory-content"] ' +
      '.react-directory-row .react-directory-filename-column',
    ))
      .map((column) => {
        const nameElement = column.querySelector(
          '.react-directory-filename-cell a',
        );
        const nativeIcon = findNativeFileIcon(column);

        return nameElement && nativeIcon
          ? {
            nameElement,
            nativeIcon,
            isDirectory: isDirectoryIcon(nativeIcon),
            isSubmodule: isSubmoduleIcon(nativeIcon),
          }
          : null;
      })
      .filter(Boolean);

    const diffTreeRows = Array.from(document.querySelectorAll(
      'file-tree .js-tree-node[data-tree-entry-type]',
    ))
      .map((row) => {
        const content = row.querySelector(
          ':scope > .ActionList-content',
        );
        const nameElement = content?.querySelector(
          '.ActionList-item-label',
        );
        const nativeIcon = content?.querySelector(
          '.ActionList-item-visual--leading svg.octicon-file, ' +
          '.ActionList-item-visual--leading svg[class*="octicon-file-directory"]',
        );

        return nameElement && nativeIcon
          ? {
            nameElement,
            nativeIcon,
            isDirectory:
              row.dataset.treeEntryType === 'directory',
            isSubmodule:
              isSubmoduleIcon(nativeIcon),
          }
          : null;
      })
      .filter(Boolean);

    return directoryRows.concat(diffTreeRows);
  }

  function findNativeFileIcon(container) {
    if (!container) return null;

    return Array.from(
      container.querySelectorAll('svg'),
    ).find(
      (icon) =>
        icon.classList.contains('octicon-file') ||
        icon.classList.contains('octicon-file-directory') ||
        icon.classList.contains('octicon-file-directory-fill') ||
        icon.classList.contains(
          'octicon-file-directory-symlink',
        ) ||
        icon.classList.contains('octicon-file-submodule'),
    ) || null;
  }

  function isDirectoryIcon(icon) {
    return (
      icon.classList.contains('octicon-file-directory') ||
      icon.classList.contains('octicon-file-directory-fill') ||
      icon.classList.contains(
        'octicon-file-directory-symlink',
      )
    );
  }

  function isSubmoduleIcon(icon) {
    return icon.classList.contains(
      'octicon-file-submodule',
    );
  }

  function ensureMaterialIcon(nativeIcon) {
    const existing =
      nativeIcon.nextElementSibling;

    if (
      existing?.classList.contains('gmi-icon')
    ) {
      return existing;
    }

    const icon =
      document.createElement('span');

    icon.className = 'gmi-icon';
    icon.setAttribute('aria-hidden', 'true');

    nativeIcon.after(icon);

    return icon;
  }

  function resolveIconName(
    name,
    isDirectory,
    isSubmodule,
    theme,
  ) {
    const normalized =
      name.toLocaleLowerCase();

    if (isDirectory) {
      const folderName =
        normalized.split('/').pop();

      return theme.folderNames[normalized] ||
        theme.folderNames[folderName] ||
        theme.folder;
    }

    if (isSubmodule) {
      return 'git';
    }

    const fileNameIcon =
      theme.fileNames[normalized];

    if (fileNameIcon) {
      return fileNameIcon;
    }

    for (
      let dot = normalized.indexOf('.');
      dot !== -1;
      dot = normalized.indexOf('.', dot + 1)
    ) {
      const extension = normalized.slice(dot + 1);

      if (Object.hasOwn(theme.fileExtensions, extension)) {
        return theme.fileExtensions[extension];
      }
    }

    return theme.file;
  }

  function loadMaterialIconTheme() {
    if (themePromise) return themePromise;

    const cached =
      readCachedTheme();

    if (cached) {
      themePromise = Promise.resolve(cached);
      return themePromise;
    }

    themePromise = new Promise((resolve) => {
      let request;
      let finished = false;
      const timer = setTimeout(() => {
        finish(null);
        request?.abort();
      }, 8000);
      const finish = (theme) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(theme);
      };
      request = GM_xmlhttpRequest({
        method: 'GET',
        url: MATERIAL_ICON_MANIFEST_URL,
        redirect: 'error',
        timeout: 8000,
        onprogress: (progress) => {
          if (progress.loaded > MAX_MANIFEST_LENGTH) {
            finish(null);
            request?.abort();
          }
        },
        onload: (response) => {
          if (finished) return;
          if (
            response.status < 200 ||
            response.status >= 300 ||
            !isExpectedResponseUrl(
              response.finalUrl,
              MATERIAL_ICON_MANIFEST_URL,
            ) ||
            typeof response.responseText !== 'string' ||
            response.responseText.length > MAX_MANIFEST_LENGTH
          ) {
            finish(null);

            return;
          }

          try {
            const manifest =
              JSON.parse(response.responseText);

            const theme =
              makeMaterialIconTheme(manifest);

            if (theme) {
              saveValue(
                STORAGE.manifest,
                JSON.stringify(manifest),
              );
            }

            finish(theme);
          } catch (error) {
            console.warn(
              '[GitHub Material File Icons] 無法解析 Material Icon Theme manifest。',
              error,
            );

            finish(null);
          }
        },
        onerror: () => finish(null),
        ontimeout: () => finish(null),
      });
    }).then((theme) => {
      if (!theme) themePromise = null;
      return theme;
    });

    return themePromise;
  }

  function readCachedTheme() {
    const cached =
      String(
        GM_getValue(STORAGE.manifest, '') || '',
      );

    if (!cached) return null;
    if (cached.length > MAX_MANIFEST_LENGTH) return null;

    try {
      return makeMaterialIconTheme(
        JSON.parse(cached),
      );
    } catch (_) {
      return null;
    }
  }

  function makeMaterialIconTheme(manifest) {
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      !manifest.iconDefinitions ||
      typeof manifest.iconDefinitions !== 'object'
    ) {
      return null;
    }

    const iconUrls =
      new Map();

    for (
      const [name, definition]
      of Object.entries(manifest.iconDefinitions)
    ) {
      if (typeof definition?.iconPath !== 'string') {
        continue;
      }

      const url = new URL(
        definition.iconPath,
        MATERIAL_ICON_MANIFEST_URL,
      );

      if (
        !url.href.startsWith(
          `https://cdn.jsdelivr.net/npm/material-icon-theme@${
            MATERIAL_ICON_THEME_VERSION
          }/icons/`,
        )
      ) {
        continue;
      }

      iconUrls.set(name, url.href);
    }

    if (!iconUrls.size) {
      return null;
    }

    const fileExtensions =
      asObject(manifest.fileExtensions);

    return {
      iconUrls,
      iconDataUrls: new Map(),
      iconRequests: new Map(),
      file: manifest.file,
      folder: manifest.folder,
      folderExpanded: manifest.folderExpanded,
      fileNames: asObject(manifest.fileNames),
      fileExtensions,
      folderNames: asObject(manifest.folderNames),
      folderNamesExpanded: asObject(manifest.folderNamesExpanded),
    };
  }

  function asObject(value) {
    return value &&
      typeof value === 'object'
      ? value
      : {};
  }

  function setMaterialIcon(
    element,
    name,
    theme,
    nativeIcon,
  ) {
    if (element.dataset.gmiIcon === name) return;

    element.dataset.gmiIcon = name;

    loadMaterialIcon(name, theme).then((url) => {
      if (element.dataset.gmiIcon !== name) {
        return;
      }

      if (!url) {
        restoreNativeIcon(element, nativeIcon);
        return;
      }

      element.style.setProperty(
        '--gmi-icon-url',
        `url("${url}")`,
      );

      element.classList.add('has-material-icon');
      nativeIcon.classList.add('gmi-native-icon');
    });
  }

  function restoreNativeIcon(element, nativeIcon) {
    element.remove();

    nativeIcon.classList.remove('gmi-native-icon');
    nativeIcon.classList.add('gmi-fallback-icon');
  }

  function loadMaterialIcon(name, theme) {
    const cached =
      theme.iconDataUrls.get(name);

    if (cached) {
      return Promise.resolve(cached);
    }

    const stored =
      String(
        GM_getValue(iconStorageKey(name), '') || '',
      );

    if (isTrustedIconDataUrl(stored)) {
      theme.iconDataUrls.set(name, stored);

      return Promise.resolve(stored);
    }

    const pending =
      theme.iconRequests.get(name);

    if (pending) {
      return pending;
    }

    const iconUrl =
      theme.iconUrls.get(name);

    if (!iconUrl) {
      return Promise.resolve(null);
    }

    const request =
      new Promise((resolve) => {
        let download;
        let finished = false;
        const timer = setTimeout(() => {
          finish(null);
          download?.abort();
        }, 8000);
        const finish = (url) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve(url);
        };
        download = GM_xmlhttpRequest({
          method: 'GET',
          url: iconUrl,
          redirect: 'error',
          timeout: 8000,
          onprogress: (progress) => {
            if (progress.loaded > MAX_ICON_SVG_LENGTH) {
              finish(null);
              download?.abort();
            }
          },
          onload: (response) => {
            if (finished) return;
            if (
              response.status < 200 ||
              response.status >= 300 ||
              !isExpectedResponseUrl(response.finalUrl, iconUrl) ||
              !isSvgImage(response.responseText)
            ) {
              finish(null);

              return;
            }

            let dataUrl;
            try {
              dataUrl = ICON_DATA_URL_PREFIX +
                encodeURIComponent(response.responseText);
            } catch (_) {
              finish(null);
              return;
            }

            theme.iconDataUrls.set(name, dataUrl);
            saveValue(
              iconStorageKey(name),
              dataUrl,
            );
            finish(dataUrl);
          },
          onerror: () => finish(null),
          ontimeout: () => finish(null),
        });
      }).finally(() => {
        theme.iconRequests.delete(name);
      });

    theme.iconRequests.set(name, request);

    return request;
  }

  function isSvgImage(svg) {
    return typeof svg === 'string' &&
      svg.length > 0 &&
      svg.length <= MAX_ICON_SVG_LENGTH &&
      /^\s*(?:<\?xml[^>]*\?>\s*)?<svg(?:\s|\/?>)/i.test(svg);
  }

  function isExpectedResponseUrl(finalUrl, expectedUrl) {
    if (!finalUrl) return true;

    try {
      const actual = new URL(finalUrl);
      const expected = new URL(expectedUrl);
      return actual.origin === expected.origin &&
        actual.pathname === expected.pathname &&
        actual.search === expected.search;
    } catch (_) {
      return false;
    }
  }

  function isTrustedIconDataUrl(url) {
    if (
      !url.startsWith(ICON_DATA_URL_PREFIX) ||
      url.length > MAX_ICON_DATA_URL_LENGTH
    ) return false;

    try {
      const svg = decodeURIComponent(
        url.slice(ICON_DATA_URL_PREFIX.length),
      );
      return isSvgImage(svg) &&
        url === ICON_DATA_URL_PREFIX + encodeURIComponent(svg);
    } catch (_) {
      return false;
    }
  }

  function iconStorageKey(name) {
    return `${STORAGE.icon}:${name}`;
  }

  function saveValue(key, value) {
    try {
      GM_setValue(key, value);
      scheduleCacheStatusUpdate();
    } catch (error) {
      console.warn(
        '[GitHub Material File Icons] 無法寫入圖示快取。',
        error,
      );
    }
  }

  function installStyles() {
    GM_addStyle(`
      .gmi-native-icon {
        display: none !important;
      }

      .gmi-icon {
        display: none;

        width: 16px;
        height: 16px;

        flex: 0 0 16px;

        vertical-align: -3px;

        background-image: var(--gmi-icon-url);
        background-position: center;
        background-repeat: no-repeat;
        background-size: contain;
      }

      .gmi-icon.has-material-icon {
        display: inline-block;
      }

      .gmi-cache-controls {
        display: flex;

        align-items: center;
        justify-content: flex-end;

        gap: 8px;

        margin: 8px 0 6px;

        color: var(--fgColor-muted, #6a737d);

        font-size: 12px;
      }

      .gmi-cache-clear {
        padding: 3px 7px;

        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 4px;

        background: transparent;
        color: inherit;

        cursor: pointer;

        font: inherit;
      }

      .gmi-cache-clear:hover:not(:disabled) {
        background: var(--bgColor-muted, rgba(127, 127, 127, .10));
        color: var(--fgColor-default, #24292f);
      }

      .gmi-cache-clear:disabled {
        cursor: wait;
        opacity: .65;
      }

    `);
  }

  return { loadMaterialIconTheme, loadMaterialIcon, resolveIconName };
})();

// Repository file tree
(() => {
  'use strict';

  const STORAGE = {
    token: 'github-file-tree:pat',
    width: 'github-file-tree:width',
    collapsed: 'github-file-tree:collapsed',
  };

  const MIN_WIDTH = 220;
  const MAX_WIDTH = 620;
  const DEFAULT_WIDTH = 320;
  const MAX_SEARCH_RESULTS = 200;
  const MAX_API_RESPONSE_LENGTH = 16 * 1024 * 1024;
  const RESERVED_ROOTS = new Set([
    'settings', 'notifications', 'issues', 'pulls', 'search',
    'explore', 'topics', 'trending', 'marketplace', 'apps',
    'orgs', 'organizations', 'codespaces', 'sponsors',
    'login', 'signup', 'account', 'about', 'pricing',
  ]);

  let ctx = null;
  let ui = null;
  let pageKey = '';
  let generation = 0;

  installStyles();
  registerMenus();
  syncPage();
  document.addEventListener('DOMContentLoaded', syncPage, { once: true });
  for (const event of ['turbo:load', 'turbo:render', 'pjax:end', 'popstate']) {
    document.addEventListener(event, syncPage);
  }
  // GitHub may change history without firing popstate.
  setInterval(syncPage, 750);

  function syncPage() {
    if (!document.body) return;

    const next = parseRepositoryContext();
    const key = next ? location.pathname : '';
    if (key === pageKey && ui?.host.isConnected) return;
    if (!key && !ui) return;

    generation += 1;
    ui?.abort.abort();
    ui?.host.remove();
    ui = null;
    ctx = next;
    pageKey = key;
    if (!ctx) return;

    const current = ++generation;
    const context = ctx;
    ui = createShell();
    ui.context = context;
    const pageUi = ui;
    pageUi.start = () => {
      pageUi.start = null;
      init(pageUi, context, current).catch((error) => {
        if (current === generation) showError(pageUi, error);
        console.error('[GitHub File Tree]', error);
      });
    };
    if (!pageUi.host.classList.contains('is-collapsed')) {
      pageUi.start();
    }
  }

  async function init(ui, context, current) {
    setStatus(ui, '正在解析 repository…');

    try {
      const resolved = await resolveRefAndPath(context);
      if (current !== generation) return;
      const { rootTree, ...refAndPath } = resolved;
      Object.assign(context, refAndPath);

      setHeader(ui, `${context.owner}/${context.repo}`, context.ref);
      setStatus(ui, '正在載入根目錄…');

      const treeSha = /^[a-f0-9]{40,64}$/i.test(context.ref)
        ? await resolveTreeSha(context)
        : context.ref;
      if (current !== generation) return;
      const root = makeDirNode('', '', treeSha);
      const flat = makeFlatIndex();

      await loadDirectory(root, flat, context, rootTree);
      if (current !== generation) return;

      renderRoot(ui, root, flat);
      wireSearch(ui, flat);
      materialIcons.loadMaterialIconTheme().then((theme) => {
        if (current !== generation) return;
        ui.iconTheme = theme;
        refreshMaterialIcons(ui);
      });

      await expandToCurrentPath(
        ui,
        ctx.currentPath,
        root,
        flat,
      );

      if (current === generation) setLoadedStatus(ui, flat);
    } catch (error) {
      if (current === generation) showError(ui, error);
    }
  }

  function parseRepositoryContext() {
    const seg = location.pathname
      .split('/')
      .filter(Boolean)
      .map(safeDecode);

    if (seg.length < 2) return null;

    const [owner, repo] = seg;

    if (
      !owner || !repo || repo.endsWith('.git') ||
      /[\\/\\\u0000-\u001f\u007f]/.test(owner) ||
      /[\\/\\\u0000-\u001f\u007f]/.test(repo) ||
      owner === '.' || owner === '..' ||
      repo === '.' || repo === '..' ||
      RESERVED_ROOTS.has(owner.toLowerCase())
    ) return null;

    const result = {
      owner,
      repo,
      ref: '',
      currentPath: '',
      sourceTail: [],
      pageType: seg[2] || 'root',
    };

    if (['tree', 'blob'].includes(seg[2]) && seg.length > 3) {
      result.sourceTail = seg.slice(3);
    } else if (seg.length > 2) {
      return null;
    }

    return result;
  }

  async function resolveRefAndPath(context) {
    // GitHub's repository React app exposes the exact ref and file path.
    const embedded = readEmbeddedContext(context);
    if (embedded) return embedded;

    if (!context.sourceTail.length) {
      const repo = await apiJson(
        `/repos/${enc(context.owner)}/${enc(context.repo)}`,
      );

      if (!repo.default_branch) {
        throw new Error('無法取得 default branch。');
      }

      return {
        ref: repo.default_branch,
        currentPath: '',
      };
    }

    if (/^[a-f0-9]{40,64}$/i.test(context.sourceTail[0])) {
      return {
        ref: context.sourceTail[0],
        currentPath: context.sourceTail.slice(1).join('/'),
      };
    }

    // Branches and tags can include '/'; select the longest existing ref.
    for (let i = context.sourceTail.length; i >= 1; i -= 1) {
      const candidate = context.sourceTail.slice(0, i).join('/');

      const tree = await apiJson(
        `/repos/${enc(context.owner)}/${enc(context.repo)}/git/trees/${encodePath(candidate)}`,
        { allow404: true },
      );
      if (tree && Array.isArray(tree.tree)) {
        return {
          ref: candidate,
          currentPath: context.sourceTail.slice(i).join('/'),
          rootTree: tree,
        };
      }
    }

    throw new Error('無法從目前 URL 判斷 GitHub branch/tag。');
  }

  function readEmbeddedContext(context) {
    for (const script of document.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
      try {
        const payload = JSON.parse(script.textContent)?.payload;
        if (
          payload?.repo?.ownerLogin?.toLowerCase() !== context.owner.toLowerCase() ||
          payload?.repo?.name?.toLowerCase() !== context.repo.toLowerCase()
        ) continue;

        const ref = payload.refInfo?.name;
        const path = payload.path;
        if (typeof ref !== 'string' || !ref) continue;
        if (context.pageType !== 'root' && typeof path !== 'string') continue;
        if (
          context.pageType !== 'root' &&
          context.sourceTail.join('/') !== [ref, path].filter(Boolean).join('/')
        ) continue;

        return { ref, currentPath: path || '' };
      } catch (_) {
        // Other React apps can contain unrelated embedded data.
      }
    }

    return null;
  }

  async function resolveTreeSha(context) {
    const commit = await apiJson(
      `/repos/${enc(context.owner)}/${enc(context.repo)}/commits/${enc(context.ref)}`,
    );

    const sha = commit?.commit?.tree?.sha;

    if (!sha) {
      throw new Error(`找不到 ref：${context.ref}`);
    }

    return sha;
  }

  async function loadDirectory(node, flat, context = ctx, existingTree = null) {
    const data = existingTree || await apiJson(
      `/repos/${enc(context.owner)}/${enc(context.repo)}/git/trees/${encodePath(node.sha)}`,
    );

    if (data.truncated) {
      throw new Error('目錄超過 GitHub API 限制，無法完整顯示。');
    }

    const entries = Array.isArray(data.tree) ? data.tree : [];

    node.children = sortNodes(
      entries
        .filter((entry) => entry?.path)
        .map((entry) => makeNode(entry, node.path)),
    );

    addToFlatIndex(flat, node.children);
  }

  function makeDirNode(name, path, sha) {
    return {
      name,
      path,
      type: 'dir',
      sha,
      children: null,
      renderPromise: null,
    };
  }

  function makeNode(entry, parentPath) {
    const name = entry.path;
    const path = parentPath
      ? `${parentPath}/${name}`
      : name;

    if (entry.type === 'tree') {
      return makeDirNode(name, path, entry.sha || '');
    }

    return {
      name,
      path,
      type:
        entry.type === 'commit'
          ? 'submodule'
          : 'file',
      sha: entry.sha || '',
    };
  }

  function sortNodes(nodes) {
    return nodes.sort((a, b) => {
      // folder 優先
      if (a.type === 'dir' && b.type !== 'dir') {
        return -1;
      }

      if (a.type !== 'dir' && b.type === 'dir') {
        return 1;
      }

      return a.name.localeCompare(
        b.name,
        undefined,
        {
          numeric: true,
          sensitivity: 'base',
        },
      );
    });
  }

  function makeFlatIndex() {
    return {
      files: new Map(),
      dirs: new Set(),
    };
  }

  function setMaterialFileIcon(
    element,
    name,
    theme,
    isSubmodule,
  ) {
    if (!theme) return;

    setMaterialIcon(
      element,
      materialIcons.resolveIconName(name, false, isSubmodule, theme),
      theme,
    );
  }

  function setMaterialFolderIcon(
    element,
    name,
    expanded,
    theme,
  ) {
    if (!theme) return;

    const normalized =
      name.toLocaleLowerCase();

    const associations = expanded
      ? theme.folderNamesExpanded
      : theme.folderNames;

    setMaterialIcon(
      element,
      associations[normalized] ||
        (
          expanded
            ? theme.folderExpanded
            : theme.folder
        ),
      theme,
    );
  }

  function setMaterialIcon(
    element,
    name,
    theme,
  ) {
    if (!element || !name) return;

    element.dataset.fjtMaterialIcon =
      name;

    materialIcons.loadMaterialIcon(name, theme).then((url) => {
      if (
        !url ||
        element.dataset.fjtMaterialIcon !== name
      ) {
        return;
      }

      element.style.setProperty(
        '--fjt-icon-url',
        `url("${url}")`,
      );

      element.classList.add(
        'has-material-icon',
      );
    });
  }

  function refreshMaterialIcons(ui) {
    if (!ui.iconTheme) return;

    for (
      const row
      of ui.tree.querySelectorAll('.fjt-file-row')
    ) {
      setMaterialFileIcon(
        row.querySelector('.fjt-file-icon'),
        row.querySelector('.fjt-label').textContent,
        ui.iconTheme,
        row.querySelector('.fjt-file-icon')
          .classList.contains('is-submodule'),
      );
    }

    for (
      const details
      of ui.tree.querySelectorAll('.fjt-dir')
    ) {
      setMaterialFolderIcon(
        details.querySelector('.fjt-folder-icon'),
        details.querySelector('.fjt-label').textContent,
        details.open,
        ui.iconTheme,
      );
    }

    for (
      const item
      of ui.searchResults.querySelectorAll('.fjt-search-item')
    ) {
      const icon =
        item.querySelector('.fjt-file-icon');

      setMaterialFileIcon(
        icon,
        item.querySelector('.fjt-search-name').textContent,
        ui.iconTheme,
        icon.classList.contains('is-submodule'),
      );
    }
  }

  function addToFlatIndex(flat, nodes) {
    for (const node of nodes) {
      if (node.type === 'dir') {
        flat.dirs.add(node.path);
      } else {
        flat.files.set(node.path, node);
      }
    }
  }

  function createShell() {
    const width = clamp(
      Number(
        GM_getValue(
          STORAGE.width,
          DEFAULT_WIDTH,
        ),
      ),
      MIN_WIDTH,
      MAX_WIDTH,
    );

    const collapsed = Boolean(
      GM_getValue(
        STORAGE.collapsed,
        false,
      ),
    );

    const host = document.createElement('aside');

    host.id = 'fjt-sidebar';

    host.style.setProperty(
      '--fjt-width',
      `${width}px`,
    );

    host.classList.toggle(
      'is-collapsed',
      collapsed,
    );

    host.innerHTML = `
      <div
        class="fjt-collapsed-tab"
        title="展開檔案樹"
      >
        ‹
      </div>

      <div class="fjt-panel">

        <div class="fjt-header">
          <div class="fjt-title-wrap">

            <div class="fjt-title">
              File Tree
            </div>

            <div class="fjt-ref"></div>

          </div>

          <button
            class="fjt-icon-btn fjt-collapse"
            type="button"
            title="收合 (Alt+T)"
          >
            ›
          </button>
        </div>

        <div class="fjt-repo"></div>

        <div class="fjt-search-wrap">
          <input
            class="fjt-search"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="搜尋已載入檔案…  /"
            title="僅搜尋已展開目錄載入的檔案"
          />
        </div>

        <div class="fjt-body">

          <div class="fjt-status">
            初始化…
          </div>

          <div
            class="fjt-tree"
            role="tree"
          ></div>

          <div
            class="fjt-search-results"
            hidden
          ></div>

        </div>

        <div
          class="fjt-resizer"
          title="拖曳調整寬度"
        ></div>

      </div>
    `;

    document.body.appendChild(host);

    const ui = {
      host,
      abort: new AbortController(),

      panel:
        host.querySelector('.fjt-panel'),

      title:
        host.querySelector('.fjt-title'),

      ref:
        host.querySelector('.fjt-ref'),

      repo:
        host.querySelector('.fjt-repo'),

      search:
        host.querySelector('.fjt-search'),

      status:
        host.querySelector('.fjt-status'),

      tree:
        host.querySelector('.fjt-tree'),

      searchResults:
        host.querySelector('.fjt-search-results'),

      collapse:
        host.querySelector('.fjt-collapse'),

      collapsedTab:
        host.querySelector('.fjt-collapsed-tab'),

      resizer:
        host.querySelector('.fjt-resizer'),
    };

    ui.collapse.addEventListener(
      'click',
      () => setCollapsed(ui, true),
    );

    ui.collapsedTab.addEventListener(
      'click',
      () => setCollapsed(ui, false),
    );

    wireHoverCollapse(ui);
    wireResize(ui);
    wireKeyboard(ui);

    return ui;
  }

  function setHeader(ui, repo, ref) {
    ui.repo.textContent = repo;
    ui.repo.title = repo;

    ui.ref.textContent = ref;
    ui.ref.title = ref;
  }

  function setStatus(ui, text) {
    ui.status.textContent = text;
    ui.status.hidden = false;
  }

  function showError(ui, error) {
    ui.tree.replaceChildren();

    ui.searchResults.hidden = true;
    ui.search.disabled = true;

    ui.status.hidden = false;
    ui.status.classList.add('is-error');
    ui.status.innerHTML = '';

    const isAuth =
      error?.name === 'GitHubAuthError';

    const message =
      document.createElement('div');

    message.textContent = isAuth
      ? 'GitHub API 拒絕存取。若這是 private repository，請設定 Personal Access Token。'
      : `載入失敗：${error?.message || String(error)}`;

    ui.status.appendChild(message);

    if (isAuth) {
      const button =
        document.createElement('button');

      button.type = 'button';

      button.className =
        'fjt-action-btn';

      button.textContent =
        '設定 PAT';

      button.addEventListener(
        'click',
        () => {
          if (promptAndSaveToken()) {
            location.reload();
          }
        },
      );

      ui.status.appendChild(button);
    }
  }

  function renderRoot(ui, root, flat) {
    ui.tree.replaceChildren();
    ui.status.hidden = true;

    const fragment =
      document.createDocumentFragment();

    for (const child of root.children) {
      fragment.appendChild(
        createNodeElement(child, ui, flat),
      );
    }

    ui.tree.appendChild(fragment);
  }

  function createNodeElement(node, ui, flat) {
    if (node.type === 'dir') {
      const details =
        document.createElement('details');

      details.className =
        'fjt-dir';

      details.dataset.path =
        node.path;

      const summary =
        document.createElement('summary');

      summary.className =
        'fjt-row fjt-dir-row';

      summary.innerHTML = `
        <span class="fjt-chevron" aria-hidden="true">
          <svg viewBox="0 0 10 16" width="10" height="16">
            <path d="m3.5 5 3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="fjt-folder-icon"></span>
        <span class="fjt-label"></span>
      `;

      const folderIcon =
        summary.querySelector('.fjt-folder-icon');

      setMaterialFolderIcon(
        folderIcon,
        node.name,
        false,
        ui.iconTheme,
      );

      summary
        .querySelector('.fjt-label')
        .textContent = node.name;

      summary.title = node.path;

      details.appendChild(summary);

      /*
       * Lazy load：
       * 只有展開 folder 時才向 API 取得下一層資料並產生 DOM。
       */
      details.addEventListener(
        'toggle',
        () => {
          if (
            !details.open ||
            details.dataset.rendered === '1'
          ) {
            setMaterialFolderIcon(
              folderIcon,
              node.name,
              details.open,
              ui.iconTheme,
            );

            return;
          }

          setMaterialFolderIcon(
            folderIcon,
            node.name,
            true,
            ui.iconTheme,
          );

          renderDirectoryChildren(
            details,
            node,
            ui,
            flat,
          ).catch((error) => {
            showDirectoryError(details, error);
            setLoadedStatus(ui, flat);
          });
        },
      );

      return details;
    }

    const a =
      document.createElement('a');

    a.className =
      'fjt-row fjt-file-row';

    a.dataset.path =
      node.path;

    a.href =
      sourceUrl(node.path);

    a.title =
      node.path;

    const icon =
      document.createElement('span');

    icon.className =
      `fjt-file-icon ${
        node.type === 'submodule'
          ? 'is-submodule'
          : ''
      }`;

    setMaterialFileIcon(
      icon,
      node.name,
      ui.iconTheme,
      node.type === 'submodule',
    );

    const label =
      document.createElement('span');

    label.className =
      'fjt-label';

    label.textContent =
      node.name;

    a.append(
      icon,
      label,
    );

    return a;
  }

  function renderDirectoryChildren(
    details,
    node,
    ui,
    flat,
  ) {
    if (details.dataset.rendered === '1') {
      return Promise.resolve();
    }

    if (node.renderPromise) {
      return node.renderPromise;
    }

    details.dataset.rendered = 'loading';

    details
      .querySelector('.fjt-load-error')
      ?.remove();

    node.renderPromise = (async () => {
      try {
        await loadDirectory(node, flat, ui.context);

        const children =
          document.createElement('div');

        children.className =
          'fjt-children';

        for (const child of node.children) {
          children.appendChild(
            createNodeElement(child, ui, flat),
          );
        }

        details.appendChild(children);
        details.dataset.rendered = '1';
        setLoadedStatus(ui, flat);
      } catch (error) {
        details.dataset.rendered = '';
        throw error;
      } finally {
        node.renderPromise = null;
      }
    })();

    return node.renderPromise;
  }

  function showDirectoryError(details, error) {
    const message =
      document.createElement('div');

    message.className =
      'fjt-children fjt-load-error';

    message.textContent =
      `載入失敗：${error?.message || String(error)}`;

    details.appendChild(message);
  }

  function setLoadedStatus(ui, flat) {
    setStatus(
      ui,
      `已載入 ${flat.files.size.toLocaleString()} files · ` +
        `${flat.dirs.size.toLocaleString()} folders`,
    );
  }

  function wireSearch(ui, flat) {
    const search = ui.search;

    const run = () => {
      const q =
        search.value
          .trim()
          .toLocaleLowerCase();

      if (!q) {
        ui.tree.hidden = false;
        ui.searchResults.hidden = true;

        setLoadedStatus(ui, flat);

        return;
      }

      const tokens =
        q.split(/\s+/)
          .filter(Boolean);

      const scored = [];

      for (const file of flat.files.values()) {
        const haystack =
          file.path
            .toLocaleLowerCase();

        if (
          !tokens.every(
            (token) =>
              haystack.includes(token),
          )
        ) {
          continue;
        }

        scored.push({
          file,
          score:
            fuzzyScore(
              haystack,
              q,
            ),
        });
      }

      scored.sort(
        (a, b) =>
          a.score - b.score ||
          a.file.path.length -
            b.file.path.length ||
          a.file.path.localeCompare(
            b.file.path,
          ),
      );

      const results =
        scored.slice(
          0,
          MAX_SEARCH_RESULTS,
        );

      ui.searchResults.replaceChildren();

      const frag =
        document.createDocumentFragment();

      for (const { file } of results) {
        const a =
          document.createElement('a');

        a.className =
          'fjt-search-item';

        a.href =
          sourceUrl(file.path);

        a.title =
          file.path;

        const icon =
          document.createElement('span');

        icon.className =
          `fjt-file-icon fjt-search-icon ${
            file.type === 'submodule'
              ? 'is-submodule'
              : ''
          }`;

        setMaterialFileIcon(
          icon,
          file.name,
          ui.iconTheme,
          file.type === 'submodule',
        );

        const info =
          document.createElement('div');

        info.className =
          'fjt-search-info';

        const name =
          document.createElement('div');

        name.className =
          'fjt-search-name';

        name.textContent =
          file.name;

        const path =
          document.createElement('div');

        path.className =
          'fjt-search-path';

        path.textContent =
          file.path;

        info.append(
          name,
          path,
        );

        a.append(
          icon,
          info,
        );

        frag.appendChild(a);
      }

      ui.searchResults.appendChild(frag);

      ui.tree.hidden = true;
      ui.searchResults.hidden = false;

      ui.status.hidden = false;

      ui.status.textContent =
        `${scored.length.toLocaleString()} matches` +
        (
          scored.length >
          MAX_SEARCH_RESULTS
            ? ` · 顯示前 ${MAX_SEARCH_RESULTS}`
            : ''
        );
    };

    search.addEventListener(
      'input',
      debounce(run, 80),
    );
  }

  function fuzzyScore(path, query) {
    if (path === query) {
      return 0;
    }

    if (path.endsWith(`/${query}`)) {
      return 1;
    }

    const name =
      path.split('/').pop();

    if (name === query) {
      return 2;
    }

    if (name.startsWith(query)) {
      return 3;
    }

    if (name.includes(query)) {
      return 4;
    }

    if (path.startsWith(query)) {
      return 5;
    }

    return 10 + path.indexOf(query);
  }

  function highlightCurrentPath(ui, path) {
    if (!path) return;

    const target =
      ui.tree.querySelector(
        `.fjt-file-row[data-path="${cssEscape(path)}"], .fjt-dir[data-path="${cssEscape(path)}"]`,
      );

    if (!target) return;

    target.classList.add(
      'is-active',
    );

    requestAnimationFrame(
      () =>
        target.scrollIntoView({
          block: 'center',
        }),
    );
  }

  async function expandToCurrentPath(
    ui,
    path,
    root,
    flat,
  ) {
    if (!path) return;

    const dirs = ui.context.pageType === 'tree'
      ? path.split('/')
      : path.split('/').slice(0, -1);

    let node = root;
    let nodePath = '';

    for (const dir of dirs) {
      nodePath = nodePath
        ? `${nodePath}/${dir}`
        : dir;

      const next =
        node.children?.find(
          (child) =>
            child.type === 'dir' &&
            child.name === dir,
        );

      if (!next) {
        return;
      }

      const details =
        ui.tree.querySelector(
          `details.fjt-dir[data-path="${cssEscape(nodePath)}"]`,
        );

      if (!details) {
        return;
      }

      details.open = true;
      await renderDirectoryChildren(
        details,
        next,
        ui,
        flat,
      );

      node = next;
    }

    highlightCurrentPath(ui, path);
  }

  function sourceUrl(path) {
    const base =
      `/${enc(ctx.owner)}` +
      `/${enc(ctx.repo)}` +
      `/blob` +
      `/${encodePath(ctx.ref)}`;

    return path
      ? `${base}/${encodePath(path)}`
      : base;
  }

  async function apiJson(
    endpoint,
    options = {},
  ) {
    const url = new URL(
      endpoint,
      'https://api.github.com',
    );
    if (
      url.origin !== 'https://api.github.com' ||
      !url.pathname.startsWith('/repos/')
    ) {
      throw new Error('GitHub API 位址無效。');
    }

    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const token =
      String(
        GM_getValue(
          STORAGE.token,
          '',
        ) || '',
      ).trim();

    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }

    const response = await new Promise((resolve, reject) => {
      let request;
      let finished = false;
      const timer = setTimeout(() => {
        finish(reject, new Error('GitHub API 請求逾時。'));
        request?.abort();
      }, 15000);
      const finish = (callback, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        callback(value);
      };
      request = GM_xmlhttpRequest({
        method: 'GET',
        url: url.href,
        headers,
        anonymous: true,
        redirect: 'error',
        timeout: 15000,
        onprogress: (progress) => {
          if (progress.loaded > MAX_API_RESPONSE_LENGTH) {
            finish(reject, new Error('GitHub API 回應過大。'));
            request?.abort();
          }
        },
        onload: (response) => finish(resolve, response),
        onerror: () => finish(reject, new Error('GitHub API 網路請求失敗。')),
        ontimeout: () => finish(reject, new Error('GitHub API 請求逾時。')),
      });
    });

    if (
      response.finalUrl &&
      new URL(response.finalUrl).origin !== url.origin
    ) {
      throw new Error('GitHub API 轉址至非預期的網域。');
    }

    if (
      typeof response.responseText !== 'string' ||
      response.responseText.length > MAX_API_RESPONSE_LENGTH
    ) {
      throw new Error('GitHub API 回應過大或格式無效。');
    }

    if (
      options.allow404 &&
      response.status === 404
    ) {
      return null;
    }

    if (
      response.status === 401 ||
      (response.status === 404 && !token)
    ) {
      const error =
        new Error(
          `HTTP ${response.status}`,
        );

      error.name =
        'GitHubAuthError';

      throw error;
    }

    let body;
    try {
      body = JSON.parse(response.responseText);
    } catch (_) {
      throw new Error(`GitHub API 回應不是 JSON (HTTP ${response.status})。`);
    }

    if (response.status === 403 && /rate limit/i.test(body?.message || '')) {
      throw new Error('GitHub API 速率限制已用盡；可設定 PAT 後重試。');
    }
    if (response.status === 403) {
      const error = new Error(`HTTP 403: ${body?.message || '存取遭拒'}`);
      error.name = 'GitHubAuthError';
      throw error;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GitHub API ${response.status}: ${body?.message || '請求失敗'}`);
    }

    return body;
  }

  function registerMenus() {
    GM_registerMenuCommand(
      'GitHub File Tree：設定 PAT',
      () => {
        if (promptAndSaveToken()) {
          location.reload();
        }
      },
    );

    GM_registerMenuCommand(
      'GitHub File Tree：清除 PAT',
      () => {
        GM_deleteValue(
          STORAGE.token,
        );

        alert(
          '已清除 GitHub PAT。',
        );
      },
    );
  }

  function promptAndSaveToken() {
    const value =
      prompt(
        '輸入 GitHub Personal Access Token。\n\n' +
        'Private repository 建議使用唯讀 Contents 權限。\n' +
        'Token 只會存於 userscript manager 的 storage。\n' +
        '留空會清除現有 Token；取消則保留。',
        '',
      );

    if (value === null) {
      return false;
    }

    const token =
      value.trim();

    if (!token) {
      GM_deleteValue(
        STORAGE.token,
      );
    } else {
      GM_setValue(
        STORAGE.token,
        token,
      );
    }

    return true;
  }

  function wireHoverCollapse(ui) {
    ui.collapsedTab.addEventListener(
      'mouseenter',
      () => setCollapsed(ui, false),
    );

    ui.panel.addEventListener(
      'mouseleave',
      () => setCollapsed(ui, true),
    );
  }

  function wireResize(ui) {
    let startX = 0;
    let startWidth = 0;

    const onMove = (event) => {
      const width =
        clamp(
          startWidth +
            (
              startX -
              event.clientX
            ),
          MIN_WIDTH,
          MAX_WIDTH,
        );

      ui.host.style.setProperty(
        '--fjt-width',
        `${width}px`,
      );
    };

    const onUp = () => {
      document.removeEventListener(
        'mousemove',
        onMove,
      );

      document.removeEventListener(
        'mouseup',
        onUp,
      );

      document.body.classList.remove(
        'fjt-resizing',
      );

      const width =
        parseInt(
          getComputedStyle(
            ui.host,
          ).getPropertyValue(
            '--fjt-width',
          ),
          10,
        );

      GM_setValue(
        STORAGE.width,
        clamp(
          width,
          MIN_WIDTH,
          MAX_WIDTH,
        ),
      );
    };

    ui.resizer.addEventListener(
      'mousedown',
      (event) => {
        startX =
          event.clientX;

        startWidth =
          ui.panel
            .getBoundingClientRect()
            .width;

        document.body.classList.add(
          'fjt-resizing',
        );

        document.addEventListener(
          'mousemove',
          onMove,
          { signal: ui.abort.signal },
        );

        document.addEventListener(
          'mouseup',
          onUp,
          { signal: ui.abort.signal },
        );

        event.preventDefault();
      },
    );
    ui.abort.signal.addEventListener(
      'abort',
      () => document.body.classList.remove('fjt-resizing'),
      { once: true },
    );
  }

  function wireKeyboard(ui) {
    document.addEventListener(
      'keydown',
      (event) => {
        const target =
          event.target;

        const typing =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target?.isContentEditable;

        // Alt + T：展開 / 收合
        if (
          event.altKey &&
          event.key
            .toLocaleLowerCase() === 't'
        ) {
          setCollapsed(
            ui,
            !ui.host.classList.contains(
              'is-collapsed',
            ),
          );

          event.preventDefault();

          return;
        }

        // /：搜尋
        if (
          !typing &&
          event.key === '/'
        ) {
          setCollapsed(
            ui,
            false,
          );

          ui.search.focus();
          ui.search.select();

          event.preventDefault();

          return;
        }

        // ESC：清除搜尋
        if (
          target === ui.search &&
          event.key === 'Escape'
        ) {
          if (ui.search.value) {
            ui.search.value = '';

            ui.search.dispatchEvent(
              new Event(
                'input',
                {
                  bubbles: true,
                },
              ),
            );
          } else {
            ui.search.blur();
          }

          event.preventDefault();
        }
      },
      { signal: ui.abort.signal },
    );
  }

  function setCollapsed(
    ui,
    collapsed,
  ) {
    ui.host.classList.toggle(
      'is-collapsed',
      collapsed,
    );

    GM_setValue(
      STORAGE.collapsed,
      collapsed,
    );

    if (!collapsed) {
      ui.start?.();
      requestAnimationFrame(
        () =>
          ui.search.focus({
            preventScroll: true,
          }),
      );
    }
  }

  function installStyles() {
    GM_addStyle(`
      #fjt-sidebar {
        --fjt-width: ${DEFAULT_WIDTH}px;

        --fjt-bg:
          var(
            --bgColor-default,
            #ffffff
          );

        --fjt-panel:
          var(
            --bgColor-default,
            #ffffff
          );

        --fjt-border:
          var(
            --borderColor-default,
            #d0d7de
          );

        --fjt-text:
          var(
            --fgColor-default,
            #24292f
          );

        --fjt-muted:
          var(
            --fgColor-muted,
            #6a737d
          );

        --fjt-hover:
          var(
            --bgColor-muted,
            rgba(127, 127, 127, .10)
          );

        --fjt-active:
          var(
            --bgColor-accent-muted,
            rgba(9, 105, 218, .16)
          );

        position: fixed;

        inset:
          0
          0
          0
          auto;

        z-index: 1001;

        pointer-events: none;

        color:
          var(--fjt-text);

        font:
          13px/1.35
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      #fjt-sidebar .fjt-panel {
        position: absolute;

        inset:
          0
          0
          0
          auto;

        width:
          var(--fjt-width);

        display: flex;

        flex-direction:
          column;

        background:
          var(--fjt-panel);

        border-left:
          1px solid
          var(--fjt-border);

        box-shadow:
          -2px 0 8px
          rgba(0, 0, 0, .08);

        opacity: 1;

        transform:
          translateX(0);

        transition:
          opacity .16s ease,
          transform .16s ease;

        pointer-events:
          auto;
      }

      #fjt-sidebar.is-collapsed
      .fjt-panel {
        opacity: 0;

        transform:
          translateX(
            var(--fjt-width)
          );

        pointer-events:
          none;
      }

      #fjt-sidebar
      .fjt-collapsed-tab {
        display: flex;

        position: absolute;

        top: 38%;
        right: 0;

        width: 24px;
        height: 72px;

        align-items:
          center;

        justify-content:
          center;

        border:
          1px solid
          var(--fjt-border);

        border-right:
          0;

        border-radius:
          7px 0 0 7px;

        background:
          var(--fjt-panel);

        box-shadow:
          -2px 0 6px
          rgba(0, 0, 0, .08);

        color:
          var(--fjt-muted);

        cursor:
          pointer;

        opacity: 0;

        transform:
          translateX(12px);

        transition:
          opacity .16s ease,
          transform .16s ease,
          visibility 0s linear .16s;

        visibility:
          hidden;

        font-size:
          22px;
      }

      #fjt-sidebar.is-collapsed
      .fjt-collapsed-tab {
        opacity: 1;

        transform:
          translateX(0);

        transition-delay:
          .08s,
          .08s,
          0s;

        visibility:
          visible;

        pointer-events:
          auto;
      }

      @media (prefers-reduced-motion: reduce) {
        #fjt-sidebar .fjt-panel,
        #fjt-sidebar .fjt-collapsed-tab {
          transition: none;
        }
      }

      .fjt-header {
        display: flex;

        align-items:
          center;

        min-height:
          44px;

        padding:
          7px 8px 5px 12px;

        gap:
          8px;

        border-bottom:
          1px solid
          var(--fjt-border);
      }

      .fjt-title-wrap {
        min-width: 0;
        flex: 1;
      }

      .fjt-title {
        font-weight: 650;
        font-size: 14px;
      }

      .fjt-ref {
        overflow: hidden;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;

        color:
          var(--fjt-muted);

        font:
          11px/1.2
          ui-monospace,
          SFMono-Regular,
          Menlo,
          Consolas,
          monospace;
      }

      .fjt-repo {
        padding:
          6px 12px 3px;

        overflow:
          hidden;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;

        color:
          var(--fjt-muted);

        font-size:
          11px;
      }

      .fjt-icon-btn {
        width: 28px;
        height: 28px;

        flex:
          0 0 auto;

        border: 0;

        border-radius:
          5px;

        background:
          transparent;

        color:
          var(--fjt-muted);

        cursor:
          pointer;

        font-size:
          20px;
      }

      .fjt-icon-btn:hover {
        background:
          var(--fjt-hover);

        color:
          var(--fjt-text);
      }

      .fjt-search-wrap {
        padding:
          6px 9px 8px;
      }

      .fjt-search {
        box-sizing:
          border-box;

        width: 100%;
        height: 30px;

        padding:
          4px 8px;

        border:
          1px solid
          var(--fjt-border);

        border-radius:
          6px;

        outline:
          none;

        background:
          var(--fjt-bg);

        color:
          var(--fjt-text);

        font:
          inherit;
      }

      .fjt-search:focus {
        border-color:
          var(
            --borderColor-accent-emphasis,
            #0969da
          );

        box-shadow:
          0 0 0 2px
          var(
            --bgColor-accent-muted,
            rgba(9, 105, 218, .15)
          );
      }

      .fjt-body {
        min-height: 0;

        flex: 1;

        overflow:
          auto;

        padding-bottom:
          12px;

        scrollbar-width:
          thin;
      }

      .fjt-status {
        padding:
          5px 10px 7px;

        color:
          var(--fjt-muted);

        font-size:
          11px;
      }

      .fjt-status.is-error {
        margin: 8px;

        padding: 10px;

        border:
          1px solid
          var(
            --fgColor-danger,
            #cf222e
          );

        border-radius:
          6px;

        color:
          var(--fjt-text);

        line-height:
          1.5;
      }

      .fjt-action-btn {
        margin-top:
          9px;

        padding:
          5px 9px;

        border:
          1px solid
          var(--fjt-border);

        border-radius:
          5px;

        background:
          var(--fjt-bg);

        color:
          var(--fjt-text);

        cursor:
          pointer;
      }

      .fjt-tree {
        padding:
          0 5px 8px;
      }

      .fjt-dir {
        margin: 0;
      }

      .fjt-dir > summary {
        list-style:
          none;
      }

      .fjt-dir >
      summary::-webkit-details-marker {
        display: none;
      }

      .fjt-children {
        padding-left:
          13px;
      }

      .fjt-row {
        box-sizing:
          border-box;

        min-width:
          100%;

        height:
          25px;

        display:
          flex;

        align-items:
          center;

        gap:
          5px;

        padding:
          2px 6px;

        border-radius:
          4px;

        color:
          var(--fjt-text)
          !important;

        text-decoration:
          none
          !important;

        cursor:
          pointer;

        user-select:
          none;
      }

      .fjt-row:hover {
        background:
          var(--fjt-hover);
      }

      .fjt-file-row.is-active {
        background:
          var(--fjt-active);

        font-weight:
          600;
      }

      .fjt-dir.is-active > summary {
        background: var(--fjt-active);
        font-weight: 600;
      }

      .fjt-label {
        min-width: 0;

        overflow:
          hidden;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .fjt-chevron {
        width: 10px;
        height: 16px;

        flex:
          0 0 10px;

        display:
          flex;

        align-items:
          center;

        color:
          var(--fjt-muted);

        transition:
          transform .08s ease;
      }

      .fjt-dir[open] >
      summary
      .fjt-chevron {
        transform:
          rotate(90deg);
      }

      .fjt-folder-icon,
      .fjt-file-icon {
        position:
          relative;

        width: 13px;
        height: 13px;

        flex:
          0 0 13px;
      }

      .fjt-folder-icon.has-material-icon,
      .fjt-file-icon.has-material-icon {
        width: 16px;
        height: 16px;

        flex-basis: 16px;

        background-image:
          var(--fjt-icon-url);

        background-position:
          center;

        background-repeat:
          no-repeat;

        background-size:
          contain;
      }

      .fjt-folder-icon.has-material-icon::before,
      .fjt-folder-icon.has-material-icon::after,
      .fjt-file-icon.has-material-icon::before,
      .fjt-file-icon.has-material-icon::after {
        display: none;
      }

      .fjt-folder-icon::before {
        content: '';

        position:
          absolute;

        left: 1px;
        top: 3px;

        width: 11px;
        height: 8px;

        border:
          1px solid
          currentColor;

        border-radius:
          2px;

        color:
          var(--fjt-muted);
      }

      .fjt-folder-icon::after {
        content: '';

        position:
          absolute;

        left: 2px;
        top: 1px;

        width: 5px;
        height: 3px;

        border:
          1px solid
          currentColor;

        border-bottom:
          0;

        border-radius:
          2px 2px 0 0;

        color:
          var(--fjt-muted);
      }

      .fjt-file-icon::before {
        content: '';

        position:
          absolute;

        left: 2px;
        top: 1px;

        width: 8px;
        height: 11px;

        border:
          1px solid
          currentColor;

        border-radius:
          1px;

        color:
          var(--fjt-muted);
      }

      .fjt-file-icon.is-submodule::after {
        content: '↗';

        position:
          absolute;

        left: 2px;
        top: -3px;

        font-size:
          9px;

        color:
          var(--fjt-muted);
      }

      .fjt-search-results {
        padding:
          0 5px 12px;
      }

      .fjt-search-item {
        display:
          flex;

        align-items:
          center;

        gap:
          7px;

        padding:
          6px 8px;

        border-radius:
          5px;

        color:
          var(--fjt-text)
          !important;

        text-decoration:
          none
          !important;
      }

      .fjt-search-icon {
        flex:
          0 0 13px;
      }

      .fjt-search-info {
        min-width: 0;

        flex: 1;
      }

      .fjt-search-item:hover {
        background:
          var(--fjt-hover);
      }

      .fjt-search-name {
        overflow:
          hidden;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;

        font-weight:
          600;
      }

      .fjt-search-path {
        overflow:
          hidden;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;

        color:
          var(--fjt-muted);

        font-size:
          10px;
      }

      .fjt-resizer {
        position:
          absolute;

        z-index:
          2;

        top: 0;
        left: -3px;
        bottom: 0;

        width: 6px;

        cursor:
          ew-resize;
      }

      body.fjt-resizing,
      body.fjt-resizing * {
        cursor:
          ew-resize
          !important;

        user-select:
          none
          !important;
      }
    `);
  }

  function encodePath(value) {
    return String(value)
      .split('/')
      .map(enc)
      .join('/');
  }

  function enc(value) {
    return encodeURIComponent(
      String(value),
    );
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(
        value,
      );
    } catch (_) {
      return value;
    }
  }

  function cssEscape(value) {
    if (window.CSS?.escape) {
      return CSS.escape(value);
    }

    return String(value)
      .replace(
        /["\\]/g,
        '\\$&',
      );
  }

  function clamp(
    value,
    min,
    max,
  ) {
    return Math.min(
      max,
      Math.max(
        min,
        Number.isFinite(value)
          ? value
          : min,
      ),
    );
  }

  function debounce(
    fn,
    delay,
  ) {
    let timer = 0;

    return (...args) => {
      clearTimeout(timer);

      timer = setTimeout(
        () => fn(...args),
        delay,
      );
    };
  }
})();
