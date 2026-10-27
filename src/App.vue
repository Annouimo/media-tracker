<script setup lang="ts">
import { ref } from 'vue'
import { toggleTheme, type Theme } from './theme'

const theme = ref<Theme>(
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
)
const year = new Date().getFullYear()

function onToggle(): void {
  theme.value = toggleTheme()
}
</script>

<template>
  <header class="header">
    <nav class="header-nav">
      <div class="logo">
        <a class="logo-link" href="/">我的阅藏</a>
        <button
          class="theme-toggle"
          type="button"
          :aria-label="theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          title="切换主题"
          @click="onToggle"
        >
          <svg
            v-if="theme === 'dark'"
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>

      <ul class="menu">
        <li><a class="active" href="/">首页</a></li>
        <li><a href="/admin">管理</a></li>
      </ul>
    </nav>
  </header>

  <main class="main">
    <h1 class="page-title">我的阅藏</h1>
    <p class="lede">项目骨架已初始化。</p>
    <p class="muted">
      设计稿见 <code>README.md</code>。下一步：数据迁移、公开首页、Access 后台。
    </p>
  </main>

  <footer class="footer">
    <span>© {{ year }} 我的阅藏</span>
  </footer>
</template>
