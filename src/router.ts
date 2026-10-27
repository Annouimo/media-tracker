import { createRouter, createWebHistory } from 'vue-router'
import { CATEGORIES, DEFAULT_CATEGORY } from '../shared/categories'
import PublicLayout from './layouts/PublicLayout.vue'
import NotFound from './pages/NotFound.vue'
import PublicHome from './pages/PublicHome.vue'
import PublicWork from './pages/PublicWork.vue'

const AdminLayout = () => import('./layouts/AdminLayout.vue')
const AdminDashboard = () => import('./pages/admin/AdminDashboard.vue')
const AdminLibrary = () => import('./pages/admin/AdminLibrary.vue')
const AdminWorkNew = () => import('./pages/admin/AdminWorkNew.vue')
const AdminWorkPage = () => import('./pages/admin/AdminWorkPage.vue')
const AdminNotFound = () => import('./pages/admin/AdminNotFound.vue')

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: PublicLayout,
      children: [
        {
          path: '',
          redirect: DEFAULT_CATEGORY.path,
        },
        ...CATEGORIES.map((category) => ({
          path: category.path.slice(1),
          name: `category-${category.slug}`,
          component: PublicHome,
          props: { category: category.slug },
        })),
        {
          path: 'works/:id',
          name: 'work',
          component: PublicWork,
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: NotFound,
        },
      ],
    },
    {
      path: '/admin',
      component: AdminLayout,
      children: [
        {
          path: '',
          name: 'admin-home',
          component: AdminDashboard,
        },
        {
          path: 'library',
          name: 'admin-library',
          component: AdminLibrary,
        },
        {
          path: 'works/new',
          name: 'admin-work-new',
          component: AdminWorkNew,
        },
        {
          path: 'works/:id/progress',
          redirect: (to) => `/admin/works/${String(to.params.id)}`,
        },
        {
          path: 'works/:id/edit',
          redirect: (to) => ({
            path: `/admin/works/${String(to.params.id)}`,
            query: { tab: 'metadata' },
          }),
        },
        {
          path: 'works/:id',
          name: 'admin-work',
          component: AdminWorkPage,
        },
        {
          path: ':pathMatch(.*)*',
          name: 'admin-not-found',
          component: AdminNotFound,
        },
      ],
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})
