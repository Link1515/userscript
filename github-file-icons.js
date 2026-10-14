// ==UserScript==
// @name         GitHub Material File Icons
// @namespace    GitHub
// @version      0.1.3
// @description  Replace GitHub repository file list icons with VS Code Material Icon Theme icons.
// @match        https://github.com/*/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
// ==/UserScript==

(() => {
  'use strict';

  const MATERIAL_ICON_THEME_VERSION = '5.38.1';
  const MATERIAL_ICON_MANIFEST_URL =
    'https://cdn.jsdelivr.net/npm/' +
    `material-icon-theme@${MATERIAL_ICON_THEME_VERSION}/` +
    'dist/material-icons.json';
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
      if (!records.some((record) =>
        Array.from(record.addedNodes).some(containsFileList)
      )) return;

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
    return node.nodeType === 1 && (
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

    updateCacheStatus();
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

    const keys =
      getCacheKeys();

    for (const key of keys) {
      bytes += byteLength(
        GM_getValue(key, ''),
      );
    }

    return {
      entries: keys.length,
      bytes,
    };
  }

  function byteLength(value) {
    return new TextEncoder()
      .encode(String(value))
      .byteLength;
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
    clearTimeout(cacheStatusTimer);

    cacheStatusTimer = setTimeout(
      updateCacheStatus,
      200,
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
      node.nodeType === 1 && (
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
    const cached =
      readCachedTheme();

    if (cached) {
      return Promise.resolve(cached);
    }

    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: MATERIAL_ICON_MANIFEST_URL,
        responseType: 'json',
        timeout: 8000,
        onload: (response) => {
          if (
            response.status < 200 ||
            response.status >= 300
          ) {
            resolve(null);

            return;
          }

          try {
            const manifest =
              response.response ||
              JSON.parse(response.responseText);

            const theme =
              makeMaterialIconTheme(manifest);

            if (theme) {
              saveValue(
                STORAGE.manifest,
                JSON.stringify(manifest),
              );
            }

            resolve(theme);
          } catch (error) {
            console.warn(
              '[GitHub Material File Icons] 無法解析 Material Icon Theme manifest。',
              error,
            );

            resolve(null);
          }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  function readCachedTheme() {
    const cached =
      String(
        GM_getValue(STORAGE.manifest, '') || '',
      );

    if (!cached) return null;

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
      fileNames: asObject(manifest.fileNames),
      fileExtensions,
      folderNames: asObject(manifest.folderNames),
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

    if (stored) {
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
        GM_xmlhttpRequest({
          method: 'GET',
          url: iconUrl,
          timeout: 8000,
          onload: (response) => {
            if (
              response.status < 200 ||
              response.status >= 300 ||
              !response.responseText
            ) {
              resolve(null);

              return;
            }

            const dataUrl =
              'data:image/svg+xml,' +
              encodeURIComponent(response.responseText);

            theme.iconDataUrls.set(name, dataUrl);
            saveValue(
              iconStorageKey(name),
              dataUrl,
            );
            resolve(dataUrl);
          },
          onerror: () => resolve(null),
          ontimeout: () => resolve(null),
        });
      }).finally(() => {
        theme.iconRequests.delete(name);
      });

    theme.iconRequests.set(name, request);

    return request;
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
})();
